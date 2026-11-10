import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CAMPAIGN_TURNS, type ActionKind, type Offer, type StationState } from '@derelict/game-model'
import { loadNearRuntime, type NearRuntime } from './lib/near'
import {
  extractContractError,
  getStationContract,
  toContractAction,
  CREDIT as CREDIT_UNIT,
  type ChainState,
  type StationContractClient,
} from './lib/contract'
import {
  ledgerRowsFromChain,
  chainOfferToModel,
  previewStateFromChain,
  snapshotFromChain,
  type GameSnapshot,
  type LedgerRow,
} from './lib/state'
import {
  TRAFFIC_KINDS,
  createStation,
  stationAccountFor,
  stationsLaunchedBy,
  suggestStationName,
  type StationInfo,
} from './lib/factory'
import { STATION_ACCOUNT } from './config'
import { Header } from './components/Header'
import { StatusRail } from './components/StatusRail'
import { StationCanvas } from './components/StationCanvas'
import { DecisionRail } from './components/DecisionRail'
import { BottomActivity } from './components/BottomActivity'
import { LedgerDrawer } from './components/LedgerDrawer'
import { InspectBuy } from './components/InspectBuy'
import { MissionResult } from './components/MissionResult'
import { LaunchStation, type LaunchStep } from './components/LaunchStation'
import { Banner } from './components/primitives'
import { IconClose } from './components/icons'

type TxKind = 'act' | 'list' | 'unlist' | 'purchase' | 'claimRepair' | 'seed'

interface BannerState {
  tone: 'error' | 'info' | 'ok' | 'neutral'
  text: string
  detail?: string
}

interface ChainView {
  snapshot: GameSnapshot
  offers: Offer[]
  rows: LedgerRow[]
  blockHeight: number
}

interface TxContext {
  contract: StationContractClient
  /** Station state read immediately before signing. */
  state: ChainState
  accountId: string
}

interface TxSpec {
  kind: TxKind
  /** Shown when there is no wallet session. */
  connectPrompt: string
  /** Refuse to sign when the station moved past the revision on screen. */
  bindsRevision: boolean
  submit: (ctx: TxContext) => Promise<unknown>
  settledBanner?: (ctx: TxContext) => BannerState
}

/** Read everything the bridge shows for one station (contract views only). */
async function loadView(runtime: NearRuntime, account: string): Promise<ChainView> {
  const contract = await getStationContract(account, runtime)
  const [state, offers, ledger, buckets] = await Promise.all([
    contract.viewState(),
    contract.viewOffers(),
    contract.viewLedger(0, 700),
    contract.viewBuckets(),
  ])
  return {
    snapshot: snapshotFromChain(state, buckets),
    offers: offers.map(chainOfferToModel),
    rows: ledgerRowsFromChain(ledger),
    blockHeight: state.block_height,
  }
}

function assertCaptain(state: ChainState, accountId: string): void {
  if (state.owner !== accountId) {
    throw new Error(
      `Only the station captain (${state.owner}) may command this station. You are connected as ${accountId}.`,
    )
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function creditsToYocto(credits: number): bigint {
  return BigInt(Math.round(credits)) * CREDIT_UNIT
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function App(): JSX.Element {
  // Station on screen: ?station=<account> (defaults to config.json). The ref
  // lets async reads drop results for a station that is no longer shown.
  const [stationAccount, setStationAccount] = useState(
    () =>
      new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('station') ||
      STATION_ACCOUNT,
  )
  const stationRef = useRef(stationAccount)

  // NEAR runtime: isolated wallet/RPC library state.
  const runtimeRef = useRef<NearRuntime | null>(null)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [nearMissing, setNearMissing] = useState(false)
  const [walletAccount, setWalletAccount] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Chain data (never optimistic).
  const [chainState, setChainState] = useState<ChainView | null>(null)
  const chainRef = useRef<ChainView | null>(null)
  const [chainError, setChainError] = useState<string | null>(null)
  const [txPending, setTxPending] = useState<TxKind | null>(null)
  const pollingRef = useRef(false)

  // UI state.
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'info' } | null>(null)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [inspectOpen, setInspectOpen] = useState(false)
  const [resultDismissed, setResultDismissed] = useState(false)

  // Launch-your-own-station dialog.
  const [launchOpen, setLaunchOpen] = useState(false)
  const [launchStep, setLaunchStep] = useState<LaunchStep | null>(null)
  const [myStations, setMyStations] = useState<StationInfo[] | undefined>(undefined)
  const [walletBalance, setWalletBalance] = useState<bigint | null | undefined>(undefined)

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false
    void loadNearRuntime().then((runtime) => {
      if (cancelled) return
      if (!runtime) {
        setNearMissing(true)
        setChainError('NEAR runtime failed to load')
        return
      }
      runtimeRef.current = runtime
      setRuntimeReady(true)
      if (!runtime.walletLibraryAvailable) {
        setNearMissing(true)
        return
      }
      runtime
        .getWallet()
        .then((wallet) => {
          if (!cancelled && wallet) setWalletAccount(wallet.accountId)
        })
        .catch(() => undefined)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /* ------------------------------------------------------------------ */
  /* Chain refresh (read-only)                                           */
  /* ------------------------------------------------------------------ */

  const applyView = useCallback((view: ChainView) => {
    chainRef.current = view
    setChainState(view)
    setChainError(null)
  }, [])

  const refreshChain = useCallback(
    async (announce: boolean): Promise<ChainView | null> => {
      const runtime = runtimeRef.current
      if (!runtime) return null
      const account = stationRef.current
      try {
        const view = await loadView(runtime, account)
        if (stationRef.current !== account) return null
        applyView(view)
        if (announce) {
          setBanner({
            tone: 'ok',
            text: 'Read back from chain.',
            detail: `revision ${view.snapshot.revision} at block ${view.blockHeight}`,
          })
        }
        return view
      } catch (error) {
        if (stationRef.current === account) setChainError(errorText(error))
        return null
      }
    },
    [applyView],
  )

  /**
   * Switch the screen to another station once its first read succeeds, so
   * the bridge never shows one station's numbers under another's name.
   * `waitMs` keeps retrying while a just-created station comes online.
   */
  const openStation = useCallback(
    async (account: string, waitMs = 0): Promise<boolean> => {
      const runtime = runtimeRef.current
      if (!runtime) return false
      const deadline = Date.now() + waitMs
      for (;;) {
        try {
          const view = await loadView(runtime, account)
          stationRef.current = account
          setStationAccount(account)
          applyView(view)
          setResultDismissed(false)
          setInspectOpen(false)
          const url = new URL(window.location.href)
          url.searchParams.set('station', account)
          window.history.replaceState(null, '', url)
          return true
        } catch (error) {
          if (Date.now() >= deadline) {
            setMessage({ text: `Could not open ${account}: ${errorText(error)}`, tone: 'error' })
            return false
          }
          await sleep(2500)
        }
      }
    },
    [applyView],
  )

  useEffect(() => {
    if (!runtimeReady) return
    void refreshChain(false)
    const timer = window.setInterval(() => {
      if (!pollingRef.current && document.visibilityState !== 'hidden') void refreshChain(false)
    }, 3500)
    return () => {
      window.clearInterval(timer)
    }
  }, [refreshChain, runtimeReady])

  /**
   * Poll until the read-back shows a new revision (never optimistic).
   * Resolves null when the revision has not moved before the deadline.
   */
  const confirmSettled = useCallback(
    async (previousRevision: number): Promise<ChainView | null> => {
      const deadline = Date.now() + 90_000
      while (Date.now() < deadline) {
        await sleep(2400)
        const runtime = runtimeRef.current
        if (!runtime) break
        try {
          const contract = await getStationContract(stationRef.current, runtime)
          const state = await contract.viewState()
          if (state.revision !== previousRevision) {
            return refreshChain(true)
          }
        } catch {
          // RPC hiccup during settlement — keep waiting within the deadline.
        }
      }
      void refreshChain(false)
      return null
    },
    [refreshChain],
  )

  /* ------------------------------------------------------------------ */
  /* Signed transactions                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Shared signing flow: re-read the station, validate against that fresh
   * state, sign with the connected wallet, then wait for the read-back.
   * Resolves true only once the chain shows the new revision.
   */
  const runTx = useCallback(
    async (spec: TxSpec): Promise<boolean> => {
      const runtime = runtimeRef.current
      if (!runtime) return false
      const wallet = await runtime.getWallet()
      if (!wallet) {
        setMessage({ text: spec.connectPrompt, tone: 'info' })
        return false
      }
      const seenRevision = chainRef.current?.snapshot.revision ?? null
      setTxPending(spec.kind)
      setMessage(null)
      pollingRef.current = true
      try {
        const contract = await getStationContract(stationRef.current, runtime)
        const state = await contract.viewState()
        if (spec.bindsRevision && seenRevision !== null && state.revision !== seenRevision) {
          await refreshChain(false)
          throw new Error(
            'The station changed since this screen was read — review the refreshed numbers and confirm again',
          )
        }
        const ctx: TxContext = { contract, state, accountId: wallet.accountId }
        await spec.submit(ctx)
        const settled = await confirmSettled(state.revision)
        if (!settled) {
          setBanner({
            tone: 'info',
            text: 'Submitted — no read-back yet.',
            detail: 'The revision has not moved; check the transaction in your wallet.',
          })
          return false
        }
        if (spec.settledBanner) setBanner(spec.settledBanner(ctx))
        return true
      } catch (error) {
        setMessage({ text: extractContractError(error), tone: 'error' })
        return false
      } finally {
        pollingRef.current = false
        setTxPending(null)
      }
    },
    [confirmSettled, refreshChain],
  )

  const confirmAction = useCallback(
    (action: ActionKind) => {
      void runTx({
        kind: 'act',
        connectPrompt: 'Connect a wallet to command this station',
        bindsRevision: true,
        submit: ({ contract, state, accountId }) => {
          assertCaptain(state, accountId)
          if (state.complete) throw new Error('Campaign is complete')
          return contract.act(toContractAction(action), state.revision)
        },
      })
    },
    [runTx],
  )

  const listForSale = useCallback(
    (priceCredits: number) => {
      if (!(priceCredits > 0)) {
        setMessage({ text: 'Enter a positive whole number of credits', tone: 'error' })
        return
      }
      void runTx({
        kind: 'list',
        connectPrompt: 'Connect a wallet to list this station',
        bindsRevision: false,
        submit: ({ contract, state, accountId }) => {
          assertCaptain(state, accountId)
          return contract.listForSale(creditsToYocto(priceCredits))
        },
        settledBanner: () => ({ tone: 'ok', text: `Listing confirmed at ${priceCredits} Cr.` }),
      })
    },
    [runTx],
  )

  const unlist = useCallback(() => {
    void runTx({
      kind: 'unlist',
      connectPrompt: 'Connect a wallet to change this listing',
      bindsRevision: false,
      submit: ({ contract, state, accountId }) => {
        assertCaptain(state, accountId)
        return contract.unlist()
      },
      settledBanner: () => ({ tone: 'ok', text: 'Listing removed on chain.' }),
    })
  }, [runTx])

  const buy = useCallback(() => {
    void runTx({
      kind: 'purchase',
      connectPrompt: 'Connect a wallet to buy this station',
      // The buyer pays the price they were shown: a moved revision means a stale quote.
      bindsRevision: true,
      submit: ({ contract, state, accountId }) => {
        if (state.listing === null) throw new Error('No active listing')
        if (state.owner === accountId) throw new Error('You already command this station')
        return contract.purchase(state.revision, BigInt(state.listing))
      },
      settledBanner: ({ contract, accountId }) => ({
        tone: 'ok',
        text: 'Station purchased. You are the captain.',
        detail: `${accountId} now commands ${contract.stationAccount}.`,
      }),
    }).then((settled) => {
      if (settled) setInspectOpen(false)
    })
  }, [runTx])

  const claimRepair = useCallback(() => {
    void runTx({
      kind: 'claimRepair',
      connectPrompt: 'Connect the supplier wallet to claim the repair fee',
      bindsRevision: false,
      submit: ({ contract, state, accountId }) => {
        if (state.repair?.supplier !== accountId) throw new Error('Only the recorded supplier may claim')
        return contract.claimRepair()
      },
      settledBanner: () => ({
        tone: 'ok',
        text: 'Repair fee claimed.',
        detail: 'The protected reserve is paid out to the supplier; the ledger records the payout.',
      }),
    })
  }, [runTx])

  /** Captain prepays the scenario's 12 visiting ships in one transaction. */
  const seedTraffic = useCallback(
    () =>
      runTx({
        kind: 'seed',
        connectPrompt: 'Connect the captain wallet to fund visitor traffic',
        bindsRevision: false,
        submit: async ({ contract, state, accountId }) => {
          assertCaptain(state, accountId)
          const funded = (await contract.viewOffers()).filter((o) => o.campaign_id === state.campaign_id)
          if (funded.length > 0) throw new Error('Visitor traffic is already funded for this campaign')
          return contract.fundOffers(TRAFFIC_KINDS)
        },
        settledBanner: () => ({
          tone: 'ok',
          text: 'Station ready — 12 visiting ships are queued.',
          detail: 'Play turn 1 from the decision rail.',
        }),
      }),
    [runTx],
  )

  /* Launch ------------------------------------------------------------- */

  const launchStation = useCallback(
    async (name: string) => {
      const runtime = runtimeRef.current
      if (!runtime) return
      const wallet = await runtime.getWallet()
      if (!wallet) {
        setMessage({ text: 'Connect a wallet to launch a station', tone: 'info' })
        return
      }
      const account = stationAccountFor(name)
      setMessage(null)
      setLaunchStep('creating')
      try {
        if ((await runtime.accountBalance(account)) !== null) {
          throw new Error(`${account} already exists — choose another name`)
        }
        await createStation(wallet, name)
        setLaunchStep('waiting')
        if (!(await openStation(account, 60_000))) return
        setLaunchOpen(false)
        setBanner({
          tone: 'info',
          text: `${account} is online — you are its captain.`,
          detail: 'Approve the second transaction to fund the 12 visiting ships.',
        })
      } catch (error) {
        setMessage({ text: extractContractError(error), tone: 'error' })
        return
      } finally {
        setLaunchStep(null)
      }
      await seedTraffic()
    },
    [openStation, seedTraffic],
  )

  const openLaunch = useCallback(() => {
    setMessage(null)
    setLaunchOpen(true)
  }, [])

  const openOwnStation = useCallback(
    (account: string) => {
      void openStation(account).then((opened) => {
        if (opened) setLaunchOpen(false)
      })
    },
    [openStation],
  )

  useEffect(() => {
    if (!launchOpen || !walletAccount) return
    const runtime = runtimeRef.current
    if (!runtime) return
    let cancelled = false
    setMyStations(undefined)
    setWalletBalance(undefined)
    stationsLaunchedBy(runtime, walletAccount)
      .then((list) => !cancelled && setMyStations(list))
      .catch(() => !cancelled && setMyStations([]))
    runtime
      .accountBalance(walletAccount)
      .then((balance) => !cancelled && setWalletBalance(balance))
      .catch(() => !cancelled && setWalletBalance(null))
    return () => {
      cancelled = true
    }
  }, [launchOpen, walletAccount])

  /* Wallet ------------------------------------------------------------- */

  const connectWallet = useCallback(async () => {
    if (connecting) return
    const runtime = runtimeRef.current
    if (!runtime || !runtime.walletLibraryAvailable) {
      setNearMissing(true)
      setBanner({
        tone: 'error',
        text: 'Wallet library unavailable in this build.',
        detail: 'The NEAR connector failed to load. Reload the page or check the network.',
      })
      return
    }
    setConnecting(true)
    setMessage(null)
    try {
      const wallet = await runtime.connectWallet()
      if (!wallet) {
        setMessage({ text: 'No wallet account was returned. Please try again.', tone: 'info' })
        return
      }
      setWalletAccount(wallet.accountId)
      setBanner({
        tone: 'ok',
        text: `Wallet connected: ${wallet.accountId}`,
        detail: 'NEAR testnet — every action is signed by your wallet.',
      })
      const view = await refreshChain(false)
      if (view && view.snapshot.owner !== wallet.accountId) {
        if (view.snapshot.listingYocto !== null) {
          setInspectOpen(true)
          setBanner({
            tone: 'info',
            text: `Connected as ${wallet.accountId}`,
            detail: `This station is commanded by ${view.snapshot.owner}. It is listed — buy it to take command.`,
          })
        } else {
          setLaunchOpen(true)
          setBanner({
            tone: 'info',
            text: `Connected as ${wallet.accountId}`,
            detail: `This station is commanded by ${view.snapshot.owner}. Launch your own station to play.`,
          })
        }
      }
    } catch (error) {
      const raw = errorText(error)
      setMessage({
        text: /reject|cancel|closed|denied/i.test(raw)
          ? 'Wallet sign-in cancelled.'
          : `Wallet sign-in failed: ${raw}`,
        tone: 'info',
      })
    } finally {
      setConnecting(false)
    }
  }, [connecting, refreshChain])

  const disconnectWallet = useCallback(async () => {
    const runtime = runtimeRef.current
    if (!runtime) return
    try {
      await runtime.disconnectWallet()
    } catch {
      // The local session is cleared even if the wallet rejects sign-out.
    }
    setWalletAccount(null)
    setBanner({ tone: 'neutral', text: 'Wallet disconnected.', detail: 'The station is read-only until you reconnect.' })
    void refreshChain(false)
  }, [refreshChain])

  /* ------------------------------------------------------------------ */
  /* Derived view                                                        */
  /* ------------------------------------------------------------------ */

  const snapshot = chainState?.snapshot ?? null
  const rows = chainState?.rows ?? []
  const offers = chainState?.offers ?? []

  const previewState = useMemo<StationState | null>(() => {
    if (!snapshot) return null
    return previewStateFromChain(snapshot, offers)
  }, [snapshot, offers])

  const dockedShip = useMemo(() => {
    if (!snapshot || snapshot.complete) return false
    return rows.slice(-3).some((row) => row.kind === 'standardDocking' || row.kind === 'heavyDocking')
  }, [snapshot, rows])

  const offerCounts = useMemo(() => {
    const counts = { standard: 0, heavy: 0 }
    if (!snapshot) return counts
    for (const offer of offers) {
      if (offer.used || offer.refunded || offer.campaignId !== snapshot.campaignId) continue
      counts[offer.kind] += 1
    }
    return counts
  }, [snapshot, offers])

  const isCaptain = snapshot !== null && walletAccount !== null && snapshot.owner === walletAccount

  const connectionChip = useMemo(() => {
    if (connecting) {
      return {
        variant: 'pending' as const,
        label: 'CONNECTING',
        detail: 'waiting for wallet sign-in',
      }
    }
    if (txPending !== null) {
      return {
        variant: 'pending' as const,
        label: 'PENDING',
        detail: 'submitted — updating only after the chain read-back',
      }
    }
    if (chainError) {
      return { variant: 'disconnected' as const, label: 'DISCONNECTED', detail: chainError }
    }
    if (nearMissing) {
      return { variant: 'disconnected' as const, label: 'DISCONNECTED', detail: 'wallet library missing' }
    }
    if (walletAccount === null) {
      return {
        variant: 'disconnected' as const,
        label: 'DISCONNECTED',
        detail: 'no wallet session — read-only',
      }
    }
    return { variant: 'testnet' as const, label: 'TESTNET', detail: walletAccount }
  }, [connecting, txPending, chainError, nearMissing, walletAccount])

  const showResult = snapshot?.outcome.complete === true && !resultDismissed

  const needsTraffic =
    snapshot !== null &&
    isCaptain &&
    !snapshot.complete &&
    !offers.some((offer) => offer.campaignId === snapshot.campaignId)

  const suggestedName = useMemo(
    () => suggestStationName(walletAccount ?? ''),
    // launchOpen: a fresh suggestion each time the dialog opens.
    [walletAccount, launchOpen],
  )

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  if (!snapshot || !previewState) {
    return (
      <div className="boot">
        <div className="boot__panel">
          <div className="boot__wordmark">DERELICT</div>
          <div className="boot__status">
            {chainError ? 'STATION READ FAILED' : 'READING STATION FROM TESTNET…'}
          </div>
          <div className="boot__station">{stationAccount}</div>
          {chainError ? <div className="boot__error">{chainError}</div> : null}
          {nearMissing ? (
            <div className="boot__error">Wallet library unavailable. Reload the page or check your connection.</div>
          ) : null}
          <div className="boot__actions">
            {walletAccount ? (
              <span className="boot__account">WALLET {walletAccount}</span>
            ) : (
              <button className="btn btn--primary" onClick={() => void connectWallet()} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect wallet'}
              </button>
            )}
            <button className="btn btn--quiet" onClick={() => void refreshChain(false)}>
              Retry read
            </button>
            {chainError && stationAccount !== STATION_ACCOUNT ? (
              <button className="btn btn--quiet" onClick={() => void openStation(STATION_ACCOUNT)}>
                Open {STATION_ACCOUNT}
              </button>
            ) : null}
          </div>
          <div className="boot__note">NEAR testnet · no simulation · every action is signed</div>
        </div>
      </div>
    )
  }

  const stationName = snapshot.stationAccount.split('.')[0]?.toUpperCase() ?? 'STATION'

  return (
    <div className="app">
      <Header
        stationAccount={snapshot.stationAccount}
        stationName={stationName}
        playedTurns={Math.min(Math.max(snapshot.turn - 1, 0), CAMPAIGN_TURNS)}
        connectionChip={connectionChip}
        walletAccount={walletAccount}
        connecting={connecting}
        onConnectWallet={() => void connectWallet()}
        onDisconnectWallet={() => void disconnectWallet()}
        onOpenInspect={() => setInspectOpen(true)}
        onOpenLaunch={openLaunch}
      />

      <div className="shell">
        <StatusRail snapshot={snapshot} />

        <StationCanvas
          snapshot={snapshot}
          dockedShip={dockedShip}
          spots={offerCounts}
          banner={
            banner ? (
              <Banner
                tone={banner.tone}
                text={banner.text}
                detail={banner.detail}
                onClose={() => setBanner(null)}
              />
            ) : null
          }
        />

        <DecisionRail
          snapshot={snapshot}
          previewState={previewState}
          currentBlock={BigInt(chainState?.blockHeight ?? 0)}
          walletAccount={walletAccount}
          isCaptain={isCaptain}
          needsTraffic={needsTraffic}
          confirmBusy={txPending !== null}
          onConfirm={confirmAction}
          onClaimRepair={claimRepair}
          onSeedTraffic={() => void seedTraffic()}
          onConnectWallet={() => void connectWallet()}
          onOpenInspect={() => setInspectOpen(true)}
          onOpenLaunch={openLaunch}
        />
      </div>

      {message ? (
        <div style={{ padding: '10px 16px 0', background: 'var(--bg)' }}>
          <div className={`alert${message.tone === 'error' ? ' alert--error' : ' alert--info'}`} role="alert">
            <span>{message.text}</span>
            <button className="iconbtn alert__close" onClick={() => setMessage(null)} aria-label="Dismiss message">
              <IconClose size={13} />
            </button>
          </div>
        </div>
      ) : null}

      <BottomActivity
        events={rows}
        currentTurn={snapshot.turn}
        onOpenLedger={() => setLedgerOpen(true)}
      />

      <LedgerDrawer
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        rows={rows}
        stationAccount={snapshot.stationAccount}
      />

      <InspectBuy
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        snapshot={snapshot}
        walletAccount={walletAccount}
        confirmBusy={txPending !== null}
        alert={message}
        onDismissAlert={() => setMessage(null)}
        onConnectWallet={() => void connectWallet()}
        onListForSale={listForSale}
        onUnlist={unlist}
        onBuy={buy}
      />

      <LaunchStation
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        walletAccount={walletAccount}
        balanceYocto={walletBalance}
        myStations={myStations}
        currentStation={stationAccount}
        suggestedName={suggestedName}
        step={launchStep}
        busy={txPending !== null}
        alert={message}
        onDismissAlert={() => setMessage(null)}
        onConnectWallet={() => void connectWallet()}
        onLaunch={(name) => void launchStation(name)}
        onOpenStation={openOwnStation}
      />

      {showResult ? (
        <MissionResult
          snapshot={snapshot}
          events={rows}
          walletAccount={walletAccount}
          onClose={() => setResultDismissed(true)}
        />
      ) : null}
    </div>
  )
}

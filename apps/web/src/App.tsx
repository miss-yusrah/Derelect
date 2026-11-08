import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createStation,
  STANDARD_SALVAGE,
  CAMPAIGN_TURNS,
  type ActionKind,
  type Offer,
  type StationState,
} from '@derelict/game-model'
import { loadNearRuntime, type NearRuntime } from './lib/near'
import {
  extractContractError,
  getStationContract,
  toContractAction,
  CREDIT as CREDIT_UNIT,
} from './lib/contract'
import {
  ledgerRowsFromChain,
  chainOfferToModel,
  previewStateFromChain,
  snapshotFromChain,
  snapshotFromState,
  type GameSnapshot,
  type LedgerRow,
} from './lib/state'
import {
  clearPractice,
  loadPractice,
  practiceAct,
  practiceList,
  practicePurchase,
  practiceUnlist,
  savePractice,
  practiceBlockHeight,
} from './lib/practice'
import { PRACTICE_OWNER, STATION_ACCOUNT } from './config'
import { Header } from './components/Header'
import { StatusRail } from './components/StatusRail'
import { StationCanvas } from './components/StationCanvas'
import { DecisionRail } from './components/DecisionRail'
import { BottomActivity } from './components/BottomActivity'
import { LedgerDrawer } from './components/LedgerDrawer'
import { InspectBuy } from './components/InspectBuy'
import { MissionResult } from './components/MissionResult'
import { Banner } from './components/primitives'

type Mode = 'practice' | 'testnet'
type TxKind = 'act' | 'list' | 'unlist' | 'purchase'

interface BannerState {
  tone: 'error' | 'info' | 'ok' | 'neutral'
  text: string
  detail?: string
}

const PRACTICE_STATION_ACCOUNT = 'station.practice.derelict'
const PRACTICE_NAME_TAG = 'RELAY-07 · PRACTICE STATION'

function freshPractice(): StationState {
  return createStation(PRACTICE_STATION_ACCOUNT, PRACTICE_OWNER, STANDARD_SALVAGE, 1_000_000n)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function creditsToYocto(credits: number): bigint {
  return BigInt(Math.round(credits)) * CREDIT_UNIT
}

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('practice')

  // Practice run: created synchronously, so a judge is playing immediately.
  const [practice, setPractice] = useState<StationState>(() => loadPractice() ?? freshPractice())

  // NEAR runtime: isolated wallet/RPC library state.
  const runtimeRef = useRef<NearRuntime | null>(null)
  const [nearMissing, setNearMissing] = useState(false)
  const [walletAccount, setWalletAccount] = useState<string | null>(null)

  // Chain data (testnet only, never optimistic).
  const [chainState, setChainState] = useState<ChainView | null>(null)
  const [chainError, setChainError] = useState<string | null>(null)
  const [txPending, setTxPending] = useState<TxKind | null>(null)
  const pollingRef = useRef(false)

  // UI state.
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'info' } | null>(null)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [inspectOpen, setInspectOpen] = useState(false)
  const [resultDismissed, setResultDismissed] = useState(false)
  const [fuelFlashCell, setFuelFlashCell] = useState<number | null>(null)

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false
    loadNearRuntime()
      .then((runtime) => {
        if (cancelled) return
        runtimeRef.current = runtime
        if (!runtime || !runtime.walletLibraryAvailable) {
          setNearMissing(true)
          return null
        }
        setNearMissing(false)
        return runtime
          .getWallet()
          .then((wallet) => {
            if (cancelled) return
            if (wallet) setWalletAccount(wallet.accountId)
          })
          .catch(() => undefined)
      })
      .catch(() => {
        if (!cancelled) setNearMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    savePractice(practice)
  }, [practice])

  /* ------------------------------------------------------------------ */
  /* Chain refresh (read-only; runs while testnet)                       */
  /* ------------------------------------------------------------------ */

  const refreshChain = useCallback(
    async (announce: boolean): Promise<boolean> => {
      const runtime = runtimeRef.current
      if (!runtime) return false
      try {
        const contract = await getStationContract(STATION_ACCOUNT, runtime)
        const [state, offers, ledger, buckets] = await Promise.all([
          contract.viewState(),
          contract.viewOffers(),
          contract.viewLedger(undefined, 400),
          contract.viewBuckets(),
        ])
        setChainState({
          snapshot: snapshotFromChain(state, buckets),
          offers: offers.map(chainOfferToModel),
          rows: ledgerRowsFromChain(ledger),
          blockHeight: state.block_height,
        })
        setChainError(null)
        if (announce) {
          setBanner({
            tone: 'ok',
            text: 'Read back from chain.',
            detail: `revision ${state.revision} at block ${state.block_height}`,
          })
        }
        return true
      } catch (error) {
        setChainError(error instanceof Error ? error.message : String(error))
        return false
      }
    },
    [],
  )

  useEffect(() => {
    if (mode !== 'testnet') return
    let timer = 0
    void refreshChain(false).then((loaded) => {
      if (loaded && chainState === null) {
        // Auto-dismiss the first successful connected banner for quiet judge UX.
      }
    })
    timer = window.setInterval(() => {
      if (!pollingRef.current) void refreshChain(false)
    }, 3500)
    return () => {
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, refreshChain])

  /** Poll until the read-back confirms a change (never optimistic). */
  const confirmSettled = useCallback(
    async (previousRevision: number): Promise<boolean> => {
      const deadline = Date.now() + 90_000
      while (Date.now() < deadline) {
        await sleep(2400)
        const runtime = runtimeRef.current
        if (!runtime) break
        try {
          const contract = await getStationContract(STATION_ACCOUNT, runtime)
          const state = await contract.viewState()
          if (state.revision !== previousRevision) {
            await refreshChain(true)
            return true
          }
        } catch {
          // RPC hiccup during settlement — keep waiting within the deadline.
        }
      }
      await refreshChain(false)
      return false
    },
    [refreshChain],
  )

  /* ------------------------------------------------------------------ */
  /* Practice transitions                                                */
  /* ------------------------------------------------------------------ */

  const applyAndFlash = useCallback((next: StationState, previousFuel: number) => {
    setPractice(next)
    if (next.fuel > previousFuel) {
      setFuelFlashCell(next.fuel - previousFuel)
      window.setTimeout(() => setFuelFlashCell(null), 750)
    }
  }, [])

  const confirmPractice = useCallback(
    (action: ActionKind) => {
      const beforeFuel = practice.fuel
      try {
        const next = practiceAct(practice, action)
        applyAndFlash(next, beforeFuel)
        setMessage(null)
        setInspectOpen(false)
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : String(error), tone: 'error' })
      }
    },
    [practice, applyAndFlash],
  )

  /* ------------------------------------------------------------------ */
  /* Testnet transitions                                                 */
  /* ------------------------------------------------------------------ */

  const confirmTestnetAction = useCallback(
    async (action: ActionKind) => {
      const runtime = runtimeRef.current
      if (!runtime) return
      const wallet = await runtime.getWallet()
      if (!wallet) {
        setMessage({ text: 'Connect a wallet to command this station', tone: 'info' })
        return
      }
      setTxPending('act')
      setMessage(null)
      let previousRevision = 0
      try {
        const contract = await getStationContract(STATION_ACCOUNT, runtime)
        const state = await contract.viewState()
        previousRevision = state.revision
        if (state.complete) throw new Error('Campaign is complete')
        pollingRef.current = true
        await contract.act(toContractAction(action), state.revision)
        const settled = await confirmSettled(previousRevision)
        if (!settled) {
          setBanner({
            tone: 'info',
            text: 'Submitted — no read-back yet.',
            detail: 'The revision has not moved; check the transaction in your wallet.',
          })
        }
      } catch (error) {
        setMessage({ text: extractContractError(error), tone: 'error' })
      } finally {
        pollingRef.current = false
        setTxPending(null)
      }
    },
    [confirmSettled],
  )

  const confirm = useCallback(
    (action: ActionKind) => {
      if (mode === 'practice') confirmPractice(action)
      else void confirmTestnetAction(action)
    },
    [mode, confirmPractice, confirmTestnetAction],
  )

  /* Listing ------------------------------------------------------------ */

  const listForSale = useCallback(
    (priceCredits: number) => {
      if (!(priceCredits > 0)) {
        setMessage({ text: 'Enter a positive whole number of credits', tone: 'error' })
        return
      }
      const priceYocto = creditsToYocto(priceCredits)
      if (mode === 'practice') {
        setPractice((state) => practiceList(state, priceYocto))
        setBanner({ tone: 'ok', text: 'Practice listing active.', detail: `${priceCredits} Cr, buyer pays you, operations untouched` })
        return
      }
      void (async () => {
        const runtime = runtimeRef.current
        if (!runtime) return
        const wallet = await runtime.getWallet()
        if (!wallet) {
          setMessage({ text: 'Connect a wallet to list this station', tone: 'info' })
          return
        }
        setTxPending('list')
        try {
          const contract = await getStationContract(STATION_ACCOUNT, runtime)
          await contract.listForSale(priceYocto)
          const settled = await confirmSettled(Infinity) // listing bumps revision
          if (settled) setBanner({ tone: 'ok', text: 'Listing confirmed on chain.' })
        } catch (error) {
          setMessage({ text: extractContractError(error), tone: 'error' })
        } finally {
          setTxPending(null)
        }
      })()
    },
    [mode, confirmSettled],
  )

  const unlist = useCallback(() => {
    if (mode === 'practice') {
      setPractice((state) => practiceUnlist(state))
      setBanner({ tone: 'neutral', text: 'Listing removed (practice).' })
      return
    }
    void (async () => {
      const runtime = runtimeRef.current
      if (!runtime) return
      const wallet = await runtime.getWallet()
      if (!wallet) {
        setMessage({ text: 'Connect a wallet to change this listing', tone: 'info' })
        return
      }
      setTxPending('unlist')
      try {
        const contract = await getStationContract(STATION_ACCOUNT, runtime)
        await contract.unlist()
        await confirmSettled(Infinity)
        setBanner({ tone: 'ok', text: 'Listing removed on chain.' })
      } catch (error) {
        setMessage({ text: extractContractError(error), tone: 'error' })
      } finally {
        setTxPending(null)
      }
    })()
  }, [mode, confirmSettled])

  /* Purchase (testnet reads a fresh revision; practice pays as demo buyer) */

  const buy = useCallback(() => {
    if (mode === 'practice') {
      try {
        setPractice((state) => practicePurchase(state))
        setBanner({
          tone: 'ok',
          text: 'Practice sale executed.',
          detail: `ownership moved to ${PRACTICE_BUYER_LABEL}; resources and creditor claims preserved`,
        })
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : String(error), tone: 'error' })
      }
      return
    }
    void (async () => {
      const runtime = runtimeRef.current
      if (!runtime) return
      const wallet = await runtime.getWallet()
      if (!wallet) {
        setMessage({ text: 'Connect a wallet to buy this station', tone: 'info' })
        return
      }
      setTxPending('purchase')
      try {
        const contract = await getStationContract(STATION_ACCOUNT, runtime)
        const state = await contract.viewState()
        if (state.listing === null) throw new Error('No active listing')
        if (state.owner === wallet.accountId) throw new Error('Buyer is already the captain')
        pollingRef.current = true
        await contract.purchase(state.revision, BigInt(state.listing))
        const settled = await confirmSettled(state.revision)
        if (!settled) {
          setBanner({ tone: 'info', text: 'Submitted — no read-back yet.' })
        }
      } catch (error) {
        const text = extractContractError(error)
        if (/stale quote|revision/i.test(text)) {
          setMessage({
            text: `${text}. The contract state moved after you opened this panel — refreshing now; re-open and retry.`,
            tone: 'error',
          })
          await refreshChain(false)
        } else {
          setMessage({ text, tone: 'error' })
        }
      } finally {
        pollingRef.current = false
        setTxPending(null)
      }
    })()
  }, [mode, confirmSettled, refreshChain])

  /* Wallet & mode ------------------------------------------------------ */

  const connectWallet = useCallback(() => {
    const runtime = runtimeRef.current
    if (!runtime || !runtime.walletLibraryAvailable) {
      setNearMissing(true)
      setBanner({
        tone: 'error',
        text: 'Wallet library unavailable in this build.',
        detail: 'near-api-js / @hot-labs/near-connect failed to load — practice mode stays available.',
      })
      return
    }
    void (async () => {
      try {
        const wallet = await runtime.connectWallet()
        if (wallet) {
          setWalletAccount(wallet.accountId)
          setBanner({ tone: 'ok', text: `Wallet connected: ${wallet.accountId}`, detail: 'testnet mode is live' })
          void refreshChain(false)
        }
      } catch (error) {
        setMessage({
          text: `Wallet sign-in did not complete: ${error instanceof Error ? error.message : String(error)}`,
          tone: 'info',
        })
      }
    })()
  }, [refreshChain])

  const switchMode = useCallback(
    (next: Mode) => {
      if (next === mode) return
      setBanner(null)
      setMessage(null)
      if (next === 'testnet') {
        const runtime = runtimeRef.current
        if (!runtime || !runtime.walletLibraryAvailable) {
          setNearMissing(true)
          setBanner({
            tone: 'error',
            text: 'Wallet libraries unavailable — practice only.',
            detail: 'testnet mode needs near-api-js and @hot-labs/near-connect installed.',
          })
          return
        }
        setChainState(null)
        setMode('testnet')
        void refreshChain(false)
        runtime
          .getWallet()
          .then((wallet) => {
            if (wallet) setWalletAccount(wallet.accountId)
          })
          .catch(() => undefined)
      } else {
        setMode('practice')
      }
    },
    [mode, refreshChain],
  )

  /* ------------------------------------------------------------------ */
  /* Derived view                                                        */
  /* ------------------------------------------------------------------ */

  const practiceSnapshot = useMemo<GameSnapshot>(() => {
    let escrow = 0n
    for (const offer of practice.offers) {
      if (!offer.used && !offer.refunded && offer.campaignId === practice.campaignId) {
        escrow += offer.escrowYocto
      }
    }
    return snapshotFromState(practice, escrow)
  }, [practice])

  const practiceRows = useMemo<LedgerRow[]>(
    () =>
      practice.history.map((event, i) => ({
        sequence: i + 1,
        turn: event.turn,
        kind: event.kind,
        text: event.text,
        deltaYocto: event.operatingDeltaYocto,
        revision: practice.revision,
        block: null,
        source: 'model' as const,
      })),
    [practice],
  )

  const isTestnet = mode === 'testnet'
  const snapshot = isTestnet ? chainState?.snapshot ?? null : practiceSnapshot
  const rows = isTestnet ? chainState?.rows ?? [] : practiceRows
  const offers = isTestnet ? chainState?.offers ?? [] : practice.offers

  const previewState = useMemo<StationState | null>(() => {
    if (!snapshot) return null
    if (!isTestnet) return practice
    return previewStateFromChain(snapshot, offers)
  }, [snapshot, isTestnet, practice, offers])

  const dockedShip = useMemo(() => {
    if (!snapshot || snapshot.complete) return false
    return rows.slice(0, 3).some((row) => row.kind === 'standardDocking' || row.kind === 'heavyDocking')
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

  const connectionChip = useMemo(() => {
    if (txPending !== null) {
      return {
        variant: 'pending' as const,
        active: false,
        label: 'PENDING',
        detail: 'submitted — updating only after the chain read-back',
      }
    }
    if (!isTestnet) {
      return { variant: 'practice' as const, active: true, label: 'PRACTICE', detail: 'local model · saved in browser' }
    }
    if (chainError) {
      return { variant: 'disconnected' as const, active: false, label: 'DISCONNECTED', detail: chainError }
    }
    if (nearMissing) {
      return { variant: 'disconnected' as const, active: false, label: 'DISCONNECTED', detail: 'wallet libraries missing' }
    }
    if (walletAccount === null) {
      return {
        variant: 'disconnected' as const,
        active: false,
        label: 'DISCONNECTED',
        detail: 'no wallet session — read-only',
      }
    }
    return { variant: 'testnet' as const, active: true, label: 'TESTNET', detail: walletAccount }
  }, [txPending, isTestnet, chainError, nearMissing, walletAccount])

  const showResult = snapshot?.outcome.complete === true && !resultDismissed

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  if (!snapshot || !previewState) {
    return (
      <div className="boot" role="status" style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <span>{isTestnet ? 'READING STATION FROM TESTNET…' : 'SPOOLING UP…'}</span>
        {chainError ? (
          <span style={{ color: 'var(--red)', fontSize: 13, maxWidth: 460, textAlign: 'center' }}>
            {chainError}
          </span>
        ) : null}
        {isTestnet && chainError ? (
          <button className="btn" onClick={() => setMode('practice')}>
            Back to practice
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="app">
      <Header
        stationAccount={snapshot.stationAccount}
        stationName={isTestnet ? `${snapshot.stationAccount.split('.')[0]?.toUpperCase() ?? 'STATION'}` : PRACTICE_NAME_TAG}
        playedTurns={Math.min(Math.max(snapshot.turn - 1, 0), CAMPAIGN_TURNS)}
        mode={mode}
        connectionChip={connectionChip}
        onModePractice={() => switchMode('practice')}
        onModeTestnet={() => switchMode('testnet')}
        onOpenInspect={() => setInspectOpen(true)}
      />

      <div className="shell">
        <StatusRail
          snapshot={snapshot}
          source={isTestnet ? 'chain' : 'model'}
          fuelFlashCell={fuelFlashCell}
        />

        <StationCanvas
          snapshot={snapshot}
          dockedShip={dockedShip}
          source={isTestnet ? 'chain' : 'model'}
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
          mode={mode}
          snapshot={snapshot}
          previewState={previewState}
          currentBlock={isTestnet ? BigInt(chainState?.blockHeight ?? 0) : practiceBlockHeight(practice)}
          confirmBusy={txPending !== null}
          walletConnected={walletAccount !== null}
          onConfirm={confirm}
          onConnectWallet={connectWallet}
        />
      </div>

      {message ? (
        <div style={{ padding: '10px 16px 0', background: 'var(--bg)' }}>
          <div className={`alert${message.tone === 'error' ? ' alert--error' : ' alert--info'}`} role="alert">
            <span>{message.text}</span>
            <button className="iconbtn alert__close" onClick={() => setMessage(null)} aria-label="Dismiss message">
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <BottomActivity
        events={rows}
        currentTurn={snapshot.turn}
        source={isTestnet ? 'chain' : 'model'}
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
        mode={mode}
        onClose={() => setInspectOpen(false)}
        snapshot={snapshot}
        walletAccount={walletAccount}
        confirmBusy={txPending !== null}
        alert={message}
        onDismissAlert={() => setMessage(null)}
        onListForSale={listForSale}
        onUnlist={unlist}
        onBuy={buy}
      />

      {showResult ? (
        <MissionResult
          snapshot={snapshot}
          events={rows}
          source={isTestnet ? 'chain' : 'model'}
          walletAccount={walletAccount}
          onNewPracticeRun={() => {
            clearPractice()
            setPractice(freshPractice())
            setResultDismissed(false)
            setBanner({ tone: 'ok', text: 'New practice run: 10 Cr operating, fuel 4, hull 2.', detail: 'serves six fresh visitor offers' })
          }}
          onClose={() => setResultDismissed(true)}
        />
      ) : null}
    </div>
  )
}

interface ChainView {
  snapshot: GameSnapshot
  offers: Offer[]
  rows: LedgerRow[]
  blockHeight: number
}

const PRACTICE_BUYER_LABEL = 'buyer.derelict.practice'

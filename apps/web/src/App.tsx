import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CAMPAIGN_TURNS, type ActionKind, type Offer, type StationState } from '@derelict/game-model'
import { loadNearRuntime, type NearRuntime } from './lib/near'
import {
  extractContractError,
  getStationContract,
  toContractAction,
  CREDIT as CREDIT_UNIT,
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
  stationsOwnedBy,
  suggestStationName,
  type StationInfo,
} from './lib/factory'
import { Header } from './components/Header'
import { StatusRail } from './components/StatusRail'
import { StationCanvas } from './components/StationCanvas'
import { DecisionRail } from './components/DecisionRail'
import { BottomActivity } from './components/BottomActivity'
import { LedgerDrawer } from './components/LedgerDrawer'
import { InspectBuy } from './components/InspectBuy'
import { MissionResult } from './components/MissionResult'
import { LaunchStation, type LaunchStep } from './components/LaunchStation'
import { Welcome } from './components/Welcome'
import { HowItWorks } from './components/HowItWorks'
import { NO_FX, confirmedChanges, moduleForAction, type ModuleId, type StationFx } from './lib/stationFx'
import { onBlockedPopup, type BlockedPopup } from './lib/popupGuard'
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
  /** An nft_transfer_call is waiting on its receiver. */
  locked: boolean
}

interface TxContext {
  contract: StationContractClient
  /** The station exactly as the user saw it when they clicked. */
  view: ChainView
  accountId: string
}

interface TxSpec {
  kind: TxKind
  /** Station module the canvas marks as pending / failed (null: whole station). */
  module: ModuleId | null
  /** Shown when there is no wallet session. */
  connectPrompt: string
  submit: (ctx: TxContext) => Promise<unknown>
  settledBanner?: (ctx: TxContext) => BannerState
}

/**
 * Read everything the bridge shows for one station (contract views only).
 * Given the previous read of the same station, a poll costs one get_state
 * call: every on-chain change bumps the revision, so an unchanged revision
 * means offers, ledger and buckets are unchanged too.
 */
async function loadView(runtime: NearRuntime, account: string, previous: ChainView | null = null): Promise<ChainView> {
  const contract = await getStationContract(account, runtime)
  if (previous && previous.snapshot.stationAccount === account) {
    const state = await contract.viewState()
    if (state.revision === previous.snapshot.revision) {
      return state.block_height === previous.blockHeight ? previous : { ...previous, blockHeight: state.block_height }
    }
  }
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
    locked: state.locked,
  }
}

/** Ship arrival length; the new ledger fee highlights once it has docked. */
const ARRIVAL_MS = 1100

function assertCaptain(snapshot: GameSnapshot, accountId: string): void {
  if (snapshot.owner !== accountId) {
    throw new Error(
      `Only the station captain (${snapshot.owner}) may command this station. You are connected as ${accountId}.`,
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

/** Contract error text, or a plain explanation when the wallet was dismissed. */
function txErrorText(error: unknown): string {
  const text = extractContractError(error)
  return /wallet closed|user rejected|rejected by user|cancell?ed/i.test(text)
    ? 'The wallet was closed before approving — nothing was sent.'
    : text
}

export function App(): JSX.Element {
  // Station on screen: a `?station=` link, else the newest station the
  // connected wallet owns; null shows the connect / launch screen. The ref
  // lets async reads drop results for a station that is no longer shown.
  const [stationAccount, setStationAccount] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('station') || null,
  )
  const stationRef = useRef(stationAccount)

  // NEAR runtime: isolated wallet/RPC library state.
  const runtimeRef = useRef<NearRuntime | null>(null)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [nearMissing, setNearMissing] = useState(false)
  const [walletAccount, setWalletAccount] = useState<string | null>(null)
  /** False until a previous wallet session has been restored (or ruled out). */
  const [walletChecked, setWalletChecked] = useState(false)
  const [connecting, setConnecting] = useState(false)
  /** Stations the connected wallet owns; undefined while loading or disconnected. */
  const [ownedStations, setOwnedStations] = useState<StationInfo[] | undefined>(undefined)

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

  // How-it-works guide, opened from the header or the connect screen.
  const [guideOpen, setGuideOpen] = useState(false)
  const closeGuide = useCallback(() => setGuideOpen(false), [])
  const [launchStep, setLaunchStep] = useState<LaunchStep | null>(null)
  const [walletBalance, setWalletBalance] = useState<bigint | null | undefined>(undefined)

  // A wallet window the browser blocked, waiting for one click to open.
  const [blockedPopup, setBlockedPopup] = useState<BlockedPopup | null>(null)
  useEffect(() => {
    onBlockedPopup(setBlockedPopup)
    return () => onBlockedPopup(null)
  }, [])

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
        setWalletChecked(true)
        return
      }
      runtimeRef.current = runtime
      setRuntimeReady(true)
      if (!runtime.walletLibraryAvailable) {
        setNearMissing(true)
        setWalletChecked(true)
        return
      }
      runtime
        .getWallet()
        .then((wallet) => {
          if (!cancelled && wallet) setWalletAccount(wallet.accountId)
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setWalletChecked(true)
        })
    })
    return () => {
      cancelled = true
    }
  }, [])

  /* ------------------------------------------------------------------ */
  /* Chain refresh (read-only)                                           */
  /* ------------------------------------------------------------------ */

  // Canvas effects derived from confirmed read-backs (never from pending txs).
  const [fx, setFx] = useState<StationFx>(NO_FX)
  const fxTimers = useRef<number[]>([])
  const clearFxLater = useCallback((patch: Partial<StationFx>, ms: number) => {
    fxTimers.current.push(window.setTimeout(() => setFx((current) => ({ ...current, ...patch })), ms))
  }, [])
  useEffect(() => () => fxTimers.current.forEach((t) => window.clearTimeout(t)), [])

  /**
   * Show a read-back. A baseline (first read of a station, or a page load)
   * restores state silently; later reads of the same station play only what
   * the chain confirmed since the previous read.
   */
  const applyView = useCallback(
    (view: ChainView, baseline = false) => {
      const previous = chainRef.current
      chainRef.current = view
      setChainState(view)
      setChainError(null)
      if (baseline || !previous || previous.snapshot.stationAccount !== view.snapshot.stationAccount) {
        setFx((current) => ({ ...NO_FX, pendingModule: current.pendingModule }))
        return
      }
      const changes = confirmedChanges(previous, view)
      const key = Date.now()
      if (changes.newAfterSequence === null && changes.previousOwner === null) return
      setFx((current) => ({
        ...current,
        arrival: changes.docked ? key : current.arrival,
        restoration: changes.repaired ? key : current.restoration,
        ownerSwap: changes.previousOwner !== null ? { previous: changes.previousOwner, key } : current.ownerSwap,
        newAfterSequence: changes.newAfterSequence ?? current.newAfterSequence,
        ledgerDelayMs: changes.docked ? ARRIVAL_MS : 0,
      }))
      if (changes.previousOwner !== null) clearFxLater({ ownerSwap: null }, 700)
      if (changes.newAfterSequence !== null) clearFxLater({ newAfterSequence: null }, 4000)
    },
    [clearFxLater],
  )

  const refreshChain = useCallback(
    async (announce: boolean): Promise<ChainView | null> => {
      const runtime = runtimeRef.current
      const account = stationRef.current
      if (!runtime || account === null) return null
      try {
        const previous = chainRef.current
        const view = await loadView(runtime, account, previous)
        if (stationRef.current !== account) return null
        if (view !== previous) applyView(view)
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
          applyView(view, true)
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

  /** Leave the current station and return to the connect / launch screen. */
  const closeStation = useCallback(() => {
    stationRef.current = null
    setStationAccount(null)
    chainRef.current = null
    setChainState(null)
    setChainError(null)
    setBanner(null)
    setInspectOpen(false)
    setLedgerOpen(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('station')
    window.history.replaceState(null, '', url)
  }, [])

  useEffect(() => {
    if (!runtimeReady || stationAccount === null) return
    void refreshChain(false)
    const timer = window.setInterval(() => {
      if (!pollingRef.current && document.visibilityState !== 'hidden') void refreshChain(false)
    }, 3500)
    return () => {
      window.clearInterval(timer)
    }
  }, [refreshChain, runtimeReady, stationAccount])

  // Owned stations follow the connected wallet.
  useEffect(() => {
    setOwnedStations(undefined)
    const runtime = runtimeRef.current
    if (!runtimeReady || !runtime || walletAccount === null) return
    let cancelled = false
    stationsOwnedBy(runtime, walletAccount)
      .then((list) => !cancelled && setOwnedStations(list))
      .catch(() => !cancelled && setOwnedStations([]))
    return () => {
      cancelled = true
    }
  }, [runtimeReady, walletAccount])

  // With nothing on screen, open the wallet's newest station.
  useEffect(() => {
    if (stationAccount !== null || !ownedStations?.length) return
    void openStation(ownedStations[0].station_account)
  }, [stationAccount, ownedStations, openStation])

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
        const account = stationRef.current
        if (!runtime || account === null) break
        try {
          const contract = await getStationContract(account, runtime)
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
   * Shared signing flow: validate against the station on screen, sign with
   * the connected wallet, then wait for the read-back. Nothing slow may run
   * before the wallet call: browsers only let the wallet open its approval
   * window shortly after the click. The contract rejects a stale revision.
   * Resolves true only once the chain shows the new revision.
   */
  const runTx = useCallback(
    async (spec: TxSpec): Promise<boolean> => {
      const runtime = runtimeRef.current
      const station = stationRef.current
      const view = chainRef.current
      if (!runtime || station === null || view === null) return false
      const wallet = await runtime.getWallet()
      if (!wallet) {
        setMessage({ text: spec.connectPrompt, tone: 'info' })
        return false
      }
      setTxPending(spec.kind)
      setFx((current) => ({ ...current, pendingModule: spec.module, failure: null }))
      setMessage(null)
      pollingRef.current = true
      try {
        const contract = await getStationContract(station, runtime)
        const ctx: TxContext = { contract, view, accountId: wallet.accountId }
        await spec.submit(ctx)
        const settled = await confirmSettled(view.snapshot.revision)
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
        const text = txErrorText(error)
        const key = Date.now()
        setFx((current) => ({ ...current, failure: { module: spec.module, text, key } }))
        clearFxLater({ failure: null }, 2800)
        setMessage({
          text: /stale/i.test(text)
            ? `${text} — the station changed since this screen was read. Review the refreshed numbers and try again.`
            : text,
          tone: 'error',
        })
        void refreshChain(false)
        return false
      } finally {
        pollingRef.current = false
        setTxPending(null)
        setFx((current) => ({ ...current, pendingModule: null }))
      }
    },
    [clearFxLater, confirmSettled, refreshChain],
  )

  const confirmAction = useCallback(
    (action: ActionKind) => {
      void runTx({
        kind: 'act',
        module: moduleForAction(action.kind),
        connectPrompt: 'Connect a wallet to command this station',
        submit: ({ contract, view: { snapshot }, accountId }) => {
          assertCaptain(snapshot, accountId)
          if (snapshot.complete) throw new Error('Campaign is complete')
          return contract.act(toContractAction(action), snapshot.revision)
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
        module: null,
        connectPrompt: 'Connect a wallet to list this station',
        submit: ({ contract, view: { snapshot }, accountId }) => {
          assertCaptain(snapshot, accountId)
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
      module: null,
      connectPrompt: 'Connect a wallet to change this listing',
      submit: ({ contract, view: { snapshot }, accountId }) => {
        assertCaptain(snapshot, accountId)
        return contract.unlist()
      },
      settledBanner: () => ({ tone: 'ok', text: 'Listing removed on chain.' }),
    })
  }, [runTx])

  const buy = useCallback(() => {
    void runTx({
      kind: 'purchase',
      module: null,
      connectPrompt: 'Connect a wallet to buy this station',
      // The buyer pays the price they were shown; the contract rejects a stale revision.
      submit: ({ contract, view: { snapshot }, accountId }) => {
        if (snapshot.listingYocto === null) throw new Error('No active listing')
        if (snapshot.owner === accountId) throw new Error('You already command this station')
        return contract.purchase(snapshot.revision, snapshot.listingYocto)
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
      module: 'repair',
      connectPrompt: 'Connect the supplier wallet to claim the repair fee',
      submit: ({ contract, view: { snapshot }, accountId }) => {
        if (snapshot.repairSupplier !== accountId) throw new Error('Only the recorded supplier may claim')
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
        module: 'dock',
        connectPrompt: 'Connect the captain wallet to fund visitor traffic',
        submit: ({ contract, view: { snapshot, offers }, accountId }) => {
          assertCaptain(snapshot, accountId)
          if (offers.some((offer) => offer.campaignId === snapshot.campaignId)) {
            throw new Error('Visitor traffic is already funded for this campaign')
          }
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
      // Name availability is checked while typing: the wallet call must
      // follow the click immediately or the browser blocks its window.
      const account = stationAccountFor(name)
      setMessage(null)
      setLaunchStep('creating')
      try {
        await createStation(wallet, name)
        setLaunchStep('waiting')
        if (!(await openStation(account, 60_000))) return
        setLaunchOpen(false)
        void stationsOwnedBy(runtime, wallet.accountId).then(setOwnedStations).catch(() => undefined)
        // The second approval needs its own click, so it is a button, not automatic.
        setBanner({
          tone: 'info',
          text: `${account} is online — you are its captain.`,
          detail: 'Step 2: click Fund visitor traffic in the decision rail to queue the 12 visiting ships.',
        })
      } catch (error) {
        setMessage({ text: txErrorText(error), tone: 'error' })
      } finally {
        setLaunchStep(null)
      }
    },
    [openStation],
  )

  const openLaunch = useCallback(() => {
    setMessage(null)
    setLaunchOpen(true)
  }, [])

  const checkStationName = useCallback(async (name: string): Promise<boolean> => {
    const runtime = runtimeRef.current
    if (!runtime) return false
    return (await runtime.accountBalance(stationAccountFor(name))) === null
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
    setWalletBalance(undefined)
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
      // A linked station that belongs to someone else stays read-only.
      const view = await refreshChain(false)
      if (view && view.snapshot.owner !== wallet.accountId) {
        if (view.snapshot.listingYocto !== null) setInspectOpen(true)
        setBanner({
          tone: 'info',
          text: `Connected as ${wallet.accountId}`,
          detail:
            view.snapshot.listingYocto !== null
              ? `This station is commanded by ${view.snapshot.owner}. It is listed — buy it to take command.`
              : `This station is commanded by ${view.snapshot.owner}. Open or launch your own from Launch station.`,
        })
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
    setLaunchOpen(false)
    closeStation()
  }, [closeStation])

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

  const launchDialog = (
    <LaunchStation
      open={launchOpen}
      onClose={() => setLaunchOpen(false)}
      walletAccount={walletAccount}
      balanceYocto={walletBalance}
      myStations={ownedStations}
      currentStation={stationAccount}
      suggestedName={suggestedName}
      step={launchStep}
      busy={txPending !== null}
      alert={message}
      onDismissAlert={() => setMessage(null)}
      onConnectWallet={() => void connectWallet()}
      onCheckName={checkStationName}
      onLaunch={(name) => void launchStation(name)}
      onOpenStation={openOwnStation}
    />
  )

  const guideDialog = <HowItWorks open={guideOpen} onClose={closeGuide} />

  const popupPrompt = blockedPopup ? (
    <div className="popup-prompt" role="alertdialog" aria-modal="true" aria-label="Open your wallet">
      <div className="popup-prompt__panel">
        <div className="popup-prompt__title">OPEN YOUR WALLET</div>
        <p>
          Your browser blocked the wallet's approval window. Open it to review and approve the
          transaction.
        </p>
        <div className="popup-prompt__actions">
          <button className="btn btn--primary" onClick={() => blockedPopup.open()}>
            Open wallet window
          </button>
          <button className="btn btn--quiet" onClick={() => blockedPopup.cancel()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null

  if (stationAccount === null) {
    return (
      <>
        <Welcome
          walletAccount={walletAccount}
          walletChecked={walletChecked}
          connecting={connecting}
          nearMissing={nearMissing}
          ownedStations={ownedStations}
          message={message}
          onConnectWallet={() => void connectWallet()}
          onDisconnectWallet={() => void disconnectWallet()}
          onOpenLaunch={openLaunch}
          onOpenGuide={() => setGuideOpen(true)}
        />
        {launchDialog}
        {guideDialog}
        {popupPrompt}
      </>
    )
  }

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
          <div className="boot__actions">
            <button className="btn btn--quiet" onClick={() => void refreshChain(false)}>
              Retry read
            </button>
            {chainError ? (
              <button className="btn btn--quiet" onClick={closeStation}>
                {walletAccount ? 'My stations' : 'Back'}
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
        onOpenGuide={() => setGuideOpen(true)}
      />

      <div className="shell">
        <StatusRail snapshot={snapshot} ownerSwap={fx.ownerSwap} />

        <StationCanvas
          snapshot={snapshot}
          dockedShip={dockedShip}
          spots={offerCounts}
          fx={fx}
          transferLocked={chainState?.locked ?? false}
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
        newAfterSequence={fx.newAfterSequence}
        highlightDelayMs={fx.ledgerDelayMs}
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

      {launchDialog}
      {guideDialog}
      {popupPrompt}

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

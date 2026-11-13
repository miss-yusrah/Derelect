import { useMemo, useState } from 'react'
import {
  previewActionAtBlock,
  HEAVY_FEE,
  REFUEL_UNIT_COST,
  REPAIR_COST,
  STANDARD_FEE,
  STANDARD_FEE_UPGRADED,
  UPGRADE_COST,
  FUEL_CAPACITY,
  type ActionKind,
  type ActionPreview,
  type StationState,
} from '@derelict/game-model'
import { cr } from './format'

export type ActionKey = ActionKind['kind']

export const ACTION_ORDER: ActionKey[] = [
  'standardDocking',
  'heavyDocking',
  'refuel',
  'commissionRepair',
  'upgradeDock',
  'wait',
]

/** Names used on cards, the turn track and the results table. */
export const ACTION_NAMES: Record<ActionKey, { title: string; short: string }> = {
  standardDocking: { title: 'Standard docking', short: 'Dock' },
  heavyDocking: { title: 'Heavy docking', short: 'Heavy' },
  refuel: { title: 'Refuel', short: 'Refuel' },
  commissionRepair: { title: 'Commission repair', short: 'Repair' },
  upgradeDock: { title: 'Upgrade dock', short: 'Upgrade' },
  wait: { title: 'Wait', short: 'Wait' },
}

/** One change a card makes to the station, shown as a signed chip. */
export interface CardEffect {
  label: string
  delta: number
  /** Lands after the next action rather than immediately. */
  later?: boolean
}

export interface CardView {
  key: ActionKey
  title: string
  /** Credits the action earns (positive) or costs (negative). */
  creditsYocto: bigint
  effects: CardEffect[]
  /** Short line under the card when it can be played. */
  hint: string
  preview: ActionPreview
}

export interface DeckContext {
  standardWaiting: number
  heavyWaiting: number
}

/** What a played card changes, before the chain confirms it. */
export interface DeckForecast {
  creditsYocto: bigint
  fuel: number
  hull: number
  /** Hull that lands after the next action (a commissioned repair). */
  hullLater: number
  served: number
}

/** NEAR account ID rules: 2–64 chars, lowercase parts joined by - or _, dot-separated. */
export function isNearAccountId(account: string): boolean {
  return (
    account.length >= 2 &&
    account.length <= 64 &&
    /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(account)
  )
}

function actionFor(kind: ActionKey, refuelUnits: number, supplier: string): ActionKind {
  switch (kind) {
    case 'standardDocking':
      return { kind: 'standardDocking' }
    case 'heavyDocking':
      return { kind: 'heavyDocking' }
    case 'refuel':
      return { kind: 'refuel', units: refuelUnits }
    case 'commissionRepair':
      return { kind: 'commissionRepair', supplier }
    case 'upgradeDock':
      return { kind: 'upgradeDock' }
    case 'wait':
      return { kind: 'wait' }
  }
}

/** One plain sentence on what the card does. */
export function describeAction(kind: ActionKey, state: StationState): string {
  switch (kind) {
    case 'standardDocking':
      return state.upgrade
        ? 'Serve a visiting ship at the upgraded dock. Burns 1 fuel and earns 5 Cr.'
        : 'Serve a visiting ship. Burns 1 fuel and earns 3 Cr; an upgraded dock earns 5.'
    case 'heavyDocking':
      return 'Serve a heavy freighter. Burns 2 fuel, wears 1 hull and earns 8 Cr.'
    case 'refuel':
      return `Buy fuel at 2 Cr a unit. The tank holds ${FUEL_CAPACITY}.`
    case 'commissionRepair':
      return 'Set 4 Cr aside for a repair supplier. The hull gains 2 after your next action, and the supplier is paid from the reserve even if the station is sold.'
    case 'upgradeDock':
      return 'Spend 4 Cr once. Every standard docking pays 5 Cr from then on.'
    case 'wait':
      return 'Let the turn pass. A commissioned repair can land while you wait.'
  }
}

function cardFor(
  kind: ActionKey,
  state: StationState,
  preview: ActionPreview,
  refuelUnits: number,
  ctx: DeckContext,
): CardView {
  const title = ACTION_NAMES[kind].title
  switch (kind) {
    case 'standardDocking':
      return {
        key: kind,
        title,
        preview,
        creditsYocto: state.upgrade ? STANDARD_FEE_UPGRADED : STANDARD_FEE,
        effects: [
          { label: 'fuel', delta: -1 },
          { label: 'ship', delta: 1 },
        ],
        hint: waiting(ctx.standardWaiting, 'ship'),
      }
    case 'heavyDocking':
      return {
        key: kind,
        title,
        preview,
        creditsYocto: HEAVY_FEE,
        effects: [
          { label: 'fuel', delta: -2 },
          { label: 'hull', delta: -1 },
          { label: 'ship', delta: 1 },
        ],
        hint: waiting(ctx.heavyWaiting, 'freighter'),
      }
    case 'refuel':
      return {
        key: kind,
        title,
        preview,
        creditsYocto: -REFUEL_UNIT_COST * BigInt(refuelUnits),
        effects: [{ label: 'fuel', delta: refuelUnits }],
        hint: `${cr(REFUEL_UNIT_COST)} Cr per unit`,
      }
    case 'commissionRepair':
      return {
        key: kind,
        title,
        preview,
        creditsYocto: -REPAIR_COST,
        effects: [{ label: 'hull', delta: 2, later: true }],
        hint: 'Lands after your next action',
      }
    case 'upgradeDock':
      return {
        key: kind,
        title,
        preview,
        creditsYocto: -UPGRADE_COST,
        effects: [],
        hint: 'Standard docking pays 5 Cr',
      }
    case 'wait':
      return { key: kind, title, preview, creditsYocto: 0n, effects: [], hint: 'Costs nothing' }
  }
}

function waiting(count: number, noun: string): string {
  if (count === 0) return `No ${noun}s waiting`
  return `${count} ${noun}${count === 1 ? '' : 's'} waiting`
}

/** Plain-language reasons for the rules model's blockers. */
export function blockerText(error: string | undefined): string {
  if (!error) return 'Not available'
  if (/hull is 0/i.test(error)) return 'Hull at 0 — repair first'
  if (/not enough fuel \(needs (\d)\)/i.test(error)) return `Needs ${error.match(/needs (\d)/i)?.[1]} fuel`
  if (/no eligible prepaid standard/i.test(error)) return 'No ship waiting'
  if (/no eligible prepaid heavy/i.test(error)) return 'No freighter waiting'
  if (/one active repair/i.test(error)) return 'A repair is already underway'
  if (/turn 6/i.test(error)) return 'Too late — lands after turn 6'
  if (/already upgraded/i.test(error)) return 'Already upgraded'
  if (/insufficient operating funds/i.test(error)) {
    const need = error.match(/needs (\d+)/i)?.[1]
    return need ? `Needs ${need} Cr` : 'Not enough credits'
  }
  if (/fuel capacity/i.test(error)) return 'Tank would overflow'
  if (/hull already at capacity/i.test(error)) return 'Hull already full'
  if (/campaign already complete/i.test(error)) return 'Campaign complete'
  if (/requires a supplier/i.test(error)) return 'Enter the supplier’s NEAR account'
  return error
}

/**
 * The hand of action cards: which one is selected, the inputs it needs, and
 * the rules-model preview of every card at the current chain block.
 */
export function useActionDeck(state: StationState | null, currentBlock: bigint, ctx: DeckContext) {
  const [selectedKind, setSelectedKind] = useState<ActionKey>('standardDocking')
  const [refuelUnits, setRefuelUnits] = useState(2)
  const [supplier, setSupplier] = useState('')
  const supplierAccount = supplier.trim()

  const cards = useMemo<CardView[]>(() => {
    if (!state) return []
    return ACTION_ORDER.map((kind) => {
      // Cards show rule blockers only; the supplier account is validated on the sign panel.
      const action = actionFor(kind, refuelUnits, kind === 'commissionRepair' ? supplierAccount || 'pending' : '')
      return cardFor(kind, state, previewActionAtBlock(state, action, currentBlock), refuelUnits, ctx)
    })
  }, [state, currentBlock, refuelUnits, supplierAccount, ctx])

  const action = useMemo(
    () => actionFor(selectedKind, refuelUnits, supplierAccount),
    [selectedKind, refuelUnits, supplierAccount],
  )

  const preview = useMemo<ActionPreview | null>(() => {
    if (!state) return null
    const p = previewActionAtBlock(state, action, currentBlock)
    if (p.ok && action.kind === 'commissionRepair' && !isNearAccountId(action.supplier)) {
      return { ...p, ok: false, error: 'Enter the supplier as a NEAR account, e.g. name.testnet' }
    }
    return p
  }, [state, action, currentBlock])

  const selectedCard = cards.find((card) => card.key === selectedKind) ?? null

  const forecast = useMemo<DeckForecast | null>(() => {
    if (!preview || !preview.ok || !selectedCard) return null
    return {
      creditsYocto: preview.operatingGainYocto - preview.operatingCostYocto,
      fuel: preview.fuelDelta,
      hull: preview.hullDelta,
      hullLater: selectedKind === 'commissionRepair' ? 2 : 0,
      served: selectedKind === 'standardDocking' || selectedKind === 'heavyDocking' ? 1 : 0,
    }
  }, [preview, selectedCard, selectedKind])

  return {
    cards,
    selectedKind,
    select: setSelectedKind,
    selectedCard,
    action,
    preview,
    forecast,
    refuelUnits,
    setRefuelUnits,
    supplier,
    setSupplier,
  }
}

export type ActionDeckState = ReturnType<typeof useActionDeck>

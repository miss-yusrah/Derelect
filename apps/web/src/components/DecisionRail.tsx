import { useMemo, useState } from 'react'
import {
  bestEligibleOffer,
  formatCredits,
  previewActionAtBlock,
  HEAVY_FEE,
  REFUEL_UNIT_COST,
  REPAIR_COST,
  STANDARD_FEE,
  STANDARD_FEE_UPGRADED,
  UPGRADE_COST,
  FUEL_CAPACITY,
  HULL_CAPACITY,
  type ActionKind,
  type ActionPreview,
  type StationState,
} from '@derelict/game-model'
import { IconClock, IconDock, IconFuel, IconLedger, IconWrench, IconChevron, IconWarning } from './icons'
import type { GameSnapshot } from '../lib/state'
import { TRAFFIC_ESCROW_YOCTO } from '../lib/factory'
import type { Offer } from '@derelict/game-model'

export interface DecisionRailProps {
  snapshot: GameSnapshot
  /** Chain state synthesized into the model so previews match on-chain rules. */
  previewState: StationState
  /** Current chain block reference used for offer eligibility. */
  currentBlock: bigint
  walletAccount: string | null
  /** True when the connected wallet owns the station. */
  isCaptain: boolean
  /** Captain's station has no visitor offers for this campaign yet. */
  needsTraffic: boolean
  confirmBusy: boolean
  onConfirm: (action: ActionKind) => void
  /** Recorded repair supplier collects the protected reserve. */
  onClaimRepair: () => void
  onSeedTraffic: () => void
  onConnectWallet: () => void
  onOpenInspect: () => void
  onOpenLaunch: () => void
}

interface RowDef {
  key: ActionKind['kind']
  title: string
  desc: (state: StationState) => string
  icon: React.ReactNode
}

const ORDER: RowDef[] = [
  {
    key: 'standardDocking',
    title: 'Standard docking',
    desc(state) {
      return state.upgrade
        ? 'Serve a visiting ship on the upgraded dock: earn 5 Cr, burn 1 fuel.'
        : 'Serve a visiting ship: earn 3 Cr, burn 1 fuel. Upgrading the dock raises this to 5 Cr.'
    },
    icon: <IconDock size={16} />,
  },
  {
    key: 'heavyDocking',
    title: 'Heavy docking',
    desc() {
      return 'Serve a heavy freighter: earn 8 Cr for 2 fuel and 1 hull of stress.'
    },
    icon: <IconDock size={16} />,
  },
  {
    key: 'refuel',
    title: 'Refuel',
    desc(state) {
      return `Haul fuel into the tanks at 2 Cr per unit (tank now holds ${state.fuel} of ${FUEL_CAPACITY}).`
    },
    icon: <IconFuel size={16} />,
  },
  {
    key: 'commissionRepair',
    title: 'Commission repair',
    desc() {
      return 'Reserve 4 Cr of operating funds for a supplier: hull is restored after your next action.'
    },
    icon: <IconWrench size={16} />,
  },
  {
    key: 'upgradeDock',
    title: 'Upgrade dock',
    desc() {
      return 'Spend 4 Cr once: every standard docking now pays 5 Cr whole-campaign.'
    },
    icon: <IconChevron size={16} />,
  },
  {
    key: 'wait',
    title: 'Wait',
    desc() {
      return 'Advance the turn free of charge. A reserve repair may land here.'
    },
    icon: <IconClock size={16} />,
  },
]

/** NEAR account ID rules: 2–64 chars, lowercase parts joined by - or _, dot-separated. */
function isNearAccountId(account: string): boolean {
  return (
    account.length >= 2 &&
    account.length <= 64 &&
    /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(account)
  )
}

function actionFor(kind: ActionKind['kind'], refuelUnits: number, supplier: string): ActionKind {
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

function fmtDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

interface RowView {
  def: RowDef
  preview: ActionPreview
  price: string
  priceClass: 'gain' | 'cost'
  sub: string
}

export function DecisionRail({
  snapshot,
  previewState,
  currentBlock,
  walletAccount,
  isCaptain,
  needsTraffic,
  confirmBusy,
  onConfirm,
  onClaimRepair,
  onSeedTraffic,
  onConnectWallet,
  onOpenInspect,
  onOpenLaunch,
}: DecisionRailProps) {
  const canClaimRepair =
    walletAccount !== null && snapshot.repairSupplier === walletAccount && !snapshot.repairPaid
  const [selectedKind, setSelectedKind] = useState<ActionKind['kind']>('standardDocking')
  const [refuelUnits, setRefuelUnits] = useState(2)
  const [supplier, setSupplier] = useState('')
  const supplierAccount = supplier.trim()

  const selected: ActionKind = useMemo(
    () => actionFor(selectedKind, refuelUnits, supplierAccount),
    [selectedKind, refuelUnits, supplierAccount],
  )

  const modelPreview = previewActionAtBlock(previewState, selected, currentBlock)
  const preview: ActionPreview =
    modelPreview.ok && selected.kind === 'commissionRepair' && !isNearAccountId(selected.supplier)
      ? { ...modelPreview, ok: false, error: 'Enter the supplier as a valid NEAR account, e.g. name.testnet' }
      : modelPreview

  const standardOffer = bestEligibleOffer(previewState, 'standard')
  const heavyOffer = bestEligibleOffer(previewState, 'heavy')

  const rows: RowView[] = useMemo(() => {
    const previewFor: Record<ActionKind['kind'], ActionPreview> = {
      standardDocking: previewActionAtBlock(previewState, { kind: 'standardDocking' }, currentBlock),
      heavyDocking: previewActionAtBlock(previewState, { kind: 'heavyDocking' }, currentBlock),
      refuel: previewActionAtBlock(
        previewState,
        { kind: 'refuel', units: refuelUnits },
        currentBlock,
      ),
      // Rows show rule blockers only (cost, one repair at a time); the
      // supplier account itself is validated in the preview pane.
      commissionRepair: previewActionAtBlock(
        previewState,
        { kind: 'commissionRepair', supplier: supplierAccount || 'pending' },
        currentBlock,
      ),
      upgradeDock: previewActionAtBlock(previewState, { kind: 'upgradeDock' }, currentBlock),
      wait: previewActionAtBlock(previewState, { kind: 'wait' }, currentBlock),
    }
    return ORDER.map((def) => {
      const p = previewFor[def.key]
      let price = ''
      let sub = ''
      let priceClass: 'gain' | 'cost' = 'cost'
      switch (def.key) {
        case 'standardDocking':
          price = `+${formatCredits(previewState.upgrade ? STANDARD_FEE_UPGRADED : STANDARD_FEE)} Cr`
          sub = '1 fuel'
          priceClass = 'gain'
          break
        case 'heavyDocking':
          price = `+${formatCredits(HEAVY_FEE)} Cr`
          sub = '2 fuel · 1 hull'
          priceClass = 'gain'
          break
        case 'refuel':
          price = `−${formatCredits(REFUEL_UNIT_COST * BigInt(refuelUnits))} Cr`
          sub = `+${refuelUnits} fuel`
          break
        case 'commissionRepair':
          price = `−${formatCredits(REPAIR_COST)} Cr`
          sub = 'protected reserve'
          break
        case 'upgradeDock':
          price = `−${formatCredits(UPGRADE_COST)} Cr`
          sub = 'once'
          break
        case 'wait':
          price = 'free'
          sub = ''
          break
      }
      return { def, preview: p, price, priceClass, sub }
    })
  }, [previewState, refuelUnits, supplierAccount, currentBlock])

  const selectedDef = ORDER.find((d) => d.key === selectedKind) as RowDef

  return (
    <aside className="rail-right" aria-label="Action decision rail">
      <div className="rail-right__head">
        <IconLedger size={15} />
        DECISION RAIL
        <span className="spacer" />
        {confirmBusy ? (
          <span className="rail-right__pending" role="status">
            SUBMITTED · AWAITING READ-BACK
          </span>
        ) : (
          <span className="evidence" style={{ letterSpacing: '0.1em' }}>
            TURN {Math.min(snapshot.turn, 6)} / 6
          </span>
        )}
      </div>

      <div className="next-step" role="status">
        <span className="next-step__label">NEXT STEP</span>
        {nextStep({ snapshot, walletAccount, isCaptain, needsTraffic, confirmBusy, canClaimRepair })}
      </div>

      {canClaimRepair ? (
        <div className="pane" aria-label="Supplier claim">
          <div className="pane__preview-tag">
            <IconWrench size={12} />
            SUPPLIER CLAIM
          </div>
          <div className="pane__desc">
            You are the recorded repair supplier. The protected reserve is yours once the repair is
            eligible — before or after any sale of the station.
          </div>
          <button
            className={`btn btn--primary btn--block${confirmBusy ? ' is-busy' : ''}`}
            disabled={confirmBusy}
            onClick={onClaimRepair}
          >
            {confirmBusy ? 'Working…' : 'Claim repair fee'}
          </button>
          <div className="pane__note">
            Signs <span style={{ fontFamily: 'var(--font-mono)' }}>claim_repair()</span> — paid from the
            reserve, never from operating funds.
          </div>
        </div>
      ) : null}

      {needsTraffic ? (
        <div className="pane" aria-label="Visitor traffic">
          <div className="pane__preview-tag">
            <IconDock size={12} />
            VISITOR TRAFFIC
          </div>
          <div className="pane__desc">
            No visiting ships have prepaid yet, so there is nothing to dock. Fund the scenario's 12 offers —
            6 standard (5 Cr) and 6 heavy (8 Cr) — in one transaction.
          </div>
          <button
            className={`btn btn--primary btn--block${confirmBusy ? ' is-busy' : ''}`}
            disabled={confirmBusy}
            onClick={onSeedTraffic}
          >
            {confirmBusy ? 'Working…' : `Fund visitor traffic (${formatCredits(TRAFFIC_ESCROW_YOCTO)} Cr)`}
          </button>
          <div className="pane__note">
            Escrow is held by the station and pays docking fees; unused offers stay refundable to you.
          </div>
        </div>
      ) : null}

      {snapshot.complete ? (
        <div className="endpanel" aria-label="Campaign result summary">
          <div
            className={`endpanel__verdict${
              snapshot.outcome.success ? ' endpanel__verdict--win' : ' endpanel__verdict--fail'
            }`}
          >
            {snapshot.outcome.success ? 'SALVAGE SUCCESSFUL' : 'STATION LOST'}
          </div>
          <div className="endpanel__reason">{snapshot.outcome.reason ?? 'Six turns complete.'}</div>
          <dl className="endpanel__stats">
            <div>
              <dt>FINAL TREASURY</dt>
              <dd>
                {formatCredits(snapshot.operatingYocto)}
                <span className="unit"> Cr</span>
              </dd>
            </div>
            <div>
              <dt>SHIPS SERVED</dt>
              <dd>
                {snapshot.served}
                <span className="unit"> / 3</span>
              </dd>
            </div>
            <div>
              <dt>HULL</dt>
              <dd>
                {snapshot.hull}
                <span className="unit"> / {HULL_CAPACITY}</span>
              </dd>
            </div>
            <div>
              <dt>FUEL</dt>
              <dd>
                {snapshot.fuel}
                <span className="unit"> / {FUEL_CAPACITY}</span>
              </dd>
            </div>
          </dl>
          <div className="pane__note">
            This campaign is settled on chain — the station keeps its final treasury and creditor
            claims.
          </div>
          <button className="btn btn--primary btn--block" onClick={walletAccount ? onOpenLaunch : onConnectWallet}>
            {walletAccount ? 'Launch a new station' : 'Connect wallet to play'}
          </button>
          <button className="btn btn--block" onClick={onOpenInspect}>
            {snapshot.listingYocto !== null && !isCaptain
              ? 'Inspect & buy station'
              : isCaptain
                ? 'Inspect / list station'
                : 'Inspect station'}
          </button>
        </div>
      ) : (
        <>
          <div className="actionlist" role="listbox" aria-label="Actions">
            {rows.map((row) => {
              const isSelected = row.def.key === selectedKind
              return (
                <button
                  key={row.def.key}
                  role="option"
                  aria-selected={isSelected}
                  className={`actionrow${isSelected ? ' actionrow--sel' : ''}`}
                  disabled={confirmBusy}
                  onClick={() => setSelectedKind(row.def.key)}
                  title={row.preview.ok ? undefined : row.preview.error}
                >
                  <span className="actionrow__title">
                    {row.def.icon}
                    {row.def.title}
                    {!row.preview.ok ? (
                      <span className="blocker">— {row.preview.error}</span>
                    ) : null}
                  </span>
                  <span className="actionrow__price">
                    <span className={`cost ${row.priceClass}`}>{row.price}</span>
                    {row.sub ? <span className="sub">{row.sub}</span> : null}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="pane" aria-live="polite">
            <div className="pane__preview-tag">PREVIEW — UNTIL YOU CONFIRM</div>
            <div className="pane__desc">{selectedDef.desc(previewState)}</div>

            {selectedKind === 'refuel' ? (
              <div className="fieldrow">
                <span style={{ fontSize: 11 }}>UNITS</span>
                <div className="unitpicker" role="radiogroup" aria-label="Refuel units">
                  {[1, 2, 3, 4].map((u) => (
                    <button
                      key={u}
                      role="radio"
                      aria-checked={refuelUnits === u}
                      className={`unitpicker__unit${refuelUnits === u ? ' unitpicker__unit--on' : ''}`}
                      onClick={() => setRefuelUnits(u)}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedKind === 'commissionRepair' ? (
              <div className="fieldrow">
                <label htmlFor="supplier-field">Supplier</label>
                <input
                  id="supplier-field"
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="supplier-account.testnet"
                  spellCheck={false}
                />
              </div>
            ) : null}

            {preview.ok ? (
              <div className="pane__cost">
                <span>{preview.text}</span>
                <span className="pane__effect">
                  EFFECT · fuel {fmtDelta(preview.fuelDelta)} · hull {fmtDelta(preview.hullDelta)} · served{' '}
                  {preview.turnsPlayed > 0 ? '+1' : '+0'}
                </span>
              </div>
            ) : (
              <div className="pane__error">
                <IconWarning size={14} />
                <span>{preview.error}</span>
              </div>
            )}

            <div style={{ display: 'grid', gap: 6 }}>
              {!walletAccount ? (
                <button className="btn btn--primary btn--block" onClick={onConnectWallet}>
                  Connect wallet to play
                </button>
              ) : !isCaptain ? (
                <>
                  <button className="btn btn--primary btn--block" onClick={onOpenLaunch}>
                    Launch your own station
                  </button>
                  <button className="btn btn--block" onClick={onOpenInspect}>
                    {snapshot.listingYocto !== null ? 'Inspect & buy this station' : 'Inspect this station'}
                  </button>
                </>
              ) : (
                <button
                  className={`btn btn--primary btn--block${confirmBusy ? ' is-busy' : ''}`}
                  disabled={!preview.ok || confirmBusy}
                  onClick={() => onConfirm(selected)}
                >
                  {confirmBusy ? 'Working…' : `Confirm — ${selectedDef.title}`}
                </button>
              )}
              {!walletAccount ? (
                <div className="pane__note">
                  Read-only until you connect. Connect your own NEAR testnet wallet, then launch a station you
                  command — every action is signed by you.
                </div>
              ) : !isCaptain ? (
                <div className="pane__note">
                  Connected as <span style={{ fontFamily: 'var(--font-mono)' }}>{walletAccount}</span>.
                  Only this station's captain ({snapshot.owner}) can command it.
                </div>
              ) : (
                <div className="pane__note">
                  Signs <span style={{ fontFamily: 'var(--font-mono)' }}>act(action, expected_revision)</span>
                  {' '}— state updates only after the chain read-back.
                </div>
              )}
            </div>
          </div>

          <div className="evidence" aria-label="Visitor offers in the dock queue">
            <span className="evidence__line" title={queueTitle(standardOffer, heavyOffer)}>
              <b>DOCK QUEUE</b>
              {` · ${queueText(standardOffer, 'STD')} · ${queueText(heavyOffer, 'HEAVY')}`}
            </span>
          </div>
        </>
      )}
    </aside>
  )
}

/** One plain sentence telling the player what to do now, from live state. */
function nextStep({
  snapshot,
  walletAccount,
  isCaptain,
  needsTraffic,
  confirmBusy,
  canClaimRepair,
}: {
  snapshot: GameSnapshot
  walletAccount: string | null
  isCaptain: boolean
  needsTraffic: boolean
  confirmBusy: boolean
  canClaimRepair: boolean
}): string {
  if (confirmBusy) return 'Approve the transaction in your wallet, then wait for the chain to confirm it.'
  if (!walletAccount) return 'Connect your NEAR testnet wallet to command a station.'
  if (canClaimRepair) return 'You are this station’s repair supplier: claim your repair fee below.'
  if (!isCaptain) {
    return snapshot.listingYocto !== null
      ? 'This station is for sale. Buy it to take command, or launch your own station.'
      : 'This station belongs to someone else. Launch your own station to play.'
  }
  if (snapshot.complete) {
    return snapshot.outcome.success
      ? 'Campaign won. Your score is the final treasury — launch a new station to play again.'
      : 'Campaign lost. Launch a new station to try a different route.'
  }
  if (needsTraffic) return 'Fund visitor traffic so ships can dock — one wallet approval.'
  if (snapshot.turn >= 6) return 'Last turn: your score is the operating funds after this action.'
  return `Turn ${snapshot.turn} of 6 — pick an action, read its preview, then Confirm.`
}

function queueText(offer: Offer | null, kind: string): string {
  return offer ? `${kind} #${offer.id} ${formatCredits(offer.escrowYocto)} CR` : `NO ${kind}`
}

function queueTitle(standard: Offer | null, heavy: Offer | null): string {
  const describe = (offer: Offer | null, kind: string) =>
    offer
      ? `next ${kind} offer #${offer.id} — ${formatCredits(offer.escrowYocto)} Cr escrow from ${offer.payer}`
      : `no ${kind} offer funded`
  return `${describe(standard, 'standard')}; ${describe(heavy, 'heavy')}`
}

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
  type ActionKind,
  type ActionPreview,
  type StationState,
} from '@derelict/game-model'
import { IconClock, IconDock, IconFuel, IconLedger, IconWrench, IconChevron, IconWarning } from './icons'
import { DEMO_SUPPLIER } from './demo'
import type { GameSnapshot } from '../lib/state'
import type { Offer } from '@derelict/game-model'

export interface DecisionRailProps {
  mode: 'practice' | 'testnet'
  snapshot: GameSnapshot
  /** Model state to preview against (practice real state; chain synthesized). */
  previewState: StationState
  /** Current practice/chain block reference used for offer eligibility. */
  currentBlock: bigint
  confirmBusy: boolean
  walletConnected: boolean
  onConfirm: (action: ActionKind) => void
  onConnectWallet: () => void
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
  mode,
  snapshot,
  previewState,
  currentBlock,
  confirmBusy,
  walletConnected,
  onConfirm,
  onConnectWallet,
}: DecisionRailProps) {
  const [selectedKind, setSelectedKind] = useState<ActionKind['kind']>('standardDocking')
  const [refuelUnits, setRefuelUnits] = useState(2)
  const [supplier, setSupplier] = useState(DEMO_SUPPLIER)

  const selected: ActionKind = useMemo(
    () => actionFor(selectedKind, refuelUnits, supplier),
    [selectedKind, refuelUnits, supplier],
  )

  const preview: ActionPreview = previewActionAtBlock(previewState, selected, currentBlock)

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
      commissionRepair: previewActionAtBlock(
        previewState,
        { kind: 'commissionRepair', supplier },
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
  }, [previewState, refuelUnits, supplier, currentBlock])

  const selectedDef = ORDER.find((d) => d.key === selectedKind) as RowDef

  return (
    <aside className="rail-right" aria-label="Action decision rail">
      <div className="rail-right__head">
        <IconLedger size={15} />
        DECISION RAIL
        <span className="spacer" />
        <span className="evidence" style={{ letterSpacing: '0.1em' }}>
          TURN {Math.min(snapshot.turn, 6)} / 6
        </span>
      </div>

      {snapshot.complete ? (
        <div className="pane">
          <div className="pane__desc">
            Campaign complete. The bridge is closed; the mission result holds
            this station's final operating treasury.
          </div>
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
            <div className="pane__desc" style={{ color: 'var(--ink)', fontWeight: 500 }}>
              {selectedDef.title.toUpperCase()}
              {selectedKind === 'refuel' ? ` ${refuelUnits} UNITS` : ''}
            </div>
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
                  placeholder="supplier.derelict.testnet"
                  spellCheck={false}
                />
              </div>
            ) : null}

            {preview.ok ? (
              <div className="pane__cost">
                <span>{preview.text}</span>
                <span style={{ display: 'block', marginTop: 6, color: 'var(--ink-3)', fontSize: 11 }}>
                  EFFECT — fuel {fmtDelta(preview.fuelDelta)} · hull {fmtDelta(preview.hullDelta)} · ships served {preview.turnsPlayed > 0 ? '+1' : '+0'}
                </span>
              </div>
            ) : (
              <div className="pane__error">
                <IconWarning size={14} />
                <span>{preview.error}</span>
              </div>
            )}

            <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
              {mode === 'practice' || walletConnected ? (
                <button
                  className="btn btn--primary btn--block"
                  disabled={!preview.ok || confirmBusy}
                  onClick={() => onConfirm(selected)}
                >
                  {confirmBusy ? 'Working…' : mode === 'practice' ? `Apply — ${selectedDef.title}` : `Confirm — ${selectedDef.title}`}
                </button>
              ) : (
                <button className="btn btn--block" onClick={onConnectWallet} disabled={confirmBusy}>
                  Connect wallet to command
                </button>
              )}
              {mode === 'practice' ? (
                <div className="pane__note">
                  Practice applies instantly through the local deterministic model —
                  exactly the rules the contract enforces on testnet.
                </div>
              ) : (
                <div className="pane__note">
                  Confirm sends <span style={{ fontFamily: 'var(--font-mono)' }}>act(action, expected_revision)</span>
                  {' '}with a revision freshly read from RPC. Fuel, hull and funds
                  update only when the chain read-back confirms.
                </div>
              )}
            </div>
          </div>

          <div className="evidence">
            <OfferLine offer={standardOffer} kind="STANDARD" />
            <OfferLine offer={heavyOffer} kind="HEAVY" />
          </div>
        </>
      )}
    </aside>
  )
}

function OfferLine({ offer, kind }: { offer: Offer | null; kind: string }) {
  return (
    <span style={{ display: 'block' }}>
      {offer ? (
        <>
          <b>{`NEXT ${kind} OFFER: #${offer.id}`}</b> ESCROW {formatCredits(offer.escrowYocto)} CR / {offer.payer}
        </>
      ) : (
        <b>{`NO ${kind} OFFER FUNDED`}</b>
      )}
    </span>
  )
}

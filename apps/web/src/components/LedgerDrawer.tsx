import { useMemo, useState } from 'react'
import { ledgerKindOf, actionLabel, type LedgerFilter, type LedgerRow } from '../lib/state'
import { crDelta } from '../lib/format'
import { IconClose } from './icons'
import { useDialogFocus } from './primitives'

export interface LedgerDrawerProps {
  open: boolean
  onClose: () => void
  rows: LedgerRow[]
  stationAccount: string
  revision: number
  epoch: number
  blockHeight: number | null
}

const FILTERS: Array<{ id: LedgerFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'actions', label: 'Turns' },
  { id: 'money', label: 'Money' },
  { id: 'ownership', label: 'Ownership' },
]

const KIND_LABELS: Record<string, string> = {
  fundOffer: 'Ship prepaid',
  claimRepair: 'Repair fee claimed',
  claimProceeds: 'Proceeds claimed',
  claimRefund: 'Refund claimed',
  payoutPaid: 'Payout sent',
  payoutFailed: 'Payout failed',
  list: 'Listed for sale',
  unlist: 'Listing removed',
  sale: 'Sold',
  transfer: 'Transferred',
  transferCall: 'Transfer started',
  transferCallReverted: 'Transfer reverted',
  transferCallForwarded: 'Transfer completed',
}

/** Every entry in the station contract's ledger: the record that proves the screen. */
export function LedgerDrawer({ open, onClose, rows, stationAccount, revision, epoch, blockHeight }: LedgerDrawerProps) {
  const [filter, setFilter] = useState<LedgerFilter>('all')
  const panelRef = useDialogFocus<HTMLElement>(open, onClose)

  const visible = useMemo(() => {
    return rows.filter((row) => filter === 'all' || ledgerKindOf(row.kind) === filter)
  }, [rows, filter])

  if (!open) return null
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="ledger-title" ref={panelRef} tabIndex={-1}>
        <div className="drawer__head">
          <div>
            <h2 className="dialog-title" id="ledger-title">
              Ledger
            </h2>
            <p className="dialog-sub">
              Every turn and money movement recorded by the station contract, newest first.
            </p>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close ledger">
            <IconClose size={16} />
          </button>
        </div>
        <div className="drawer__filters" role="tablist" aria-label="Show">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={filter === entry.id}
              className={`tab${filter === entry.id ? ' tab--on' : ''}`}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
              <span className="tab__count">{countFor(rows, entry.id)}</span>
            </button>
          ))}
        </div>
        <div className="drawer__body">
          {visible.length === 0 ? (
            <p className="empty">Nothing recorded here yet. Entries appear as soon as the chain confirms them.</p>
          ) : (
            <ol className="ledgerlist">
              {visible
                .slice()
                .reverse()
                .map((row) => (
                  <li key={`${row.sequence}-${row.kind}`} className={`ledgerrow ledgerrow--${ledgerKindOf(row.kind)}`}>
                    <span className="ledgerrow__turn">{row.turn > 0 ? `T${row.turn}` : '—'}</span>
                    <span className="ledgerrow__main">
                      <span className="ledgerrow__kind">{KIND_LABELS[row.kind] ?? actionLabel(row.kind)}</span>
                      <span className="ledgerrow__text">{row.text}</span>
                    </span>
                    <span
                      className={`ledgerrow__delta${row.deltaYocto > 0n ? ' is-gain' : row.deltaYocto < 0n ? ' is-cost' : ''}`}
                    >
                      {crDelta(row.deltaYocto)} Cr
                    </span>
                    <span className="ledgerrow__src">
                      #{row.sequence}
                      {row.block ? ` · block ${row.block.toLocaleString('en-US')}` : ''}
                      {row.revision ? ` · r${row.revision}` : ''}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </div>
        <p className="drawer__foot">
          <span className="mono">{stationAccount}</span>
          <span>
            Revision {revision} · owner epoch {epoch}
            {blockHeight ? ` · read at block ${blockHeight.toLocaleString('en-US')}` : ''}
          </span>
          <span>1 Cr = 0.001 NEAR. Deltas are changes to the operating treasury.</span>
        </p>
      </aside>
    </>
  )
}

function countFor(rows: LedgerRow[], filter: LedgerFilter): number {
  if (filter === 'all') return rows.length
  return rows.filter((row) => ledgerKindOf(row.kind) === filter).length
}

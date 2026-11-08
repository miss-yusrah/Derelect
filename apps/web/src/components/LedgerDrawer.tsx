import { useMemo, useState } from 'react'
import { formatSignedCredits, formatCredits } from '@derelict/game-model'
import {
  ledgerKindOf,
  actionLabel,
  type LedgerFilter,
  type LedgerRow,
} from '../lib/state'

export interface LedgerDrawerProps {
  open: boolean
  onClose: () => void
  rows: LedgerRow[]
  stationAccount: string
}

const FILTERS: Array<{ id: LedgerFilter; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'actions', label: 'ACTIONS' },
  { id: 'money', label: 'MONEY' },
  { id: 'ownership', label: 'OWNERSHIP' },
]

export function LedgerDrawer({ open, onClose, rows, stationAccount }: LedgerDrawerProps) {
  const [filter, setFilter] = useState<LedgerFilter>('all')

  const visible = useMemo(() => {
    return rows.filter((row) => filter === 'all' || ledgerKindOf(row.kind) === filter)
  }, [rows, filter])

  if (!open) return null
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Station ledger">
        <div className="drawer__head">
          <div>
            <div className="drawer__title">LEDGER</div>
            <div className="drawer__subtitle">
              Every money and turn event on {stationAccount} — deltas to operating funds, tx block heights, and
              each entry's source.
            </div>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close ledger" style={{ marginLeft: 'auto' }}>
            ✕
          </button>
        </div>
        <div className="drawer__filters" role="tablist" aria-label="Ledger filters">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={filter === entry.id}
              className={`btn btn--small${filter === entry.id ? ' btn--primary' : ''}`}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
              <span className="subcount">{countFor(rows, entry.id)}</span>
            </button>
          ))}
        </div>
        <div className="drawer__body">
          {visible.length == 0 ? (
            <div className="log-empty">Nothing recorded here yet.</div>
          ) : (
            <ol className="ledgerlist">
              {visible.slice().reverse().map((row) => {
                const kindColor =
                  ledgerKindOf(row.kind) === 'actions'
                    ? 'var(--orange)'
                    : ledgerKindOf(row.kind) === 'ownership'
                      ? 'var(--green)'
                      : 'var(--ink-3)'
                return (
                  <li key={`${row.source}-${row.sequence}`}>
                    <span className="turncell" style={{ fontFamily: 'var(--font-mono)', color: kindColor }}>
                      T{Math.max(row.turn, 0)}
                    </span>
                    <span className="kind">
                      {actionLabel(row.kind)}
                      <span style={{ display: 'block', fontSize: 9.5, color: 'var(--ink-3)' }}>
                        {row.kind}
                      </span>
                    </span>
                    <span className="text">{row.text}</span>
                    <span className={`delta ${row.deltaYocto > 0n ? 'pos' : row.deltaYocto < 0n ? 'neg' : ''}`}>
                      {row.deltaYocto === 0n ? '±0 Cr' : formatSignedCredits(row.deltaYocto) + ' Cr'}
                    </span>
                    <span className="src">
                      {row.source === 'model' ? (
                        'local model hist entry ' + row.sequence
                      ) : (
                        <>
                          ledger #{row.sequence}
                          <span style={{ display: 'block', color: 'var(--ink-3)' }}>
                            block {row.block ?? '—'}
                            {row.revision ? ` · r${row.revision}` : ''}
                          </span>
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </aside>
    </>
  )
}

function countFor(rows: LedgerRow[], filter: LedgerFilter): number {
  if (filter === 'all') return rows.length
  return rows.filter((row) => ledgerKindOf(row.kind) === filter).length
}

/** Total listing price for buyer-facing copy (already formatted credits). */
export function listingPriceCredits(value: bigint): string {
  return `${formatCredits(value)} Cr`
}

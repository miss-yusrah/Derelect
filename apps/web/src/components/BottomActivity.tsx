import type { LedgerRow } from '../lib/state'
import { CAMPAIGN_TURNS, formatSignedCredits } from '@derelict/game-model'
import { actionLabel } from '../lib/state'
import { IconLedger } from './icons'

export interface BottomActivityProps {
  events: LedgerRow[]
  /** 1-based next turn (or CAMPAIGN_TURNS+1 when complete). */
  currentTurn: number
  source: 'model' | 'chain'
  onOpenLedger: () => void
}

const VISIBLE_ROWS = 6

export function BottomActivity({ events, currentTurn, source, onOpenLedger }: BottomActivityProps) {
  const recent = events.slice(0, VISIBLE_ROWS)
  const sourceStamp =
    source === 'model' ? ('SOURCE: LOCAL MODEL' as const) : `SOURCE: CONTRACT get_ledger()`

  return (
    <div className="shell__bottom" aria-label="Mission activity">
      <section className="logpane">
        <div className="logpane__head">
          <IconLedger size={15} />
          MISSION LOG
          <span className="source-stamp">{sourceStamp}</span>
          <span className="spacer" />
          <button className="btn btn--small btn--quiet" onClick={onOpenLedger}>
            Full ledger
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="log-empty">No events yet. Play a turn to fill the log.</div>
        ) : (
          <ul className="loglist">
            {recent.map((row) => (
              <li key={`${row.source}-${row.sequence}-${row.kind}`}>
                <span className="turncell">T{Math.max(row.turn, 0)}</span>
                <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  {actionLabel(row.kind).toUpperCase()}
                </span>
                <span className="text" title={row.text}>
                  {row.text}
                </span>
                <span className="refs" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      color:
                        row.deltaYocto > 0n
                          ? 'var(--green)'
                          : row.deltaYocto < 0n
                            ? 'var(--red)'
                            : 'var(--ink-3)',
                    }}
                  >
                    {row.deltaYocto === 0n ? '±0 Cr' : formatSignedCredits(row.deltaYocto) + ' Cr'}
                  </span>
                  <span
                    className="source"
                    title={`Entry ${row.sequence} of the ${row.source === 'model' ? 'local model history' : 'contract ledger'}`}
                  >
                    {row.source === 'model' ? 'MODEL' : `LEDGER #${row.sequence}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="timelines">
        <div className="timelines__head">
          MISSION TIMELINE
          <span className="value">
            {Math.min(currentTurn - 1, CAMPAIGN_TURNS)} / {CAMPAIGN_TURNS}
          </span>
          <span style={{ color: 'var(--ink-3)', fontSize: 11, fontWeight: 400 }}>
            FUTURE TURNS STAY EMPTY — NO PRE-LABELS
          </span>
        </div>
        <ol className="timeline-circles" aria-label="Turns">
          {Array.from({ length: CAMPAIGN_TURNS }, (_, i) => {
            const turn = i + 1
            const played = turn < currentTurn
            const isCurrent = turn === currentTurn
            const fill = played ? 'var(--green)' : 'none'
            const ring = isCurrent ? 'var(--orange)' : played ? 'var(--green)' : 'var(--line)'
            const glyphColor = played ? '#101416' : isCurrent ? 'var(--orange)' : 'var(--ink-3)'
            return (
              <li
                key={turn}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Turn ${turn}${played ? ' — played' : isCurrent ? ' — current' : ' — future, empty'}`}
              >
                <svg width="34" height="34" viewBox="0 0 34 34">
                  <circle
                    cx="17"
                    cy="17"
                    r="15"
                    fill={fill}
                    stroke={ring}
                    strokeWidth={isCurrent ? 2 : 1.4}
                  />
                  {isCurrent ? (
                    <circle cx="17" cy="17" r="11" fill="none" stroke="var(--bg)" strokeWidth="1" opacity="0.4" />
                  ) : null}
                  <text
                    x="17"
                    y="21.5"
                    textAnchor="middle"
                    fontSize="12"
                    fill={glyphColor}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {turn}
                  </text>
                </svg>
                {turn < CAMPAIGN_TURNS ? <span className="future-line" /> : null}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

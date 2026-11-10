import type { LedgerRow } from '../lib/state'
import { CAMPAIGN_TURNS, formatSignedCredits } from '@derelict/game-model'
import { actionLabel } from '../lib/state'
import { IconLedger } from './icons'

export interface BottomActivityProps {
  events: LedgerRow[]
  /** 1-based next turn (or CAMPAIGN_TURNS+1 when complete). */
  currentTurn: number
  onOpenLedger: () => void
}

const VISIBLE_ROWS = 4

export function BottomActivity({ events, currentTurn, onOpenLedger }: BottomActivityProps) {
  const recent = events.slice(-VISIBLE_ROWS).reverse()
  const sourceStamp = 'SOURCE: CONTRACT get_ledger()'

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
            {recent.map((row) => {
              const deltaClass =
                row.deltaYocto > 0n ? 'pos' : row.deltaYocto < 0n ? 'neg' : ''
              return (
                <li className="logrow" key={`${row.sequence}-${row.kind}`}>
                  <span className="logrow__turn">T{Math.max(row.turn, 0)}</span>
                  <span className="logrow__kind">{actionLabel(row.kind)}</span>
                  <span className="logrow__text" title={row.text}>
                    {row.text}
                  </span>
                  <span className={`logrow__delta ${deltaClass}`}>
                    {row.deltaYocto === 0n ? '±0' : formatSignedCredits(row.deltaYocto)}
                    <span className="logrow__cr"> Cr</span>
                  </span>
                  <span className="logrow__src" title={`Entry ${row.sequence} of the contract ledger`}>
                    {`LEDGER #${row.sequence}`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="timelines">
        <div className="timelines__head">
          MISSION TIMELINE
          <span className="value">
            {Math.min(currentTurn - 1, CAMPAIGN_TURNS)} / {CAMPAIGN_TURNS}
          </span>
          <span className="timelines__note">future turns are not pre-labelled</span>
        </div>
        <ol className="turnstrip" aria-label="Turns">
          {Array.from({ length: CAMPAIGN_TURNS }, (_, i) => {
            const turn = i + 1
            const played = turn < currentTurn
            const isCurrent = turn === currentTurn
            const state = played ? 'done' : isCurrent ? 'now' : 'next'
            return (
              <li
                key={turn}
                className={`turnstrip__cell turnstrip__cell--${state}`}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Turn ${turn}${played ? ' — played' : isCurrent ? ' — current' : ' — future, empty'}`}
              >
                {turn}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

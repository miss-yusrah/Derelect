import { CAMPAIGN_TURNS } from '@derelict/game-model'
import { ACTION_NAMES, ACTION_ORDER, type ActionKey } from '../lib/actionDeck'
import { crDelta } from '../lib/format'
import type { LedgerRow } from '../lib/state'
import { ActionIcon } from './icons'

export interface TurnTrackProps {
  rows: LedgerRow[]
  /** 1-based next turn (CAMPAIGN_TURNS + 1 once complete). */
  turn: number
  complete: boolean
  /** A turn is signed and waiting for the chain. */
  pending: boolean
  /** The viewer commands this station ("Your move" vs "Captain's move"). */
  viewerIsCaptain: boolean
  /** Ledger rows after this sequence were confirmed in this session: their stamp lands. */
  newAfterSequence?: number | null
  /** Hold the stamp until a ship arrival has played. */
  stampDelayMs?: number
}

interface PlayedTurn {
  kind: ActionKey
  deltaYocto: bigint
  sequence: number
  block: number | null
  repaired: boolean
}

const PLAYABLE = new Set<string>(ACTION_ORDER)

/** The action confirmed for each turn, read from the station's ledger. */
export function playedTurns(rows: LedgerRow[]): Map<number, PlayedTurn> {
  const byTurn = new Map<number, PlayedTurn>()
  for (const row of rows) {
    if (PLAYABLE.has(row.kind) && !byTurn.has(row.turn)) {
      byTurn.set(row.turn, {
        kind: row.kind as ActionKey,
        deltaYocto: row.deltaYocto,
        sequence: row.sequence,
        block: row.block,
        repaired: false,
      })
    }
  }
  for (const row of rows) {
    const played = byTurn.get(row.turn)
    if (row.kind === 'repairEffect' && played) played.repaired = true
  }
  return byTurn
}

/** Six slots: confirmed turns carry their stamp, the current one waits for your move. */
export function TurnTrack({
  rows,
  turn,
  complete,
  pending,
  viewerIsCaptain,
  newAfterSequence = null,
  stampDelayMs = 0,
}: TurnTrackProps) {
  const nowLabel = viewerIsCaptain ? 'Your move' : 'Captain’s move'
  const played = playedTurns(rows)
  return (
    <ol className="track" aria-label={`Turn ${Math.min(turn, CAMPAIGN_TURNS)} of ${CAMPAIGN_TURNS}`}>
      {Array.from({ length: CAMPAIGN_TURNS }, (_, i) => {
        const n = i + 1
        const entry = played.get(n)
        const isNow = !complete && n === turn
        const state = entry ? 'done' : isNow ? (pending ? 'pending' : 'now') : n < turn ? 'skipped' : 'next'
        const fresh = entry !== undefined && newAfterSequence !== null && entry.sequence > newAfterSequence
        const name = entry ? ACTION_NAMES[entry.kind].title : ''
        const label = entry
          ? `Turn ${n}: ${name}, ${crDelta(entry.deltaYocto)} credits${entry.repaired ? ', repair landed' : ''}`
          : isNow
            ? `Turn ${n}: ${pending ? 'signed, waiting for the chain' : nowLabel.toLowerCase()}`
            : `Turn ${n}: ${state === 'skipped' ? 'no action recorded' : 'not played yet'}`
        return (
          <li
            key={n}
            className={`track__slot track__slot--${state}`}
            aria-current={isNow ? 'step' : undefined}
            aria-label={label}
            title={entry ? `${label}${entry.block ? ` · block ${entry.block}` : ''}` : label}
          >
            <span className="track__num" aria-hidden="true">
              {n}
            </span>
            {entry ? (
              <span
                className={`track__stamp${fresh ? ' track__stamp--fresh' : ''}`}
                style={fresh ? { animationDelay: `${stampDelayMs}ms` } : undefined}
                aria-hidden="true"
              >
                <ActionIcon kind={entry.kind} size={14} />
                <span className="track__name">{ACTION_NAMES[entry.kind].short}</span>
                <span className={`track__delta${entry.deltaYocto > 0n ? ' is-gain' : entry.deltaYocto < 0n ? ' is-cost' : ''}`}>
                  {crDelta(entry.deltaYocto)}
                </span>
              </span>
            ) : isNow ? (
              <span className="track__now" aria-hidden="true">
                {pending ? 'Signing' : nowLabel}
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

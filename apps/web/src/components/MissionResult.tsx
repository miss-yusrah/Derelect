import { CAMPAIGN_TURNS, HULL_CAPACITY } from '@derelict/game-model'
import { ACTION_NAMES } from '../lib/actionDeck'
import { cr, crDelta, near } from '../lib/format'
import type { GameSnapshot, LedgerRow } from '../lib/state'
import { ActionIcon, IconClose } from './icons'
import { playedTurns } from './TurnTrack'
import { useDialogFocus } from './primitives'

export interface MissionResultProps {
  snapshot: GameSnapshot
  events: LedgerRow[]
  walletAccount: string | null
  onClose: () => void
  onLaunch: () => void
}

/** The campaign's closing paper: verdict, score, and the six stamped turns. */
export function MissionResult({ snapshot, events, walletAccount, onClose, onLaunch }: MissionResultProps) {
  const outcome = snapshot.outcome
  const panelRef = useDialogFocus<HTMLDivElement>(outcome.complete, onClose)
  if (!outcome.complete) return null

  const success = outcome.success
  const derived = [
    ...(snapshot.hull < 1 ? ['the hull was destroyed'] : []),
    ...(snapshot.served < 3 ? ['fewer than 3 ships were served'] : []),
  ]
  const reasonText = (
    outcome.reason ?? (derived.length > 0 ? `Lost: ${derived.join(' and ')}` : 'Six turns complete')
  ).replace(/\.?\s*$/, '.')
  const played = playedTurns(events)

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="dialog result"
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="iconbtn dialog__close" onClick={onClose} aria-label="Close results">
          <IconClose size={16} />
        </button>
        <span className={`result__stamp ${success ? 'result__stamp--won' : 'result__stamp--lost'}`}>
          {success ? 'Salvage successful' : 'Station lost'}
        </span>
        <h2 className="result__score" id="result-title">
          {cr(snapshot.operatingYocto)}
          <span className="result__unit">Cr</span>
          <span className="visually-hidden"> final treasury</span>
        </h2>
        <p className="result__reason">
          Left in the treasury, and your score ({near(snapshot.operatingYocto)} testnet NEAR). {reasonText}{' '}
          {snapshot.served} {snapshot.served === 1 ? 'ship' : 'ships'} served, hull {snapshot.hull}/{HULL_CAPACITY}.
        </p>

        <ol className="result__turns" aria-label="Turn by turn">
          {Array.from({ length: CAMPAIGN_TURNS }, (_, i) => {
            const entry = played.get(i + 1)
            return (
              <li key={i} className={entry ? undefined : 'is-empty'}>
                <span className="result__turn">T{i + 1}</span>
                {entry ? (
                  <>
                    <ActionIcon kind={entry.kind} size={16} />
                    <span className="result__action">
                      {ACTION_NAMES[entry.kind].title}
                      {entry.repaired ? <span className="result__aside"> · repair landed</span> : null}
                    </span>
                    <span
                      className={`result__delta${entry.deltaYocto > 0n ? ' is-gain' : entry.deltaYocto < 0n ? ' is-cost' : ''}`}
                    >
                      {crDelta(entry.deltaYocto)} Cr
                    </span>
                  </>
                ) : (
                  <span className="result__action">No move recorded</span>
                )}
              </li>
            )
          })}
        </ol>


        <div className="dialog__actions">
          <button className="btn btn--primary" onClick={onLaunch}>
            {walletAccount ? 'Launch a new station' : 'Play your own run'}
          </button>
          <button className="btn btn--outline" onClick={onClose}>
            Back to the station
          </button>
        </div>
      </div>
    </div>
  )
}

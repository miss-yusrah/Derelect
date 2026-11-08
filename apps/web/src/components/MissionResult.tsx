import { formatCredits } from '@derelict/game-model'
import { CREDIT } from '@derelict/game-model'
import type { GameSnapshot, LedgerRow } from '../lib/state'
import { actionLabel } from '../lib/state'
import { GAMEPLAY_KINDS } from '../lib/state'

export interface MissionResultProps {
  snapshot: GameSnapshot
  events: LedgerRow[]
  source: 'model' | 'chain'
  walletAccount: string | null
  onNewPracticeRun: () => void
  onClose: () => void
}

export function MissionResult({
  snapshot,
  events,
  source,
  walletAccount,
  onNewPracticeRun,
  onClose,
}: MissionResultProps) {
  const outcome = snapshot.outcome
  if (!outcome.complete) return null

  const success = outcome.success
  const derived = [
    ...(snapshot.hull < 1 ? ['Failed: hull destroyed'] : []),
    ...(snapshot.served < 3 ? ['Failed: fewer than 3 ships served'] : []),
  ]
  const reasonText = outcome.reason ?? (derived.length > 0 ? derived.join(' · ') : 'Campaign complete')

  const score = formatCredits(snapshot.operatingYocto)

  const history = turnTable(events)

  return (
    <div className="result-scrim" role="dialog" aria-label="Mission result">
      <div className="result">
        <div className={`result__header ${success ? 'result__header--win' : 'result__header--fail'}`}>
          {success ? 'SALVAGE SUCCESSFUL' : 'STATION RECLAIMED BY RUST'}
        </div>
        <div className="result__reason" role="status">
          REASON: {reasonText}
          <span style={{ color: 'var(--ink-3)' }}>
            {' '}
            — {snapshot.served} ships served · hull {snapshot.hull} / 3 · captain {walletAccount ?? snapshot.owner} ·{' '}
            {source === 'model' ? 'practice ledger' : 'chain ledger'}
          </span>
        </div>

        <div className="result__scorelabel">FINAL OPERATING TREASURY (THE SCORE)</div>
        <div className="result__score">
          {score}
          <span className="unit"> Cr</span>
          <span style={{ fontSize: 16, color: 'var(--ink-3)', letterSpacing: '0.08em', marginLeft: 18 }}>
            = {crToNear(snapshot.operatingYocto)} testnet NEAR
          </span>
        </div>

        <div className="result__table">
          <h3>SIX-TURN ACTION HISTORY</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>TURN</th>
                <th>ACTION</th>
                <th>OPERATING Δ</th>
                <th>KIND</th>
                <th>SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map((row, index) => (
                <tr key={`${row.kind}-${index}`}>
                  <td className="num">T{row.turn}</td>
                  <td style={{ color: 'var(--ink)' }}>{row.text}</td>
                  <td className={`delta ${row.deltaYocto > 0n ? 'pos' : row.deltaYocto < 0n ? 'neg' : ''}`}>
                    {row.deltaYocto === 0n ? '±0.000' : formatCredits(row.deltaYocto)}
                  </td>
                  <td className="num">{row.kind}</td>
                  <td className="num">{row.source === 'model' ? 'model' : `ledger#${row.sequence}`}</td>
                </tr>
              ))}
              {history.rows.length === 0 ? <tr><td className="num" colSpan={5}>No actions were played.</td></tr> : null}
            </tbody>
          </table>
          {history.missed.length > 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8 }}>
              Operated turns pushed to sale liquidity: {history.missed.join(', ')}.
            </div>
          ) : null}
          <h3>WHY THE SCORE IS THE TREASURY</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
            The operating bucket is real station money: docking fees collected
            from uncashed visitor escrow, minus every refuel and repair reserve.
            The reserve is protected — if the supplier never claims it never
            enters the score, and a purchase price never funds operations.
          </p>
        </div>

        <div className="result__actions">
          {source === 'model' ? (
            <button className="btn btn--primary" onClick={onNewPracticeRun}>
              New practice run
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              Back to bridge
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function crToNear(yoctoValue: bigint): string {
  const whole = yoctoValue / CREDIT
  return `${whole}.000`
}

interface TurnRow {
  turn: number
  kind: string
  text: string
  deltaYocto: bigint
  source: 'model' | 'chain'
  sequence: number
}

function turnTable(rows: LedgerRow[]): { rows: TurnRow[]; missed: number[] } {
  const rowsByTurn = new Map<number, TurnRow>()
  for (const row of rows) {
    if (!GAMEPLAY_KINDS.has(row.kind) || row.kind === 'repairEffect') continue
    const current = rowsByTurn.get(row.turn)
    const entry: TurnRow = {
      turn: row.turn,
      kind: row.kind,
      text: actionKindText(row.kind),
      deltaYocto: row.deltaYocto,
      source: row.source,
      sequence: row.sequence,
    }
    // First action per turn wins (repairEffect and action share a turn).
    if (!current || (current.source !== row.source && row.source === 'chain')) {
      rowsByTurn.set(row.turn, entry)
    }
  }
  const list = Array.from(rowsByTurn.values()).sort((a, b) => a.turn - b.turn)
  const covered = new Set(list.map((row) => row.turn))
  const missed: number[] = []
  for (let turn = 1; turn <= 6; turn++) {
    if (!covered.has(turn)) missed.push(turn)
  }
  return { rows: list, missed }
}

function actionKindText(kind: string): string {
  return actionLabel(kind)
}

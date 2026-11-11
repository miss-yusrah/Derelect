import { IconClose } from './icons'
import { useDialogFocus } from './primitives'

export interface HowItWorksProps {
  open: boolean
  onClose: () => void
}

const FAUCET_URL = 'https://near-faucet.io/'

const ACTIONS: Array<[string, string]> = [
  ['Standard docking', '1 fuel → +3 credits (+5 with an upgraded dock)'],
  ['Heavy docking', '2 fuel and 1 hull → +8 credits'],
  ['Refuel', '2 credits per unit, 1–4 units'],
  ['Commission repair', '4 credits set aside → +2 hull after your next action'],
  ['Upgrade dock', '4 credits, once → standard docking pays 5'],
  ['Wait', 'nothing happens; the turn passes'],
]

/** What DERELICT is and how to play it; opens on a first visit and from the header. */
export function HowItWorks({ open, onClose }: HowItWorksProps) {
  const panelRef = useDialogFocus<HTMLDivElement>(open, onClose)
  if (!open) return null

  return (
    <div className="overlay-scrim" onClick={onClose}>
      <div
        className="overlay guide"
        role="dialog"
        aria-modal="true"
        aria-label="How DERELICT works"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay__head">
          <span className="guide__title">HOW IT WORKS</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close guide" style={{ marginLeft: 'auto' }}>
            <IconClose size={14} />
          </button>
        </div>

        <div className="guide__body">
          <p className="guide__lead">
            DERELICT is a six-turn strategy game. You run a battered orbital salvage station: dock visiting
            ships to earn credits, manage fuel and hull damage, and finish with the biggest treasury you can.
            The station is an NFT on NEAR that <strong>owns its own money</strong> — sell it and the buyer
            inherits its fuel, its damage, its treasury and its unpaid repair bill.
          </p>

          <section className="guide__section">
            <h3>Get started</h3>
            <ol>
              <li>
                <strong>Connect a wallet</strong> — any NEAR testnet wallet. Testnet NEAR is free from{' '}
                <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                  near-faucet.io
                </a>
                .
              </li>
              <li>
                <strong>Launch your station</strong> — about 6.1 testnet NEAR. Most of it stays with the
                station for its contract storage; 10 credits become its opening funds.
              </li>
              <li>
                <strong>Fund visitor traffic</strong> — prepay the 12 visiting ships (78 credits, refundable
                if unused). Ships can only dock when they have prepaid.
              </li>
              <li>
                <strong>Play six turns</strong> from the decision rail on the right.
              </li>
            </ol>
          </section>

          <section className="guide__section">
            <h3>Each turn</h3>
            <p>
              Pick one action, read its preview, then <strong>Confirm</strong> and approve it in your wallet. The
              station updates when the chain confirms the move — until then it shows as pending. A rejected
              action costs nothing and does not use a turn.
            </p>
            <table className="guide__table">
              <tbody>
                {ACTIONS.map(([name, effect]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>{effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="guide__section">
            <h3>Winning</h3>
            <ul>
              <li>
                Your <strong>score</strong> is the station's operating funds after turn 6.
              </li>
              <li>
                You <strong>win</strong> if the hull is still at least 1 and you served at least 3 ships.
              </li>
              <li>Heavy ships pay the most but wear the hull down; a repair takes a turn to land.</li>
            </ul>
            <details className="guide__hint">
              <summary>Need a hint?</summary>
              The best possible score is 27 credits: standard docking, heavy docking, commission a repair,
              refuel 3 units, then two heavy dockings.
            </details>
          </section>

          <section className="guide__section">
            <h3>Reading the screen</h3>
            <ul>
              <li>
                <strong>Left</strong> — fuel, hull, operating funds (your score), money held for a repair, and
                who owns the station.
              </li>
              <li>
                <strong>Centre</strong> — your station. The reactor, dock and repair bay labels show their live
                state.
              </li>
              <li>
                <strong>Right</strong> — the actions you can take this turn, with a preview of each.
              </li>
              <li>
                <strong>Bottom</strong> — the mission log, read straight from the station's on-chain ledger.
              </li>
            </ul>
          </section>

          <section className="guide__section">
            <h3>Selling and buying</h3>
            <p>
              Use <strong>Inspect / List</strong> to put your station up for sale at your price, or to buy one
              that is listed. The buyer takes command with everything the station carries; the price goes to
              the seller, and a repair supplier is still paid by the station.
            </p>
          </section>
        </div>

        <div className="guide__foot">
          <button className="btn btn--primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

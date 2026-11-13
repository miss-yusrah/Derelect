import { useEffect, useState } from 'react'
import { CAMPAIGN_TURNS, CREDIT, REPAIR_COST } from '@derelict/game-model'
import { creditsOf } from '../lib/contract'
import { cr, near, shortAccount, stationSlug } from '../lib/format'
import type { GameSnapshot } from '../lib/state'
import { IconClose, IconWarning } from './icons'
import { useDialogFocus } from './primitives'

export interface InspectBuyProps {
  open: boolean
  onClose: () => void
  snapshot: GameSnapshot
  /** Connected wallet account, or null when read-only. */
  walletAccount: string | null
  confirmBusy: boolean
  alert: { text: string; tone: 'error' | 'info' } | null
  onDismissAlert: () => void
  onConnectWallet: () => void
  onListForSale: (priceCredits: number) => void
  onUnlist: () => void
  onBuy: () => void
}

/** The station's papers and its market: everything a buyer inherits, and the sale itself. */
export function InspectBuy({
  open,
  onClose,
  snapshot,
  walletAccount,
  confirmBusy,
  alert,
  onDismissAlert,
  onConnectWallet,
  onListForSale,
  onUnlist,
  onBuy,
}: InspectBuyProps) {
  const [priceDraft, setPriceDraft] = useState('')
  const panelRef = useDialogFocus<HTMLDivElement>(open, onClose)

  const isCaptain = walletAccount !== null && snapshot.owner === walletAccount
  const listed = snapshot.listingYocto !== null

  useEffect(() => {
    setPriceDraft(snapshot.listingYocto !== null ? creditsOf(snapshot.listingYocto).toString() : '')
  }, [snapshot.listingYocto])

  if (!open) return null

  const price = parseCreditsDraft(priceDraft)
  const repairHeld = snapshot.repairDueTurn !== null && !snapshot.repairPaid

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="dialog dialog--split"
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__head">
          <div>
            <h2 className="dialog-title" id="market-title">
              Station papers · {stationSlug(snapshot.stationAccount)}
            </h2>
            <p className="dialog-sub">Everything below transfers to the next captain with the station.</p>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close station papers">
            <IconClose size={16} />
          </button>
        </div>

        <div className="dialog__body">
          <div>
            {alert ? (
              <div className={`inline-alert inline-alert--${alert.tone}`} role="alert">
                <IconWarning size={15} />
                <span>{alert.text}</span>
                <button className="iconbtn" onClick={onDismissAlert} aria-label="Dismiss">
                  <IconClose size={14} />
                </button>
              </div>
            ) : null}

            <table className="facts">
              <tbody>
                <tr>
                  <th scope="row">Captain</th>
                  <td className="mono">{snapshot.owner}</td>
                </tr>
                <tr>
                  <th scope="row">Campaign</th>
                  <td>
                    {snapshot.complete
                      ? `Complete — ${snapshot.outcome.reason ?? 'scored'}`
                      : `Turn ${Math.min(snapshot.turn, CAMPAIGN_TURNS)} of ${CAMPAIGN_TURNS}`}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Fuel · hull · ships</th>
                  <td>
                    {snapshot.fuel} fuel · {snapshot.hull} hull · {snapshot.served}{' '}
                    {snapshot.served === 1 ? 'ship' : 'ships'} served
                  </td>
                </tr>
                <tr>
                  <th scope="row">Treasury (the score)</th>
                  <td>{cr(snapshot.operatingYocto)} Cr</td>
                </tr>
                <tr>
                  <th scope="row">Repair reserve</th>
                  <td>
                    {repairHeld ? (
                      <>
                        {cr(REPAIR_COST)} Cr owed to <span className="mono">{shortAccount(snapshot.repairSupplier ?? '', 30)}</span>
                      </>
                    ) : (
                      'None'
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Visitor escrow</th>
                  <td>{cr(snapshot.visitorsEscrowYocto)} Cr, refundable to the ships that prepaid</td>
                </tr>
                <tr>
                  <th scope="row">Seller proceeds owed</th>
                  <td>
                    {snapshot.sellerReceivableYocto === 0n
                      ? 'None'
                      : `${cr(snapshot.sellerReceivableYocto)} Cr to the previous captain`}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="dialog__callout">
              The price goes to the seller and never into the treasury. Fuel, damage, prepaid ships and every debt stay
              with the station.
            </p>
            <p className="dialog__fine">
              Revision {snapshot.revision} · owner epoch {snapshot.epoch} · a purchase is rejected if the station
              changes after you opened this.
            </p>
          </div>

          <div className="dialog__side">
            {isCaptain ? (
              <>
                <h3 className="side-title">{listed ? 'Your listing' : 'List for sale'}</h3>
                <label className="field__label" htmlFor="listing-price">
                  Price in credits
                </label>
                <div className="input-unit">
                  <input
                    id="listing-price"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={priceDraft}
                    placeholder="e.g. 20"
                    onChange={(e) => setPriceDraft(e.target.value)}
                  />
                  <span>Cr</span>
                </div>
                <p className="side-note">
                  {price > 0
                    ? `Buyers pay exactly ${price} Cr (${near(BigInt(price) * CREDIT)} NEAR), all of it to you.`
                    : 'Enter a whole number of credits.'}
                </p>
                <button
                  className={`btn btn--primary btn--block${confirmBusy ? ' is-busy' : ''}`}
                  aria-busy={confirmBusy}
                  disabled={!(price > 0) || confirmBusy}
                  onClick={() => onListForSale(price)}
                >
                  {confirmBusy ? 'Approve in your wallet…' : listed ? `Change price to ${price} Cr` : 'List for sale'}
                </button>
                {listed ? (
                  <button className="btn btn--ghost btn--block" disabled={confirmBusy} onClick={onUnlist}>
                    Remove listing
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <h3 className="side-title">{listed ? 'For sale' : 'Not for sale'}</h3>
                {snapshot.listingYocto !== null ? (
                  <>
                    <p className="side-price">
                      {cr(snapshot.listingYocto)}
                      <span className="side-price__unit">Cr</span>
                      <span className="side-price__near">{near(snapshot.listingYocto)} testnet NEAR</span>
                    </p>
                    <button
                      className={`btn btn--primary btn--block${confirmBusy ? ' is-busy' : ''}`}
                      aria-busy={confirmBusy}
                      disabled={confirmBusy || snapshot.owner === walletAccount}
                      onClick={() => {
                        if (walletAccount === null) onConnectWallet()
                        else onBuy()
                      }}
                    >
                      {confirmBusy ? 'Approve in your wallet…' : listingBuyLabel(listed, walletAccount)}
                    </button>
                  </>
                ) : null}
                <p className="side-note">
                  {!listed
                    ? 'Only the captain can list this station for sale. You can launch your own from Stations.'
                    : walletAccount === null
                      ? 'Connect a NEAR testnet wallet to buy. You pay exactly the listed price.'
                      : snapshot.owner === walletAccount
                        ? 'You already command this station.'
                        : 'You take command the moment the chain confirms the purchase.'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function listingBuyLabel(listed: boolean, walletAccount: string | null): string {
  if (!listed) return 'No active listing'
  if (walletAccount === null) return 'Connect wallet to buy'
  return 'Buy this station'
}

/** Whole-number credits -> number, or 0 when malformed. */
function parseCreditsDraft(draft: string): number {
  const trimmed = draft.trim().replace(/[,_\s]/g, '')
  if (!/^\d+$/.test(trimmed)) return 0
  return Number(trimmed)
}

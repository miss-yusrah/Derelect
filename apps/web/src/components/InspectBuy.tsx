import { useEffect, useState } from 'react'
import { formatCredits, CAMPAIGN_TURNS, CREDIT } from '@derelict/game-model'
import { creditsOf } from '../lib/contract'
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
    if (snapshot.listingYocto !== null) {
      setPriceDraft(creditsOf(snapshot.listingYocto).toString())
    } else {
      setPriceDraft('')
    }
  }, [snapshot.listingYocto])

  if (!open) return null

  const price = parseCreditsDraft(priceDraft)

  return (
    <div className="overlay-scrim" onClick={onClose}>
      <div
        className="overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Inspect and buy this station"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay__head">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '0.08em' }}>
            STATION INSPECTION
          </span>
          <span className="overlay__note">
            TESTNET MARKET // REV r{snapshot.revision} // EPOCH e{snapshot.epoch}
          </span>
          <button className="iconbtn" onClick={onClose} aria-label="Close inspector" style={{ marginLeft: 'auto' }}>
            <IconClose size={14} />
          </button>
        </div>

        <div className="overlay__body">
          <div>
            {alert ? (
              <div
                className={`alert${alert.tone === 'error' ? ' alert--error' : ' alert--info'}`}
                role="alert"
                style={{ marginBottom: 12 }}
              >
                <IconWarning size={14} style={{ marginTop: 2, flex: 'none' }} />
                <span>{alert.text}</span>
                <button className="iconbtn alert__close" onClick={onDismissAlert} aria-label="Dismiss">
                  <IconClose size={13} />
                </button>
              </div>
            ) : null}

            <table className="inspect-table">
              <caption>INSPECTION — EVERYTHING THIS NFT CARRIES AT THE CURRENT REVISION</caption>
              <tbody>
                <tr>
                  <th scope="row">Captain (NFT owner)</th>
                  <td>{snapshot.owner}</td>
                </tr>
                <tr>
                  <th scope="row">Campaign turn</th>
                  <td>
                    {Math.min(snapshot.turn, CAMPAIGN_TURNS)} / {CAMPAIGN_TURNS}
                    {snapshot.complete ? ' (complete)' : ''}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Operating funds (the score)</th>
                  <td>{formatCredits(snapshot.operatingYocto)} Cr</td>
                </tr>
                <tr>
                  <th scope="row">Protected repair reserve</th>
                  <td>
                    {snapshot.repairDueTurn !== null && !snapshot.repairPaid
                      ? `${formatCredits(REPAIR_RESERVE)} Cr → ${snapshot.repairSupplier}`
                      : '0.000 Cr empty'}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Visitor escrow (prepaid offers)</th>
                  <td>{formatCredits(snapshot.visitorsEscrowYocto)} Cr — refundable by the paying visitors</td>
                </tr>
                <tr>
                  <th scope="row">Seller proceeds owed</th>
                  <td>
                    {snapshot.sellerReceivableYocto === 0n
                      ? '0.000 Cr'
                      : `${formatCredits(snapshot.sellerReceivableYocto)} Cr owed to the selling captain`}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Outcome at completion</th>
                  <td>
                    {snapshot.outcome.complete
                      ? snapshot.outcome.reason ?? '—'
                      : 'scored after turn 6 on the operating treasury'}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Listing</th>
                  <td>
                    {snapshot.listingYocto === null
                      ? 'not listed'
                      : `${formatCredits(snapshot.listingYocto)} Cr by ${snapshot.owner}`}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="overlay__explicit" role="note" style={{ marginTop: 14 }}>
              <IconWarning size={15} />
              <span>
                The purchase price is paid to the seller and does not fund station operations. Resources, offers,
                repair obligations and every creditor claim survive the sale untouched.
              </span>
            </div>
          </div>

          <div className="overlay__purchase">
            {isCaptain ? (
              <>
                <div className="overlay__price-label">LIST THIS STATION — PRICE IN Cr</div>
                <input
                  aria-label="Listing price in credits"
                  type="number"
                  min={1}
                  step={1}
                  value={priceDraft}
                  placeholder="Price in Cr"
                  onChange={(e) => setPriceDraft(e.target.value)}
                  style={{
                    minHeight: 44,
                    width: '100%',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    padding: '0 10px',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <div className="pane__cost" style={{ fontSize: 11.5 }}>
                  {price > 0
                    ? `Buyers attach exactly ${formatCredits(BigInt(price) * CREDIT)} Cr — every yocto goes to you, none to the station.`
                    : 'Enter a positive whole number of credits.'}
                </div>
                <button
                  className={`btn btn--primary btn--block${confirmBusy ? ' is-busy' : ''}`}
                  aria-busy={confirmBusy}
                  disabled={!(price > 0) || confirmBusy}
                  onClick={() => onListForSale(price)}
                >
                  {confirmBusy ? 'Submitting…' : listed ? `Re-list at ${price} Cr` : 'List for sale'}
                </button>
                {listed ? (
                  <button className="btn btn--danger-ghost btn--block" disabled={confirmBusy} onClick={onUnlist}>
                    Remove listing ({formatCredits(snapshot.listingYocto ?? 0n)} Cr)
                  </button>
                ) : null}
                <div className="pane__note">
                  Any NEAR account can inspect and purchase at this price. The sale transfers command without
                  touching operating funds, offers, or creditor claims.
                </div>
              </>
            ) : (
              <>
                <div className="overlay__price-label">PURCHASE AT THE LISTED PRICE</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26 }}>
                  {snapshot.listingYocto === null ? (
                    '—'
                  ) : (
                    <>
                      {formatCredits(snapshot.listingYocto)} Cr
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', display: 'block' }}>
                        {snapshot.listingYocto.toString()} yoctoNEAR
                      </span>
                    </>
                  )}
                </div>
                <button
                  className={`btn btn--primary btn--block${confirmBusy ? ' is-busy' : ''}`}
                  aria-busy={confirmBusy}
                  disabled={!listed || confirmBusy}
                  onClick={() => {
                    if (walletAccount === null) onConnectWallet()
                    else onBuy()
                  }}
                >
                  {confirmBusy ? 'Submitting…' : listingBuyLabel(listed, walletAccount)}
                </button>
                <div className="pane__note">
                  {walletAccount === null
                    ? 'Connect a NEAR wallet — the purchase transaction attaches the exact listed price and the fresh revision.'
                    : snapshot.owner === walletAccount
                      ? 'You already command this station.'
                      : 'purchase(expected_revision) checks the revision read just now; a stale quote warns and re-arms with the new state.'}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const REPAIR_RESERVE = 4n * CREDIT

function listingBuyLabel(listed: boolean, walletAccount: string | null): string {
  if (!listed) return 'No active listing'
  if (walletAccount === null) return 'Connect wallet to buy'
  return 'Buy with wallet'
}

/** Whole-number credits -> number, or 0 when malformed. */
function parseCreditsDraft(draft: string): number {
  const trimmed = draft.trim().replace(/[,_\s]/g, '')
  if (!/^\d+$/.test(trimmed)) return 0
  return Number(trimmed)
}

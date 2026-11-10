import { useEffect, useState } from 'react'
import { formatCredits } from '@derelict/game-model'
import { STATION_FUNDING_YOCTO } from '../config'
import {
  MAX_STATION_NAME,
  TRAFFIC_ESCROW_YOCTO,
  stationAccountFor,
  stationNameProblem,
  type StationInfo,
} from '../lib/factory'
import { IconClose, IconWarning } from './icons'
import { useDialogFocus } from './primitives'

export type LaunchStep = 'creating' | 'waiting'

export interface LaunchStationProps {
  open: boolean
  onClose: () => void
  walletAccount: string | null
  /** Liquid wallet balance in yoctoNEAR; undefined while loading. */
  balanceYocto: bigint | null | undefined
  /** Stations launched by this wallet; undefined while loading. */
  myStations: StationInfo[] | undefined
  currentStation: string
  suggestedName: string
  step: LaunchStep | null
  busy: boolean
  alert: { text: string; tone: 'error' | 'info' } | null
  onDismissAlert: () => void
  onConnectWallet: () => void
  onLaunch: (name: string) => void
  onOpenStation: (account: string) => void
}

const FAUCET_URL = 'https://near-faucet.io/'
/** Headroom for the gas of the two launch transactions. */
const GAS_HEADROOM_YOCTO = 20_000_000_000_000_000_000_000n
const TOTAL_YOCTO = STATION_FUNDING_YOCTO + TRAFFIC_ESCROW_YOCTO

export function LaunchStation({
  open,
  onClose,
  walletAccount,
  balanceYocto,
  myStations,
  currentStation,
  suggestedName,
  step,
  busy,
  alert,
  onDismissAlert,
  onConnectWallet,
  onLaunch,
  onOpenStation,
}: LaunchStationProps) {
  const [name, setName] = useState(suggestedName)
  const panelRef = useDialogFocus<HTMLDivElement>(open, onClose)

  useEffect(() => {
    if (open) setName(suggestedName)
  }, [open, suggestedName])

  if (!open) return null

  const problem = stationNameProblem(name)
  const shortfall =
    typeof balanceYocto === 'bigint' && balanceYocto < TOTAL_YOCTO + GAS_HEADROOM_YOCTO
  const launching = step !== null

  return (
    <div className="overlay-scrim" onClick={launching ? undefined : onClose}>
      <div
        className="overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Launch your own station"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay__head">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '0.08em' }}>
            LAUNCH YOUR STATION
          </span>
          <span className="overlay__note">FACTORY // NEAR TESTNET</span>
          <button
            className="iconbtn"
            onClick={onClose}
            disabled={launching}
            aria-label="Close launcher"
            style={{ marginLeft: 'auto' }}
          >
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
              <caption>WHAT YOUR WALLET PAYS — EVERY YOCTO STAYS ON CHAIN</caption>
              <tbody>
                <tr>
                  <th scope="row">Station account storage</th>
                  <td>6.000 NEAR — held by the station account for its contract code</td>
                </tr>
                <tr>
                  <th scope="row">Opening operating funds</th>
                  <td>10.000 Cr (0.010 NEAR) — the treasury you play with</td>
                </tr>
                <tr>
                  <th scope="row">Visitor traffic escrow</th>
                  <td>
                    {formatCredits(TRAFFIC_ESCROW_YOCTO)} Cr — 12 prepaid visiting ships; unused escrow stays
                    refundable to you
                  </td>
                </tr>
                <tr>
                  <th scope="row">Total</th>
                  <td>{nearText(TOTAL_YOCTO)} NEAR + gas, in two wallet approvals</td>
                </tr>
              </tbody>
            </table>

            <div className="launch__mine">
              <div className="overlay__price-label">STATIONS YOU LAUNCHED</div>
              {walletAccount === null ? (
                <div className="pane__note">Connect a wallet to see your stations.</div>
              ) : myStations === undefined ? (
                <div className="pane__note">Reading the factory index…</div>
              ) : myStations.length === 0 ? (
                <div className="pane__note">None yet — launch your first station.</div>
              ) : (
                <ul className="launch__list">
                  {myStations.map((info) => (
                    <li key={info.station_account}>
                      <span className="launch__acct">{info.station_account}</span>
                      {info.station_account === currentStation ? (
                        <span className="launch__here">OPEN NOW</span>
                      ) : (
                        <button
                          className="btn btn--small btn--quiet"
                          disabled={launching}
                          onClick={() => onOpenStation(info.station_account)}
                        >
                          Open
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="overlay__purchase">
            {walletAccount === null ? (
              <>
                <div className="overlay__price-label">CONNECT TO LAUNCH</div>
                <button className="btn btn--primary btn--block" onClick={onConnectWallet}>
                  Connect wallet
                </button>
                <div className="pane__note">
                  Use any NEAR testnet wallet. Your account becomes the station's captain (NFT owner).
                </div>
              </>
            ) : (
              <>
                <div className="overlay__price-label">STATION NAME</div>
                <input
                  aria-label="Station name"
                  className="launch__name"
                  value={name}
                  maxLength={MAX_STATION_NAME}
                  disabled={launching}
                  spellCheck={false}
                  onChange={(e) => setName(e.target.value.toLowerCase())}
                />
                <div className="pane__cost" style={{ fontSize: 11.5 }}>
                  {problem ?? stationAccountFor(name)}
                </div>
                <div className="pane__note">
                  Captain <span style={{ fontFamily: 'var(--font-mono)' }}>{walletAccount}</span>
                  {' · '}balance{' '}
                  {balanceYocto === undefined ? '…' : balanceYocto === null ? '—' : `${nearText(balanceYocto)} NEAR`}
                </div>
                {shortfall ? (
                  <div className="pane__error">
                    <IconWarning size={14} />
                    <span>
                      You need about {nearText(TOTAL_YOCTO + GAS_HEADROOM_YOCTO)} testnet NEAR.{' '}
                      <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                        Get free testnet NEAR
                      </a>
                      , then reopen this panel.
                    </span>
                  </div>
                ) : null}
                <button
                  className={`btn btn--primary btn--block${launching ? ' is-busy' : ''}`}
                  disabled={problem !== null || shortfall || launching || busy}
                  onClick={() => onLaunch(name)}
                >
                  {step === 'creating'
                    ? 'Approve in your wallet…'
                    : step === 'waiting'
                      ? 'Bringing the station online…'
                      : 'Launch station'}
                </button>
                <div className="pane__note">
                  1. <span style={{ fontFamily: 'var(--font-mono)' }}>create_station</span> on the factory
                  creates a keyless station account owned by you. 2. Fund the 12 visiting ships, then play turn 1.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function nearText(yoctoValue: bigint): string {
  return (Number(yoctoValue / 1_000_000_000_000_000_000n) / 1_000_000).toFixed(3)
}

import { useEffect, useState } from 'react'
import { cr } from '../lib/format'
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
  /** Station on screen, or null when none is open. */
  currentStation: string | null
  suggestedName: string
  step: LaunchStep | null
  busy: boolean
  alert: { text: string; tone: 'error' | 'info' } | null
  onDismissAlert: () => void
  onConnectWallet: () => void
  /** Resolves true when `<name>.<factory>` is still free on chain. */
  onCheckName: (name: string) => Promise<boolean>
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
  onCheckName,
  onLaunch,
  onOpenStation,
}: LaunchStationProps) {
  const [name, setName] = useState(suggestedName)
  const panelRef = useDialogFocus<HTMLDivElement>(open, onClose)

  useEffect(() => {
    if (open) setName(suggestedName)
  }, [open, suggestedName])

  // Checked while typing so the Launch click goes straight to the wallet.
  const [availability, setAvailability] = useState<'checking' | 'free' | 'taken' | 'unknown'>('checking')
  useEffect(() => {
    if (!open || stationNameProblem(name) !== null) return
    let cancelled = false
    setAvailability('checking')
    const timer = window.setTimeout(() => {
      onCheckName(name)
        .then((free) => !cancelled && setAvailability(free ? 'free' : 'taken'))
        .catch(() => !cancelled && setAvailability('unknown'))
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, name, onCheckName])

  if (!open) return null

  const problem = stationNameProblem(name)
  const nameReady = problem === null && availability === 'free'
  const shortfall =
    typeof balanceYocto === 'bigint' && balanceYocto < TOTAL_YOCTO + GAS_HEADROOM_YOCTO
  const launching = step !== null

  return (
    <div className="scrim" onClick={launching ? undefined : onClose}>
      <div
        className="dialog dialog--split"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stations-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__head">
          <div>
            <h2 className="dialog-title" id="stations-title">
              Stations
            </h2>
            <p className="dialog-sub">Open one you command, or launch a new one from the station factory.</p>
          </div>
          <button className="iconbtn" onClick={onClose} disabled={launching} aria-label="Close stations">
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

            <h3 className="side-title">Your stations</h3>
            {walletAccount === null ? (
              <p className="side-note">Connect a wallet to see the stations you command.</p>
            ) : myStations === undefined ? (
              <p className="side-note">Reading your stations from the chain…</p>
            ) : myStations.length === 0 ? (
              <p className="side-note">None yet. Launch your first one.</p>
            ) : (
              <ul className="stationlist">
                {myStations.map((info) => (
                  <li key={info.station_account}>
                    <span className="stationlist__name">{info.station_account.split('.')[0]}</span>
                    <span className="stationlist__acct mono">{info.station_account}</span>
                    {info.station_account === currentStation ? (
                      <span className="stationlist__here">Open now</span>
                    ) : (
                      <button
                        className="btn btn--outline btn--small"
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

            <h3 className="side-title">What a launch costs</h3>
            <table className="facts">
              <tbody>
                <tr>
                  <th scope="row">Station storage</th>
                  <td>6 NEAR, held by the station account for its contract</td>
                </tr>
                <tr>
                  <th scope="row">Opening treasury</th>
                  <td>10 Cr (0.010 NEAR), the money you play with</td>
                </tr>
                <tr>
                  <th scope="row">Visiting ships</th>
                  <td>{cr(TRAFFIC_ESCROW_YOCTO)} Cr prepaid for 12 ships; unused escrow stays refundable</td>
                </tr>
                <tr>
                  <th scope="row">Total</th>
                  <td>
                    {nearText(TOTAL_YOCTO)} NEAR plus gas, in two approvals
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="dialog__side">
            {walletAccount === null ? (
              <>
                <h3 className="side-title">Launch a station</h3>
                <p className="side-note">Any NEAR testnet wallet works. Your account becomes the station’s captain.</p>
                <button className="btn btn--primary btn--block" onClick={onConnectWallet}>
                  Connect wallet
                </button>
              </>
            ) : (
              <>
                <h3 className="side-title">Launch a station</h3>
                <label className="field__label" htmlFor="station-name">
                  Station name
                </label>
                <input
                  id="station-name"
                  className="input"
                  value={name}
                  maxLength={MAX_STATION_NAME}
                  disabled={launching}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value.toLowerCase())}
                />
                <p
                  className={`side-note${problem || availability === 'taken' ? ' side-note--bad' : ''}`}
                  aria-live="polite"
                >
                  {problem ??
                    (availability === 'taken'
                      ? 'That name is taken. Try another.'
                      : availability === 'unknown'
                        ? 'Could not check this name. Edit it to retry.'
                        : availability === 'checking'
                          ? 'Checking the name…'
                          : <>Free: <span className="mono">{stationAccountFor(name)}</span></>)}
                </p>
                <p className="side-note">
                  Wallet balance:{' '}
                  {balanceYocto === undefined ? '…' : balanceYocto === null ? 'unknown' : `${nearText(balanceYocto)} NEAR`}
                </p>
                {shortfall ? (
                  <p className="side-note side-note--bad">
                    You need about {nearText(TOTAL_YOCTO + GAS_HEADROOM_YOCTO)} testnet NEAR.{' '}
                    <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                      Get free testnet NEAR
                    </a>
                    , then reopen this panel.
                  </p>
                ) : null}
                <button
                  className={`btn btn--primary btn--block${launching ? ' is-busy' : ''}`}
                  disabled={!nameReady || shortfall || launching || busy}
                  onClick={() => onLaunch(name)}
                >
                  {step === 'creating'
                    ? 'Approve in your wallet…'
                    : step === 'waiting'
                      ? 'Bringing the station online…'
                      : 'Launch station'}
                </button>
                <p className="side-note">
                  Approval 1 creates the station; you become its captain. Approval 2, on the station screen, prepays its
                  12 visiting ships.
                </p>
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

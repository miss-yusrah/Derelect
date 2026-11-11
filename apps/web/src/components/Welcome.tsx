import type { StationInfo } from '../lib/factory'

export interface WelcomeProps {
  walletAccount: string | null
  /** False until a previous wallet session has been restored (or ruled out). */
  walletChecked: boolean
  connecting: boolean
  nearMissing: boolean
  /** Stations the connected wallet owns; undefined while loading. */
  ownedStations: StationInfo[] | undefined
  message: { text: string; tone: 'error' | 'info' } | null
  onConnectWallet: () => void
  onDisconnectWallet: () => void
  onOpenLaunch: () => void
}

const FAUCET_URL = 'https://near-faucet.io/'

/** Shown when no station is open: connect, then open or launch your own. */
export function Welcome({
  walletAccount,
  walletChecked,
  connecting,
  nearMissing,
  ownedStations,
  message,
  onConnectWallet,
  onDisconnectWallet,
  onOpenLaunch,
}: WelcomeProps) {
  return (
    <div className="boot">
      <div className="boot__panel">
        <div className="boot__wordmark">DERELICT</div>
        <div className="boot__status">{statusLine(walletAccount, walletChecked, ownedStations)}</div>
        {walletAccount ? <div className="boot__station">{walletAccount}</div> : null}
        {nearMissing ? (
          <div className="boot__error">Wallet library unavailable. Reload the page or check your connection.</div>
        ) : null}
        {message ? <div className="boot__error">{message.text}</div> : null}

        <div className="boot__actions">
          {!walletChecked ? null : walletAccount === null ? (
            <button className="btn btn--primary" onClick={onConnectWallet} disabled={connecting || nearMissing}>
              {connecting ? 'Connecting…' : 'Connect wallet'}
            </button>
          ) : ownedStations !== undefined && ownedStations.length === 0 ? (
            <>
              <button className="btn btn--primary" onClick={onOpenLaunch}>
                Launch your station
              </button>
              <button className="btn btn--quiet" onClick={onDisconnectWallet}>
                Disconnect
              </button>
            </>
          ) : null}
        </div>

        <div className="boot__note">
          {walletAccount === null ? (
            <>
              Connect your own NEAR testnet wallet. Need testnet NEAR?{' '}
              <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                near-faucet.io
              </a>
            </>
          ) : (
            'NEAR testnet · no simulation · every action is signed by your wallet'
          )}
        </div>
      </div>
    </div>
  )
}

function statusLine(
  walletAccount: string | null,
  walletChecked: boolean,
  ownedStations: StationInfo[] | undefined,
): string {
  if (!walletChecked) return 'CHECKING WALLET SESSION…'
  if (walletAccount === null) return 'CONNECT A WALLET TO COMMAND YOUR STATION'
  if (ownedStations === undefined) return 'FINDING YOUR STATIONS…'
  if (ownedStations.length === 0) return 'YOU DO NOT COMMAND A STATION YET'
  return `OPENING ${ownedStations[0].station_account}…`
}

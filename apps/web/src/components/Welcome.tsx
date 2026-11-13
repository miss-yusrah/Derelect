import type { ReactNode } from 'react'
import type { StationInfo } from '../lib/factory'
import stationArt from '../assets/station-illustration.webp'

const FAUCET_URL = 'https://near-faucet.io/'

/** Full-screen title page: the station on the right, the words and one next step on the left. */
function Splash({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <div className="splash">
      <div className="splash__art" aria-hidden="true">
        <img src={stationArt} alt="" width={896} height={679} />
      </div>
      <main className="splash__copy">
        <h1 className="splash__mark">Derelict</h1>
        {children}
        <p className="splash__foot">{footer}</p>
      </main>
    </div>
  )
}

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
  onOpenGuide: () => void
}

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
  onOpenGuide,
}: WelcomeProps) {
  const status = statusLine(walletAccount, walletChecked, ownedStations)
  return (
    <Splash
      footer={
        <>
          NEAR testnet · every move is signed by your wallet · need testnet NEAR?{' '}
          <a href={FAUCET_URL} target="_blank" rel="noreferrer">
            near-faucet.io
          </a>
        </>
      }
    >
      <p className="splash__tagline">Buy the station. Inherit its condition and commitments.</p>
      <p className="splash__pitch">
        A six-turn strategy game. Run a battered salvage station, dock ships for credits, keep the hull in one piece,
        and finish with the biggest treasury. The station is a NEAR NFT that owns its own money — sell it, and the buyer
        inherits its fuel, its damage and its debts.
      </p>

      <ol className="splash__steps" aria-label="How a run goes">
        <li className={walletAccount ? 'is-done' : 'is-now'}>
          <strong>Connect a wallet</strong>
          <span>Any NEAR testnet wallet</span>
        </li>
        <li className={walletAccount && ownedStations?.length === 0 ? 'is-now' : undefined}>
          <strong>Launch a station</strong>
          <span>About 6.1 testnet NEAR, two approvals</span>
        </li>
        <li>
          <strong>Play six turns</strong>
          <span>Score is the treasury after turn 6</span>
        </li>
      </ol>

      {status ? (
        <p className="splash__status" role="status">
          {status}
          {walletAccount ? <span className="splash__account">{walletAccount}</span> : null}
        </p>
      ) : null}
      {nearMissing ? (
        <p className="splash__error" role="alert">
          The wallet library did not load. Reload the page or check your connection.
        </p>
      ) : null}
      {message ? (
        <p className="splash__error" role="alert">
          {message.text}
        </p>
      ) : null}

      <div className="splash__actions">
        {!walletChecked ? null : walletAccount === null ? (
          <button className="btn btn--primary btn--large" onClick={onConnectWallet} disabled={connecting || nearMissing}>
            {connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        ) : ownedStations !== undefined && ownedStations.length === 0 ? (
          <>
            <button className="btn btn--primary btn--large" onClick={onOpenLaunch}>
              Launch your station
            </button>
            <button className="btn btn--ghost btn--large" onClick={onDisconnectWallet}>
              Disconnect
            </button>
          </>
        ) : null}
        <button className="btn btn--outline btn--large" onClick={onOpenGuide}>
          How to play
        </button>
      </div>
    </Splash>
  )
}

function statusLine(
  walletAccount: string | null,
  walletChecked: boolean,
  ownedStations: StationInfo[] | undefined,
): string | null {
  if (!walletChecked) return 'Checking for a wallet session…'
  if (walletAccount === null) return null
  if (ownedStations === undefined) return 'Finding your stations…'
  if (ownedStations.length === 0) return 'You do not command a station yet.'
  return `Opening ${ownedStations[0].station_account}…`
}

/* ------------------------------------------------------------------ */

export interface BootScreenProps {
  stationAccount: string
  error: string | null
  walletAccount: string | null
  onRetry: () => void
  onBack: () => void
}

/** Reading a station before the bridge can show it. */
export function BootScreen({ stationAccount, error, walletAccount, onRetry, onBack }: BootScreenProps) {
  return (
    <Splash footer="NEAR testnet · read straight from the station contract">
      <p className="splash__tagline">{error ? 'This station could not be read.' : 'Reading the station from testnet…'}</p>
      <p className="splash__status" role="status">
        <span className="splash__account">{stationAccount}</span>
      </p>
      {error ? (
        <p className="splash__error" role="alert">
          {/does not exist/i.test(error)
            ? 'There is no station at this address. Check the link, or open one of your own stations.'
            : error}
        </p>
      ) : (
        <div className="splash__loading" aria-hidden="true">
          <span />
        </div>
      )}
      {error ? (
        <div className="splash__actions">
          <button className="btn btn--outline btn--large" onClick={onRetry}>
            Try again
          </button>
          <button className="btn btn--ghost btn--large" onClick={onBack}>
            {walletAccount ? 'My stations' : 'Back'}
          </button>
        </div>
      ) : null}
    </Splash>
  )
}

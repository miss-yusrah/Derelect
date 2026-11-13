import { useEffect, useRef, useState, type ReactNode } from 'react'
import { stationSlug, shortAccount } from '../lib/format'
import { IconCheck, IconChevron, IconCopy, IconHelp, IconLedger, IconOrbit, IconTag } from './icons'

function useDismiss(open: boolean, close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, close])
  return rootRef
}

export interface ConnectionChip {
  variant: 'testnet' | 'disconnected' | 'pending'
  label: string
  detail?: string
}

export interface HeaderProps {
  stationAccount: string
  /** The turn track, rendered in the centre of the bar. */
  track: ReactNode
  /** The station is listed for sale (badges the Market button). */
  listed: boolean
  connectionChip: ConnectionChip
  walletAccount: string | null
  connecting: boolean
  onConnectWallet: () => void
  onDisconnectWallet: () => void
  onOpenLedger: () => void
  onOpenMarket: () => void
  onOpenStations: () => void
  onOpenGuide: () => void
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function Header({
  stationAccount,
  track,
  listed,
  connectionChip,
  walletAccount,
  connecting,
  onConnectWallet,
  onDisconnectWallet,
  onOpenLedger,
  onOpenMarket,
  onOpenStations,
  onOpenGuide,
}: HeaderProps) {
  const [copied, setCopied] = useState(false)

  return (
    <header className="topbar">
      <div className="topbar__id">
        <span className="wordmark">Derelict</span>
        <button
          className="station-id"
          title={`Copy ${stationAccount}`}
          aria-label={`Station ${stationAccount}. Copy account`}
          onClick={async () => {
            if (await copyText(stationAccount)) {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            }
          }}
        >
          <span className="station-id__name">
            <span className="station-id__full">{stationSlug(stationAccount)}</span>
            <span className="station-id__short" aria-hidden="true">
              {shortAccount(stationSlug(stationAccount), 15)}
            </span>
          </span>
          {copied ? <IconCheck size={13} className="station-id__icon is-ok" /> : <IconCopy size={13} className="station-id__icon" />}
        </button>
      </div>

      <div className="topbar__track">{track}</div>

      <nav className="topbar__nav" aria-label="Station">
        <button className="navbtn" onClick={onOpenLedger} aria-label="Ledger" title="Ledger: every entry on chain">
          <IconLedger size={16} />
          <span>Ledger</span>
        </button>
        <button
          className="navbtn"
          onClick={onOpenMarket}
          aria-label={listed ? 'Market, station for sale' : 'Market'}
          title="Market: station papers, list or buy"
        >
          <IconTag size={16} />
          <span>Market</span>
          {listed ? <span className="navbtn__badge">For sale</span> : null}
        </button>
        <button className="navbtn" onClick={onOpenStations} aria-label="Stations" title="Stations: open or launch">
          <IconOrbit size={16} />
          <span>Stations</span>
        </button>
        <button className="navbtn navbtn--icon" onClick={onOpenGuide} aria-label="How to play" title="How to play">
          <IconHelp size={17} />
        </button>
      </nav>
      <NavMenu
        listed={listed}
        onOpenLedger={onOpenLedger}
        onOpenMarket={onOpenMarket}
        onOpenStations={onOpenStations}
        onOpenGuide={onOpenGuide}
      />

      <div className="topbar__wallet">
        {walletAccount ? (
          <AccountMenu chip={connectionChip} walletAccount={walletAccount} onDisconnectWallet={onDisconnectWallet} />
        ) : (
          <button className="btn btn--outline btn--small" onClick={onConnectWallet} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        )}
      </div>
    </header>
  )
}

/** Phones: the four destinations fold into one menu so the station name keeps its room. */
function NavMenu({
  listed,
  onOpenLedger,
  onOpenMarket,
  onOpenStations,
  onOpenGuide,
}: Pick<HeaderProps, 'listed' | 'onOpenLedger' | 'onOpenMarket' | 'onOpenStations' | 'onOpenGuide'>) {
  const [open, setOpen] = useState(false)
  const rootRef = useDismiss(open, () => setOpen(false))
  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="navmenu acct" ref={rootRef}>
      <button
        type="button"
        className={`acct__btn${open ? ' acct__btn--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Menu
        <IconChevron size={12} className="acct__caret" />
      </button>
      {open ? (
        <div className="acct__menu" role="menu" aria-label="Station">
          <button type="button" role="menuitem" className="acct__item" onClick={go(onOpenLedger)}>
            <IconLedger size={15} /> Ledger
          </button>
          <button type="button" role="menuitem" className="acct__item" onClick={go(onOpenMarket)}>
            <IconTag size={15} /> Market{listed ? ' · for sale' : ''}
          </button>
          <button type="button" role="menuitem" className="acct__item" onClick={go(onOpenStations)}>
            <IconOrbit size={15} /> Stations
          </button>
          <button type="button" role="menuitem" className="acct__item" onClick={go(onOpenGuide)}>
            <IconHelp size={15} /> How to play
          </button>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------
   Connected wallet menu: identity, copy, and disconnect.
   ------------------------------------------------------------------ */

function AccountMenu({
  chip,
  walletAccount,
  onDisconnectWallet,
}: {
  chip: ConnectionChip
  walletAccount: string
  onDisconnectWallet: () => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  const status =
    chip.variant === 'pending'
      ? 'Waiting for the chain'
      : chip.variant === 'disconnected'
        ? 'Connection problem'
        : 'Connected · NEAR testnet'

  return (
    <div className="acct" ref={rootRef}>
      <button
        type="button"
        className={`acct__btn${open ? ' acct__btn--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={walletAccount}
      >
        <span className={`acct__dot acct__dot--${chip.variant}`} aria-hidden="true" />
        <span className="acct__label">{shortAccount(walletAccount, 17)}</span>
        <IconChevron size={12} className="acct__caret" />
      </button>
      {open ? (
        <div className="acct__menu" role="menu" aria-label="Wallet">
          <span className="acct__status">{status}</span>
          <span className="acct__account">{walletAccount}</span>
          {chip.detail && chip.detail !== walletAccount ? <span className="acct__detail">{chip.detail}</span> : null}
          <button
            type="button"
            role="menuitem"
            className="acct__item"
            onClick={async () => {
              if (await copyText(walletAccount)) {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1200)
              }
            }}
          >
            {copied ? <IconCheck size={14} className="is-ok" /> : <IconCopy size={14} />}
            {copied ? 'Copied' : 'Copy account'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="acct__item acct__item--danger"
            onClick={() => {
              setOpen(false)
              onDisconnectWallet()
            }}
          >
            Disconnect wallet
          </button>
        </div>
      ) : null}
    </div>
  )
}

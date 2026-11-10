import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevron, IconCopy, IconHazard } from './icons'
import { CAMPAIGN_TURNS } from '@derelict/game-model'

export interface HeaderProps {
  stationAccount: string
  stationName: string
  playedTurns: number
  connectionChip: {
    variant: 'testnet' | 'disconnected' | 'pending'
    label: string
    detail?: string
  }
  walletAccount: string | null
  connecting: boolean
  onConnectWallet: () => void
  onDisconnectWallet: () => void
  onOpenInspect: () => void
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
  stationName,
  playedTurns,
  connectionChip,
  walletAccount,
  connecting,
  onConnectWallet,
  onDisconnectWallet,
  onOpenInspect,
}: HeaderProps) {
  const [copied, setCopied] = useState(false)

  return (
    <header className="hdr">
      <div className="wordmark">
        DERELICT
        <IconHazard size={17} style={{ color: 'var(--orange)' }} />
      </div>
      <div className="hdr__divider" />
      <div className="hdr__station">
        <span className="hdr__station-label">Station account</span>
        <button
          className="hdr__station-id"
          title={`Copy ${stationAccount} to clipboard`}
          aria-label={`Copy station account ${stationAccount}`}
          onClick={async () => {
            if (await copyText(stationAccount)) {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            }
          }}
        >
          <span>{stationAccount}</span>
          {copied ? (
            <IconCheck size={13} style={{ color: 'var(--green)' }} />
          ) : (
            <IconCopy size={13} style={{ color: 'var(--ink-3)' }} />
          )}
        </button>
      </div>
      <div className="hdr__spacer" />
      <div className="hdr__turn" title={`${stationName} progress`}>
        <span className="hdr__turn-label">TURN</span>
        <span className="hdr__turn-value">
          {Math.min(playedTurns, CAMPAIGN_TURNS)}{' '}
          <span className="num">/ {CAMPAIGN_TURNS}</span>
        </span>
      </div>
      <div className="hdr__divider" />

      {walletAccount ? (
        <AccountMenu
          chip={connectionChip}
          walletAccount={walletAccount}
          onDisconnectWallet={onDisconnectWallet}
        />
      ) : (
        <>
          <span className="hdr__connection" title={connectionChip.detail ?? connectionChip.label}>
            <span
              className={`acct__dot acct__dot--${connectionChip.variant}`}
              aria-hidden="true"
            />
            {connectionChip.variant === 'pending' ? 'CONNECTING' : 'READ-ONLY'}
          </span>
          <button
            className="btn btn--primary btn--small"
            onClick={onConnectWallet}
            disabled={connecting}
          >
            {connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        </>
      )}

      <button className="btn btn--small btn--quiet" onClick={onOpenInspect}>
        Inspect / List
      </button>
    </header>
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
  chip: HeaderProps['connectionChip']
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

  const buttonLabel = chip.variant === 'pending' ? 'SUBMITTING…' : shortAccount(walletAccount)
  const statusWord =
    chip.variant === 'pending' ? 'TRANSACTION PENDING' : 'TESTNET — WALLET CONNECTED'

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
        <span className="acct__label">{buttonLabel}</span>
        <IconChevron size={12} className="acct__caret" />
      </button>
      {open ? (
        <div className="acct__menu" role="menu" aria-label="Connection and account">
          <span className="acct__menu-k">STATUS</span>
          <span className="acct__menu-v">{statusWord}</span>
          <span className="acct__menu-detail">{walletAccount}</span>
          {chip.detail && chip.detail !== walletAccount ? (
            <span className="acct__menu-detail">{chip.detail}</span>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="acct__menu-copy"
            onClick={async () => {
              if (await copyText(walletAccount)) {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1200)
              }
            }}
          >
            {copied ? (
              <IconCheck size={13} style={{ color: 'var(--green)' }} />
            ) : (
              <IconCopy size={13} />
            )}
            {copied ? 'Copied' : `Copy ${walletAccount}`}
          </button>
          <button
            type="button"
            role="menuitem"
            className="btn btn--danger-ghost btn--block"
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

function shortAccount(account: string): string {
  if (account.length <= 18) return account
  return `${account.slice(0, 9)}…${account.slice(-5)}`
}

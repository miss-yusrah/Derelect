import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevron, IconCopy, IconHazard, IconLock } from './icons'
import { CAMPAIGN_TURNS } from '@derelict/game-model'

export interface HeaderProps {
  stationAccount: string
  stationName: string
  playedTurns: number
  mode: 'practice' | 'testnet'
  connectionChip: {
    variant: 'practice' | 'testnet' | 'disconnected' | 'pending'
    active: boolean
    label: string
    detail?: string
    locked?: boolean
  }
  onModePractice: () => void
  onModeTestnet: () => void
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
  mode,
  connectionChip,
  onModePractice,
  onModeTestnet,
  onOpenInspect,
}: HeaderProps) {
  const [copied, setCopied] = useState(false)
  const testnetLocked =
    mode === 'testnet' && connectionChip.variant !== 'testnet' && connectionChip.variant !== 'pending'

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

      <div className="modeswitch" role="radiogroup" aria-label="Play mode">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'practice'}
          className={`modeswitch__seg${mode === 'practice' ? ' modeswitch__seg--on' : ''}`}
          onClick={onModePractice}
          title="Local model-only run. Free, instant, no wallet. Saves to this browser."
        >
          Practice
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'testnet'}
          className={`modeswitch__seg${mode === 'testnet' ? ' modeswitch__seg--on' : ''}`}
          onClick={onModeTestnet}
          title="Live NEAR testnet station. Actions require your wallet signature."
        >
          Testnet
          {testnetLocked ? <IconLock size={12} className="modeswitch__lock" /> : null}
        </button>
      </div>

      <AccountMenu chip={connectionChip} mode={mode} />

      <button className="btn btn--small" onClick={onOpenInspect}>
        List Station
      </button>
    </header>
  )
}

/* ------------------------------------------------------------------
   Account / connection menu — the wallet session lives here instead
   of competing with the mode switch as a second status chip.
   ------------------------------------------------------------------ */

function AccountMenu({ chip, mode }: { chip: HeaderProps['connectionChip']; mode: HeaderProps['mode'] }) {
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

  const buttonLabel =
    chip.variant === 'testnet'
      ? shortAccount(chip.detail ?? '')
      : chip.variant === 'pending'
        ? 'SUBMITTING…'
        : chip.variant === 'disconnected'
          ? 'NO SESSION'
          : 'LOCAL'

  const statusWord =
    chip.variant === 'practice'
      ? 'PRACTICE — LOCAL MODEL'
      : chip.variant === 'pending'
        ? 'TRANSACTION PENDING'
        : chip.variant === 'disconnected'
          ? mode === 'testnet'
            ? 'TESTNET — DISCONNECTED'
            : 'DISCONNECTED'
          : 'TESTNET — WALLET CONNECTED'

  const account = chip.variant === 'testnet' ? chip.detail ?? null : null

  return (
    <div className="acct" ref={rootRef}>
      <button
        type="button"
        className={`acct__btn${open ? ' acct__btn--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={chip.detail ?? chip.label}
      >
        <span className={`acct__dot acct__dot--${chip.variant}`} aria-hidden="true" />
        <span className="acct__label">{buttonLabel}</span>
        <IconChevron size={12} className="acct__caret" />
      </button>
      {open ? (
        <div className="acct__menu" role="menu" aria-label="Connection and account">
          <span className="acct__menu-k">STATUS</span>
          <span className="acct__menu-v">{statusWord}</span>
          {chip.detail ? <span className="acct__menu-detail">{chip.detail}</span> : null}
          {account ? (
            <button
              type="button"
              role="menuitem"
              className="acct__menu-copy"
              onClick={async () => {
                if (await copyText(account)) {
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
              {copied ? 'Copied' : `Copy ${account}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function shortAccount(account: string): string {
  if (account.length <= 18) return account
  return `${account.slice(0, 9)}…${account.slice(-5)}`
}

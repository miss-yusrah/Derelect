import { useState } from 'react'
import { IconCheck, IconCopy, IconHazard } from './icons'
import { Chip } from './primitives'
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
      <Chip {...connectionChip} />
      <Chip
        variant="practice"
        active={mode === 'practice'}
        label="PRACTICE"
        title="Local model-only run. Free, instant, no wallet. Saves to this browser."
        onClick={onModePractice}
      />
      <Chip
        variant="testnet"
        active={mode === 'testnet'}
        label="TESTNET"
        locked={mode === 'testnet' && connectionChip.variant !== 'testnet'}
        title="Live NEAR testnet station. Actions require your wallet signature."
        onClick={onModeTestnet}
      />
      <button className="btn btn--small" onClick={onOpenInspect}>
        List Station
      </button>
    </header>
  )
}

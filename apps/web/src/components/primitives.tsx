import type { ReactNode } from 'react'
import { formatCredits, formatSignedCredits } from '@derelict/game-model'
import { IconClose, IconHazard } from './icons'

/** Re-exported for menu-consistent money formats. */
export function credits(yoctoValue: bigint): string {
  return `${formatCredits(yoctoValue)}`
}

export function signedCredits(yoctoValue: bigint): string {
  return formatSignedCredits(yoctoValue)
}

export function creditDeltaClass(yoctoValue: bigint): string {
  return yoctoValue > 0n ? 'pos' : yoctoValue < 0n ? 'neg' : ''
}

/* ------------------------------------------------------------------ */

export interface ChipProps {
  variant: 'practice' | 'testnet' | 'disconnected' | 'pending'
  active?: boolean
  label: string
  detail?: string
  title?: string
  onClick?: () => void
  locked?: boolean
}

export function Chip({ variant, active = false, label, detail, title, onClick, locked }: ChipProps) {
  const cls =
    variant === 'practice'
      ? 'chip chip--practice'
      : variant === 'testnet'
        ? 'chip chip--testnet'
        : variant === 'pending'
          ? 'chip chip--pending'
          : 'chip chip--disconnected'
  const interactive = Boolean(onClick)
  const Tag = interactive ? 'button' : 'span'
  return (
    <Tag
      className={`${cls}${active ? ' chip--active' : ''}${interactive ? ' chip--click' : ''}`}
      onClick={onClick}
      title={title ?? detail}
      disabled={interactive ? undefined : undefined}
    >
      {variant === 'pending' ? <span className="chip__dot" /> : null}
      {variant === 'disconnected' && locked ? <span className="chip__lock" /> : null}
      <span>{label}</span>
      {detail ? (
        <span style={{ color: 'var(--ink-3)', fontWeight: 400, letterSpacing: '0.04em' }}>
          {detail}
        </span>
      ) : null}
    </Tag>
  )
}

/* ------------------------------------------------------------------ */

export interface GaugeProps {
  icon: ReactNode
  label: string
  value: string
  cells: number
  cellCount: number
  flashIndex?: number | null
  danger?: boolean
}

export function Gauge({ icon, label, value, cells, cellCount, flashIndex = null, danger }: GaugeProps) {
  return (
    <div className="gauge" role="img" aria-label={`${label} ${value} of ${cellCount}`}>
      <div className="gauge__head">
        {icon}
        <span>{label}</span>
        <span className={`gauge__value${danger ? ' state-red' : ''}`}>
          <span>{value}</span>
          <span style={{ color: 'var(--ink-3)' }}> / {cellCount}</span>
        </span>
      </div>
      <div className="gauge__bar">
        {Array.from({ length: cellCount }, (_, i) => {
          const on = i < cells
          const flashing = flashIndex !== null && i === cells - flashIndex
          const cls = [
            'gauge__cell',
            on ? (danger ? 'gauge__cell--on state-red' : 'gauge__cell--on') : '',
            on && flashing ? 'gauge__cell--flash' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return <span key={i} className={cls} />
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export interface StatRowProps {
  icon?: ReactNode
  label: string
  amount: string
  unit?: string
  title?: string
}

export function StatRow({ icon, label, amount, unit, title }: StatRowProps) {
  return (
    <div className="statrow" title={title}>
      <span className="statrow__label">
        {icon}
        {label}
      </span>
      <span className="statrow__amount">
        {amount}
        {unit ? <span className="statrow__unit">{unit}</span> : null}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export type BannerTone = 'error' | 'info' | 'ok' | 'neutral'

export function Banner({
  tone,
  text,
  detail,
  onClose,
}: {
  tone: BannerTone
  text: string
  detail?: string
  onClose?: () => void
}) {
  const toneClass =
    tone === 'error' ? 'canvas__banner--error' : tone === 'info' ? 'canvas__banner--info' : tone === 'ok' ? 'canvas__banner--ok' : ''
  return (
    <div className={`canvas__banner ${toneClass}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone !== 'neutral' ? <IconHazard size={15} className="banner__icon" /> : null}
      <span className="banner__text">
        <strong style={{ fontWeight: 500 }}>{text}</strong>
        {detail ? <div style={{ color: 'var(--ink-3)', marginTop: 2 }}>{detail}</div> : null}
      </span>
      {onClose ? <button className="iconbtn alert__close" onClick={onClose} aria-label="Dismiss message"><IconClose size={13} /></button> : null}
    </div>
  )
}

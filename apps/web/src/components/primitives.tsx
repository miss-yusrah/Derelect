import { useEffect, useRef, type ReactNode } from 'react'
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

/**
 * Dialog behavior shared by the ledger drawer and the inspect/buy overlay:
 * Escape closes, focus moves into the panel on open and back to whatever
 * launched it on close. Presentation-only; no logic changes.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
): React.RefObject<T> {
  const panelRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous && document.body.contains(previous)) previous.focus()
    }
  }, [open])

  return panelRef
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
    <div
      className={`gauge${danger ? ' gauge--danger' : ''}`}
      role="img"
      aria-label={`${label} ${value} of ${cellCount}`}
    >
      <div className="gauge__head">
        {icon}
        <span>{label}</span>
        <span className={`gauge__value${danger ? ' state-red' : ''}`}>
          <span>{value}</span>
          <span style={{ color: 'var(--ink-3)', fontSize: '12px' }}> / {cellCount}</span>
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
  /** Highlights the row as an active obligation (e.g. repair in flight). */
  active?: boolean
  /** Small right-aligned status line under the amount. */
  hint?: string
}

export function StatRow({ icon, label, amount, unit, title, active = false, hint }: StatRowProps) {
  return (
    <div className={`statrow${active ? ' statrow--active' : ''}`} title={title}>
      <span className="statrow__label">
        {icon}
        {label}
      </span>
      <span className="statrow__amount">
        {amount}
        {unit ? <span className="statrow__unit">{unit}</span> : null}
        {hint ? <span className="statrow__hint">{hint}</span> : null}
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

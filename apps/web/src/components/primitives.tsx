import { useEffect, useRef } from 'react'
import { IconCheck, IconClose, IconWarning } from './icons'

/**
 * Dialog behavior shared by the ledger drawer and the overlays: Escape
 * closes, focus moves into the panel on open and back to whatever launched
 * it on close.
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

export interface PipsProps {
  value: number
  max: number
  /** Forecast change from the selected card: spent cells dash out, gained cells dash in. */
  delta?: number
  /** Cells that arrive after the next action (a commissioned repair). */
  later?: number
  tone?: 'normal' | 'low' | 'danger' | 'met'
  /** Spent cells are damage (oxide) rather than spending (neutral). */
  damage?: boolean
}

/** A resource track: one cell per unit of capacity. */
export function Pips({ value, max, delta = 0, later = 0, tone = 'normal', damage = false }: PipsProps) {
  const spendFrom = delta < 0 ? Math.max(value + delta, 0) : value
  const gainTo = delta > 0 ? Math.min(value + delta, max) : value
  const laterTo = Math.min(gainTo + later, max)
  return (
    <span className={`pips pips--${tone}${damage ? ' pips--damage' : ''}`} aria-hidden="true">
      {Array.from({ length: max }, (_, i) => {
        let state = i < value ? 'on' : 'off'
        if (i < value && i >= spendFrom) state = 'spend'
        else if (i >= value && i < gainTo) state = 'gain'
        else if (i >= gainTo && i < laterTo) state = 'later'
        return <span key={i} className={`pip pip--${state}`} />
      })}
    </span>
  )
}

/* ------------------------------------------------------------------ */

export type ToastTone = 'error' | 'info' | 'ok' | 'neutral'

/** A status message over the stage; errors are alerts, the rest are polite. */
export function Toast({
  tone,
  text,
  detail,
  onClose,
}: {
  tone: ToastTone
  text: string
  detail?: string
  onClose?: () => void
}) {
  return (
    <div className={`toast toast--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'ok' ? (
        <IconCheck size={16} className="toast__icon" />
      ) : tone === 'neutral' ? null : (
        <IconWarning size={16} className="toast__icon" />
      )}
      <span className="toast__text">
        <strong>{text}</strong>
        {detail ? <span className="toast__detail">{detail}</span> : null}
      </span>
      {onClose ? (
        <button className="iconbtn toast__close" onClick={onClose} aria-label="Dismiss message">
          <IconClose size={14} />
        </button>
      ) : null}
    </div>
  )
}

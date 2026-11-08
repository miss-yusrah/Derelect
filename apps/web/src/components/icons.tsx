import type { ReactNode, SVGProps } from 'react'

/**
 * Hand-drawn geometric icon set. Color is carried by CSS (currentColor);
 * icons are always paired with a text label so no signal depends on color
 * alone.
 */

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function base(props: IconProps) {
  const { size = 16, ...rest } = props
  return {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  }
}

export function IconFuel(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3h6l1 2v3H5V5l1-2Z" />
      <path d="M7.5 8v9h3V8" />
      <path d="M9 5.5v2" />
      <path d="M14.5 9.5c1.4.3 2-1.2 2-2.3M16.5 7.2V4" />
    </svg>
  )
}

export function IconHull(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 2.5 3.5 5v4.8c0 4 2.7 6.6 6.5 7.7 3.8-1.1 6.5-3.7 6.5-7.7V5L10 2.5Z" />
      <path d="M7 10l2.2 2.2L13.5 8" />
    </svg>
  )
}

export function IconCredits(props: IconProps) {
  return (
    <svg {...base(props)}>
      <ellipse cx="10" cy="6" rx="6.2" ry="2.6" />
      <path d="M3.8 6v4c0 1.4 2.8 2.6 6.2 2.6s6.2-1.2 6.2-2.6V6" />
      <path d="M3.8 10v4c0 1.4 2.8 2.6 6.2 2.6s6.2-1.2 6.2-2.6v-4" />
    </svg>
  )
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4.5" y="8.5" width="11" height="8" rx="1.5" />
      <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
      <path d="M10 11.5v3" />
    </svg>
  )
}

export function IconWrench(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 16.5 11.4 9.1" />
      <path d="M13 5.2a3.4 3.4 0 0 0-1.8 4.5L4 16.9a1.4 1.4 0 0 0 2 2l7.2-7.2a3.4 3.4 0 0 0 4.5-1.8" />
      <path d="M13.5 5.7 14 3.5l2.5-.5.5 2.5-2.2 1.9" />
    </svg>
  )
}

export function IconDock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="9" width="8" height="4" rx="1" />
      <rect x="12.5" y="10" width="5" height="2" rx="1" />
      <path d="M10.5 11h2" />
      <path d="M4.5 6h4M4.5 14h4" />
    </svg>
  )
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 5.8V10l2.8 1.8" />
    </svg>
  )
}

export function IconLedger(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4.5" y="2.5" width="11" height="15" rx="1.5" />
      <path d="M7.5 6h5M7.5 9h5M7.5 12h3" />
    </svg>
  )
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-6A1.5 1.5 0 0 0 4 4.5v6A1.5 1.5 0 0 0 5.5 12H7" />
    </svg>
  )
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
      <path d="M16.8 2.8v3.4h-3.4" />
    </svg>
  )
}

export function IconRefreshUsed(props: IconProps) {
  return <IconRefresh {...props} />
}

export function IconWarning(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 3 2.8 16.5h14.4L10 3Z" />
      <path d="M10 8v4M10 14.4v.2" />
    </svg>
  )
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 10S6 5.2 10 5.2 17.5 10 17.5 10 14 14.8 10 14.8 2.5 10 2.5 10Z" />
      <circle cx="10" cy="10" r="2.4" />
    </svg>
  )
}

export function IconChevron(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 4.5 13.5 10 8 15.5" />
    </svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 10.8 8 15l8-10" />
    </svg>
  )
}

export function IconShip(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12.5c1.5.8 3.4 1.2 7 1.2s5.5-.4 7-1.2l-.8 2.6a2 2 0 0 1-1.9 1.4H5.7a2 2 0 0 1-1.9-1.4L3 12.5Z" />
      <path d="M6.5 12V9.5A3.5 3.5 0 0 1 10 6a3.5 3.5 0 0 1 3.5 3.5V12" />
      <path d="M10 6V3.6" />
    </svg>
  )
}

/** Small "station" hazard mark used as a subtle brand tag. */
export function IconHazard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 16 14 4M6.5 16 16 5.5M4.5 12.5 12.5 3" />
    </svg>
  )
}

export function IconPending(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 4.5h6.5L16 8v7.5H6z" />
      <path d="M12.5 4.5V8H16" />
      <path d="M9 11h3M9 13h4" />
    </svg>
  )
}

export function IconBox(props: IconProps): ReactNode {
  return (
    <svg {...base(props)}>
      <path d="M10 2.8 17 6.2v7.6L10 17.2l-7-3.4V6.2l7-3.4Z" />
      <path d="M3.2 6.3 10 9.7l6.8-3.4M10 9.7v7.3" />
    </svg>
  )
}

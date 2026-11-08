import { useState } from 'react'
import type { GameSnapshot } from '../lib/state'
import { formatCredits } from '@derelict/game-model'
import type { ReactNode } from 'react'

export interface StationCanvasProps {
  snapshot: GameSnapshot
  /** True when the last completed action was a docking (ship at the dock). */
  dockedShip: boolean
  source: 'model' | 'chain'
  spots: {
    standard: number
    heavy: number
  }
  /** Floating message over the canvas (banners from App). */
  banner?: ReactNode
}

type ModuleId = 'reactor' | 'dock' | 'repair' | 'array'

interface ModuleInfo {
  id: ModuleId
  title: string
  label: string
  labelClass: string
}

interface PanelRow {
  k: string
  v: ReactNode
}

const INK = '#E9E5DC'
const DIM = '#7B8784'
const LINE = '#394246'
const SURFACE = '#232B2E'
const SURFACE_2 = '#2C363A'
const ORANGE = '#EE7948'
const GREEN = '#A7C0AA'
const RED = '#C86B59'
const FIELD = '#14191B'

export function StationCanvas({ snapshot, dockedShip, source, spots, banner = null }: StationCanvasProps) {
  const [focus, setFocus] = useState<ModuleId | null>(null)

  const dockDamaged = snapshot.repairDueTurn !== null && !snapshot.repairApplied
  const dockUpgraded = snapshot.upgrade
  const reactorState = snapshot.fuel === 0 ? 'LOW FUEL' : 'ONLINE'
  const reactorClass = snapshot.fuel === 0 ? 'tag-red' : 'tag-ok'
  const repairState = dockDamaged
    ? snapshot.repairPaid
      ? 'COLLECTED'
      : 'QUEUED'
    : null

  const remainingStandard = spots.standard
  const remainingHeavy = spots.heavy

  const panels: Record<ModuleId, ModuleInfo & { rows: PanelRow[] }> = {
    reactor: {
      id: 'reactor',
      title: 'REACTOR',
      label: reactorState,
      labelClass: reactorClass,
      rows: [
        { k: 'Fuel cell', v: `${snapshot.fuel} / 6` },
        { k: 'Refuel cost', v: '2 Cr / unit (1–4 units)' },
        { k: 'Refuel action', v: 'Costs a turn' },
      ],
    },
    dock: {
      id: 'dock',
      title: 'DOCK',
      label: dockDamaged ? 'DAMAGED' : dockUpgraded ? 'UPGRADED' : 'STANDARD',
      labelClass: dockDamaged ? 'tag-red' : dockUpgraded ? 'tag-orange' : 'tag-ok',
      rows: [
        { k: 'Standard fee', v: dockUpgraded ? '5 Cr' : '3 Cr' },
        { k: 'Heavy fee', v: '8 Cr (−1 hull, −2 fuel)' },
        { k: 'Prepaid offers', v: `${remainingStandard} standard · ${remainingHeavy} heavy` },
        { k: 'Fuel to dock', v: 'standard ≥ 1 · heavy ≥ 2' },
      ],
    },
    repair: {
      id: 'repair',
      title: 'REPAIR BAY',
      label: repairState ?? 'STANDBY',
      labelClass: repairState ? 'tag-ok' : 'tag-dim',
      rows: [
        { k: 'Reserve', v: repairState ? '4 Cr (protected)' : '0 Cr' },
        { k: 'Supplier', v: snapshot.repairSupplier ?? '—' },
        { k: 'Hull effect', v: dockDamaged ? `+2 hull after turn ${Math.max(0, snapshot.repairDueTurn ?? 0) - 1} action` : '—' },
      ],
    },
    array: {
      id: 'array',
      title: 'SOLAR ARRAY',
      label: 'PRIMARY',
      labelClass: 'tag-dim',
      rows: [
        { k: 'Role', v: 'Station power / station account' },
        { k: 'Account', v: snapshot.stationAccount },
        { k: 'Epoch', v: `e${snapshot.epoch} · rev ${snapshot.revision}` },
      ],
    },
  }

  const active = focus ? panels[focus] : null

  return (
    <section className="canvas" aria-label="Station modules">
      <div className="canvas__focus">
        <span className="canvas__mode-tag">
          {source === 'model' ? 'MODEL RUN' : 'CHAIN VIEW'} // 1 CR = 10^21 YOCTO // STATION {snapshot.stationAccount.toUpperCase()}
        </span>
      </div>

      {banner}

      <StationSvg
        snapshot={snapshot}
        dockedShip={dockedShip}
        panels={panels}
        focus={focus}
        onFocus={setFocus}
      />

      {active ? (
        <div className="canvas__module-panel">
          <h4>
            {active.title}
            <span className={`tag ${active.labelClass}`}>{active.label}</span>
          </h4>
          {active.rows.map((row) => {
            const isMoney = typeof row.v === 'string' && row.v.endsWith('Cr')
            return (
              <div className="module-panel__row" key={row.k}>
                <span>{row.k}</span>
                <span className="v">{isMoney ? formatAmount(row.v as string) : (row.v as ReactNode)}</span>
              </div>
            )
          })}
        </div>
      ) : null}
      <div className="canvas__note">CLICK A MODULE TO INSPECT — MODULE STATES TRACK MONEY, HULL AND FUEL</div>
    </section>
  )
}

function formatAmount(value: string): ReactNode {
  const [head, tail] = value.split(' Cr')
  return (
    <>
      {formatCreditsString(head)}
      {tail ? ` ${tail}` : ''}
    </>
  )
}

function formatCreditsString(head: string): string {
  const numberPart = parseInt(head, 10)
  if (Number.isNaN(numberPart)) return head
  return formatCredits(BigInt(numberPart) * 1_000_000_000_000_000_000_000n)
}

/* ------------------------------------------------------------------ */
/* The station, drawn with primitives                                  */
/* ------------------------------------------------------------------ */

function StationSvg({
  snapshot,
  dockedShip,
  panels,
  focus,
  onFocus,
}: {
  snapshot: GameSnapshot
  dockedShip: boolean
  panels: Record<ModuleId, ModuleInfo>
  focus: ModuleId | null
  onFocus: (m: ModuleId | null) => void
}) {
  const cx = 400
  const cy = 250
  const R = 118

  const dockDamaged = snapshot.repairDueTurn !== null && !snapshot.repairApplied
  const dockUpgraded = snapshot.upgrade
  const hullCells = Array.from({ length: 3 }, (_, i) => i < snapshot.hull)

  return (
    <svg
      className="canvas__svg"
      viewBox="0 0 800 540"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Orbital station modules"
    >
      <defs>
        <pattern id="hazard" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="12" height="12" fill={FIELD} />
          <rect width="6" height="12" fill={ORANGE} opacity="0.9" />
        </pattern>
        <pattern id="solar" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill={SURFACE} />
          <rect width="15" height="15" fill={SURFACE_2} stroke={LINE} strokeWidth="0.6" />
          <path d="M0 8h16M8 0v16" stroke={LINE} strokeWidth="0.8" />
        </pattern>
        <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ORANGE} stopOpacity="0.55" />
          <stop offset="70%" stopColor={ORANGE} stopOpacity="0.12" />
          <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g aria-hidden>
        <circle cx="120" cy="80" r="1.2" fill={DIM} opacity="0.6" />
        <circle cx="700" cy="60" r="1" fill={DIM} opacity="0.5" />
        <circle cx="640" cy="120" r="1.4" fill={DIM} opacity="0.7" />
        <circle cx="90" cy="330" r="1" fill={DIM} opacity="0.5" />
        <circle cx="200" cy="470" r="1.2" fill={DIM} opacity="0.4" />
        <circle cx="560" cy="410" r="1.4" fill={DIM} opacity="0.6" />
        <circle cx="740" cy="220" r="1" fill={DIM} opacity="0.8" />
        <circle cx="80" cy="200" r="1.6" fill={DIM} opacity="0.35" />
        <circle cx="480" cy="80" r="1" fill={DIM} opacity="0.5" />
        <circle cx="300" cy="60" r="1.4" fill={DIM} opacity="0.55" />
        <rect x="600" y="330" width="0.5" height="6" fill={DIM} opacity="0.5" />
      </g>

      {/* Central ring truss */}
      <g stroke={LINE} strokeWidth="3" fill="none">
        <circle cx={cx} cy={cy} r={R} />
        <circle cx={cx} cy={cy} r={R - 16} strokeDasharray="3 7" opacity="0.8" />
      </g>

      {/* Solar array module (top-left wings) */}
      <g
        className="module"
        tabIndex={0}
        role="button"
        aria-label="Solar array module, inspect"
        onClick={() => (focus === 'array' ? onFocus(null) : onFocus('array'))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onFocus(focus === 'array' ? null : 'array')
          }
        }}
      >
        <rect x="130" y="150" width="150" height="60" fill="url(#solar)" stroke={LINE} transform="rotate(-18 205 180)" />
        <rect x="110" y="215" width="150" height="56" fill="url(#solar)" stroke={LINE} transform="rotate(-28 185 243)" />
        <circle cx={cx - R} cy={cy} r="34" fill={SURFACE} stroke={LINE} />
        <rect x={cx - R - 26} y={cy - 17} width="52" height="34" rx="5" fill={SURFACE_2} stroke={LINE} />
        <circle cx={cx - R - 10} cy={cy} r="4" fill={GREEN} opacity="0.85" />
        <rect className="module__hl" x={cx - R - 42} y={cy - 28} width="74" height="56" rx="8" fill="none" stroke={INK} strokeDasharray="4 5" opacity="0" />
      </g>

      {/* Reactor module (top arm) */}
      <g
        className="module"
        tabIndex={0}
        role="button"
        aria-label="Reactor module, inspect"
        onClick={() => (focus === 'reactor' ? onFocus(null) : onFocus('reactor'))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onFocus(focus === 'reactor' ? null : 'reactor')
          }
        }}
      >
        <path d={`M ${cx + 34} ${cy - R + 10} L ${cx + 92} ${cy - R - 56} M ${cx - 34} ${cy - R + 10} L ${cx - 10} ${cy - R - 62}`} stroke={LINE} strokeWidth="4" />
        <rect x={cx + 58} y={cy - R - 96} width="70" height="58" rx="7" fill={SURFACE} stroke={LINE} />
        <rect x={cx + 66} y={cy - R - 88} width="17" height="17" fill={FIELD} stroke={LINE} strokeWidth="0.8" />
        <rect x={cx + 89} y={cy - R - 88} width="17" height="17" fill={FIELD} stroke={LINE} strokeWidth="0.8" />
        <rect x={cx + 66} y={cy - R - 66} width="17" height="17" fill={FIELD} stroke={LINE} strokeWidth="0.8" />
        <rect x={cx + 89} y={cy - R - 66} width="17" height="17" fill={FIELD} stroke={LINE} strokeWidth="0.8" />
        <path d={`M ${cx + 120} ${cy - R - 96} v-26`} stroke={LINE} strokeWidth="1.6" />
        <circle cx={cx + 120} cy={cy - R - 126} r={2.4} fill={ORANGE} />
        {snapshot.fuel === 0 ? null : (
          <circle cx={cx + 93} cy={cy - R - 67} r="34" fill="url(#coreGlow)" />
        )}
        <rect className="module__hl" x={cx + 52} y={cy - R - 102} width="82" height="70" rx="9" fill="none" stroke={INK} strokeDasharray="4 5" opacity="0" />
      </g>

      {/* Dock module (right arm, with ship berthing) */}
      <g
        className="module"
        tabIndex={0}
        role="button"
        aria-label={panels.dock.title + ' module, ' + panels.dock.label + ', inspect'}
        onClick={() => (focus === 'dock' ? onFocus(null) : onFocus('dock'))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onFocus(focus === 'dock' ? null : 'dock')
          }
        }}
      >
        <path d={`M ${cx + R} ${cy} L ${cx + R + 58} ${cy}`} stroke={LINE} strokeWidth="5" />
        <rect x={cx + R + 40} y={cy - 34} width="94" height="68" rx="8" fill={SURFACE} stroke={LINE} />
        <rect x={cx + R + 146} y={cy - 27} width="60" height="54" rx="7" fill={SURFACE_2} stroke={LINE} />
        <g transform={`translate(${cx + R + 150} ${cy - 22})`}>
          {dockDamaged ? (
            <rect width="52" height="46" fill="url(#hazard)" stroke={RED} />
          ) : (
            <path d="M0 40 L4 8 L26 2 L48 8 L52 40 Z" fill={FIELD} stroke={LINE} />
          )}
          {!dockDamaged ? <circle cx="26" cy="20" r="5" fill={dockUpgraded ? ORANGE : GREEN} opacity="0.9" /> : null}
        </g>
        {dockDamaged ? (
          <g transform={`translate(${cx + R + 62} ${cy - 26})`} className="tx-flash">
            <path d="M8 14 L16 0 L24 14 Z" fill={RED} />
            <path d="M16 4.5 V9 M16 11 v.4" stroke="#101416" strokeWidth="1.4" />
          </g>
        ) : null}
        {/* docked ship */}
        {dockedShip ? (
          <g key={`ship-${snapshot.revision}`} className="ship--docked" transform={`translate(${cx + R + 34} ${cy + 44})`}>
            <path d="M0 10 Q10 -4 34 -4 L52 2 Q58 6 56 10 L4 13 Q-2 12 0 10 Z" fill={SURFACE_2} stroke={INK} strokeWidth="1.2" />
            <rect x="20" y="2" width="8" height="6" rx="2" fill={FIELD} />
            <path d="M6 1 l3 -6 2 6z" fill={ORANGE} />
          </g>
        ) : null}
        <rect className="module__hl" x={cx + R + 34} y={cy - 42} width="178" height="76" rx="10" fill="none" stroke={INK} strokeDasharray="4 5" opacity="0" />
      </g>

      {/* Repair bay module (bottom arm) */}
      <g
        className="module"
        tabIndex={0}
        role="button"
        aria-label={panels.repair.title + ' module, ' + panels.repair.label + ', inspect'}
        onClick={() => (focus === 'repair' ? onFocus(null) : onFocus('repair'))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onFocus(focus === 'repair' ? null : 'repair')
          }
        }}
      >
        <path d={`M ${cx - 30} ${cy + R - 6} L ${cx - 40} ${cy + R + 66} M ${cx + 30} ${cy + R - 6} L ${cx + 42} ${cy + R + 60}`} stroke={LINE} strokeWidth="4" />
        <rect x={cx - 90} y={cy + R + 48} width="180" height="76" rx="9" fill={SURFACE} stroke={LINE} />
        <rect x={cx - 70} y={cy + R + 64} width="150" height="42" rx="7" fill={SURFACE_2} stroke={LINE} strokeDasharray={snapshot.repairDueTurn && !snapshot.repairApplied ? undefined : '5 6'} opacity="0.95" />
        {snapshot.repairDueTurn && !snapshot.repairApplied ? (
          <g className="tx-flash" transform={`translate(${cx - 50} ${cy + R + 74})`}>
            <rect width="110" height="22" rx="4" fill="url(#hazard)" opacity="0.75" />
            <text x="55" y="16" textAnchor="middle" fontSize="11" fill={INK} fontFamily="IBM Plex Mono, monospace" letterSpacing="1.5">
              REPAIR {snapshot.repairPaid ? 'HELD' : '4Cr'}
            </text>
          </g>
        ) : null}
        <rect className="module__hl" x={cx - 98} y={cy + R + 40} width="196" height="92" rx="11" fill="none" stroke={INK} strokeDasharray="4 5" opacity="0" />
      </g>

      {/* Hub detail */}
      <g>
        <circle cx={cx} cy={cy} r={R - 42} fill={FIELD} stroke={LINE} strokeWidth="2" />
        <circle cx={cx} cy={cy} r={R - 54} fill={SURFACE} stroke={LINE} strokeDasharray="2 5" />
        {hullCells.map((on, i) => (
          <rect
            key={i}
            x={cx - 30 + i * 22}
            y={cy + R - 72}
            width="14"
            height="7"
            rx="1.5"
            fill={on ? GREEN : FIELD}
            stroke={on ? GREEN : LINE}
            strokeWidth="0.8"
          />
        ))}
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="13" fill={DIM} fontFamily="IBM Plex Mono, monospace" letterSpacing="2.5">
          ST-07
        </text>
      </g>

      {/* Leaders + labels */}
      <LeaderLabel
        cx={cx + 93}
        top={cy - R - 156}
        title="REACTOR"
        stateText={panels.reactor.label}
        stateClass={panels.reactor.labelClass}
        focusOpen={focus === 'reactor'}
      />
      <LeaderLabel
        cx={cx + R + 108}
        top={cy - 92}
        leaderTo="down"
        title="DOCK"
        stateText={panels.dock.label}
        stateClass={panels.dock.labelClass}
        focusOpen={focus === 'dock'}
      />
      <LeaderLabel
        cx={cx - 60}
        top={cy + R + 142}
        title="REPAIR BAY"
        stateText={panels.repair.label}
        stateClass={panels.repair.labelClass}
        focusOpen={focus === 'repair'}
      />
    </svg>
  )
}

function LeaderLabel({
  cx,
  top,
  title,
  stateText,
  stateClass,
  focusOpen,
  leaderTo = 'up',
}: {
  cx: number
  top: number
  title: string
  stateText: string
  stateClass: string
  focusOpen: boolean
  leaderTo?: 'up' | 'down'
}) {
  const color = stateClass === 'tag-red' ? RED : stateClass === 'tag-ok' ? GREEN : stateClass === 'tag-orange' ? ORANGE : DIM
  const isDamaged = stateClass === 'tag-red'
  const lineBottom = top + 20
  return (
    <g>
      <path
        d={
          leaderTo === 'down'
            ? `M ${cx} ${lineBottom} v-36 h34`
            : `M ${cx} ${lineBottom + 26} v26`
        }
        stroke={LINE}
        strokeWidth="1.4"
        fill="none"
        opacity={focusOpen ? 1 : 0.6}
      />
      <text x={cx + 42} y={leaderTo === 'down' ? top : top + 14} fontSize="12.5" fill={DIM} fontFamily="IBM Plex Mono, monospace" letterSpacing="1.2">
        {title}
        <tspan fill="#54605e">{'  /  '}</tspan>
        <tspan fill={isDamaged ? RED : color} fontWeight={stateClass === 'tag-dim' ? 400 : 500}>
          {stateText}
        </tspan>
      </text>
    </g>
  )
}

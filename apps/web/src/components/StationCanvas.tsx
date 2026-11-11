import { useEffect, useRef, type ReactNode } from 'react'
import type { GameSnapshot } from '../lib/state'
import type { ModuleId, StationFx } from '../lib/stationFx'
import stationIllustration from '../assets/station-illustration.png'
import droneSprite from '../assets/station-drone.png'
import panelW1 from '../assets/station-panel-w1.png'
import panelW2 from '../assets/station-panel-w2.png'
import panelW3 from '../assets/station-panel-w3.png'
import panelW4 from '../assets/station-panel-w4.png'
import { IconWarning } from './icons'

export interface StationCanvasProps {
  snapshot: GameSnapshot
  /** True when the last completed action was a docking (ship at the dock). */
  dockedShip: boolean
  spots: {
    standard: number
    heavy: number
  }
  /** Effects derived from confirmed read-backs and the pending transaction. */
  fx: StationFx
  /** An nft_transfer_call is waiting on its receiver. */
  transferLocked: boolean
  /** Floating message over the canvas (banners from App). */
  banner?: ReactNode
}

/* Overlay geometry is measured on the 900x688 concept illustration. The
   asset is that source with its panel-border pixels trimmed (2 px left/right,
   5 px top, 4 px bottom), so the overlay viewBox starts at the trim offset. */
const ART_X = 2
const ART_Y = 5
const ART_W = 896
const ART_H = 679

const DIM = '#8A938F'

interface Spot {
  id: ModuleId
  label: string
  state: (s: GameSnapshot) => { word: string; color: string }
  /** Text baseline (left-anchored) for the callout. */
  textX: number
  textY: number
  /** Concept-style leader: underline then elbow to the module target. */
  underline: [number, number]
  leader: [number, number]
  target: [number, number]
}

const SPOTS: Spot[] = [
  {
    id: 'reactor',
    label: 'REACTOR',
    textX: 338,
    textY: 88,
    underline: [338, 96],
    leader: [346, 96],
    target: [333, 219],
    state: (s) => {
      if (s.complete && !s.outcome.success) return { word: 'OFFLINE', color: '#C86B59' }
      return { word: 'ONLINE', color: '#A7C0AA' }
    },
  },
  {
    id: 'dock',
    label: 'DOCK',
    textX: 712,
    textY: 162,
    underline: [712, 170],
    leader: [718, 170],
    target: [646, 247],
    state: (s) => {
      if (s.hull <= 0) return { word: 'OFFLINE', color: '#C86B59' }
      if (s.hull < 3) return { word: `DAMAGE ${3 - s.hull}`, color: '#C86B59' }
      return { word: 'READY', color: '#A7C0AA' }
    },
  },
  {
    id: 'repair',
    label: 'REPAIR BAY',
    textX: 622,
    textY: 588,
    underline: [622, 596],
    leader: [630, 578],
    target: [545, 490],
    state: (s) => {
      if (s.repairPaid) return { word: 'SETTLED', color: DIM }
      if (s.repairApplied) return { word: 'RESTORED', color: '#A7C0AA' }
      if (s.repairSupplier) return { word: 'QUEUED', color: '#D9B96A' }
      return { word: 'STANDBY', color: DIM }
    },
  },
]

/* ------------------------------------------------------------------
   Scene layers. Everything below uses image-pixel coordinates
   (viewBox 0 0 ART_W ART_H) and drifts with the station; the callout
   overlay above stays fixed so labels and hotspots never move.
   ------------------------------------------------------------------ */

/** Solar wings cut from the art; each tilts about its joint with the arm. */
const PANELS = [
  { id: 'w1', src: panelW1, x: 109, y: 55, w: 176, h: 124, pivot: [152, 128] },
  { id: 'w2', src: panelW2, x: 0, y: 102, w: 135, h: 154, pivot: [92, 151] },
  { id: 'w3', src: panelW3, x: 0, y: 356, w: 137, h: 136, pivot: [80, 448] },
  { id: 'w4', src: panelW4, x: 0, y: 434, w: 224, h: 207, pivot: [150, 455] },
] as const

/** Reactor rim top face (perspective ellipse) carrying the running lights. */
const REACTOR = { cx: 322, cy: 238, rx: 88, ry: 42 }
const RIM_LIGHTS = Array.from({ length: 24 }, (_, i) => (i * 360) / 24)

/** Repair drone: parked spot, and the orbit it flies around the bay. */
const DRONE = { x: 733, y: 372, w: 66, h: 51 }
const BAY_ORBIT = { cx: 566, cy: 440, rx: 142, ry: 52 }

/** Dock module span swept by the hull-restoration light. */
const DOCK_SWEEP = { x: 500, y: 192, w: 330, h: 86 }

/** Deterministic starfield (parallax layer shown only over open space). */
const STARS = (() => {
  let seed = 7
  const next = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  return Array.from({ length: 150 }, () => ({
    x: next() * ART_W,
    y: next() * ART_H,
    r: 0.45 + next() * 0.8,
    o: 0.3 + next() * 0.5,
  }))
})()

function DroneSprite() {
  return <image href={droneSprite} x={-DRONE.w / 2} y={-DRONE.h / 2} width={DRONE.w} height={DRONE.h} />
}

/** Small docked freighter silhouette; arrival plays only for a confirmed docking. */
function DockedShip({ arriving }: { arriving: boolean }) {
  return (
    <g transform="translate(804 203) rotate(-16)">
      <g className={`station-ship${arriving ? ' station-ship--arriving' : ''}`}>
        <path
          d="M -18 6 L -12 -4 L 14 -4 L 20 2 L 14 6 Z M -20 -2 L -14 -6 L -8 -6 L -12 -2 Z"
          fill="#D8CFC2"
          stroke="#394246"
          strokeWidth="1"
        />
        <rect x="2" y="-4" width="5" height="10" fill="#C86B59" opacity="0.85" />
      </g>
    </g>
  )
}

/** State words that changed since the previous render of the same station. */
function useChangedWords(stationAccount: string, words: Record<ModuleId, string>): Set<ModuleId> {
  const previous = useRef<{ station: string; words: Record<ModuleId, string> } | null>(null)
  const changed = new Set<ModuleId>()
  const last = previous.current
  if (last && last.station === stationAccount) {
    for (const id of Object.keys(words) as ModuleId[]) if (last.words[id] !== words[id]) changed.add(id)
  }
  useEffect(() => {
    previous.current = { station: stationAccount, words }
  })
  return changed
}

function shorten(text: string, max = 46): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function StationCanvas({ snapshot: s, dockedShip, fx, transferLocked, banner }: StationCanvasProps) {
  const repairActive = s.repairSupplier !== null && !s.repairApplied && !s.repairPaid
  const words = Object.fromEntries(SPOTS.map((spot) => [spot.id, spot.state(s).word])) as Record<ModuleId, string>
  const changedWords = useChangedWords(s.stationAccount, words)
  const stationFailure = fx.failure && fx.failure.module === null ? fx.failure : null

  return (
    <div className={`station-canvas${transferLocked ? ' station-canvas--locked' : ''}`}>
      <figure className="station-canvas-artwrap">
        <div className="station-scene">
          <img
            src={stationIllustration}
            width={ART_W}
            height={ART_H}
            alt={`DERELICT station ${s.stationAccount} — orbital salvage platform`}
            className="station-canvas-img"
          />

          <div className="station-stars" aria-hidden="true">
            <svg className="station-stars-field" viewBox={`0 0 ${ART_W} ${ART_H}`} preserveAspectRatio="xMidYMid slice">
              {STARS.map((star, i) => (
                <circle key={i} cx={star.x} cy={star.y} r={star.r} opacity={star.o} />
              ))}
            </svg>
          </div>

          <svg
            className={`station-fx${repairActive ? ' station-fx--repair' : ''}`}
            viewBox={`0 0 ${ART_W} ${ART_H}`}
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="station-light">
                <stop offset="0" stopColor="#FFC46E" stopOpacity="0.85" />
                <stop offset="0.45" stopColor="#F2A24A" stopOpacity="0.35" />
                <stop offset="1" stopColor="#F2A24A" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="hull-sweep" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#CFE8D2" stopOpacity="0" />
                <stop offset="0.5" stopColor="#CFE8D2" stopOpacity="0.55" />
                <stop offset="1" stopColor="#CFE8D2" stopOpacity="0" />
              </linearGradient>
            </defs>

            {PANELS.map((panel) => (
              <g key={panel.id} transform={`translate(${panel.pivot[0]} ${panel.pivot[1]})`}>
                <g className={`station-panel station-panel--${panel.id}`}>
                  <image
                    href={panel.src}
                    x={panel.x - panel.pivot[0]}
                    y={panel.y - panel.pivot[1]}
                    width={panel.w}
                    height={panel.h}
                  />
                </g>
              </g>
            ))}

            <g transform={`translate(${REACTOR.cx} ${REACTOR.cy}) scale(1 ${REACTOR.ry / REACTOR.rx})`}>
              <g className="reactor-ring">
                {RIM_LIGHTS.map((deg, i) => (
                  <rect
                    key={deg}
                    className={i % 6 === 0 ? 'reactor-ring__beacon' : 'reactor-ring__light'}
                    x={REACTOR.rx - 4}
                    y={i % 6 === 0 ? -3.5 : -2.5}
                    width={8}
                    height={i % 6 === 0 ? 7 : 5}
                    rx={1}
                    transform={`rotate(${deg})`}
                  />
                ))}
              </g>
            </g>

            <ellipse className="station-light station-light--reactor" cx="333" cy="232" rx="62" ry="28" />
            <ellipse className="station-light station-light--reactor-core" cx="318" cy="248" rx="24" ry="9" />
            <ellipse className="station-light station-light--bay" cx="530" cy="452" rx="36" ry="30" />
            <ellipse className="station-light station-light--bay-lamp" cx="516" cy="439" rx="10" ry="9" />

            {/* Parked drone, or orbiting the bay while a repair is active. */}
            <g className="drone-parked" transform={`translate(${DRONE.x + DRONE.w / 2} ${DRONE.y + DRONE.h / 2})`}>
              <DroneSprite />
            </g>
            <g
              className="drone-orbit"
              transform={`translate(${BAY_ORBIT.cx} ${BAY_ORBIT.cy}) scale(1 ${BAY_ORBIT.ry / BAY_ORBIT.rx})`}
            >
              <g className="drone-orbit__spin">
                <g transform={`translate(${BAY_ORBIT.rx} 0)`}>
                  <g className="drone-orbit__counter">
                    <g className="drone-orbit__depth" transform={`scale(0.85 ${(0.85 * BAY_ORBIT.rx) / BAY_ORBIT.ry})`}>
                      <DroneSprite />
                    </g>
                  </g>
                </g>
              </g>
            </g>

            {dockedShip && <DockedShip key={fx.arrival ?? 'docked'} arriving={fx.arrival !== null} />}

            {fx.restoration !== null && (
              <g key={fx.restoration} className="hull-restore">
                <rect
                  className="hull-restore__band"
                  x={DOCK_SWEEP.x - 60}
                  y={DOCK_SWEEP.y}
                  width={120}
                  height={DOCK_SWEEP.h}
                  fill="url(#hull-sweep)"
                />
              </g>
            )}
          </svg>
        </div>

        <svg
          className="station-canvas-overlay"
          viewBox={`${ART_X} ${ART_Y} ${ART_W} ${ART_H}`}
          preserveAspectRatio="xMidYMid slice"
          aria-label="Station module status"
          role="group"
        >
          {SPOTS.map((spot) => {
            const st = spot.state(s)
            const [ux, uy] = spot.underline
            const [lx, ly] = spot.leader
            const [tx, ty] = spot.target
            const pending = fx.pendingModule === spot.id
            const failure = fx.failure && fx.failure.module === spot.id ? fx.failure : null
            const underlineEnd = ux + spot.label.length * 8.4 + st.word.length * 8.2 + 34
            // Status lines stay on canvas: right-side callouts end at the underline,
            // and callouts near the bottom edge put the line above the label.
            const noteAnchor = spot.textX > ART_W / 2 ? { x: underlineEnd, textAnchor: 'end' as const } : { x: spot.textX }
            const noteY = spot.textY > ART_H * 0.75 ? spot.textY - 26 : uy + 16
            return (
              <g
                className={`modspot${failure ? ' modspot--failed' : ''}`}
                data-module={spot.id}
                data-state={st.word}
                key={spot.id}
                tabIndex={0}
                role="button"
                aria-label={`${spot.label}: ${st.word}${pending ? ' (pending)' : ''}${failure ? ` (rejected: ${failure.text})` : ''}`}
              >
                <title>{`${spot.label} — ${st.word}`}</title>
                {/* Re-keyed per failure so the shake replays without remounting the focusable hotspot. */}
                <g className="modspot-shake" key={failure?.key ?? 'steady'}>
                  <rect
                    x={spot.textX - 10}
                    y={spot.textY - 22}
                    width={spot.label.length * 9 + st.word.length * 8.6 + 54}
                    height={34}
                    rx="3"
                    className="modspot-hit"
                  />
                  <text className="modspot-label" x={spot.textX} y={spot.textY} data-hit>
                    <tspan className="modspot-name">{spot.label}</tspan>
                    <tspan
                      key={st.word}
                      dx="9"
                      className={`modspot-state${changedWords.has(spot.id) ? ' modspot-state--swap' : ''}`}
                      fill={st.color}
                    >
                      {st.word}
                    </tspan>
                  </text>
                  <line x1={ux} y1={uy} x2={underlineEnd} y2={uy} className="modspot-underline" />
                  <polyline points={`${lx},${ly} ${tx},${ty}`} className="modspot-leader" />
                  {st.word === 'QUEUED' ? (
                    <circle cx={tx} cy={ty} r="7.5" className="repair-ring" aria-hidden="true" />
                  ) : null}
                  {pending ? (
                    <g className="modspot-pending" aria-hidden="true">
                      <circle cx={tx} cy={ty} r="11" />
                      <text {...noteAnchor} y={noteY}>
                      PENDING — AWAITING CHAIN
                    </text>
                    </g>
                  ) : null}
                  {failure ? (
                    <g className="modspot-failure" aria-hidden="true">
                      <circle cx={tx} cy={ty} r="11" />
                      <text {...noteAnchor} y={noteY}>{`✕ REJECTED — ${shorten(failure.text, 40)}`}</text>
                    </g>
                  ) : null}
                  <circle
                    cx={tx}
                    cy={ty}
                    r="3.2"
                    className={st.word === 'QUEUED' ? 'modspot-dot queued modspot-dot--active' : 'modspot-dot'}
                  />
                </g>
              </g>
            )
          })}
        </svg>
      </figure>

      {transferLocked ? (
        <div className="station-canvas-tag station-canvas-tag--lock" role="status">
          TRANSFER PENDING — waiting for the receiving contract; commands are paused
        </div>
      ) : null}
      {stationFailure ? (
        <div className="station-canvas-tag station-canvas-tag--error" role="alert" key={stationFailure.key}>
          <IconWarning size={13} />
          {`REJECTED — ${shorten(stationFailure.text, 80)}`}
        </div>
      ) : null}

      <div className="station-canvas-registries" aria-hidden="true">
        <span className="registry-left">CHAIN VIEW // 1 CR = 10^21 YOCTO</span>
        <span className="registry-right">STATION ART — DERELICT CONCEPT</span>
      </div>

      {banner && <div className="station-canvas-banner">{banner}</div>}
    </div>
  )
}

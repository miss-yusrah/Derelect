import type { GameSnapshot } from '../lib/state'
import type { ReactNode } from 'react'

export interface StationCanvasProps {
  snapshot: GameSnapshot
  /** True when the last completed action was a docking (ship at the dock). */
  dockedShip: boolean
  spots: {
    standard: number
    heavy: number
  }
  /** Floating message over the canvas (banners from App). */
  banner?: ReactNode
}

import stationIllustration from '../assets/station-illustration.png'

/* The cleaned concept illustration is 900x688. Overlay geometry is measured
   on that source so labels, leader lines and hit areas stay put at any size. */
const ART_W = 900
const ART_H = 688

const DIM = '#8A938F'

type ModuleId = 'reactor' | 'dock' | 'repair'

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

/** Small docked freighter silhouette, drawn only right after a docking. */
function DockedShip() {
  return (
    <g className="station-ship" transform="translate(806 208) rotate(-16)">
      <path
        d="M -18 6 L -12 -4 L 14 -4 L 20 2 L 14 6 Z M -20 -2 L -14 -6 L -8 -6 L -12 -2 Z"
        fill="#D8CFC2"
        stroke="#394246"
        strokeWidth="1"
      />
      <rect x="2" y="-4" width="5" height="10" fill="#C86B59" opacity="0.85" />
    </g>
  )
}

export function StationCanvas({ snapshot: s, dockedShip, banner }: StationCanvasProps) {
  return (
    <div className="station-canvas">
      <figure className="station-canvas-artwrap">
        <img
          src={stationIllustration}
          width={ART_W}
          height={ART_H}
          alt="DERELICT station RELAY-07 — orbital salvage platform"
          className="station-canvas-img"
        />

        <svg
          className="station-canvas-overlay"
          viewBox={`0 0 ${ART_W} ${ART_H}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label="Station module status"
          role="group"
        >
          {SPOTS.map((spot) => {
            const st = spot.state(s)
            const [ux, uy] = spot.underline
            const [lx, ly] = spot.leader
            const [tx, ty] = spot.target
            return (
              <g
                className="modspot"
                data-module={spot.id}
                data-state={st.word}
                key={spot.id}
                tabIndex={0}
                role="button"
                aria-label={`${spot.label}: ${st.word}`}
              >
                <title>{`${spot.label} — ${st.word}`}</title>
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
                  <tspan dx="9" className="modspot-state" fill={st.color}>
                    {st.word}
                  </tspan>
                </text>
                <line x1={ux} y1={uy} x2={ux + spot.label.length * 8.4 + st.word.length * 8.2 + 34} y2={uy} className="modspot-underline" />
                <polyline points={`${lx},${ly} ${tx},${ty}`} className="modspot-leader" />
                {st.word === 'QUEUED' ? (
                  <circle cx={tx} cy={ty} r="7.5" className="repair-ring" aria-hidden="true" />
                ) : null}
                <circle
                  cx={tx}
                  cy={ty}
                  r="3.2"
                  className={st.word === 'QUEUED' ? 'modspot-dot queued modspot-dot--active' : 'modspot-dot'}
                />
              </g>
            )
          })}
          {dockedShip && <DockedShip />}
        </svg>
      </figure>

      <div className="station-canvas-registries" aria-hidden="true">
        <span className="registry-left">CHAIN VIEW // 1 CR = 10^21 YOCTO</span>
        <span className="registry-right">STATION ART — DERELICT CONCEPT</span>
      </div>

      {banner && <div className="station-canvas-banner">{banner}</div>}
    </div>
  )
}

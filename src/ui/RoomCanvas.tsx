import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { ITEM_EMOJI, type Edge, type GameState, type PeelMode } from '@/lib/types'
import {
  DOUBLE_MS,
  alongOf,
  amountOf,
  hitEdge,
  inPeelBand,
  stripStyle,
} from './peelGeom'

type Props = {
  state: GameState
  selfId: string
  targetId: string | null
  kickArmed: boolean
  onArmKick: () => void
  onPeelStart: (
    victimId: string,
    edge: Edge,
    mode: PeelMode,
    along: number,
  ) => string
  onPeelUpdate: (peelId: string, amount: number, along: number) => void
  onPeelEnd: (peelId: string) => void
  onSteal: (peelId: string, itemId: string) => void
  onSlam: (peelId: string) => void
}

export function RoomCanvas({
  state,
  selfId,
  targetId,
  kickArmed,
  onArmKick,
  onPeelStart,
  onPeelUpdate,
  onPeelEnd,
  onSteal,
  onSlam,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    edge: Edge
    mode: PeelMode
    sx: number
    sy: number
    peelId: string | null
  } | null>(null)
  const lastTap = useRef(0)
  const me = state.players[selfId]
  const stunned = !!(me && me.stunnedUntil > Date.now())
  const myPeel = state.peels.find((p) => p.thiefId === selfId)
  const incoming = state.peels.filter((p) => p.victimId === selfId)

  const local = (e: ReactPointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }
  }

  const onDown = (e: ReactPointerEvent) => {
    if (stunned || state.phase !== 'playing') return
    const { x, y, w, h } = local(e)
    const edge = hitEdge(x, y, w, h)
    if (!edge || !targetId) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const now = Date.now()
    const dbl = now - lastTap.current < DOUBLE_MS
    lastTap.current = now
    if (dbl) onArmKick()
    const mode: PeelMode = kickArmed || dbl ? 'kick' : 'quiet'
    const peelId = onPeelStart(targetId, edge, mode, alongOf(edge, x, y, w, h))
    drag.current = { edge, mode, sx: x, sy: y, peelId: peelId || null }
  }

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const { x, y, w, h } = local(e)
    const peelId = d.peelId ?? myPeel?.id ?? null
    if (!peelId) return
    d.peelId = peelId
    onPeelUpdate(
      peelId,
      amountOf(d.edge, d.sx, d.sy, x, y, w, h, d.mode),
      alongOf(d.edge, x, y, w, h),
    )
  }

  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const peelId = d.peelId ?? myPeel?.id
    if (peelId) onPeelEnd(peelId)
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 touch-none select-none overflow-hidden bg-[radial-gradient(ellipse_at_center,#3a2a1c_0%,#1a120c_70%)]"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="pointer-events-none absolute inset-6 rounded-[1.5rem] border border-paper/8 bg-[#24180f]/55 shadow-[inset_0_0_80px_rgba(0,0,0,0.45)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-ember/20 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-9 bg-gradient-to-r from-ember/15 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-l from-ember/15 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-ember/20 to-transparent" />

      {me?.items.map((item) => (
        <span
          key={item.id}
          className="pointer-events-none absolute text-3xl drop-shadow-md"
          style={{
            left: `${item.x * 100}%`,
            top: `${item.y * 100}%`,
            transform: 'translate(-50%,-50%)',
          }}
        >
          {ITEM_EMOJI[item.kind]}
        </span>
      ))}

      {state.peels.map((peel) => {
        const victim = state.players[peel.victimId]
        const mine = peel.victimId === selfId
        const thieving = peel.thiefId === selfId
        const visible = victim?.items.filter((it) => inPeelBand(it, peel)) ?? []
        return (
          <div key={peel.id}>
            <div
              className={`absolute z-10 overflow-hidden rounded-md ${
                peel.mode === 'kick'
                  ? 'bg-danger/35 ring-2 ring-danger/70'
                  : 'bg-paper/15 ring-1 ring-ember/50'
              }`}
              style={stripStyle(peel)}
            >
              <div className="absolute inset-0 bg-[repeating-linear-gradient(-12deg,transparent,transparent_6px,rgba(243,230,212,0.07)_6px,rgba(243,230,212,0.07)_7px)]" />
              {mine && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSlam(peel.id)
                  }}
                  className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger px-4 py-2 font-display text-sm font-bold tracking-wide text-paper shadow-lg ring-2 ring-paper/30 active:scale-95"
                >
                  SLAM
                </button>
              )}
            </div>
            {visible.map((item) => (
              <button
                key={`${peel.id}-${item.id}`}
                type="button"
                disabled={!thieving}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (thieving) onSteal(peel.id, item.id)
                }}
                className="absolute z-20 text-2xl drop-shadow-lg disabled:pointer-events-none"
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  transform: 'translate(-50%,-50%)',
                }}
              >
                {ITEM_EMOJI[item.kind]}
              </button>
            ))}
          </div>
        )
      })}

      {incoming.length === 0 && state.phase === 'playing' && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 z-20 w-[90%] -translate-x-1/2 text-center text-xs text-paper-dim">
          Drag inward from an edge to peel your target · double-tap edge for Door Kick
        </p>
      )}
    </div>
  )
}

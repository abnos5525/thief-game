import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ITEM_EMOJI,
  type Edge,
  type GameState,
  type Peel,
  type PeelMode,
} from '@/lib/types'
import {
  DOUBLE_MS,
  EDGE_ZONE,
  PEEL_HOLD_MIN,
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

const NET_MS = 50 // ~20 updates/sec max — keeps MQTT calm on desktop drag

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
    peelId: string
    pointerId: number
  } | null>(null)
  const lastNet = useRef(0)
  const lastTap = useRef(0)
  /** Optimistic local peel so mouse drag feels instant. */
  const [localPeel, setLocalPeel] = useState<Peel | null>(null)

  const me = state.players[selfId]
  const stunned = !!(me && me.stunnedUntil > Date.now())
  const incoming = state.peels.filter((p) => p.victimId === selfId)

  // Prefer optimistic peel for self; otherwise network peels.
  const peels: Peel[] = (() => {
    const others = state.peels.filter((p) => p.thiefId !== selfId)
    const netMine = state.peels.find((p) => p.thiefId === selfId)
    const mine = localPeel ?? netMine
    return mine ? [...others, mine] : others
  })()

  const closePeel = (peelId: string) => {
    setLocalPeel(null)
    drag.current = null
    onPeelEnd(peelId)
  }

  // Drop local peel if stunned (slammed) or round ended.
  useEffect(() => {
    if (stunned || state.phase !== 'playing') setLocalPeel(null)
  }, [stunned, state.phase])

  const local = (e: ReactPointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }
  }

  const pushUpdate = (peelId: string, amount: number, along: number, force = false) => {
    const now = performance.now()
    if (!force && now - lastNet.current < NET_MS) return
    lastNet.current = now
    onPeelUpdate(peelId, amount, along)
  }

  const onDown = (e: ReactPointerEvent) => {
    if (stunned || state.phase !== 'playing') return
    if (e.button !== 0) return
    const { x, y, w, h } = local(e)
    const edge = hitEdge(x, y, w, h)

    // Click outside peel strip while holding one open → close.
    if (!edge && localPeel) {
      closePeel(localPeel.id)
      return
    }
    if (!edge || !targetId) return

    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const now = Date.now()
    const dbl = now - lastTap.current < DOUBLE_MS
    lastTap.current = now
    if (dbl) onArmKick()
    const mode: PeelMode = kickArmed || dbl ? 'kick' : 'quiet'
    const along = alongOf(edge, x, y, w, h)
    const peelId = onPeelStart(targetId, edge, mode, along)
    if (!peelId) return

    const amount = mode === 'kick' ? 0.18 : 0.08
    const peel: Peel = {
      id: peelId,
      thiefId: selfId,
      victimId: targetId,
      edge,
      mode,
      amount,
      along,
    }
    setLocalPeel(peel)
    drag.current = { edge, mode, sx: x, sy: y, peelId, pointerId: e.pointerId }
    lastNet.current = 0
  }

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const { x, y, w, h } = local(e)
    const amount = amountOf(d.edge, d.sx, d.sy, x, y, w, h, d.mode)
    const along = alongOf(d.edge, x, y, w, h)
    setLocalPeel((prev) =>
      prev && prev.id === d.peelId ? { ...prev, amount, along } : prev,
    )
    pushUpdate(d.peelId, amount, along)
  }

  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const { x, y, w, h } = local(e)
    const amount = amountOf(d.edge, d.sx, d.sy, x, y, w, h, d.mode)
    const along = alongOf(d.edge, x, y, w, h)
    drag.current = null

    if (amount < PEEL_HOLD_MIN) {
      closePeel(d.peelId)
      return
    }

    // Keep peel open for clicking loot (desktop-friendly).
    setLocalPeel((prev) =>
      prev && prev.id === d.peelId ? { ...prev, amount, along } : prev,
    )
    pushUpdate(d.peelId, amount, along, true)
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

      {/* Edge grab affordances */}
      {(
        [
          ['top', 'inset-x-0 top-0 h-14'],
          ['bottom', 'inset-x-0 bottom-0 h-14'],
          ['left', 'inset-y-0 left-0 w-14'],
          ['right', 'inset-y-0 right-0 w-14'],
        ] as const
      ).map(([edge, cls]) => (
        <div
          key={edge}
          className={`pointer-events-none absolute ${cls} ${
            kickArmed ? 'bg-danger/15' : 'bg-ember/10'
          }`}
          style={{
            boxShadow:
              edge === 'top'
                ? 'inset 0 3px 0 rgba(224,122,61,0.55)'
                : edge === 'bottom'
                  ? 'inset 0 -3px 0 rgba(224,122,61,0.55)'
                  : edge === 'left'
                    ? 'inset 3px 0 0 rgba(224,122,61,0.55)'
                    : 'inset -3px 0 0 rgba(224,122,61,0.55)',
          }}
        />
      ))}

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

      {peels.map((peel) => {
        const victim = state.players[peel.victimId]
        const mine = peel.victimId === selfId
        const thieving = peel.thiefId === selfId
        const holding = thieving && !drag.current
        const visible = victim?.items.filter((it) => inPeelBand(it, peel)) ?? []
        return (
          <div key={peel.id}>
            <div
              className={`absolute z-10 overflow-hidden rounded-md transition-[width,height] duration-75 ${
                peel.mode === 'kick'
                  ? 'bg-danger/35 ring-2 ring-danger/70'
                  : 'bg-paper/15 ring-1 ring-ember/50'
              }`}
              style={stripStyle(peel)}
              onPointerDown={(e) => {
                // Don't start a new peel when adjusting / clicking inside strip.
                e.stopPropagation()
              }}
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
                  className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger px-5 py-2.5 font-display text-sm font-bold tracking-wide text-paper shadow-lg ring-2 ring-paper/30 active:scale-95"
                >
                  SLAM
                </button>
              )}
              {thieving && holding && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    closePeel(peel.id)
                  }}
                  className="absolute top-2 right-2 z-20 rounded-md bg-ink/80 px-2 py-1 text-[10px] tracking-wide text-paper-dim uppercase ring-1 ring-paper/20 hover:text-paper"
                >
                  Close
                </button>
              )}
            </div>
            {visible.map((item) => (
              <button
                key={`${peel.id}-${item.id}`}
                type="button"
                disabled={!thieving || !!drag.current}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (thieving && !drag.current) onSteal(peel.id, item.id)
                }}
                className="absolute z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-3xl drop-shadow-lg transition hover:scale-110 disabled:pointer-events-none disabled:opacity-60"
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  background: thieving ? 'rgba(224,122,61,0.25)' : 'transparent',
                }}
                title="Steal"
              >
                {ITEM_EMOJI[item.kind]}
              </button>
            ))}
          </div>
        )
      })}

      {state.phase === 'playing' && (
        <p className="pointer-events-none absolute bottom-5 left-1/2 z-20 w-[92%] -translate-x-1/2 text-center text-xs text-paper-dim">
          {localPeel && !drag.current
            ? 'Click loot to steal · click empty room or Close to seal the peel'
            : incoming.length
              ? 'Someone is peeling you — hit SLAM!'
              : `Drag inward from the glowing edges (~${EDGE_ZONE}px) · release to keep peel open`}
        </p>
      )}
    </div>
  )
}

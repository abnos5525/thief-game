import {
  Fragment,
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ITEM_EMOJI,
  type Edge,
  type GameState,
  type Peel,
  type PeelMode,
} from '@/lib/types'
import {
  DOUBLE_MS,
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

/** Victim sync only — thief is fully local while dragging. */
const NET_MS = 120

function RoomCanvasImpl({
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
  const stripRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    edge: Edge
    mode: PeelMode
    sx: number
    sy: number
    peelId: string
    pointerId: number
    victimId: string
  } | null>(null)
  const peelLive = useRef<Peel | null>(null)
  const raf = useRef(0)
  const lastNet = useRef(0)
  const lastTap = useRef(0)
  const [localPeel, setLocalPeel] = useState<Peel | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)

  const me = state.players[selfId]
  const stunned = !!(me && me.stunnedUntil > Date.now())
  const incoming = state.peels.filter((p) => p.victimId === selfId)

  const peels: Peel[] = (() => {
    const others = state.peels.filter((p) => p.thiefId !== selfId)
    const mine = localPeel ?? state.peels.find((p) => p.thiefId === selfId)
    return mine ? [...others, mine] : others
  })()

  const paintStrip = (peel: Peel) => {
    const el = stripRef.current
    if (!el || el.dataset.peelId !== peel.id) return
    const s = stripStyle(peel)
    if (s.left != null) el.style.left = String(s.left)
    if (s.right != null) el.style.right = String(s.right)
    if (s.top != null) el.style.top = String(s.top)
    if (s.bottom != null) el.style.bottom = String(s.bottom)
    if (s.width != null) el.style.width = String(s.width)
    if (s.height != null) el.style.height = String(s.height)
    if (s.transform != null) el.style.transform = String(s.transform)
  }

  const closePeel = (peelId: string) => {
    setLocalPeel(null)
    peelLive.current = null
    drag.current = null
    onPeelEnd(peelId)
  }

  useEffect(() => {
    if (stunned || state.phase !== 'playing') {
      setLocalPeel(null)
      peelLive.current = null
    }
  }, [stunned, state.phase])

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    },
    [],
  )

  const localXY = (e: ReactPointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }
  }

  const scheduleFrame = (next: Peel, netForce = false) => {
    peelLive.current = next
    paintStrip(next)
    if (!raf.current) {
      raf.current = requestAnimationFrame(() => {
        raf.current = 0
        const p = peelLive.current
        if (p) setLocalPeel(p)
      })
    }
    const now = performance.now()
    if (netForce || now - lastNet.current >= NET_MS) {
      lastNet.current = now
      onPeelUpdate(next.id, next.amount, next.along)
    }
  }

  const onDown = (e: ReactPointerEvent) => {
    if (stunned || state.phase !== 'playing') return
    if (e.button !== 0) return
    const { x, y, w, h } = localXY(e)
    const edge = hitEdge(x, y, w, h)

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

    // Always open a visible peel immediately (fixes “corner pull shows nothing”).
    const amount = mode === 'kick' ? 0.2 : 0.14
    const peel: Peel = {
      id: peelId,
      thiefId: selfId,
      victimId: targetId,
      edge,
      mode,
      amount,
      along,
    }
    peelLive.current = peel
    setLocalPeel(peel)
    drag.current = {
      edge,
      mode,
      sx: x,
      sy: y,
      peelId,
      pointerId: e.pointerId,
      victimId: targetId,
    }
    lastNet.current = 0
    onPeelUpdate(peelId, amount, along)
  }

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const { x, y, w, h } = localXY(e)
    const amount = Math.max(
      amountOf(d.edge, d.sx, d.sy, x, y, w, h, d.mode),
      d.mode === 'kick' ? 0.16 : 0.12,
    )
    const along = alongOf(d.edge, x, y, w, h)
    scheduleFrame({
      id: d.peelId,
      thiefId: selfId,
      victimId: d.victimId,
      edge: d.edge,
      mode: d.mode,
      amount,
      along,
    })
  }

  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const { x, y, w, h } = localXY(e)
    const amount = Math.max(
      amountOf(d.edge, d.sx, d.sy, x, y, w, h, d.mode),
      peelLive.current?.amount ?? 0,
    )
    const along = alongOf(d.edge, x, y, w, h)
    drag.current = null

    if (amount < PEEL_HOLD_MIN) {
      closePeel(d.peelId)
      return
    }
    const peel: Peel = {
      id: d.peelId,
      thiefId: selfId,
      victimId: d.victimId,
      edge: d.edge,
      mode: d.mode,
      amount,
      along,
    }
    peelLive.current = peel
    setLocalPeel(peel)
    lastNet.current = 0
    onPeelUpdate(d.peelId, amount, along)
  }

  return (
    <div
      ref={rootRef}
      className="room-stage absolute inset-0 touch-none select-none overflow-hidden"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="room-floor pointer-events-none absolute inset-5 sm:inset-6" />

      {(['top', 'bottom', 'left', 'right'] as const).map((edge) => (
        <div
          key={edge}
          className={`edge-rail edge-rail-${edge} pointer-events-none absolute ${
            kickArmed ? 'edge-rail-kick' : ''
          }`}
        />
      ))}

      {me?.items.map((item) => (
        <span
          key={item.id}
          className="loot-own pointer-events-none absolute text-3xl"
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
        const isLive = thieving && localPeel?.id === peel.id
        return (
          <Fragment key={peel.id}>
            <div
              ref={isLive ? stripRef : undefined}
              data-peel-id={peel.id}
              className={`peel-strip absolute z-10 overflow-hidden ${
                peel.mode === 'kick' ? 'peel-strip-kick' : 'peel-strip-quiet'
              }`}
              style={stripStyle(peel)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="peel-paper absolute inset-0" />
              <div className="peel-curl pointer-events-none absolute inset-y-0 right-0 w-3" />
              {mine && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSlam(peel.id)
                  }}
                  className="slam-btn absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
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
                  className="absolute top-2 right-2 z-20 rounded-md bg-ink/85 px-2.5 py-1 text-[10px] tracking-wider text-paper-dim uppercase ring-1 ring-paper/25"
                >
                  Seal
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
                  if (!thieving || drag.current) return
                  onSteal(peel.id, item.id)
                  setFlashId(item.id)
                  window.setTimeout(() => setFlashId(null), 280)
                }}
                className={`loot-steal absolute z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-3xl disabled:pointer-events-none ${
                  flashId === item.id ? 'loot-flash' : ''
                }`}
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                }}
              >
                {ITEM_EMOJI[item.kind]}
              </button>
            ))}
          </Fragment>
        )
      })}

      {state.phase === 'playing' && (
        <p className="hint-bar pointer-events-none absolute bottom-4 left-1/2 z-20 w-[92%] -translate-x-1/2 text-center text-xs">
          {localPeel && !drag.current
            ? 'Tap loot to steal · Seal or tap empty space to close'
            : incoming.length
              ? 'They’re in your wall — SLAM!'
              : 'Pull inward from the glowing edges — release to keep the tear open'}
        </p>
      )}
    </div>
  )
}

export const RoomCanvas = memo(RoomCanvasImpl)

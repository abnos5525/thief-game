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
  QUIET_REVEAL,
  STITCHES_NEEDED,
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
  onStitch: (peelId: string) => void
}

/** Victim sync only — thief is fully local while dragging. */
const NET_MS = 120
/** Min gap between stitches so jitter can't count twice. */
const STITCH_GAP_MS = 160

const axisOf = (edge: Edge, x: number, y: number) =>
  edge === 'top' || edge === 'bottom' ? x : y

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
  onStitch,
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
  const stitchDrag = useRef<{
    peelId: string
    pointerId: number
    edge: Edge
    anchor: number
    dir: number
    t: number
  } | null>(null)
  const [stitchPulse, setStitchPulse] = useState(0)

  const me = state.players[selfId]
  const stunUntil = me?.stunnedUntil ?? 0
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (stunUntil <= Date.now()) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= stunUntil) window.clearInterval(id)
    }, 100)
    return () => window.clearInterval(id)
  }, [stunUntil])
  const stunned = stunUntil > now
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

  // Drop my tear when stunned, round over, or the host ripped/stitched it shut.
  const localGone = !!localPeel && !state.peels.some((p) => p.id === localPeel.id)
  useEffect(() => {
    if (stunned || state.phase !== 'playing' || localGone) {
      setLocalPeel(null)
      peelLive.current = null
      drag.current = null
    }
  }, [stunned, state.phase, localGone])

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

  const stitchDown = (e: ReactPointerEvent, peel: Peel) => {
    e.stopPropagation()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = localXY(e)
    stitchDrag.current = {
      peelId: peel.id,
      pointerId: e.pointerId,
      edge: peel.edge,
      anchor: axisOf(peel.edge, x, y),
      dir: 0,
      t: 0,
    }
  }

  /** Zig-zag along the tear: each reversal past the threshold is one stitch. */
  const stitchMove = (e: ReactPointerEvent) => {
    const s = stitchDrag.current
    if (!s || s.pointerId !== e.pointerId) return
    e.stopPropagation()
    const { x, y, w, h } = localXY(e)
    const pos = axisOf(s.edge, x, y)
    const delta = pos - s.anchor
    if (s.dir !== 0 && Math.sign(delta) === s.dir) {
      s.anchor = pos
      return
    }
    const span = s.edge === 'top' || s.edge === 'bottom' ? w : h
    if (Math.abs(delta) < Math.max(40, span * 0.12)) return
    const t = performance.now()
    if (t - s.t < STITCH_GAP_MS) return
    s.t = t
    s.dir = Math.sign(delta)
    s.anchor = pos
    onStitch(s.peelId)
    setStitchPulse((n) => n + 1)
  }

  const stitchUp = (e: ReactPointerEvent) => {
    if (stitchDrag.current?.pointerId !== e.pointerId) return
    e.stopPropagation()
    stitchDrag.current = null
  }

  const onDown = (e: ReactPointerEvent) => {
    if (!me || me.stunnedUntil > Date.now() || state.phase !== 'playing') return
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
      stitches: 0,
      steals: 0,
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
      stitches: peelLive.current?.stitches ?? 0,
      steals: peelLive.current?.steals ?? 0,
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
      stitches: peelLive.current?.stitches ?? 0,
      steals: peelLive.current?.steals ?? 0,
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
        const stealth = mine && peel.mode === 'quiet' && peel.amount < QUIET_REVEAL
        const need = STITCHES_NEEDED[peel.mode]
        const visible =
          thieving || !stealth
            ? (victim?.items.filter((it) => inPeelBand(it, peel)) ?? [])
            : []
        const isLive = thieving && localPeel?.id === peel.id
        return (
          <Fragment key={peel.id}>
            <div
              ref={isLive ? stripRef : undefined}
              data-peel-id={peel.id}
              className={`peel-strip absolute z-10 overflow-hidden ${
                peel.mode === 'kick' ? 'peel-strip-kick' : 'peel-strip-quiet'
              } ${stealth ? 'peel-stealth' : ''} ${mine ? 'peel-stitchable' : ''}`}
              style={stripStyle(peel)}
              onPointerDown={mine ? (e) => stitchDown(e, peel) : (e) => e.stopPropagation()}
              onPointerMove={mine ? stitchMove : undefined}
              onPointerUp={mine ? stitchUp : undefined}
              onPointerCancel={mine ? stitchUp : undefined}
            >
              <div className="peel-paper absolute inset-0" />
              <div className="peel-curl pointer-events-none absolute inset-y-0 right-0 w-3" />
              {mine && !stealth && (
                <div className="stitch-hud pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5">
                  <div className="flex gap-1.5">
                    {Array.from({ length: need }, (_, i) => (
                      <span
                        key={i}
                        className={`stitch-dash ${i < peel.stitches ? 'stitch-dash-on' : ''} ${
                          i === peel.stitches && stitchPulse ? 'stitch-dash-pulse' : ''
                        }`}
                      />
                    ))}
                  </div>
                  <span className="stitch-label">
                    Zigzag stitch · {peel.stitches}/{need}
                  </span>
                </div>
              )}
              {mine && stealth && (
                <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-[10px] tracking-widest text-paper/40 uppercase">
                  Soft tear…
                </span>
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

      {stunned && (
        <div className="freeze-veil pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2">
          <p className="font-display text-2xl font-extrabold tracking-wide text-paper">
            FROZEN
          </p>
          <p className="text-sm text-paper-dim">
            Hands shake · {(Math.max(0, stunUntil - now) / 1000).toFixed(1)}s
          </p>
        </div>
      )}

      {state.phase === 'playing' && !stunned && (
        <p className="hint-bar pointer-events-none absolute bottom-4 left-1/2 z-20 w-[92%] -translate-x-1/2 text-center text-xs">
          {localPeel && !drag.current
            ? 'Tap loot (2 max) · Seal or tap empty to close'
            : incoming.some((p) => p.mode === 'quiet' && p.amount < QUIET_REVEAL)
              ? 'Soft tear… listen for it, then zigzag stitch'
              : incoming.length
                ? 'Zigzag across the tear to stitch them out'
                : 'Pull inward from the glowing edges — release to keep the tear open'}
        </p>
      )}
    </div>
  )
}

export const RoomCanvas = memo(RoomCanvasImpl)

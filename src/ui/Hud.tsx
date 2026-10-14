import { useEffect, useState } from 'react'
import { ROUND_MS, type GameState } from '@/lib/types'

type Props = {
  roomCode: string
  state: GameState
  selfId: string
  targetId: string | null
  kickArmed: boolean
  onSelectTarget: (id: string) => void
  onToggleKick: () => void
}

function formatTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = (s / 60) | 0
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function Hud({
  roomCode,
  state,
  selfId,
  targetId,
  kickArmed,
  onSelectTarget,
  onToggleKick,
}: Props) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const left = state.phase === 'playing' ? state.roundEndsAt - now : ROUND_MS
  const me = state.players[selfId]
  const stunned = !!(me && me.stunnedUntil > now)
  const others = Object.values(state.players).filter((p) => p.id !== selfId)
  const ranked = Object.values(state.players).sort((a, b) => b.score - a.score)

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2 p-3">
      <div className="pointer-events-auto flex items-start justify-between gap-2">
        <div className="rounded-xl bg-ink/75 px-3 py-2 backdrop-blur-sm ring-1 ring-paper/10">
          <p className="text-[10px] tracking-[0.18em] text-paper-dim uppercase">Room</p>
          <p className="font-display text-lg tracking-[0.2em] text-ember">{roomCode}</p>
        </div>
        <div className="rounded-xl bg-ink/75 px-4 py-2 text-center backdrop-blur-sm ring-1 ring-paper/10">
          <p className="text-[10px] tracking-[0.18em] text-paper-dim uppercase">Time</p>
          <p
            className={`font-display text-2xl tabular-nums ${
              left < 15_000 ? 'text-danger' : 'text-paper'
            }`}
          >
            {formatTime(left)}
          </p>
        </div>
        <div className="min-w-[4.5rem] rounded-xl bg-ink/75 px-3 py-2 text-right backdrop-blur-sm ring-1 ring-paper/10">
          <p className="text-[10px] tracking-[0.18em] text-paper-dim uppercase">You</p>
          <p className="font-display text-xl text-paper">{me?.score ?? 0}</p>
        </div>
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        {ranked.slice(0, 4).map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-2/80 px-2.5 py-1 text-xs ring-1 ring-paper/8"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="max-w-[5rem] truncate">{p.name}</span>
            <span className="tabular-nums text-paper-dim">{p.score}</span>
          </span>
        ))}
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <span className="text-[10px] tracking-widest text-paper-dim uppercase">Target</span>
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectTarget(p.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
              targetId === p.id
                ? 'bg-ember text-ink ring-2 ring-ember-hot'
                : 'bg-ink/70 text-paper ring-1 ring-paper/15'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onToggleKick}
          className={`ml-auto rounded-full px-3 py-1.5 text-sm font-medium transition ${
            kickArmed
              ? 'bg-danger text-paper ring-2 ring-danger/60'
              : 'bg-ink/70 text-paper-dim ring-1 ring-paper/15'
          }`}
        >
          {kickArmed ? 'Door Kick armed' : 'Quiet peel'}
        </button>
      </div>

      {stunned && (
        <div className="pointer-events-none mt-1 rounded-xl bg-danger/90 px-4 py-2 text-center font-display text-sm tracking-wide text-paper shadow-lg">
          Stunned — hands shake, peel later
        </div>
      )}
    </div>
  )
}

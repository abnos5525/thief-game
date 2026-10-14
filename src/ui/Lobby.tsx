import type { GameState } from '@/lib/types'

type Props = {
  roomCode: string
  state: GameState | null
  selfId: string
  isHost: boolean
  peerCount: number
  netHint: string | null
  brokerReady: boolean
  onReady: () => void
  onStart: () => void
  onLeave: () => void
}

export function Lobby({
  roomCode,
  state,
  selfId,
  isHost,
  peerCount,
  netHint,
  brokerReady,
  onReady,
  onStart,
  onLeave,
}: Props) {
  const players = state ? Object.values(state.players) : []
  const me = state?.players[selfId]
  const allReady = players.length >= 2 && players.every((p) => p.ready)
  const canStart = isHost && players.length >= 2

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-6 px-5 py-8">
      <header className="space-y-1">
        <p className="font-display text-xs tracking-[0.2em] text-paper-dim uppercase">
          Waiting room
        </p>
        <h1 className="font-display text-4xl font-extrabold text-paper">Room Peel</h1>
        <p className="text-paper-dim">Share the code. Peel when ready.</p>
      </header>

      <div className="rounded-2xl border border-paper/10 bg-ink-2/80 px-5 py-4 shadow-[inset_0_1px_0_rgba(243,230,212,0.06)]">
        <p className="text-xs tracking-widest text-paper-dim uppercase">Room code</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="font-display text-3xl tracking-[0.35em] text-ember">{roomCode}</p>
          <button
            type="button"
            className="rounded-lg bg-paper/10 px-3 py-2 text-xs tracking-wide text-paper-dim uppercase hover:bg-paper/15 hover:text-paper"
            onClick={() => {
              const url = `${location.origin}${location.pathname}?room=${roomCode}`
              void navigator.clipboard?.writeText(`${roomCode} — ${url}`)
            }}
          >
            Copy
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg text-paper">Crew</h2>
          <span className="text-sm text-paper-dim">{players.length}/6</span>
        </div>
        <p className="text-xs text-paper-dim">
          Relay:{' '}
          <span className={brokerReady ? 'text-moss' : 'text-ember'}>
            {brokerReady ? 'online' : 'connecting…'}
          </span>
          {' · '}
          heard: <span className="text-paper">{peerCount}</span>
        </p>
        {netHint && (
          <p className="animate-pulse text-sm text-ember">{netHint}</p>
        )}
        {!state && (
          <p className="animate-pulse text-sm text-paper-dim">
            Waiting for host snapshot…
          </p>
        )}
        {state && !state.players[selfId] && (
          <p className="animate-pulse text-sm text-paper-dim">Joining crew…</p>
        )}
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl bg-ink-2/60 px-3 py-2.5"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              <span className="flex-1 truncate font-medium">
                {p.name}
                {p.id === selfId ? ' (you)' : ''}
                {state?.hostId === p.id ? ' · host' : ''}
              </span>
              <span
                className={
                  p.ready ? 'text-moss text-sm font-medium' : 'text-paper-dim text-sm'
                }
              >
                {p.ready ? 'Ready' : '…'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <button
          type="button"
          onClick={onReady}
          disabled={!me}
          className={`rounded-xl px-4 py-3.5 font-display text-lg font-semibold transition active:scale-[0.98] ${
            me?.ready
              ? 'bg-moss/20 text-moss ring-1 ring-moss/40'
              : 'bg-ember text-ink hover:bg-ember-hot'
          }`}
        >
          {me?.ready ? 'Unready' : 'Ready up'}
        </button>
        {canStart && (
          <button
            type="button"
            onClick={onStart}
            className={`rounded-xl px-4 py-3.5 font-display text-lg font-semibold text-ink transition active:scale-[0.98] ${
              allReady ? 'bg-paper hover:bg-paper-dim' : 'bg-paper/70 hover:bg-paper'
            }`}
          >
            {allReady ? 'Start heist' : 'Start anyway'}
          </button>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="py-2 text-sm text-paper-dim underline-offset-4 hover:text-paper hover:underline"
        >
          Leave room
        </button>
        <p className="text-center text-[10px] tracking-widest text-paper-dim/70 uppercase">
          build relay-v3
        </p>
      </div>
    </div>
  )
}

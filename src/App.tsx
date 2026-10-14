import { useEffect } from 'react'
import { useGame } from '@/hooks/useGame'
import { normalizeRoomCode } from '@/lib/roomCode'
import { GameScreen } from '@/ui/GameScreen'
import { Lobby } from '@/ui/Lobby'

export default function App() {
  const game = useGame()

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('room')
    if (q) game.setJoinInput(normalizeRoomCode(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, [])

  if (game.view === 'room' && game.selfId) {
    const phase = game.state?.phase ?? 'lobby'
    if (phase === 'playing' || phase === 'ended') {
      return <GameScreen game={game} />
    }
    return (
      <Lobby
        roomCode={game.roomCode}
        state={game.state}
        selfId={game.selfId}
        isHost={game.isHost}
        peerCount={game.peerCount}
        netHint={game.netHint}
        brokerReady={game.brokerReady}
        onReady={game.toggleReady}
        onStart={game.start}
        onLeave={() => void game.leave()}
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center gap-8 px-5 py-10">
      <header className="space-y-3 text-center">
        <p className="text-[11px] tracking-[0.28em] text-moss uppercase">Live heist</p>
        <h1 className="font-display text-6xl leading-none font-extrabold tracking-tight text-paper sm:text-7xl">
          Room Peel
        </h1>
        <p className="font-display text-lg text-ember sm:text-xl">
          peel the wall. steal the loot.
        </p>
      </header>

      <div className="space-y-4 rounded-2xl border border-paper/10 bg-ink-2/70 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <label className="block space-y-1.5">
          <span className="text-xs tracking-widest text-paper-dim uppercase">Alias</span>
          <input
            value={game.name}
            onChange={(e) => game.setName(e.target.value.slice(0, 16))}
            placeholder="Thief name"
            maxLength={16}
            className="w-full rounded-xl border border-paper/15 bg-ink px-4 py-3 text-paper outline-none placeholder:text-paper-dim/50 focus:border-ember/60"
            autoComplete="nickname"
          />
        </label>

        {game.error && (
          <p className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">{game.error}</p>
        )}

        <button
          type="button"
          onClick={game.createRoom}
          className="w-full rounded-xl bg-ember py-3.5 font-display text-lg font-semibold text-ink transition hover:bg-ember-hot active:scale-[0.98]"
        >
          Create Room
        </button>

        <div className="relative py-1 text-center text-xs tracking-widest text-paper-dim uppercase">
          <span className="bg-ink-2 relative z-10 px-3">or join</span>
          <span className="absolute inset-x-0 top-1/2 h-px bg-paper/10" />
        </div>

        <div className="flex gap-2">
          <input
            value={game.joinInput}
            onChange={(e) => game.setJoinInput(normalizeRoomCode(e.target.value))}
            placeholder="CODE"
            maxLength={4}
            className="w-28 rounded-xl border border-paper/15 bg-ink px-3 py-3 text-center font-display text-xl tracking-[0.25em] text-ember uppercase outline-none focus:border-ember/60"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={game.joinRoom}
            className="flex-1 rounded-xl bg-paper py-3 font-display text-lg font-semibold text-ink transition hover:bg-paper-dim active:scale-[0.98]"
          >
            Join
          </button>
        </div>
      </div>

      <p className="text-center text-xs leading-relaxed text-paper-dim">
        Drag from the edges of your room. Quiet peels are slow. Door Kick is loud — and
        slamable.
      </p>
    </div>
  )
}

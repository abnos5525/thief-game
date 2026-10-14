import type { GameApi } from '@/hooks/useGame'
import { Hud } from './Hud'
import { RoomCanvas } from './RoomCanvas'

type Props = {
  game: GameApi
}

export function GameScreen({ game }: Props) {
  const { state, selfId, roomCode } = game
  if (!state || !selfId) return null

  const winner = state.winnerId ? state.players[state.winnerId] : null
  const iWon = state.winnerId === selfId

  return (
    <div className="relative h-full w-full overflow-hidden">
      <RoomCanvas
        state={state}
        selfId={selfId}
        targetId={game.targetId}
        kickArmed={game.kickArmed}
        onArmKick={() => game.setKickArmed(true)}
        onPeelStart={game.peelStart}
        onPeelUpdate={game.peelUpdate}
        onPeelEnd={game.peelEnd}
        onSteal={game.steal}
        onStitch={game.stitch}
      />

      <Hud
        roomCode={roomCode}
        state={state}
        selfId={selfId}
        targetId={game.targetId}
        kickArmed={game.kickArmed}
        onSelectTarget={game.setTargetId}
        onToggleKick={() => game.setKickArmed((v) => !v)}
      />

      {state.phase === 'ended' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/75 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-paper/15 bg-ink-2 px-6 py-8 text-center shadow-2xl">
            <p className="text-xs tracking-[0.25em] text-paper-dim uppercase">Round over</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold text-paper">
              {iWon ? 'You cleaned house' : 'Heist settled'}
            </h2>
            {winner && (
              <p className="mt-3 text-lg text-ember">
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                  style={{ background: winner.color }}
                />
                {winner.name} · {winner.score} pts
              </p>
            )}
            <ul className="mt-5 space-y-1.5 text-left text-sm text-paper-dim">
              {Object.values(state.players)
                .sort((a, b) => b.score - a.score)
                .map((p, i) => (
                  <li key={p.id} className="flex justify-between rounded-lg bg-ink/50 px-3 py-1.5">
                    <span>
                      {i + 1}. {p.name}
                    </span>
                    <span className="tabular-nums text-paper">{p.score}</span>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              onClick={game.playAgain}
              disabled={!game.isHost}
              className="mt-6 w-full rounded-xl bg-ember py-3.5 font-display text-lg font-semibold text-ink transition hover:bg-ember-hot active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {game.isHost ? 'Play again' : 'Waiting on host…'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

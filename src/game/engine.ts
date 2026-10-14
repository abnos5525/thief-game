import { mulberry32 } from '../lib/rng'
import {
  ITEM_VALUE,
  PEEL_MAX,
  ROUND_MS,
  STUN_MS,
  type Edge,
  type GameState,
  type PeelMode,
  type Player,
} from '../lib/types'
import { electHost } from './host'
import { spawnItems } from './items'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function isStunned(player: Player, now: number): boolean {
  return player.stunnedUntil > now
}

export function createLobbyState(hostId: string, seed: number): GameState {
  return {
    phase: 'lobby',
    hostId,
    roundEndsAt: 0,
    players: {},
    peels: [],
    winnerId: null,
    seed,
  }
}

export function addPlayer(state: GameState, player: Player): GameState {
  return { ...state, players: { ...state.players, [player.id]: player } }
}

export function removePlayer(state: GameState, id: string): GameState {
  const { [id]: _, ...players } = state.players
  const ids = Object.keys(players)
  return {
    ...state,
    hostId: state.hostId === id && ids.length ? electHost(ids) : state.hostId,
    players,
    peels: state.peels.filter((p) => p.thiefId !== id && p.victimId !== id),
  }
}

export function setReady(state: GameState, id: string, ready: boolean): GameState {
  const p = state.players[id]
  if (!p) return state
  return { ...state, players: { ...state.players, [id]: { ...p, ready } } }
}

export function startRound(state: GameState, now: number): GameState {
  const players: Record<string, Player> = {}
  for (const id of Object.keys(state.players)) {
    const p = state.players[id]!
    const rng = mulberry32(state.seed + hash(id))
    players[id] = {
      ...p,
      ready: false,
      score: 0,
      stunnedUntil: 0,
      items: spawnItems(rng, 6 + ((rng() * 3) | 0)),
    }
  }
  return {
    ...state,
    phase: 'playing',
    roundEndsAt: now + ROUND_MS,
    players,
    peels: [],
    winnerId: null,
  }
}

export function applyPeelStart(
  state: GameState,
  thiefId: string,
  victimId: string,
  edge: Edge,
  mode: PeelMode,
  along: number,
  now: number,
  peelId?: string,
): GameState {
  const thief = state.players[thiefId]
  if (!thief || isStunned(thief, now)) return state
  if (!state.players[victimId] || victimId === thiefId) return state
  const peel = {
    id: peelId ?? `peel-${thiefId}-${now}`,
    thiefId,
    victimId,
    edge,
    mode,
    amount: mode === 'kick' ? 0.18 : 0.06,
    along,
  }
  return {
    ...state,
    peels: [...state.peels.filter((p) => p.thiefId !== thiefId), peel],
  }
}

export function applyPeelUpdate(
  state: GameState,
  peelId: string,
  amount: number,
  along: number,
): GameState {
  const clamped = Math.min(PEEL_MAX, Math.max(0, amount))
  return {
    ...state,
    peels: state.peels.map((p) =>
      p.id === peelId ? { ...p, amount: clamped, along } : p,
    ),
  }
}

export function applyPeelEnd(state: GameState, peelId: string): GameState {
  return { ...state, peels: state.peels.filter((p) => p.id !== peelId) }
}

export function applySteal(state: GameState, peelId: string, itemId: string): GameState {
  const peel = state.peels.find((p) => p.id === peelId)
  const victim = peel && state.players[peel.victimId]
  const thief = peel && state.players[peel.thiefId]
  const item = victim?.items.find((i) => i.id === itemId)
  if (!peel || !victim || !thief || !item) return state
  return {
    ...state,
    players: {
      ...state.players,
      [victim.id]: { ...victim, items: victim.items.filter((i) => i.id !== itemId) },
      [thief.id]: { ...thief, score: thief.score + ITEM_VALUE[item.kind] },
    },
  }
}

export function applySlam(state: GameState, peelId: string, now: number): GameState {
  const peel = state.peels.find((p) => p.id === peelId)
  const thief = peel && state.players[peel.thiefId]
  if (!peel || !thief) return state
  return {
    ...state,
    peels: state.peels.filter((p) => p.id !== peelId),
    players: {
      ...state.players,
      [thief.id]: { ...thief, stunnedUntil: now + STUN_MS },
    },
  }
}

export function tickRound(state: GameState, now: number): GameState {
  if (state.phase !== 'playing' || now < state.roundEndsAt) return state
  let winnerId: string | null = null
  for (const id of Object.keys(state.players)) {
    const score = state.players[id]!.score
    if (
      !winnerId ||
      score > state.players[winnerId]!.score ||
      (score === state.players[winnerId]!.score && id < winnerId)
    ) {
      winnerId = id
    }
  }
  return { ...state, phase: 'ended', winnerId }
}

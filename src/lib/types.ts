export const APP_ID = 'roompeelv4'

export type Edge = 'top' | 'right' | 'bottom' | 'left'
export type PeelMode = 'quiet' | 'kick'
export type Phase = 'lobby' | 'playing' | 'ended'

export type ItemKind = 'gem' | 'coin' | 'key' | 'trophy' | 'vial'

export const ITEM_VALUE: Record<ItemKind, number> = {
  gem: 50,
  coin: 10,
  key: 25,
  trophy: 100,
  vial: 35,
}

export const ITEM_EMOJI: Record<ItemKind, string> = {
  gem: '💎',
  coin: '🪙',
  key: '🔑',
  trophy: '🏆',
  vial: '🧪',
}

export const ROUND_MS = 90_000
export const STUN_MS = 1_000
export const MAX_PLAYERS = 6
export const PEEL_MAX = 0.42
/** A tear rips shut after this many steals. */
export const MAX_STEALS_PER_PEEL = 1
/** Swipes across the tear needed to stitch it shut. */
export const STITCHES_NEEDED: Record<PeelMode, number> = { quiet: 3, kick: 2 }
/** Victim reward for stitching a thief out. */
export const SLAM_BOUNTY = 15
/** Quiet tears stay a faint shimmer for the victim until this deep. */
export const QUIET_REVEAL = 0.2

export type Item = {
  id: string
  kind: ItemKind
  x: number
  y: number
}

export type Player = {
  id: string
  name: string
  color: string
  ready: boolean
  score: number
  stunnedUntil: number
  items: Item[]
}

export type Peel = {
  id: string
  thiefId: string
  victimId: string
  edge: Edge
  mode: PeelMode
  amount: number
  along: number
  stitches: number
  steals: number
}

export type GameState = {
  phase: Phase
  hostId: string
  roundEndsAt: number
  players: Record<string, Player>
  peels: Peel[]
  winnerId: string | null
  seed: number
}

export type NetMsg =
  | { t: 'hello'; name: string; color: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'state'; state: GameState; at: number }
  | { t: 'ping' }
  | { t: 'sync' }
  | {
      t: 'peelStart'
      peelId: string
      victimId: string
      edge: Edge
      mode: PeelMode
      along: number
    }
  | { t: 'peelUpdate'; peelId: string; amount: number; along: number }
  | { t: 'peelEnd'; peelId: string }
  | { t: 'steal'; peelId: string; itemId: string }
  | { t: 'stitch'; peelId: string }

export const PLAYER_COLORS = [
  '#e8a87c',
  '#85dcb8',
  '#c38d9e',
  '#41b3a3',
  '#f2d096',
  '#7ea6e0',
] as const

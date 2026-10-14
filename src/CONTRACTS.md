# Subagent contracts — Room Peel

Shared types: `src/lib/types.ts`, `src/lib/roomCode.ts`, `src/lib/rng.ts`

## net (`src/net/`)

Export `createRoomSession(opts)`:

```ts
type Session = {
  selfId: string
  leave: () => Promise<void>
  send: (msg: NetMsg, target?: string) => void
  onMessage: (fn: (msg: NetMsg, peerId: string) => void) => () => void
  onPeerJoin: (fn: (peerId: string) => void) => () => void
  onPeerLeave: (fn: (peerId: string) => void) => () => void
  getPeers: () => string[]
}
```

- Trystero Nostr `joinRoom({ appId: APP_ID }, roomCode)`
- One action channel `msg`
- Short files, no React here

## game (`src/game/`)

Pure functions only (no React, no Trystero):

- `createLobbyState(hostId, seed)`
- `addPlayer(state, player)` / `removePlayer(state, id)`
- `setReady(state, id, ready)`
- `startRound(state, now)` — spawn items per player via seeded rng
- `applyPeelStart/Update/End`, `applySteal`, `applySlam`
- `tickRound(state, now)` — end round, pick winner
- `electHost(playerIds: string[]): string` — lowest id
- `spawnItems(rng, count): Item[]`

Keep reducers immutable. Files ≤ ~120 lines each.

## ui (`src/ui/` + `src/hooks/`)

- `Lobby.tsx` — create/join code, name, ready, start (host)
- `GameScreen.tsx` — room, peel gesture, slam, HUD, timer, scores
- `RoomCanvas.tsx` — items + peel strips
- `useSession.ts` — wires net + engine + local player

Touch + mouse. Mobile-first. Tailwind only. No extra UI libs.

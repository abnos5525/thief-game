# Room Peel

Peel open a friend’s wall. Steal their loot. Slam the thieves. Live P2P heist for 2–6 players — no server, no database.

## Play

1. Open the site, enter a name, **Create Room**
2. Share the **4-character code**
3. Friends **Join** → Ready → Host starts
4. Drag **inward from any screen edge** toward your target
5. Tap items inside the peel strip to steal
6. If someone peels **you**, hit **SLAM** to stun them

**Quiet peel** = slower, quieter · **Door Kick** (toggle or double-tap edge) = faster, louder

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- [Trystero](https://trystero.dev) (WebRTC over public Nostr relays)
- Host-authoritative game state · no backend

## Dev

```bash
pnpm install
pnpm dev
```

Open two browsers (or phone + desktop), create/join the same room.

## GitHub Pages

Workflow deploys `dist/` to Pages on push to `main`.

Site: `https://abnos5525.github.io/thief-game/`

Local GH-base build:

```bash
# Windows PowerShell
$env:GH_PAGES='1'; pnpm build
```

## Controls

| Action | How |
|--------|-----|
| Peel | Drag from top/right/bottom/left edge |
| Door Kick | Arm toggle in HUD, or double-tap edge |
| Steal | Tap emoji inside your peel strip |
| Slam | Tap SLAM on a peel into your room |
| Target | Tap player chips in the HUD |

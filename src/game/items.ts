import type { Item, ItemKind } from '../lib/types'

const KINDS: ItemKind[] = ['gem', 'coin', 'key', 'trophy', 'vial']

/** Spawn `count` items with random kinds at x/y in [0.12, 0.88]. */
export function spawnItems(rng: () => number, count: number): Item[] {
  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    items.push({
      id: `i${i}-${(rng() * 1e9) | 0}`,
      kind: KINDS[(rng() * KINDS.length) | 0]!,
      x: 0.12 + rng() * 0.76,
      y: 0.12 + rng() * 0.76,
    })
  }
  return items
}

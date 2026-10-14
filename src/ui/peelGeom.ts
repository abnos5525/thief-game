import { PEEL_MAX, type Edge, type Item, type Peel, type PeelMode } from '@/lib/types'
import type { CSSProperties } from 'react'

/** Wider grab zone — mouse + touch friendly. */
export const EDGE_ZONE = 56
export const DOUBLE_MS = 320
/** Keep peel open after release once dragged this far. */
export const PEEL_HOLD_MIN = 0.1
/** Wider loot catch band along the peel. */
export const PEEL_BAND = 0.2

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export function hitEdge(x: number, y: number, w: number, h: number): Edge | null {
  const nearT = y <= EDGE_ZONE
  const nearB = y >= h - EDGE_ZONE
  const nearL = x <= EDGE_ZONE
  const nearR = x >= w - EDGE_ZONE
  // Prefer the closest edge when in a corner.
  const scores: [Edge, number][] = []
  if (nearT) scores.push(['top', y])
  if (nearB) scores.push(['bottom', h - y])
  if (nearL) scores.push(['left', x])
  if (nearR) scores.push(['right', w - x])
  if (!scores.length) return null
  scores.sort((a, b) => a[1] - b[1])
  return scores[0]![0]
}

export function alongOf(edge: Edge, x: number, y: number, w: number, h: number) {
  return edge === 'top' || edge === 'bottom' ? clamp(x / w, 0.08, 0.92) : clamp(y / h, 0.12, 0.92)
}

export function amountOf(
  edge: Edge,
  sx: number,
  sy: number,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: PeelMode,
) {
  // Desktop mice travel less than thumbs — amplify inward drag.
  const gain = mode === 'kick' ? 1.7 : 1.35
  let raw = 0
  if (edge === 'top') raw = (y - sy) / h
  else if (edge === 'bottom') raw = (sy - y) / h
  else if (edge === 'left') raw = (x - sx) / w
  else raw = (sx - x) / w
  return clamp(raw * gain, 0, PEEL_MAX)
}

export function inPeelBand(item: Item, peel: Peel) {
  const half = PEEL_BAND
  const a = peel.along
  const pad = 0.02
  if (peel.edge === 'left')
    return item.x <= peel.amount + pad && item.y >= a - half && item.y <= a + half
  if (peel.edge === 'right')
    return item.x >= 1 - peel.amount - pad && item.y >= a - half && item.y <= a + half
  if (peel.edge === 'top')
    return item.y <= peel.amount + pad && item.x >= a - half && item.x <= a + half
  return item.y >= 1 - peel.amount - pad && item.x >= a - half && item.x <= a + half
}

export function stripStyle(peel: Peel): CSSProperties {
  const d = `${Math.max(peel.amount, 0.06) * 100}%`
  const along = `${peel.along * 100}%`
  const thick = '48%'
  if (peel.edge === 'left')
    return { left: 0, top: along, width: d, height: thick, transform: 'translateY(-50%)' }
  if (peel.edge === 'right')
    return { right: 0, top: along, width: d, height: thick, transform: 'translateY(-50%)' }
  if (peel.edge === 'top')
    return { top: 0, left: along, height: d, width: thick, transform: 'translateX(-50%)' }
  return { bottom: 0, left: along, height: d, width: thick, transform: 'translateX(-50%)' }
}

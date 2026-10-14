import { PEEL_MAX, type Edge, type Item, type Peel, type PeelMode } from '@/lib/types'
import type { CSSProperties } from 'react'

export const EDGE_ZONE = 36
export const DOUBLE_MS = 320

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export function hitEdge(x: number, y: number, w: number, h: number): Edge | null {
  if (y <= EDGE_ZONE) return 'top'
  if (y >= h - EDGE_ZONE) return 'bottom'
  if (x <= EDGE_ZONE) return 'left'
  if (x >= w - EDGE_ZONE) return 'right'
  return null
}

export function alongOf(edge: Edge, x: number, y: number, w: number, h: number) {
  return edge === 'top' || edge === 'bottom' ? clamp(x / w, 0, 1) : clamp(y / h, 0, 1)
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
  let raw = 0
  if (edge === 'top') raw = (y - sy) / h
  else if (edge === 'bottom') raw = (sy - y) / h
  else if (edge === 'left') raw = (x - sx) / w
  else raw = (sx - x) / w
  return clamp(raw * (mode === 'kick' ? 1.35 : 0.9), 0, PEEL_MAX)
}

export function inPeelBand(item: Item, peel: Peel) {
  const half = 0.14
  const a = peel.along
  if (peel.edge === 'left')
    return item.x <= peel.amount && item.y >= a - half && item.y <= a + half
  if (peel.edge === 'right')
    return item.x >= 1 - peel.amount && item.y >= a - half && item.y <= a + half
  if (peel.edge === 'top')
    return item.y <= peel.amount && item.x >= a - half && item.x <= a + half
  return item.y >= 1 - peel.amount && item.x >= a - half && item.x <= a + half
}

export function stripStyle(peel: Peel): CSSProperties {
  const d = `${peel.amount * 100}%`
  const along = `${peel.along * 100}%`
  const thick = '42%'
  if (peel.edge === 'left')
    return { left: 0, top: along, width: d, height: thick, transform: 'translateY(-50%)' }
  if (peel.edge === 'right')
    return { right: 0, top: along, width: d, height: thick, transform: 'translateY(-50%)' }
  if (peel.edge === 'top')
    return { top: 0, left: along, height: d, width: thick, transform: 'translateX(-50%)' }
  return { bottom: 0, left: along, height: d, width: thick, transform: 'translateX(-50%)' }
}

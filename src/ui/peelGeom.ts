import { PEEL_MAX, type Edge, type Item, type Peel, type PeelMode } from '@/lib/types'
import type { CSSProperties } from 'react'

export const DOUBLE_MS = 300
export const PEEL_HOLD_MIN = 0.08
export const PEEL_BAND = 0.22

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

/** Responsive edge hit — % of the shorter side, clamped in px. */
export function edgeZonePx(w: number, h: number) {
  return clamp(Math.min(w, h) * 0.12, 48, 88)
}

export function hitEdge(x: number, y: number, w: number, h: number): Edge | null {
  const z = edgeZonePx(w, h)
  const dist: [Edge, number][] = [
    ['top', y],
    ['bottom', h - y],
    ['left', x],
    ['right', w - x],
  ]
  dist.sort((a, b) => a[1] - b[1])
  const [edge, d] = dist[0]!
  return d <= z ? edge : null
}

export function alongOf(edge: Edge, x: number, y: number, w: number, h: number) {
  return edge === 'top' || edge === 'bottom'
    ? clamp(x / w, 0.06, 0.94)
    : clamp(y / h, 0.1, 0.9)
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
  // Strong gain so a short mouse/finger drag opens a visible peel.
  const gain = mode === 'kick' ? 2.1 : 1.75
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
  const depth = peel.amount + 0.03
  if (peel.edge === 'left')
    return item.x <= depth && item.y >= a - half && item.y <= a + half
  if (peel.edge === 'right')
    return item.x >= 1 - depth && item.y >= a - half && item.y <= a + half
  if (peel.edge === 'top')
    return item.y <= depth && item.x >= a - half && item.x <= a + half
  return item.y >= 1 - depth && item.x >= a - half && item.x <= a + half
}

export function stripStyle(peel: Peel): CSSProperties {
  const d = `${Math.max(peel.amount, 0.1) * 100}%`
  const along = `${peel.along * 100}%`
  const thick = '52%'
  if (peel.edge === 'left')
    return { left: 0, top: along, width: d, height: thick, transform: 'translateY(-50%)' }
  if (peel.edge === 'right')
    return { right: 0, top: along, width: d, height: thick, transform: 'translateY(-50%)' }
  if (peel.edge === 'top')
    return { top: 0, left: along, height: d, width: thick, transform: 'translateX(-50%)' }
  return { bottom: 0, left: along, height: d, width: thick, transform: 'translateX(-50%)' }
}

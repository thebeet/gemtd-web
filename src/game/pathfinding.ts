import type * as Y from 'yjs'
import type { Cell } from './types'
import { cellKey, routeSegmentsForBlockedCells } from './grid'
import { isBuildableCell } from './towers'

export { findPath } from './grid'

export function calculateRouteSegments(towers: Y.Map<string>, extraBlocked?: Cell): Cell[][] | null {
  const blocked = new Set(towers.keys())
  if (extraBlocked) blocked.add(cellKey(extraBlocked))
  return routeSegmentsForBlockedCells(blocked)
}

export function calculateRoute(towers: Y.Map<string>, extraBlocked?: Cell): Cell[] | null {
  const segments = calculateRouteSegments(towers, extraBlocked)
  if (!segments) return null
  const route: Cell[] = []
  segments.forEach((segment, index) => {
    route.push(...(index === 0 ? segment : segment.slice(1)))
  })
  return route
}

export function routeLengthFromTowers(towers: Y.Map<string>) {
  const route = calculateRoute(towers)
  return route?.length ? route.length - 1 : 0
}

export function isRouteBlocked(towers: Y.Map<string>, extraBlocked?: Cell) {
  return calculateRoute(towers, extraBlocked) === null
}

export function isPlacementCell(cell: Cell, towers: Y.Map<string>) {
  return isBuildableCell(cell, towers)
}

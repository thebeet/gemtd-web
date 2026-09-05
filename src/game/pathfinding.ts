import type * as Y from 'yjs'
import { GRID_SIZE, routePoints } from './constants'
import type { Cell } from './types'
import { cellKey, isBuildableCell, isReservedBuildCell, isValidCell, routePointAt } from './towers'

export function findPath(start: Cell, end: Cell, blocked: Set<string>): Cell[] | null {
  const queue: Cell[] = [start]
  const visited = new Set([cellKey(start)])
  const previous = new Map<string, Cell>()
  const directions = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }]
  let cursor = 0

  while (cursor < queue.length) {
    const current = queue[cursor++]
    if (current.x === end.x && current.z === end.z) {
      const path: Cell[] = [current]
      let currentKey = cellKey(current)
      while (currentKey !== cellKey(start)) {
        const parent = previous.get(currentKey)
        if (!parent) return null
        path.push(parent)
        currentKey = cellKey(parent)
      }
      return path.reverse()
    }

    for (const direction of directions) {
      const next = { x: current.x + direction.x, z: current.z + direction.z }
      const nextKey = cellKey(next)
      if (!isValidCell(next) || blocked.has(nextKey) || visited.has(nextKey)) continue
      visited.add(nextKey)
      previous.set(nextKey, current)
      queue.push(next)
    }
  }
  return null
}

export function calculateRouteSegments(towers: Y.Map<string>, extraBlocked?: Cell): Cell[][] | null {
  const blocked = new Set<string>()
  towers.forEach((_tower, towerKey) => blocked.add(towerKey))
  if (extraBlocked) blocked.add(cellKey(extraBlocked))
  routePoints.forEach((point) => blocked.delete(cellKey(point)))

  const segments: Cell[][] = []
  for (let index = 0; index < routePoints.length - 1; index++) {
    const segment = findPath(routePoints[index], routePoints[index + 1], blocked)
    if (!segment) return null
    segments.push(segment)
  }
  return segments
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

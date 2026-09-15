import { CORNER_ZONE_SIZE, GRID_SIZE, routePoints } from './constants'
import type { Cell } from './types'

export function cellKey(cell: Cell) {
  return `${cell.x}:${cell.z}`
}

export function isValidCell(cell: Cell) {
  return cell.x >= 0 && cell.x < GRID_SIZE && cell.z >= 0 && cell.z < GRID_SIZE
}

export function routePointAt(cell: Cell) {
  return routePoints.find((point) => point.x === cell.x && point.z === cell.z)
}

export function isReservedBuildCell(cell: Cell) {
  const inStartCorner = cell.x < CORNER_ZONE_SIZE && cell.z < CORNER_ZONE_SIZE
  const inEndCorner = cell.x >= GRID_SIZE - CORNER_ZONE_SIZE && cell.z >= GRID_SIZE - CORNER_ZONE_SIZE
  return inStartCorner || inEndCorner
}

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

/** Route through every waypoint, preserving BFS neighbor order for identical combat movement. */
export function routeSegmentsForBlockedCells(cells: Iterable<string>): Cell[][] | null {
  const blocked = new Set(cells)
  routePoints.forEach((point) => blocked.delete(cellKey(point)))
  const segments: Cell[][] = []
  for (let index = 0; index < routePoints.length - 1; index++) {
    const segment = findPath(routePoints[index], routePoints[index + 1], blocked)
    if (!segment) return null
    segments.push(segment)
  }
  return segments
}

export function routeForBlockedCells(cells: Iterable<string>): Cell[] | null {
  const segments = routeSegmentsForBlockedCells(cells)
  return segments?.flatMap((segment, index) => index === 0 ? segment : segment.slice(1)) ?? null
}

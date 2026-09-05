import type * as Y from 'yjs'
import mazeLayoutsData from './mazeLayouts.json'
import { mazeLayoutMeta, type MazeLayoutId } from './mazeLayouts.meta'
import { routePoints } from './constants'
import type { SavedMazeLayout } from './layoutTypes'
import { findPath } from './pathfinding'
import type { Cell } from './types'
import { cellKey, isReservedBuildCell, isValidCell, parseTower, routePointAt } from './towers'

export type { MazeLayoutId }

export type MazeLayout = {
  id: string
  name: string
  summary: string
  pathLen: number
  cells: string[]
}

export const mazeLayouts: MazeLayout[] = (Object.keys(mazeLayoutMeta) as MazeLayoutId[]).map((id) => {
  const generated = mazeLayoutsData[id as keyof typeof mazeLayoutsData]
  return {
    id,
    name: mazeLayoutMeta[id].name,
    summary: mazeLayoutMeta[id].summary,
    pathLen: generated.pathLen,
    cells: generated.cells,
  }
})

export function mazeLayoutById(id: string | undefined, customLayouts: readonly MazeLayout[] = []) {
  if (!id) return undefined
  return mazeLayouts.find((layout) => layout.id === id)
    ?? customLayouts.find((layout) => layout.id === id)
}

export function parseLayoutCellKey(key: string): Cell | undefined {
  const [xText, zText] = key.split(':')
  const x = Number(xText)
  const z = Number(zText)
  if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined
  return { x, z }
}

export function layoutCellSet(layout: MazeLayout | undefined) {
  return new Set(layout?.cells ?? [])
}

/** Path length through layout rocks; -1 if the maze is blocked. */
export function pathLenForBlockedCells(cells: readonly string[]) {
  const blocked = new Set(cells)
  routePoints.forEach((point) => blocked.delete(cellKey(point)))
  let len = 0
  for (let index = 0; index < routePoints.length - 1; index++) {
    const segment = findPath(routePoints[index], routePoints[index + 1], blocked)
    if (!segment) return -1
    len += segment.length - 1
  }
  return len
}

/** Collect permanent towers/rocks as layout cells (towers count as rocks). */
export function collectLayoutCellsFromTowers(towers: Y.Map<string>) {
  const cells: string[] = []
  towers.forEach((raw, key) => {
    const tower = parseTower(raw)
    if (!tower || tower.temporary) return
    const cell = parseLayoutCellKey(key)
    if (!cell || !isValidCell(cell) || isReservedBuildCell(cell) || routePointAt(cell)) return
    cells.push(key)
  })
  cells.sort((left, right) => {
    const [lx, lz] = left.split(':').map(Number)
    const [rx, rz] = right.split(':').map(Number)
    return lz - rz || lx - rx
  })
  return cells
}

export function toMazeLayoutView(layout: SavedMazeLayout): MazeLayout {
  return {
    id: layout.id,
    name: layout.name,
    summary: layout.summary,
    pathLen: layout.pathLen,
    cells: layout.cells,
  }
}

export { cellKey }

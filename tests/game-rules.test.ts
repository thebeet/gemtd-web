import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Y from 'yjs'
import { effectScope, ref } from 'vue'
import { createInitialBattleSnapshot, createInitialBuildState, routePoints } from '../src/game/constants'
import { routeForBlockedCells, cellKey } from '../src/game/grid'
import { mazeLayouts, pathLenForBlockedCells } from '../src/game/mazeLayouts'
import { calculateRoute } from '../src/game/pathfinding'
import { applyInitialEdgeRocks, computeKeepOptions, createBaseTower, parseTower } from '../src/game/towers'
import { attackBonusFromAbilities, selfSpeedBonusFromAbilities, clampMvpStacks } from '../src/game/towerRules'
import { useGameBuildActions } from '../src/composables/useGameBuild'

test('all bundled layouts share the same route in preview and combat', () => {
  for (const layout of mazeLayouts) {
    const doc = new Y.Doc()
    const towers = doc.getMap<string>('towers')
    layout.cells.forEach((key) => towers.set(key, JSON.stringify({ type: 'rock' })))
    const route = routeForBlockedCells(layout.cells)
    assert.ok(route, layout.id)
    assert.deepEqual(calculateRoute(towers), route)
    assert.equal(pathLenForBlockedCells(layout.cells), route.length - 1)
    for (const point of routePoints) assert.ok(route.some((cell) => cellKey(cell) === cellKey(point)))
    for (let i = 1; i < route.length; i++) {
      assert.equal(Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].z - route[i - 1].z), 1)
    }
    doc.destroy()
  }
})

test('edge rocks leave a route, blocked mazes fail, waypoint cells stay passable', () => {
  const doc = new Y.Doc()
  const towers = doc.getMap<string>('towers')
  applyInitialEdgeRocks(towers)
  assert.ok(calculateRoute(towers))
  assert.equal(routeForBlockedCells(Array.from({ length: 37 }, (_, z) => `15:${z}`)), null)
  assert.deepEqual(routeForBlockedCells(routePoints.map(cellKey)), routeForBlockedCells([]))
  doc.destroy()
})

test('shared tower modifiers preserve level caps and strongest-ability selection', () => {
  assert.equal(attackBonusFromAbilities(['tower_attack1', 'tower_attack6', 'tower_attack99']), 640)
  assert.equal(selfSpeedBonusFromAbilities(['tower_speed1', 'tower_speed2']), 500)
  assert.equal(selfSpeedBonusFromAbilities(['tower_speed_aura6']), 0)
  assert.equal(clampMvpStacks(99), 10)
  assert.equal(clampMvpStacks(-1), 0)
  assert.equal(clampMvpStacks('3.9'), 3)
})

test('five candidates can upgrade one tower while converting the rest to rocks', () => {
  const scope = effectScope()
  const doc = new Y.Doc()
  const towers = doc.getMap<string>('towers')
  const battleState = ref(createInitialBattleSnapshot())
  const buildState = ref(createInitialBuildState())
  const selectedTowerKey = ref<string>()
  const playerId = ref('builder')
  const actions = scope.run(() => useGameBuildActions({
    doc, towers, battleState, buildState, playerId, selectedTowerKey,
    connected: ref(true), battleConnected: ref(true),
    saveBuildState: (next) => { buildState.value = next },
    showMessage() {}, clearRemoving() {}, clearSelection() {},
    selectTower: (key) => { selectedTowerKey.value = key },
  }))!
  actions.beginBuildRound()
  assert.equal(buildState.value.phase, 'placing')
  for (let i = 0; i < 5; i++) {
    const key = `${10 + i}:10`
    actions.placeRandomTower(key)
    towers.set(key, JSON.stringify(createBaseTower('ruby', 1, true, playerId.value)))
  }
  assert.equal(buildState.value.phase, 'choosing')
  const option = computeKeepOptions(buildState.value, towers, playerId.value).find((entry) => entry.id.startsWith('upgrade:2:'))!
  assert.ok(option)
  actions.chooseKeepOption(option)
  assert.equal(parseTower(towers.get(option.targetKey))?.quality, 3)
  assert.equal([...towers.values()].filter((raw) => parseTower(raw)?.type === 'rock').length, 4)
  assert.equal(buildState.value.wave, 2)
  assert.equal(buildState.value.phase, 'idle')
  battleState.value.phase = 'combat'
  const before = [...towers.entries()]
  actions.placeRock('20:20')
  actions.swapTowerCells('10:10', '11:10')
  assert.deepEqual([...towers.entries()], before)
  scope.stop()
  doc.destroy()
})

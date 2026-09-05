import type { BaseTowerId, RoutePoint, TowerTypeDef } from './types'

export const GRID_SIZE = 37
export const HALF = (GRID_SIZE - 1) / 2
/** Start/end no-build corners match GemTD: 9×9 cells. */
export const CORNER_ZONE_SIZE = 9
export const RESERVED_ZONE_COLOR = '#e6e8e4'
export const DOTA_UNITS_PER_CELL = 128
export const BASE_TOWER_FOOTPRINT_SCALE = .52
export const BASE_TOWER_MIN_HEIGHT_SCALE = .52
export const ROCK_HEIGHT_SCALE = BASE_TOWER_MIN_HEIGHT_SCALE * (2 / 3)
export const ROCK_BODY_Y = 0.42 * (2 / 3)
export const ROCK_DETAIL_PANEL_Y = 0.9 * (2 / 3)
export const BASE_TOWER_HEIGHT_STEP = .12
/** Target world footprint diameter for recipe towers (cells are ~1 unit). */
export const RECIPE_TOWER_FOOTPRINT = .92
/** Target world height for recipe towers, comparable to a mid-quality base tower. */
export const RECIPE_TOWER_HEIGHT = .95

export const routePoints: RoutePoint[] = [
  { id: 'path1', label: '起点', kind: 'start', x: 4, z: 4 },
  { id: 'path2', label: '1', kind: 'waypoint', x: 4, z: 18 },
  { id: 'path3', label: '2', kind: 'waypoint', x: 32, z: 18 },
  { id: 'path4', label: '3', kind: 'waypoint', x: 32, z: 4 },
  { id: 'path5', label: '4', kind: 'waypoint', x: 18, z: 4 },
  { id: 'path6', label: '5', kind: 'waypoint', x: 18, z: 32 },
  { id: 'path7', label: '终点', kind: 'end', x: 32, z: 32 },
]

export const towerTypes: TowerTypeDef[] = [
  { id: 'ruby', name: '红宝石塔', subtitle: '爆裂范围', color: '#c64f4e', accent: '#ffd0c5', description: '发射炽热宝石弹，在命中点造成范围爆裂。' },
  { id: 'topaz', name: '黄玉塔', subtitle: '多重攻击', color: '#c9993d', accent: '#fff1a2', description: '一次攻击可同时命中多个敌人。' },
  { id: 'sapphire', name: '蓝宝石塔', subtitle: '减速控制', color: '#477bb4', accent: '#cae9ff', description: '冰晶攻击显著减缓怪物移动。' },
  { id: 'emerald', name: '翡翠塔', subtitle: '持续毒蚀', color: '#3f966c', accent: '#c6f4bd', description: '施加可叠加的毒蚀伤害。' },
  { id: 'aquamarine', name: '海晶石塔', subtitle: '高速攻击', color: '#45a7a5', accent: '#c8ffff', description: '攻击间隔短，持续输出稳定。' },
  { id: 'amethyst', name: '紫晶塔', subtitle: '虚弱减益', color: '#8b62b8', accent: '#efc8ff', description: '使怪物承受更多伤害并削弱护甲。' },
  { id: 'diamond', name: '钻石塔', subtitle: '致命暴击', color: '#81b9c7', accent: '#e5ffff', description: '拥有极高暴击伤害与致命一击潜力。' },
  { id: 'opal', name: '蛋白石塔', subtitle: '光环增益', color: '#b06f92', accent: '#ffe0ee', description: '为附近宝石塔提供多属性光环加成。' },
]

export const rockType = { id: 'rock' as const, name: '岩石', subtitle: '地形障碍', color: '#69716b', accent: '#c7c9c0', description: '只能作为障碍物占据格子，不会攻击或提供加成。' }
export const playerColors = ['#ff6b6b', '#f5a623', '#20bf8f', '#4d96ff', '#8b5cf6', '#ec4899']
export const experienceThresholds = [0, 250, 650, 1200, 1900]

export function createInitialBattleSnapshot(): import('./types').BattleSnapshot {
  return {
    type: 'snapshot',
    serverTime: Date.now(),
    phase: 'build',
    wave: 1,
    tick: 0,
    lives: 100,
    kills: 0,
    gold: 0,
    experience: 0,
    heroLevel: 1,
    nextLevelExperience: 250,
    playerCount: 1,
    spawned: 0,
    spawnCount: 0,
    resetVersion: 0,
    resetKind: 'none',
    monsters: [],
    projectiles: [],
  }
}

export function createInitialBuildState(): import('./types').PlayerBuildState {
  return { wave: 1, playerLevel: 1, phase: 'idle', pendingKeys: [] }
}

export function randomPlayerName() {
  return `指挥官 ${Math.floor(Math.random() * 900 + 100)}`
}

export function randomPlayerColor() {
  return playerColors[Math.floor(Math.random() * playerColors.length)]
}

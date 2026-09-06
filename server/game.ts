import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'
import towerData from '../src/game/tower.json' with { type: 'json' }
import waveData from '../src/game/waves.json' with { type: 'json' }

type Cell = { x: number; z: number }
type TowerInput = {
  key: string
  type: string
  quality?: number
  unitId?: string
  name?: string
  temporary?: boolean
  abilities?: string[]
  mvpStacks?: number
}
type DamageType = 'physical' | 'magical'
type DotEffect = {
  kind: 'poison'
  dps: number
  until: number
  towerKey: string
  level: number
  damageType: DamageType
}
type TowerRuntime = TowerInput & {
  x: number
  z: number
  damage: number
  damageMultiplier: number
  baseIntervalMs: number
  speedAuraBonus: number
  intervalMs: number
  range: number
  nextAttackAt: number
  multiTargetLimit: number
  radianceLevel: number
  radianceDps: number
  hasTrueSight: boolean
  cannotMiss: boolean
  magicPierce: boolean
  disarmedUntil: number
}
type ReactiveArmorStack = { until: number; bonus: number }
type Monster = {
  id: number
  name: string
  x: number
  z: number
  hp: number
  maxHp: number
  armor: number
  magicResistancePercent: number
  speed: number
  distance: number
  flying: boolean
  boss: boolean
  abilities: string[]
  evasionPercent: number
  physicalImmune: boolean
  magicImmune: boolean
  invisible: boolean
  disarmAuraRange: number
  untouchable: boolean
  rechargePerSecond: number
  rushUntil: number
  refractionCharges: number
  reactiveStacks: ReactiveArmorStack[]
  krakenAccum: number
  krakenWindowUntil: number
  krakenCleanseThreshold: number
  lastPathSegment: number
  slowExpires: Record<number, number>
  armorBreakUntil: number
  armorBreakLevel: number
  stunUntil: number
  physAmpUntil: number
  physAmpPercent: number
  dots: DotEffect[]
}
type PendingDotLog = {
  towerKey: string
  monsterId: number
  monsterName: string
  damage: number
  damageType: DamageType
  killed: boolean
  gold?: number
  greedProc?: boolean
  at: number
}
type Projectile = {
  id: number
  towerKey: string
  targetId: number
  fromX: number
  fromZ: number
  damage: number
  launchAt: number
  impactAt: number
  color: string
  style: 'orb' | 'laser' | 'arrow'
}
type FxSegment = { fromX: number; fromZ: number; toX: number; toZ: number }
type FxEvent = {
  id: number
  kind: 'lightning'
  color: string
  segments: FxSegment[]
}
type TowerMeta = { type: string; quality?: number; unitId?: string; name?: string }
type TowerCombatStats = { damage: number; kills: number }
type CombatEventDebuff = { kind: 'slow' | 'armorBreak' | 'poison' | 'stun'; level: number }
type CombatEvent = {
  id: number
  at: number
  wave: number
  tick: number
  towerKey: string
  towerType: string
  towerQuality?: number
  towerName?: string
  monsterId: number
  monsterName: string
  damage: number
  damageType: DamageType
  killed: boolean
  gold?: number
  greedProc?: boolean
  debuffs: CombatEventDebuff[]
}
type Room = {
  clients: Set<WebSocket>
  // A room always returns to building after a wave resolves.  "build" is
  // deliberately a server state, so no client can begin a new wave while the
  // previous combat is still being simulated.
  phase: 'build' | 'combat'
  wave: number
  tick: number
  lives: number
  kills: number
  gold: number
  experience: number
  heroLevel: number
  playerCount: number
  towers: TowerInput[]
  combatTowers: TowerRuntime[]
  monsters: Monster[]
  projectiles: Projectile[]
  route: Cell[]
  flyingRoute: Cell[]
  spawned: number
  spawnCount: number
  nextSpawnAt: number
  resetVersion: number
  resetKind: 'none' | 'wave' | 'game' | 'load'
  currentCombatWave: number
  towerMeta: Map<string, TowerMeta>
  lineageParent: Map<string, string>
  waveStats: Map<number, Map<string, TowerCombatStats>>
  combatEvents: CombatEvent[]
  pendingCombatEvents: CombatEvent[]
  combatEventSeq: number
  pendingFxEvents: FxEvent[]
  fxEventSeq: number
  pendingDotLogs: Map<string, PendingDotLog>
  testCombat: boolean
  testSpawnQueue: Array<{ config: TestMonsterConfig; remaining: number }>
  pendingMvpAward?: { key: string; mvpStacks: number; name?: string; wave: number }
  forceBroadcast?: boolean
}

const GRID_SIZE = 37
const CORNER_ZONE_SIZE = 9
const DOTA_UNITS_PER_CELL = 128
const TICK_MS = 50
const SNAPSHOT_EVERY_TICKS = 2
const PROJECTILE_CELLS_PER_SECOND = 9
const routePoints: Cell[] = [
  { x: 4, z: 4 }, { x: 4, z: 18 }, { x: 32, z: 18 }, { x: 32, z: 4 },
  { x: 18, z: 4 }, { x: 18, z: 32 }, { x: 32, z: 32 },
]

const rooms = new Map<string, Room>()
const baseTowers = new Map(towerData.baseTowers.map((tower) => [tower.id, tower]))
const recipes = new Map(towerData.recipes.map((recipe) => [recipe.id, recipe]))
let nextMonsterId = 1
let nextProjectileId = 1

function cellKey(cell: Cell) { return `${cell.x}:${cell.z}` }
function isReservedBuildCell(cell: Cell) {
  const inStartCorner = cell.x < CORNER_ZONE_SIZE && cell.z < CORNER_ZONE_SIZE
  const inEndCorner = cell.x >= GRID_SIZE - CORNER_ZONE_SIZE && cell.z >= GRID_SIZE - CORNER_ZONE_SIZE
  return inStartCorner || inEndCorner
}
function parseCell(value: string): Cell | undefined {
  const [x, z] = value.split(':').map(Number)
  return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && x < GRID_SIZE && z >= 0 && z < GRID_SIZE ? { x, z } : undefined
}

function roomFor(id: string) {
  let room = rooms.get(id)
  if (!room) {
    room = {
      clients: new Set(), phase: 'build', wave: 1, tick: 0, lives: 100, kills: 0, gold: 0, experience: 0, heroLevel: 1, playerCount: 1,
      towers: [], combatTowers: [], monsters: [], projectiles: [], route: [], flyingRoute: routePoints, spawned: 0, spawnCount: 0, nextSpawnAt: 0,
      resetVersion: 0, resetKind: 'none', currentCombatWave: 0, towerMeta: new Map(), lineageParent: new Map(), waveStats: new Map(),
      combatEvents: [], pendingCombatEvents: [], combatEventSeq: 0, pendingFxEvents: [], fxEventSeq: 0, pendingDotLogs: new Map(), testCombat: false, testSpawnQueue: [],
    }
    rooms.set(id, room)
  }
  return room
}

function resolveRoot(room: Room, key: string) {
  let root = key
  const chain: string[] = []
  while (room.lineageParent.has(root)) {
    const parent = room.lineageParent.get(root)!
    if (parent === root) break
    chain.push(root)
    root = parent
  }
  for (const node of chain) room.lineageParent.set(node, root)
  room.lineageParent.set(root, root)
  return root
}

function registerCombine(room: Room, resultKey: string, ingredientKeys: string[], result: TowerMeta) {
  room.towerMeta.set(resultKey, result)
  room.lineageParent.set(resultKey, resultKey)
  for (const key of ingredientKeys) room.lineageParent.set(key, resultKey)
}

function syncTowerMeta(room: Room, towers: TowerInput[]) {
  for (const tower of towers) {
    if (tower.type === 'rock' || tower.temporary) continue
    room.towerMeta.set(tower.key, { type: tower.type, quality: tower.quality, unitId: tower.unitId, name: tower.name })
  }
}

function ensureWaveStats(room: Room, wave: number) {
  if (!room.waveStats.has(wave)) room.waveStats.set(wave, new Map())
  return room.waveStats.get(wave)!
}

function recordTowerCombat(room: Room, towerKey: string, damage: number, killed: boolean) {
  if (!room.currentCombatWave) return
  const stats = ensureWaveStats(room, room.currentCombatWave)
  const entry = stats.get(towerKey) || { damage: 0, kills: 0 }
  entry.damage += damage
  if (killed) entry.kills++
  stats.set(towerKey, entry)
}

function isLiveCombatCell(room: Room, key: string) {
  const live = room.towers.find((tower) => tower.key === key)
  return Boolean(live && live.type !== 'rock' && !live.temporary)
}

function buildLeaderboard(room: Room, waveFilter: number | 'all') {
  const aggregated = new Map<string, TowerCombatStats>()
  const waves = waveFilter === 'all' ? [...room.waveStats.keys()].sort((a, b) => a - b) : [waveFilter]
  for (const wave of waves) {
    const waveMap = room.waveStats.get(wave)
    if (!waveMap) continue
    for (const [key, stats] of waveMap) {
      // Cell keys are reused. If this cell currently holds a real tower, keep damage on
      // that cell — do not follow stale combine lineage from an earlier occupant.
      const root = isLiveCombatCell(room, key) ? key : resolveRoot(room, key)
      const entry = aggregated.get(root) || { damage: 0, kills: 0 }
      entry.damage += stats.damage
      entry.kills += stats.kills
      aggregated.set(root, entry)
    }
  }
  return [...aggregated.entries()]
    .map(([key, stats]) => {
      const live = room.towers.find((tower) => tower.key === key)
      return {
        key,
        ...stats,
        ...(room.towerMeta.get(key) || { type: 'unknown' }),
        mvpStacks: live ? clampMvpStacks(live.mvpStacks) : undefined,
      }
    })
    .filter((entry) => entry.damage > 0 || entry.kills > 0)
    .sort((left, right) => right.damage - left.damage || right.kills - left.kills || left.key.localeCompare(right.key))
}

function awardWaveMvp(room: Room) {
  if (room.testCombat || !room.currentCombatWave) return undefined
  const ranking = buildLeaderboard(room, room.currentCombatWave)
  for (const entry of ranking) {
    const live = room.towers.find((tower) => tower.key === entry.key)
    if (!live || live.type === 'rock' || live.temporary) continue
    const stacks = clampMvpStacks(live.mvpStacks)
    if (stacks >= MVP_MAX_STACKS) continue
    const mvpStacks = stacks + 1
    live.mvpStacks = mvpStacks
    const meta = room.towerMeta.get(entry.key)
    if (meta) room.towerMeta.set(entry.key, { ...meta })
    return {
      key: entry.key,
      mvpStacks,
      name: live.name || meta?.name || recipes.get(live.unitId || live.type)?.name,
      wave: room.currentCombatWave,
    }
  }
  return undefined
}

function availableLeaderboardWaves(room: Room) {
  return [...room.waveStats.keys()].filter((wave) => {
    const waveMap = room.waveStats.get(wave)
    return waveMap && [...waveMap.values()].some((stats) => stats.damage > 0 || stats.kills > 0)
  }).sort((a, b) => a - b)
}

function findPath(start: Cell, end: Cell, blocked: Set<string>) {
  const queue: Cell[] = [start]
  const visited = new Set([cellKey(start)])
  const previous = new Map<string, Cell>()
  const directions = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]
    if (current.x === end.x && current.z === end.z) {
      const path = [current]
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
      const key = cellKey(next)
      if (next.x < 0 || next.x >= GRID_SIZE || next.z < 0 || next.z >= GRID_SIZE || blocked.has(key) || visited.has(key)) continue
      visited.add(key)
      previous.set(key, current)
      queue.push(next)
    }
  }
  return null
}

function calculateRoute(towers: TowerInput[]) {
  const blocked = new Set(towers.map((tower) => tower.key))
  routePoints.forEach((point) => blocked.delete(cellKey(point)))
  const route: Cell[] = []
  for (let index = 0; index < routePoints.length - 1; index++) {
    const segment = findPath(routePoints[index], routePoints[index + 1], blocked)
    if (!segment) return null
    route.push(...(index ? segment.slice(1) : segment))
  }
  return route
}

function towerStats(tower: TowerInput) {
  const base = baseTowers.get(tower.type)
  const stats = base
    ? base.levels[Math.max(0, Math.min(base.levels.length - 1, (tower.quality || 1) - 1))]
    : recipes.get(tower.type)?.stats
  if (!stats) return undefined
  if (!tower.abilities?.length) return stats
  return {
    ...stats,
    abilities: [...new Set([...stats.abilities, ...tower.abilities])],
  }
}

function huiyaoAbilityLevel(abilities: readonly string[]) {
  if (abilities.includes('tower_huiyao3')) return 3
  if (abilities.includes('tower_huiyao2')) return 2
  if (abilities.includes('tower_huiyao')) return 1
  return 0
}

function radianceDpsForLevel(level: number) {
  // GemTD tooltips: burn 1/2/3 = 60 / 320 / 2500 magical DPS
  return [0, 60, 320, 2500][level] || 0
}

function poisonAbilityLevel(abilityId: string) {
  const match = abilityId.match(/^tower_du(\d+)$/)
  return match ? Number(match[1]) : undefined
}

function poisonDpsForLevel(level: number) {
  return [0, 2, 4, 8, 16, 32, 128][level] || 0
}

function poisonDurationMs() {
  return 5000
}

function tickFractionSeconds() {
  return TICK_MS / 1000
}

function isCombatTower(tower: TowerInput) {
  const stats = towerStats(tower)
  if (!stats) return false
  return stats.damage[1] > 0 || huiyaoAbilityLevel(stats.abilities) > 0
}

function multiTargetLimit(abilities: readonly string[]) {
  // GemTD's split-shot tiers: split I, split II and radiation respectively.
  if (abilities.includes('tower_fenliejian_you')) return 15
  if (abilities.includes('tower_fenliejian_xianyan')) return 7
  if (abilities.includes('tower_fenliejian')) return 4
  return 1
}

const BASE_ATTACK_SPEED = 100
const SPEED_AURA_BONUS_BY_LEVEL = [0, 20, 30, 40, 50, 60, 70] as const
const SPEED_AURA_RADIUS_CELLS = 664 / DOTA_UNITS_PER_CELL
const GUICHU_SPEED_AURA_RADIUS_CELLS = 200 / DOTA_UNITS_PER_CELL
const ATTACK_BONUS_BY_LEVEL = [0, 20, 40, 80, 160, 320, 640] as const

function attackBonusFromAbilities(abilities: readonly string[]) {
  let best = 0
  for (const abilityId of abilities) {
    const match = abilityId.match(/^tower_attack(\d+)$/)
    if (!match) continue
    const level = Number(match[1])
    if (level >= 1 && level <= 6) best = Math.max(best, ATTACK_BONUS_BY_LEVEL[level] ?? 0)
  }
  return best
}

/** Self 急速攻击: tower_speed1 = +200, tower_speed2+ = +500. */
function selfSpeedBonusFromAbilities(abilities: readonly string[]) {
  let best = 0
  for (const abilityId of abilities) {
    const match = abilityId.match(/^tower_speed(\d+)$/)
    if (!match) continue
    const level = Number(match[1])
    if (level >= 2) best = Math.max(best, 500)
    else if (level >= 1) best = Math.max(best, 200)
  }
  return best
}

function computeSpeedAuraBonus(target: TowerRuntime, providers: TowerRuntime[]) {
  let bonus = 0
  for (const provider of providers) {
    const stats = towerStats(provider)
    if (!stats) continue
    const distance = Math.hypot(provider.x - target.x, provider.z - target.z)
    let levelBonus = 0
    let guichuBonus = 0
    for (const abilityId of stats.abilities) {
      if (abilityId === 'tower_speed_aura_guichu') {
        guichuBonus = 80
        continue
      }
      const match = abilityId.match(/^tower_speed_aura(\d+)$/)
      if (!match) continue
      const level = Number(match[1])
      if (level >= 1 && level <= 6) levelBonus = Math.max(levelBonus, SPEED_AURA_BONUS_BY_LEVEL[level])
    }
    if (levelBonus && distance <= SPEED_AURA_RADIUS_CELLS) bonus += levelBonus
    if (guichuBonus && distance <= GUICHU_SPEED_AURA_RADIUS_CELLS) bonus += guichuBonus
  }
  return bonus
}

// GemTD Overlook: aura radius 290, flat +300 attack range per provider.
const RANGE_AURA_RADIUS_CELLS = 290 / DOTA_UNITS_PER_CELL
const RANGE_AURA_BONUS_UNITS = 300

function hasRangeAura(abilities: readonly string[]) {
  return abilities.includes('tower_shechengguanghuan')
}

function computeRangeAuraBonus(target: TowerRuntime, providers: TowerRuntime[]) {
  let bonus = 0
  for (const provider of providers) {
    const stats = towerStats(provider)
    if (!stats || !hasRangeAura(stats.abilities)) continue
    if (Math.hypot(provider.x - target.x, provider.z - target.z) > RANGE_AURA_RADIUS_CELLS) continue
    bonus += RANGE_AURA_BONUS_UNITS
  }
  return bonus
}

const MAOYAN_AURA_RADIUS_CELLS = 500 / DOTA_UNITS_PER_CELL
const MVP_MAX_STACKS = 10
const MVP_BONUS_PER_STACK = 0.1
const MVP_AURA_RADIUS_CELLS = 500 / DOTA_UNITS_PER_CELL
const MVP_AURA_BONUS = MVP_MAX_STACKS * MVP_BONUS_PER_STACK
const CHENMO_AURA_RADIUS_CELLS = 600 / DOTA_UNITS_PER_CELL
const JINGZHUN_AURA_RADIUS_CELLS = 300 / DOTA_UNITS_PER_CELL
const BIXI_AURA_RADIUS_CELLS = 800 / DOTA_UNITS_PER_CELL
const BIXI2_AURA_RADIUS_CELLS = 1200 / DOTA_UNITS_PER_CELL
const ZHEYI_AURA_RADIUS_CELLS = 600 / DOTA_UNITS_PER_CELL

const SPLASH_RATIO_BY_LEVEL = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 1] as const
const SPLASH_RADIUS_BY_LEVEL = [0, 300, 350, 400, 450, 500, 700] as const

const CRIT_CHANCE = 0.1
const CRIT_MULTIPLIER = 5
const CHAIN_LIGHTNING_CHANCE = 0.3
const CHAIN_LIGHTNING_DAMAGE = 150
const CHAIN_LIGHTNING_JUMPS = 5
const CHAIN_LIGHTNING_RADIUS_CELLS = 1000 / DOTA_UNITS_PER_CELL
const CHAIN_FROST_CHANCE = 0.25
const CHAIN_FROST_DAMAGE = 250
const CHAIN_FROST_BOUNCES = 10
const CHAIN_FROST_RADIUS_CELLS = 600 / DOTA_UNITS_PER_CELL
const CHAIN_FROST_SLOW_LEVEL = 3
const SHIHUA_CHANCE = 0.01
const SHIHUA_RADIUS_CELLS = 1000 / DOTA_UNITS_PER_CELL
const SHIHUA_SLOW_LEVEL = 6
const SHIHUA_PETRIFY_MS = 3000
const SHIHUA_PHYS_AMP_PERCENT = 100
const ZHONGGUOYU_HEAL_CHANCE = 0.01
const MAX_CASTLE_LIVES = 100

function towerHasAbility(tower: TowerInput, abilityId: string) {
  return Boolean(towerStats(tower)?.abilities.includes(abilityId))
}

function computeMaoyanDamageMultiplier(target: TowerRuntime, providers: TowerRuntime[]) {
  let stacks = 0
  for (const provider of providers) {
    if (!towerHasAbility(provider, 'tower_maoyan')) continue
    if (Math.hypot(provider.x - target.x, provider.z - target.z) > MAOYAN_AURA_RADIUS_CELLS) continue
    stacks += 1
  }
  return 1 + stacks * 0.5
}

function clampMvpStacks(value: unknown) {
  const stacks = Math.floor(Number(value) || 0)
  return Math.max(0, Math.min(MVP_MAX_STACKS, stacks))
}

function mvpSelfBonus(stacks: number) {
  return clampMvpStacks(stacks) * MVP_BONUS_PER_STACK
}

function computeMvpAuraBonus(target: TowerRuntime, providers: TowerRuntime[]) {
  let best = 0
  for (const provider of providers) {
    if (provider.key === target.key) continue
    if (clampMvpStacks(provider.mvpStacks) < MVP_MAX_STACKS) continue
    if (Math.hypot(provider.x - target.x, provider.z - target.z) > MVP_AURA_RADIUS_CELLS) continue
    best = Math.max(best, MVP_AURA_BONUS)
  }
  return best
}

function computeDamageMultiplier(tower: TowerRuntime, providers: TowerRuntime[]) {
  const maoyanBonus = computeMaoyanDamageMultiplier(tower, providers) - 1
  return 1 + maoyanBonus + mvpSelfBonus(tower.mvpStacks || 0) + computeMvpAuraBonus(tower, providers)
}

function computeJingzhunCannotMiss(target: TowerRuntime, providers: TowerRuntime[]) {
  return providers.some((provider) =>
    towerHasAbility(provider, 'tower_jingzhun')
    && Math.hypot(provider.x - target.x, provider.z - target.z) <= JINGZHUN_AURA_RADIUS_CELLS)
}

function computeChenmoMagicPierce(target: TowerRuntime, providers: TowerRuntime[]) {
  return providers.some((provider) =>
    towerHasAbility(provider, 'tower_chenmoguanghuan')
    && Math.hypot(provider.x - target.x, provider.z - target.z) <= CHENMO_AURA_RADIUS_CELLS)
}

function bixiArmorReduction(room: Room, monster: Monster) {
  let best = 0
  for (const tower of room.combatTowers) {
    const stats = towerStats(tower)
    if (!stats) continue
    const dist = Math.hypot(monster.x - tower.x, monster.z - tower.z)
    if (stats.abilities.includes('tower_bixi2') && dist <= BIXI2_AURA_RADIUS_CELLS) {
      best = Math.max(best, 30)
      continue
    }
    if (stats.abilities.includes('tower_bixi') && dist <= BIXI_AURA_RADIUS_CELLS) {
      if (monster.magicImmune) continue
      best = Math.max(best, 15)
    }
  }
  return best
}

type ZheyiAura = { armor: number; moveSpeedPenalty: number; magicResistPenalty: number }

function zheyiAuraDebuff(room: Room, monster: Monster): ZheyiAura {
  const empty: ZheyiAura = { armor: 0, moveSpeedPenalty: 0, magicResistPenalty: 0 }
  if (!monster.flying) return empty
  let best: ZheyiAura = empty
  const score = (aura: ZheyiAura) => aura.armor * 1000 + aura.moveSpeedPenalty + aura.magicResistPenalty
  for (const tower of room.combatTowers) {
    const stats = towerStats(tower)
    if (!stats) continue
    if (Math.hypot(monster.x - tower.x, monster.z - tower.z) > ZHEYI_AURA_RADIUS_CELLS) continue
    let aura: ZheyiAura | undefined
    if (stats.abilities.includes('tower_zheyi3')) {
      aura = { armor: 64, moveSpeedPenalty: 480 / DOTA_UNITS_PER_CELL, magicResistPenalty: 100 }
    } else if (stats.abilities.includes('tower_zheyi2')) {
      aura = { armor: 10, moveSpeedPenalty: 250 / DOTA_UNITS_PER_CELL, magicResistPenalty: 50 }
    } else if (stats.abilities.includes('tower_zheyi')) {
      aura = { armor: 10, moveSpeedPenalty: 150 / DOTA_UNITS_PER_CELL, magicResistPenalty: 0 }
    }
    if (aura && score(aura) > score(best)) best = aura
  }
  return best
}

function splashAbilityLevel(abilities: readonly string[]) {
  let best = 0
  for (const abilityId of abilities) {
    const match = abilityId.match(/^tower_jianshe(\d+)$/)
    if (!match) continue
    const level = Number(match[1])
    if (level >= 1 && level <= 6) best = Math.max(best, level)
  }
  return best
}

function rollCritDamage(baseDamage: number, abilities: readonly string[]) {
  if (!abilities.includes('tower_baoji1')) return baseDamage
  if (Math.random() >= CRIT_CHANCE) return baseDamage
  return baseDamage * CRIT_MULTIPLIER
}

function effectiveAttackIntervalMs(baseIntervalMs: number, speedAuraBonus: number) {
  const totalAttackSpeed = BASE_ATTACK_SPEED + speedAuraBonus
  return Math.max(100, Math.round(baseIntervalMs * BASE_ATTACK_SPEED / totalAttackSpeed))
}

function validTowerLayout(raw: unknown): TowerInput[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((value): TowerInput[] => {
    if (!value || typeof value !== 'object') return []
    const tower = value as Partial<TowerInput>
    if (typeof tower.key !== 'string' || typeof tower.type !== 'string') return []
    const cell = parseCell(tower.key)
    if (!cell || isReservedBuildCell(cell)) return []
    return [{
      key: tower.key,
      type: tower.type,
      quality: Number(tower.quality) || 1,
      unitId: typeof tower.unitId === 'string' ? tower.unitId : undefined,
      name: typeof tower.name === 'string' ? tower.name : undefined,
      temporary: Boolean(tower.temporary),
      abilities: Array.isArray(tower.abilities)
        ? tower.abilities.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : undefined,
      mvpStacks: clampMvpStacks(tower.mvpStacks) || undefined,
    }]
  })
}

function buildCombatTowers(towers: TowerInput[]) {
  const combatTowers = towers.flatMap((tower): TowerRuntime[] => {
    if (tower.type === 'rock' || tower.temporary) return []
    const cell = parseCell(tower.key)
    const stats = towerStats(tower)
    if (!cell || !stats) return []
    const radianceLevel = huiyaoAbilityLevel(stats.abilities)
    const hasDirectDamage = stats.damage[1] > 0
    if (!hasDirectDamage && !radianceLevel) return []
    const baseIntervalMs = Math.max(100, stats.attackIntervalSeconds * 1000)
    const multiTargetLimitForTower = multiTargetLimit(stats.abilities)
    return [{
      ...tower,
      ...cell,
      damage: hasDirectDamage
        ? (stats.damage[0] + stats.damage[1]) / 2 + attackBonusFromAbilities(stats.abilities)
        : 0,
      damageMultiplier: 1,
      baseIntervalMs,
      speedAuraBonus: 0,
      intervalMs: baseIntervalMs,
      range: stats.range / DOTA_UNITS_PER_CELL,
      nextAttackAt: 0,
      multiTargetLimit: multiTargetLimitForTower,
      radianceLevel,
      radianceDps: radianceDpsForLevel(radianceLevel),
      hasTrueSight: stats.abilities.includes('tower_true_sight'),
      cannotMiss: false,
      magicPierce: false,
      disarmedUntil: 0,
    }]
  })

  return combatTowers.map((tower) => {
    const stats = towerStats(tower)
    const baseRange = stats?.range || 0
    const selfSpeedBonus = stats ? selfSpeedBonusFromAbilities(stats.abilities) : 0
    const speedAuraBonus = computeSpeedAuraBonus(tower, combatTowers)
    const totalSpeedBonus = selfSpeedBonus + speedAuraBonus
    return {
      ...tower,
      damageMultiplier: computeDamageMultiplier(tower, combatTowers),
      cannotMiss: computeJingzhunCannotMiss(tower, combatTowers),
      magicPierce: computeChenmoMagicPierce(tower, combatTowers),
      speedAuraBonus: totalSpeedBonus,
      intervalMs: effectiveAttackIntervalMs(tower.baseIntervalMs, totalSpeedBonus),
      range: (baseRange + computeRangeAuraBonus(tower, combatTowers)) / DOTA_UNITS_PER_CELL,
    }
  })
}

function difficultyIndex(playerCount: number) {
  return Math.max(0, Math.min(3, playerCount - 1))
}

function pickByDifficulty<T>(values: readonly T[], playerCount: number) {
  return values[difficultyIndex(playerCount)] ?? values[0]
}

function pathSegmentIndex(path: Cell[], distance: number) {
  let remaining = distance
  for (let index = 1; index < path.length; index++) {
    const length = Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z)
    if (remaining <= length) return index - 1
    remaining -= length
  }
  return Math.max(0, path.length - 2)
}

function monsterAbilityFlags(abilities: readonly string[], playerCount: number) {
  const highArmor = [20, 30, 40, 50] as const
  const recharge = [400, 600, 800, 1000] as const
  const jiaoxieRange = [130, 150, 170, 190] as const
  const krakenCleanse = [40000, 60000, 80000, 100000] as const
  return {
    evasionPercent: abilities.includes('guai_shanbi') ? 50 : 0,
    physicalImmune: abilities.includes('enemy_wumian'),
    magicImmune: abilities.includes('enemy_momian'),
    invisible: abilities.includes('riki_permanent_invisibility'),
    disarmAuraRange: abilities.includes('guai_jiaoxieguanghuan')
      ? pickByDifficulty(jiaoxieRange, playerCount) / DOTA_UNITS_PER_CELL
      : 0,
    untouchable: abilities.includes('enemy_bukeqinfan'),
    rechargePerSecond: abilities.includes('enemy_recharge')
      ? pickByDifficulty(recharge, playerCount)
      : 0,
    armorBonus: abilities.includes('enemy_high_armor')
      ? pickByDifficulty(highArmor, playerCount)
      : 0,
    krakenCleanseThreshold: abilities.includes('tidehunter_kraken_shell')
      ? pickByDifficulty(krakenCleanse, playerCount)
      : 0,
    hasZheguang: abilities.includes('enemy_zheguang'),
    hasShanshuo: abilities.includes('enemy_shanshuo'),
    hasRush: abilities.includes('runrunrun'),
    hasReactiveArmor: abilities.includes('shredder_reactive_armor'),
  }
}

function pathLength(path: Cell[]) {
  let result = 0
  for (let index = 1; index < path.length; index++) result += Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z)
  return result
}

function pointOnPath(path: Cell[], distance: number) {
  let remaining = distance
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1]
    const to = path[index]
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    if (remaining <= length) {
      const ratio = length ? remaining / length : 0
      return { x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio }
    }
    remaining -= length
  }
  return path[path.length - 1]
}

function armorMultiplier(armor: number) {
  return 1 - (0.06 * armor) / (1 + 0.06 * Math.abs(armor))
}

function magicResistanceMultiplier(magicResistancePercent: number) {
  return 1 - magicResistancePercent / 100
}

function slowAbilityLevel(abilityId: string) {
  if (abilityId === 'tower_lanbaoshi') return 3
  if (abilityId === 'tower_lanbaoshi2') return 4
  if (abilityId === 'tower_jihan') return 5
  const match = abilityId.match(/^tower_slow(\d+)$/)
  return match ? Number(match[1]) : undefined
}

function armorBreakAbilityLevel(abilityId: string) {
  if (abilityId === 'tower_jin') return 32
  if (abilityId === 'tower_jin2') return 48
  const match = abilityId.match(/^tower_jianjia(\d+)$/)
  return match ? Number(match[1]) : undefined
}

function slowMultiplierForLevel(level: number) {
  return Math.max(0.35, 1 - level * 0.1)
}

function slowDurationMs(level: number) {
  return 1800 + level * 400
}

function armorBreakAmountForLevel(level: number) {
  return level
}

function armorBreakDurationMs(level: number) {
  return 2600 + level * 400
}

function monsterEffectiveArmor(monster: Monster, now: number, room?: Room) {
  monster.reactiveStacks = monster.reactiveStacks.filter((stack) => stack.until > now)
  const reactiveBonus = monster.reactiveStacks.reduce((sum, stack) => sum + stack.bonus, 0)
  const reduction = now < monster.armorBreakUntil ? armorBreakAmountForLevel(monster.armorBreakLevel) : 0
  const auraArmor = room ? bixiArmorReduction(room, monster) + zheyiAuraDebuff(room, monster).armor : 0
  return monster.armor + reactiveBonus - reduction - auraArmor
}

function monsterEffectiveMagicResistance(monster: Monster, room?: Room) {
  const penalty = room ? zheyiAuraDebuff(room, monster).magicResistPenalty : 0
  return Math.max(0, Math.min(100, monster.magicResistancePercent - penalty))
}

function monsterEffectiveSpeed(monster: Monster, now: number, room?: Room) {
  if (now < monster.stunUntil) return 0
  const level = monsterEffectiveSlowLevel(monster, now)
  let speed = monster.speed
  if (room) speed = Math.max(0, speed - zheyiAuraDebuff(room, monster).moveSpeedPenalty)
  if (level) speed *= slowMultiplierForLevel(level)
  if (now < monster.rushUntil) speed *= 1.5
  return speed
}

function monsterIsDetected(room: Room, monster: Monster) {
  if (!monster.invisible) return true
  return room.combatTowers.some((tower) =>
    tower.hasTrueSight && Math.hypot(tower.x - monster.x, tower.z - monster.z) <= tower.range)
}

function towerIsDisarmed(room: Room, tower: TowerRuntime, now: number) {
  if (now < tower.disarmedUntil) return true
  return room.monsters.some((monster) =>
    monster.hp > 0
    && monster.disarmAuraRange > 0
    && Math.hypot(monster.x - tower.x, monster.z - tower.z) <= monster.disarmAuraRange)
}

function clearMonsterDebuffs(monster: Monster) {
  monster.slowExpires = {}
  monster.armorBreakUntil = 0
  monster.armorBreakLevel = 0
  monster.stunUntil = 0
  monster.physAmpUntil = 0
  monster.physAmpPercent = 0
  monster.dots = []
}

function onMonsterDirectionChange(monster: Monster, path: Cell[], now: number) {
  if (monster.abilities.includes('enemy_zheguang')) monster.refractionCharges = 4
  if (monster.abilities.includes('runrunrun')) monster.rushUntil = now + 2500
  if (monster.abilities.includes('enemy_shanshuo') && Math.random() < 0.6) {
    monster.distance = Math.min(pathLength(path), monster.distance + 5)
  }
}

function applyReactiveArmorHit(monster: Monster, now: number) {
  if (!monster.abilities.includes('shredder_reactive_armor')) return
  if (monster.reactiveStacks.length >= 40) monster.reactiveStacks.shift()
  monster.reactiveStacks.push({ until: now + 10000, bonus: 5 })
}

function applyUntouchableToTower(tower: TowerRuntime, now: number) {
  // Enchantress Untouchable: attacker is disarmed / heavily AS-slowed.
  tower.disarmedUntil = Math.max(tower.disarmedUntil, now + 2500)
}

function applyKrakenShell(monster: Monster, damage: number, now: number) {
  if (!monster.krakenCleanseThreshold) return
  if (now >= monster.krakenWindowUntil) {
    monster.krakenAccum = 0
    monster.krakenWindowUntil = now + 10000
  }
  monster.krakenAccum += damage
  if (monster.krakenAccum >= monster.krakenCleanseThreshold) {
    clearMonsterDebuffs(monster)
    monster.krakenAccum = 0
    monster.krakenWindowUntil = now + 10000
  }
}

function monsterEffectiveSlowLevel(monster: Monster, now: number) {
  let best = 0
  for (const [levelKey, expiresAt] of Object.entries(monster.slowExpires)) {
    const level = Number(levelKey)
    if (expiresAt <= now) {
      delete monster.slowExpires[level]
      continue
    }
    if (level > best) best = level
  }
  return best
}

function applySlowDebuff(monster: Monster, level: number, now: number) {
  if (level <= 0) return
  monster.slowExpires[level] = now + slowDurationMs(level)
}

function applyArmorBreakDebuff(monster: Monster, level: number, now: number) {
  if (level <= 0) return
  const active = now < monster.armorBreakUntil
  if (!active || level >= monster.armorBreakLevel) {
    monster.armorBreakLevel = active ? Math.max(monster.armorBreakLevel, level) : level
    monster.armorBreakUntil = now + armorBreakDurationMs(monster.armorBreakLevel)
    return
  }
  if (level === monster.armorBreakLevel) {
    monster.armorBreakUntil = Math.max(monster.armorBreakUntil, now + armorBreakDurationMs(level))
  }
}

function applyPoisonDebuff(monster: Monster, level: number, towerKey: string, now: number) {
  if (level <= 0) return
  const dps = poisonDpsForLevel(level)
  if (!dps) return
  const existing = monster.dots.find((dot) => dot.kind === 'poison')
  if (existing) {
    if (level < existing.level) return
    existing.level = level
    existing.dps = dps
    existing.towerKey = towerKey
    existing.until = now + poisonDurationMs()
    return
  }
  monster.dots.push({
    kind: 'poison',
    dps,
    until: now + poisonDurationMs(),
    towerKey,
    level,
    damageType: 'magical',
  })
}

const JIYUN_STUN_CHANCE = 0.1
const JIYUN_STUN_MS = 2000

/** Dark Emerald 厄运: 10% chance to stun for 2s (bash-like, ignores magic immunity). */
function tryApplyJiyunStun(monster: Monster, abilities: readonly string[], now: number) {
  if (!abilities.includes('tower_10jiyun')) return false
  if (Math.random() >= JIYUN_STUN_CHANCE) return false
  monster.stunUntil = Math.max(monster.stunUntil, now + JIYUN_STUN_MS)
  return true
}

function applyHitDebuffs(monster: Monster, abilities: readonly string[], now: number, towerKey: string) {
  let bestSlow = 0
  let bestArmorBreak = 0
  let bestPoison = 0
  for (const abilityId of abilities) {
    bestSlow = Math.max(bestSlow, slowAbilityLevel(abilityId) || 0)
    bestArmorBreak = Math.max(bestArmorBreak, armorBreakAbilityLevel(abilityId) || 0)
    bestPoison = Math.max(bestPoison, poisonAbilityLevel(abilityId) || 0)
  }
  const debuffs: CombatEventDebuff[] = []
  if (bestSlow) {
    applySlowDebuff(monster, bestSlow, now)
    debuffs.push({ kind: 'slow', level: bestSlow })
  }
  if (bestArmorBreak) {
    applyArmorBreakDebuff(monster, bestArmorBreak, now)
    debuffs.push({ kind: 'armorBreak', level: bestArmorBreak })
  }
  if (bestPoison) {
    applyPoisonDebuff(monster, bestPoison, towerKey, now)
    debuffs.push({ kind: 'poison', level: bestPoison })
  }
  return debuffs
}

const MAX_COMBAT_EVENTS = 800

function clearCombatEvents(room: Room) {
  room.combatEvents = []
  room.pendingCombatEvents = []
  room.pendingFxEvents = []
  room.pendingDotLogs.clear()
}

function pushCombatEvent(room: Room, event: Omit<CombatEvent, 'id'>) {
  const entry: CombatEvent = { id: ++room.combatEventSeq, ...event }
  room.combatEvents.push(entry)
  room.pendingCombatEvents.push(entry)
  if (room.combatEvents.length > MAX_COMBAT_EVENTS) {
    const overflow = room.combatEvents.length - MAX_COMBAT_EVENTS
    room.combatEvents.splice(0, overflow)
  }
}

const LIGHTNING_FX_COLOR = '#ff3b3b'

function pushLightningFx(room: Room, segments: FxSegment[]) {
  if (!segments.length) return
  room.pendingFxEvents.push({
    id: ++room.fxEventSeq,
    kind: 'lightning',
    color: LIGHTNING_FX_COLOR,
    segments,
  })
}

function recordCombatHit(
  room: Room,
  now: number,
  tower: TowerRuntime,
  target: Monster,
  damage: number,
  killed: boolean,
  damageType: DamageType,
  debuffs: CombatEventDebuff[],
  gold = 0,
  greedProc = false,
) {
  const meta = room.towerMeta.get(tower.key)
  const recipeId = meta?.unitId || tower.unitId || tower.type
  pushCombatEvent(room, {
    at: now,
    wave: room.wave,
    tick: room.tick,
    towerKey: tower.key,
    towerType: tower.type,
    towerQuality: tower.quality,
    towerName: meta?.name || recipes.get(recipeId)?.name,
    monsterId: target.id,
    monsterName: target.name,
    damage: Math.round(damage * 10) / 10,
    damageType,
    killed,
    gold: killed ? gold : undefined,
    greedProc: killed && greedProc ? true : undefined,
    debuffs,
  })
}

function projectileColor(type: string) {
  return ({ ruby: '#ff6b57', topaz: '#ffd75f', sapphire: '#68b8ff', emerald: '#62e398', aquamarine: '#68f2e5', amethyst: '#c78cff', diamond: '#e8ffff', opal: '#ff9ed1' } as Record<string, string>)[type] || '#fff3a5'
}

const LASER_TOWER_IDS = new Set([
  'gemtd_baiyin',
  'gemtd_baiyinqishi',
  'gemtd_fenhongzuanshi',
  'gemtd_juxingfenhongzuanshi',
  'gemtd_keyinuoerguangmingzhishan',
])
const LASER_PROJECTILE_COLOR = '#c8f0ff'
const ARROW_PROJECTILE_COLOR = '#5dff8a'

function projectileStyleForTower(type: string, multiLimit: number): 'orb' | 'laser' | 'arrow' {
  if (LASER_TOWER_IDS.has(type)) return 'laser'
  // Split-shot towers (孔雀石 / 铀 / 黄玉等): green arrow + trail.
  if (multiLimit > 1) return 'arrow'
  return 'orb'
}

function experienceForWave(wave: number) {
  if (wave % 10 === 0) return 300
  if (wave <= 9) return 5
  if (wave <= 19) return 10
  if (wave <= 29) return 15
  if (wave <= 39) return 20
  return 25
}

/** GemTD kill gold bounty by wave (shared team gold). */
function goldBountyForWave(wave: number) {
  if (wave === 10) return 200
  if (wave === 20) return 300
  if (wave === 30) return 400
  if (wave === 40 || wave === 50) return 500
  if (wave <= 9) return 5
  if (wave <= 19) return 10
  if (wave <= 29) return 15
  if (wave <= 39) return 20
  return 25
}

const GREED_AURA_RADIUS_CELLS = 800 / DOTA_UNITS_PER_CELL

function killerCoveredByGreedAura(room: Room, killer: TowerRuntime) {
  for (const tower of room.towers) {
    if (tower.type === 'rock' || tower.temporary) continue
    const stats = towerStats(tower)
    if (!stats?.abilities.includes('tower_tanlan')) continue
    const cell = parseCell(tower.key)
    if (!cell) continue
    if (Math.hypot(cell.x - killer.x, cell.z - killer.z) <= GREED_AURA_RADIUS_CELLS) return true
  }
  return false
}

function awardKillGold(room: Room, killer: TowerRuntime) {
  let gold = goldBountyForWave(room.wave)
  let greedProc = false
  if (killerCoveredByGreedAura(room, killer) && Math.random() * 100 < 5) {
    gold *= 10
    greedProc = true
  }
  room.gold += gold
  return { gold, greedProc }
}

function refreshHeroLevel(room: Room) {
  const thresholds = [0, 250, 650, 1200, 1900]
  room.heroLevel = thresholds.reduce((level, threshold, index) => room.experience >= threshold ? index + 1 : level, 1)
}

function resetWave(room: Room) {
  room.phase = 'build'
  room.combatTowers = []
  room.monsters = []
  room.projectiles = []
  room.spawned = 0
  room.spawnCount = 0
  room.nextSpawnAt = 0
  room.testCombat = false
  room.testSpawnQueue = []
  clearCombatEvents(room)
  room.resetVersion++
  room.resetKind = 'wave'
}

function resetGame(room: Room) {
  resetWave(room)
  room.wave = 1
  room.lives = 100
  room.kills = 0
  room.gold = 0
  room.experience = 0
  room.heroLevel = 1
  room.towers = []
  room.route = []
  room.towerMeta.clear()
  room.lineageParent.clear()
  room.waveStats.clear()
  room.currentCombatWave = 0
  clearCombatEvents(room)
  room.resetKind = 'game'
}

function exportSaveState(room: Room) {
  return {
    type: 'saveState' as const,
    battle: {
      wave: room.wave,
      lives: room.lives,
      kills: room.kills,
      gold: room.gold,
      experience: room.experience,
      heroLevel: room.heroLevel,
    },
    server: {
      towerMeta: [...room.towerMeta.entries()],
      lineageParent: [...room.lineageParent.entries()],
      waveStats: [...room.waveStats.entries()].map(([wave, stats]) => [wave, [...stats.entries()]] as const),
    },
  }
}

function restoreSaveState(
  room: Room,
  battle: { wave?: number; lives?: number; kills?: number; gold?: number; experience?: number; heroLevel?: number },
  server: {
    towerMeta?: Array<[string, TowerMeta]>
    lineageParent?: Array<[string, string]>
    waveStats?: Array<[number, Array<[string, TowerCombatStats]>]>
  },
  towers: TowerInput[],
) {
  if (room.phase === 'combat') return { ok: false as const, message: '战斗中无法读取存档' }
  const route = calculateRoute(towers)
  if (!route) return { ok: false as const, message: '存档塔阵阻断了怪物路线' }

  room.phase = 'build'
  room.combatTowers = []
  room.monsters = []
  room.projectiles = []
  room.spawned = 0
  room.spawnCount = 0
  room.nextSpawnAt = 0
  room.currentCombatWave = 0
  clearCombatEvents(room)

  room.wave = Math.max(1, Math.min(waveData.waves.length, Math.floor(Number(battle.wave) || 1)))
  room.lives = Math.max(0, Math.floor(Number(battle.lives) || 0))
  room.kills = Math.max(0, Math.floor(Number(battle.kills) || 0))
  room.gold = Math.max(0, Math.floor(Number(battle.gold) || 0))
  room.experience = Math.max(0, Math.floor(Number(battle.experience) || 0))
  room.heroLevel = Math.max(1, Math.min(5, Math.floor(Number(battle.heroLevel) || 1)))
  refreshHeroLevel(room)

  room.towers = towers
  room.route = route
  room.towerMeta = new Map(
    (server.towerMeta || [])
      .filter((entry) => Array.isArray(entry) && typeof entry[0] === 'string' && entry[1]?.type)
      .map(([key, meta]) => [key, {
        type: meta.type,
        quality: meta.quality,
        unitId: meta.unitId,
        name: meta.name,
      }]),
  )
  room.lineageParent = new Map(
    (server.lineageParent || [])
      .filter((entry) => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string'),
  )
  room.waveStats = new Map(
    (server.waveStats || [])
      .filter((entry) => Array.isArray(entry) && Number.isFinite(entry[0]))
      .map(([wave, stats]) => [
        Number(wave),
        new Map(
          (stats || [])
            .filter((stat) => Array.isArray(stat) && typeof stat[0] === 'string')
            .map(([key, value]) => [key, {
              damage: Number(value?.damage) || 0,
              kills: Number(value?.kills) || 0,
            }]),
        ),
      ]),
  )
  syncTowerMeta(room, towers)
  room.resetVersion++
  room.resetKind = 'load'
  return { ok: true as const }
}

function mitigateDamage(
  target: Monster,
  now: number,
  damage: number,
  damageType: DamageType,
  options: { pierceMagicImmune?: boolean; room?: Room } = {},
) {
  if (damageType === 'physical' && target.physicalImmune) return 0
  if (damageType === 'magical' && target.magicImmune && !options.pierceMagicImmune) return 0
  if (damageType === 'magical') {
    return damage * magicResistanceMultiplier(monsterEffectiveMagicResistance(target, options.room))
  }
  let dealt = damage * armorMultiplier(monsterEffectiveArmor(target, now, options.room))
  if (now < target.physAmpUntil && target.physAmpPercent > 0) {
    dealt *= 1 + target.physAmpPercent / 100
  }
  return dealt
}

function flushPendingDotLogs(room: Room, force = false) {
  if (!force && room.tick % Math.max(1, Math.round(1000 / TICK_MS)) !== 0) return
  for (const entry of room.pendingDotLogs.values()) {
    if (entry.damage <= 0 && !entry.killed) continue
    const meta = room.towerMeta.get(entry.towerKey)
    const layout = room.towers.find((item) => item.key === entry.towerKey)
    const combat = room.combatTowers.find((item) => item.key === entry.towerKey)
    const towerType = combat?.type || layout?.type || meta?.type || 'unknown'
    const towerQuality = combat?.quality ?? layout?.quality ?? meta?.quality
    const recipeId = meta?.unitId || combat?.unitId || layout?.unitId || towerType
    pushCombatEvent(room, {
      at: entry.at,
      wave: room.wave,
      tick: room.tick,
      towerKey: entry.towerKey,
      towerType,
      towerQuality,
      towerName: meta?.name || recipes.get(recipeId)?.name,
      monsterId: entry.monsterId,
      monsterName: entry.monsterName,
      damage: Math.round(entry.damage * 10) / 10,
      damageType: entry.damageType,
      killed: entry.killed,
      gold: entry.killed ? entry.gold : undefined,
      greedProc: entry.killed && entry.greedProc ? true : undefined,
      debuffs: [],
    })
  }
  room.pendingDotLogs.clear()
}

function queueDotCombatLog(
  room: Room,
  now: number,
  towerKey: string,
  target: Monster,
  damage: number,
  damageType: DamageType,
  killed: boolean,
  gold = 0,
  greedProc = false,
) {
  const key = `${towerKey}:${target.id}:${damageType}`
  const existing = room.pendingDotLogs.get(key)
  if (existing) {
    existing.damage += damage
    existing.killed = existing.killed || killed
    existing.at = now
    existing.monsterName = target.name
    if (killed) {
      existing.gold = (existing.gold || 0) + gold
      existing.greedProc = existing.greedProc || greedProc
    }
    return
  }
  room.pendingDotLogs.set(key, {
    towerKey,
    monsterId: target.id,
    monsterName: target.name,
    damage,
    damageType,
    killed,
    gold: killed ? gold : undefined,
    greedProc: killed && greedProc ? true : undefined,
    at: now,
  })
}

function applyMonsterDamage(
  room: Room,
  now: number,
  tower: TowerRuntime,
  target: Monster,
  damage: number,
  damageType: DamageType = 'physical',
  debuffs: CombatEventDebuff[] = [],
  options: { source?: 'hit' | 'dot' } = {},
) {
  if (damage <= 0 || target.hp <= 0) return
  // Maoyan / MVP (and MVP aura) amplify every damage source from this tower.
  const scaledDamage = damage * (tower.damageMultiplier || 1)
  // Evasion / refraction already handled in resolveProjectiles for hits.
  const actualDamage = mitigateDamage(target, now, scaledDamage, damageType, {
    pierceMagicImmune: damageType === 'magical' && tower.magicPierce,
    room,
  })
  if (actualDamage <= 0 && options.source === 'dot') return
  if (actualDamage > 0) {
    applyKrakenShell(target, actualDamage, now)
    if (options.source === 'hit') applyReactiveArmorHit(target, now)
  }
  target.hp = Math.max(0, target.hp - actualDamage)
  const killed = target.hp === 0
  recordTowerCombat(room, tower.key, actualDamage, killed)
  let gold = 0
  let greedProc = false
  if (killed) {
    room.kills++
    room.experience += experienceForWave(room.wave)
    ;({ gold, greedProc } = awardKillGold(room, tower))
    refreshHeroLevel(room)
  }
  if (options.source === 'dot') {
    queueDotCombatLog(room, now, tower.key, target, actualDamage, damageType, killed, gold, greedProc)
    if (killed) flushPendingDotLogs(room, true)
  } else {
    recordCombatHit(room, now, tower, target, actualDamage, killed, damageType, debuffs, gold, greedProc)
  }
}

function launchAttacks(room: Room, now: number) {
  for (const tower of room.combatTowers) {
    if (tower.damage <= 0 || now < tower.nextAttackAt) continue
    if (towerIsDisarmed(room, tower, now)) {
      tower.nextAttackAt = now + 100
      continue
    }
    const candidates = room.monsters
      .filter((monster) =>
        monster.hp > 0
        && monsterIsDetected(room, monster)
        && Math.hypot(monster.x - tower.x, monster.z - tower.z) <= tower.range)
      .sort((a, b) => b.distance - a.distance || a.id - b.id)
    if (!candidates.length) continue
    const shots = Math.min(candidates.length, tower.multiTargetLimit)
    let appliedUntouchable = false
    const stats = towerStats(tower)
    const abilities = stats?.abilities || []
    for (const target of candidates.slice(0, shots)) {
      if (target.untouchable) appliedUntouchable = true
      const distance = Math.hypot(target.x - tower.x, target.z - tower.z)
      const damage = rollCritDamage(tower.damage, abilities)
      const style = projectileStyleForTower(tower.type, tower.multiTargetLimit)
      room.projectiles.push({
        id: nextProjectileId++,
        towerKey: tower.key,
        targetId: target.id,
        fromX: tower.x,
        fromZ: tower.z,
        damage,
        launchAt: now,
        // Lasers resolve immediately (next tick), no travel delay by distance.
        impactAt: style === 'laser' ? now : now + Math.max(120, distance / PROJECTILE_CELLS_PER_SECOND * 1000),
        color: style === 'laser'
          ? LASER_PROJECTILE_COLOR
          : style === 'arrow'
            ? ARROW_PROJECTILE_COLOR
            : projectileColor(tower.type),
        style,
      })
    }
    if (appliedUntouchable) applyUntouchableToTower(tower, now)
    tower.nextAttackAt = now + tower.intervalMs
  }
}

/** Ancient Bloodstone 叉状闪电: 25% on hit, up to 5 enemies in range for 2500 magical each. */
const FORK_LIGHTNING_CHANCE = 0.25
const FORK_LIGHTNING_DAMAGE = 2500
const FORK_LIGHTNING_TARGETS = 5

function tryForkedLightning(room: Room, now: number, tower: TowerRuntime, abilities: readonly string[]) {
  if (!abilities.includes('tower_chazhuangshandian')) return
  if (Math.random() >= FORK_LIGHTNING_CHANCE) return
  const targets = room.monsters
    .filter((monster) =>
      monster.hp > 0
      && monsterIsDetected(room, monster)
      && Math.hypot(monster.x - tower.x, monster.z - tower.z) <= tower.range)
    .sort((left, right) => {
      const leftDist = Math.hypot(left.x - tower.x, left.z - tower.z)
      const rightDist = Math.hypot(right.x - tower.x, right.z - tower.z)
      return leftDist - rightDist || left.id - right.id
    })
    .slice(0, FORK_LIGHTNING_TARGETS)
  if (!targets.length) return
  const segments: FxSegment[] = targets.map((target) => ({
    fromX: tower.x,
    fromZ: tower.z,
    toX: target.x,
    toZ: target.z,
  }))
  pushLightningFx(room, segments)
  for (const target of targets) {
    applyMonsterDamage(room, now, tower, target, FORK_LIGHTNING_DAMAGE, 'magical', [])
  }
}

function nearestChainTarget(
  room: Room,
  from: Monster,
  excludeIds: Set<number>,
  radiusCells: number,
  requireDetected: boolean,
) {
  let best: Monster | undefined
  let bestDist = Infinity
  for (const monster of room.monsters) {
    if (monster.hp <= 0 || excludeIds.has(monster.id)) continue
    if (requireDetected && !monsterIsDetected(room, monster)) continue
    const dist = Math.hypot(monster.x - from.x, monster.z - from.z)
    if (dist > radiusCells || dist >= bestDist) continue
    best = monster
    bestDist = dist
  }
  return best
}

function tryChainLightning(room: Room, now: number, tower: TowerRuntime, primary: Monster, abilities: readonly string[]) {
  if (!abilities.includes('tower_shandianlian')) return
  if (Math.random() >= CHAIN_LIGHTNING_CHANCE) return
  const hit = new Set<number>([primary.id])
  const path: Monster[] = []
  let current: Monster | undefined = primary
  for (let jump = 0; jump < CHAIN_LIGHTNING_JUMPS && current; jump++) {
    path.push(current)
    applyMonsterDamage(room, now, tower, current, CHAIN_LIGHTNING_DAMAGE, 'magical', [])
    hit.add(current.id)
    current = nearestChainTarget(room, current, hit, CHAIN_LIGHTNING_RADIUS_CELLS, true)
  }
  if (!path.length) return
  const segments: FxSegment[] = []
  let prevX = tower.x
  let prevZ = tower.z
  for (const monster of path) {
    segments.push({ fromX: prevX, fromZ: prevZ, toX: monster.x, toZ: monster.z })
    prevX = monster.x
    prevZ = monster.z
  }
  pushLightningFx(room, segments)
}

function tryChainFrost(room: Room, now: number, tower: TowerRuntime, primary: Monster, abilities: readonly string[]) {
  if (!abilities.includes('tower_chain_frost')) return
  if (Math.random() >= CHAIN_FROST_CHANCE) return
  const hit = new Set<number>()
  let current: Monster | undefined = primary
  for (let bounce = 0; bounce < CHAIN_FROST_BOUNCES && current; bounce++) {
    applyMonsterDamage(room, now, tower, current, CHAIN_FROST_DAMAGE, 'magical', [
      { kind: 'slow', level: CHAIN_FROST_SLOW_LEVEL },
    ])
    if (!current.magicImmune) applySlowDebuff(current, CHAIN_FROST_SLOW_LEVEL, now)
    hit.add(current.id)
    current = nearestChainTarget(room, current, hit, CHAIN_FROST_RADIUS_CELLS, true)
  }
}

function trySplashDamage(
  room: Room,
  now: number,
  tower: TowerRuntime,
  primary: Monster,
  hitDamage: number,
  abilities: readonly string[],
) {
  const level = splashAbilityLevel(abilities)
  if (!level) return
  const ratio = SPLASH_RATIO_BY_LEVEL[level] || 0
  const radius = (SPLASH_RADIUS_BY_LEVEL[level] || 0) / DOTA_UNITS_PER_CELL
  if (!ratio || !radius) return
  const splashDamage = hitDamage * ratio
  for (const monster of room.monsters) {
    if (monster.hp <= 0 || monster.id === primary.id) continue
    if (Math.hypot(monster.x - primary.x, monster.z - primary.z) > radius) continue
    applyMonsterDamage(room, now, tower, monster, splashDamage, 'physical', [])
  }
}

function tryRanjin(room: Room, now: number, tower: TowerRuntime, target: Monster, hitDamage: number, abilities: readonly string[]) {
  if (!abilities.includes('tower_ranjin')) return
  applyMonsterDamage(room, now, tower, target, hitDamage, 'magical', [])
}

function tryShihuaGaze(room: Room, now: number, tower: TowerRuntime, primary: Monster, abilities: readonly string[]) {
  if (!abilities.includes('tower_5shihua')) return false
  if (Math.random() >= SHIHUA_CHANCE) return false
  for (const monster of room.monsters) {
    if (monster.hp <= 0) continue
    if (Math.hypot(monster.x - tower.x, monster.z - tower.z) > SHIHUA_RADIUS_CELLS) continue
    if (!monster.magicImmune) applySlowDebuff(monster, SHIHUA_SLOW_LEVEL, now)
  }
  primary.stunUntil = Math.max(primary.stunUntil, now + SHIHUA_PETRIFY_MS)
  primary.physAmpUntil = Math.max(primary.physAmpUntil, now + SHIHUA_PETRIFY_MS)
  primary.physAmpPercent = Math.max(primary.physAmpPercent, SHIHUA_PHYS_AMP_PERCENT)
  return true
}

function tryZhongguoyuHeal(room: Room, abilities: readonly string[]) {
  if (!abilities.includes('tower_zhongguoyu')) return
  if (Math.random() >= ZHONGGUOYU_HEAL_CHANCE) return
  room.lives = Math.min(MAX_CASTLE_LIVES, room.lives + 1)
}

function resolveProjectiles(room: Room, now: number) {
  const pending: Projectile[] = []
  for (const projectile of room.projectiles) {
    if (projectile.impactAt > now) { pending.push(projectile); continue }
    const target = room.monsters.find((monster) => monster.id === projectile.targetId && monster.hp > 0)
    if (!target) continue
    const tower = room.combatTowers.find((entry) => entry.key === projectile.towerKey)
    if (!tower) continue
    if (!tower.cannotMiss && target.evasionPercent > 0 && Math.random() * 100 < target.evasionPercent) continue
    if (target.refractionCharges > 0) {
      target.refractionCharges -= 1
      continue
    }
    const stats = towerStats(tower)
    const abilities = stats?.abilities || []
    const debuffs = stats && !target.magicImmune
      ? applyHitDebuffs(target, abilities, now, tower.key)
      : stats && target.magicImmune
        ? applyHitDebuffs(target, abilities.filter((id) => armorBreakAbilityLevel(id)), now, tower.key)
        : []
    if (stats && tryApplyJiyunStun(target, abilities, now)) {
      debuffs.push({ kind: 'stun', level: 1 })
    }
    if (stats && tryShihuaGaze(room, now, tower, target, abilities)) {
      debuffs.push({ kind: 'stun', level: 2 })
      debuffs.push({ kind: 'slow', level: SHIHUA_SLOW_LEVEL })
    }
    applyMonsterDamage(room, now, tower, target, projectile.damage, 'physical', debuffs)
    if (stats) {
      tryRanjin(room, now, tower, target, projectile.damage, abilities)
      trySplashDamage(room, now, tower, target, projectile.damage, abilities)
      tryChainLightning(room, now, tower, target, abilities)
      tryChainFrost(room, now, tower, target, abilities)
      tryForkedLightning(room, now, tower, abilities)
      tryZhongguoyuHeal(room, abilities)
    }
  }
  room.projectiles = pending
  room.monsters = room.monsters.filter((monster) => monster.hp > 0)
}

function applyRadianceAuras(room: Room, now: number) {
  const tickSeconds = tickFractionSeconds()
  for (const tower of room.combatTowers) {
    if (!tower.radianceLevel || !tower.radianceDps) continue
    const tickDamage = tower.radianceDps * tickSeconds
    for (const target of room.monsters) {
      if (target.hp <= 0) continue
      // Radiance is an aura burn — hits invisible units without true sight.
      if (Math.hypot(target.x - tower.x, target.z - tower.z) > tower.range) continue
      applyMonsterDamage(room, now, tower, target, tickDamage, 'magical', [], { source: 'dot' })
    }
  }
}

function applyTimedDots(room: Room, now: number) {
  const tickSeconds = tickFractionSeconds()
  for (const target of room.monsters) {
    if (target.hp <= 0 || !target.dots.length) continue
    const remaining: DotEffect[] = []
    for (const dot of target.dots) {
      if (dot.until <= now) continue
      remaining.push(dot)
      const tower = room.combatTowers.find((entry) => entry.key === dot.towerKey)
      if (!tower) continue
      applyMonsterDamage(room, now, tower, target, dot.dps * tickSeconds, dot.damageType, [], { source: 'dot' })
    }
    target.dots = remaining
  }
}

function spawnMonster(room: Room, now: number) {
  const wave = waveData.waves[Math.max(0, Math.min(waveData.waves.length - 1, room.wave - 1))]
  const scaled = wave.byPlayerCount[String(room.playerCount) as keyof typeof wave.byPlayerCount]
  const path = wave.movement === 'flying' ? room.flyingRoute : room.route
  const start = path[0]
  const abilities = Array.isArray(wave.abilities) ? [...wave.abilities] : []
  const flags = monsterAbilityFlags(abilities, room.playerCount)
  room.monsters.push({
    id: nextMonsterId++,
    name: wave.name,
    x: start.x,
    z: start.z,
    hp: scaled.health,
    maxHp: scaled.health,
    armor: wave.base.armor + flags.armorBonus,
    magicResistancePercent: wave.base.magicResistancePercent,
    speed: scaled.moveSpeed / DOTA_UNITS_PER_CELL,
    distance: 0,
    flying: wave.movement === 'flying',
    boss: wave.boss,
    abilities,
    evasionPercent: flags.evasionPercent,
    physicalImmune: flags.physicalImmune,
    magicImmune: flags.magicImmune,
    invisible: flags.invisible,
    disarmAuraRange: flags.disarmAuraRange,
    untouchable: flags.untouchable,
    rechargePerSecond: flags.rechargePerSecond,
    rushUntil: 0,
    refractionCharges: 0,
    reactiveStacks: [],
    krakenAccum: 0,
    krakenWindowUntil: now + 10000,
    krakenCleanseThreshold: flags.krakenCleanseThreshold,
    lastPathSegment: 0,
    slowExpires: {},
    armorBreakUntil: 0,
    armorBreakLevel: 0,
    stunUntil: 0,
    physAmpUntil: 0,
    physAmpPercent: 0,
    dots: [],
  })
  room.spawned++
  room.nextSpawnAt = now + (wave.boss ? 1000 : 700)
}

function testSpawnIntervalMs(config: TestMonsterConfig) {
  return config.boss ? 1000 : 700
}

function spawnQueuedTestMonster(room: Room, now: number) {
  const job = room.testSpawnQueue[0]
  if (!job || job.remaining <= 0) {
    if (job) room.testSpawnQueue.shift()
    room.nextSpawnAt = room.testSpawnQueue.length ? now : Number.MAX_SAFE_INTEGER
    return
  }
  const monster = createTestMonster(room, now, job.config)
  if (!monster) {
    room.spawnCount = Math.max(room.spawned, room.spawnCount - job.remaining)
    room.testSpawnQueue.shift()
    room.nextSpawnAt = room.testSpawnQueue.length ? now : Number.MAX_SAFE_INTEGER
    return
  }
  room.monsters.push(monster)
  room.spawned++
  job.remaining--
  if (job.remaining <= 0) room.testSpawnQueue.shift()
  room.nextSpawnAt = now + testSpawnIntervalMs(job.config)
}

type TestMonsterConfig = {
  name?: string
  hp?: number
  armor?: number
  magicResistancePercent?: number
  moveSpeed?: number
  flying?: boolean
  boss?: boolean
  abilities?: string[]
  count?: number
}

const ALLOWED_TEST_ABILITIES = new Set([
  'guai_shanbi',
  'enemy_wumian',
  'enemy_momian',
  'riki_permanent_invisibility',
  'guai_jiaoxieguanghuan',
  'enemy_bukeqinfan',
  'enemy_recharge',
  'enemy_high_armor',
  'tidehunter_kraken_shell',
  'enemy_zheguang',
  'enemy_shanshuo',
  'runrunrun',
  'shredder_reactive_armor',
])

function createTestMonster(room: Room, now: number, config: TestMonsterConfig): Monster | undefined {
  const abilities = Array.isArray(config.abilities)
    ? [...new Set(config.abilities.filter((id) => typeof id === 'string' && ALLOWED_TEST_ABILITIES.has(id)))]
    : []
  const flags = monsterAbilityFlags(abilities, room.playerCount)
  const flying = Boolean(config.flying)
  const path = flying ? room.flyingRoute : room.route
  if (!path.length) return undefined
  const start = path[0]
  const hp = Math.max(1, Math.min(1_000_000, Number(config.hp) || 100))
  const armor = Math.max(-50, Math.min(200, Number(config.armor) || 0)) + flags.armorBonus
  const magicResistancePercent = Math.max(0, Math.min(100, Number(config.magicResistancePercent) || 0))
  const moveSpeed = Math.max(50, Math.min(2000, Number(config.moveSpeed) || 450))
  return {
    id: nextMonsterId++,
    name: (typeof config.name === 'string' && config.name.trim() ? config.name.trim() : '测试怪物').slice(0, 32),
    x: start.x,
    z: start.z,
    hp,
    maxHp: hp,
    armor,
    magicResistancePercent,
    speed: moveSpeed / DOTA_UNITS_PER_CELL,
    distance: 0,
    flying,
    boss: Boolean(config.boss),
    abilities,
    evasionPercent: flags.evasionPercent,
    physicalImmune: flags.physicalImmune,
    magicImmune: flags.magicImmune,
    invisible: flags.invisible,
    disarmAuraRange: flags.disarmAuraRange,
    untouchable: flags.untouchable,
    rechargePerSecond: flags.rechargePerSecond,
    rushUntil: 0,
    refractionCharges: 0,
    reactiveStacks: [],
    krakenAccum: 0,
    krakenWindowUntil: now + 10000,
    krakenCleanseThreshold: flags.krakenCleanseThreshold,
    lastPathSegment: 0,
    slowExpires: {},
    armorBreakUntil: 0,
    armorBreakLevel: 0,
    stunUntil: 0,
    physAmpUntil: 0,
    physAmpPercent: 0,
    dots: [],
  }
}

function updateRoom(room: Room, now: number) {
  if (room.phase !== 'combat') return
  const wave = waveData.waves[Math.max(0, Math.min(waveData.waves.length - 1, room.wave - 1))]
  if (room.spawned < room.spawnCount && now >= room.nextSpawnAt) {
    if (room.testCombat) spawnQueuedTestMonster(room, now)
    else spawnMonster(room, now)
  }
  const tickSeconds = tickFractionSeconds()
  for (const monster of room.monsters) {
    const path = monster.flying ? room.flyingRoute : room.route
    monster.distance += monsterEffectiveSpeed(monster, now, room) * tickSeconds
    const segment = pathSegmentIndex(path, monster.distance)
    if (segment !== monster.lastPathSegment) {
      monster.lastPathSegment = segment
      onMonsterDirectionChange(monster, path, now)
    }
    const point = pointOnPath(path, monster.distance)
    monster.x = point.x
    monster.z = point.z
    if (monster.rechargePerSecond > 0 && monster.hp > 0) {
      monster.hp = Math.min(monster.maxHp, monster.hp + monster.rechargePerSecond * tickSeconds)
    }
    if (monster.distance >= pathLength(path)) monster.hp = -1
  }
  const escaped = room.monsters.filter((monster) => monster.hp < 0).length
  if (escaped) room.lives = Math.max(0, room.lives - escaped * wave.leakDamage[0])
  room.monsters = room.monsters.filter((monster) => monster.hp >= 0)
  resolveProjectiles(room, now)
  applyRadianceAuras(room, now)
  applyTimedDots(room, now)
  room.monsters = room.monsters.filter((monster) => monster.hp > 0)
  flushPendingDotLogs(room)
  launchAttacks(room, now)
  if (room.spawned >= room.spawnCount && room.monsters.length === 0 && room.projectiles.length === 0) {
    flushPendingDotLogs(room, true)
    if (!room.testCombat) {
      room.pendingMvpAward = awardWaveMvp(room)
    }
    room.phase = 'build'
    room.combatTowers = []
    if (room.testCombat) {
      room.testCombat = false
      room.testSpawnQueue = []
    } else {
      room.wave = Math.min(waveData.waves.length, room.wave + 1)
    }
    room.forceBroadcast = true
  }
}

function monsterSnapshotStatuses(monster: Monster, now: number): Array<{ id: string; name: string; kind: 'buff' | 'debuff' | 'status'; detail?: string }> {
  const statuses: Array<{ id: string; name: string; kind: 'buff' | 'debuff' | 'status'; detail?: string }> = []
  const slowLevel = monsterEffectiveSlowLevel(monster, now)
  if (slowLevel) {
    const mult = slowMultiplierForLevel(slowLevel)
    statuses.push({
      id: `slow-${slowLevel}`,
      name: `减速 ${slowLevel}`,
      kind: 'debuff',
      detail: `移速 ×${mult.toFixed(2)}`,
    })
  }
  if (now < monster.armorBreakUntil && monster.armorBreakLevel > 0) {
    statuses.push({
      id: `armor-break-${monster.armorBreakLevel}`,
      name: `破甲 ${monster.armorBreakLevel}`,
      kind: 'debuff',
      detail: `护甲 -${armorBreakAmountForLevel(monster.armorBreakLevel)}`,
    })
  }
  if (now < monster.stunUntil) {
    const remain = Math.max(0.1, Math.round((monster.stunUntil - now) / 100) / 10)
    statuses.push({
      id: 'stun',
      name: now < monster.physAmpUntil ? '石化' : '眩晕',
      kind: 'debuff',
      detail: `${remain}s`,
    })
  }
  if (now < monster.physAmpUntil && monster.physAmpPercent > 0) {
    statuses.push({
      id: 'phys-amp',
      name: '易伤',
      kind: 'debuff',
      detail: `物理伤害 +${monster.physAmpPercent}%`,
    })
  }
  if (monster.dots.length) {
    const totalDps = monster.dots.reduce((sum, dot) => sum + dot.dps, 0)
    statuses.push({
      id: 'poison',
      name: '毒蚀',
      kind: 'debuff',
      detail: `${monster.dots.length} 层 · ${Math.round(totalDps)} DPS`,
    })
  }
  if (now < monster.rushUntil) {
    statuses.push({ id: 'rush', name: '冲刺', kind: 'buff', detail: '移速 ×1.5' })
  }
  if (monster.refractionCharges > 0) {
    statuses.push({
      id: 'refraction',
      name: '折光',
      kind: 'buff',
      detail: `${monster.refractionCharges} 层`,
    })
  }
  const reactiveBonus = monster.reactiveStacks
    .filter((stack) => stack.until > now)
    .reduce((sum, stack) => sum + stack.bonus, 0)
  if (reactiveBonus > 0) {
    statuses.push({
      id: 'reactive-armor',
      name: '活性护甲',
      kind: 'buff',
      detail: `护甲 +${reactiveBonus}`,
    })
  }
  if (monster.physicalImmune) statuses.push({ id: 'physical-immune', name: '物免', kind: 'status' })
  if (monster.magicImmune) statuses.push({ id: 'magic-immune', name: '魔免', kind: 'status' })
  if (monster.invisible) {
    statuses.push({
      id: 'invisible',
      name: '隐身',
      kind: 'status',
      detail: '需真视侦测',
    })
  }
  if (monster.untouchable) statuses.push({ id: 'untouchable', name: '不可侵犯', kind: 'status' })
  if (monster.evasionPercent > 0) {
    statuses.push({
      id: 'evasion',
      name: '闪避',
      kind: 'status',
      detail: `${monster.evasionPercent}%`,
    })
  }
  if (monster.rechargePerSecond > 0) {
    statuses.push({
      id: 'recharge',
      name: '充能',
      kind: 'buff',
      detail: `+${monster.rechargePerSecond}/秒`,
    })
  }
  return statuses
}

function snapshot(room: Room) {
  const newCombatEvents = room.pendingCombatEvents.splice(0)
  const fxEvents = room.pendingFxEvents.splice(0)
  const now = Date.now()
  return {
    type: 'snapshot', serverTime: now, phase: room.phase, wave: room.wave, tick: room.tick,
    lives: room.lives, kills: room.kills, gold: room.gold, experience: room.experience, heroLevel: room.heroLevel, nextLevelExperience: [250, 650, 1200, 1900, 1900][room.heroLevel - 1], playerCount: room.playerCount, spawned: room.spawned, spawnCount: room.spawnCount, resetVersion: room.resetVersion, resetKind: room.resetKind,
    monsters: room.monsters.map((monster) => ({
      id: monster.id,
      name: monster.name,
      x: monster.x,
      z: monster.z,
      hp: monster.hp,
      maxHp: monster.maxHp,
      armor: monsterEffectiveArmor(monster, now, room),
      baseArmor: monster.armor,
      magicResistancePercent: monsterEffectiveMagicResistance(monster, room),
      speed: monster.speed,
      effectiveSpeed: monsterEffectiveSpeed(monster, now, room),
      distance: monster.distance,
      flying: monster.flying,
      boss: monster.boss,
      abilities: monster.abilities,
      physicalImmune: monster.physicalImmune,
      magicImmune: monster.magicImmune,
      invisible: monster.invisible,
      cloaked: monster.invisible && !monsterIsDetected(room, monster),
      refractionCharges: monster.refractionCharges,
      evasionPercent: monster.evasionPercent,
      bountyGold: goldBountyForWave(room.wave),
      bountyExperience: experienceForWave(room.wave),
      statuses: monsterSnapshotStatuses(monster, now),
    })),
    projectiles: room.projectiles.map(({ id, towerKey, targetId, fromX, fromZ, launchAt, impactAt, color, style }) => ({ id, towerKey, targetId, fromX, fromZ, launchAt, impactAt, color, style })),
    newCombatEvents,
    fxEvents,
    mvpAward: room.pendingMvpAward,
  }
}

function send(connection: WebSocket, value: unknown) {
  if (connection.readyState === connection.OPEN) connection.send(JSON.stringify(value))
}

function broadcast(room: Room) {
  const payload = JSON.stringify(snapshot(room))
  // Deliver the award once with the build-phase snapshot, then clear.
  room.pendingMvpAward = undefined
  room.clients.forEach((connection) => { if (connection.readyState === connection.OPEN) connection.send(payload) })
}

export function handleGameConnection(connection: WebSocket, request: IncomingMessage) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const roomId = (url.searchParams.get('room') || 'defense').slice(0, 80)
  const room = roomFor(roomId)
  room.clients.add(connection)
  send(connection, snapshot(room))

  connection.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as {
        type?: string
        towers?: unknown
        wave?: number | 'all'
        resultKey?: string
        ingredientKeys?: string[]
        result?: TowerMeta
        monster?: TestMonsterConfig
        battle?: { wave?: number; lives?: number; kills?: number; gold?: number; experience?: number; heroLevel?: number }
        server?: {
          towerMeta?: Array<[string, TowerMeta]>
          lineageParent?: Array<[string, string]>
          waveStats?: Array<[number, Array<[string, TowerCombatStats]>]>
        }
      }
      if (message.type === 'resetWave') {
        resetWave(room)
        return broadcast(room)
      }
      if (message.type === 'resetGame') {
        resetGame(room)
        return broadcast(room)
      }
      if (message.type === 'getSaveState') {
        if (room.phase !== 'build') return send(connection, { type: 'error', message: '战斗中无法导出存档' })
        return send(connection, exportSaveState(room))
      }
      if (message.type === 'restoreSave') {
        const towers = validTowerLayout(message.towers)
        const restored = restoreSaveState(room, message.battle || {}, message.server || {}, towers)
        if (!restored.ok) return send(connection, { type: 'error', message: restored.message })
        return broadcast(room)
      }
      if (message.type === 'syncLayout' && room.phase === 'build') {
        const towers = validTowerLayout(message.towers)
        if (calculateRoute(towers)) {
          room.towers = towers
          syncTowerMeta(room, towers)
        }
      }
      if (message.type === 'registerCombine') {
        if (typeof message.resultKey !== 'string' || !Array.isArray(message.ingredientKeys) || !message.result?.type) {
          return send(connection, { type: 'error', message: '合成登记无效' })
        }
        registerCombine(room, message.resultKey, message.ingredientKeys, message.result)
        return
      }
      if (message.type === 'getLeaderboard') {
        const waveFilter = message.wave === 'all' || message.wave === undefined ? 'all' : Number(message.wave)
        return send(connection, {
          type: 'leaderboard',
          wave: waveFilter,
          availableWaves: availableLeaderboardWaves(room),
          entries: buildLeaderboard(room, waveFilter),
        })
      }
      if (message.type === 'getCombatEvents') {
        return send(connection, { type: 'combatEvents', events: room.combatEvents })
      }
      if (message.type === 'startWave') {
        if (room.phase !== 'build') return send(connection, { type: 'error', message: '当前波次仍在战斗中' })
        const towers = validTowerLayout(message.towers)
        const route = calculateRoute(towers)
        if (!route) return send(connection, { type: 'error', message: '当前塔阵阻断了怪物路线' })
        if (!towers.some((tower) => tower.type !== 'rock' && !tower.temporary && isCombatTower(tower))) return send(connection, { type: 'error', message: '至少需要一座可攻击的塔' })
        room.towers = towers
        room.route = route
        syncTowerMeta(room, towers)
        room.currentCombatWave = room.wave
        room.playerCount = Math.max(1, Math.min(4, room.clients.size))
        room.combatTowers = buildCombatTowers(towers)
        room.monsters = []
        room.projectiles = []
        room.spawned = 0
        room.spawnCount = waveData.waves[room.wave - 1]?.count || 10
        room.nextSpawnAt = Date.now() + 350
        room.testCombat = false
        room.phase = 'combat'
        broadcast(room)
      }
      if (message.type === 'spawnTestMonster') {
        const config = (message.monster || {}) as TestMonsterConfig
        const now = Date.now()
        if (room.phase === 'build') {
          const towers = validTowerLayout(message.towers)
          const route = calculateRoute(towers)
          if (!route) return send(connection, { type: 'error', message: '当前塔阵阻断了怪物路线' })
          if (!towers.some((tower) => tower.type !== 'rock' && !tower.temporary && isCombatTower(tower))) {
            return send(connection, { type: 'error', message: '至少需要一座可攻击的塔' })
          }
          room.towers = towers
          room.route = route
          syncTowerMeta(room, towers)
          room.currentCombatWave = room.wave
          room.playerCount = Math.max(1, Math.min(4, room.clients.size))
          room.combatTowers = buildCombatTowers(towers)
          room.monsters = []
          room.projectiles = []
          room.spawned = 0
          room.spawnCount = 0
          room.testSpawnQueue = []
          room.nextSpawnAt = Number.MAX_SAFE_INTEGER
          room.testCombat = true
          room.phase = 'combat'
        }
        if (room.phase !== 'combat') return send(connection, { type: 'error', message: '无法生成测试怪物' })
        if (!room.route.length) return send(connection, { type: 'error', message: '当前没有可用路线' })
        const count = Math.max(1, Math.min(100, Math.round(Number(config.count) || 1)))
        const path = Boolean(config.flying) ? room.flyingRoute : room.route
        if (!path.length) return send(connection, { type: 'error', message: '测试怪物生成失败' })
        if (!room.testCombat) {
          // Mid-wave cheat: keep legacy immediate spawn so wave spawn cadence is untouched.
          for (let i = 0; i < count; i++) {
            const monster = createTestMonster(room, now, config)
            if (!monster) break
            room.monsters.push(monster)
            room.spawned += 1
            room.spawnCount += 1
          }
          return broadcast(room)
        }
        const wasIdle = room.spawned >= room.spawnCount
        room.testSpawnQueue.push({ config, remaining: count })
        room.spawnCount += count
        // Same cadence as normal waves: short delay before first, then 700ms (boss 1000ms).
        if (wasIdle) room.nextSpawnAt = now + 350
        return broadcast(room)
      }
    } catch { send(connection, { type: 'error', message: '无法识别游戏指令' }) }
  })
  connection.on('close', () => room.clients.delete(connection))
}

setInterval(() => {
  const now = Date.now()
  rooms.forEach((room) => {
    room.tick++
    updateRoom(room, now)
    if (room.forceBroadcast || room.tick % SNAPSHOT_EVERY_TICKS === 0) {
      room.forceBroadcast = false
      broadcast(room)
    }
  })
}, TICK_MS).unref()

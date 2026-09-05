import towerData from './tower.json'
import type { BaseTowerId, BattleCombineOption, KeepOption, PlayerBuildState, RecipeIngredientPreview, RecipePreview, Tower, TowerAuraEffect } from './types'
import { CORNER_ZONE_SIZE, DOTA_UNITS_PER_CELL, GRID_SIZE, routePoints } from './constants'
import type { Cell } from './types'
import type * as Y from 'yjs'

const baseData = new Map(towerData.baseTowers.map((tower) => [tower.id, tower]))
const recipeData = new Map(towerData.recipes.map((recipe) => [recipe.id, recipe]))
const qualityNames = towerData.qualityLevels.map((quality) => quality.name)
const unitIdLabels = new Map<string, string>()

for (const base of towerData.baseTowers) {
  for (const level of base.levels) {
    const letter = level.unitId.match(/^gemtd_([a-z])/i)?.[1]?.toUpperCase()
    if (letter) unitIdLabels.set(level.unitId, `${letter}${level.level}`)
  }
}
for (const recipe of towerData.recipes) {
  unitIdLabels.set(recipe.id, recipe.name)
}

export { baseData, recipeData, qualityNames, towerData, unitIdLabels }

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

export function isBuildableCell(cell: Cell, towers: Y.Map<string>) {
  return !isReservedBuildCell(cell) && !routePointAt(cell) && !towers.has(cellKey(cell))
}

/** Empty cell, or a rock that can be replaced during the build placing phase. */
export function isPlaceableBuildCell(cell: Cell, towers: Y.Map<string>) {
  if (isReservedBuildCell(cell) || routePointAt(cell)) return false
  const existing = parseTower(towers.get(cellKey(cell)))
  if (!existing) return true
  return existing.type === 'rock'
}

const EDGE_ROCK_STRETCH = 4
const EDGE_ROCK: Tower = { type: 'rock', name: '岩石' }

function edgeRockCellsFromWaypoint(waypoint: Cell, axis: 'x' | 'z', direction: 1 | -1): Cell[] {
  const cells: Cell[] = []
  for (let step = 1; step <= EDGE_ROCK_STRETCH; step++) {
    if (axis === 'x') {
      const x = waypoint.x + direction * step
      if (x < 0 || x >= GRID_SIZE) break
      cells.push({ x, z: waypoint.z })
      continue
    }
    const z = waypoint.z + direction * step
    if (z < 0 || z >= GRID_SIZE) break
    cells.push({ x: waypoint.x, z })
  }
  return cells
}

export function initialEdgeRockCells(): Cell[] {
  const byLabel = Object.fromEntries(routePoints.map((point) => [point.label, point]))
  return [
    ...edgeRockCellsFromWaypoint(byLabel['1'], 'x', -1),
    ...edgeRockCellsFromWaypoint(byLabel['2'], 'x', 1),
    ...edgeRockCellsFromWaypoint(byLabel['4'], 'z', -1),
    ...edgeRockCellsFromWaypoint(byLabel['5'], 'z', 1),
  ]
}

export function applyInitialEdgeRocks(towers: Y.Map<string>) {
  const rock = JSON.stringify(EDGE_ROCK)
  for (const cell of initialEdgeRockCells()) {
    towers.set(cellKey(cell), rock)
  }
}

export function parseTower(value: string | undefined): Tower | undefined {
  try {
    return value ? JSON.parse(value) as Tower : undefined
  } catch {
    return undefined
  }
}

export function describeAbility(id: string) {
  const definitions: Record<string, [string, string]> = {
    tower_fenliejian: ['分裂箭 I', '一次攻击最多命中 4 个目标。'],
    tower_fenliejian_xianyan: ['分裂箭 II', '一次攻击最多命中 7 个目标。'],
    tower_fenliejian_you: ['辐射分裂', '一次攻击最多命中 15 个目标。'],
    tower_true_sight: ['真视', '可侦测隐形单位。'],
    tower_huiyao: ['辉耀光环', '每秒对附近敌人造成 60 点魔法伤害（可命中隐形单位）。'],
    tower_huiyao2: ['辉耀光环 II', '每秒对附近敌人造成 320 点魔法伤害（可命中隐形单位）。'],
    tower_huiyao3: ['辉耀光环 III', '每秒对附近敌人造成 2500 点魔法伤害（可命中隐形单位）。'],
    tower_zheyi: ['折射', '对飞行单位：护甲 −10，移动速度 −150（光环半径 600）。'],
    tower_zheyi2: ['折射 II', '对飞行单位：护甲 −10，移动速度 −250，魔抗 −50%（光环半径 600）。'],
    tower_zheyi3: ['折射 III', '对飞行单位：护甲 −64，移动速度 −480，魔抗 −100%（光环半径 600）。'],
    tower_10jiyun: ['厄运', '攻击有 10% 概率眩晕目标 2 秒。'],
    tower_bixi: ['碧玺之力', '附近敌人护甲 −15（光环半径 800）。'],
    tower_bixi2: ['碧玺之力 II', '附近敌人护甲 −30（光环半径 1200，无视魔免）。'],
    tower_maoyan: ['猫眼守护', '附近友方塔攻击力 +50%（光环半径 500）。'],
    tower_jin: ['点金', '攻击使目标护甲 −32。'],
    tower_jin2: ['点金 II', '攻击使目标护甲 −48。'],
    tower_baoji1: ['致命暴击', '攻击有 10% 概率造成 5 倍伤害。'],
    tower_shandianlian: ['闪电链', '攻击有 30% 概率释放闪电，跳跃 5 次，每次造成 150 点伤害。'],
    tower_chazhuangshandian: ['叉状闪电', '攻击有 25% 概率释放叉状闪电，最多命中 5 个敌人，造成 2500 点伤害。'],
    tower_chenmoguanghuan: ['沉默光环', '半径 600 内友方塔的魔法伤害可无视敌人魔免。'],
    tower_shechengguanghuan: ['射程光环', '半径 290 内友方塔攻击距离 +300。'],
    tower_lanbaoshi: ['蓝宝石寒霜', '攻击附带 3 级减速：移动速度 −30%，持续 3 秒。'],
    tower_lanbaoshi2: ['蓝宝石极寒', '攻击附带 4 级减速：移动速度 −40%，持续 3.4 秒。'],
    tower_speed_aura_guichu: ['鬼触攻速光环', '附近友方塔攻击速度 +80。'],
    tower_tanlan: ['贪婪', '附近友方塔击杀时有 5% 概率获得 10 倍金币（光环半径 800）。'],
    tower_5shihua: ['石化', '攻击有 1% 概率触发凝视：周围敌人大幅减速，主目标石化 3 秒并受到 100% 额外物理伤害。'],
    tower_jingzhun: ['精准', '半径 300 内友方塔攻击不会落空（无视闪避）。'],
    tower_chain_frost: ['连环霜冻', '攻击有 25% 概率发射霜球，在敌人间弹跳最多 10 次，每次造成魔法伤害并减速。'],
    tower_ranjin: ['燃尽', '每次攻击额外造成 100% 攻击力的魔法伤害。'],
    tower_jihan: ['极寒', '攻击附带 5 级减速：移动速度 −50%，持续 3.8 秒。'],
    tower_zhongguoyu: ['回春', '攻击有 1% 概率为宝石城堡恢复 1 点生命。'],
    tower_tianranzumulv: ['技能汲取', '建造时从周围 8 格的塔中随机吸收 2 个技能。'],
    e10001: ['特殊标记', '数据占位能力，无战斗效果。'],
    e10002: ['特殊标记', '数据占位能力，无战斗效果。'],
    e10003: ['特殊标记', '数据占位能力，无战斗效果。'],
    e10004: ['特殊标记', '数据占位能力，无战斗效果。'],
    e10005: ['特殊标记', '数据占位能力，无战斗效果。'],
    e10006: ['特殊标记', '数据占位能力，无战斗效果。'],
    e10007: ['特殊标记', '数据占位能力，无战斗效果。'],
    e10008: ['特殊标记', '数据占位能力，无战斗效果。'],
    e10009: ['特殊标记', '数据占位能力，无战斗效果。'],
  }
  const fixed = definitions[id]
  if (fixed) return { id, name: fixed[0], description: fixed[1] }

  const match = id.match(/^(tower_jianshe|tower_slow|tower_du|tower_speed|tower_jianjia|tower_attack|tower_speed_aura)(\d+)$/)
  if (match) {
    const [, kind, levelText] = match
    const level = Number(levelText)
    if (kind === 'tower_slow') {
      const slowPercent = Math.min(65, level * 10)
      const duration = (1800 + level * 400) / 1000
      return { id, name: `寒霜减速 ${level}`, description: `攻击降低敌人移动速度 ${slowPercent}%，持续 ${formatAbilitySeconds(duration)} 秒。` }
    }
    if (kind === 'tower_du') {
      const dps = [0, 2, 4, 8, 16, 32, 128][level] || 0
      return { id, name: `毒蚀 ${level}`, description: `攻击施加毒素：每秒 ${dps} 点魔法伤害，持续 5 秒。` }
    }
    if (kind === 'tower_jianjia') {
      const duration = (2600 + level * 400) / 1000
      return { id, name: `破甲 ${level}`, description: `攻击使敌人护甲 −${level}，持续 ${formatAbilitySeconds(duration)} 秒。` }
    }
    if (kind === 'tower_speed_aura') {
      const bonus = [0, 20, 30, 40, 50, 60, 70][level] || 0
      return { id, name: `攻速光环 ${level}`, description: `附近友方塔攻击速度 +${bonus}。` }
    }
    if (kind === 'tower_jianshe') {
      const ratios = [0, 30, 40, 50, 60, 70, 100]
      const ranges = [0, 300, 350, 400, 450, 500, 700]
      const ratio = ratios[level] ?? 0
      const range = ranges[level] ?? 0
      return { id, name: `溅射攻击 ${level}`, description: `命中后对目标周围 ${range} 范围内敌人造成 ${ratio}% 攻击伤害。` }
    }
    if (kind === 'tower_speed') {
      const bonus = level >= 2 ? 500 : 200
      return { id, name: `急速攻击 ${level}`, description: `自身攻击速度 +${bonus}。` }
    }
    if (kind === 'tower_attack') {
      const bonus = ATTACK_BONUS_BY_LEVEL[level] || 0
      return { id, name: `攻击强化 ${level}`, description: `攻击力 +${bonus}。` }
    }
  }
  return { id, name: id.replace(/^tower_/, '').replace(/_/g, ' '), description: '该塔固有的特殊能力。' }
}

const ATTACK_BONUS_BY_LEVEL = [0, 20, 40, 80, 160, 320, 640] as const

/** Flat attack bonus from the tower's own 攻击强化 ability (highest level wins). */
export function attackBonusFromAbilities(abilities: readonly string[]) {
  let best = 0
  for (const abilityId of abilities) {
    const match = abilityId.match(/^tower_attack(\d+)$/)
    if (!match) continue
    const level = Number(match[1])
    if (level >= 1 && level <= 6) best = Math.max(best, ATTACK_BONUS_BY_LEVEL[level] ?? 0)
  }
  return best
}

export function effectiveTowerDamageRange(stats: { damage: readonly [number, number] | number[]; abilities: readonly string[] }) {
  const bonus = attackBonusFromAbilities(stats.abilities)
  return [stats.damage[0] + bonus, stats.damage[1] + bonus] as const
}

function formatAbilitySeconds(seconds: number) {
  const rounded = Math.round(seconds * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Ally-tower auras only. Monster debuffs (radiance, slow on hit, etc.) must not appear here. */
export function isAllyBuffAuraAbility(abilityId: string) {
  return (
    /^tower_speed_aura/.test(abilityId)
    || abilityId === 'tower_shechengguanghuan'
    || abilityId === 'tower_maoyan'
    || abilityId === 'tower_chenmoguanghuan'
    || abilityId === 'tower_jingzhun'
    || abilityId === 'tower_tanlan'
  )
}

function classifyAuraEffect(abilityId: string): TowerAuraEffect['kind'] | undefined {
  return isAllyBuffAuraAbility(abilityId) ? 'buff' : undefined
}

// GemTD Overlook: aura radius 290, flat +300 attack range per provider.
const RANGE_AURA_RADIUS_CELLS = 290 / DOTA_UNITS_PER_CELL
const RANGE_AURA_BONUS_UNITS = 300
const CHENMO_AURA_RADIUS_CELLS = 600 / DOTA_UNITS_PER_CELL
const JINGZHUN_AURA_RADIUS_CELLS = 300 / DOTA_UNITS_PER_CELL
const TANLAN_AURA_RADIUS_CELLS = 800 / DOTA_UNITS_PER_CELL
const MAOYAN_AURA_RADIUS_CELLS = 500 / DOTA_UNITS_PER_CELL

/** Aura radius in grid cells. Uses ability-specific radii when known; otherwise the tower's attack range. */
export function getAllyBuffAuraRadiusCells(abilityId: string, attackRangeUnits: number) {
  if (!isAllyBuffAuraAbility(abilityId)) return undefined
  if (abilityId === 'tower_shechengguanghuan') return RANGE_AURA_RADIUS_CELLS
  if (abilityId === 'tower_chenmoguanghuan') return CHENMO_AURA_RADIUS_CELLS
  if (abilityId === 'tower_jingzhun') return JINGZHUN_AURA_RADIUS_CELLS
  if (abilityId === 'tower_tanlan') return TANLAN_AURA_RADIUS_CELLS
  if (abilityId === 'tower_maoyan') return MAOYAN_AURA_RADIUS_CELLS
  return attackRangeUnits / DOTA_UNITS_PER_CELL
}

export function computeReceivedAuraEffects(towers: Y.Map<string>, targetKey: string | undefined): TowerAuraEffect[] {
  if (!targetKey) return []

  const target = parseTower(towers.get(targetKey))
  if (!target || target.type === 'rock') return []

  const [targetX, targetZ] = targetKey.split(':').map(Number)
  const effects: TowerAuraEffect[] = []
  const seen = new Set<string>()

  towers.forEach((raw, sourceKey) => {
    const source = parseTower(raw)
    if (!source || source.type === 'rock') return

    const stats = getTowerStats(source)
    if (!stats) return

    const [sourceX, sourceZ] = sourceKey.split(':').map(Number)
    const distance = Math.hypot(sourceX - targetX, sourceZ - targetZ)

    for (const abilityId of stats.abilities) {
      const kind = classifyAuraEffect(abilityId)
      if (!kind) continue

      const auraRange = getAllyBuffAuraRadiusCells(abilityId, stats.range)
      if (auraRange === undefined || distance > auraRange) continue

      const dedupeKey = `${abilityId}:${sourceKey}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const ability = describeAbility(abilityId)
      effects.push({
        id: dedupeKey,
        name: ability.name,
        description: ability.description,
        kind,
        sourceKey,
        sourceName: towerDisplayName(source),
      })
    }
  })

  return effects.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'buff' ? -1 : 1
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

const BASE_ATTACK_SPEED = 100
const SPEED_AURA_BONUS_BY_LEVEL = [0, 20, 30, 40, 50, 60, 70] as const

export function speedAuraBonusFromAbilities(abilities: readonly string[]) {
  let best = 0
  for (const abilityId of abilities) {
    if (abilityId === 'tower_speed_aura_guichu') {
      best = Math.max(best, 80)
      continue
    }
    const match = abilityId.match(/^tower_speed_aura(\d+)$/)
    if (!match) continue
    const level = Number(match[1])
    if (level >= 1 && level <= 6) best = Math.max(best, SPEED_AURA_BONUS_BY_LEVEL[level])
  }
  return best
}

/** Self 急速攻击: tower_speed1 = +200, tower_speed2+ = +500. */
export function selfSpeedBonusFromAbilities(abilities: readonly string[]) {
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

export function computeSpeedAuraBonus(towers: Y.Map<string>, targetKey: string) {
  const target = parseTower(towers.get(targetKey))
  if (!target || target.type === 'rock') return 0

  const [targetX, targetZ] = targetKey.split(':').map(Number)
  let bonus = 0
  towers.forEach((raw, sourceKey) => {
    const source = parseTower(raw)
    if (!source || source.type === 'rock') return

    const stats = getTowerStats(source)
    if (!stats) return

    const providerBonus = speedAuraBonusFromAbilities(stats.abilities)
    if (!providerBonus) return

    const auraRange = stats.range / DOTA_UNITS_PER_CELL
    const [sourceX, sourceZ] = sourceKey.split(':').map(Number)
    if (Math.hypot(sourceX - targetX, sourceZ - targetZ) > auraRange) return
    bonus += providerBonus
  })
  return bonus
}

export function computeEffectiveAttackIntervalSeconds(towers: Y.Map<string>, targetKey: string | undefined) {
  if (!targetKey) return undefined
  const stats = getTowerStats(parseTower(towers.get(targetKey)))
  if (!stats) return undefined

  const baseIntervalMs = Math.max(100, stats.attackIntervalSeconds * 1000)
  const bonus = selfSpeedBonusFromAbilities(stats.abilities) + computeSpeedAuraBonus(towers, targetKey)
  const totalAttackSpeed = BASE_ATTACK_SPEED + bonus
  return Math.max(0.1, Math.round(baseIntervalMs * BASE_ATTACK_SPEED / totalAttackSpeed) / 1000)
}

export function computeRangeAuraBonus(towers: Y.Map<string>, targetKey: string) {
  const target = parseTower(towers.get(targetKey))
  if (!target || target.type === 'rock') return 0

  const [targetX, targetZ] = targetKey.split(':').map(Number)
  let bonus = 0
  towers.forEach((raw, sourceKey) => {
    const source = parseTower(raw)
    if (!source || source.type === 'rock') return
    const stats = getTowerStats(source)
    if (!stats?.abilities.includes('tower_shechengguanghuan')) return
    const [sourceX, sourceZ] = sourceKey.split(':').map(Number)
    if (Math.hypot(sourceX - targetX, sourceZ - targetZ) > RANGE_AURA_RADIUS_CELLS) return
    bonus += RANGE_AURA_BONUS_UNITS
  })
  return bonus
}

export function computeEffectiveRange(towers: Y.Map<string>, targetKey: string | undefined) {
  if (!targetKey) return undefined
  const stats = getTowerStats(parseTower(towers.get(targetKey)))
  if (!stats) return undefined
  return stats.range + computeRangeAuraBonus(towers, targetKey)
}

export function formatAttackIntervalSeconds(seconds: number) {
  const rounded = Math.round(seconds * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

export function baseTowerName(type: string, quality: number) {
  const definition = baseData.get(type)
  if (!definition) return type
  const abbreviation = definition.levels[quality - 1]?.unitId.match(/^gemtd_([a-z])/i)?.[1]?.toUpperCase()
  return `${qualityNames[quality - 1]}${definition.name}${abbreviation ? ` ${abbreviation}${quality}` : ''}`
}

export function towerDisplayName(tower: Tower) {
  if (tower.type === 'rock') return '岩石'
  if (tower.name) return tower.name
  const definition = baseData.get(tower.type)
  if (definition) return baseTowerName(tower.type, tower.quality || 1)
  const recipeId = tower.unitId || tower.type
  const recipe = recipeData.get(recipeId)
  if (recipe) return recipe.name
  return unitIdShortLabel(recipeId)
}

export function unitIdShortLabel(unitId: string) {
  return unitIdLabels.get(unitId) || unitId.replace(/^gemtd_/, '')
}

function collectOwnedUnitIdCounts(towers: Y.Map<string>) {
  const counts = new Map<string, number>()
  towers.forEach((raw) => {
    const tower = parseTower(raw)
    if (!tower || tower.type === 'rock' || tower.temporary) return
    const unitId = tower.unitId || (tower.type.startsWith('gemtd_') ? tower.type : undefined)
    if (!unitId) return
    counts.set(unitId, (counts.get(unitId) || 0) + 1)
  })
  return counts
}

function previewRecipeIngredients(ingredients: string[], ownedCounts: Map<string, number>): RecipeIngredientPreview[] {
  const pool = new Map(ownedCounts)
  return ingredients.map((unitId) => {
    const remaining = pool.get(unitId) || 0
    const owned = remaining > 0
    if (owned) pool.set(unitId, remaining - 1)
    return { unitId, label: unitIdShortLabel(unitId), count: ownedCounts.get(unitId) || 0, owned }
  })
}

const recipeTierOrder: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2, super: 3 }

export function computeFutureRecipePreviews(towers: Y.Map<string>, selectedTowerKey: string | undefined): RecipePreview[] {
  if (!selectedTowerKey) return []
  const selected = parseTower(towers.get(selectedTowerKey))
  if (!selected || selected.type === 'rock') return []

  const selectedUnitId = selected.unitId || (selected.type.startsWith('gemtd_') ? selected.type : undefined)
  if (!selectedUnitId) return []

  const ownedCounts = collectOwnedUnitIdCounts(towers)
  return towerData.recipes
    .filter((recipe) => recipe.ingredients.includes(selectedUnitId))
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      tier: recipe.tier,
      ingredients: previewRecipeIngredients(recipe.ingredients, ownedCounts),
    }))
    .sort((left, right) => {
      const tierDiff = (recipeTierOrder[left.tier] ?? 99) - (recipeTierOrder[right.tier] ?? 99)
      return tierDiff || left.name.localeCompare(right.name, 'zh-CN')
    })
}

export function typeHash(type: string) {
  return Math.abs([...type].reduce((value, character) => ((value << 5) - value + character.charCodeAt(0)) | 0, 0))
}

export function rollQuality(playerLevel: number) {
  const probabilities = towerData.playerLevelProbabilities[String(playerLevel) as keyof typeof towerData.playerLevelProbabilities]
  const roll = Math.random() * 100
  let accumulated = 0
  for (let index = 0; index < probabilities.length; index++) {
    accumulated += probabilities[index]
    if (roll < accumulated) return index + 1
  }
  return 1
}

export function createBaseTower(type: BaseTowerId, quality: number, temporary: boolean, ownerId: string): Tower {
  const definition = baseData.get(type)!
  const index = Math.max(0, Math.min(definition.levels.length - 1, quality - 1))
  const level = definition.levels[index]
  return {
    type,
    quality: level.level,
    unitId: level.unitId,
    name: baseTowerName(type, level.level),
    temporary,
    ownerId,
  }
}

export function rollTower(heroLevel: number, ownerId: string): Tower {
  const definition = towerData.baseTowers[Math.floor(Math.random() * towerData.baseTowers.length)]
  return createBaseTower(definition.id as BaseTowerId, rollQuality(heroLevel), true, ownerId)
}

export function getTowerStats(tower: Tower | undefined) {
  if (!tower) return undefined
  const base = baseData.get(tower.type)
  const stats = base
    ? base.levels[Math.max(0, Math.min(base.levels.length - 1, (tower.quality || 1) - 1))]
    : towerData.recipes.find((recipe) => recipe.id === tower.type)?.stats
  if (!stats) return undefined
  if (!tower.abilities?.length) return stats
  return {
    ...stats,
    abilities: [...new Set([...stats.abilities, ...tower.abilities])],
  }
}

export const TIANRAN_ZUMULV_ID = 'gemtd_tianranzumulv'
const TIANRAN_ABSORB_COUNT = 2
const TIANRAN_SKIP_ABILITY_IDS = new Set(['tower_tianranzumulv'])
const NEIGHBOR_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
] as const

function isTianranZumulv(tower: Tower) {
  return tower.type === TIANRAN_ZUMULV_ID || tower.unitId === TIANRAN_ZUMULV_ID
}

function collectNeighborAbilityPool(towers: Y.Map<string>, centerKey: string) {
  const [centerX, centerZ] = centerKey.split(':').map(Number)
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) return [] as string[]
  const pool: string[] = []
  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const key = `${centerX + dx}:${centerZ + dz}`
    const neighbor = parseTower(towers.get(key))
    if (!neighbor || neighbor.type === 'rock') continue
    const stats = getTowerStats(neighbor)
    if (!stats?.abilities.length) continue
    for (const abilityId of stats.abilities) {
      if (TIANRAN_SKIP_ABILITY_IDS.has(abilityId)) continue
      pool.push(abilityId)
    }
  }
  return pool
}

function pickRandomUniqueAbilities(pool: readonly string[], count: number) {
  const unique = [...new Set(pool)]
  for (let index = unique.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[unique[index], unique[swap]] = [unique[swap], unique[index]]
  }
  return unique.slice(0, count)
}

/** Natural Emerald: on build, absorb up to 2 random abilities from towers in the 8 adjacent cells. */
export function applyTianranZumulvAbsorb(towers: Y.Map<string>, targetKey: string, result: Tower): Tower {
  if (!isTianranZumulv(result)) return result
  const absorbed = pickRandomUniqueAbilities(collectNeighborAbilityPool(towers, targetKey), TIANRAN_ABSORB_COUNT)
  if (!absorbed.length) return { ...result, abilities: undefined }
  return { ...result, abilities: absorbed }
}

export function formatAbsorbedAbilityNames(abilityIds: readonly string[] | undefined) {
  if (!abilityIds?.length) return ''
  return abilityIds.map((id) => describeAbility(id).name).join('、')
}

export function getTowerRangeCells(tower: Tower | undefined) {
  if (!tower || tower.type === 'rock') return undefined
  const stats = getTowerStats(tower)
  if (!stats) return undefined
  return stats.range / DOTA_UNITS_PER_CELL
}

export function getEffectiveTowerRangeCells(towers: Y.Map<string>, targetKey: string | undefined) {
  const range = computeEffectiveRange(towers, targetKey)
  return range === undefined ? undefined : range / DOTA_UNITS_PER_CELL
}

export function getTowerAbilities(tower: Tower | undefined) {
  return getTowerStats(tower)?.abilities.map(describeAbility) || []
}

export function listCombatLayout(towers: Y.Map<string>) {
  const layout: (Tower & { key: string })[] = []
  towers.forEach((raw, towerKey) => {
    const tower = parseTower(raw)
    if (tower) layout.push({ ...tower, key: towerKey })
  })
  return layout
}

type TowerEntry = { key: string; tower: Tower }

function matchRecipeIngredients(
  entries: TowerEntry[],
  recipeIngredients: string[],
  targetKey: string,
): TowerEntry[] | undefined {
  const target = entries.find((entry) => entry.key === targetKey)
  if (!target?.tower.unitId) return undefined

  const remaining = [...recipeIngredients]
  const targetIndex = remaining.indexOf(target.tower.unitId)
  if (targetIndex < 0) return undefined
  remaining.splice(targetIndex, 1)

  const matched = [target]
  const pool = entries.filter((entry) => entry.key !== targetKey)
  for (const ingredient of remaining) {
    const index = pool.findIndex((entry) => entry.tower.unitId === ingredient)
    if (index < 0) return undefined
    matched.push(pool.splice(index, 1)[0])
  }
  return matched
}

export function computeKeepOptions(buildState: PlayerBuildState, towers: Y.Map<string>, playerId: string): KeepOption[] {
  if (buildState.phase !== 'choosing') return []
  const entries = buildState.pendingKeys
    .map((towerKey) => ({ key: towerKey, tower: parseTower(towers.get(towerKey)) }))
    .filter((entry): entry is { key: string; tower: Tower } => Boolean(entry.tower?.temporary && entry.tower.ownerId === playerId))
  const options: KeepOption[] = entries.map((entry, index) => ({
    id: `single:${entry.key}`,
    label: towerDisplayName(entry.tower),
    detail: `第 ${index + 1} 个 · ${entry.key}`,
    targetKey: entry.key,
    result: { ...entry.tower, temporary: false },
  }))

  const groups = new Map<string, typeof entries>()
  entries.forEach((entry) => {
    const groupKey = entry.tower.unitId || `${entry.tower.type}:${entry.tower.quality}`
    groups.set(groupKey, [...(groups.get(groupKey) || []), entry])
  })
  groups.forEach((group) => {
    for (const bonus of [1, 2]) {
      const needed = bonus === 1 ? 2 : 4
      const currentQuality = group[0].tower.quality || 1
      if (group.length < needed || currentQuality + bonus > 5 || group[0].tower.type === 'rock') continue
      const result = createBaseTower(group[0].tower.type as BaseTowerId, currentQuality + bonus, false, playerId)
      group.forEach((entry) => options.push({
        id: `upgrade:${bonus}:${entry.key}`,
        label: `${result.name} +${bonus}`,
        detail: `${needed} 个相同塔升 ${bonus} 级`,
        targetKey: entry.key,
        result,
      }))
    }
  })

  for (const recipe of towerData.recipes) {
    const result = { type: recipe.id, unitId: recipe.id, name: recipe.name, temporary: false }
    const isAbsorb = recipe.id === TIANRAN_ZUMULV_ID
    for (const entry of entries) {
      if (!matchRecipeIngredients(entries, recipe.ingredients, entry.key)) continue
      options.push({
        id: `recipe:${recipe.id}:${entry.key}`,
        label: recipe.name,
        detail: isAbsorb ? `${recipe.tier} 合成 · 建造时汲取周围 8 格随机 2 技能` : `${recipe.tier} 合成`,
        targetKey: entry.key,
        result,
      })
    }
  }
  return options
}

export function computeBattleCombineOptions(
  buildState: PlayerBuildState,
  towers: Y.Map<string>,
  selectedTowerKey: string | undefined,
): BattleCombineOption[] {
  if (buildState.phase !== 'idle' || !selectedTowerKey) return []
  const entries = [...towers.entries()]
    .map(([entryKey, raw]) => ({ key: entryKey, tower: parseTower(raw) }))
    .filter((entry): entry is { key: string; tower: Tower } => Boolean(entry.tower && !entry.tower.temporary && entry.tower.type !== 'rock'))
  const selected = entries.find((entry) => entry.key === selectedTowerKey)
  if (!selected) return []

  const options: BattleCombineOption[] = []
  for (const recipe of towerData.recipes) {
    const matched = matchRecipeIngredients(entries, recipe.ingredients, selected.key)
    if (!matched) continue
    const isAbsorb = recipe.id === TIANRAN_ZUMULV_ID
    options.push({
      id: `battle-recipe:${recipe.id}:${selected.key}`,
      label: `合成 ${recipe.name}`,
      detail: isAbsorb
        ? `${recipe.tier} 配方 · 建造时汲取周围 8 格随机 2 技能`
        : `${recipe.tier} 配方 · 消耗 ${matched.length} 座塔`,
      targetKey: selected.key,
      result: { type: recipe.id, unitId: recipe.id, name: recipe.name, temporary: false },
      ingredientKeys: matched.map((entry) => entry.key),
      ingredientUnitIds: matched.map((entry) => entry.tower.unitId || ''),
    })
  }
  return options
}

export function parsePlayerBuildState(raw: string) {
  try {
    return JSON.parse(raw) as PlayerBuildState
  } catch {
    return undefined
  }
}

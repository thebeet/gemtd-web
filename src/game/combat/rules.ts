import {
  BASE_ATTACK_SPEED, MVP_MAX_STACKS, MVP_BONUS_PER_STACK,
} from '../towerRules'
import towerData from '../tower.json' with { type: 'json' }
import { DOTA_UNITS_PER_CELL } from '../constants'
import type { Cell } from '../types'
import type { TowerInput, TestMonsterConfig } from './types'

export const TICK_MS = 50
export const SNAPSHOT_EVERY_TICKS = 2
export const PROJECTILE_CELLS_PER_SECOND = 9
export const baseTowers = new Map(towerData.baseTowers.map((tower) => [tower.id, tower]))
export const recipes = new Map(towerData.recipes.map((recipe) => [recipe.id, recipe]))
export const MVP_AURA_BONUS = MVP_MAX_STACKS * MVP_BONUS_PER_STACK
export const BIXI_AURA_RADIUS_CELLS = 800 / DOTA_UNITS_PER_CELL
export const BIXI2_AURA_RADIUS_CELLS = 1200 / DOTA_UNITS_PER_CELL
export const ZHEYI_AURA_RADIUS_CELLS = 600 / DOTA_UNITS_PER_CELL
export const SPLASH_RATIO_BY_LEVEL = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 1] as const
export const SPLASH_RADIUS_BY_LEVEL = [0, 300, 350, 400, 450, 500, 700] as const
export const CRIT_CHANCE = 0.1
export const CRIT_MULTIPLIER = 5
export const CHAIN_LIGHTNING_CHANCE = 0.3
export const CHAIN_LIGHTNING_DAMAGE = 150
export const CHAIN_LIGHTNING_JUMPS = 5
export const CHAIN_LIGHTNING_RADIUS_CELLS = 1000 / DOTA_UNITS_PER_CELL
export const CHAIN_FROST_CHANCE = 0.25
export const CHAIN_FROST_DAMAGE = 250
export const CHAIN_FROST_BOUNCES = 10
export const CHAIN_FROST_RADIUS_CELLS = 600 / DOTA_UNITS_PER_CELL
export const CHAIN_FROST_SLOW_LEVEL = 3
export const SHIHUA_CHANCE = 0.01
export const SHIHUA_RADIUS_CELLS = 1000 / DOTA_UNITS_PER_CELL
export const SHIHUA_SLOW_LEVEL = 6
export const SHIHUA_PETRIFY_MS = 3000
export const SHIHUA_PHYS_AMP_PERCENT = 100
export const ZHONGGUOYU_HEAL_CHANCE = 0.01
export const MAX_CASTLE_LIVES = 100
export const JIYUN_STUN_CHANCE = 0.1
export const JIYUN_STUN_MS = 2000
export const MAX_COMBAT_EVENTS = 800
export const LIGHTNING_FX_COLOR = '#ff3b3b'
export const LASER_TOWER_IDS = new Set([
  'gemtd_baiyin',
  'gemtd_baiyinqishi',
  'gemtd_fenhongzuanshi',
  'gemtd_juxingfenhongzuanshi',
  'gemtd_keyinuoerguangmingzhishan',
])
export const LASER_PROJECTILE_COLOR = '#c8f0ff'
export const ARROW_PROJECTILE_COLOR = '#5dff8a'
export const GREED_AURA_RADIUS_CELLS = 800 / DOTA_UNITS_PER_CELL
export const FORK_LIGHTNING_CHANCE = 0.25
export const FORK_LIGHTNING_DAMAGE = 2500
export const FORK_LIGHTNING_TARGETS = 5
export const ALLOWED_TEST_ABILITIES = new Set([
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

export function towerStats(tower: TowerInput) {
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

export function huiyaoAbilityLevel(abilities: readonly string[]) {
  if (abilities.includes('tower_huiyao3')) return 3
  if (abilities.includes('tower_huiyao2')) return 2
  if (abilities.includes('tower_huiyao')) return 1
  return 0
}

export function radianceDpsForLevel(level: number) {
  // GemTD tooltips: burn 1/2/3 = 60 / 320 / 2500 magical DPS
  return [0, 60, 320, 2500][level] || 0
}

export function poisonAbilityLevel(abilityId: string) {
  const match = abilityId.match(/^tower_du(\d+)$/)
  return match ? Number(match[1]) : undefined
}

export function poisonDpsForLevel(level: number) {
  return [0, 2, 4, 8, 16, 32, 128][level] || 0
}

export function poisonDurationMs() {
  return 5000
}

export function tickFractionSeconds() {
  return TICK_MS / 1000
}

export function isCombatTower(tower: TowerInput) {
  const stats = towerStats(tower)
  if (!stats) return false
  return stats.damage[1] > 0 || huiyaoAbilityLevel(stats.abilities) > 0
}

export function multiTargetLimit(abilities: readonly string[]) {
  // GemTD's split-shot tiers: split I, split II and radiation respectively.
  if (abilities.includes('tower_fenliejian_you')) return 15
  if (abilities.includes('tower_fenliejian_xianyan')) return 7
  if (abilities.includes('tower_fenliejian')) return 4
  return 1
}

export function hasRangeAura(abilities: readonly string[]) {
  return abilities.includes('tower_shechengguanghuan')
}

export function splashAbilityLevel(abilities: readonly string[]) {
  let best = 0
  for (const abilityId of abilities) {
    const match = abilityId.match(/^tower_jianshe(\d+)$/)
    if (!match) continue
    const level = Number(match[1])
    if (level >= 1 && level <= 6) best = Math.max(best, level)
  }
  return best
}

export function rollCritDamage(baseDamage: number, abilities: readonly string[]) {
  if (!abilities.includes('tower_baoji1')) return baseDamage
  if (Math.random() >= CRIT_CHANCE) return baseDamage
  return baseDamage * CRIT_MULTIPLIER
}

export function effectiveAttackIntervalMs(baseIntervalMs: number, speedAuraBonus: number) {
  const totalAttackSpeed = BASE_ATTACK_SPEED + speedAuraBonus
  return Math.max(100, Math.round(baseIntervalMs * BASE_ATTACK_SPEED / totalAttackSpeed))
}

export function difficultyIndex(playerCount: number) {
  return Math.max(0, Math.min(3, playerCount - 1))
}

export function pickByDifficulty<T>(values: readonly T[], playerCount: number) {
  return values[difficultyIndex(playerCount)] ?? values[0]
}

export function pathSegmentIndex(path: Cell[], distance: number) {
  let remaining = distance
  for (let index = 1; index < path.length; index++) {
    const length = Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z)
    if (remaining <= length) return index - 1
    remaining -= length
  }
  return Math.max(0, path.length - 2)
}

export function monsterAbilityFlags(abilities: readonly string[], playerCount: number) {
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

export function pathLength(path: Cell[]) {
  let result = 0
  for (let index = 1; index < path.length; index++) result += Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z)
  return result
}

export function pointOnPath(path: Cell[], distance: number) {
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

export function armorMultiplier(armor: number) {
  return 1 - (0.06 * armor) / (1 + 0.06 * Math.abs(armor))
}

export function magicResistanceMultiplier(magicResistancePercent: number) {
  return 1 - magicResistancePercent / 100
}

export function slowAbilityLevel(abilityId: string) {
  if (abilityId === 'tower_lanbaoshi') return 3
  if (abilityId === 'tower_lanbaoshi2') return 4
  if (abilityId === 'tower_jihan') return 5
  const match = abilityId.match(/^tower_slow(\d+)$/)
  return match ? Number(match[1]) : undefined
}

export function armorBreakAbilityLevel(abilityId: string) {
  if (abilityId === 'tower_jin') return 32
  if (abilityId === 'tower_jin2') return 48
  const match = abilityId.match(/^tower_jianjia(\d+)$/)
  return match ? Number(match[1]) : undefined
}

export function slowMultiplierForLevel(level: number) {
  return Math.max(0.35, 1 - level * 0.1)
}

export function slowDurationMs(level: number) {
  return 1800 + level * 400
}

export function armorBreakAmountForLevel(level: number) {
  return level
}

export function armorBreakDurationMs(level: number) {
  return 2600 + level * 400
}

export function projectileColor(type: string) {
  return ({ ruby: '#ff6b57', topaz: '#ffd75f', sapphire: '#68b8ff', emerald: '#62e398', aquamarine: '#68f2e5', amethyst: '#c78cff', diamond: '#e8ffff', opal: '#ff9ed1' } as Record<string, string>)[type] || '#fff3a5'
}

export function projectileStyleForTower(type: string, multiLimit: number): 'orb' | 'laser' | 'arrow' {
  if (LASER_TOWER_IDS.has(type)) return 'laser'
  // Split-shot towers (孔雀石 / 铀 / 黄玉等): green arrow + trail.
  if (multiLimit > 1) return 'arrow'
  return 'orb'
}

export function experienceForWave(wave: number) {
  if (wave % 10 === 0) return 300
  if (wave <= 9) return 5
  if (wave <= 19) return 10
  if (wave <= 29) return 15
  if (wave <= 39) return 20
  return 25
}

export function goldBountyForWave(wave: number) {
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

export function testSpawnIntervalMs(config: TestMonsterConfig) {
  return config.boss ? 1000 : 700
}

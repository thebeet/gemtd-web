import { DOTA_UNITS_PER_CELL } from './constants'

export const ATTACK_BONUS_BY_LEVEL = [0, 20, 40, 80, 160, 320, 640] as const
export const BASE_ATTACK_SPEED = 100
export const SPEED_AURA_BONUS_BY_LEVEL = [0, 20, 30, 40, 50, 60, 70] as const
export const SPEED_AURA_RADIUS_CELLS = 664 / DOTA_UNITS_PER_CELL
export const GUICHU_SPEED_AURA_RADIUS_CELLS = 200 / DOTA_UNITS_PER_CELL
export const RANGE_AURA_RADIUS_CELLS = 290 / DOTA_UNITS_PER_CELL
export const RANGE_AURA_BONUS_UNITS = 300
export const MAOYAN_AURA_RADIUS_CELLS = 500 / DOTA_UNITS_PER_CELL
export const MVP_MAX_STACKS = 10
export const MVP_BONUS_PER_STACK = 0.1
export const MVP_AURA_RADIUS_CELLS = 500 / DOTA_UNITS_PER_CELL
export const CHENMO_AURA_RADIUS_CELLS = 600 / DOTA_UNITS_PER_CELL
export const JINGZHUN_AURA_RADIUS_CELLS = 300 / DOTA_UNITS_PER_CELL

/** Flat attack bonus: the strongest level wins. */
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

/** Self attack speed: tower_speed1 = +200, tower_speed2+ = +500. */
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

export function clampMvpStacks(value: unknown) {
  const stacks = Math.floor(Number(value) || 0)
  return Math.max(0, Math.min(MVP_MAX_STACKS, stacks))
}

export function mvpSelfBonus(stacks: number) {
  return clampMvpStacks(stacks) * MVP_BONUS_PER_STACK
}

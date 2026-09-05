import type { BattleMonster } from './types'

const MONSTER_ABILITY_META: Record<string, { name: string; description: string }> = {
  guai_shanbi: { name: '闪避', description: '攻击有 50% 概率落空。' },
  enemy_wumian: { name: '物免', description: '免疫物理伤害。' },
  enemy_momian: { name: '魔免', description: '免疫魔法伤害。' },
  riki_permanent_invisibility: { name: '隐身', description: '永久隐身，需真视才能被攻击。' },
  guai_jiaoxieguanghuan: { name: '缴械光环', description: '附近防御塔被缴械。' },
  enemy_bukeqinfan: { name: '不可侵犯', description: '受攻击时反制，降低攻击者攻速。' },
  enemy_recharge: { name: '充能', description: '持续回复生命。' },
  enemy_high_armor: { name: '高护甲', description: '额外护甲加成。' },
  tidehunter_kraken_shell: { name: '海妖外壳', description: '短时间内受到足量伤害会净化负面状态。' },
  enemy_zheguang: { name: '折光', description: '转向时获得抵挡伤害的折光层数。' },
  enemy_shanshuo: { name: '闪烁', description: '转向时有概率沿路径向前闪烁。' },
  runrunrun: { name: '冲刺', description: '转向后短时间大幅加速。' },
  shredder_reactive_armor: { name: '活性护甲', description: '受击叠加临时护甲。' },
}

export const MONSTER_ABILITY_OPTIONS = Object.entries(MONSTER_ABILITY_META).map(([id, meta]) => ({
  id,
  name: meta.name,
  description: meta.description,
}))

export function describeMonsterAbility(abilityId: string) {
  return MONSTER_ABILITY_META[abilityId] ?? {
    name: abilityId,
    description: '未知技能。',
  }
}

export function monsterAbilityEntries(monster: BattleMonster | undefined) {
  if (!monster?.abilities?.length) return []
  return monster.abilities.map((id) => ({ id, ...describeMonsterAbility(id) }))
}

export function formatMonsterSpeed(speedCellsPerSecond: number) {
  return Math.round(speedCellsPerSecond * 128)
}

export function formatMonsterHp(value: number) {
  return Math.round(value * 10) / 10
}

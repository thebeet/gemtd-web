import { computed, ref, watch } from 'vue'
import { tryOnScopeDispose } from '@vueuse/core'
import type * as Y from 'yjs'
import { experienceThresholds } from '../game/constants'
import { towerData } from '../game/towers'
import {
  computeBattleCombineOptions,
  computeFutureRecipePreviews,
  computeKeepOptions,
  computeReceivedAuraEffects,
  computeEffectiveAttackIntervalSeconds,
  computeEffectiveRange,
  effectiveTowerDamageRange,
  formatAttackIntervalSeconds,
  getTowerAbilities,
  getTowerStats,
  parseTower,
} from '../game/towers'
import type { BattleCombineOption, BattleSnapshot, KeepOption, PlayerBuildState, RecipePreview } from '../game/types'
import type { Ref } from 'vue'

export function useTowerSelection(options: {
  towers: Y.Map<string>
  buildState: Ref<PlayerBuildState>
  battleState: Ref<BattleSnapshot>
  playerId: Ref<string>
}) {
  const selectedTowerKey = ref<string>()
  const hoveredAuraAbilityId = ref<string>()
  const towersRevision = ref(0)
  const onTowersChange = () => { towersRevision.value++ }
  options.towers.observe(onTowersChange)
  tryOnScopeDispose(() => options.towers.unobserve(onTowersChange))

  const selectedTowerRecord = computed(() => {
    void towersRevision.value
    return selectedTowerKey.value ? parseTower(options.towers.get(selectedTowerKey.value)) : undefined
  })
  const selectedTowerStats = computed(() => getTowerStats(selectedTowerRecord.value))
  const selectedEffectiveDamage = computed(() => {
    const stats = selectedTowerStats.value
    return stats ? effectiveTowerDamageRange(stats) : undefined
  })
  const selectedEffectiveAttackInterval = computed(() => {
    void towersRevision.value
    return computeEffectiveAttackIntervalSeconds(options.towers, selectedTowerKey.value)
  })
  const selectedEffectiveRange = computed(() => {
    void towersRevision.value
    return computeEffectiveRange(options.towers, selectedTowerKey.value)
  })
  const selectedTowerAbilities = computed(() => getTowerAbilities(selectedTowerRecord.value))
  const selectedTowerAuraEffects = computed(() => {
    void towersRevision.value
    return computeReceivedAuraEffects(options.towers, selectedTowerKey.value)
  })
  const selectedTowerAuraBuffs = computed(() => selectedTowerAuraEffects.value.filter((effect) => effect.kind === 'buff'))
  const selectedTowerAuraDebuffs = computed(() => selectedTowerAuraEffects.value.filter((effect) => effect.kind === 'debuff'))

  const keepOptions = computed<KeepOption[]>(() =>
    computeKeepOptions(options.buildState.value, options.towers, options.playerId.value),
  )
  const selectedKeepOptions = computed(() =>
    selectedTowerKey.value ? keepOptions.value.filter((option) => option.targetKey === selectedTowerKey.value) : [],
  )
  const battleCombineOptions = computed<BattleCombineOption[]>(() =>
    computeBattleCombineOptions(options.buildState.value, options.towers, selectedTowerKey.value),
  )
  const selectedFutureRecipes = computed<RecipePreview[]>(() => {
    void towersRevision.value
    return computeFutureRecipePreviews(options.towers, selectedTowerKey.value)
  })

  watch(selectedTowerKey, (key) => {
    hoveredAuraAbilityId.value = undefined
    if (key && !options.towers.has(key)) selectedTowerKey.value = undefined
  })

  function clearSelection() {
    hoveredAuraAbilityId.value = undefined
    selectedTowerKey.value = undefined
  }

  function selectTower(key: string) {
    selectedTowerKey.value = key
  }

  function hoverAuraAbility(abilityId: string) {
    hoveredAuraAbilityId.value = abilityId
  }

  function clearAuraHover() {
    hoveredAuraAbilityId.value = undefined
  }

  return {
    selectedTowerKey,
    hoveredAuraAbilityId,
    selectedTowerRecord,
    selectedTowerStats,
    selectedEffectiveDamage,
    selectedEffectiveAttackInterval,
    selectedEffectiveRange,
    selectedTowerAbilities,
    selectedTowerAuraEffects,
    selectedTowerAuraBuffs,
    selectedTowerAuraDebuffs,
    keepOptions,
    selectedKeepOptions,
    battleCombineOptions,
    selectedFutureRecipes,
    clearSelection,
    selectTower,
    hoverAuraAbility,
    clearAuraHover,
  }
}

export function useGameProgress(battleState: Ref<BattleSnapshot>, buildState: Ref<PlayerBuildState>) {
  const qualityProbabilities = computed(() =>
    towerData.playerLevelProbabilities[String(battleState.value.heroLevel) as keyof typeof towerData.playerLevelProbabilities],
  )

  const experienceProgress = computed(() => {
    const level = battleState.value.heroLevel
    if (level >= 5) return 1
    return Math.max(0, Math.min(1,
      (battleState.value.experience - experienceThresholds[level - 1])
      / (experienceThresholds[level] - experienceThresholds[level - 1]),
    ))
  })

  const phaseLabel = computed(() =>
    buildState.value.phase === 'placing'
      ? `放置随机塔 ${buildState.value.pendingKeys.length}/5`
      : buildState.value.phase === 'choosing'
        ? '选择保留结果'
        : `准备第 ${buildState.value.wave} 波`,
  )

  return { qualityProbabilities, experienceProgress, phaseLabel }
}

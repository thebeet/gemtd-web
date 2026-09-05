import type * as Y from 'yjs'
import { applyTianranZumulvAbsorb, createBaseTower, formatAbsorbedAbilityNames, parseTower, recipeData, rollTower, towerDisplayName } from '../game/towers'
import type { BaseTowerId, BattleCombineOption, BattleSnapshot, KeepOption, PlayerBuildState, Tower } from '../game/types'
import type { Ref } from 'vue'

export function useGameBuildActions(options: {
  doc: Y.Doc
  towers: Y.Map<string>
  buildState: Ref<PlayerBuildState>
  battleState: Ref<BattleSnapshot>
  playerId: Ref<string>
  connected: Ref<boolean>
  battleConnected: Ref<boolean>
  saveBuildState: (next: PlayerBuildState) => void
  showMessage: (text: string) => void
  selectTower: (key: string) => void
  clearRemoving: () => void
  clearSwapping?: () => void
  clearSelection: () => void
  selectedTowerKey: Ref<string | undefined>
  registerCombine?: (resultKey: string, ingredientKeys: string[], result: Tower) => void
}) {
  function beginBuildRound() {
    const { buildState, battleState, connected, battleConnected } = options
    if (!connected.value || !battleConnected.value || buildState.value.phase !== 'idle'
      || battleState.value.phase === 'combat' || buildState.value.wave > battleState.value.wave) return
    options.clearRemoving()
    options.clearSwapping?.()
    options.clearSelection()
    options.saveBuildState({ ...buildState.value, phase: 'placing', pendingKeys: [] })
  }

  function chooseKeepOption(option: KeepOption) {
    if (options.buildState.value.phase !== 'choosing' || options.battleState.value.phase === 'combat') return
    const pendingKeys = [...options.buildState.value.pendingKeys]
    const keptResult = applyTianranZumulvAbsorb(options.towers, option.targetKey, option.result)
    options.doc.transact(() => {
      for (const pendingKey of options.buildState.value.pendingKeys) {
        if (!options.towers.has(pendingKey)) continue
        options.towers.set(
          pendingKey,
          JSON.stringify(pendingKey === option.targetKey ? keptResult : { type: 'rock', name: '岩石' } satisfies Tower),
        )
      }
      options.saveBuildState({
        ...options.buildState.value,
        wave: options.buildState.value.wave + 1,
        phase: 'idle',
        pendingKeys: [],
      })
    })
    if ((option.id.startsWith('upgrade:') || option.id.startsWith('recipe:')) && options.registerCombine) {
      options.registerCombine(option.targetKey, pendingKeys, keptResult)
    }
    options.selectTower(option.targetKey)
    const absorbed = formatAbsorbedAbilityNames(keptResult.abilities)
    options.showMessage(absorbed
      ? `已保留：${option.label}（汲取 ${absorbed}）；其余塔已变为岩石`
      : `已保留：${option.label}；其余塔已变为岩石`)
  }

  function combineBattleOption(option: BattleCombineOption) {
    if (options.buildState.value.phase !== 'idle'
      || options.battleState.value.phase === 'combat'
      || options.selectedTowerKey.value !== option.targetKey) return
    const ingredientsStillExist = option.ingredientKeys.every((ingredientKey, index) => {
      const tower = parseTower(options.towers.get(ingredientKey))
      return tower && !tower.temporary && tower.type !== 'rock' && tower.unitId === option.ingredientUnitIds[index]
    })
    if (!ingredientsStillExist) {
      options.showMessage('合成失败：所需材料已经变更')
      return
    }
    const result = applyTianranZumulvAbsorb(options.towers, option.targetKey, option.result)
    options.doc.transact(() => {
      const rock = JSON.stringify({ type: 'rock', name: '岩石' } satisfies Tower)
      option.ingredientKeys.forEach((ingredientKey) => {
        if (ingredientKey === option.targetKey) return
        options.towers.set(ingredientKey, rock)
      })
      options.towers.set(option.targetKey, JSON.stringify(result))
    })
    options.registerCombine?.(option.targetKey, option.ingredientKeys, result)
    options.selectTower(option.targetKey)
    const absorbed = formatAbsorbedAbilityNames(result.abilities)
    options.showMessage(absorbed
      ? `已合成：${option.result.name}（汲取 ${absorbed}）；材料格已变为岩石`
      : `已合成：${option.result.name}；材料格已变为岩石`)
  }

  function placeRandomTower(cellKey: string) {
    const tower = rollTower(options.battleState.value.heroLevel, options.playerId.value)
    const pendingKeys = [...options.buildState.value.pendingKeys, cellKey]
    options.doc.transact(() => {
      options.towers.set(cellKey, JSON.stringify(tower))
      options.saveBuildState({
        ...options.buildState.value,
        phase: pendingKeys.length === 5 ? 'choosing' : 'placing',
        pendingKeys,
      })
    })
    options.showMessage(`随机获得：${tower.name}`)
  }

  function placeRock(cellKey: string) {
    if (options.battleState.value.phase === 'combat') {
      options.showMessage('战斗进行中，不能放置岩石')
      return
    }
    if (options.towers.has(cellKey)) return
    options.doc.transact(() => {
      options.towers.set(cellKey, JSON.stringify({ type: 'rock', name: '岩石' } satisfies Tower))
    })
    options.showMessage('已放置岩石')
  }

  /** Cheat: place rocks on every empty layout cell in one transaction. */
  function placeLayoutRocks(cellKeys: readonly string[]) {
    if (options.battleState.value.phase === 'combat') {
      options.showMessage('战斗进行中，不能放置岩石')
      return 0
    }
    const rock = JSON.stringify({ type: 'rock', name: '岩石' } satisfies Tower)
    let placed = 0
    options.doc.transact(() => {
      for (const cellKey of cellKeys) {
        if (options.towers.has(cellKey)) continue
        options.towers.set(cellKey, rock)
        placed += 1
      }
    })
    if (placed === 0) options.showMessage('布局格子均已占用，未放置新岩石')
    else options.showMessage(`已按布局放置 ${placed} 块岩石`)
    return placed
  }

  function morphRockToBaseTower(cellKey: string, type: BaseTowerId, quality: number) {
    if (options.battleState.value.phase === 'combat') {
      options.showMessage('战斗进行中，不能变形岩石')
      return
    }
    const current = parseTower(options.towers.get(cellKey))
    if (!current || current.type !== 'rock') {
      options.showMessage('只能将岩石变为基础塔')
      return
    }
    const tower = createBaseTower(type, quality, false, options.playerId.value)
    options.doc.transact(() => {
      options.towers.set(cellKey, JSON.stringify(tower))
    })
    options.selectTower(cellKey)
    options.showMessage(`已变为：${towerDisplayName(tower)}`)
  }

  function morphTowerToRecipe(cellKey: string, recipeId: string) {
    if (options.battleState.value.phase === 'combat') {
      options.showMessage('战斗进行中，不能作弊合成')
      return
    }
    const current = parseTower(options.towers.get(cellKey))
    if (!current || current.type === 'rock' || current.temporary) {
      options.showMessage('只能将已保留的塔变成合成塔')
      return
    }
    const recipe = recipeData.get(recipeId)
    if (!recipe) {
      options.showMessage('找不到该合成配方')
      return
    }
    const result = applyTianranZumulvAbsorb(options.towers, cellKey, {
      type: recipe.id,
      unitId: recipe.id,
      name: recipe.name,
      temporary: false,
    })
    options.doc.transact(() => {
      options.towers.set(cellKey, JSON.stringify(result))
    })
    options.registerCombine?.(cellKey, [cellKey], result)
    options.selectTower(cellKey)
    const absorbed = formatAbsorbedAbilityNames(result.abilities)
    options.showMessage(absorbed
      ? `已作弊合成为：${recipe.name}（汲取 ${absorbed}）`
      : `已作弊合成为：${recipe.name}`)
  }

  function swapTowerCells(keyA: string, keyB: string) {
    if (options.buildState.value.phase !== 'idle' || options.battleState.value.phase === 'combat') return
    const towerA = parseTower(options.towers.get(keyA))
    const towerB = parseTower(options.towers.get(keyB))
    if (!towerA || !towerB) {
      options.showMessage('只能交换已有塔或岩石的位置')
      return
    }
    if (towerA.temporary || towerB.temporary) {
      options.showMessage('候选塔不能交换')
      return
    }
    options.doc.transact(() => {
      options.towers.set(keyA, JSON.stringify(towerB))
      options.towers.set(keyB, JSON.stringify(towerA))
    })
    options.showMessage(`已交换 ${keyA} 与 ${keyB}`)
    options.selectTower(keyA)
  }

  return {
    beginBuildRound,
    chooseKeepOption,
    combineBattleOption,
    placeRandomTower,
    placeRock,
    placeLayoutRocks,
    morphRockToBaseTower,
    morphTowerToRecipe,
    swapTowerCells,
  }
}

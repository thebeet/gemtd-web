import { computed, ref, watch, type Ref } from 'vue'
import type * as Y from 'yjs'
import { createSaveId, deleteGameSave, listGameSaves, putGameSave } from '../game/saveDb'
import { listCombatLayout, parseTower } from '../game/towers'
import type { GameSave, SaveStateMessage } from '../game/saveTypes'
import type { BattleSnapshot, PlayerBuildState, Tower } from '../game/types'

export function useGameSaves(options: {
  room: Ref<string>
  playerId: Ref<string>
  doc: Y.Doc
  towers: Y.Map<string>
  playerStates: Y.Map<string>
  buildState: Ref<PlayerBuildState>
  battleState: Ref<BattleSnapshot>
  battleConnected: Ref<boolean>
  visible: Ref<boolean>
  showMessage: (text: string) => void
  clearSelection: () => void
  requestSaveState: () => void
  restoreSave: (payload: {
    battle: GameSave['battle']
    server: GameSave['server']
    towers: Array<Tower & { key: string }>
  }) => void
  onSaveState: (handler: (message: SaveStateMessage) => void) => () => void
}) {
  const saves = ref<GameSave[]>([])
  const saving = ref(false)
  const loadingId = ref<string>()
  let pendingCompletedWave: number | undefined
  let previousPhase = options.battleState.value.phase
  let previousWave = options.battleState.value.wave

  async function refreshSaves() {
    saves.value = await listGameSaves(options.room.value)
  }

  function collectTowerMap() {
    const map: Record<string, string> = {}
    options.towers.forEach((raw, key) => {
      const tower = parseTower(raw)
      if (!tower || tower.temporary) return
      map[key] = JSON.stringify(tower)
    })
    return map
  }

  function collectPlayerStates() {
    const map: Record<string, string> = {}
    options.playerStates.forEach((raw, key) => { map[key] = raw })
    return map
  }

  options.onSaveState(async (message) => {
    const completedWave = pendingCompletedWave
    pendingCompletedWave = undefined
    if (!completedWave) return
    try {
      const save: GameSave = {
        id: createSaveId(options.room.value, completedWave),
        savedAt: Date.now(),
        label: `第 ${completedWave} 波结束后`,
        room: options.room.value,
        playerId: options.playerId.value,
        completedWave,
        towers: collectTowerMap(),
        playerStates: collectPlayerStates(),
        buildState: {
          wave: message.battle.wave,
          playerLevel: message.battle.heroLevel,
          phase: 'idle',
          pendingKeys: [],
        },
        battle: message.battle,
        server: message.server,
      }
      await putGameSave(save)
      await refreshSaves()
      options.showMessage(`已保存第 ${completedWave} 波结束后的局面`)
    } catch {
      options.showMessage('存档保存失败')
    } finally {
      saving.value = false
    }
  })

  watch(() => options.battleState.value, (snapshot) => {
    const phaseChanged = previousPhase === 'combat' && snapshot.phase === 'build'
    const waveAdvanced = snapshot.wave > previousWave
    if (phaseChanged && waveAdvanced && options.battleConnected.value) {
      pendingCompletedWave = previousWave
      saving.value = true
      options.requestSaveState()
    }
    previousPhase = snapshot.phase
    previousWave = snapshot.wave
  })

  watch([options.visible, options.room], ([visible]) => {
    if (visible) void refreshSaves()
  })

  async function loadSave(id: string) {
    if (!options.battleConnected.value) {
      options.showMessage('战斗服未连接，无法加载存档')
      return
    }
    if (options.battleState.value.phase === 'combat') {
      options.showMessage('战斗中无法加载存档')
      return
    }
    const save = saves.value.find((entry) => entry.id === id)
    if (!save) {
      options.showMessage('找不到该存档')
      return
    }
    loadingId.value = id
    try {
      options.clearSelection()
      options.doc.transact(() => {
        options.towers.clear()
        for (const [key, raw] of Object.entries(save.towers)) {
          options.towers.set(key, raw)
        }
        options.playerStates.clear()
        for (const [key, raw] of Object.entries(save.playerStates)) {
          options.playerStates.set(key, raw)
        }
        if (!options.playerStates.has(options.playerId.value)) {
          options.playerStates.set(options.playerId.value, JSON.stringify(save.buildState))
        }
      })
      options.restoreSave({
        battle: save.battle,
        server: save.server,
        towers: listCombatLayout(options.towers),
      })
    } catch {
      options.showMessage('存档加载失败')
    } finally {
      loadingId.value = undefined
    }
  }

  async function removeSave(id: string) {
    await deleteGameSave(id)
    await refreshSaves()
  }

  function formatSaveTime(at: number) {
    return new Date(at).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  const hasSaves = computed(() => saves.value.length > 0)

  return {
    saves,
    hasSaves,
    saving,
    loadingId,
    refreshSaves,
    loadSave,
    removeSave,
    formatSaveTime,
  }
}

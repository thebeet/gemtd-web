import { computed, ref, watch, type Ref } from 'vue'
import { towerDisplayName } from '../game/towers'
import type { BattleSnapshot, LeaderboardEntry, LeaderboardMessage } from '../game/types'

export function useDamageLeaderboard(options: {
  visible: Ref<boolean>
  battleConnected: Ref<boolean>
  battleState: Ref<BattleSnapshot>
  sendGameMessage: (message: unknown) => void
  onLeaderboard: (handler: (message: LeaderboardMessage) => void) => () => void
}) {
  const waveFilter = ref<number | 'all'>('all')
  const availableWaves = ref<number[]>([])
  const entries = ref<LeaderboardEntry[]>([])

  function requestLeaderboard() {
    if (!options.battleConnected.value) return
    options.sendGameMessage({ type: 'getLeaderboard', wave: waveFilter.value })
  }

  options.onLeaderboard((message) => {
    availableWaves.value = message.availableWaves
    if (waveFilter.value !== 'all' && !message.availableWaves.includes(waveFilter.value)) {
      waveFilter.value = 'all'
    }
    entries.value = message.entries
  })

  watch([options.visible, waveFilter, options.battleConnected], ([visible, , connected]) => {
    if (visible && connected) requestLeaderboard()
  })

  watch(() => [options.battleState.value.phase, options.battleState.value.wave] as const, () => {
    if (options.visible.value && options.battleConnected.value) requestLeaderboard()
  })

  function entryLabel(entry: LeaderboardEntry) {
    return `${towerDisplayName(entry)} · ${entry.key}`
  }

  const hasEntries = computed(() => entries.value.length > 0)

  return {
    waveFilter,
    availableWaves,
    entries,
    hasEntries,
    requestLeaderboard,
    entryLabel,
  }
}

import { computed } from 'vue'
import { useLocalStorage, useUrlSearchParams } from '@vueuse/core'

export function useGameRoom() {
  const params = useUrlSearchParams('history')
  const room = computed(() => String(params.room ?? 'defense'))
  const playerId = useLocalStorage(
    'gemtd-player-id',
    globalThis.crypto?.randomUUID?.() ?? `player-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )

  return { room, playerId }
}

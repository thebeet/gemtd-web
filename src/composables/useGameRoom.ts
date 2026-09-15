import { computed } from 'vue'
import { useLocalStorage, useUrlSearchParams } from '@vueuse/core'

export function useGameRoom() {
  const params = useUrlSearchParams('history')
  // A room link explicitly opts into the hosted multiplayer session.  Opening
  // /game without one is a complete offline, browser-only game.
  const online = computed(() => typeof params.room === 'string' && params.room.length > 0)
  const room = computed(() => online.value ? String(params.room) : 'local')
  const playerId = useLocalStorage(
    'gemtd-player-id',
    globalThis.crypto?.randomUUID?.() ?? `player-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )

  return { room, playerId, online }
}

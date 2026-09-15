import { computed, ref, watch } from 'vue'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { createInitialBuildState, randomPlayerColor, randomPlayerName } from '../game/constants'
import { applyInitialEdgeRocks, parsePlayerBuildState } from '../game/towers'
import { websocketHost, websocketProtocol } from '../game/wsHost'
import type { PlayerBuildState, User } from '../game/types'
import type { Ref } from 'vue'

export function useGameCollab(room: Ref<string>, playerId: Ref<string>, online: Ref<boolean>) {
  const connected = ref(!online.value)
  const user = ref<User>({ name: randomPlayerName(), color: randomPlayerColor() })
  const buildState = ref<PlayerBuildState>(createInitialBuildState())

  const doc = new Y.Doc()
  const towers = doc.getMap<string>('square-towers-v1')
  const playerStates = doc.getMap<string>('player-build-states-v1')
  const metadata = doc.getMap<boolean>('game-metadata-v1')
  const provider = online.value
    ? new WebsocketProvider(import.meta.env.VITE_YJS_URL || `${websocketProtocol()}://${websocketHost()}`, room.value, doc)
    : undefined

  provider?.awareness.setLocalStateField('user', user.value)
  provider?.on('status', ({ status }: { status: string }) => { connected.value = status === 'connected' })

  watch(user, (next) => provider?.awareness.setLocalStateField('user', next), { deep: true })

  const collaborators = computed(() => {
    const list: User[] = []
    if (!provider) return [user.value]
    provider.awareness.getStates().forEach((state) => {
      if (state.user) list.push(state.user as User)
    })
    return list
  })

  function syncPlayerState(raw: string) {
    const parsed = parsePlayerBuildState(raw)
    if (parsed) buildState.value = parsed
  }

  function saveBuildState(next: PlayerBuildState) {
    buildState.value = next
    playerStates.set(playerId.value, JSON.stringify(next))
  }

  const initialize = () => {
    doc.transact(() => {
      if (!metadata.get('edgeRocksInitialized')) {
        metadata.set('edgeRocksInitialized', true)
        applyInitialEdgeRocks(towers)
      }
    })

    const saved = playerStates.get(playerId.value)
    if (saved) syncPlayerState(saved)
    else saveBuildState(buildState.value)
  }
  if (provider) provider.once('sync', (isSynced: boolean) => { if (isSynced) initialize() })
  else initialize()

  playerStates.observe(() => {
    const saved = playerStates.get(playerId.value)
    if (saved) syncPlayerState(saved)
  })

  function destroy() {
    provider?.destroy()
    doc.destroy()
  }

  return {
    connected,
    user,
    buildState,
    doc,
    towers,
    playerStates,
    provider,
    collaborators,
    saveBuildState,
    syncPlayerState,
    destroy,
  }
}

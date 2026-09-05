import { computed, ref } from 'vue'
import { useWebSocket } from '@vueuse/core'
import type * as Y from 'yjs'
import { createInitialBattleSnapshot } from '../game/constants'
import { applyInitialEdgeRocks, listCombatLayout, parseTower } from '../game/towers'
import { websocketHost, websocketProtocol } from '../game/wsHost'
import type { GameSaveBattle, GameSaveServer, SaveStateMessage } from '../game/saveTypes'
import type { BattleSnapshot, CombatEventsMessage, LeaderboardMessage, PlayerBuildState, Tower } from '../game/types'
import type { Ref } from 'vue'

type BattleMessage =
  | BattleSnapshot
  | LeaderboardMessage
  | CombatEventsMessage
  | SaveStateMessage
  | { type: 'error'; message: string }

export function useGameBattle(options: {
  room: Ref<string>
  playerId: Ref<string>
  doc: Y.Doc
  towers: Y.Map<string>
  playerStates: Y.Map<string>
  showMessage: (text: string) => void
  onReset: () => void
  onSnapshot: (snapshot: BattleSnapshot) => void
  onLeaderboard?: (message: LeaderboardMessage) => void
  onCombatEvents?: (message: CombatEventsMessage) => void
  onSaveState?: (message: SaveStateMessage) => void
}) {
  const { room, doc, towers, playerStates, showMessage } = options

  const battleState = ref<BattleSnapshot>(createInitialBattleSnapshot())
  const serverClockOffset = ref(0)
  const appliedResetVersion = ref(0)

  const gameUrl = computed(() => {
    const base = import.meta.env.VITE_GAME_URL || `${websocketProtocol()}://${websocketHost()}/game-sync`
    return `${base}?room=${encodeURIComponent(room.value)}`
  })

  function sendGameMessage(message: unknown) {
    send(JSON.stringify(message))
  }

  function registerCombine(resultKey: string, ingredientKeys: string[], result: Tower) {
    sendGameMessage({
      type: 'registerCombine',
      resultKey,
      ingredientKeys,
      result: { type: result.type, quality: result.quality, unitId: result.unitId, name: result.name },
    })
  }

  const leaderboardHandlers = new Set<(message: LeaderboardMessage) => void>()
  if (options.onLeaderboard) leaderboardHandlers.add(options.onLeaderboard)

  const combatEventHandlers = new Set<(message: CombatEventsMessage) => void>()
  if (options.onCombatEvents) combatEventHandlers.add(options.onCombatEvents)

  const saveStateHandlers = new Set<(message: SaveStateMessage) => void>()
  if (options.onSaveState) saveStateHandlers.add(options.onSaveState)

  function onLeaderboard(handler: (message: LeaderboardMessage) => void) {
    leaderboardHandlers.add(handler)
    return () => leaderboardHandlers.delete(handler)
  }

  function onCombatEvents(handler: (message: CombatEventsMessage) => void) {
    combatEventHandlers.add(handler)
    return () => combatEventHandlers.delete(handler)
  }

  function onSaveState(handler: (message: SaveStateMessage) => void) {
    saveStateHandlers.add(handler)
    return () => saveStateHandlers.delete(handler)
  }

  function syncCombatLayout() {
    sendGameMessage({ type: 'syncLayout', towers: listCombatLayout(towers) })
  }

  function requestSaveState() {
    sendGameMessage({ type: 'getSaveState' })
  }

  function restoreSave(payload: {
    battle: GameSaveBattle
    server: GameSaveServer
    towers: Array<Tower & { key: string }>
  }) {
    sendGameMessage({
      type: 'restoreSave',
      battle: payload.battle,
      server: payload.server,
      towers: payload.towers,
    })
  }

  function applyServerReset(message: BattleSnapshot) {
    if (!message.resetVersion || message.resetVersion <= appliedResetVersion.value) return
    appliedResetVersion.value = message.resetVersion
    if (message.resetKind === 'none') return
    doc.transact(() => {
      if (message.resetKind === 'game') {
        towers.clear()
        applyInitialEdgeRocks(towers)
      }
      towers.forEach((raw, towerKey) => {
        if (parseTower(raw)?.temporary) towers.delete(towerKey)
      })
      playerStates.clear()
      playerStates.set(options.playerId.value, JSON.stringify({
        wave: message.wave,
        playerLevel: message.heroLevel,
        phase: 'idle',
        pendingKeys: [],
      } satisfies PlayerBuildState))
    })
    options.onReset()
    if (message.resetKind === 'game') showMessage('游戏已重启：第 1 波建造阶段')
    else if (message.resetKind === 'load') showMessage(`已加载存档：第 ${message.wave} 波建造阶段`)
    else showMessage(`已重开第 ${message.wave} 波：返回建造阶段`)
  }

  const { status, send } = useWebSocket(gameUrl, {
    autoReconnect: { retries: -1, delay: 1200 },
    onConnected: () => syncCombatLayout(),
    onMessage(_ws, event) {
      try {
        const message = JSON.parse(String(event.data)) as BattleMessage
        if (message.type === 'error') {
          showMessage(message.message)
          return
        }
        if (message.type === 'leaderboard') {
          leaderboardHandlers.forEach((handler) => handler(message))
          return
        }
        if (message.type === 'combatEvents') {
          combatEventHandlers.forEach((handler) => handler(message))
          return
        }
        if (message.type === 'saveState') {
          saveStateHandlers.forEach((handler) => handler(message))
          return
        }
        serverClockOffset.value = message.serverTime - Date.now()
        battleState.value = message
        applyServerReset(message)
        options.onSnapshot(message)
      } catch { /* ignore malformed battle messages */ }
    },
  })

  const battleConnected = computed(() => status.value === 'OPEN')

  function startCombat() {
    if (!battleConnected.value || battleState.value.phase !== 'build') return
    sendGameMessage({ type: 'startWave', towers: listCombatLayout(towers) })
  }

  function spawnTestMonster(monster: {
    name?: string
    hp?: number
    armor?: number
    magicResistancePercent?: number
    moveSpeed?: number
    flying?: boolean
    boss?: boolean
    abilities?: string[]
  }) {
    if (!battleConnected.value) return
    sendGameMessage({
      type: 'spawnTestMonster',
      towers: listCombatLayout(towers),
      monster,
    })
  }

  function resetCurrentWave() {
    sendGameMessage({ type: 'resetWave' })
  }

  function restartGame() {
    sendGameMessage({ type: 'resetGame' })
  }

  return {
    battleState,
    battleConnected,
    serverClockOffset,
    syncCombatLayout,
    sendGameMessage,
    registerCombine,
    onLeaderboard,
    onCombatEvents,
    onSaveState,
    requestSaveState,
    restoreSave,
    startCombat,
    spawnTestMonster,
    resetCurrentWave,
    restartGame,
  }
}

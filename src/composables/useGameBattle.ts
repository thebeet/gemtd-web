import { computed, onScopeDispose, ref } from 'vue'
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
  online: Ref<boolean>
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

  let sendRaw = (_message: string) => {}

  function sendGameMessage(message: unknown) { sendRaw(JSON.stringify(message)) }

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

  function applyMvpAward(award: NonNullable<BattleSnapshot['mvpAward']>) {
    const current = parseTower(towers.get(award.key))
    if (!current || current.type === 'rock') return
    const nextStacks = Math.max(current.mvpStacks || 0, award.mvpStacks)
    if (current.mvpStacks === nextStacks) {
      showMessage(`MVP：${award.name || current.name || award.key}（${nextStacks} 层）`)
      return
    }
    doc.transact(() => {
      towers.set(award.key, JSON.stringify({ ...current, mvpStacks: nextStacks } satisfies Tower))
    })
    const auraNote = nextStacks >= 10 ? ' · 已转化为伤害光环' : ''
    showMessage(`MVP：${award.name || current.name || award.key} 获得第 ${nextStacks} 层（伤害 +${nextStacks * 10}%）${auraNote}`)
  }

  const connectionStatus = ref<'OPEN' | 'CLOSED'>('CLOSED')

  function handleBattleMessage(raw: unknown) {
    try {
      const message = (typeof raw === 'string' ? JSON.parse(raw) : raw) as BattleMessage
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
      if (message.mvpAward) applyMvpAward(message.mvpAward)
      options.onSnapshot(message)
    } catch { /* Ignore malformed messages from a remote server or Worker. */ }
  }

  if (options.online.value) {
    const { send } = useWebSocket(gameUrl, {
      autoReconnect: { retries: -1, delay: 1200 },
      onConnected: () => {
        connectionStatus.value = 'OPEN'
        syncCombatLayout()
      },
      onDisconnected: () => { connectionStatus.value = 'CLOSED' },
      onMessage(_ws, event) { handleBattleMessage(String(event.data)) },
    })
    sendRaw = send
  } else {
    const worker = new Worker(new URL('../game/localCombatWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ type: 'message'; value: BattleMessage }>) => handleBattleMessage(event.data.value)
    worker.onerror = () => {
      connectionStatus.value = 'CLOSED'
      showMessage('本地战斗引擎启动失败')
    }
    sendRaw = (message) => worker.postMessage(JSON.parse(message))
    connectionStatus.value = 'OPEN'
    onScopeDispose(() => worker.terminate())
  }

  const battleConnected = computed(() => connectionStatus.value === 'OPEN')

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
    count?: number
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

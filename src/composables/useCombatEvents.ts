import { computed, ref, watch, type Ref } from 'vue'
import { towerDisplayName } from '../game/towers'
import type { BattleSnapshot, CombatEvent, CombatEventsMessage } from '../game/types'

const MAX_EVENTS = 800

function mergeCombatEvents(existing: CombatEvent[], incoming: CombatEvent[]) {
  if (!incoming.length) return existing
  const byId = new Map(existing.map((event) => [event.id, event]))
  for (const event of incoming) byId.set(event.id, event)
  return [...byId.values()]
    .sort((left, right) => right.at - left.at || right.id - left.id)
    .slice(0, MAX_EVENTS)
}

export function formatCombatEventTime(at: number) {
  const date = new Date(at)
  const time = date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const ms = String(date.getMilliseconds()).padStart(3, '0').slice(0, 1)
  return `${time}.${ms}`
}

export function formatCombatEventSummary(event: CombatEvent) {
  const towerLabel = `${towerDisplayName({
    type: event.towerType,
    quality: event.towerQuality,
    name: event.towerName,
  })} · ${event.towerKey}`
  const debuffText = event.debuffs
    .map((debuff) => {
      if (debuff.kind === 'slow') return `减速 ${debuff.level} 级`
      if (debuff.kind === 'armorBreak') return `护甲 -${debuff.level}`
      if (debuff.kind === 'stun') return debuff.level >= 2 ? '石化' : '眩晕'
      return `中毒 ${debuff.level} 级`
    })
    .join(' · ')
  const damageLabel = event.damageType === 'magical' ? `${event.damage} 魔法伤害` : `${event.damage} 伤害`
  const parts = [`${towerLabel} → ${event.monsterName}`, damageLabel]
  if (debuffText) parts.push(debuffText)
  if (event.killed) parts.push('击杀')
  if (event.killed && event.gold) parts.push(event.greedProc ? `贪婪 ×10 · +${event.gold} 金` : `+${event.gold} 金`)
  return parts.join(' · ')
}

export function useCombatEvents(options: {
  visible: Ref<boolean>
  battleConnected: Ref<boolean>
  battleState: Ref<BattleSnapshot>
  sendGameMessage: (message: unknown) => void
  onCombatEvents: (handler: (message: CombatEventsMessage) => void) => () => void
}) {
  const events = ref<CombatEvent[]>([])
  const appliedResetVersion = ref(0)

  function ingestEvents(incoming: CombatEvent[]) {
    events.value = mergeCombatEvents(events.value, incoming)
  }

  function requestCombatEvents() {
    if (!options.battleConnected.value) return
    options.sendGameMessage({ type: 'getCombatEvents' })
  }

  options.onCombatEvents((message) => {
    ingestEvents(message.events)
  })

  watch(() => options.battleState.value, (snapshot) => {
    if (snapshot.resetVersion > appliedResetVersion.value) {
      appliedResetVersion.value = snapshot.resetVersion
      events.value = []
    }
    if (snapshot.newCombatEvents?.length) ingestEvents(snapshot.newCombatEvents)
  })

  watch([options.visible, options.battleConnected], ([visible, connected]) => {
    if (visible && connected) requestCombatEvents()
  })

  const hasEvents = computed(() => events.value.length > 0)

  return {
    events,
    hasEvents,
    requestCombatEvents,
    formatCombatEventTime,
    formatCombatEventSummary,
  }
}

<script setup lang="ts">
import type { CombatEvent } from '../game/types'
import { formatCombatEventTime, formatCombatEventSummary } from '../composables/useCombatEvents'

defineProps<{
  combatEvents: CombatEvent[]
  hasCombatEvents: boolean
}>()
const visible = defineModel<boolean>('visible', { required: true })
</script>

<template>
  <aside v-if="visible" class="battle-events-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
    <button class="detail-close" aria-label="关闭战斗事件" @click="visible = false">×</button>
    <div class="leaderboard-heading">
      <b>战斗事件</b>
      <small>按时间倒序 · 伤害与减益</small>
    </div>
    <ol v-if="hasCombatEvents" class="battle-events-list">
      <li v-for="event in combatEvents" :key="event.id">
        <span class="battle-event-time">{{ formatCombatEventTime(event.at) }}</span>
        <span class="battle-event-wave">W{{ event.wave }}</span>
        <span class="battle-event-summary" :class="{ kill: event.killed }">{{ formatCombatEventSummary(event) }}</span>
      </li>
    </ol>
    <p v-else class="detail-hint">暂无战斗事件</p>
  </aside>
</template>

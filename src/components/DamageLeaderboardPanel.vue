<script setup lang="ts">
import type { LeaderboardEntry } from '../game/types'

defineProps<{
  leaderboardWaves: number[]
  leaderboardEntries: LeaderboardEntry[]
  hasLeaderboardEntries: boolean
  leaderboardEntryLabel: (entry: LeaderboardEntry) => string
}>()
const visible = defineModel<boolean>('visible', { required: true })
const leaderboardWave = defineModel<number | 'all'>('wave', { required: true })
</script>

<template>
  <aside v-if="visible" class="damage-leaderboard-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
    <button class="detail-close" aria-label="关闭伤害榜" @click="visible = false">×</button>
    <div class="leaderboard-heading">
      <b>伤害排行榜</b>
      <small>合成塔的统计会合并到结果塔</small>
    </div>
    <label class="leaderboard-filter">
      <span>波次</span>
      <select v-model="leaderboardWave">
        <option value="all">全部波次</option>
        <option v-for="wave in leaderboardWaves" :key="wave" :value="wave">第 {{ wave }} 波</option>
      </select>
    </label>
    <ol v-if="hasLeaderboardEntries" class="leaderboard-list">
      <li v-for="(entry, index) in leaderboardEntries" :key="entry.key">
        <span class="leaderboard-rank">{{ index + 1 }}</span>
        <span class="leaderboard-name">{{ leaderboardEntryLabel(entry) }}</span>
        <span class="leaderboard-stats">
          <b>{{ Math.round(entry.damage) }}</b> 伤害
          <em>{{ entry.kills }} 击杀</em>
          <em v-if="entry.mvpStacks">MVP×{{ entry.mvpStacks }}</em>
        </span>
      </li>
    </ol>
    <p v-else class="detail-hint">暂无战斗数据</p>
  </aside>
</template>

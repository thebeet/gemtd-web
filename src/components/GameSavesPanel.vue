<script setup lang="ts">
import type { GameSave } from '../game/saveTypes'
import type { BattleSnapshot } from '../game/types'

defineProps<{
  saves: GameSave[]
  hasSaves: boolean
  saveLoadingId?: string
  battleState: BattleSnapshot
  battleConnected: boolean
  formatSaveTime: (at: number) => string
  loadSave: (id: string) => void
  removeSave: (id: string) => void
}>()
const visible = defineModel<boolean>('visible', { required: true })
</script>

<template>
  <aside v-if="visible" class="game-saves-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
    <button class="detail-close" aria-label="关闭存档" @click="visible = false">×</button>
    <div class="leaderboard-heading">
      <b>局面存档</b>
      <small>每波战斗结束后自动写入浏览器 IndexedDB</small>
    </div>
    <ol v-if="hasSaves" class="game-saves-list">
      <li v-for="save in saves" :key="save.id">
        <div class="game-save-main">
          <b>{{ save.label }}</b>
          <small>{{ formatSaveTime(save.savedAt) }} · 下一波 {{ save.battle.wave }} · 城堡 {{ save.battle.lives }}</small>
        </div>
        <div class="game-save-actions">
          <button
            :disabled="!!saveLoadingId || battleState.phase === 'combat' || !battleConnected"
            @click="loadSave(save.id)"
          >
            {{ saveLoadingId === save.id ? '加载中' : '加载' }}
          </button>
          <button class="danger" :disabled="!!saveLoadingId" @click="removeSave(save.id)">删除</button>
        </div>
      </li>
    </ol>
    <p v-else class="detail-hint">还没有存档。通关一波战斗后会自动保存。</p>
  </aside>
</template>

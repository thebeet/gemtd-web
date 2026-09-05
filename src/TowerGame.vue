<script setup lang="ts">
import { onBeforeUnmount, computed, ref, watch } from 'vue'
import { useLocalStorage, useToggle } from '@vueuse/core'
import { useGameRoom } from './composables/useGameRoom'
import { usePlacementMessage } from './composables/usePlacementMessage'
import { useGameCollab } from './composables/useGameCollab'
import { useGameBattle } from './composables/useGameBattle'
import { useGameBuildActions } from './composables/useGameBuild'
import { useDamageLeaderboard } from './composables/useDamageLeaderboard'
import { useCombatEvents } from './composables/useCombatEvents'
import { useGameSaves } from './composables/useGameSaves'
import { useGameProgress, useTowerSelection } from './composables/useTowerSelection'
import { useGameScene, towerDisplayName } from './composables/useGameScene'
import { towerTypes } from './game/constants'
import { mazeLayouts } from './game/mazeLayouts'
import { useCustomLayouts } from './composables/useCustomLayouts'
import { formatMonsterHp, formatMonsterSpeed, monsterAbilityEntries, MONSTER_ABILITY_OPTIONS } from './game/monsters'
import { formatAttackIntervalSeconds, isAllyBuffAuraAbility, towerData } from './game/towers'
import type { BaseTowerId, BattleSnapshot } from './game/types'

const { room, playerId } = useGameRoom()
const { message: placementMessage, show: showPlacementMessage } = usePlacementMessage()

const {
  connected,
  buildState,
  doc,
  towers,
  playerStates,
  saveBuildState,
  destroy: destroyCollab,
} = useGameCollab(room, playerId)

const [removing, toggleRemoving] = useToggle(false)
const [swapping, toggleSwapping] = useToggle(false)
const [showLeaderboard, toggleLeaderboard] = useToggle(false)
const [showCombatEvents, toggleCombatEvents] = useToggle(false)
const [showSaves, toggleSaves] = useToggle(false)
const [showLayouts, toggleLayouts] = useToggle(false)
const [showTestMonster, toggleTestMonster] = useToggle(false)
const [showMoreTools, toggleMoreTools] = useToggle(false)
const cheatMode = useLocalStorage('gemtd-cheat-mode', false)
const topDownView = ref(true)
const selectedLayoutId = ref<string>()

const {
  customLayouts,
  selectedLayout,
  findLayout,
  savingLayout,
  deletingLayoutId,
  saveCurrentLayout,
  removeCustomLayout,
  formatLayoutTime,
} = useCustomLayouts({
  towers,
  visible: showLayouts,
  selectedLayoutId,
  showMessage: showPlacementMessage,
})

const EMPTY_LAYOUT_CELLS: string[] = []
const layoutGuideCells = computed(() => selectedLayout.value?.cells ?? EMPTY_LAYOUT_CELLS)

function closeMoreTools() {
  showMoreTools.value = false
}

function openToolPanel(toggle: (value?: boolean) => boolean, open = true) {
  closeMoreTools()
  toggle(open)
}

/** Close floating info sheets (not tower/monster selection). Returns true if any were open. */
function closeInfoPanels() {
  let closed = false
  if (showMoreTools.value) {
    closeMoreTools()
    closed = true
  }
  if (showLayouts.value) {
    toggleLayouts(false)
    closed = true
  }
  if (showLeaderboard.value) {
    toggleLeaderboard(false)
    closed = true
  }
  if (showCombatEvents.value) {
    toggleCombatEvents(false)
    closed = true
  }
  if (showSaves.value) {
    toggleSaves(false)
    closed = true
  }
  if (showTestMonster.value) {
    toggleTestMonster(false)
    closed = true
  }
  return closed
}

function supportsHoverAuraPreview() {
  return typeof window !== 'undefined'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function onAbilityPointerEnter(abilityId: string) {
  if (!supportsHoverAuraPreview()) return
  if (isAllyBuffAuraAbility(abilityId)) hoverAuraAbility(abilityId)
}

function onAbilityPointerLeave() {
  if (!supportsHoverAuraPreview()) return
  clearAuraHover()
}

function onAbilityActivate(abilityId: string) {
  if (!isAllyBuffAuraAbility(abilityId)) return
  if (supportsHoverAuraPreview()) return
  if (hoveredAuraAbilityId.value === abilityId) clearAuraHover()
  else hoverAuraAbility(abilityId)
}

const testMonsterForm = ref({
  name: '测试怪物',
  hp: 500,
  armor: 0,
  magicResistancePercent: 0,
  moveSpeed: 450,
  flying: false,
  boss: false,
  abilities: [] as string[],
})

function openTestMonsterPanel() {
  if (!cheatMode.value) {
    showPlacementMessage('请先开启作弊模式')
    return
  }
  openToolPanel(toggleTestMonster, true)
}

function toggleTestMonsterAbility(id: string) {
  const abilities = testMonsterForm.value.abilities
  const index = abilities.indexOf(id)
  if (index >= 0) abilities.splice(index, 1)
  else abilities.push(id)
}

function submitTestMonster() {
  if (!battleConnected.value) {
    showPlacementMessage('战斗服未连接')
    return
  }
  const form = testMonsterForm.value
  spawnTestMonster({
    name: form.name.trim() || '测试怪物',
    hp: Math.max(1, Math.round(Number(form.hp) || 1)),
    armor: Math.round(Number(form.armor) || 0),
    magicResistancePercent: Math.max(0, Math.min(100, Math.round(Number(form.magicResistancePercent) || 0))),
    moveSpeed: Math.max(50, Math.round(Number(form.moveSpeed) || 450)),
    flying: form.flying,
    boss: form.boss,
    abilities: [...form.abilities],
  })
  toggleTestMonster(false)
  showPlacementMessage('已生成测试怪物')
}

function selectMazeLayout(id: string) {
  if (selectedLayoutId.value === id) {
    selectedLayoutId.value = undefined
    showPlacementMessage('已清除布局标识')
    return
  }
  const layout = findLayout(id) ?? customLayouts.value.find((item) => item.id === id)
  if (!layout) {
    showPlacementMessage('找不到该布局')
    return
  }
  selectedLayoutId.value = id
  showPlacementMessage(`已显示布局：${layout.name}（${layout.cells.length} 格 · 约 ${layout.pathLen} 路程）`)
}

function clearMazeLayout() {
  selectedLayoutId.value = undefined
  showPlacementMessage('已清除布局标识')
}

const cheatTowerGroups = towerTypes.map((tower) => ({
  id: tower.id,
  name: tower.name.replace(/塔$/, ''),
  color: tower.color,
  qualities: towerData.qualityLevels.map((quality) => ({
    level: quality.level,
    name: quality.name,
  })),
}))

const resetUi = { fn: () => {} }
let handleBattleSnapshot: (snapshot: BattleSnapshot) => void = () => {}

const {
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
} = useGameBattle({
  room,
  playerId,
  doc,
  towers,
  playerStates,
  showMessage: showPlacementMessage,
  onReset: () => resetUi.fn(),
  onSnapshot: (snapshot) => handleBattleSnapshot(snapshot),
})

const {
  selectedTowerKey,
  hoveredAuraAbilityId,
  selectedTowerRecord,
  selectedTowerStats,
  selectedEffectiveDamage,
  selectedEffectiveAttackInterval,
  selectedEffectiveRange,
  selectedTowerAbilities,
  selectedTowerAuraBuffs,
  selectedTowerAuraDebuffs,
  selectedKeepOptions,
  battleCombineOptions,
  selectedFutureRecipes,
  clearSelection,
  selectTower,
  hoverAuraAbility,
  clearAuraHover,
} = useTowerSelection({ towers, buildState, battleState, playerId })

const selectedMonsterId = ref<number>()
const selectedMonster = computed(() =>
  selectedMonsterId.value == null
    ? undefined
    : battleState.value.monsters.find((monster) => monster.id === selectedMonsterId.value),
)
const selectedMonsterAbilities = computed(() => monsterAbilityEntries(selectedMonster.value))
const selectedMonsterBuffs = computed(() =>
  (selectedMonster.value?.statuses ?? []).filter((status) => status.kind === 'buff'),
)
const selectedMonsterDebuffs = computed(() =>
  (selectedMonster.value?.statuses ?? []).filter((status) => status.kind === 'debuff'),
)
const selectedMonsterStatuses = computed(() =>
  (selectedMonster.value?.statuses ?? []).filter((status) => status.kind === 'status'),
)

function clearMonsterSelection() {
  selectedMonsterId.value = undefined
}

function selectMonster(id: number) {
  clearSelection()
  selectedMonsterId.value = selectedMonsterId.value === id ? undefined : id
}

watch(selectedTowerKey, (key) => {
  if (key) {
    selectedMonsterId.value = undefined
    closeMoreTools()
  }
})
watch(selectedMonsterId, (id) => {
  if (id != null) closeMoreTools()
})
watch(
  () => battleState.value.phase,
  (phase) => {
    if (phase !== 'combat') selectedMonsterId.value = undefined
  },
)

watch(cheatMode, (enabled) => {
  if (!enabled) toggleTestMonster(false)
})

resetUi.fn = () => {
  removing.value = false
  swapping.value = false
  closeMoreTools()
  clearSelection()
  clearMonsterSelection()
}

const { experienceProgress, phaseLabel } = useGameProgress(battleState, buildState)

const { beginBuildRound, chooseKeepOption, combineBattleOption, placeRandomTower, placeRock, placeLayoutRocks, morphRockToBaseTower, morphTowerToRecipe, swapTowerCells } = useGameBuildActions({
  doc,
  towers,
  buildState,
  battleState,
  playerId,
  connected,
  battleConnected,
  saveBuildState,
  showMessage: showPlacementMessage,
  selectTower,
  clearRemoving: () => { removing.value = false },
  clearSwapping: () => { swapping.value = false },
  clearSelection,
  selectedTowerKey,
  registerCombine,
})

function applyMazeLayoutRocks() {
  if (!cheatMode.value) {
    showPlacementMessage('请先开启作弊模式')
    return
  }
  const layout = selectedLayout.value
  if (!layout) {
    showPlacementMessage('请先选择一个布局')
    return
  }
  placeLayoutRocks(layout.cells)
}

const {
  waveFilter: leaderboardWave,
  availableWaves: leaderboardWaves,
  entries: leaderboardEntries,
  hasEntries: hasLeaderboardEntries,
  entryLabel: leaderboardEntryLabel,
} = useDamageLeaderboard({
  visible: showLeaderboard,
  battleConnected,
  battleState,
  sendGameMessage,
  onLeaderboard,
})

const {
  events: combatEvents,
  hasEvents: hasCombatEvents,
  formatCombatEventTime,
  formatCombatEventSummary,
} = useCombatEvents({
  visible: showCombatEvents,
  battleConnected,
  battleState,
  sendGameMessage,
  onCombatEvents,
})

const {
  saves,
  hasSaves,
  saving: savePersisting,
  loadingId: saveLoadingId,
  loadSave,
  removeSave,
  formatSaveTime,
} = useGameSaves({
  room,
  playerId,
  doc,
  towers,
  playerStates,
  buildState,
  battleState,
  battleConnected,
  visible: showSaves,
  showMessage: showPlacementMessage,
  clearSelection,
  requestSaveState,
  restoreSave,
  onSaveState,
})

const {
  host,
  detailPanel,
  monsterDetailPanel,
  towerDetailStyle,
  monsterDetailStyle,
  routeLength,
  materialFor,
  beginPointer,
  updateGhost,
  apply,
  cancelPointer,
  hideGhost,
  toggleCameraView,
  resetView,
  syncBattleVisuals,
} = useGameScene({
  towers,
  buildState,
  battleState,
  serverClockOffset,
  removing,
  swapping,
  cheatMode,
  topDownView,
  selectedTowerKey,
  selectedMonsterId,
  hoveredAuraAbilityId,
  layoutGuideCells,
  playerId,
  doc,
  showMessage: showPlacementMessage,
  placeRandomTower,
  placeRock,
  swapTowerCells,
  selectTower,
  selectMonster,
  clearSelection,
  clearMonsterSelection,
  closeInfoPanels,
  syncCombatLayout,
})

handleBattleSnapshot = syncBattleVisuals

function onToggleCameraView() {
  toggleCameraView()
}

onBeforeUnmount(() => destroyCollab())
</script>

<template>
  <main class="game-shell">
    <div
      ref="host"
      class="three-host game-canvas"
      @pointerdown="beginPointer"
      @pointermove="updateGhost"
      @pointerup="apply"
      @pointercancel="cancelPointer"
      @pointerleave="hideGhost"
    >
      <nav class="game-float-tools" aria-label="战场工具" @pointerdown.stop @pointerup.stop>
        <a class="brand compact-brand" href="/game"><span class="brand-mark">D</span></a>
        <button class="float-tool primary-tool" @click="onToggleCameraView">{{ topDownView ? '3D' : '俯视' }}</button>
        <button
          class="float-tool primary-tool"
          :class="{ selected: removing }"
          :disabled="buildState.phase !== 'idle' || battleState.phase === 'combat'"
          @click="toggleRemoving()"
        >
          {{ removing ? '拆除中' : '拆除' }}
        </button>
        <button
          class="float-tool primary-tool"
          :class="{ selected: swapping }"
          :disabled="buildState.phase !== 'idle' || battleState.phase === 'combat'"
          @click="toggleSwapping()"
        >
          {{ swapping ? '交换中' : '交换' }}
        </button>
        <div class="float-tools-more">
          <button
            class="float-tool"
            :class="{ selected: showMoreTools }"
            aria-haspopup="menu"
            :aria-expanded="showMoreTools"
            @click="toggleMoreTools()"
          >
            更多
          </button>
          <div v-if="showMoreTools" class="float-more-menu" role="menu" @pointerdown.stop>
            <button
              class="float-more-item"
              :class="{ selected: showLayouts || !!selectedLayoutId }"
              role="menuitem"
              @click="openToolPanel(toggleLayouts)"
            >
              布局
            </button>
            <button
              class="float-more-item"
              :class="{ selected: cheatMode }"
              role="menuitem"
              @click="cheatMode = !cheatMode"
            >
              {{ cheatMode ? '关闭作弊' : '作弊' }}
            </button>
            <button
              v-if="cheatMode"
              class="float-more-item"
              :class="{ selected: showTestMonster }"
              role="menuitem"
              :disabled="!battleConnected"
              @click="openTestMonsterPanel"
            >
              测试怪物
            </button>
            <button class="float-more-item" role="menuitem" @click="resetView(); closeMoreTools()">重置视角</button>
            <button
              class="float-more-item"
              :class="{ selected: showLeaderboard }"
              role="menuitem"
              @click="openToolPanel(toggleLeaderboard)"
            >
              伤害榜
            </button>
            <button
              class="float-more-item"
              :class="{ selected: showCombatEvents }"
              role="menuitem"
              @click="openToolPanel(toggleCombatEvents)"
            >
              战斗事件
            </button>
            <button
              class="float-more-item"
              :class="{ selected: showSaves }"
              role="menuitem"
              @click="openToolPanel(toggleSaves)"
            >
              {{ savePersisting ? '保存中…' : '存档' }}
            </button>
            <button
              class="float-more-item"
              role="menuitem"
              :disabled="!battleConnected"
              @click="resetCurrentWave(); closeMoreTools()"
            >
              重开本波
            </button>
            <button
              class="float-more-item danger"
              role="menuitem"
              :disabled="!battleConnected"
              @click="restartGame(); closeMoreTools()"
            >
              重启游戏
            </button>
          </div>
        </div>
        <div class="float-tools-desktop">
          <button
            class="float-tool"
            :class="{ selected: showLayouts || !!selectedLayoutId }"
            @click="toggleLayouts()"
          >
            布局
          </button>
          <button
            class="float-tool"
            :class="{ selected: cheatMode }"
            @click="cheatMode = !cheatMode"
          >
            {{ cheatMode ? '作弊中' : '作弊' }}
          </button>
          <button
            v-if="cheatMode"
            class="float-tool"
            :class="{ selected: showTestMonster }"
            :disabled="!battleConnected"
            @click="openTestMonsterPanel"
          >
            测试怪物
          </button>
          <button class="float-tool" @click="resetView">重置视角</button>
          <button class="float-tool" :class="{ selected: showLeaderboard }" @click="toggleLeaderboard()">伤害榜</button>
          <button class="float-tool" :class="{ selected: showCombatEvents }" @click="toggleCombatEvents()">战斗事件</button>
          <button class="float-tool" :class="{ selected: showSaves }" @click="toggleSaves()">
            {{ savePersisting ? '保存中…' : '存档' }}
          </button>
        </div>
      </nav>

      <div v-if="placementMessage" class="game-notice">{{ placementMessage }}</div>

      <aside v-if="showLayouts" class="maze-layout-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
        <button class="detail-close" aria-label="关闭布局方案" @click="toggleLayouts(false)">×</button>
        <div class="leaderboard-heading">
          <b>迷宫布局</b>
          <small>{{ cheatMode ? '可保存当前场上塔/岩石为布局；作弊模式下可一键放下石头' : '选择后在地图上标记建议建造格；也可保存当前布局到本机' }}</small>
        </div>
        <button
          type="button"
          class="maze-layout-save"
          :disabled="savingLayout || battleState.phase === 'combat'"
          @click="saveCurrentLayout"
        >
          {{ savingLayout ? '保存中…' : '保存当前布局' }}
        </button>
        <div v-if="customLayouts.length" class="maze-layout-section">
          <span class="maze-layout-section-label">我的布局</span>
          <ol class="maze-layout-list">
            <li v-for="layout in customLayouts" :key="layout.id">
              <button
                type="button"
                class="maze-layout-option"
                :class="{ selected: selectedLayoutId === layout.id }"
                @click="selectMazeLayout(layout.id)"
              >
                <span class="maze-layout-option-head">
                  <b>{{ layout.name }}</b>
                  <em>{{ layout.cells.length }} 格 · 约 {{ layout.pathLen }} 路程</em>
                </span>
                <span>{{ layout.summary }} · {{ formatLayoutTime(layout.savedAt) }}</span>
              </button>
              <button
                type="button"
                class="maze-layout-delete"
                :disabled="deletingLayoutId === layout.id"
                @pointerdown.stop
                @click.stop="removeCustomLayout(layout.id)"
              >
                {{ deletingLayoutId === layout.id ? '删除中…' : '删除' }}
              </button>
            </li>
          </ol>
        </div>
        <div class="maze-layout-section">
          <span class="maze-layout-section-label">推荐布局</span>
          <ol class="maze-layout-list">
            <li v-for="layout in mazeLayouts" :key="layout.id">
              <button
                type="button"
                class="maze-layout-option"
                :class="{ selected: selectedLayoutId === layout.id }"
                @click="selectMazeLayout(layout.id)"
              >
                <span class="maze-layout-option-head">
                  <b>{{ layout.name }}</b>
                  <em>{{ layout.cells.length }} 格 · 约 {{ layout.pathLen }} 路程</em>
                </span>
                <span>{{ layout.summary }}</span>
              </button>
            </li>
          </ol>
        </div>
        <button
          v-if="cheatMode"
          type="button"
          class="maze-layout-apply"
          :disabled="!selectedLayoutId || battleState.phase === 'combat'"
          @click="applyMazeLayoutRocks"
        >
          一键放下石头
        </button>
        <button
          type="button"
          class="maze-layout-clear"
          :disabled="!selectedLayoutId"
          @click="clearMazeLayout"
        >
          清除标识
        </button>
      </aside>

      <aside v-if="showTestMonster" class="test-monster-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
        <button class="detail-close" aria-label="关闭测试怪物" @click="toggleTestMonster(false)">×</button>
        <div class="leaderboard-heading">
          <b>生成测试怪物</b>
          <small>可自定义血量、移速与技能；建造期会进入测试战斗</small>
        </div>
        <div class="test-monster-form">
          <label>
            <span>名称</span>
            <input v-model="testMonsterForm.name" type="text" maxlength="32" />
          </label>
          <label>
            <span>生命</span>
            <input v-model.number="testMonsterForm.hp" type="number" min="1" max="1000000" step="1" />
          </label>
          <label>
            <span>护甲</span>
            <input v-model.number="testMonsterForm.armor" type="number" min="-50" max="200" step="1" />
          </label>
          <label>
            <span>魔抗 %</span>
            <input v-model.number="testMonsterForm.magicResistancePercent" type="number" min="0" max="100" step="1" />
          </label>
          <label>
            <span>移速</span>
            <input v-model.number="testMonsterForm.moveSpeed" type="number" min="50" max="2000" step="10" />
          </label>
          <div class="test-monster-flags">
            <label class="test-monster-check">
              <input v-model="testMonsterForm.flying" type="checkbox" />
              <span>飞行</span>
            </label>
            <label class="test-monster-check">
              <input v-model="testMonsterForm.boss" type="checkbox" />
              <span>Boss</span>
            </label>
          </div>
          <div class="test-monster-abilities">
            <span class="test-monster-abilities-label">技能</span>
            <label
              v-for="ability in MONSTER_ABILITY_OPTIONS"
              :key="ability.id"
              class="test-monster-ability"
              :class="{ selected: testMonsterForm.abilities.includes(ability.id) }"
              :title="ability.description"
            >
              <input
                type="checkbox"
                :checked="testMonsterForm.abilities.includes(ability.id)"
                @change="toggleTestMonsterAbility(ability.id)"
              />
              <b>{{ ability.name }}</b>
              <span>{{ ability.description }}</span>
            </label>
          </div>
          <button type="button" class="test-monster-submit" :disabled="!battleConnected" @click="submitTestMonster">
            生成怪物
          </button>
        </div>
      </aside>

      <aside v-if="showLeaderboard" class="damage-leaderboard-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
        <button class="detail-close" aria-label="关闭伤害榜" @click="toggleLeaderboard(false)">×</button>
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
            </span>
          </li>
        </ol>
        <p v-else class="detail-hint">暂无战斗数据</p>
      </aside>

      <aside v-if="showCombatEvents" class="battle-events-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
        <button class="detail-close" aria-label="关闭战斗事件" @click="toggleCombatEvents(false)">×</button>
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

      <aside v-if="showSaves" class="game-saves-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
        <button class="detail-close" aria-label="关闭存档" @click="toggleSaves(false)">×</button>
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

      <aside
        v-if="selectedMonster"
        ref="monsterDetailPanel"
        class="tower-detail-panel monster-detail-panel game-sheet"
        :style="monsterDetailStyle"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <button class="detail-close" aria-label="关闭怪物详情" @pointerdown.stop @pointerup.stop @click.stop="clearMonsterSelection">×</button>
        <div class="detail-heading">
          <span class="detail-monster-mark" :class="{ boss: selectedMonster.boss, flying: selectedMonster.flying }"></span>
          <div>
            <b>{{ selectedMonster.name }}</b>
            <small>
              {{ selectedMonster.boss ? 'Boss' : '普通怪' }}
              · {{ selectedMonster.flying ? '飞行' : '地面' }}
              · #{{ selectedMonster.id }}
            </small>
          </div>
        </div>
        <dl class="tower-stats">
          <div><dt>生命</dt><dd>{{ formatMonsterHp(selectedMonster.hp) }} / {{ formatMonsterHp(selectedMonster.maxHp) }}</dd></div>
          <div><dt>移速</dt><dd>{{ formatMonsterSpeed(selectedMonster.effectiveSpeed ?? selectedMonster.speed) }} <small class="stat-sub">基础 {{ formatMonsterSpeed(selectedMonster.speed) }}</small></dd></div>
          <div><dt>护甲</dt><dd>{{ selectedMonster.armor }} <small class="stat-sub">基础 {{ selectedMonster.baseArmor ?? selectedMonster.armor }}</small></dd></div>
          <div><dt>魔抗</dt><dd>{{ selectedMonster.magicResistancePercent ?? 0 }}%</dd></div>
          <div><dt>击杀金币</dt><dd>{{ selectedMonster.bountyGold ?? 0 }}</dd></div>
          <div><dt>击杀经验</dt><dd>{{ selectedMonster.bountyExperience ?? 0 }}</dd></div>
        </dl>
        <div v-if="selectedMonsterAbilities.length" class="tower-abilities">
          <div
            v-for="ability in selectedMonsterAbilities"
            :key="ability.id"
            class="tower-ability"
          >
            <b>{{ ability.name }}</b>
            <span>{{ ability.description }}</span>
          </div>
        </div>
        <div class="aura-panel">
          <div v-if="selectedMonsterBuffs.length" class="aura-group">
            <span class="aura-group-label">增益</span>
            <div v-for="effect in selectedMonsterBuffs" :key="effect.id" class="aura-effect buff">
              <b>{{ effect.name }}</b>
              <span v-if="effect.detail">{{ effect.detail }}</span>
            </div>
          </div>
          <div v-if="selectedMonsterDebuffs.length" class="aura-group">
            <span class="aura-group-label">减益</span>
            <div v-for="effect in selectedMonsterDebuffs" :key="effect.id" class="aura-effect debuff">
              <b>{{ effect.name }}</b>
              <span v-if="effect.detail">{{ effect.detail }}</span>
            </div>
          </div>
          <div v-if="selectedMonsterStatuses.length" class="aura-group">
            <span class="aura-group-label">状态</span>
            <div v-for="effect in selectedMonsterStatuses" :key="effect.id" class="aura-effect status">
              <b>{{ effect.name }}</b>
              <span v-if="effect.detail">{{ effect.detail }}</span>
            </div>
          </div>
          <p
            v-if="!selectedMonsterBuffs.length && !selectedMonsterDebuffs.length && !selectedMonsterStatuses.length"
            class="detail-hint"
          >
            当前没有额外状态
          </p>
        </div>
      </aside>

      <aside
        v-if="selectedTowerRecord"
        ref="detailPanel"
        class="tower-detail-panel game-sheet"
        :style="towerDetailStyle"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <button class="detail-close" aria-label="关闭塔详情" @pointerdown.stop @pointerup.stop @click.stop="clearSelection">×</button>
        <div class="detail-heading">
          <span class="detail-gem" :style="{ background: materialFor(selectedTowerRecord).color.getStyle() }"></span>
          <div>
            <b>{{ towerDisplayName(selectedTowerRecord) }}</b>
            <small>
              {{
                selectedTowerRecord.temporary
                  ? '本波候选塔'
                  : selectedTowerRecord.type === 'rock'
                    ? (cheatMode ? '岩石 · 可变形' : '岩石障碍')
                    : '已保留的建筑'
              }}
              · {{ selectedTowerKey }}
            </small>
          </div>
        </div>
        <div
          v-if="cheatMode && selectedTowerRecord.type === 'rock' && battleState.phase !== 'combat'"
          class="cheat-morph"
        >
          <span class="cheat-morph-label">变为基础塔</span>
          <div v-for="group in cheatTowerGroups" :key="group.id" class="cheat-morph-row">
            <i class="cheat-morph-gem" :style="{ background: group.color }"></i>
            <b>{{ group.name }}</b>
            <button
              v-for="quality in group.qualities"
              :key="`${group.id}:${quality.level}`"
              type="button"
              @click="morphRockToBaseTower(selectedTowerKey!, group.id as BaseTowerId, quality.level)"
            >
              {{ quality.name }}
            </button>
          </div>
        </div>
        <dl v-if="selectedTowerStats" class="tower-stats">
          <div><dt>伤害</dt><dd>{{ (selectedEffectiveDamage ?? selectedTowerStats.damage)[0] }}–{{ (selectedEffectiveDamage ?? selectedTowerStats.damage)[1] }}</dd></div>
          <div><dt>攻击间隔</dt><dd>{{ formatAttackIntervalSeconds(selectedEffectiveAttackInterval ?? selectedTowerStats.attackIntervalSeconds) }} 秒</dd></div>
          <div><dt>射程</dt><dd>{{ selectedEffectiveRange ?? selectedTowerStats.range }}</dd></div>
        </dl>
        <div v-if="selectedTowerAbilities.length" class="tower-abilities">
          <div
            v-for="ability in selectedTowerAbilities"
            :key="ability.id"
            class="tower-ability"
            :class="{ 'is-aura': isAllyBuffAuraAbility(ability.id), active: hoveredAuraAbilityId === ability.id }"
            @pointerenter="onAbilityPointerEnter(ability.id)"
            @pointerleave="onAbilityPointerLeave"
            @click="onAbilityActivate(ability.id)"
          >
            <b>{{ ability.name }}</b><span>{{ ability.description }}</span>
          </div>
        </div>
        <template v-if="selectedTowerRecord.type !== 'rock'">
          <hr class="tower-aura-divider" />
          <div class="tower-aura-effects">
            <div v-if="selectedTowerAuraBuffs.length" class="aura-group">
              <span class="aura-group-label">增益</span>
              <div v-for="effect in selectedTowerAuraBuffs" :key="effect.id" class="aura-effect buff">
                <div class="aura-effect-head">
                  <b>{{ effect.name }}</b>
                  <small>来自 {{ effect.sourceName }}</small>
                </div>
                <span>{{ effect.description }}</span>
              </div>
            </div>
            <div v-if="selectedTowerAuraDebuffs.length" class="aura-group">
              <span class="aura-group-label debuff">减益</span>
              <div v-for="effect in selectedTowerAuraDebuffs" :key="effect.id" class="aura-effect debuff">
                <div class="aura-effect-head">
                  <b>{{ effect.name }}</b>
                  <small>来自 {{ effect.sourceName }}</small>
                </div>
                <span>{{ effect.description }}</span>
              </div>
            </div>
            <p v-if="!selectedTowerAuraBuffs.length && !selectedTowerAuraDebuffs.length" class="detail-hint">当前未受到光环影响</p>
          </div>
          <template v-if="selectedFutureRecipes.length">
            <hr class="tower-aura-divider" />
            <div class="tower-recipe-previews">
              <span class="recipe-preview-label">{{ cheatMode ? '可合成配方 · 点击直接合成' : '可合成配方' }}</span>
              <button
                v-for="recipe in selectedFutureRecipes"
                :key="recipe.id"
                type="button"
                class="recipe-preview"
                :class="{ clickable: cheatMode && battleState.phase !== 'combat' }"
                :disabled="!cheatMode || battleState.phase === 'combat'"
                @click="morphTowerToRecipe(selectedTowerKey!, recipe.id)"
              >
                <b class="recipe-preview-name">{{ recipe.name }}</b>
                <span class="recipe-preview-ingredients">
                  <template v-for="(ingredient, index) in recipe.ingredients" :key="`${recipe.id}:${ingredient.unitId}:${index}`">
                    <span v-if="index" class="recipe-preview-plus">+</span>
                    <b v-if="ingredient.owned" class="recipe-ingredient owned">{{ ingredient.label }}({{ ingredient.count }})</b>
                    <span v-else class="recipe-ingredient missing">{{ ingredient.label }}({{ ingredient.count }})</span>
                  </template>
                </span>
              </button>
            </div>
          </template>
        </template>
        <div v-if="selectedTowerRecord.temporary && selectedTowerRecord.ownerId === playerId && buildState.phase === 'choosing'" class="detail-actions">
          <button v-for="option in selectedKeepOptions" :key="option.id" @click="chooseKeepOption(option)">
            <b>{{ option.label }}</b><small>{{ option.detail }}</small>
          </button>
          <span v-if="!selectedKeepOptions.length">这个候选塔只能作为其他结果的材料。</span>
        </div>
        <div v-else-if="battleCombineOptions.length" class="detail-actions">
          <button v-for="option in battleCombineOptions" :key="option.id" @click="combineBattleOption(option)">
            <b>{{ option.label }}</b><small>{{ option.detail }}</small>
          </button>
        </div>
        <p v-else-if="selectedTowerRecord.temporary" class="detail-hint">本波候选塔已高亮；放完 5 个后可在此选择保留结果。</p>
      </aside>

      <footer class="game-statusbar" :class="{ combat: battleState.phase === 'combat' }">
        <div class="status-round">
          <i :class="{ offline: !connected || !battleConnected, combat: battleState.phase === 'combat' }"></i>
          <span>第 {{ battleState.wave }} 波</span>
          <b>{{ battleState.phase === 'combat' ? '战斗中' : phaseLabel }}</b>
        </div>
        <div v-if="battleState.phase === 'combat'" class="status-combat">
          <span class="status-combat-full">剩余怪物 <b>{{ battleState.monsters.length }}</b></span>
          <span class="status-combat-full">已出现 {{ battleState.spawned }}/{{ battleState.spawnCount }}</span>
          <span class="status-combat-full">城堡 {{ battleState.lives }} ♥</span>
          <span class="status-combat-full">金币 {{ battleState.gold }}</span>
          <span class="status-combat-compact">怪 <b>{{ battleState.monsters.length }}</b> · ♥ {{ battleState.lives }} · 金 {{ battleState.gold }}</span>
        </div>
        <div v-else class="status-combat">
          <span v-if="buildState.phase === 'placing'" class="status-combat-full">还需放置 {{ 5 - buildState.pendingKeys.length }} 座随机塔</span>
          <span v-else-if="buildState.phase === 'choosing'" class="status-combat-full">点击候选塔，选择要保留的结果</span>
          <span v-else class="status-combat-full">路线 {{ routeLength }} 格 · 击杀 {{ battleState.kills }} · 金币 {{ battleState.gold }}</span>
          <span v-if="buildState.phase === 'placing'" class="status-combat-compact">放置 {{ 5 - buildState.pendingKeys.length }}/5</span>
          <span v-else-if="buildState.phase === 'choosing'" class="status-combat-compact">选择保留</span>
          <span v-else class="status-combat-compact">金 {{ battleState.gold }} · 杀 {{ battleState.kills }}</span>
        </div>
        <div class="status-hero">
          <b>Lv. {{ battleState.heroLevel }}</b>
          <span>{{ battleState.heroLevel >= 5 ? 'MAX' : `${battleState.experience} / ${battleState.nextLevelExperience} XP` }}</span>
          <i><em :style="{ width: `${experienceProgress * 100}%` }"></em></i>
        </div>
        <div class="status-reset-actions">
          <button :disabled="!battleConnected" @click="resetCurrentWave">重开本波</button>
          <button :disabled="!battleConnected" @click="restartGame">重启游戏</button>
        </div>
        <button
          v-if="buildState.phase === 'idle' && buildState.wave <= battleState.wave"
          class="status-control"
          :disabled="!connected || !battleConnected || battleState.phase === 'combat'"
          @click="beginBuildRound"
        >
          开始建造
        </button>
        <button
          v-else-if="buildState.phase === 'idle' && buildState.wave > battleState.wave"
          class="status-control combat-control"
          :disabled="!battleConnected || battleState.phase === 'combat'"
          @click="startCombat"
        >
          开始战斗
        </button>
        <span v-else class="status-control status-wait">{{ buildState.phase === 'placing' ? '建造中' : '选择保留' }}</span>
      </footer>
    </div>
  </main>
</template>

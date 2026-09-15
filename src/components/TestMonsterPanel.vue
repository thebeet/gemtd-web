<script setup lang="ts">
import { ref } from 'vue'
import { MONSTER_ABILITY_OPTIONS } from '../game/monsters'
import type { TestMonsterConfig } from '../game/combat/types'

const props = defineProps<{
  battleConnected: boolean
  spawnTestMonster: (monster: TestMonsterConfig) => void
  showMessage: (text: string) => void
}>()
const visible = defineModel<boolean>('visible', { required: true })

const testMonsterForm = ref({
  name: '测试怪物',
  hp: 500,
  armor: 0,
  magicResistancePercent: 0,
  moveSpeed: 450,
  count: 1,
  flying: false,
  boss: false,
  abilities: [] as string[],
})

function toggleTestMonsterAbility(id: string) {
  const abilities = testMonsterForm.value.abilities
  const index = abilities.indexOf(id)
  if (index >= 0) abilities.splice(index, 1)
  else abilities.push(id)
}

function submitTestMonster() {
  if (!props.battleConnected) {
    props.showMessage('战斗服未连接')
    return
  }
  const form = testMonsterForm.value
  const count = Math.max(1, Math.min(100, Math.round(Number(form.count) || 1)))
  props.spawnTestMonster({
    name: form.name.trim() || '测试怪物',
    hp: Math.max(1, Math.round(Number(form.hp) || 1)),
    armor: Math.round(Number(form.armor) || 0),
    magicResistancePercent: Math.max(0, Math.min(100, Math.round(Number(form.magicResistancePercent) || 0))),
    moveSpeed: Math.max(50, Math.round(Number(form.moveSpeed) || 450)),
    flying: form.flying,
    boss: form.boss,
    abilities: [...form.abilities],
    count,
  })
  visible.value = false
  props.showMessage(count > 1 ? `已生成 ${count} 只测试怪物` : '已生成测试怪物')
}

</script>

<template>
  <aside v-if="visible" class="test-monster-panel game-sheet" @pointerdown.stop @pointerup.stop @click.stop>
    <button class="detail-close" aria-label="关闭测试怪物" @click="visible = false">×</button>
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
      <label>
        <span>数量</span>
        <input v-model.number="testMonsterForm.count" type="number" min="1" max="100" step="1" />
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

</template>

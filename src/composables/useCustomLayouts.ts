import { computed, onMounted, ref, watch, type Ref } from 'vue'
import type * as Y from 'yjs'
import { createLayoutId, deleteSavedLayout, listSavedLayouts, putSavedLayout } from '../game/layoutDb'
import {
  collectLayoutCellsFromTowers,
  mazeLayoutById,
  mazeLayouts,
  pathLenForBlockedCells,
  toMazeLayoutView,
  type MazeLayout,
} from '../game/mazeLayouts'
import type { SavedMazeLayout } from '../game/layoutTypes'

export function useCustomLayouts(options: {
  towers: Y.Map<string>
  visible: Ref<boolean>
  selectedLayoutId: Ref<string | undefined>
  showMessage: (text: string) => void
}) {
  const customLayouts = ref<SavedMazeLayout[]>([])
  const saving = ref(false)
  const deletingId = ref<string>()

  async function refreshLayouts() {
    try {
      customLayouts.value = await listSavedLayouts()
    } catch {
      customLayouts.value = []
    }
  }

  onMounted(() => {
    void refreshLayouts()
  })

  watch(options.visible, (visible) => {
    if (visible) void refreshLayouts()
  })

  const customLayoutViews = computed(() => customLayouts.value.map(toMazeLayoutView))

  const selectedLayout = computed(() =>
    mazeLayoutById(options.selectedLayoutId.value, customLayoutViews.value),
  )

  function findLayout(id: string): MazeLayout | undefined {
    return mazeLayoutById(id, customLayoutViews.value)
      ?? mazeLayouts.find((layout) => layout.id === id)
      ?? customLayoutViews.value.find((layout) => layout.id === id)
  }

  async function saveCurrentLayout() {
    if (saving.value) return
    const cells = collectLayoutCellsFromTowers(options.towers)
    if (!cells.length) {
      options.showMessage('当前没有可保存的塔或岩石')
      return
    }
    const pathLen = pathLenForBlockedCells(cells)
    if (pathLen < 0) {
      options.showMessage('当前布局阻断路线，无法保存')
      return
    }
    saving.value = true
    try {
      const savedAt = Date.now()
      const stamp = new Date(savedAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const layout: SavedMazeLayout = {
        id: createLayoutId(),
        name: `我的布局 ${stamp}`,
        summary: `本机保存 · ${cells.length} 格（塔记为岩石）`,
        pathLen,
        cells,
        savedAt,
      }
      await putSavedLayout(layout)
      await refreshLayouts()
      options.selectedLayoutId.value = layout.id
      options.showMessage(`已保存布局：${layout.name}（${cells.length} 格 · 约 ${pathLen} 路程）`)
    } catch {
      options.showMessage('布局保存失败')
    } finally {
      saving.value = false
    }
  }

  async function removeCustomLayout(id: string) {
    if (deletingId.value) return
    deletingId.value = id
    try {
      await deleteSavedLayout(id)
      if (options.selectedLayoutId.value === id) options.selectedLayoutId.value = undefined
      await refreshLayouts()
      if (customLayouts.value.some((layout) => layout.id === id)) {
        options.showMessage('删除布局失败')
        return
      }
      options.showMessage('已删除自定义布局')
    } catch {
      options.showMessage('删除布局失败')
    } finally {
      deletingId.value = undefined
    }
  }

  function formatLayoutTime(at: number) {
    return new Date(at).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  return {
    customLayouts,
    customLayoutViews,
    selectedLayout,
    findLayout,
    savingLayout: saving,
    deletingLayoutId: deletingId,
    refreshLayouts,
    saveCurrentLayout,
    removeCustomLayout,
    formatLayoutTime,
  }
}

export type { MazeLayout }

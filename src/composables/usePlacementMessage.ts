import { ref } from 'vue'
import { useTimeoutFn } from '@vueuse/core'

export function usePlacementMessage(duration = 2200) {
  const message = ref('')
  const { start, stop } = useTimeoutFn(() => { message.value = '' }, duration, { immediate: false })

  function show(text: string) {
    message.value = text
    stop()
    start()
  }

  return { message, show }
}

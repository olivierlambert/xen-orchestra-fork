import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Toast = {
  id: number
  tone: 'success' | 'info' | 'danger'
  title: string
  description?: string
}

let counter = 0

export const useToasts = defineStore('toasts', () => {
  const items = ref<Toast[]>([])

  function dismiss(id: number) {
    items.value = items.value.filter(toast => toast.id !== id)
  }

  function push(toast: Omit<Toast, 'id'>, duration = 4500) {
    const id = ++counter
    items.value = [...items.value.slice(-3), { ...toast, id }]
    setTimeout(() => dismiss(id), duration)
  }

  return {
    items,
    dismiss,
    success: (title: string, description?: string) => push({ tone: 'success', title, description }),
    info: (title: string, description?: string) => push({ tone: 'info', title, description }),
    danger: (title: string, description?: string) => push({ tone: 'danger', title, description }, 8000),
  }
})

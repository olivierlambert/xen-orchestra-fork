import { getErrorMessage } from '@/modules/cloud/cloud.api.ts'
import { ref, shallowRef } from 'vue'

/**
 * Loads a REST resource once, with an explicit `reload` after changes.
 *
 * The cloud resources are plain JSON documents, not XAPI objects: no events, no polling.
 */
export function useCloudResource<T>(load: () => Promise<T>, initialData: T) {
  const data = shallowRef<T>(initialData)
  const isReady = ref(false)
  const error = ref<string>()

  async function reload() {
    try {
      data.value = await load()
      error.value = undefined
    } catch (err) {
      error.value = getErrorMessage(err)
    } finally {
      isReady.value = true
    }
  }

  void reload()

  return { data, isReady, error, reload }
}

/** Runs an action, keeps its error message and busy state */
export function useCloudAction() {
  const isRunning = ref(false)
  const error = ref<string>()

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    isRunning.value = true
    error.value = undefined
    try {
      return await fn()
    } catch (err) {
      error.value = getErrorMessage(err)
      return undefined
    } finally {
      isRunning.value = false
    }
  }

  return { isRunning, error, run }
}

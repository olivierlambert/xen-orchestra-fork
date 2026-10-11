import i18n from '@core/i18n.ts'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'
import App from './App.vue'
import '@xen-orchestra/web-core/assets/css/base.pcss'
import '@core/assets/css/_themes.pcss'
import './styles/portal.pcss'

const app = createApp(App)

const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/', redirect: '/dashboard' }, ...routes],
})

// after a deployment, an open tab still references the previous build: load the new one instead of staying put
router.onError((error, to) => {
  if (
    /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
      String(error?.message)
    )
  ) {
    window.location.assign(`${window.location.pathname}#${to.fullPath}`)
    window.location.reload()
  }
})

if (import.meta.hot) {
  handleHotUpdate(router)
}

app.use(i18n)
app.use(createPinia())
app.use(router)

app.mount('#app')

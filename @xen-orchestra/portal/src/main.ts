import i18n from '@core/i18n.ts'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'
import App from './App.vue'
import '@xen-orchestra/web-core/assets/css/base.pcss'
import '@core/assets/css/_themes.pcss'

const app = createApp(App)

const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/', redirect: '/dashboard' }, ...routes],
})

if (import.meta.hot) {
  handleHotUpdate(router)
}

app.use(i18n)
app.use(createPinia())
app.use(router)

app.mount('#app')

import { fileURLToPath, URL } from 'node:url'
import vueI18n from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, PluginOption } from 'vite'
import vueRouter from 'vue-router/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    vueRouter({
      dts: './src/route-map.d.ts',
    }),
    vue(),
    vueI18n({
      include: fileURLToPath(new URL('../web-core/lib/locales/**', import.meta.url)),
    }),
  ] as PluginOption[],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('../web-core/lib', import.meta.url)),
    },
  },
  server: {
    port: 5174,
  },
})

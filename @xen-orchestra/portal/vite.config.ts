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
    // `XO_URL=https://xo.example.org npm run dev` connects the portal to a Xen Orchestra, otherwise it runs on mocks
    proxy:
      process.env.XO_URL === undefined
        ? undefined
        : {
            '/rest': {
              target: process.env.XO_URL,
              changeOrigin: true,
              secure: false,
              // XO answers 401 with `WWW-Authenticate: Basic`, which makes browsers show their own login dialog
              // instead of letting the portal display its sign-in page
              configure: proxy => {
                proxy.on('proxyRes', response => {
                  delete response.headers['www-authenticate']
                })
              },
            },
            // instance consoles (websocket)
            '/api': { target: process.env.XO_URL, changeOrigin: true, secure: false, ws: true },
          },
  },
})

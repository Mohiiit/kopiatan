import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { resolve } from 'path'

export default defineConfig({
  plugins: [solid()],
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['catan-core'],
  },
  server: {
    fs: {
      // Allow serving files from the parent directory (for WASM files)
      allow: ['..'],
    },
  },
  resolve: {
    alias: {
      'catan-core': resolve(__dirname, '../crates/catan-core/pkg'),
    },
  },
})

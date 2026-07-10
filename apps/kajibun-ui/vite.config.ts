import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: new URL('../../node_modules/react/index.js', import.meta.url).pathname },
      { find: /^react\/jsx-runtime$/, replacement: new URL('../../node_modules/react/jsx-runtime.js', import.meta.url).pathname },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: new URL('../../node_modules/react/jsx-dev-runtime.js', import.meta.url).pathname,
      },
      { find: /^react-dom$/, replacement: new URL('../../node_modules/react-dom/index.js', import.meta.url).pathname },
      { find: /^react-dom\/client$/, replacement: new URL('../../node_modules/react-dom/client.js', import.meta.url).pathname },
    ],
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    server: {
      deps: {
        inline: ['@mantine/core', '@mantine/hooks'],
      },
    },
  },
  //css: {
  //  postcss: {
  //    plugins: [
  //      'tailwindcss',
  //      'autoprefixer',
  //    ],
  //  },
  //},
})

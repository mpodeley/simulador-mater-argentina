import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: "./" keeps asset + data paths relative so the build works unchanged
// under the GitHub Pages project subpath (mpodeley.github.io/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
})

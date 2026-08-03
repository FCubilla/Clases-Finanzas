import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoName = 'Clases-Finanzas'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? `/${repoName}/` : '/',
}))

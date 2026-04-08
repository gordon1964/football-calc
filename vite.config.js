import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ZMIEŃ 'football-calc' na nazwę swojego repo GitHub!
export default defineConfig({
  plugins: [react()],
  base: '/football-calc/',
})

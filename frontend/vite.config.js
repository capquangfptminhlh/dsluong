import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Base path '/dsluong/' cho GitHub Pages
export default defineConfig({
  base: '/dsluong/',
  plugins: [
    react(),
    tailwindcss()
  ],
})

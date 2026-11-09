import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Base path '/' cho tên miền riêng vh2tpharma.com
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss()
  ],
})

import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tw from '@tailwindcss/vite'

export default defineConfig({
  plugins: [solid(), tw()],
})

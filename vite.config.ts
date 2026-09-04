import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({plugins:[react(),VitePWA({registerType:'autoUpdate',injectRegister:'auto',manifest:false,workbox:{navigateFallback:'/index.html',globPatterns:['**/*.{js,css,html,svg,png,webmanifest}']}})],build:{sourcemap:true,target:'es2020'}});

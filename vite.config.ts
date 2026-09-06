import { defineConfig,type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function ownerAdminRoute():Plugin{
  const rewrite=(request:{url?:string},_response:unknown,next:()=>void)=>{
    if(request.url?.split(/[?#]/,1)[0]==='/owner-admin')request.url='/owner-admin.html';
    next();
  };
  return {name:'stockguard-owner-admin-route',configureServer(server){server.middlewares.use(rewrite)},configurePreviewServer(server){server.middlewares.use(rewrite)}};
}

export default defineConfig({plugins:[ownerAdminRoute(),react(),VitePWA({registerType:'autoUpdate',injectRegister:'auto',manifest:false,workbox:{navigateFallback:'/index.html',globPatterns:['**/*.{js,css,html,svg,png,webmanifest}']}})],build:{sourcemap:true,target:'es2020',rollupOptions:{input:['index.html','owner-admin.html']}}});

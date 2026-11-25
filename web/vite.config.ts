import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The editor is served next to the main Partwise site, at /editor/ (the site
// is at /, the API at /api). `npm run build:site` writes it into the main
// site's public/editor folder, so building and deploying the main site
// includes the editor. In development the site's dev server passes /editor/
// on to this one.
//
// `npm run build:site:lamp` builds for the old host instead: editor at
// /partwise/editor/, API at /mern/api. EDITOR_BASE overrides the path.
export default defineConfig(({ mode }) => {
  const oldHost = mode === 'lamp';
  return {
    base: process.env.EDITOR_BASE ?? (oldHost ? '/partwise/editor/' : '/editor/'),
    define: oldHost ? { 'import.meta.env.VITE_API_URL': JSON.stringify('/mern/api') } : {},
    plugins: [react()],
    server: { port: 5173, strictPort: true },
  };
});

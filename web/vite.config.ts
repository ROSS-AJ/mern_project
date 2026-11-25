import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The editor is served next to the main Partwise site, at /editor/.
// `npm run build:site` writes it into the main site's public/editor folder, so
// building and deploying the main site includes the editor. In development the
// site's dev server passes /editor/ on to this one.
// Override the path with EDITOR_BASE if it's deployed somewhere else.
export default defineConfig(() => ({
  base: process.env.EDITOR_BASE ?? '/editor/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
}));

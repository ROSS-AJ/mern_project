// Dev server for the detection test page. No dependencies.
// Serves the web/ folder and strips TypeScript types from .ts files on
// request, so edits to src/engine/detect.ts show up on a page refresh.
//
//   node web/test/serve.mjs        then open http://localhost:5174

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 5174;

const contentTypes = {
   '.html': 'text/html; charset=utf-8',
   '.js': 'text/javascript; charset=utf-8',
   '.mjs': 'text/javascript; charset=utf-8',
   '.ts': 'text/javascript; charset=utf-8',
   '.css': 'text/css; charset=utf-8',
   '.json': 'application/json; charset=utf-8',
   '.svg': 'image/svg+xml',
   '.png': 'image/png',
};

createServer(async (req, res) => {
   let path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
   if (path === '/') path = '/test/index.html';

   const file = resolve(root, '.' + path);
   if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
   }

   try {
      const ext = extname(file);
      let body = await readFile(file);
      if (ext === '.ts') {
         body = stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' });
      }
      res.writeHead(200, {
         'Content-Type': contentTypes[ext] ?? 'application/octet-stream',
         'Cache-Control': 'no-store',
      });
      res.end(body);
   } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') {
         res.writeHead(404).end('Not found');
      } else {
         // Type-stripping errors land here, so show them in the browser.
         console.error(error);
         res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(error));
      }
   }
}).listen(port, '127.0.0.1', () => {
   console.log(`Detection test page: http://localhost:${port}`);
});

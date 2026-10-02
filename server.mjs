// Servidor estático mínimo para la vista previa (sólo loopback).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4400);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const allowed = /^\/(index\.html|css\/[\w.-]+\.css|js\/[\w./-]+\.js)?$/;

http.createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); res.end('Pedido inválido'); return; }
  if (!allowed.test(path) || path.includes('..')) { res.writeHead(404); res.end('No encontrado'); return; }
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('No encontrado');
  }
}).listen(port, '127.0.0.1', () => console.log(`Vista previa en http://127.0.0.1:${port}`));

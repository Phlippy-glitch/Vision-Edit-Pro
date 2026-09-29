import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleAiEdit, type AiEditEnv } from './aiEditHandler';

/**
 * Serves /api/ai-edit from `npm run dev` and `npm run preview`, so AI fill
 * can be tried locally with a key in .env.local (never bundled into the app).
 */
export function aiEditProxy(env: AiEditEnv): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const request = new Request(`http://${req.headers.host}${req.url ?? ''}`, {
        method: req.method,
        headers,
        body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      });
      const response = await handleAiEdit(request, env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error('Local AI proxy failed:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Local AI proxy failed.' }));
    }
  };
  return {
    name: 'ai-edit-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai-edit', (req, res) => void handle(req, res));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai-edit', (req, res) => void handle(req, res));
    },
  };
}

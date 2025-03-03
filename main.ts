import { Hono } from '@hono/hono';
import { logger } from '@hono/hono/logger';

// https://api-inference.huggingface.co/v1
const HF_API_URL = 'https://api-inference.huggingface.co';

const app = new Hono();

app.use(logger());
app.get('/', (c) => c.text('Hello Hono!'));

app.get('/v1/models', (c) =>
  c.json({
    object: 'list',
    data: [],
  }));

app.post('*', async (c) => {
  const { pathname, search } = new URL(c.req.url);
  const targetUrl = `${HF_API_URL}${pathname}${search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete('Authorization');
  headers.get('x-use-cache') || headers.set('x-use-cache', 'false');

  return await fetch(targetUrl, {
    method: 'POST',
    headers: headers,
    body: c.req.raw.body,
  });
});

// Deno.serve({ port: 7860 }, app.fetch);
export default app.fetch;

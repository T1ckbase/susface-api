import { Hono } from '@hono/hono';
import { logger } from '@hono/hono/logger';

// https://api-inference.huggingface.co/v1
const HF_API_URL = 'https://api-inference.huggingface.co';

const app = new Hono();

app.use(logger());
app.get('/', (c) => c.text('Hello Hono!'));

app.post('*', async (c) => {
  const url = new URL(c.req.url);
  const targetPath = url.pathname + url.search;
  const targetUrl = `${HF_API_URL}${targetPath}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete('Authorization');

  return await fetch(targetUrl, {
    method: 'POST',
    headers: headers,
    body: c.req.raw.body,
  });
});

Deno.serve({ port: 7860 }, app.fetch);

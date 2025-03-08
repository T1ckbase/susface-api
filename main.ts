import { Hono } from '@hono/hono';
import { logger } from '@hono/hono/logger';

// https://api-inference.huggingface.co/v1
const HF_API_URL = 'https://api-inference.huggingface.co';
const JINA_API_URL = 'https://deepsearch.jina.ai';

const app = new Hono();

app.use(logger());
app.get('/', (c) => c.text('Hello Hono!'));

// LM Studio
app.get('/v1/models', (c) => {
  return c.json({
    object: 'list',
    data: [
      {
        'id': 'meta-llama/Llama-3.2-11B-Vision-Instruct',
        'object': 'model',
        'type': 'vlm',
        'publisher': 'lmstudio-community',
        'arch': 'llama',
        'compatibility_type': 'gguf',
        'quantization': 'Q4_K_M',
        'state': 'not-loaded',
        'max_context_length': 131072,
      },
    ],
  });
});

app.post('/v1/chat/completions', async (c) => {
  const headers = new Headers(c.req.raw.headers);
  // headers.delete('Host');
  headers.delete('Authorization');
  headers.get('x-use-cache') || headers.set('x-use-cache', 'false');
  console.log('headers:', Object.fromEntries(headers));

  // const clonedRequest = await c.req.raw.clone();
  // const body = await clonedRequest.json();
  // body.max_tokens = 33554432;

  const body = await c.req.json();
  // body.max_tokens = 33554432;
  delete body.max_tokens;

  console.log('body:', body);

  const { pathname, search } = new URL(c.req.url);
  const targetUrl = `${body.model === 'jina-deepsearch-v1' ? JINA_API_URL : HF_API_URL}${pathname}${search}`;
  // console.log(targetUrl);

  return await fetch(targetUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
  });
});

// Deno.serve({ port: 7860 }, app.fetch);
export default app.fetch;

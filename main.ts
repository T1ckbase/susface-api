import { Hono } from '@hono/hono';
import { logger } from '@hono/hono/logger';
import { serveStatic } from '@hono/hono/deno';
import { generateImage as fluxGenerateImage } from './gradio-api/flux.ts';
import { parseResolution } from './utils/string.ts';
import OpenAI from '@openai/openai';
import { encodeBase64 } from '@std/encoding/base64';
import { ensureDir } from '@std/fs';

// https://api-inference.huggingface.co/v1
const HF_API_URL = 'https://api-inference.huggingface.co';
const JINA_API_URL = 'https://deepsearch.jina.ai';

const app = new Hono();

app.use(logger());

app.get('/', (c) => c.text('Hello Hono!'));

app.use('/tmp/*', serveStatic({ root: './' }));

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
  headers.has('x-use-cache') || headers.set('x-use-cache', 'false');
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

app.post('/v1/images/generations', async (c) => {
  const headers = new Headers(c.req.raw.headers);
  headers.delete('Authorization');
  headers.has('x-use-cache') || headers.set('x-use-cache', 'false');
  console.log('headers:', Object.fromEntries(headers));

  const params = await c.req.json<OpenAI.ImageGenerateParams>();
  console.log('request body:', params);

  const targetUrl = `${HF_API_URL}/models/${params.model}`;
  console.log(targetUrl);

  const { width = 1024, height = 1024 } = parseResolution(params.size as string);

  const requestBody: any = {
    inputs: params.prompt,
    parameters: {
      width,
      height,
    },
  };

  headers.has('guidance_scale') && (requestBody.parameters.guidance_scale = parseFloat(headers.get('guidance_scale')!));
  headers.has('negative_prompt') && (requestBody.parameters.negative_prompt = headers.get('negative_prompt'));
  headers.has('num_inference_steps') && (requestBody.parameters.num_inference_steps = parseInt(headers.get('num_inference_steps')!));
  headers.has('scheduler') && (requestBody.parameters.scheduler = headers.get('scheduler'));
  headers.has('seed') && (requestBody.parameters.seed = parseInt(headers.get('seed')!));
  console.log('new body:', requestBody);

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) return response;

  const ext = response.headers.get('content-type')!.substring('image/'.length).toLowerCase();
  const image = await response.arrayBuffer();
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const url = `${headers.get('Host')}/tmp/${fileName}`;

  await ensureDir('/tmp');
  await Deno.writeFile(`/tmp/${fileName}`, new Uint8Array(image), { create: true });

  console.log(url);
  let data: any = {
    url,
  };
  if (params.response_format === 'b64_json') {
    data = {
      b64_json: encodeBase64(image),
    };
  }

  const resposne = {
    created: Math.floor(Date.now() / 1000),
    data: [data],
  };

  return new Response(JSON.stringify(resposne));

  // switch (body.model) {
  //   case 'flux-dev': {
  //     return await fluxGenerateImage(body);
  //   }
  //   default:
  //     return c.text('unknown model', 400);
  // }

  // return c.text('skibidi', 400);
});

// Deno.serve({ port: 7860 }, app.fetch);
export default app.fetch;

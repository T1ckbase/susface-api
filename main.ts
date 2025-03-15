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

// In-memory storage for images
const imageCache = new Map<string, { data: Uint8Array; contentType: string }>();

// Modified route to serve from in-memory cache instead of filesystem
app.get('/tmp/:id', async (c) => {
  const id = c.req.param('id');
  const cachedImage = imageCache.get(id);

  if (!cachedImage) {
    return c.text('Image not found', 404);
  }

  return new Response(cachedImage.data, {
    headers: {
      'Content-Type': cachedImage.contentType,
    },
  });
});

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

  if (headers.has('guidance_scale')) {
    requestBody.parameters.guidance_scale = parseFloat(headers.get('guidance_scale')!);
    headers.delete('guidance_scale');
  }
  if (headers.has('negative_prompt')) {
    requestBody.parameters.negative_prompt = headers.get('negative_prompt');
    headers.delete('negative_prompt');
  }
  if (headers.has('num_inference_steps')) {
    requestBody.parameters.num_inference_steps = parseInt(headers.get('num_inference_steps')!);
    headers.delete('num_inference_steps');
  }
  if (headers.has('scheduler')) {
    requestBody.parameters.scheduler = headers.get('scheduler');
    headers.delete('scheduler');
  }
  if (headers.has('seed')) {
    requestBody.parameters.seed = parseInt(headers.get('seed')!);
    headers.delete('seed');
  }
  console.log('new body:', requestBody);

  // Determine how many images to generate (default to 1)
  const numImages = params.n || 1;

  // Create an array of promises for parallel execution
  const imagePromises = Array.from({ length: numImages }, async (_, i) => {
    // Clone the request body to avoid race conditions
    const currentRequestBody = structuredClone(requestBody);

    // If a seed was provided, increment it for each image to ensure variety
    if (currentRequestBody.parameters.seed !== undefined && i > 0) {
      currentRequestBody.parameters.seed += i; // Add index to ensure unique seeds
    }

    // Create a copy of headers for each request
    const currentHeaders = new Headers(headers);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: currentHeaders,
        body: JSON.stringify(currentRequestBody),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
      }

      const contentType = response.headers.get('content-type')!;
      const imageArrayBuffer = await response.arrayBuffer();
      const imageData = new Uint8Array(imageArrayBuffer);

      // Generate a unique ID without the file extension
      const fileId = crypto.randomUUID();

      // Store in our in-memory cache instead of writing to disk
      imageCache.set(fileId, {
        data: imageData,
        contentType: contentType,
      });

      const host = headers.get('Host') || c.req.header('Host');
      const url = `${host}/tmp/${fileId}`;

      console.log(`Generated image ${i + 1}/${numImages}: ${url}`);

      // Create the appropriate data format based on the response_format
      if (params.response_format === 'b64_json') {
        return {
          b64_json: encodeBase64(imageArrayBuffer),
        };
      } else {
        return {
          url,
        };
      }
    } catch (error) {
      console.error(`Error generating image ${i + 1}:`, error);
      throw error;
    }
  });

  try {
    // Wait for all image generation promises to complete
    const imageResults = await Promise.all(imagePromises);

    const responseBody = {
      created: Math.floor(Date.now() / 1000),
      data: imageResults,
    };

    return c.json(responseBody);
  } catch (error) {
    console.error('Error in parallel image generation:', error);
    return c.json({ error: 'Failed to generate one or more images' }, 500);
  }

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

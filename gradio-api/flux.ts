import OpenAI from '@openai/openai';
import { parseResolution } from '../utils/string.ts';
import { encodeBase64 } from '@std/encoding';

type FluxParameters = [
  prompt: string,
  seed: number,
  randomizeSeed: boolean,
  width: number,
  height: number,
  guidanceScale: number,
  numberOfInferenceSteps: number,
];

export async function generateImage(params: OpenAI.ImageGenerateParams): Promise<Response> {
  const { width = 1024, height = 1024 } = parseResolution(params.size as string);
  const sessionHash = Math.random().toString(36).substring(2);
  const response = await fetch('https://black-forest-labs-flux-1-dev.hf.space/gradio_api/queue/join', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      data: [
        params.prompt,
        0,
        true,
        width,
        height,
        3.5,
        28,
      ] as FluxParameters,
      fn_index: 2,
      session_hash: sessionHash,
    }),
  });
  if (!response.ok) return response;
  const eventId = (await response.json()).event_id;

  const url: string = await new Promise((resolve, reject) => {
    const eventSource = new EventSource(`https://black-forest-labs-flux-1-dev.hf.space/gradio_api/queue/data?session_hash=${sessionHash}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (eventId !== data.event_id) return;
      if (data.msg === 'process_completed') {
        try {
          const url: string = data.output.data[0].url;
          eventSource.close();
          resolve(url);
        } catch (e) {
          reject(e);
        }
      }
      if (data.msg === 'close_stream') reject('close_stream');
    };

    eventSource.onerror = (event) => {
      eventSource.close();
      reject(event);
    };
  });

  let data: any = {
    url,
  };
  if (params.response_format === 'b64_json') {
    const response = await fetch(url);
    const image = await response.arrayBuffer();
    data = {
      b64_json: encodeBase64(image),
    };
  }

  const resposne = {
    created: Math.floor(Date.now() / 1000),
    data: [data],
  };

  return new Response(JSON.stringify(resposne));
}

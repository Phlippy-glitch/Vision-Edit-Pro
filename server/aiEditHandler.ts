/**
 * AI fill proxy. Keeps the OpenAI key on the server: phones send the photo
 * crop, mask and request here; this forwards them to OpenAI's image edit
 * endpoint and returns the generated image.
 *
 * Written against the web-standard Request/Response API so the same code
 * runs as a Vercel function (api/ai-edit.ts) and in the Vite dev server.
 */

export interface AiEditEnv {
  OPENAI_API_KEY?: string;
  /** Override for testing or an OpenAI-compatible gateway. */
  OPENAI_BASE_URL?: string;
  OPENAI_IMAGE_MODEL?: string;
  OPENAI_IMAGE_QUALITY?: string;
  /** If set, requests must send this in the x-access-code header. */
  APP_ACCESS_CODE?: string;
  /** Comma-separated extra origins allowed to call the proxy (e.g. the native app). */
  ALLOWED_ORIGINS?: string;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_PROMPT_LENGTH = 800;
export const ALLOWED_SIZES = ['1024x1024', '1536x1024', '1024x1536'] as const;
const DEFAULT_MODEL = 'gpt-image-1';
const DEFAULT_QUALITY = 'medium';
const UPSTREAM_TIMEOUT_MS = 110_000;

/** Origins of the Capacitor native shells, allowed by default. */
const NATIVE_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
}

function corsHeaders(request: Request, env: AiEditEnv): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  const allowed = new Set([
    ...NATIVE_ORIGINS,
    ...(env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  ]);
  const sameOrigin = origin === new URL(request.url).origin;
  if (!sameOrigin && !allowed.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-access-code',
    vary: 'origin',
  };
}

/** Constant-time comparison so the access code can't be guessed by timing. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Frames the landscaper's request so results stay photographic and in place. */
export function buildPrompt(request: string): string {
  return [
    'Photorealistic edit of a photo of a residential property, for a landscaping proposal.',
    `In the masked area only: ${request.trim()}.`,
    'Match the existing sunlight direction, shadows, perspective, camera angle, scale and photo quality.',
    'Plants and materials should look real and appropriately sized. Do not add text, people or animals.',
  ].join(' ');
}

function upstreamError(status: number, message: string): { status: number; error: string } {
  if (status === 400 && /safety|policy|moderation/i.test(message)) {
    return { status: 422, error: 'The AI service declined this request. Try rewording it.' };
  }
  if (status === 401 || status === 403) return { status: 502, error: 'The AI service rejected the server key. Check OPENAI_API_KEY.' };
  if (status === 429) return { status: 429, error: 'The AI service is busy or the account limit was reached. Try again shortly.' };
  if (status === 400) return { status: 400, error: `The AI service could not use this image: ${message}` };
  return { status: 502, error: 'The AI service had a problem. Please try again.' };
}

export async function handleAiEdit(request: Request, env: AiEditEnv, fetchImpl: FetchLike = fetch): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Use POST.' }, cors);

  if (!env.OPENAI_API_KEY) {
    return json(503, { error: 'AI fill is not set up on the server yet (OPENAI_API_KEY is missing).', code: 'not_configured' }, cors);
  }
  if (env.APP_ACCESS_CODE && !safeEqual(request.headers.get('x-access-code') ?? '', env.APP_ACCESS_CODE)) {
    return json(401, { error: 'Enter the correct AI access code in the AI fill settings.', code: 'access_code' }, cors);
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_UPLOAD_BYTES * 2 + 100_000) return json(413, { error: 'Upload is too large.' }, cors);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: 'Expected a multipart form upload.' }, cors);
  }
  const image = form.get('image');
  const mask = form.get('mask');
  const prompt = form.get('prompt');
  const size = form.get('size');
  if (!(image instanceof Blob) || !(mask instanceof Blob)) return json(400, { error: 'Image and mask are required.' }, cors);
  if (image.size > MAX_UPLOAD_BYTES || mask.size > MAX_UPLOAD_BYTES) return json(413, { error: 'Image is too large.' }, cors);
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) {
    return json(400, { error: `Describe the change in 1–${MAX_PROMPT_LENGTH} characters.` }, cors);
  }
  if (typeof size !== 'string' || !(ALLOWED_SIZES as readonly string[]).includes(size)) {
    return json(400, { error: 'Unsupported image size.' }, cors);
  }

  const upstream = new FormData();
  upstream.set('model', env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL);
  upstream.set('image', image, 'image.png');
  upstream.set('mask', mask, 'mask.png');
  upstream.set('prompt', buildPrompt(prompt));
  upstream.set('size', size);
  upstream.set('quality', env.OPENAI_IMAGE_QUALITY || DEFAULT_QUALITY);
  upstream.set('n', '1');

  let response: Response;
  try {
    response = await fetchImpl(`${(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/images/edits`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: upstream,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('OpenAI request failed:', error);
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return json(504, { error: 'The AI service did not respond in time. Please try again.' }, cors);
    }
    return json(502, { error: 'The server could not reach the AI service. Please try again shortly.' }, cors);
  }

  const body = (await response.json().catch(() => null)) as
    | { data?: { b64_json?: string }[]; error?: { message?: string } }
    | null;
  if (!response.ok) {
    const message = body?.error?.message ?? `HTTP ${response.status}`;
    console.error('OpenAI image edit error:', response.status, message);
    const mapped = upstreamError(response.status, message);
    return json(mapped.status, { error: mapped.error }, cors);
  }
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) return json(502, { error: 'The AI service returned no image.' }, cors);
  return json(200, { image: b64 }, cors);
}

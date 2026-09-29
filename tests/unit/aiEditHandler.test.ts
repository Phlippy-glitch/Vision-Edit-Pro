import { describe, expect, it } from 'vitest';
import { buildPrompt, handleAiEdit, type AiEditEnv } from '../../server/aiEditHandler';

const ENV: AiEditEnv = { OPENAI_API_KEY: 'sk-test', APP_ACCESS_CODE: 'green123' };
const URL_ = 'https://app.example.com/api/ai-edit';

function form(overrides: Record<string, string | Blob | null> = {}): FormData {
  const f = new FormData();
  const fields: Record<string, string | Blob | null> = {
    image: new Blob([new Uint8Array(10)], { type: 'image/png' }),
    mask: new Blob([new Uint8Array(10)], { type: 'image/png' }),
    prompt: 'xeriscape with gravel and agave',
    size: '1024x1024',
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== null) f.set(k, v);
  return f;
}

function post(body: FormData, headers: Record<string, string> = { 'x-access-code': 'green123' }): Request {
  return new Request(URL_, { method: 'POST', body, headers });
}

/** Fake OpenAI that records what it was sent. */
function fakeOpenAi(response: { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response.body), { status: response.status });
  };
  return { impl, calls };
}

describe('handleAiEdit', () => {
  it('forwards a valid request to OpenAI and returns the image', async () => {
    const openai = fakeOpenAi({ status: 200, body: { data: [{ b64_json: 'QUJD' }] } });
    const res = await handleAiEdit(post(form()), ENV, openai.impl);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ image: 'QUJD' });
    const { url, init } = openai.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const sent = init.body as FormData;
    expect(sent.get('model')).toBe('gpt-image-1');
    expect(sent.get('size')).toBe('1024x1024');
    expect(sent.get('mask')).toBeInstanceOf(Blob);
    expect(String(sent.get('prompt'))).toContain('xeriscape with gravel and agave');
  });

  it('never exposes the API key in responses', async () => {
    const openai = fakeOpenAi({ status: 401, body: { error: { message: 'Incorrect API key sk-test' } } });
    const res = await handleAiEdit(post(form()), ENV, openai.impl);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('sk-test');
  });

  it('requires the access code when one is configured', async () => {
    const openai = fakeOpenAi({ status: 200, body: {} });
    const res = await handleAiEdit(post(form(), { 'x-access-code': 'wrong' }), ENV, openai.impl);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('access_code');
    expect(openai.calls).toHaveLength(0);
  });

  it('reports when the server has no key', async () => {
    const res = await handleAiEdit(post(form()), {}, fakeOpenAi({ status: 200, body: {} }).impl);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('not_configured');
  });

  it.each([
    ['missing mask', { mask: null }],
    ['empty prompt', { prompt: '  ' }],
    ['overlong prompt', { prompt: 'x'.repeat(801) }],
    ['bad size', { size: '4096x4096' }],
  ])('rejects %s', async (_label, overrides) => {
    const openai = fakeOpenAi({ status: 200, body: {} });
    const res = await handleAiEdit(post(form(overrides)), ENV, openai.impl);
    expect(res.status).toBe(400);
    expect(openai.calls).toHaveLength(0);
  });

  it('rejects oversized images', async () => {
    const big = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' });
    const res = await handleAiEdit(post(form({ image: big })), ENV, fakeOpenAi({ status: 200, body: {} }).impl);
    expect(res.status).toBe(413);
  });

  it('maps a content-policy refusal to a friendly message', async () => {
    const openai = fakeOpenAi({ status: 400, body: { error: { message: 'Rejected by the safety system' } } });
    const res = await handleAiEdit(post(form()), ENV, openai.impl);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/declined/);
  });

  it('allows CORS for the native app but not arbitrary sites', async () => {
    const preflight = (origin: string) =>
      handleAiEdit(new Request(URL_, { method: 'OPTIONS', headers: { origin } }), ENV, fakeOpenAi({ status: 200, body: {} }).impl);
    expect((await preflight('capacitor://localhost')).headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect((await preflight('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('uses the configured model and base URL', async () => {
    const openai = fakeOpenAi({ status: 200, body: { data: [{ b64_json: 'QQ==' }] } });
    await handleAiEdit(post(form()), { ...ENV, OPENAI_BASE_URL: 'http://mock:9/v1/', OPENAI_IMAGE_MODEL: 'gpt-image-2' }, openai.impl);
    expect(openai.calls[0].url).toBe('http://mock:9/v1/images/edits');
    expect((openai.calls[0].init.body as FormData).get('model')).toBe('gpt-image-2');
  });

  it('distinguishes an unreachable AI service from a timeout', async () => {
    const unreachable = async () => {
      throw new TypeError('fetch failed');
    };
    const timedOut = async () => {
      throw new DOMException('timed out', 'TimeoutError');
    };
    const a = await handleAiEdit(post(form()), ENV, unreachable);
    const b = await handleAiEdit(post(form()), ENV, timedOut);
    expect([a.status, (await a.json()).error]).toEqual([502, expect.stringMatching(/could not reach/)]);
    expect([b.status, (await b.json()).error]).toEqual([504, expect.stringMatching(/in time/)]);
  });

  it('frames the prompt to keep edits photographic and in place', () => {
    expect(buildPrompt('lush lawn')).toMatch(/masked area only: lush lawn\./);
  });
});

import { handleAiEdit } from '../server/aiEditHandler';

// Vercel Function (web-standard handler). Configure OPENAI_API_KEY and
// APP_ACCESS_CODE under Project → Settings → Environment Variables.
export function POST(request: Request): Promise<Response> {
  return handleAiEdit(request, process.env);
}

export function OPTIONS(request: Request): Promise<Response> {
  return handleAiEdit(request, process.env);
}

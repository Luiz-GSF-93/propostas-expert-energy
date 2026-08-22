import { createClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

type AuthOk = { ok: true; token: string; user: User };
type AuthFail = { ok: false; response: NextResponse };

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const chunk of cookieHeader.split(';')) {
    const idx = chunk.indexOf('=');
    if (idx <= 0) continue;
    const key = chunk.slice(0, idx).trim();
    const value = chunk.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function extractTokenFromPossibleSession(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);

    try {
      const parsed = JSON.parse(decoded);

      if (typeof parsed?.access_token === 'string') return parsed.access_token;
      if (typeof parsed?.currentSession?.access_token === 'string') return parsed.currentSession.access_token;

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string' && item.split('.').length === 3) return item;
          if (typeof item?.access_token === 'string') return item.access_token;
          if (typeof item?.currentSession?.access_token === 'string') return item.currentSession.access_token;
        }
      }
    } catch (_) {}

    const match = decoded.match(/"access_token":"([^"]+)"/);
    if (match?.[1]) return match[1];

    if (decoded.split('.').length === 3) return decoded;
  } catch (_) {}

  return null;
}

function extractTokenFromCookies(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookieHeader(cookieHeader);

  for (const [key, value] of Object.entries(cookies)) {
    if (
      key.includes('auth-token') ||
      key.includes('access-token') ||
      key.includes('supabase')
    ) {
      const token = extractTokenFromPossibleSession(value);
      if (token) return token;
    }
  }

  return null;
}

export async function requirePrivateHtmlUser(request: Request): Promise<AuthOk | AuthFail> {
  const token = extractBearerToken(request) || extractTokenFromCookies(request);

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Usuário não autenticado.' },
        { status: 401 }
      )
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Variáveis de autenticação não configuradas.' },
        { status: 500 }
      )
    };
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Sessão inválida ou expirada.' },
        { status: 401 }
      )
    };
  }

  return { ok: true, token, user: data.user };
}

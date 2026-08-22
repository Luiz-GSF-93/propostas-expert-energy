import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export type ApiAuthUser = {
  id: string;
  email: string | null;
};

export type ApiAuthResult = {
  user: ApiAuthUser | null;
  response: NextResponse | null;
};

function extractBearerToken(request: Request): string | null {
  const authHeader =
    request.headers.get('authorization') ||
    request.headers.get('Authorization');

  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function requireApiUser(request: Request): Promise<ApiAuthResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        user: null,
        response: NextResponse.json(
          { message: 'Variáveis de autenticação do Supabase não configuradas.' },
          { status: 500 }
        ),
      };
    }

    const token = extractBearerToken(request);

    if (!token) {
      return {
        user: null,
        response: NextResponse.json(
          { message: 'Usuário não autenticado.' },
          { status: 401 }
        ),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return {
        user: null,
        response: NextResponse.json(
          { message: 'Sessão inválida ou expirada.' },
          { status: 401 }
        ),
      };
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? null,
      },
      response: null,
    };
  } catch (error) {
    console.error('[requireApiUser] erro:', error);
    return {
      user: null,
      response: NextResponse.json(
        { message: 'Falha ao validar autenticação.' },
        { status: 500 }
      ),
    };
  }
}

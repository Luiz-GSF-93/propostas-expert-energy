import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requirePrivateHtmlUser } from '@/lib/auth/require-private-html-user';
import {
  extractDiagnosticIdFromSources,
  logHtmlAuditEvent,
} from '@/lib/audit/html-private-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePrivateHtmlUser(request);
  if (!auth.ok) return auth.response;

  const diagnosticId = extractDiagnosticIdFromSources(
    new URL(request.url).searchParams.get('diagnosticId'),
    request.headers.get('referer'),
    request.url
  );

  await logHtmlAuditEvent({
    request,
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
    },
    action: 'visualizou_html_privado',
    diagnosticId,
    metadata: {
      source: 'api_energiapro_html',
    },
  });

  const filePath = path.join(process.cwd(), 'private-templates', 'energiapro', 'index.html');
  let html = await readFile(filePath, 'utf-8');

  html = html.replace(/\/energiapro\/index\.html/g, '/energiapro/index.html');

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Robots-Tag': 'noindex, noarchive, nosnippet, noimageindex',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
    },
  });
}

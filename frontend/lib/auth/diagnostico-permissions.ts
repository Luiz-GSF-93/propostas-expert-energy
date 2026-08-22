import type { ApiAuthUser } from '@/lib/auth/require-api-user';

export type DiagnosticWorkflowStatus =
  | 'rascunho'
  | 'em_revisao'
  | 'revisado'
  | 'aprovado'
  | 'arquivado';

function parseEmailList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function getDiagnosticRole(user: ApiAuthUser | null): 'admin' | 'reviewer' | 'user' {
  const email = normalizeEmail(user?.email);

  const adminEmails = parseEmailList(process.env.DIAGNOSTICO_ADMIN_EMAILS);
  const reviewerEmails = parseEmailList(process.env.DIAGNOSTICO_REVIEWER_EMAILS);

  if (email && adminEmails.has(email)) {
    return 'admin';
  }

  if (email && (reviewerEmails.has(email) || adminEmails.has(email))) {
    return 'reviewer';
  }

  return 'user';
}

export function canChangeDiagnosticStatus(
  user: ApiAuthUser | null,
  nextStatus: DiagnosticWorkflowStatus
): boolean {
  const role = getDiagnosticRole(user);

  if (nextStatus === 'rascunho' || nextStatus === 'em_revisao') {
    return role === 'user' || role === 'reviewer' || role === 'admin';
  }

  if (nextStatus === 'revisado') {
    return role === 'reviewer' || role === 'admin';
  }

  if (nextStatus === 'aprovado' || nextStatus === 'arquivado') {
    return role === 'admin';
  }

  return false;
}

export function diagnosticPermissionMessage(nextStatus: string): string {
  return `Sem permissão para alterar status para '${nextStatus}'.`;
}

export const DB_STATUS_VALUES = [
  'rascunho',
  'em_revisao',
  'revisado',
  'aprovado',
  'arquivado',
] as const;

export type DbStatus = (typeof DB_STATUS_VALUES)[number];

export function isDbStatus(value: unknown): value is DbStatus {
  return typeof value === 'string' && DB_STATUS_VALUES.includes(value as DbStatus);
}

export function invalidStatusMessage(): string {
  return `Status inválido. Use apenas: ${DB_STATUS_VALUES.join(', ')}.`;
}

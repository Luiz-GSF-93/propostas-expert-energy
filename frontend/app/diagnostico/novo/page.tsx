'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestEnergiaExport } from '@/lib/diagnostico-bridge';
import { createDiagnosticApi } from '@/lib/diagnostico-api';

type DbStatus =
  | 'rascunho'
  | 'em_revisao'
  | 'revisado'
  | 'aprovado'
  | 'arquivado';

type CreatedDiagnosticResponse = {
  id?: string;
  code?: string;
  data?: {
    id?: string;
    code?: string;
  };
  diagnostic?: {
    id?: string;
    code?: string;
  };
  record?: {
    id?: string;
    code?: string;
  };
};

const STATUS_OPTIONS: Array<{ value: DbStatus; label: string }> = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'em_revisao', label: 'Em revisão' },
  { value: 'revisado', label: 'Revisado' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'arquivado', label: 'Arquivado' },
];

export default function NovoDiagnosticoPage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(
    'HTML real do EnergiaPro carregado.'
  );
  const [status, setStatus] = useState<DbStatus>('rascunho');

  async function handleSave(nextStatus: DbStatus) {
    try {
      setSaving(true);
      setMessage('Exportando dados do EnergiaPro...');

      const payload = await requestEnergiaExport(iframeRef.current);

      setMessage('Salvando diagnóstico no Supabase...');

      const saved = (await createDiagnosticApi({
        payload,
        status: nextStatus,
        note: `Criação do diagnóstico com status ${nextStatus}`,
      })) as CreatedDiagnosticResponse;

      const savedId =
        saved?.id ??
        saved?.data?.id ??
        saved?.diagnostic?.id ??
        saved?.record?.id;

      const savedCode =
        saved?.code ??
        saved?.data?.code ??
        saved?.diagnostic?.code ??
        saved?.record?.code;

      if (!savedId) {
        throw new Error(
          'O diagnóstico foi salvo, mas a API não retornou o ID para redirecionamento.'
        );
      }

      setMessage(
        `Diagnóstico ${savedCode || savedId} salvo com sucesso no Supabase.`
      );

      router.push(`/diagnostico/${savedId}`);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Falha ao salvar diagnóstico.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                Diagnóstico EnergiaPro
              </p>

              <h1 className="mt-2 text-3xl font-bold">Novo diagnóstico</h1>

              <p className="mt-2 text-sm text-emerald-50">
                Persistência principal via Supabase, sem depender de localStorage.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20"
              >
                Voltar ao dashboard
              </Link>

              <Link
                href="/diagnostico"
                className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20"
              >
                Lista de diagnósticos
              </Link>

              <a
                href="/energiapro/index.html"
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow transition hover:bg-emerald-50"
              >
                Abrir HTML puro
              </a>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[260px_1fr_auto_auto] lg:items-center">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DbStatus)}
              className="w-full rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>

            <button
              onClick={() => handleSave(status)}
              disabled={saving}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar diagnóstico'}
            </button>

            <button
              onClick={() => handleSave('em_revisao')}
              disabled={saving}
              className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Aguarde...' : 'Salvar e enviar para revisão'}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <iframe
            ref={iframeRef}
            src="/energiapro/index.html"
            title="EnergiaPro"
            className="h-[85vh] w-full"
          />
        </div>
      </div>
    </main>
  );
}

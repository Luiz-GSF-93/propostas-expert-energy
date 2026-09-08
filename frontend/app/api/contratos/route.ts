import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase não configurado" }, { status: 500 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("contracts")
      .select("*, clients (*), contract_services (*, recurring_services (*)), contract_licenses (*), contract_acl_units (*)")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data || [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase não configurado" }, { status: 500 });
    const body = await req.json().catch(() => ({}));

    let clienteId = body.cliente_id;
    if (!clienteId && body.cliente) {
      const cnpjLimpo = String(body.cliente.cnpj || "").trim();
      const razaoLimpa = String(body.cliente.razao_social || "").trim();

      let existingClient = null;
      if (cnpjLimpo) {
        const { data: byCnpj } = await supabase.from("clients").select("id").eq("cnpj", cnpjLimpo).maybeSingle();
        existingClient = byCnpj;
      }

      if (!existingClient && razaoLimpa) {
        const { data: byRazao } = await supabase.from("clients").select("id").eq("razao_social", razaoLimpa).maybeSingle();
        existingClient = byRazao;
      }

      if (existingClient?.id) {
        clienteId = existingClient.id;
        await supabase.from("clients").update({
          email: body.cliente.email || undefined,
          telefone: body.cliente.telefone || undefined,
          updated_at: new Date().toISOString()
        }).eq("id", clienteId);
      } else {
        const { data: clientData, error: clientErr } = await supabase
          .from("clients")
          .insert({
            razao_social: razaoLimpa || "Empresa sem Razão Social",
            nome_fantasia: body.cliente.nome_fantasia || "",
            cnpj: cnpjLimpo || null,
            email: body.cliente.email || "",
            telefone: body.cliente.telefone || "",
            endereco: body.cliente.endereco || {},
            responsaveis: body.cliente.responsaveis || [],
            dados_financeiros: body.cliente.dados_financeiros || {},
            unidades_consumidoras: body.cliente.unidades_consumidoras || [],
          })
          .select().single();

        if (clientErr) return NextResponse.json({ ok: false, error: "Erro ao cadastrar cliente: " + clientErr.message }, { status: 500 });
        clienteId = clientData.id;
      }
    }

    if (!clienteId) return NextResponse.json({ ok: false, error: "Cliente não informado" }, { status: 400 });

    const { data: contractData, error: contractErr } = await supabase
      .from("contracts")
      .insert({
        cliente_id: clienteId,
        data_inicio: body.data_inicio || new Date().toISOString().split("T")[0],
        data_fim: body.data_fim,
        vigencia_meses: Number(body.vigencia_meses || 12),
        valor_mensal: Number(body.valor_mensal || 0),
        dia_vencimento: Number(body.dia_vencimento || 10),
        renovacao_automatica: body.renovacao_automatica !== false,
        indice_reajuste: body.indice_reajuste || "IPCA",
        sla_horas: Number(body.sla_horas || 24),
        status: body.status || "ativo",
        observacoes: body.observacoes || "",
      })
      .select().single();

    if (contractErr) return NextResponse.json({ ok: false, error: "Erro ao criar contrato: " + contractErr.message }, { status: 500 });

    const contratoId = contractData.id;

    if (body.licenca_energy_link) {
      const l = body.licenca_energy_link;
      const tipo = l.tipo_licenca || l.tipo || "starter";
      const pontosList = l.pontos_medicao || l.pontos || [];
      const limite = Number(l.limite_medicoes || l.limite || (tipo === "telemedicao_professional" ? 30 : tipo === "telemedicao_enterprise" ? 100 : 10));

      await supabase.from("contract_licenses").insert({
        contrato_id: contratoId,
        tipo_licenca: tipo,
        limite_medicoes: limite,
        usuarios_permitidos: Number(l.usuarios_permitidos || l.usuarios || 5),
        pontos_medicao: pontosList,
        ativo: true,
      });
    }

    return NextResponse.json({ ok: true, data: contractData }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

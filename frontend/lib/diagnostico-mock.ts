export type DiagnosticStatus =
  | "rascunho"
  | "em_revisao"
  | "revisado"
  | "aprovado"
  | "arquivado";

export type DiagnosticTimelineItem = {
  id: string;
  date: string;
  actor: string;
  action: string;
  notes: string;
};

export type DiagnosticRecord = {
  id: string;
  code: string;
  title: string;
  companyName: string;
  consultantName: string;
  unitName: string;
  status: DiagnosticStatus;
  version: string;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  demandKw: number;
  monthlyConsumptionKwh: number;
  estimatedSavingsValue: number;
  estimatedSavingsPercent: number;
  paybackMonths: number;
  summary: string;
  nextStep: string;
  history: DiagnosticTimelineItem[];
};

export const diagnosticsMock: DiagnosticRecord[] = [
  {
    id: "dg-2026-0001",
    code: "DG-2026-0001",
    title: "Diagnóstico tarifário e eficiência operacional",
    companyName: "Metalúrgica Horizonte Ltda",
    consultantName: "Luiz Silva",
    unitName: "Unidade Betim/MG",
    status: "em_revisao",
    version: "v1.2",
    createdAt: "2026-08-10T09:15:00Z",
    updatedAt: "2026-08-20T14:30:00Z",
    reviewedBy: "Ana Paula Costa",
    demandKw: 850,
    monthlyConsumptionKwh: 214500,
    estimatedSavingsValue: 48250,
    estimatedSavingsPercent: 12.8,
    paybackMonths: 14,
    summary:
      "Cenário com oportunidade relevante de redução por readequação tarifária, ajustes de demanda contratada e monitoramento contínuo.",
    nextStep: "Aguardar validação técnica final e emissão da versão revisada.",
    history: [
      {
        id: "h1",
        date: "2026-08-10T09:15:00Z",
        actor: "Luiz Silva",
        action: "Criação do diagnóstico",
        notes: "Rascunho inicial criado com dados de consumo e demanda.",
      },
      {
        id: "h2",
        date: "2026-08-14T11:40:00Z",
        actor: "Luiz Silva",
        action: "Atualização de premissas",
        notes: "Incluída simulação de migração tarifária e revisão de demanda.",
      },
      {
        id: "h3",
        date: "2026-08-20T14:30:00Z",
        actor: "Ana Paula Costa",
        action: "Envio para revisão",
        notes: "Diagnóstico encaminhado para validação técnica e comercial.",
      },
    ],
  },
  {
    id: "dg-2026-0002",
    code: "DG-2026-0002",
    title: "Diagnóstico de consumo e enquadramento tarifário",
    companyName: "Supermercados Vale Verde",
    consultantName: "Marcos Oliveira",
    unitName: "Centro de distribuição Goiânia/GO",
    status: "aprovado",
    version: "v2.0",
    createdAt: "2026-07-22T08:00:00Z",
    updatedAt: "2026-08-18T16:10:00Z",
    reviewedBy: "Paulo Mendes",
    demandKw: 520,
    monthlyConsumptionKwh: 132000,
    estimatedSavingsValue: 27600,
    estimatedSavingsPercent: 9.4,
    paybackMonths: 11,
    summary:
      "Diagnóstico aprovado com economia potencial por correção de modalidade tarifária e controle de ponta.",
    nextStep: "Encaminhar proposta comercial vinculada ao diagnóstico aprovado.",
    history: [
      {
        id: "h1",
        date: "2026-07-22T08:00:00Z",
        actor: "Marcos Oliveira",
        action: "Criação do diagnóstico",
        notes: "Cadastro inicial concluído.",
      },
      {
        id: "h2",
        date: "2026-08-01T10:20:00Z",
        actor: "Paulo Mendes",
        action: "Revisão concluída",
        notes: "Ajustes técnicos aprovados pela coordenação.",
      },
      {
        id: "h3",
        date: "2026-08-18T16:10:00Z",
        actor: "Paulo Mendes",
        action: "Diagnóstico aprovado",
        notes: "Liberado para fase comercial.",
      },
    ],
  },
  {
    id: "dg-2026-0003",
    code: "DG-2026-0003",
    title: "Diagnóstico preliminar de eficiência energética",
    companyName: "Frigorífico São Jorge",
    consultantName: "Luiz Silva",
    unitName: "Planta Uberaba/MG",
    status: "rascunho",
    version: "v0.4",
    createdAt: "2026-08-19T13:00:00Z",
    updatedAt: "2026-08-21T09:05:00Z",
    demandKw: 1180,
    monthlyConsumptionKwh: 340800,
    estimatedSavingsValue: 0,
    estimatedSavingsPercent: 0,
    paybackMonths: 0,
    summary:
      "Diagnóstico em estruturação inicial, aguardando consolidação dos dados de ponta, fora de ponta e fator de carga.",
    nextStep: "Completar dados de medição e fechar cenário-base.",
    history: [
      {
        id: "h1",
        date: "2026-08-19T13:00:00Z",
        actor: "Luiz Silva",
        action: "Criação do rascunho",
        notes: "Estrutura inicial criada.",
      },
      {
        id: "h2",
        date: "2026-08-21T09:05:00Z",
        actor: "Luiz Silva",
        action: "Atualização parcial",
        notes: "Incluídos dados preliminares de consumo mensal.",
      },
    ],
  },
  {
    id: "dg-2026-0004",
    code: "DG-2026-0004",
    title: "Diagnóstico consolidado para revisão executiva",
    companyName: "Têxtil Aurora",
    consultantName: "Camila Rocha",
    unitName: "Unidade Joinville/SC",
    status: "revisado",
    version: "v1.8",
    createdAt: "2026-08-03T15:30:00Z",
    updatedAt: "2026-08-20T18:20:00Z",
    reviewedBy: "Rafael Moreira",
    demandKw: 690,
    monthlyConsumptionKwh: 185200,
    estimatedSavingsValue: 31890,
    estimatedSavingsPercent: 10.6,
    paybackMonths: 13,
    summary:
      "Diagnóstico revisado tecnicamente com ganhos previstos em correção de demanda e ajuste operacional.",
    nextStep: "Submeter para aprovação final da liderança comercial.",
    history: [
      {
        id: "h1",
        date: "2026-08-03T15:30:00Z",
        actor: "Camila Rocha",
        action: "Criação do diagnóstico",
        notes: "Versão inicial cadastrada.",
      },
      {
        id: "h2",
        date: "2026-08-12T17:00:00Z",
        actor: "Rafael Moreira",
        action: "Revisão técnica",
        notes: "Validadas premissas de consumo e savings.",
      },
      {
        id: "h3",
        date: "2026-08-20T18:20:00Z",
        actor: "Rafael Moreira",
        action: "Status atualizado para revisado",
        notes: "Pronto para aprovação executiva.",
      },
    ],
  },
];

export function getDiagnosticStatusLabel(status: DiagnosticStatus) {
  switch (status) {
    case "rascunho":
      return "Rascunho";
    case "em_revisao":
      return "Em revisão";
    case "revisado":
      return "Revisado";
    case "aprovado":
      return "Aprovado";
    case "arquivado":
      return "Arquivado";
    default:
      return status;
  }
}

export function getDiagnosticStatusClassName(status: DiagnosticStatus) {
  switch (status) {
    case "rascunho":
      return "bg-slate-100 text-slate-700";
    case "em_revisao":
      return "bg-amber-100 text-amber-700";
    case "revisado":
      return "bg-blue-100 text-blue-700";
    case "aprovado":
      return "bg-emerald-100 text-emerald-700";
    case "arquivado":
      return "bg-zinc-200 text-zinc-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function formatDiagnosticDate(value: string) {
  try {
    return new Date(value).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export function formatDiagnosticCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDiagnosticPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export function getDiagnosticsSummary() {
  return diagnosticsMock.reduce(
    (acc, item) => {
      acc.total += 1;
      acc.totalSavings += item.estimatedSavingsValue;

      if (item.status === "rascunho") acc.draft += 1;
      if (item.status === "em_revisao") acc.inReview += 1;
      if (item.status === "revisado") acc.reviewed += 1;
      if (item.status === "aprovado") acc.approved += 1;
      if (item.status === "arquivado") acc.archived += 1;

      return acc;
    },
    {
      total: 0,
      draft: 0,
      inReview: 0,
      reviewed: 0,
      approved: 0,
      archived: 0,
      totalSavings: 0,
    }
  );
}

export function findDiagnosticById(id: string) {
  const normalized = String(id || "").trim().toLowerCase();

  return (
    diagnosticsMock.find(
      (item) =>
        item.id.toLowerCase() === normalized ||
        item.code.toLowerCase() === normalized
    ) || null
  );
}

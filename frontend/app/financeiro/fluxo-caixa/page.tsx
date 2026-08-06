"use client";

import FinanceSheetView from "@/components/finance/FinanceSheetView";

export default function FluxoCaixaPage() {
  return (
    <FinanceSheetView
      title="Fluxo de Caixa"
      subtitle="Visualização administrativa da aba importada do Excel financeiro, com leitura segura via backend."
      endpoint="/api/finance/fluxo-caixa"
    />
  );
}

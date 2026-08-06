"use client";

import FinanceSheetView from "@/components/finance/FinanceSheetView";

export default function DREPage() {
  return (
    <FinanceSheetView
      title="DRE"
      subtitle="Demonstração do Resultado do Exercício com leitura direta do staging financeiro importado."
      endpoint="/api/finance/dre"
    />
  );
}

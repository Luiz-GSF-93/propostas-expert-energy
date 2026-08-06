"use client";

import FinanceSheetView from "@/components/finance/FinanceSheetView";

export default function CustosPage() {
  return (
    <FinanceSheetView
      title="Custos"
      subtitle="Visualização administrativa da aba de custos importada do Excel financeiro."
      endpoint="/api/finance/custos"
    />
  );
}

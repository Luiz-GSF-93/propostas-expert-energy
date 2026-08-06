"use client";

import FinanceSheetView from "@/components/finance/FinanceSheetView";

export default function EmprestimosPage() {
  return (
    <FinanceSheetView
      title="Empréstimos"
      subtitle="Visualização administrativa da aba de empréstimos importada do Excel financeiro."
      endpoint="/api/finance/emprestimos"
    />
  );
}

import FinanceModuleShell from "@/components/finance/FinanceModuleShell";
import FinanceCostsDashboard from "@/components/finance/FinanceCostsDashboard";

export default function CustosPage() {
  return (
    <FinanceModuleShell
      title="Custos"
      subtitle="Gestão dedicada de custos fixos e variáveis com cadastro, totais, indicadores e distribuição proporcional."
    >
      <FinanceCostsDashboard />
    </FinanceModuleShell>
  );
}

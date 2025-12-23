
import {
  getCollectionsMatrixRules,
  getCollectionsConfiguration,
} from "@/actions/collectionsActions";
import { getAllTemplates } from '@/actions/templateActions';
import { StrategyClientView } from "@/components/dashboard/StrategyClientView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default async function StrategyPage() {
  const [rulesResult, templatesResult, configResult] = await Promise.all([
    getCollectionsMatrixRules(),
    getAllTemplates(),
    getCollectionsConfiguration()
  ]);

  const error = rulesResult.error || templatesResult.error || configResult.error;

  if (error) {
     return (
      <div className="space-y-6">
        <h1 className="text-3xl font-headline text-foreground">Estrategia de Cobranza</h1>
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error al Cargar la Página de Estrategia</AlertTitle>
          <AlertDescription>
            No se pudieron cargar los datos necesarios: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <StrategyClientView
      initialRules={rulesResult.rules || []}
      initialTemplates={templatesResult.templates || []}
      initialConfig={configResult.config || {}}
    />
  );
}


import {
  getCollectionsConfiguration,
  getPreventiveCollectionCustomersPreview,
} from "@/actions/collectionsActions";
import { PreventiveCollectionsClientView } from "@/components/dashboard/PreventiveCollectionsClientView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default async function PreventiveCollectionsPage() {
  const [configResult, previewResult] = await Promise.all([
    getCollectionsConfiguration(),
    getPreventiveCollectionCustomersPreview(),
  ]);

  const error = configResult.error || previewResult.error;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-headline text-foreground">Gestión de Prevención</h1>
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error al Cargar la Página de Prevención</AlertTitle>
          <AlertDescription>
            No se pudieron cargar los datos necesarios: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <PreventiveCollectionsClientView
      initialConfig={configResult.config || {}}
      initialPreviewCustomers={previewResult.customers || []}
    />
  );
}


export const dynamic = 'force-dynamic';

import {
  getCollectionsConfiguration,
  getCollectionCustomersPreview,
} from "@/actions/collectionsActions";
import { CollectionsClientView } from "@/components/dashboard/CollectionsClientView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default async function CollectionsPage() {
  // Fetch all data in parallel on the server
  const [configResult, previewResult] = await Promise.all([
    getCollectionsConfiguration(),
    getCollectionCustomersPreview(),
  ]);

  const error = configResult.error || previewResult.error;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-headline text-foreground">Gestión de Cobranza</h1>
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error al Cargar la Página de Cobranza</AlertTitle>
          <AlertDescription>
            No se pudieron cargar los datos necesarios: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // If data fetching is successful, render the client component with the data as props
  return (
    <CollectionsClientView
      initialConfig={configResult.config || {}}
      initialPreviewCustomers={previewResult.customers || []}
    />
  );
}



import { CreateCampaignForm } from "@/components/dashboard/CreateCampaignForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getAllTemplates } from "@/actions/templateActions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { Template } from "@/lib/mock-data";
import { getCurrentUser } from "@/lib/session";

export default async function CreateCampaignPage() {
  let allTemplates: Template[] = [];
  let errorLoadingTemplates: string | null = null;
  const user = await getCurrentUser();
  const isAdmin = user?.role === 'admin';

  try {
    const templatesResult = await getAllTemplates();
    if (templatesResult.error) {
      errorLoadingTemplates = templatesResult.error;
    } else {
      allTemplates = templatesResult.templates || [];
    }
  } catch (err: any) {
    errorLoadingTemplates = err.message || "Un error desconocido ocurrió al cargar las plantillas.";
  }
  
  // Filter templates based on user role
  // Admins see all, collaborators only see 'Aprobada' templates
  const availableTemplates = isAdmin ? allTemplates : allTemplates.filter(t => t.status === 'Aprobada');

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">Crear Nueva Campaña</CardTitle>
          <CardDescription>Completa los detalles para configurar tu nueva campaña de mensajería.</CardDescription>
        </CardHeader>
        <CardContent>
          {errorLoadingTemplates && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error al Cargar Plantillas</AlertTitle>
              <AlertDescription>
                No se pudieron cargar las plantillas necesarias para crear una campaña: {errorLoadingTemplates}
                <br />
                Por favor, inténtalo de nuevo más tarde o verifica que haya plantillas creadas.
              </AlertDescription>
            </Alert>
          )}
          <CreateCampaignForm availableTemplates={availableTemplates} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  );
}



import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, ListChecks, AlertTriangle } from "lucide-react";
import { getAllTemplates } from "@/actions/templateActions";
import { TemplateTable } from "@/components/dashboard/TemplateTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { getAllUsers } from "@/actions/userActions";
import { getCurrentUser } from "@/lib/session";
import type { UserRecord } from "@/actions/userActions";
import type { Template } from "@/lib/mock-data";
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import CreateTemplateForm from "@/components/dashboard/CreateTemplateForm";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

const CreateTemplateFormLoader = dynamic(
  () => import("@/components/dashboard/CreateTemplateForm"),
  {
    loading: () => (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="h-10 bg-muted animate-pulse rounded" />
          <div className="h-10 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-32 bg-muted animate-pulse rounded" />
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="h-10 bg-primary/20 animate-pulse rounded" />
      </div>
    )
  }
);


export default async function CreateTemplatePage() {
  const [templatesResult, usersResult, currentUser] = await Promise.all([
    getAllTemplates(),
    getAllUsers(),
    getCurrentUser()
  ]);

  const { templates, error: templatesError } = templatesResult;
  const { users, error: usersError } = usersResult;
  const error = templatesError || usersError;


  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <FileText className="mr-3 h-8 w-8 text-primary" />
            Crear Nueva Plantilla
          </CardTitle>
          <CardDescription>Define el contenido y los parámetros para tu nueva plantilla de mensajes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="h-10 bg-muted animate-pulse rounded" />
                <div className="h-10 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-32 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-primary/20 animate-pulse rounded" />
            </div>
          }>
            <CreateTemplateFormLoader />
          </Suspense>
        </CardContent>
      </Card>

      <Separator />

      <div>
        <h2 className="text-2xl font-headline flex items-center mb-4">
          <ListChecks className="mr-3 h-7 w-7 text-primary" />
          Plantillas Existentes
        </h2>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error al Cargar Plantillas Existentes</AlertTitle>
            <AlertDescription>
              No se pudieron cargar las plantillas: {error}
            </AlertDescription>
          </Alert>
        )}
        {!error && templates && (
          <TemplateTable templates={templates} users={users || []} currentUser={currentUser} />
        )}
        {!error && (!templates || templates.length === 0) && (
            <p className="text-muted-foreground text-center py-4">No hay plantillas existentes aún.</p>
        )}
      </div>
    </div>
  );
}

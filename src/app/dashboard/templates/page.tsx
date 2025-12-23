

import { TemplateTable } from "@/components/dashboard/TemplateTable";
import { getAllTemplates } from "@/actions/templateActions";
import { getAllUsers } from "@/actions/userActions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import type { UserRecord } from "@/actions/userActions";
import type { Template } from "@/lib/mock-data";


export default async function TemplatesPage() {
  const user = await getCurrentUser();
  let templates: Template[] = [];
  let users: Omit<UserRecord, 'hashedPassword'>[] = [];
  let error: string | null = null;

  try {
    const [templatesResult, usersResult] = await Promise.all([
      getAllTemplates(),
      getAllUsers()
    ]);

    if (templatesResult.error) throw new Error(templatesResult.error);
    templates = templatesResult.templates || [];
    
    if (usersResult.error) throw new Error(usersResult.error);
    users = usersResult.users || [];

  } catch (err: any) {
    error = err.message || "Error al cargar datos de la página de plantillas.";
  }


  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error al Cargar Datos</AlertTitle>
        <AlertDescription>
          No se pudieron cargar los recursos desde la base de datos: {error}
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      <TemplateTable templates={templates} users={users} currentUser={user} />
    </div>
  );
}

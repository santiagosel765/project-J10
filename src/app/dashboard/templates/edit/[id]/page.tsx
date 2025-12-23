
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, FileText } from "lucide-react";
import { getTemplateById } from "@/actions/templateActions";
import { getCurrentUser } from "@/lib/session";
import { EditTemplateForm } from "@/components/dashboard/EditTemplateForm";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

interface EditTemplatePageProps {
  params: { id: string };
}

export default async function EditTemplatePage({ params }: EditTemplatePageProps) {
  const user = await getCurrentUser();
  const { template, error } = await getTemplateById(params.id);

  if (error || !template) {
    return (
      <div className="space-y-6">
          <Button variant="outline" asChild className="mb-4">
            <Link href="/dashboard/templates">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Plantillas
            </Link>
          </Button>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-headline flex items-center">
              <AlertTriangle className="mr-3 h-8 w-8 text-destructive" />
              Error
            </CardTitle>
            <CardDescription>{error || "La plantilla no fue encontrada."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';
  const isOwner = template.userId === user?.id;

  if (!isAdmin && !isOwner) {
     return (
        <div className="space-y-6">
            <Button variant="outline" asChild className="mb-4">
                <Link href="/dashboard/templates">
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Plantillas
                </Link>
            </Button>
            <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="text-3xl font-headline flex items-center">
                <AlertTriangle className="mr-3 h-8 w-8 text-destructive" />
                Acceso Denegado
                </CardTitle>
                <CardDescription>No tienes permiso para editar esta plantilla.</CardDescription>
            </CardHeader>
            </Card>
        </div>
     );
  }


  return (
    <div className="space-y-6">
        <Button variant="outline" asChild className="mb-4">
          <Link href="/dashboard/templates">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Plantillas
          </Link>
        </Button>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <FileText className="mr-3 h-8 w-8 text-primary" />
            Editar Plantilla
          </CardTitle>
          <CardDescription>Modifica los detalles de la plantilla "{template.name}".</CardDescription>
        </CardHeader>
        <CardContent>
          <EditTemplateForm template={template} />
        </CardContent>
      </Card>
    </div>
  );
}

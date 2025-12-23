import { getCampaignById } from "@/actions/campaignActions";
import { getAllTemplates } from "@/actions/templateActions";
import { getCurrentUser } from "@/lib/session";
import { EditCampaignForm } from "@/components/dashboard/EditCampaignForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, Edit3 } from "lucide-react";
import Link from "next/link";
import type { Template } from "@/lib/mock-data";

interface EditCampaignPageProps {
  params: { id: string };
}

export default async function EditCampaignPage({ params }: EditCampaignPageProps) {
  const user = await getCurrentUser();
  const campaignId = params.id;

  const [campaignResult, templatesResult] = await Promise.all([
    getCampaignById(campaignId),
    getAllTemplates()
  ]);

  const { campaign, error: campaignError } = campaignResult;
  const { templates, error: templatesError } = templatesResult;

  if (campaignError || !campaign) {
    return (
      <div className="space-y-6">
        <Button variant="outline" asChild className="mb-4">
          <Link href="/dashboard/campaigns">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Campañas
          </Link>
        </Button>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-headline flex items-center">
              <AlertTriangle className="mr-3 h-8 w-8 text-destructive" />
              Error
            </CardTitle>
            <CardDescription>{campaignError || "La campaña no fue encontrada."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';
  const isOwner = campaign.userId === user?.id;
  const canEdit = isAdmin || isOwner;

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <Button variant="outline" asChild className="mb-4">
          <Link href="/dashboard/campaigns">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Campañas
          </Link>
        </Button>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-headline flex items-center">
              <AlertTriangle className="mr-3 h-8 w-8 text-destructive" />
              Acceso Denegado
            </CardTitle>
            <CardDescription>No tienes permiso para editar esta campaña.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Filter templates to only show approved ones for collaborators
  const availableTemplates = isAdmin ? (templates || []) : (templates || []).filter(t => t.status === 'Aprobada');
  
  if (templatesError) {
      return <div>Error cargando plantillas: {templatesError}</div>
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" asChild>
        <Link href="/dashboard/campaigns">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Campañas
        </Link>
      </Button>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <Edit3 className="mr-3 h-8 w-8 text-primary" />
            Editar Campaña
          </CardTitle>
          <CardDescription>Modifica los detalles de la campaña "{campaign.name}".</CardDescription>
        </CardHeader>
        <CardContent>
          <EditCampaignForm campaign={campaign} availableTemplates={availableTemplates} />
        </CardContent>
      </Card>
    </div>
  );
}

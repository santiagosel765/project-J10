
import { CampaignDetailsView } from "@/components/dashboard/CampaignDetailsView";
import { getCampaignById } from "@/actions/campaignActions"; 
import { getTemplateById } from "@/actions/templateActions"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Campaign, Template } from "@/lib/mock-data";
import { getCurrentUser } from "@/lib/session";

interface CampaignDetailsPageProps {
  params: { id: string };
}

export default async function CampaignDetailsPage({ params }: CampaignDetailsPageProps) {
  let campaign: Campaign | undefined;
  let template: Template | undefined;
  let campaignError: string | null = null;
  let templateError: string | null = null;
  const user = await getCurrentUser();
  const campaignId = params.id;

  try {
    const campaignResult = await getCampaignById(campaignId);
    if (campaignResult.error) {
      campaignError = campaignResult.error;
    } else if (!campaignResult.campaign) {
      campaignError = "La campaña que estás buscando no existe o no pudo ser cargada.";
    } else {
      campaign = campaignResult.campaign;
    }
  } catch (err:any) {
    campaignError = err.message || "Error inesperado al cargar la campaña.";
  }

  if (campaign && !campaignError) {
    try {
      const templateResult = await getTemplateById(campaign.templateId);
      if (templateResult.error) {
        templateError = templateResult.error;
      } else if (!templateResult.template) {
        templateError = `La plantilla asociada (ID: ${campaign.templateId}) no pudo ser cargada.`;
      } else {
        template = templateResult.template;
      }
    } catch (err:any) {
       templateError = err.message || "Error inesperado al cargar la plantilla.";
    }
  }


  if (campaignError || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <Card className="w-full max-w-lg text-center shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-headline flex items-center justify-center">
              <AlertTriangle className="mr-2 h-8 w-8 text-destructive" />
              Campaña No Encontrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {campaignError || "La campaña que estás buscando no existe o no pudo ser cargada."}
            </p>
            <Button variant="outline" asChild className="mt-4">
                <Link href="/dashboard/campaigns">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Campañas
                </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (templateError || !template) {
     return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <Card className="w-full max-w-lg text-center shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-headline flex items-center justify-center">
              <AlertTriangle className="mr-2 h-8 w-8 text-destructive" />
              Plantilla no encontrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {templateError || `La plantilla asociada (ID: ${campaign.templateId}) no pudo ser cargada.`}
            </p>
             <Button variant="outline" asChild className="mt-4">
                <Link href="/dashboard/campaigns">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Campañas
                </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <CampaignDetailsView campaign={campaign} template={template} currentUser={user} />;
}

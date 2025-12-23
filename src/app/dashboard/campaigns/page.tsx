

import { getAllCampaigns } from "@/actions/campaignActions"; 
import { getAllTemplates } from "@/actions/templateActions"; 
import { getAllUsers } from "@/actions/userActions"; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { Campaign, Template } from "@/lib/mock-data";
import type { UserRecord } from "@/actions/userActions";
import { getCurrentUser } from "@/lib/session";
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const CampaignTable = dynamic(
  () => import("@/components/dashboard/CampaignTable").then(mod => ({ default: mod.CampaignTable })),
  {
    loading: () => (
      <div className="space-y-4">
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    )
  }
);

export default async function CampaignsPage() {
  let campaigns: Campaign[] = [];
  let templates: Template[] = [];
  let users: Omit<UserRecord, 'hashedPassword'>[] = [];

  let campaignsError: string | null = null;
  let templatesError: string | null = null;
  let usersError: string | null = null;

  const user = await getCurrentUser();

  try {
    const [campaignsResult, templatesResult, usersResult] = await Promise.all([
      getAllCampaigns(),
      getAllTemplates(),
      getAllUsers()
    ]);

    if (campaignsResult.error) campaignsError = campaignsResult.error;
    else campaigns = campaignsResult.campaigns || [];

    if (templatesResult.error) templatesError = templatesResult.error;
    else templates = templatesResult.templates || [];
    
    if (usersResult.error) usersError = usersResult.error;
    else users = usersResult.users || [];
    
  } catch (err: any) {
    campaignsError = err.message || "Un error desconocido ocurrió al cargar los datos de la página.";
  }


  if (campaignsError || templatesError || usersError) {
    const errorMsg = campaignsError || templatesError || usersError;
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error al Cargar Datos</AlertTitle>
        <AlertDescription>
          No se pudieron cargar los recursos necesarios: {errorMsg}
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      <Suspense fallback={
        <div className="space-y-4">
          <div className="h-10 bg-muted animate-pulse rounded" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </div>
      }>
        <CampaignTable campaigns={campaigns} templates={templates} users={users} currentUser={user} />
      </Suspense>
    </div>
  );
}

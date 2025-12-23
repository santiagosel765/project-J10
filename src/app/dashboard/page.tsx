

import { getAllCampaigns } from "@/actions/campaignActions";
import { getAllTemplates } from "@/actions/templateActions";
import { getAllUsers } from "@/actions/userActions";
import { getCurrentUser } from "@/lib/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const DashboardClientView = dynamic(
  () => import("@/components/dashboard/DashboardClientView").then(mod => ({ default: mod.DashboardClientView })),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-4 h-80 bg-muted animate-pulse rounded-lg" />
          <div className="col-span-3 h-80 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    )
  }
);

export default async function DashboardOverviewPage() {
  // Fetch all data in parallel on the server
  const [
    campaignsResult,
    templatesResult,
    usersResult,
    currentUser,
  ] = await Promise.all([
    getAllCampaigns(),
    getAllTemplates(),
    getAllUsers(),
    getCurrentUser(),
  ]);

  // Centralized error handling for all data fetches
  const error =
    campaignsResult.error ||
    templatesResult.error ||
    usersResult.error;

  // If any fetch fails, render an error message
  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error al Cargar el Dashboard</AlertTitle>
          <AlertDescription>
            No se pudieron cargar los datos necesarios: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // If data fetching is successful, render the client component with the data as props
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-4 h-80 bg-muted animate-pulse rounded-lg" />
          <div className="col-span-3 h-80 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    }>
      <DashboardClientView
        initialCampaigns={campaignsResult.campaigns || []}
        initialTemplates={templatesResult.templates || []}
        initialUsers={usersResult.users || []}
        currentUser={currentUser || null}
      />
    </Suspense>
  );
}

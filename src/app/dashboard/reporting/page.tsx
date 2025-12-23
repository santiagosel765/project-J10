

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { Suspense } from "react";
import { CampaignReportTable } from "@/components/dashboard/reporting/CampaignReportTable";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = 'force-dynamic';

function ReportingSkeleton() {
    return (
        <div className="space-y-4">
            <div className="h-10 bg-muted animate-pulse rounded w-full" />
            <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
            </div>
        </div>
    );
}

export default async function ReportingPage() {
    // La obtención de datos se hará en el componente cliente para permitir filtros dinámicos
    return (
        <div className="space-y-6">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="text-3xl font-headline flex items-center">
                        <BarChart3 className="mr-3 h-8 w-8 text-primary" />
                        Reporte por Campaña
                    </CardTitle>
                    <CardDescription>
                        Analiza el rendimiento de tus campañas midiendo los mensajes enviados, exitosos y fallidos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<ReportingSkeleton />}>
                        <CampaignReportTable />
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    );
}


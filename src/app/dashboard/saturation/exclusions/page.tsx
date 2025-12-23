
import { Suspense } from "react";
import { ExclusionsTable } from "@/components/dashboard/ExclusionsTable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban, PieChart } from "lucide-react";
import { getExclusions } from "@/actions/saturationActions";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = 'force-dynamic';

function ExclusionsSkeleton() {
    return (
        <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
        </div>
    );
}


export default async function ExclusionsPage() {
    
    const { exclusions, error } = await getExclusions();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-3xl font-headline flex items-center">
                            <Ban className="mr-3 h-8 w-8 text-destructive" />
                            Contactos Excluidos de Campañas
                        </CardTitle>
                        <CardDescription>
                            Aquí puedes ver y revertir las exclusiones de contactos para campañas específicas.
                        </CardDescription>
                    </div>
                     <Button asChild variant="outline">
                        <Link href="/dashboard/saturation">
                            <PieChart className="mr-2 h-4 w-4" />
                            Volver a Vista de Frecuencia
                        </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<ExclusionsSkeleton />}>
                        {error && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Error al cargar exclusiones</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        {!error && (
                            <ExclusionsTable initialExclusions={exclusions || []} />
                        )}
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    );
}


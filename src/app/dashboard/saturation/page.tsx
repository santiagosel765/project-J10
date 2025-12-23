

import { Suspense } from "react";
import { SaturationClientView } from "@/components/dashboard/SaturationClientView";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = 'force-dynamic';

function SaturationSkeleton() {
    return (
        <div className="space-y-4">
            <div className="h-10 bg-muted animate-pulse rounded w-1/2" />
            <div className="h-10 bg-muted animate-pulse rounded w-1/3" />
            <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
            </div>
        </div>
    );
}

export default function SaturationPage() {
  return (
    <div className="space-y-6">
       <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl font-headline flex items-center">
                <PieChart className="mr-3 h-8 w-8 text-primary" />
                Saturación de Contactos
              </CardTitle>
              <CardDescription>
                Analiza la frecuencia con la que un mismo contacto aparece en múltiples campañas activas.
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard/saturation/exclusions">
                <Ban className="mr-2 h-4 w-4" />
                Ver Contactos Excluidos
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>
      <Suspense fallback={<SaturationSkeleton />}>
        <SaturationClientView />
      </Suspense>
    </div>
  );
}


import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getGerenciaForCurrentUser } from '@/actions/gerenciaActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Settings as SettingsIcon } from 'lucide-react';
import { GerenciaSettingsForm } from '@/components/dashboard/GerenciaSettingsForm';

export default async function SettingsPage() {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
        return (
             <div className="flex flex-col items-center justify-center h-full py-12">
                <Card className="w-full max-w-lg text-center shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl font-headline flex items-center justify-center">
                    <AlertTriangle className="mr-2 h-8 w-8 text-destructive" />
                    Acceso Denegado
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        No tienes permisos para acceder a esta sección.
                    </p>
                </CardContent>
                </Card>
            </div>
        );
    }
    
    const { gerencia, error } = await getGerenciaForCurrentUser();

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error al Cargar Datos</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }

    if (!gerencia) {
        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No Asignado a una Gerencia</AlertTitle>
                <AlertDescription>
                    Tu usuario administrador no está asignado a ninguna gerencia. Contacta al soporte del sistema.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl font-headline flex items-center">
                        <SettingsIcon className="mr-3 h-7 w-7 text-primary" />
                        Configuración de Mi Gerencia
                    </CardTitle>
                    <CardDescription>
                        Administra los límites de envío de mensajes para tu gerencia: <span className="font-bold">{gerencia.nombre}</span>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                   <GerenciaSettingsForm gerencia={gerencia} />
                </CardContent>
            </Card>
        </div>
    );
}

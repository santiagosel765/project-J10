
// src/app/dashboard/users/page.tsx

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getAllUsers } from '@/actions/userActions';
import { getAllGerencias } from '@/actions/gerenciaActions';
import { UserTable } from '@/components/dashboard/UserTable';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Users as UsersIcon } from 'lucide-react';

export default async function UsersPage() {
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
    
    const [{ users, error: usersError }, { gerencias, error: gerenciasError }] = await Promise.all([
        getAllUsers(),
        getAllGerencias()
    ]);
    
    const error = usersError || gerenciasError;

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error al cargar datos</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl font-headline flex items-center">
                        <UsersIcon className="mr-3 h-7 w-7 text-primary" />
                        Gestión de Usuarios
                    </CardTitle>
                    <CardDescription>
                        Administra los roles y gerencias de los usuarios del sistema.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <UserTable 
                        initialUsers={users || []} 
                        currentUser={user}
                        gerencias={gerencias || []}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

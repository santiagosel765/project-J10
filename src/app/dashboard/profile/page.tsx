
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, UserCircle2, Building2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/session';
import { getUserByEmail } from '@/actions/userActions';
import { ProfileForm } from '@/components/dashboard/ProfileForm';
import { Separator } from '@/components/ui/separator';

export default async function ProfilePage() {
    const sessionUser = await getCurrentUser();
    
    if (!sessionUser?.email) {
        redirect('/login');
    }

    const { user, error } = await getUserByEmail(sessionUser.email);
    
    if (error || !user) {
        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error || 'No se pudo cargar la información del usuario.'}</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="text-3xl font-headline flex items-center">
                        <UserCircle2 className="mr-3 h-8 w-8 text-primary" />
                        Perfil de Usuario
                    </CardTitle>
                    <CardDescription>
                        Visualiza y actualiza tu información de perfil.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ProfileForm user={user} />
                </CardContent>
            </Card>

             <Separator />
            
             <Card>
                <CardHeader>
                    <CardTitle>Información de la Cuenta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-muted-foreground">Nombre</span>
                        <p className="text-lg">{user.name}</p>
                    </div>
                     <div className="flex flex-col">
                        <span className="text-sm font-medium text-muted-foreground">Correo Electrónico</span>
                        <p className="text-lg">{user.email}</p>
                    </div>
                     <div className="flex flex-col">
                        <span className="text-sm font-medium text-muted-foreground">Rol</span>
                        <p className="text-lg capitalize">{user.role}</p>
                    </div>
                     <div className="flex flex-col">
                        <span className="text-sm font-medium text-muted-foreground flex items-center"><Building2 className="inline-block mr-2 h-4 w-4" />Gerencia</span>
                        <p className="text-lg capitalize">{user.gerencia_nombre || <span className="italic text-muted-foreground">No asignada</span>}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

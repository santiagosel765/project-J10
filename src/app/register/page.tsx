
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getAllGerencias } from "@/actions/gerenciaActions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default async function RegisterPage() {

  const { gerencias, error } = await getAllGerencias();

  if (error) {
    return (
        <div className="w-full bg-background px-4 py-12 sm:py-16 flex items-center justify-center">
            <Alert variant="destructive" className="max-w-md">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error de Configuración</AlertTitle>
                <AlertDescription>
                    No se pudieron cargar las gerencias. El registro no está disponible en este momento.
                    <br/>
                    Detalle: {error}
                </AlertDescription>
            </Alert>
        </div>
    )
  }

  return (
    <div className="w-full bg-background px-4 py-12 sm:py-16">
        <RegisterForm gerencias={gerencias || []} />
    </div>
  );
}

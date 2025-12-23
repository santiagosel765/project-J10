
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/**
 * Obtiene la sesión del usuario actual en el lado del servidor.
 * Es una forma segura de acceder a los datos del usuario dentro de las Server Actions.
 * @returns El objeto de usuario de la sesión o null si no está autenticado.
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user;
}

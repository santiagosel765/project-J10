
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import NextAuth, { type DefaultSession, type User as DefaultUser } from "next-auth";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's id. */
      id: string;
      role?: string; // Añadido para el rol
      name?: string | null;
      email?: string | null;
      // La propiedad 'image' se omite intencionadamente para mantener la cookie de sesión pequeña
    };
  }

  // Extender el tipo User para incluir `role` si es necesario para los callbacks
  // DefaultUser ya incluye id, name, email, image.
  interface User extends DefaultUser {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    /** OpenID ID Token */
    idToken?: string;
    id: string;
    role?: string; // Añadido para el rol
     // La propiedad 'image' se omite intencionadamente del token JWT
  }
}

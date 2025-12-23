import NextAuth, { type NextAuthOptions, type User as NextAuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUserByEmail } from "@/actions/userActions";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Correo Electrónico", type: "email", placeholder: "tu@ejemplo.com" },
        password: { label: "Contraseña", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }
        
        const userResult = await getUserByEmail(credentials.email);
        if (userResult.error || !userResult.user) {
          console.error("Error en authorize (Credentials): ", userResult.error || "Usuario no encontrado");
          return null;
        }
        const user = userResult.user;
        
        if (!user.hashedPassword) {
          console.error("Usuario encontrado pero no tiene contraseña hasheada:", user.email);
          return null;
        }
        
        const isPasswordValid = await bcrypt.compare(credentials.password, user.hashedPassword);
        if (isPasswordValid) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } else {
          console.log("Contraseña inválida para:", credentials.email);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
    // Remove the redirect callback entirely - let Next.js handle basePath
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
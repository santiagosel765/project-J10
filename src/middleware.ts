
export { default } from "next-auth/middleware";

// Esto protegerá todas las rutas bajo /dashboard y sus subrutas.
// Los usuarios no autenticados serán redirigidos a la página de inicio de sesión
// que hayas configurado en las opciones de NextAuth (o la predeterminada).
export const config = { matcher: ["/dashboard/:path*"] };

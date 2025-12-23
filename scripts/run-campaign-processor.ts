
// scripts/run-campaign-processor.ts
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env.local (o .env)
// Esto es crucial si el script se ejecuta fuera del contexto de 'next dev' o 'next start'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
// Fallback a .env si .env.local no existe o no contiene la variable
if (!process.env.POSTGRES_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

// Verificar si POSTGRES_URL está cargada después de intentar con dotenv
if (!process.env.POSTGRES_URL) {
  console.error("FATAL: La variable de entorno POSTGRES_URL no está configurada.");
  console.error("Asegúrate de que esté definida en tu archivo .env.local o .env, o en el entorno del sistema.");
  process.exit(1); // Salir si la URL de la BD no está disponible
}

import { processScheduledCampaigns } from '../src/actions/campaignActions'; // Ajusta la ruta si es necesario

async function main() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Iniciando procesamiento de campañas programadas...`);

  try {
    // La función processScheduledCampaigns ya inicializa su propio pool de BD
    // y debería manejar sus propias conexiones.
    const result = await processScheduledCampaigns();

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000; // Duración en segundos

    console.log(`[${endTime.toISOString()}] Procesamiento completado en ${duration.toFixed(2)}s.`);
    console.log(`  Campañas procesadas: ${result.processed}`);
    console.log(`  Errores durante el procesamiento: ${result.errors}`);

    // Si necesitas un código de salida específico para tu cron, puedes usar process.exit()
    // process.exit(result.errors > 0 ? 1 : 0); 
    // Por ahora, dejamos que el script termine naturalmente.
  } catch (error: any) {
    const errorTime = new Date();
    console.error(`[${errorTime.toISOString()}] Error crítico durante el procesamiento de campañas:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    // process.exit(1); // Indicar error al cron
  } finally {
    // El pool de PostgreSQL en campaignActions.ts se crea bajo demanda por getPool().
    // Para scripts de corta duración que terminan, Node.js manejará el cierre de conexiones.
    // Si este script se convirtiera en un proceso de larga duración o se ejecutara con
    // muchísima frecuencia, se podría considerar una gestión de pool más explícita (cerrar el pool).
    console.log(`[${new Date().toISOString()}] Script de procesamiento de campañas finalizado.`);
  }
}

main().catch((error) => {
  // Este catch es para errores no manejados en la función main misma (ej. errores de sintaxis previos a la ejecución)
  console.error(`[${new Date().toISOString()}] Error no manejado en la ejecución de main():`, error);
  // process.exit(1);
});

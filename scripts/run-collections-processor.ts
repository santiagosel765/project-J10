
// scripts/run-collections-processor.ts
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env.local (o .env)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
if (!process.env.POSTGRES_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

if (!process.env.POSTGRES_URL) {
  console.error("FATAL: La variable de entorno POSTGRES_URL no está configurada.");
  process.exit(1);
}

import { processDailyCollections } from '../src/actions/collectionsActions'; // Ajusta la ruta si es necesario

async function main() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Iniciando procesamiento de cobranzas...`);

  try {
    const result = await processDailyCollections();

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000; // Duración en segundos

    console.log(`[${endTime.toISOString()}] Procesamiento de cobranzas completado en ${duration.toFixed(2)}s.`);
    console.log(`  Clientes consultados: ${result.totalCustomers ?? 'N/A'}`);
    console.log(`  Mensajes procesados exitosamente: ${result.processed}`);
    console.log(`  Errores durante el procesamiento: ${result.errors}`);
    
  } catch (error: any) {
    const errorTime = new Date();
    console.error(`[${errorTime.toISOString()}] Error crítico durante el procesamiento de cobranzas:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    console.log(`[${new Date().toISOString()}] Script de procesamiento de cobranzas finalizado.`);
  }
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] Error no manejado en la ejecución de main() para cobranzas:`, error);
});

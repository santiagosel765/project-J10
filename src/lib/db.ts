

// src/lib/db.ts
import { Pool } from 'pg';
import type { Client } from 'pg';

let pool: Pool | undefined;

/**
 * Checks if we're in a build environment where database connections shouldn't be made
 */
function isBuildTime(): boolean {
  return (
    process.env.NODE_ENV === 'production' && 
    (process.env.VERCEL_ENV === undefined || process.env.VERCEL_ENV === 'preview') &&
    !process.env.POSTGRES_URL
  ) || process.env.NEXT_PHASE === 'phase-production-build';
}

/**
 * Validates the PostgreSQL connection string format
 */
function validateConnectionString(connectionString: string): boolean {
  try {
    // Basic format validation
    if (!connectionString.startsWith('postgresql://') && !connectionString.startsWith('postgres://')) {
      return false;
    }
    
    // Try to parse as URL without using new URL() to avoid the base URL issue
    const urlPattern = /^postgres(ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
    return urlPattern.test(connectionString);
  } catch {
    return false;
  }
}

/**
 * Lazily creates and returns a singleton instance of the PostgreSQL connection pool.
 * The pool is only created on the first call to this function.
 * @throws {Error} if the POSTGRES_URL environment variable is not set when the pool is first created.
 * @returns {Pool} The PostgreSQL connection pool instance.
 */
export function getDbPool(): Pool {
  // Skip database connections during build time
  if (isBuildTime()) {
    console.log("Skipping database connection during build time");
    throw new Error("Database connection not available during build time");
  }

  if (!pool) {
    const connectionString = process.env.POSTGRES_URL;

    if (!connectionString) {
      console.error("FATAL: POSTGRES_URL environment variable is not set. Database operations will fail.");
      throw new Error("Database connection string is not configured. Please set the POSTGRES_URL environment variable.");
    }

    // Validate connection string format
    if (!validateConnectionString(connectionString)) {
      console.error("FATAL: Invalid POSTGRES_URL format. Expected format: postgresql://user:password@host:port/database");
      throw new Error("Invalid database connection string format.");
    }
    
    try {
        console.log("Initializing PostgreSQL connection pool...");
        
        // Create pool with robust configuration
        pool = new Pool({
            connectionString,
            ssl: {
              rejectUnauthorized: false,
            },
            // Connection pool settings
            max: 20, // Maximum number of clients in the pool
            idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
            connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
            allowExitOnIdle: true, // Allow the pool to close all connections and exit when all clients are idle
        });
        
        pool.on('error', (err, client) => {
            console.error('Unexpected error on idle PostgreSQL client', err);
        });

        pool.on('connect', (client) => {
            console.log('New client connected to PostgreSQL');
        });

        pool.on('remove', (client) => {
            console.log('Client removed from PostgreSQL pool');
        });

        console.log("PostgreSQL connection pool configured.");
    } catch (error) {
       console.error("Failed to create PostgreSQL connection pool:", error);
       // Re-throw the error to ensure the calling function knows about the failure.
       throw error;
    }
  }

  return pool;
}

/**
 * Safely gets a database pool, returns null if not available (useful for build-time safety)
 */
export function getDbPoolSafe(): Pool | null {
  try {
    return getDbPool();
  } catch (error) {
    console.warn("Database pool not available:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Closes the database pool (useful for cleanup)
 */
export async function closeDbPool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
      console.log("Database pool closed successfully");
    } catch (error) {
      console.error("Error closing database pool:", error);
    } finally {
      pool = undefined;
    }
  }
}

// --- Lógica de Conteo de Mensajes por Gerencia ---

/**
 * Checks the current message count and limit for a given management channel.
 * @param gerenciaId The UUID of the management.
 * @param channel The communication channel.
 * @param dbClient An instance of the database client.
 * @returns An object with the current sent count and the maximum limit.
 */
export async function checkMessageLimit(
    gerenciaId: string,
    channel: 'whatsapp' | 'sms' | 'llamada-ia',
    dbClient: Client
): Promise<{ sent: number; limit: number; error?: string }> {
    if (!gerenciaId) {
        return { sent: 0, limit: -1 }; // No limit if no gerencia
    }
    const monthPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    try {
        const query = `
            SELECT
                g.max_whatsapp_messages,
                g.max_sms_messages,
                g.max_ai_calls,
                COALESCE(gmc.sent_count, 0) as current_count
            FROM gerencias g
            LEFT JOIN gerenciamessagecounts gmc ON g.id = gmc.gerencia_id
                AND gmc.channel = $2
                AND gmc.month_period = $3
            WHERE g.id = $1;
        `;
        const result = await dbClient.query(query, [gerenciaId, channel, monthPeriod]);
        if (result.rows.length === 0) {
            return { sent: 0, limit: 0, error: `Gerencia con ID ${gerenciaId} no encontrada.` };
        }
        const { max_whatsapp_messages, max_sms_messages, max_ai_calls, current_count } = result.rows[0];
        let limit;
        if (channel === 'whatsapp') limit = max_whatsapp_messages;
        else if (channel === 'sms') limit = max_sms_messages;
        else limit = max_ai_calls;
        return { sent: Number(current_count), limit };
    } catch (err: any) {
        return { sent: 0, limit: 0, error: `Error de base de datos: ${err.message}` };
    }
}

/**
 * Increments the message count for a management channel by a specific amount.
 * @param gerenciaId The UUID of the management.
 * @param channel The communication channel.
 * @param count The number of messages to add to the count.
 * @param dbClient An instance of the database client for transactions.
 */
export async function incrementMessageCountBatch(
    gerenciaId: string,
    channel: 'whatsapp' | 'sms' | 'llamada-ia',
    count: number,
    dbClient: Client
): Promise<void> {
    if (!gerenciaId || count <= 0) {
        return;
    }
    const monthPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const upsertQuery = `
        INSERT INTO gerenciamessagecounts (gerencia_id, channel, month_period, sent_count)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (gerencia_id, channel, month_period)
        DO UPDATE SET sent_count = gerenciamessagecounts.sent_count + $4, updated_at = NOW();
    `;
    try {
        await dbClient.query(upsertQuery, [gerenciaId, channel, monthPeriod, count]);
    } catch (err: any) {
        console.error(`Error en incrementMessageCountBatch para gerencia ${gerenciaId}:`, err);
        // Do not throw, as the messages were already sent. Log the error.
    }
}


/**
 * Verifica si una gerencia ha excedido su límite de mensajes para un canal específico.
 * Si no lo ha excedido, incrementa el contador.
 * @param gerenciaId - El UUID de la gerencia.
 * @param channel - El canal de comunicación ('whatsapp', 'sms', 'llamada-ia').
 * @param dbClient - Una instancia de cliente de la base de datos para transacciones.
 * @returns {Promise<{allowed: boolean; error?: string }>} - `allowed` es true si el envío está permitido.
 */
export async function checkAndIncrementMessageCount(
    gerenciaId: string,
    channel: 'whatsapp' | 'sms' | 'llamada-ia',
    dbClient: Client // Se requiere un cliente para mantener la transacción
): Promise<{ allowed: boolean; error?: string }> {
    if (!gerenciaId) {
        // Si no hay gerencia, por defecto se permite. Podría cambiarse a denegar.
        console.warn(`Intento de envío sin gerencia asociada. Se permite por defecto. Canal: ${channel}`);
        return { allowed: true };
    }

    const now = new Date();
    // Normalizamos a `YYYY-MM-01` para representar el período mensual.
    const monthPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    try {
        // Usar una transacción para asegurar la atomicidad de la lectura y escritura.
        await dbClient.query('BEGIN');

        // 1. Obtener los límites y el conteo actual en una sola consulta.
        const query = `
            SELECT
                g.max_whatsapp_messages,
                g.max_sms_messages,
                g.max_ai_calls,
                COALESCE(gmc.sent_count, 0) as current_count
            FROM gerencias g
            LEFT JOIN gerenciamessagecounts gmc ON g.id = gmc.gerencia_id
                AND gmc.channel = $2
                AND gmc.month_period = $3
            WHERE g.id = $1;
        `;
        const result = await dbClient.query(query, [gerenciaId, channel, monthPeriod]);

        if (result.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return { allowed: false, error: `Gerencia con ID ${gerenciaId} no encontrada.` };
        }

        const { max_whatsapp_messages, max_sms_messages, max_ai_calls, current_count } = result.rows[0];
        let limit;
        if (channel === 'whatsapp') limit = max_whatsapp_messages;
        else if (channel === 'sms') limit = max_sms_messages;
        else limit = max_ai_calls;

        // 2. Verificar el límite.
        if (current_count >= limit) {
            await dbClient.query('ROLLBACK');
            return {
                allowed: false,
                error: `Límite mensual de ${limit} mensajes de ${channel} para la gerencia ha sido alcanzado.`
            };
        }

        // 3. Incrementar el contador (INSERT con ON CONFLICT para manejar el primer envío del mes).
        const upsertQuery = `
            INSERT INTO gerenciamessagecounts (gerencia_id, channel, month_period, sent_count)
            VALUES ($1, $2, $3, 1)
            ON CONFLICT (gerencia_id, channel, month_period)
            DO UPDATE SET sent_count = gerenciamessagecounts.sent_count + 1, updated_at = NOW();
        `;
        await dbClient.query(upsertQuery, [gerenciaId, channel, monthPeriod]);

        await dbClient.query('COMMIT');
        return { allowed: true };

    } catch (err: any) {
        await dbClient.query('ROLLBACK');
        console.error(`Error en checkAndIncrementMessageCount para gerencia ${gerenciaId}:`, err);
        return { allowed: false, error: `Error de base de datos al verificar el límite: ${err.message}` };
    }
}

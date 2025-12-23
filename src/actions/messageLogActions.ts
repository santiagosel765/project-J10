
'use server';

import { revalidatePath } from 'next/cache';
import type { MessageLog } from '@/lib/mock-data';
import { getDbPool, getDbPoolSafe } from '@/lib/db';
import type { PoolClient } from 'pg';

/**
 * Crea un nuevo log de mensaje.
 * Usualmente llamado por el servicio de envío de mensajes.
 * @param logData - Los datos para el nuevo log de mensaje.
 * @param dbClient - (Opcional) Un cliente de BD existente para usar en una transacción.
 * @returns El log de mensaje creado o un objeto de error.
 */
export async function createMessageLog(
    logData: Omit<MessageLog, 'id' | 'createdAt'>,
    dbClient?: PoolClient
): Promise<{ messageLog?: MessageLog; error?: string }> {
  const db = dbClient || getDbPool(); // Use provided client or get a new one from the pool
  try {
    const query = `
      INSERT INTO messagelogs (
        campaign_id, recipient_id, template_id, recipient_contact,
        sent_at, status, error_message, provider_message_id, provider_response
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id, campaign_id AS "campaignId", recipient_id AS "recipientId",
        template_id AS "templateId", recipient_contact AS "recipientContact",
        sent_at, status, error_message AS "errorMessage",
        provider_message_id AS "providerMessageId",
        provider_response,
        created_at AS "createdAt";
    `;
    const values = [
      logData.campaignId,
      logData.recipientId || null,
      logData.templateId,
      logData.recipientContact,
      logData.sent_at,
      logData.status,
      logData.errorMessage || null,
       logData.providerMessageId || null,
      logData.provider_response ? JSON.stringify(logData.provider_response) : null
     
    ];


    console.error('Creating message log with values:', values);
    const result = await db.query(query, values);

    const newLogData = result.rows[0];
    if (!newLogData) {
        return { error: 'No se pudo crear el log de mensaje en la base de datos.' };
    }

    const sentAtDate = newLogData.sent_at ? new Date(newLogData.sent_at) : null;
    const createdAtDate = newLogData.createdAt ? new Date(newLogData.createdAt) : null;

    const newMessageLog: MessageLog = {
        id: newLogData.id,
        campaignId: newLogData.campaignId,
        recipientId: newLogData.recipientId,
        templateId: newLogData.templateId,
        recipientContact: newLogData.recipientContact,
        sent_at: sentAtDate ? sentAtDate.toISOString() : new Date(0).toISOString(),
        status: newLogData.status,
        errorMessage: newLogData.errorMessage,
        providerMessageId: newLogData.providerMessageId,
        provider_response: newLogData.provider_response,
        createdAt: createdAtDate ? createdAtDate.toISOString() : undefined,
    };

    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/campaign/${logData.campaignId}`);
    return { messageLog: newMessageLog };
  } catch (err: any) {
    console.error('Error de base de datos al crear log de mensaje:', err);
    return { error: `Error al crear el log de mensaje: ${err.message}` };
  }
}

/**
 * Recupera todos los logs de mensajes.
 */

interface MessageLogsFilter {
   templateId?: string;
   dateFrom?: string;
   dateTo?: string;
   page?: number;
   limit?: number;
}

export async function getAllMessageLogs(filters: MessageLogsFilter): Promise<{ 
  messageLogs?: MessageLog[]; 
  totalCount?: number;
  currentPage?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  error?: string;
}> {
  const db = getDbPoolSafe();
  if (!db) {
      return { error: 'Database not available during build time or connection failed.' };
  }
  try {
    // Build WHERE conditions dynamically
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.templateId) {
      conditions.push(`template_id = $${paramIndex}`);
      params.push(filters.templateId);
      paramIndex++;
    }

    if (filters.dateFrom) {
      conditions.push(`sent_at >= $${paramIndex}`);
      params.push(filters.dateFrom);
      paramIndex++;
    }

    if (filters.dateTo) {
      conditions.push(`sent_at <= $${paramIndex}`);
      params.push(filters.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Pagination parameters
    const currentPage = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (currentPage - 1) * limit;

    // Add LIMIT and OFFSET parameters
    const limitParam = `$${paramIndex}`;
    params.push(limit);
    paramIndex++;

    const offsetParam = `$${paramIndex}`;
    params.push(offset);
    paramIndex++;

    const query = `
      SELECT
        id, campaign_id AS "campaignId", recipient_id AS "recipientId",
        template_id AS "templateId", recipient_contact AS "recipientContact",
        sent_at, status, error_message AS "errorMessage",
        provider_message_id AS "providerMessageId", provider_response,
        created_at AS "createdAt",
        COUNT(*) OVER() AS total_count
      FROM messagelogs
      ${whereClause}
      ORDER BY sent_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `;
    const result = await db.query(query, params);
    const messageLogs: MessageLog[] = result.rows.map(row => {
        const sentAtDate = row.sent_at ? new Date(row.sent_at) : null;
        const createdAtDate = row.createdAt ? new Date(row.createdAt) : null; // Acceder a row.createdAt (con C mayúscula)

        return {
            id: row.id,
            campaignId: row.campaignId,
            recipientId: row.recipientId,
            templateId: row.templateId,
            recipientContact: row.recipientContact,
            sent_at: sentAtDate ? sentAtDate.toISOString() : new Date(0).toISOString(), // sent_at es string, no opcional
            status: row.status,
            errorMessage: row.errorMessage,
            providerMessageId: row.providerMessageId,
            provider_response: row.provider_response, // pg parsea JSON/JSONB automáticamente
            createdAt: createdAtDate ? createdAtDate.toISOString() : undefined, // createdAt es string | undefined
        };
    });

    // Calculate pagination info
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = currentPage < totalPages;
    const hasPreviousPage = currentPage > 1;

    return { 
      messageLogs,
      totalCount,
      currentPage,
      totalPages,
      hasNextPage,
      hasPreviousPage
    };
  } catch (err: any) {
    console.error('Error de base de datos al obtener logs de mensajes:', err);
    return { error: `Error al obtener los logs de mensajes: ${err.message}` };
  }
}

/**
 * Recupera un log de mensaje por su ID.
 */
export async function getMessageLogById(id: string): Promise<{ messageLog?: MessageLog; error?: string }> {
    const db = getDbPoolSafe();
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    try {
        const query = `
          SELECT
            id, campaign_id AS "campaignId", recipient_id AS "recipientId",
            template_id AS "templateId", recipient_contact AS "recipientContact",
            sent_at, status, error_message AS "errorMessage",
            provider_message_id AS "providerMessageId", provider_response,
            created_at AS "createdAt"
          FROM messagelogs
          WHERE id = $1;
        `;
        const result = await db.query(query, [id]);
        const row = result.rows[0];

        if (!row) {
            return {};
        }

        const sentAtDate = row.sent_at ? new Date(row.sent_at) : null;
        const createdAtDate = row.createdAt ? new Date(row.createdAt) : null; // Acceder a row.createdAt (con C mayúscula)

        const messageLog: MessageLog = {
            id: row.id,
            campaignId: row.campaignId,
            recipientId: row.recipientId,
            templateId: row.templateId,
            recipientContact: row.recipientContact,
            sent_at: sentAtDate ? sentAtDate.toISOString() : new Date(0).toISOString(),
            status: row.status,
            errorMessage: row.errorMessage,
            providerMessageId: row.providerMessageId,
            provider_response: row.provider_response,
            createdAt: createdAtDate ? createdAtDate.toISOString() : undefined,
        };
        return { messageLog };
    } catch (err: any) {
        console.error('Error de base de datos al obtener log de mensaje por ID:', err);
        return { error: `Error al obtener el log de mensaje: ${err.message}` };
    }
}

/**
 * Recupera logs de mensajes para una campaña específica.
 */
export async function getMessageLogsByCampaign(campaignId: string): Promise<{ messageLogs?: MessageLog[]; error?: string }> {
  const db = getDbPoolSafe();
  if (!db) {
      return { error: 'Database not available during build time or connection failed.' };
  }
  try {
    const query = `
      SELECT
        id, campaign_id AS "campaignId", recipient_id AS "recipientId",
        template_id AS "templateId", recipient_contact AS "recipientContact",
        sent_at, status, error_message AS "errorMessage",
        provider_message_id AS "providerMessageId", provider_response,
        created_at AS "createdAt"
      FROM messagelogs
      WHERE campaign_id = $1
      ORDER BY sent_at DESC;
    `;
    const result = await db.query(query, [campaignId]);
    const messageLogs: MessageLog[] = result.rows.map(row => {
        const sentAtDate = row.sent_at ? new Date(row.sent_at) : null;
        const createdAtDate = row.createdAt ? new Date(row.createdAt) : null; // Acceder a row.createdAt (con C mayúscula)

        return {
            id: row.id,
            campaignId: row.campaignId,
            recipientId: row.recipientId,
            templateId: row.templateId,
            recipientContact: row.recipientContact,
            sent_at: sentAtDate ? sentAtDate.toISOString() : new Date(0).toISOString(),
            status: row.status,
            errorMessage: row.errorMessage,
            providerMessageId: row.providerMessageId,
            provider_response: row.provider_response,
            createdAt: createdAtDate ? createdAtDate.toISOString() : undefined,
        };
    });

    return { messageLogs };
  } catch (err: any) {
    console.error('Error de base de datos al obtener logs de mensajes por campaña:', err);
    return { error: `Error al obtener los logs de mensajes por campaña: ${err.message}` };
  }
}

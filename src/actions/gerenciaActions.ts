
'use server';

import type { QueryResult } from 'pg';
import { getDbPool, getDbPoolSafe } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { getUserById } from './userActions';
import { revalidatePath } from 'next/cache';

export interface Gerencia {
    id: string;
    nombre: string;
    max_whatsapp_messages: number;
    max_sms_messages: number;
    max_ai_calls: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface GerenciaUsageStats {
    gerenciaId: string;
    gerenciaName: string;
    whatsapp: {
        sent: number;
        max: number;
        percentage: number;
    };
    sms: {
        sent: number;
        max: number;
        percentage: number;
    };
    aiCalls: {
        sent: number;
        max: number;
        percentage: number;
    };
}

export async function getAllGerencias(): Promise<{ gerencias?: Gerencia[], error?: string }> {
    try {
        const db = getDbPoolSafe();
        if (!db) {
            return { error: 'Database not available during build time or connection failed.' };
        }
        const query = 'SELECT id, nombre, max_whatsapp_messages, max_sms_messages, max_ai_calls, created_at AS "createdAt", updated_at AS "updatedAt" FROM gerencias ORDER BY nombre ASC;';
        const result: QueryResult<Gerencia> = await db.query(query);
        return { gerencias: result.rows };
    } catch(err: any) {
        console.error("Error fetching gerencias:", err);
        return { error: `Error de base de datos: ${err.message}` };
    }
}

export async function getGerenciaForCurrentUser(): Promise<{ gerencia?: Gerencia, error?: string }> {
    const user = await getCurrentUser();
    if (!user?.id) {
        return { error: 'Usuario no autenticado.' };
    }
    
    // We need the full user record to get the gerencia_id
    const userRecordResult = await getUserById(user.id);
    if (userRecordResult.error || !userRecordResult.user?.gerencia_id) {
        return { error: 'Usuario no encontrado o no asignado a una gerencia.' };
    }
    
    const gerenciaId = userRecordResult.user.gerencia_id;

    try {
        const db = getDbPoolSafe();
        if (!db) {
            return { error: 'Database not available during build time or connection failed.' };
        }
        const query = 'SELECT id, nombre, max_whatsapp_messages, max_sms_messages, max_ai_calls, created_at AS "createdAt", updated_at AS "updatedAt" FROM gerencias WHERE id = $1;';
        const result = await db.query(query, [gerenciaId]);
        const gerencia = result.rows[0];

        if (!gerencia) {
            return { error: 'No se encontró la gerencia asignada al usuario.' };
        }

        return { gerencia };
    } catch (err: any) {
        console.error(`Error fetching gerencia with id ${gerenciaId}:`, err);
        return { error: `Error de base de datos: ${err.message}` };
    }
}

export async function getGerenciaUsageStats(): Promise<{ stats?: GerenciaUsageStats, error?: string }> {
    const user = await getCurrentUser();
    if (!user?.id) {
        return { error: 'Usuario no autenticado.' };
    }
    
    // We need the full user record to get the gerencia_id
    const userRecordResult = await getUserById(user.id);
    if (userRecordResult.error || !userRecordResult.user?.gerencia_id) {
        return { error: 'Usuario no encontrado o no asignado a una gerencia.' };
    }

    const gerenciaId = userRecordResult.user.gerencia_id;
    const gerenciaName = userRecordResult.user.gerencia_nombre || 'N/A';
    const monthPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

    try {
        const db = getDbPoolSafe();
        if (!db) {
            return { error: 'Database not available during build time or connection failed.' };
        }
        const query = `
            SELECT 
                g.max_whatsapp_messages,
                g.max_sms_messages,
                g.max_ai_calls,
                (SELECT sent_count FROM gerenciamessagecounts WHERE gerencia_id = g.id AND channel = 'whatsapp' AND month_period = $2) AS whatsapp_sent,
                (SELECT sent_count FROM gerenciamessagecounts WHERE gerencia_id = g.id AND channel = 'sms' AND month_period = $2) AS sms_sent,
                (SELECT sent_count FROM gerenciamessagecounts WHERE gerencia_id = g.id AND channel = 'llamada-ia' AND month_period = $2) AS ai_calls_sent
            FROM gerencias g
            WHERE g.id = $1;
        `;
        const result = await db.query(query, [gerenciaId, monthPeriod]);

        if (result.rows.length === 0) {
            return { error: 'Gerencia no encontrada.' };
        }

        const row = result.rows[0];
        const maxWhatsapp = row.max_whatsapp_messages || 0;
        const maxSms = row.max_sms_messages || 0;
        const maxAiCalls = row.max_ai_calls || 0;
        const sentWhatsapp = parseInt(row.whatsapp_sent, 10) || 0;
        const sentSms = parseInt(row.sms_sent, 10) || 0;
        const sentAiCalls = parseInt(row.ai_calls_sent, 10) || 0;
        
        const stats: GerenciaUsageStats = {
            gerenciaId,
            gerenciaName,
            whatsapp: {
                sent: sentWhatsapp,
                max: maxWhatsapp,
                percentage: maxWhatsapp > 0 ? Math.round((sentWhatsapp / maxWhatsapp) * 100) : 0,
            },
            sms: {
                sent: sentSms,
                max: maxSms,
                percentage: maxSms > 0 ? Math.round((sentSms / maxSms) * 100) : 0,
            },
            aiCalls: {
                sent: sentAiCalls,
                max: maxAiCalls,
                percentage: maxAiCalls > 0 ? Math.round((sentAiCalls / maxAiCalls) * 100) : 0,
            }
        };

        return { stats };

    } catch (err: any) {
        console.error('Error fetching gerencia usage stats:', err);
        return { error: `Error de base de datos: ${err.message}` };
    }
}

export async function updateGerenciaLimits(
    gerenciaId: string,
    formData: FormData
): Promise<{ success?: boolean; error?: string }> {
    const currentUser = await getCurrentUser();
    if (currentUser?.role !== 'admin') {
        return { error: "Acción no autorizada. Requiere rol de administrador." };
    }

    const userRecordResult = await getUserById(currentUser.id);
    if(userRecordResult.error || !userRecordResult.user?.gerencia_id) {
        return { error: "No se pudo verificar la gerencia del administrador." };
    }

    if (userRecordResult.user.gerencia_id !== gerenciaId) {
        return { error: "Acción no autorizada. Solo puedes modificar los límites de tu propia gerencia." };
    }

    const maxWhatsapp = formData.get('max_whatsapp_messages');
    const maxSms = formData.get('max_sms_messages');
    const maxAiCalls = formData.get('max_ai_calls');

    if (maxWhatsapp === null || maxSms === null || maxAiCalls === null) {
        return { error: "Valores para los límites no proporcionados." };
    }
    
    const maxWhatsappNum = parseInt(maxWhatsapp as string, 10);
    const maxSmsNum = parseInt(maxSms as string, 10);
    const maxAiCallsNum = parseInt(maxAiCalls as string, 10);

    if (isNaN(maxWhatsappNum) || isNaN(maxSmsNum) || isNaN(maxAiCallsNum) || maxWhatsappNum < 0 || maxSmsNum < 0 || maxAiCallsNum < 0) {
        return { error: "Los límites deben ser números enteros no negativos." };
    }

    try {
        const db = getDbPool(); // Use regular getDbPool for runtime operations
        if (!db) {
            return { error: 'No se pudo conectar a la base de datos.' };
        }
        const query = `
            UPDATE gerencias
            SET max_whatsapp_messages = $1, max_sms_messages = $2, max_ai_calls = $3, updated_at = NOW()
            WHERE id = $4;
        `;
        await db.query(query, [maxWhatsappNum, maxSmsNum, maxAiCallsNum, gerenciaId]);
        
        revalidatePath('/dashboard/settings');
        revalidatePath('/dashboard'); // To refresh stats in header
        return { success: true };
    } catch(err: any) {
        console.error("Error updating gerencia limits:", err);
        return { error: `Error de base de datos: ${err.message}` };
    }
}

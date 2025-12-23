
'use server';

import { revalidatePath } from 'next/cache';
import type { Campaign, CampaignRecipient, Template, CampaignStatus, CampaignRecipientStatus, MessageStatus, CampaignCategory } from '@/lib/mock-data';
import { getDbPool, getDbPoolSafe, checkAndIncrementMessageCount, checkMessageLimit, incrementMessageCountBatch } from '@/lib/db';
import { createMessageLog } from './messageLogActions';
import { getTemplateById } from './templateActions';
import { format, addDays, addWeeks, addMonths, isPast, parseISO } from 'date-fns';
import { getCurrentUser } from '@/lib/session';
import type { PoolClient, Client } from 'pg';
import { getUserById } from './userActions';
import { Bot } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const YALO_CHAT_PHONE_PREFIX = process.env.YALO_CHAT_PHONE_PREFIX || "+502";
const DEFAULT_WHATSAPP_LANG_CODE = process.env.DEFAULT_WHATSAPP_LANG_CODE || "es_MX";
const CAMPAIGN_BATCH_SIZE = parseInt(process.env.CAMPAIGN_BATCH_SIZE || "25", 10);


/**
 * Reemplaza los placeholders en una cadena de texto con los valores de un objeto.
 * Ejemplo: "Hola {{nombre}}!" con { nombre: "Juan" } se convierte en "Hola Juan!".
 * @param content El contenido de la plantilla con placeholders.
 * @param params Un objeto con los valores para reemplazar los placeholders.
 * @returns El contenido con los placeholders reemplazados.
 */
export async function interpolateTemplate(content: string, params: Record<string, any>): Promise<string> {
  if (!content) return "";
  let interpolatedContent = content;
  for (const key in params) {
    // Usar una expresión regular global para reemplazar todas las ocurrencias
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    // Si el valor es null o undefined, reemplazar por una cadena vacía para evitar "null" o "undefined" en el mensaje
    const value = params[key] !== null && params[key] !== undefined ? params[key] : "";
    interpolatedContent = interpolatedContent.replace(regex, value);
  }
  return interpolatedContent;
}

// --- YaloChat WhatsApp Sending Logic ---
export async function sendWhatsAppMessage(
  contact: string,
  templateName: string,
  languageCode: string,
  templateParams: Record<string, any>
): Promise<{ success: boolean; messageId?: string; error?: string; providerResponse?: any }> {

  const yaloApiToken = process.env.YALO_CHAT_API_TOKEN;

  if (!yaloApiToken) {
    console.error("YaloChat API token (YALO_CHAT_API_TOKEN) is not configurado in environment variables.");
    return { success: false, error: "YaloChat API token no configurado." };
  }

  const rawApiUrl = process.env.YALO_CHAT_API_URL || "https://api-global.yalochat.com/notifications/api/v1/accounts/genesis-wa-jp/bots/genesis-wa-jp/notifications";
  // Clean the URL to remove whitespace and trailing semicolons
  const YALO_CHAT_API_URL = rawApiUrl.trim().replace(/;+$/, '');

  // Validate URL
  try {
    new URL(YALO_CHAT_API_URL);
  } catch(e) {
    console.error(`La URL de la API de YaloChat no es una URL válida: ${YALO_CHAT_API_URL}`);
    return { success: false, error: "La URL de la API de YaloChat no es una URL válida." };
  }
  
  const cleanedPrefix = YALO_CHAT_PHONE_PREFIX.replace(/\D/g, '');
  let cleanedContact = contact.replace(/\D/g, '');
  if (cleanedContact.startsWith(cleanedPrefix)) {
    cleanedContact = cleanedContact.substring(cleanedPrefix.length);
  }
  const fullPhoneNumber = `+${cleanedPrefix}${cleanedContact}`;

  const body = {
    type: templateName, // This should be the name of your template in Yalo
    users: [
      {
        priority: "NORMAL", // Or as needed
        phone: fullPhoneNumber,
        params: templateParams, // Yalo expects parameters directly in the 'params' object
      },
    ],
  };

  try {
    const response = await fetch(YALO_CHAT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${yaloApiToken}`,
      },
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    if (response.ok) {
      // YaloChat response structure might vary. Adjust if 'request_id' is not the correct field for a message ID.
      return { success: true, messageId: responseData?.request_id || `yalo_req_${Date.now()}`, providerResponse: responseData };
    } else {
      const errorMessage = responseData?.message || responseData?.error?.message || responseData?.errors?.[0]?.message || 'Failed to send WhatsApp message via YaloChat';
      return { success: false, error: errorMessage, providerResponse: responseData };
    }
  } catch (e: any) {
    console.error(`Error calling YaloChat API for ${fullPhoneNumber}:`, e);
    return { success: false, error: e.message, providerResponse: { error: e.toString() } };
  }
}

// --- SMS Sending Logic ---
export async function sendSmsMessage(
  contact: string,
  messageContent: string
): Promise<{ success: boolean; messageId?: string; error?: string; providerResponse?: any }> {
  const rawApiUrl = process.env.SMS_API_URL;
  const apiId = process.env.SMS_API_ID;
  const apiKey = process.env.SMS_API_KEY;

  if (!rawApiUrl || !apiId || !apiKey) {
    const missingVars = [
      !rawApiUrl ? 'SMS_API_URL' : null,
      !apiId ? 'SMS_API_ID' : null,
      !apiKey ? 'SMS_API_KEY' : null,
    ].filter(Boolean).join(', ');
    console.error(`Faltan variables de entorno para SMS: ${missingVars}`);
    return { success: false, error: `Configuración de SMS incompleta. Faltan: ${missingVars}` };
  }

  // Clean the URL to remove whitespace and trailing semicolons
  const apiUrl = rawApiUrl.trim().replace(/;+$/, '');

  // Validate URL
  try {
    new URL(apiUrl);
  } catch(e) {
    console.error(`La URL de la API de SMS no es una URL válida: ${apiUrl}`);
    return { success: false, error: "La URL de la API de SMS no es una URL válida." };
  }

  // Header 'apid: 3' as per C# reference.
  const headers = {
    'Content-Type': 'application/json',
    'apid': '3' 
  };

  const body = {
    apid: apiId,
    apikey: apiKey,
    tel: contact,
    mensaje: messageContent,
    response: ""
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();

    if (response.ok) {
      return { success: true, messageId: `sms_req_${Date.now()}`, providerResponse: responseText };
    } else {
      return { success: false, error: `Error del proveedor de SMS (${response.status}).`, providerResponse: responseText };
    }

  } catch (e: any) {
    return { success: false, error: e.message, providerResponse: { error: e.toString() } };
  }
}

// --- HiveAI "Llamada IA" Sending Logic ---
export async function sendAiCall(
  contact: string,
  callType: string,
  templateParams: Record<string, any>
): Promise<{ success: boolean; messageId?: string; error?: string; providerResponse?: any }> {
    
  const hiveApiToken = process.env.HIVEAI_API_TOKEN;
  if (!hiveApiToken) {
    console.error("HiveAI API token (HIVEAI_API_TOKEN) is not configured in environment variables.");
    return { success: false, error: "HiveAI API token no configurado." };
  }

  const HIVEAI_API_URL = "https://genesis.hiveai.aidtogrow.cloud/api/calls";
  
  // Clean the number of any non-digit characters
  let cleanedContact = contact.replace(/\D/g, '');
  // Ensure it has the +502 prefix
  if (!cleanedContact.startsWith('502')) {
      cleanedContact = `502${cleanedContact}`;
  }
  const fullPhoneNumber = `+${cleanedContact}`;


  const body = {
    call_type: callType,
    nombre_cliente: templateParams.nombre_cliente || "Cliente", // Default value if not provided
    nombre_agente: templateParams.nombre_agente || "Agente Virtual",
    nombre_empresa: templateParams.nombre_empresa || "Génesis Empresarial",
    phone_number: fullPhoneNumber,
    // Add optional parameters from the template
    ...templateParams
  };

  try {
    const response = await fetch(HIVEAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': hiveApiToken,
      },
      body: JSON.stringify(body),
    });

    // Handle cases where the response might not have a body
    let responseData: any = {};
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        responseData = await response.json();
    } else {
        responseData = { text: await response.text() };
    }

    if (response.ok) {
      return { success: true, messageId: `hiveai_req_${Date.now()}`, providerResponse: responseData };
    } else {
      const errorMessage = responseData?.detail || responseData?.message || 'Failed to initiate AI call via HiveAI';
      return { success: false, error: errorMessage, providerResponse: responseData };
    }
  } catch (e: any) {
    return { success: false, error: e.message, providerResponse: { error: e.toString() } };
  }
}


// --- Funciones CRUD para Campañas ---

export async function createCampaign(
    formData: FormData
): Promise<{ campaign?: Campaign; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'No autenticado. Por favor, inicie sesión.' };
  }

  try {
    const db = getDbPool(); // Runtime operation
    if (!db) {
        return { error: 'No se pudo conectar a la base de datos.' };
    }

    const rawCampaignName = formData.get('campaignName') as string;
    const rawTemplateId = formData.get('templateId') as string;
    const rawDbQuery = formData.get('dbQuery') as string;
    const rawCategory = formData.get('category') as CampaignCategory | null;

    const rawScheduleFrequency = formData.get('scheduleFrequency') as string;
    const rawScheduleTime = formData.get('scheduleTime') as string;
    const rawScheduleDateISO = formData.get('scheduleDate') as string | null;

    if (!rawCampaignName || rawCampaignName.length < 3) {
      return { error: 'Nombre de campaña inválido. Debe tener al menos 3 caracteres.' };
    }
    if (!rawTemplateId) {
      return { error: 'ID de plantilla no proporcionado o inválido.' };
    }
     if (!rawCategory) {
      return { error: 'Debes seleccionar una categoría para la campaña.' };
    }

    const templateResult = await getTemplateById(rawTemplateId);
    if (templateResult.error || !templateResult.template) {
      return { error: `Plantilla no encontrada: ${templateResult.error || 'El ID de plantilla no existe.'}` };
    }
    const template = templateResult.template;
    const templateType = template.type;

    if (user.role !== 'admin' && template.status !== 'Aprobada') {
        return { error: 'Los colaboradores solo pueden usar plantillas aprobadas.' };
    }

    if (!rawDbQuery) {
        return { error: 'Se requiere la consulta SQL para obtener los destinatarios.'}
    }
    const recipientsCount = 0; // Se actualizará dinámicamente al procesar.

    let scheduleNextRunFormatted: string | null = null;
    if (rawScheduleDateISO) {
        const dateObj = new Date(rawScheduleDateISO);
        if (!isNaN(dateObj.getTime())) {
            scheduleNextRunFormatted = format(dateObj, "yyyy-MM-dd");
        } else {
            return { error: 'Fecha de programación inválida.'}
        }
    }
    
    // Status depends on user role
    const status: CampaignStatus = user.role === 'admin' ? 'Borrador' : 'Solicitud';
    const userId = user.id;

    const query = `
      INSERT INTO campaigns (
        name, type, template_id, category,
        recipient_db_query,
        recipients_count,
        schedule_frequency, schedule_time, schedule_date,
        status, user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, name, type, template_id AS "templateId", category,
                recipient_db_query AS "recipientDbQuery",
                recipients_count AS "recipientsCount",
                schedule_frequency AS "scheduleFrequency", schedule_time AS "scheduleTime",
                schedule_date AS "scheduleDate", status, user_id AS "userId",
                created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const values = [
      rawCampaignName, templateType, rawTemplateId, rawCategory,
      rawDbQuery,
      recipientsCount,
      rawScheduleFrequency, rawScheduleTime, scheduleNextRunFormatted,
      status,
      userId,
    ];
    const result = await db.query(query, values);
    const newCampaignRow = result.rows[0];

    if (!newCampaignRow) {
      return { error: 'No se pudo crear la campaña en la base de datos.' };
    }

    const newCampaign: Campaign = {
        id: newCampaignRow.id,
        name: newCampaignRow.name,
        type: newCampaignRow.type,
        category: newCampaignRow.category,
        templateId: newCampaignRow.templateId,
        recipientDbQuery: newCampaignRow.recipientDbQuery,
        recipientsCount: newCampaignRow.recipientsCount,
        schedule: {
            frequency: newCampaignRow.scheduleFrequency,
            time: newCampaignRow.scheduleTime,
            nextRun: newCampaignRow.scheduleDate ? new Date(newCampaignRow.scheduleDate).toISOString().split('T')[0] : undefined
        },
        status: newCampaignRow.status as CampaignStatus,
        userId: newCampaignRow.userId,
        createdAt: newCampaignRow.createdAt.toISOString(),
    };

    revalidatePath('/dashboard/campaigns');
    revalidatePath('/dashboard');
    return { campaign: newCampaign };
  } catch (err: any)
 {
    console.error('Error de base de datos al crear campaña:', err);
    return { error: `Error al crear la campaña: ${err.message}` };
  }
}

export async function getAllCampaigns(): Promise<{campaigns?: Campaign[], error?: string}> {
  try {
    const db = getDbPoolSafe(); // Could be called during build
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    const query = `
      SELECT
        id, name, type, template_id AS "templateId", category,
        recipient_db_query AS "recipientDbQuery",
        recipients_count AS "recipientsCount",
        schedule_frequency AS "scheduleFrequency",
        schedule_time AS "scheduleTime",
        schedule_date AS "scheduleDate",
        status, user_id AS "userId",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM campaigns
      ORDER BY "createdAt" DESC;
    `;
    const result = await db.query(query);
    const campaigns: Campaign[] = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        category: row.category,
        templateId: row.templateId,
        recipientDbQuery: row.recipientDbQuery,
        recipientsCount: row.recipientsCount,
        schedule: {
            frequency: row.scheduleFrequency,
            time: row.scheduleTime,
            nextRun: row.scheduleDate ? new Date(row.scheduleDate).toISOString().split('T')[0] : undefined
        },
        status: row.status as CampaignStatus,
        userId: row.userId,
        createdAt: row.createdAt.toISOString(),
    }));

    return { campaigns };
  } catch (err: any) {
    console.error('Error de base de datos al obtener campañas:', err);
    return { error: `Error al obtener las campañas: ${err.message}` };
  }
}

export async function getCampaignById(id: string): Promise<{campaign?: Campaign, error?: string}> {
  try {
    const db = getDbPoolSafe(); // Could be called during build
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    const query = `
      SELECT
        c.id, c.name, c.type, c.template_id AS "templateId", c.category,
        c.recipient_db_query AS "recipientDbQuery",
        c.recipients_count AS "recipientsCount",
        c.schedule_frequency AS "scheduleFrequency",
        c.schedule_time AS "scheduleTime",
        c.schedule_date AS "scheduleDate",
        c.status, c.user_id as "userId",
        c.created_at AS "createdAt", c.updated_at AS "updatedAt"
      FROM campaigns c
      WHERE c.id = $1;
    `;
    const result = await db.query(query, [id]);
    const campaignRow = result.rows[0];

    if (!campaignRow) {
      return { error: 'Campaña no encontrada.' };
    }

    const campaign: Campaign = {
        id: campaignRow.id,
        name: campaignRow.name,
        type: campaignRow.type,
        category: campaignRow.category,
        templateId: campaignRow.templateId,
        recipientDbQuery: campaignRow.recipientDbQuery,
        recipientsCount: campaignRow.recipientsCount,
        schedule: {
            frequency: campaignRow.scheduleFrequency,
            time: campaignRow.scheduleTime,
            nextRun: campaignRow.scheduleDate ? new Date(campaignRow.scheduleDate).toISOString().split('T')[0] : undefined
        },
        status: campaignRow.status as CampaignStatus,
        userId: campaignRow.userId,
        createdAt: campaignRow.createdAt.toISOString(),
    };

    return { campaign };
  } catch (err: any) {
    console.error('Error de base de datos al obtener campaña por ID:', err);
    return { error: `Error al obtener la campaña: ${err.message}` };
  }
}

export async function updateCampaign(
    id: string,
    campaignData: Partial<Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>
): Promise<{ campaign?: Campaign; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'No autenticado.' };
  
  const { campaign: currentCampaign } = await getCampaignById(id);
  if (!currentCampaign) return { error: "Campaña a actualizar no encontrada." };

  if (user.role !== 'admin' && currentCampaign.userId !== user.id) {
      return { error: "No tienes permiso para editar esta campaña." };
  }

  try {
    const db = getDbPool(); // Runtime operation
    if (!db) {
        return { error: 'No se pudo conectar a la base de datos.' };
    }
    const {
        name, templateId, schedule, status, recipientsCount, type, category,
        recipientDbQuery
    } = campaignData;

    const fieldsToUpdate: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) { fieldsToUpdate.push(`name = $${paramIndex++}`); values.push(name); }
    if (type !== undefined) { fieldsToUpdate.push(`type = $${paramIndex++}`); values.push(type); }
    if (category !== undefined) { fieldsToUpdate.push(`category = $${paramIndex++}`); values.push(category); }
    if (templateId !== undefined) { fieldsToUpdate.push(`template_id = $${paramIndex++}`); values.push(templateId); }

    if (recipientDbQuery !== undefined) { fieldsToUpdate.push(`recipient_db_query = $${paramIndex++}`); values.push(recipientDbQuery); }

    if (recipientsCount !== undefined) { fieldsToUpdate.push(`recipients_count = $${paramIndex++}`); values.push(recipientsCount); }

    if (schedule?.frequency !== undefined) { fieldsToUpdate.push(`schedule_frequency = $${paramIndex++}`); values.push(schedule.frequency); }
    if (schedule?.time !== undefined) { fieldsToUpdate.push(`schedule_time = $${paramIndex++}`); values.push(schedule.time); }

    if (schedule && schedule.nextRun !== undefined) {
      fieldsToUpdate.push(`schedule_date = $${paramIndex++}`);
      values.push(schedule.nextRun ? new Date(schedule.nextRun).toISOString().split('T')[0] : null);
    } else if (schedule && Object.prototype.hasOwnProperty.call(schedule, 'nextRun') && schedule.nextRun === undefined) {
      fieldsToUpdate.push(`schedule_date = $${paramIndex++}`); values.push(null);
    }

    if (status !== undefined) {
      // Solo un admin puede cambiar el estado a algo diferente de 'Solicitud'
      if (user.role !== 'admin' && status !== 'Solicitud') {
        // Ignorar el cambio de estado si un colaborador intenta hacerlo
      } else {
        fieldsToUpdate.push(`status = $${paramIndex++}`);
        values.push(status);
      }
    }

    if (fieldsToUpdate.length === 0 && Object.keys(campaignData).length > 0) {
       fieldsToUpdate.push(`updated_at = NOW()`);
    } else if (fieldsToUpdate.length > 0) {
       fieldsToUpdate.push(`updated_at = NOW()`);
    } else {
        return { campaign: currentCampaign };
    }

    values.push(id);

    const query = `
      UPDATE campaigns
      SET ${fieldsToUpdate.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, type, template_id AS "templateId", category,
                recipient_db_query AS "recipientDbQuery",
                recipients_count AS "recipientsCount",
                schedule_frequency AS "scheduleFrequency", schedule_time AS "scheduleTime",
                schedule_date AS "scheduleDate", status, user_id AS "userId",
                created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const result = await db.query(query, values);
    const updatedCampaignRow = result.rows[0];

    if (!updatedCampaignRow) {
      return { error: 'Campaña no encontrada o no se pudo actualizar.' };
    }

    const updatedCampaign: Campaign = {
        id: updatedCampaignRow.id,
        name: updatedCampaignRow.name,
        type: updatedCampaignRow.type,
        category: updatedCampaignRow.category,
        templateId: updatedCampaignRow.templateId,
        recipientDbQuery: updatedCampaignRow.recipientDbQuery,
        recipientsCount: updatedCampaignRow.recipientsCount,
        schedule: {
            frequency: updatedCampaignRow.scheduleFrequency,
            time: updatedCampaignRow.scheduleTime,
            nextRun: updatedCampaignRow.scheduleDate ? new Date(updatedCampaignRow.scheduleDate).toISOString().split('T')[0] : undefined
        },
        status: updatedCampaignRow.status as CampaignStatus,
        userId: updatedCampaignRow.userId,
        createdAt: updatedCampaignRow.createdAt.toISOString(),
    };

    revalidatePath('/dashboard/campaigns');
    revalidatePath(`/dashboard/campaign/${id}`);
    revalidatePath('/dashboard');
    return { campaign: updatedCampaign };
  } catch (err: any) {
    console.error('Error de base de datos al actualizar campaña:', err);
    return { error: `Error al actualizar la campaña: ${err.message}` };
  }
}

export async function deleteCampaign(id: string): Promise<{ success?: boolean; message?: string; error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') {
    return { error: "Acción no autorizada. Requiere rol de administrador." };
  }

  try {
    const db = getDbPool(); // Runtime operation
    if (!db) {
        return { error: 'No se pudo conectar a la base de datos.' };
    }
    const query = `DELETE FROM campaigns WHERE id = $1 RETURNING id;`;
    const result = await db.query(query, [id]);

    if (result.rowCount === 0) {
      return { success: false, message: 'Campaña no encontrada.' };
    }

    revalidatePath('/dashboard/campaigns');
    revalidatePath('/dashboard');
    return { success: true, message: 'Campaña eliminada exitosamente.' };
  } catch (err: any) {
    console.error('Error de base de datos al eliminar campaña:', err);
     if ((err as any).code === '23503') { // Error de FK
        return { error: 'No se puede eliminar la campaña. Aún existen logs de mensajes asociados directamente a esta campaña. Revisa las restricciones de FK en MessageLogs.' };
    }
    return { error: `Error al eliminar la campaña: ${err.message}` };
  }
}

async function getRecipientsForCampaign(
    campaign: Campaign,
    template: Template,
    dbClient: PoolClient // Use the provided client
): Promise<{ recipients: Array<Omit<CampaignRecipient, 'id' | 'campaignId' | 'status' | 'processedAt'>>; error?: string }> {
    let fetchedRecipients: Array<Omit<CampaignRecipient, 'id' | 'campaignId' | 'status' | 'processedAt'>> = [];
    
    if (!campaign.recipientDbQuery) {
        return { recipients: [], error: "La campaña no tiene una consulta SQL configurada para obtener destinatarios." };
    }

    console.log(`Procesando consulta en BD para campaña ${campaign.name}: ${campaign.recipientDbQuery}`);
    try {
        // 1. Get recipients from the main query
        const queryResult = await dbClient.query(campaign.recipientDbQuery.replace(/;$/, ''));
        let rows = queryResult.rows;

        // 2. Get excluded contacts for this campaign
        const exclusionResult = await dbClient.query('SELECT contact FROM campaignexclusions WHERE campaign_id = $1', [campaign.id]);
        const excludedContacts = new Set(exclusionResult.rows.map(r => String(r.contact).trim()));

        // 3. Filter out excluded contacts
        if (excludedContacts.size > 0) {
            rows = rows.filter(row => {
                const contact = row.contacto || row.CONTACTO || row.contact || row.phone || row.PHONE || row.telefono || row.TELEFONO;
                return !excludedContacts.has(String(contact).trim());
            });
        }


        let paramsToExtract = [...(template.parameters || [])];
        
        if (template.type === 'llamada-ia') {
            const mandatoryAiCallParams = ['nombre_cliente', 'nombre_agente', 'nombre_empresa'];
            paramsToExtract = Array.from(new Set([...paramsToExtract, ...mandatoryAiCallParams]));
        }

        fetchedRecipients = rows.map(row => {
            const params: Record<string, any> = {};
            paramsToExtract.forEach(pKey => {
                const lowerPKey = pKey.toLowerCase();
                let found = false;
                // First, search for a case-insensitive match
                for (const rowKey in row) {
                    if (rowKey.toLowerCase() === lowerPKey) {
                        const value = row[rowKey];
                        params[pKey] = typeof value === 'string' ? value.trim() : value;
                        found = true;
                        break;
                    }
                }
                // If not found, try with the exact parameter name (case-sensitive)
                if (!found && row[pKey] !== undefined) {
                     const value = row[pKey];
                     params[pKey] = typeof value === 'string' ? value.trim() : value;
                } else if (!found) {
                    // console.warn(`Template parameter '${pKey}' not found in query result row for ${campaign.name}. Row:`, row);
                }
            });
            const rawContact = row.contacto || row.CONTACTO || row.contact || row.phone || row.PHONE || row.telefono || row.TELEFONO;
            return {
                contact: typeof rawContact === 'string' ? rawContact.trim() : rawContact,
                parameters: params
            };
        }).filter(r => {
            if(!r.contact){
                console.warn(`Record skipped for campaign ${campaign.name} due to missing 'contacto' field (or similar) in query results.`);
                return false;
            }
            return true;
        });

        console.log(`BD: Se obtuvieron ${fetchedRecipients.length} destinatarios de la consulta para ${campaign.name}.`);
        return { recipients: fetchedRecipients };
    } catch (err: any) {
        console.error(`Error ejecutando query en BD para ${campaign.name}:`, err.message, err.stack);
        return { recipients: [], error: `Error en BD al ejecutar query: ${err.message}` };
    }
}

async function processAndSendMessages(
    campaign: Campaign,
    recipientsToProcess: CampaignRecipient[],
    template: Template,
    isTestRun: boolean,
    dbClient: PoolClient
) {
    let totalErrorCount = 0;
    const recipientStatusPrefix = isTestRun ? '(Prueba)' : '';
    const langCode = template.type === 'whatsapp' ? DEFAULT_WHATSAPP_LANG_CODE : "es";

    if (!campaign.userId) {
        console.error(`Campaña ${campaign.id} no tiene un usuario creador. No se pueden verificar los límites de mensajes.`);
        for (const recipient of recipientsToProcess) {
            await dbClient.query(`UPDATE campaignrecipients SET status = $1, error_message = $2 WHERE id = $3`, ['Fallido', 'Campaña sin creador', recipient.id]);
        }
        return { totalErrorCount: recipientsToProcess.length };
    }
    const campaignCreatorResult = await getUserById(campaign.userId, dbClient as unknown as Client);
    if (!campaignCreatorResult.user || !campaignCreatorResult.user.gerencia_id) {
        console.error(`No se pudo encontrar el creador o su gerencia para la campaña ${campaign.id}.`);
        for (const recipient of recipientsToProcess) {
            await dbClient.query(`UPDATE campaignrecipients SET status = $1, error_message = $2 WHERE id = $3`, ['Fallido', 'Creador/Gerencia no encontrado', recipient.id]);
        }
        return { totalErrorCount: recipientsToProcess.length };
    }
    const gerenciaId = campaignCreatorResult.user.gerencia_id;
    const channelForLimit: 'whatsapp' | 'sms' | 'llamada-ia' = template.type as any;

    const BATCH_SIZE = CAMPAIGN_BATCH_SIZE;
    for (let i = 0; i < recipientsToProcess.length; i += BATCH_SIZE) {
        const batch = recipientsToProcess.slice(i, i + BATCH_SIZE);
        
        const limitCheck = await checkMessageLimit(gerenciaId, channelForLimit, dbClient as unknown as Client);
        let messagesToSendInBatch = batch.length;
        if(limitCheck.limit > 0) { // 0 o -1 significa sin límite
            const remaining = limitCheck.limit - limitCheck.sent;
            if(remaining <= 0) {
                 console.warn(`Límite de mensajes para gerencia ${gerenciaId} alcanzado. Omitiendo ${recipientsToProcess.length - i} destinatarios.`);
                 // Marcar los restantes como fallidos por límite
                 const remainingRecipients = recipientsToProcess.slice(i);
                 for (const recip of remainingRecipients) {
                    await dbClient.query(`UPDATE campaignrecipients SET status = $1, error_message = $2 WHERE id = $3`, ['Fallido', 'Límite de gerencia alcanzado', recip.id]);
                 }
                 totalErrorCount += remainingRecipients.length;
                 break; // Salir del bucle principal
            }
            messagesToSendInBatch = Math.min(batch.length, remaining);
        }

        const batchPromises = batch.slice(0, messagesToSendInBatch).map(async (recipient) => {
            let recipientStatus: CampaignRecipientStatus;
            let messageLogStatus: MessageStatus;
            let errorMessage: string | null = null;
            let providerMessageId: string | undefined = undefined;
            let providerResponse: any = null;

            try {
                if (template.type === 'whatsapp') {
                    const sendResult = await sendWhatsAppMessage(recipient.contact, template.name, langCode, recipient.parameters);
                    if (!sendResult.success) throw new Error(sendResult.error || "Error desconocido del proveedor de WhatsApp");
                    providerMessageId = sendResult.messageId; providerResponse = sendResult.providerResponse;
                } else if (template.type === 'sms') {
                    const messageContent = await interpolateTemplate(template.content, recipient.parameters);
                    const sendResult = await sendSmsMessage(recipient.contact, messageContent);
                    if (!sendResult.success) throw new Error(sendResult.error || "Error desconocido del proveedor de SMS");
                    providerMessageId = sendResult.messageId; providerResponse = sendResult.providerResponse;
                } else if (template.type === 'llamada-ia') {
                    const callType = template.content;
                    const sendResult = await sendAiCall(recipient.contact, callType, recipient.parameters);
                    if (!sendResult.success) throw new Error(sendResult.error || "Error desconocido del proveedor de Llamada IA");
                    providerMessageId = sendResult.messageId; providerResponse = sendResult.providerResponse;
                } else {
                    throw new Error(`Envío no implementado para tipo de plantilla: ${template.type}`);
                }
                recipientStatus = isTestRun ? 'Enviado (Prueba)' : 'Enviado';
                messageLogStatus = isTestRun ? 'Enviado (Prueba)' : 'Enviado';
            } catch (sendError: any) {
                recipientStatus = isTestRun ? 'Fallido (Prueba)' : 'Fallido';
                messageLogStatus = isTestRun ? 'Error (Prueba)' : 'Error';
                errorMessage = sendError.message;
                providerResponse = (sendError as any).providerResponse ? (sendError as any).providerResponse : { error: sendError.toString() };
            }
            
            // Retornar resultado para actualizar BD y logs de forma agrupada
            return {
                recipientId: recipient.id,
                recipientStatus, messageLogStatus, errorMessage,
                providerMessageId, providerResponse,
                recipientContact: recipient.contact,
            };
        });

        const results = await Promise.allSettled(batchPromises);
        let successfulSendsInBatch = 0;
        
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                const { recipientId, recipientStatus, messageLogStatus, errorMessage, providerMessageId, providerResponse, recipientContact } = result.value;
                await dbClient.query(
                    `UPDATE campaignrecipients SET status = $1, processed_at = NOW(), error_message = $2, provider_message_id = $3, provider_response = $4 WHERE id = $5`,
                    [recipientStatus, errorMessage, providerMessageId, providerResponse ? JSON.stringify(providerResponse) : null, recipientId]
                );
                await createMessageLog({
                    campaignId: campaign.id, recipientId, templateId: campaign.templateId, recipientContact,
                    sent_at: new Date().toISOString(), status: messageLogStatus, errorMessage: errorMessage || undefined,
                    providerMessageId: providerMessageId, provider_response: providerResponse,
                }, dbClient);
                if (messageLogStatus.startsWith('Enviado')) {
                    successfulSendsInBatch++;
                } else {
                    totalErrorCount++;
                }
            } else {
                console.error("Una promesa de envío falló inesperadamente:", result.reason);
                totalErrorCount++;
            }
        }
        
        if (successfulSendsInBatch > 0) {
            await incrementMessageCountBatch(gerenciaId, channelForLimit, successfulSendsInBatch, dbClient as unknown as Client);
        }
    }

    return { totalErrorCount };
}

export async function approveCampaign(campaignId: string): Promise<{ success?: boolean; campaign?: Campaign; error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') {
    return { error: "Acción no autorizada. Requiere rol de administrador." };
  }

  try {
    const currentCampaignResult = await getCampaignById(campaignId);
    if (currentCampaignResult.error || !currentCampaignResult.campaign) {
      return { error: currentCampaignResult.error || "Campaña no encontrada." };
    }
    const campaign = currentCampaignResult.campaign;

    if (campaign.status !== 'Borrador' && campaign.status !== 'Solicitud') {
      return { error: `La campaña solo se puede aprobar si está en estado 'Borrador' o 'Solicitud'. Estado actual: ${campaign.status}` };
    }
    if (!campaign.schedule.nextRun || !campaign.schedule.time) {
        return { error: "La campaña debe tener una fecha y hora de programación definidas para ser aprobada." };
    }

    const updateResult = await updateCampaign(campaignId, { status: 'Aprobada' });
    if (updateResult.error) {
        return { error: `Error al actualizar estado a Aprobada: ${updateResult.error}` };
    }

    revalidatePath('/dashboard/campaigns');
    revalidatePath(`/dashboard/campaign/${campaignId}`);
    revalidatePath('/dashboard');
    return { success: true, campaign: updateResult.campaign };

  } catch (err: any) {
    console.error(`Error aprobando campaña ${campaignId}:`, err);
    return { error: `Error al aprobar la campaña: ${err.message}` };
  }
}

async function processSingleCampaign(campaign: Campaign, dbClient: PoolClient) {
  console.log(`Procesando campaña individual: ${campaign.name} (ID: ${campaign.id})`);
  let campaignErrorCount = 0;
  let actualRecipientsCountFromQuery = 0;

  try {
    const templateResult = await getTemplateById(campaign.templateId);
    if (templateResult.error || !templateResult.template) {
      throw new Error(`Plantilla ${campaign.templateId} no encontrada para campaña ${campaign.name}.`);
    }
    const template = templateResult.template;

    if (template.type !== campaign.type) {
      throw new Error(`La campaña ${campaign.name} es tipo '${campaign.type}' pero la plantilla es '${template.type}'.`);
    }

    const { recipients: fetchedRecipientsData, error: fetchError } = await getRecipientsForCampaign(campaign, template, dbClient);
    if (fetchError) {
      throw new Error(`Error obteniendo destinatarios para campaña ${campaign.name}: ${fetchError}.`);
    }
    actualRecipientsCountFromQuery = fetchedRecipientsData.length;

    if (actualRecipientsCountFromQuery === 0) {
      console.warn(`No se obtuvieron destinatarios para la campaña ${campaign.name}. Verifique la consulta SQL.`);
    }

    // Clean up previous pending recipients and insert new ones
    await dbClient.query('DELETE FROM campaignrecipients WHERE campaign_id = $1 AND status = $2', [campaign.id, 'Pendiente' as CampaignRecipientStatus]);
    if (actualRecipientsCountFromQuery > 0) {
      const insertQuery = `
        INSERT INTO campaignrecipients (campaign_id, contact, parameters, status)
        VALUES ($1, $2, $3, 'Pendiente')
        ON CONFLICT (campaign_id, contact) DO UPDATE SET
            parameters = EXCLUDED.parameters, status = 'Pendiente',
            processed_at = NULL, error_message = NULL,
            provider_message_id = NULL, provider_response = NULL,
            updated_at = NOW()
        RETURNING id;
      `;
      for (const recipData of fetchedRecipientsData) {
        await dbClient.query(insertQuery, [campaign.id, recipData.contact, recipData.parameters]);
      }
    }

    const recipientsToSendResult = await dbClient.query<CampaignRecipient>(
      'SELECT id, campaign_id AS "campaignId", contact, parameters, status FROM campaignrecipients WHERE campaign_id = $1 AND status = $2',
      [campaign.id, 'Pendiente' as CampaignRecipientStatus]
    );
    const recipientsToSend = recipientsToSendResult.rows;

    if (recipientsToSend.length > 0) {
      const { totalErrorCount } = await processAndSendMessages(campaign, recipientsToSend, template, false, dbClient);
      campaignErrorCount += totalErrorCount;
    }

    // Update campaign status and next run date
    let nextStatus: CampaignStatus = campaign.status;
    let newNextRunDate: Date | null = null;
    if (campaign.schedule.frequency !== 'once') {
        const baseDateForCalc = new Date();
        const timeParts = campaign.schedule.time.split(':');
        baseDateForCalc.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0);

        if (campaign.schedule.frequency === 'daily') newNextRunDate = addDays(baseDateForCalc, 1);
        else if (campaign.schedule.frequency === 'weekdays') {
            let nextDate = addDays(baseDateForCalc, 1);
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) { // 0=Sun, 6=Sat
                nextDate = addDays(nextDate, 1);
            }
            newNextRunDate = nextDate;
        } else if (campaign.schedule.frequency === 'weekly') newNextRunDate = addWeeks(baseDateForCalc, 1);
        else if (campaign.schedule.frequency === 'monthly') newNextRunDate = addMonths(baseDateForCalc, 1);
        
        nextStatus = 'Aprobada'; // Reset to approved for the next run
    } else {
      nextStatus = campaignErrorCount === recipientsToSend.length && recipientsToSend.length > 0 ? 'Error Interno' : 'Enviada';
    }

    await dbClient.query(`
        UPDATE campaigns 
        SET status = $1, 
            recipients_count = $2, 
            schedule_date = $3,
            updated_at = NOW()
        WHERE id = $4
    `, [nextStatus, actualRecipientsCountFromQuery, newNextRunDate ? format(newNextRunDate, "yyyy-MM-dd") : null, campaign.id]);

  } catch (error: any) {
    console.error(`Error procesando campaña individual ${campaign.id} (${campaign.name}): ${error.message}`);
    await dbClient.query(`UPDATE campaigns SET status = 'Error Interno' WHERE id = $1`, [campaign.id]);
  }
}

export async function processScheduledCampaigns(): Promise<{ processed: number; errors: number }> {
  console.log('Procesando campañas programadas...');
  let processedCount = 0;
  let totalErrorsInRun = 0;

  const db = getDbPool();
  if (!db) {
    console.error("Error crítico: no se pudo obtener el pool de la base de datos para el procesador de campañas.");
    return { processed: 0, errors: 1 };
  }

  const dbClient = await db.connect();
  try {
    const now = new Date();
    const todaySQL = format(now, 'yyyy-MM-dd');
    const currentTimeSQL = format(now, 'HH:mm:ss');

    // 1. Atomically fetch and update campaigns to prevent race conditions
    const campaignsToProcessResult = await dbClient.query<any>(`
      UPDATE campaigns
      SET status = 'Programada'
      WHERE id IN (
        SELECT id FROM campaigns
        WHERE status = 'Aprobada'
          AND schedule_date <= $1
          AND schedule_time <= $2
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id, name, type, template_id AS "templateId", category,
        recipient_db_query AS "recipientDbQuery",
        recipients_count AS "recipientsCount",
        schedule_frequency AS "scheduleFrequency",
        schedule_time AS "scheduleTime",
        schedule_date AS "scheduleDate",
        status, user_id as "userId",
        created_at AS "createdAt", updated_at AS "updatedAt";
    `, [todaySQL, currentTimeSQL]);

    const campaignsDue: Campaign[] = campaignsToProcessResult.rows.map(row => ({
      id: row.id, name: row.name, type: row.type, category: row.category,
      templateId: row.templateId, recipientDbQuery: row.recipientDbQuery, recipientsCount: row.recipientsCount,
      schedule: {
        frequency: row.scheduleFrequency, time: row.scheduleTime,
        nextRun: row.scheduleDate ? new Date(row.scheduleDate).toISOString().split('T')[0] : undefined
      },
      status: 'Programada' as CampaignStatus, // Correctly typed now
      userId: row.userId,
      createdAt: new Date(row.createdAt).toISOString(),
    }));

    if (campaignsDue.length === 0) {
      console.log('No hay campañas aprobadas para procesar en este momento.');
      dbClient.release();
      return { processed: 0, errors: 0 };
    }

    console.log(`Se encontraron ${campaignsDue.length} campañas para procesar. Iniciando procesamiento concurrente.`);

    const processingPromises = campaignsDue.map(campaign => processSingleCampaign(campaign, dbClient));
    const results = await Promise.allSettled(processingPromises);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        processedCount++;
      } else {
        totalErrorsInRun++;
        console.error(`Fallo el procesamiento para la campaña ${campaignsDue[index].name}:`, result.reason);
      }
    });

  } catch (err: any) {
    console.error('Error obteniendo o procesando campañas programadas:', err);
    totalErrorsInRun++;
  } finally {
    dbClient.release();
  }

  console.log(`Procesamiento de campañas completado. Procesadas: ${processedCount}, Errores en el ciclo: ${totalErrorsInRun}`);
  revalidatePath('/dashboard/campaigns');
  revalidatePath('/dashboard');
  return { processed: processedCount, errors: totalErrorsInRun };
}

export async function runTestCampaign(campaignId: string): Promise<{ processedRecipients?: number; error?: string; sent?: number; failed?: number }> {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') {
    return { error: "Acción no autorizada. Requiere rol de administrador." };
  }

  let processedTestRecipients = 0;
  let sentCount = 0;
  let failedCount = 0;

  const db = getDbPool(); // Runtime operation
  if (!db) {
      return { error: 'No se pudo conectar a la base de datos.' };
  }
  const dbClient = await db.connect();

  try {
    const campaignResult = await getCampaignById(campaignId);
    if (campaignResult.error || !campaignResult.campaign) {
      return { error: campaignResult.error || "Campaña no encontrada para prueba." };
    }
    const campaign = campaignResult.campaign;
    
    // Una campaña en Solicitud tampoco debería poder probarse
    if (campaign.status === 'Solicitud') {
        return { error: 'Esta campaña está pendiente de aprobación por un administrador.' };
    }
    
    const campaignDateTime = campaign.schedule.nextRun ? parseISO(`${campaign.schedule.nextRun}T${campaign.schedule.time || '00:00:00'}`) : null;
    if (campaign.schedule.frequency === 'once' && campaignDateTime && isPast(campaignDateTime)) {
        toast({
            title: "Campaña Caducada",
            description: `La fecha de envío (${format(campaignDateTime, 'Pp', { locale: es })}) ya ha pasado. Para probar, actualiza la fecha.`,
            variant: "destructive",
            duration: 8000,
        });
        return { error: `La fecha de envío (${format(campaignDateTime, 'Pp', { locale: es })}) ya ha pasado. Para probar, actualiza la fecha.`};
    }

    if (!campaign.recipientDbQuery) {
      toast({
        title: "Consulta no definida",
        description: "No se puede ejecutar una prueba porque no se ha especificado una consulta SQL en la campaña.",
        variant: "destructive",
      });
      return { error: "Falta la consulta SQL en la configuración de la campaña." };
    }

    const templateResult = await getTemplateById(campaign.templateId);
    if (templateResult.error || !templateResult.template) {
        return { error: `Plantilla ${campaign.templateId} no encontrada para la campaña ${campaign.name}.` };
    }
    const template = templateResult.template;

    if (template.type !== campaign.type) {
      return { error: `El tipo de la campaña (${campaign.type}) no coincide con el tipo de la plantilla (${template.type}).` };
    }

    console.log(`Iniciando ENVÍO REAL DE PRUEBA para campaña: ${campaign.name} (ID: ${campaign.id})`);

    // Usar la BD principal de la aplicación
    const { recipients: fetchedRecipientsData, error: fetchError } = await getRecipientsForCampaign(campaign, template, dbClient);

    if (fetchError) {
        console.error(`Error obteniendo destinatarios para prueba de campaña ${campaign.name}: ${fetchError}`);
        return { error: `Error obteniendo destinatarios: ${fetchError}` };
    }

    if (fetchedRecipientsData.length === 0) {
      console.log(`Prueba para ${campaign.name}: No se encontraron destinatarios con la consulta proporcionada.`);
      return { processedRecipients: 0, sent:0, failed:0, error: "No se encontraron destinatarios con la consulta. Por favor, verifica tu consulta SQL." };
    }
    processedTestRecipients = fetchedRecipientsData.length;
    console.log(`Prueba para ${campaign.name}: Se encontraron ${fetchedRecipientsData.length} destinatarios. Procediendo a enviar (REAL).`);

    // Actualizar el conteo en la campaña principal si es diferente
    if (campaign.recipientsCount !== processedTestRecipients) {
        await updateCampaign(campaign.id, { recipientsCount: processedTestRecipients });
    }

    let insertedTestRecipients: CampaignRecipient[] = [];
    try {
        await dbClient.query('BEGIN');
        // Limpiar destinatarios de pruebas anteriores para esta campaña
        await dbClient.query(
            `DELETE FROM campaignrecipients
             WHERE campaign_id = $1 AND (status = 'PendientePrueba' OR status = 'Enviado (Prueba)' OR status = 'Fallido (Prueba)')`,
            [campaign.id]
        );

        const insertQuery = `
            INSERT INTO campaignrecipients (campaign_id, contact, parameters, status)
            VALUES ($1, $2, $3, 'PendientePrueba')
            RETURNING id, campaign_id AS "campaignId", contact, parameters, status, provider_message_id, error_message, processed_at, provider_response;
        `; // provider_response añadido

        for (const recipData of fetchedRecipientsData) {
            const res = await dbClient.query(insertQuery, [campaign.id, recipData.contact, recipData.parameters]);
            if (res.rows[0]) {
                insertedTestRecipients.push({
                    id: res.rows[0].id,
                    campaignId: campaign.id,
                    contact: res.rows[0].contact,
                    parameters: res.rows[0].parameters,
                    status: 'PendientePrueba' as CampaignRecipientStatus,
                    processedAt: undefined,
                    errorMessage: undefined,
                    providerMessageId: undefined,
                    provider_response: undefined
                });
            }
        }
        await dbClient.query('COMMIT');
        console.log(`Prueba para ${campaign.name}: Insertados ${insertedTestRecipients.length} destinatarios en CampaignRecipients con estado 'PendientePrueba'.`);

        if (insertedTestRecipients.length > 0) {
            const { totalErrorCount } = await processAndSendMessages(campaign, insertedTestRecipients, template, true, dbClient);
            failedCount = totalErrorCount;
            sentCount = insertedTestRecipients.length - failedCount;
        } else {
             console.log(`Prueba para ${campaign.name}: No hay destinatarios insertados para enviar (esto no debería ocurrir si fetchedRecipientsData tenía elementos).`);
        }

    } catch (processError: any) {
        await dbClient.query('ROLLBACK');
        console.error(`Error durante el procesamiento de prueba para campaña ${campaign.id}:`, processError);
        return { error: `Error procesando prueba: ${processError.message}` };
    }

    console.log(`Prueba para ${campaign.name} completada. Destinatarios procesados: ${processedTestRecipients}, Enviados: ${sentCount}, Fallidos: ${failedCount}`);
    revalidatePath(`/dashboard/campaign/${campaign.id}`);
    revalidatePath('/dashboard');
    return { processedRecipients: processedTestRecipients, sent: sentCount, failed: failedCount };

  } catch (err: any) {
    console.error(`Error general en runTestCampaign para campaña ${campaignId}:`, err);
    return { error: `Error inesperado durante la prueba: ${err.message}` };
  } finally {
      dbClient.release();
  }
}

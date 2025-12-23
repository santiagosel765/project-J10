
'use server';

import type { QueryResult } from 'pg';
import { revalidatePath } from 'next/cache';
import type { CollectionsMatrixRule, CollectionsConfiguration, Template } from '@/lib/mock-data';
import { getTemplateByNameAndType, getTemplateById as getTemplateByIdReal } from './templateActions'; 
import { sendWhatsAppMessage, sendSmsMessage, interpolateTemplate } from './campaignActions'; 
import { createMessageLog } from './messageLogActions';
import { getDbPool, getDbPoolSafe, checkAndIncrementMessageCount } from '@/lib/db';
import { format } from 'date-fns';
import { getUserById } from './userActions';

// --- Acciones para CollectionsMatrixRules ---

export async function getCollectionsMatrixRules(): Promise<{ rules?: CollectionsMatrixRule[], error?: string }> {
  try {
    const db = getDbPoolSafe();
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    const query = 'SELECT id, days_of_arrears, channel, template_id AS "templateId", pending_template_name AS "pendingTemplateName", created_at AS "createdAt", updated_at AS "updatedAt" FROM collectionsmatrixrules ORDER BY days_of_arrears ASC;';
    const result: QueryResult<any> = await db.query(query);
    const rules: CollectionsMatrixRule[] = result.rows.map(row => ({
        id: row.id,
        days_of_arrears: parseInt(row.days_of_arrears, 10),
        channel: row.channel,
        template_id: row.templateId, // Puede ser null
        pending_template_name: row.pendingTemplateName, // Puede ser null
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    }));
    return { rules };
  } catch (err: any) {
    console.error('Error al obtener reglas de matriz de cobranza:', err);
    return { error: `Error al obtener reglas: ${err.message}` };
  }
}

export async function loadMatrixFromSql(formData: FormData): Promise<{
  success?: boolean;
  error?: string;
  rulesSavedCount?: number;
  errorsInQuery?: string[];
}> {
  const matrixSql = formData.get('matrixSql') as string;
  const errorsInQuery: string[] = [];
  let rulesSavedCount = 0;

  if (!matrixSql || matrixSql.trim() === '') {
    return { error: 'No se proporcionó una consulta SQL.' };
  }

  const db = getDbPoolSafe();
  if (!db) {
    return { error: 'Database not available during build time or connection failed.' };
  }

  try {
    console.log("Ejecutando consulta SQL para obtener reglas de matriz:", matrixSql);
    const result = await db.query(matrixSql);

    if (result.rows.length === 0) {
      return { error: 'La consulta SQL no devolvió ninguna fila para procesar.' };
    }

    const firstRow = result.rows[0];
    const expectedColumns = ['dias_de_atraso', 'canal', 'template_name'];
    const missingColumns = expectedColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      return { error: `La consulta SQL debe devolver las columnas: ${missingColumns.join(', ')}.` };
    }
    
    const rulesToInsert: Array<{ 
        days_of_arrears: number; 
        channel: 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia'; // Correct type
        template_id: string | null; 
        pending_template_name: string | null;
        original_template_name: string;
    }> = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const days_of_arrears_str = row.dias_de_atraso;
      const channel_str = row.canal?.toLowerCase() as 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia';
      const template_name_str = row.template_name;

      const baseErrorMsg = `Fila ${i + 1} del resultado SQL: - `;

      if (days_of_arrears_str === undefined || days_of_arrears_str === null || !channel_str || !template_name_str) {
        errorsInQuery.push(`${baseErrorMsg}Faltan valores. Se requieren dias_de_atraso, canal y template_name.`);
        continue;
      }
      
      const days_of_arrears = parseInt(String(days_of_arrears_str), 10);
      if (isNaN(days_of_arrears)) {
        errorsInQuery.push(`${baseErrorMsg}'dias_de_atraso' (${days_of_arrears_str}) no es un número válido.`);
        continue;
      }
      
      // Validate channel value
      const validChannels = ['whatsapp', 'sms', 'email', 'llamada', 'llamada-ia'];
      if (!validChannels.includes(channel_str)) {
        errorsInQuery.push(`Error en la fila ${i + 1}: El canal '${channel_str}' no es válido. Los valores permitidos son: ${validChannels.join(', ')}.`);
        continue;
      }

      // Now use channel_str directly, as it's validated
      const templateResult = await getTemplateByNameAndType(template_name_str, channel_str);
      
      if (templateResult.error) {
          console.error(`Error buscando plantilla para '${template_name_str}' (${channel_str}): ${templateResult.error}`);
      }
      
      if (templateResult.template) {
        rulesToInsert.push({ 
            days_of_arrears, 
            channel: channel_str,
            template_id: templateResult.template.id,
            pending_template_name: null,
            original_template_name: template_name_str
        });
      } else {
        rulesToInsert.push({
            days_of_arrears,
            channel: channel_str,
            template_id: null,
            pending_template_name: template_name_str,
            original_template_name: template_name_str
        });
      }
    }
    
    if (rulesToInsert.length > 0) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM collectionsmatrixrules'); 
            
            const seen = new Set<string>();

            const insertQuery = 'INSERT INTO collectionsmatrixrules (days_of_arrears, channel, template_id, pending_template_name) VALUES ($1, $2, $3, $4)';
            for (const rule of rulesToInsert) {
                const key = `${rule.days_of_arrears}|${rule.original_template_name}`;
                if (seen.has(key)) {
                    const reason = `Combinación de días de atraso (${rule.days_of_arrears}) y nombre de plantilla ('${rule.original_template_name}') está duplicada en la consulta SQL. Se omitió la entrada duplicada.`;
                    errorsInQuery.push(`Error de duplicado: ${reason}`);
                    continue; 
                }
                seen.add(key);
                
                await client.query(insertQuery, [rule.days_of_arrears, rule.channel, rule.template_id, rule.pending_template_name]);
                rulesSavedCount++;
            }
            await client.query('COMMIT');
        } catch (dbErr: any) {
            await client.query('ROLLBACK');
            console.error('Error de BD al guardar reglas de matriz desde SQL:', dbErr);
            return { error: `Error de BD: ${dbErr.message}`, errorsInQuery };
        } finally {
            client.release();
        }
    }

    revalidatePath('/dashboard/strategy');
    return { 
        success: true, 
        rulesSavedCount,
        errorsInQuery: errorsInQuery.length > 0 ? errorsInQuery : undefined 
    };

  } catch (err: any) {
    console.error('Error al procesar consulta SQL para matriz:', err);
    return { error: `Error al procesar consulta: ${err.message}`, errorsInQuery };
  }
}

// --- Acciones para CollectionsConfiguration ---

export async function getCollectionsConfiguration(): Promise<{ config?: CollectionsConfiguration, error?: string }> {
  try {
    const db = getDbPoolSafe();
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    const query = 'SELECT id, main_collections_query, processing_time, is_enabled, last_processed_at AS "lastProcessedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM collectionsconfiguration ORDER BY created_at DESC LIMIT 1;';
    const result: QueryResult<any> = await db.query(query);
    const configRow = result.rows[0];
    if (!configRow) return { config: undefined };

    const config: CollectionsConfiguration = {
        id: configRow.id,
        main_collections_query: configRow.main_collections_query,
        processing_time: configRow.processing_time,
        is_enabled: configRow.is_enabled,
        last_processed_at: configRow.lastProcessedAt ? new Date(configRow.lastProcessedAt).toISOString() : undefined,
        createdAt: configRow.createdAt ? new Date(configRow.createdAt).toISOString() : undefined,
        updatedAt: configRow.updatedAt ? new Date(configRow.updatedAt).toISOString() : undefined,
    };
    return { config };
  } catch (err: any) {
    console.error('Error al obtener configuración de cobranza:', err);
    return { error: `Error al obtener configuración: ${err.message}` };
  }
}

export async function updateCollectionsConfiguration(formData: FormData): Promise<{ success?: boolean, error?: string, config?: CollectionsConfiguration }> {
  try {
    const db = getDbPoolSafe();
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    const mainQuery = formData.get('mainCollectionsQuery') as string | null;
    const processingTime = formData.get('processingTime') as string | null; // HH:MM
    

    if (!mainQuery || !processingTime) {
        return { error: "La consulta SQL principal y la hora de procesamiento son requeridas." };
    }
    
    const existingConfigResult = await getCollectionsConfiguration();
    let newConfigData: any;
    
    // is_enabled se mantiene como esté, solo se actualiza desde el switch
    const isEnabled = existingConfigResult.config?.is_enabled ?? true;

    if (existingConfigResult.config && existingConfigResult.config.id) {
      const query = `
        UPDATE collectionsconfiguration 
        SET main_collections_query = $1, processing_time = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, main_collections_query, processing_time, is_enabled, last_processed_at AS "lastProcessedAt", created_at AS "createdAt", updated_at AS "updatedAt";
      `;
      const result = await db.query(query, [mainQuery, processingTime, existingConfigResult.config.id]);
      newConfigData = result.rows[0];
    } else {
      const query = `
        INSERT INTO collectionsconfiguration (main_collections_query, processing_time, is_enabled) 
        VALUES ($1, $2, $3)
        RETURNING id, main_collections_query, processing_time, is_enabled, last_processed_at AS "lastProcessedAt", created_at AS "createdAt", updated_at AS "updatedAt";
      `;
      // is_enabled se setea a true por defecto en una nueva config.
      const result = await db.query(query, [mainQuery, processingTime, true]);
      newConfigData = result.rows[0];
    }
    
    const newConfig: CollectionsConfiguration = {
        id: newConfigData.id,
        main_collections_query: newConfigData.main_collections_query,
        processing_time: newConfigData.processing_time,
        is_enabled: newConfigData.is_enabled,
        last_processed_at: newConfigData.lastProcessedAt ? new Date(newConfigData.lastProcessedAt).toISOString() : undefined,
        createdAt: newConfigData.createdAt ? new Date(newConfigData.createdAt).toISOString() : undefined,
        updatedAt: newConfigData.updatedAt ? new Date(newConfigData.updatedAt).toISOString() : undefined,
    };

    revalidatePath('/dashboard/strategy');
    revalidatePath('/dashboard/collections');
    revalidatePath('/dashboard/preventive-collections');
    return { success: true, config: newConfig };
  } catch (err: any) {
    console.error('Error al actualizar configuración de cobranza:', err);
    return { error: `Error al actualizar configuración: ${err.message}` };
  }
}

export async function setCollectionsEnabled(isEnabled: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDbPoolSafe();
    if (!db) {
        return { success: false, error: 'Database not available during build time or connection failed.' };
    }
    const configResult = await getCollectionsConfiguration();
    if (configResult.error || !configResult.config) {
      return { success: false, error: configResult.error || "No se encontró una configuración para actualizar." };
    }
    
    const query = 'UPDATE collectionsconfiguration SET is_enabled = $1 WHERE id = $2';
    await db.query(query, [isEnabled, configResult.config.id]);

    revalidatePath('/dashboard/strategy');
    revalidatePath('/dashboard/collections');
    revalidatePath('/dashboard/preventive-collections');
    
    return { success: true };
  } catch(err: any) {
    console.error(`Error al cambiar el estado del proceso de cobranza: ${err.message}`);
    return { success: false, error: `Error al actualizar el estado: ${err.message}`};
  }
}

export async function updateMatchingCollectionRuleTemplateId(
  days: number, // Este parámetro se mantiene en la firma pero no se usará en la query
  channel: 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia',
  newTemplateId: string,
  newTemplateName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDbPoolSafe();
    if (!db) {
        return { success: false, error: 'Database not available during build time or connection failed.' };
    }
    // Only update if the channel is supported by the DB
    if (channel !== 'whatsapp' && channel !== 'sms' && channel !== 'email' && channel !== 'llamada' && channel !== 'llamada-ia') {
      return { success: false, error: "El canal proporcionado no es soportado para esta operación." };
    }
    const query = `
      UPDATE collectionsmatrixrules
      SET template_id = $1, pending_template_name = NULL, updated_at = NOW()
      WHERE channel = $2
        AND template_id IS NULL
        AND pending_template_name = $3;
    `;
    const result = await db.query(query, [newTemplateId, channel, newTemplateName]);

    if (result.rowCount && result.rowCount > 0) {
      console.log(`${result.rowCount} regla(s) de cobranza para canal ${channel}, plantilla pendiente '${newTemplateName}' actualizada(s) con template_id ${newTemplateId}.`);
      revalidatePath('/dashboard/strategy');
      return { success: true };
    } else {
      console.warn(`No se encontraron reglas de cobranza pendientes para actualizar: canal ${channel}, nombre '${newTemplateName}'.`);
      return { success: false, error: "No se encontraron reglas pendientes coincidentes para actualizar." };
    }
  } catch (err: any) {
    console.error('Error actualizando reglas de cobranza con nuevo template_id:', err);
    return { success: false, error: `Error de BD: ${err.message}` };
  }
}

// --- Preview Actions ---
async function getCustomers(filter: 'in_arrears' | 'not_in_arrears' | 'all'): Promise<{ customers?: Record<string, any>[], error?: string }> {
  try {
    const db = getDbPoolSafe();
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    const configResult = await getCollectionsConfiguration();
    if (configResult.error || !configResult.config) {
      return { error: configResult.error || 'La configuración de cobranza no se ha definido.' };
    }
    const query = configResult.config.main_collections_query;
    if (!query) {
      return { error: 'No hay una consulta SQL de cobranza definida en la configuración.' };
    }

    const customersResult = await db.query(query);
    let filteredCustomers = customersResult.rows;

    if (filter === 'in_arrears') {
      filteredCustomers = customersResult.rows.filter(c => {
        const days = c.dias_de_atraso ?? c.DIAS_DE_ATRASO ?? 0;
        return parseInt(String(days), 10) > 0;
      });
    } else if (filter === 'not_in_arrears') {
      filteredCustomers = customersResult.rows.filter(c => {
        const days = c.dias_de_atraso ?? c.DIAS_DE_ATRASO ?? 0;
        return parseInt(String(days), 10) <= 0;
      });
    }

    const previewCustomers = filteredCustomers.slice(0, 100);
    return { customers: previewCustomers };

  } catch (err: any) {
    console.error('Error ejecutando la consulta de previsualización de cobranza:', err);
    return { error: `Error al ejecutar la consulta: ${err.message}` };
  }
}

export async function getCollectionCustomersPreview(): Promise<{ customers?: Record<string, any>[], error?: string }> {
  return getCustomers('in_arrears');
}
export async function getPreventiveCollectionCustomersPreview(): Promise<{ customers?: Record<string, any>[], error?: string }> {
  return getCustomers('not_in_arrears');
}

// --- Lógica de Procesamiento Diario de Cobranza ---
const YALO_CHAT_PHONE_PREFIX = process.env.YALO_CHAT_PHONE_PREFIX || "+502";
const DEFAULT_WHATSAPP_LANG_CODE = process.env.DEFAULT_WHATSAPP_LANG_CODE || "es_MX";

export async function processDailyCollections(): Promise<{ processed: number; errors: number; totalCustomers?: number }> {
  console.log(`[${new Date().toISOString()}] Iniciando procesamiento diario de cobranzas...`);
  let processedCount = 0;
  let errorCount = 0;
  let totalCustomersFromQuery = 0;

  const db = getDbPool();
  if (!db) {
      console.error("Error crítico: no se pudo obtener el pool de la base de datos para el procesador de cobranzas.");
      return { processed: 0, errors: 1 };
  }
  // Usar un solo cliente para toda la operación
  const dbClient = await db.connect();
  
  try {
    const configQueryResult = await dbClient.query('SELECT id, main_collections_query, processing_time, is_enabled FROM collectionsconfiguration ORDER BY created_at DESC LIMIT 1;');
    if (configQueryResult.rows.length === 0) {
      console.error('Error: No se encontró la configuración de cobranza.');
      return { processed: 0, errors: 1 };
    }
    const config = configQueryResult.rows[0];


    if (!config.is_enabled) {
      console.log('El procesamiento diario de cobranzas está deshabilitado.');
      return { processed: 0, errors: 0 };
    }
    if (!config.main_collections_query) {
        console.error('La consulta SQL principal de cobranza no está definida.');
        return { processed: 0, errors: 1 };
    }

    const rulesResult = await getCollectionsMatrixRules();
    if (rulesResult.error || !rulesResult.rules || rulesResult.rules.length === 0) {
      console.error('Error obteniendo reglas de matriz de cobranza o no hay reglas definidas:', rulesResult.error);
      return { processed: 0, errors: 1 };
    }
    const matrixRules = rulesResult.rules;

    console.log('Ejecutando consulta principal de cobranza...');
    const customersResult = await dbClient.query(config.main_collections_query);
    totalCustomersFromQuery = customersResult.rows.length;
    console.log(`Se obtuvieron ${totalCustomersFromQuery} clientes de la consulta principal.`);

    for (const customer of customersResult.rows) {
      const rawContact = customer.contacto || customer.CONTACTO || customer.phone || customer.PHONE || customer.telefono || customer.TELEFONO;
      const contact = typeof rawContact === 'string' ? rawContact.trim() : rawContact;

      const daysArrearsInput = customer.dias_de_atraso !== undefined ? customer.dias_de_atraso : (customer.DIAS_DE_ATRASO !== undefined ? customer.DIAS_DE_ATRASO : null);
      const daysArrears = daysArrearsInput !== null ? parseInt(String(daysArrearsInput), 10) : null;
      
      // Obtener la gerencia del cliente. Asumimos que la query principal la provee.
      const gerenciaId = customer.gerencia_id;

      if (!contact || daysArrears === null || isNaN(daysArrears)) {
        console.warn('Cliente omitido: falta contacto o dias_de_atraso válidos.', customer);
        errorCount++;
        continue;
      }
      
      const rulesToApply = matrixRules.filter(r => r.days_of_arrears === daysArrears && r.template_id !== null && (r.channel === 'whatsapp' || r.channel === 'sms' || r.channel === 'llamada-ia'));

      if (rulesToApply.length === 0) {
        continue;
      }
      
      for (const rule of rulesToApply) {
        let messageSent = false;
        let sendMessageError: string | undefined;
        let providerMsgId: string | undefined;
        let providerResponse: any;

        try {
            const templateResult = await getTemplateById(rule.template_id!); 
            if (templateResult.error || !templateResult.template) {
              console.error(`Error: Plantilla ID ${rule.template_id} para regla de ${daysArrears} días no encontrada. Contacto: ${contact}`);
              throw new Error(`Plantilla ID ${rule.template_id} no encontrada.`);
            }
            const template = templateResult.template;

            // Verificar límite de mensajes - only for whatsapp and sms
            if (rule.channel === 'whatsapp' || rule.channel === 'sms' || rule.channel === 'llamada-ia') {
              const limitCheck = await checkAndIncrementMessageCount(gerenciaId, rule.channel, dbClient as any);
              if (!limitCheck.allowed) {
                  throw new Error(limitCheck.error || `Límite de mensajes para ${rule.channel} alcanzado.`);
              }
            }

            const templateParams: Record<string, any> = {};
            if (template.parameters) {
              template.parameters.forEach(paramKey => {
                let valueFound = false;
                for (const customerKey in customer) {
                  if (customerKey.toLowerCase() === paramKey.toLowerCase()) {
                    const value = customer[customerKey];
                    templateParams[paramKey] = typeof value === 'string' ? value.trim() : value;
                    valueFound = true;
                    break;
                  }
                }
                if (!valueFound && customer[paramKey] !== undefined) {
                  const value = customer[paramKey];
                  templateParams[paramKey] = typeof value === 'string' ? value.trim() : value;
                }
              });
            }

            if (rule.channel === 'whatsapp') {
               if (template.type !== 'whatsapp') {
                  throw new Error(`La plantilla '${template.name}' es tipo '${template.type}', se esperaba 'whatsapp' para el canal de la regla.`);
               }
              console.log(`Enviando WhatsApp a ${contact} (Regla: ${daysArrears} días, Plantilla: ${template.name})`);
              const waResult = await sendWhatsAppMessage(contact, template.name, DEFAULT_WHATSAPP_LANG_CODE, templateParams);
              if (waResult.success) {
                messageSent = true;
                providerMsgId = waResult.messageId;
              } else {
                sendMessageError = waResult.error || 'Error desconocido de YaloChat';
              }
              providerResponse = waResult.providerResponse;
            } else if (rule.channel === 'sms') {
               if (template.type !== 'sms') {
                  throw new Error(`La plantilla '${template.name}' es tipo '${template.type}', se esperaba 'sms' para el canal de la regla.`);
               }
               const messageContent = await interpolateTemplate(template.content, templateParams);
               console.log(`Enviando SMS a ${contact} (Regla: ${daysArrears} días, Plantilla: ${template.name})`);
               const smsResult = await sendSmsMessage(contact, messageContent);
               if (smsResult.success) {
                   messageSent = true;
                   providerMsgId = smsResult.messageId;
               } else {
                   sendMessageError = smsResult.error || 'Error desconocido del proveedor de SMS';
               }
               providerResponse = smsResult.providerResponse;
            }

            if (messageSent) {
              processedCount++;
            } else {
              errorCount++;
            }
            
            await createMessageLog({
              campaignId: 'collections-process', 
              templateId: template.id,
              recipientContact: contact,
              sent_at: new Date().toISOString(),
              status: messageSent ? 'Enviado' : 'Error',
              errorMessage: sendMessageError,
              providerMessageId: providerMsgId,
              provider_response: providerResponse
            });

        } catch (innerError: any) {
            console.error(`Error crítico procesando una regla para el cliente ${contact}:`, innerError.message);
            errorCount++;
             await createMessageLog({
              campaignId: 'collections-process', 
              templateId: rule.template_id || 'unknown',
              recipientContact: contact,
              sent_at: new Date().toISOString(),
              status: 'Error',
              errorMessage: innerError.message,
            });
        }
      }
    }

    await dbClient.query('UPDATE collectionsconfiguration SET last_processed_at = NOW() WHERE id = $1', [config.id]);
    console.log(`[${new Date().toISOString()}] Procesamiento diario de cobranzas completado. Total Clientes: ${totalCustomersFromQuery}, Mensajes Procesados Exitosamente: ${processedCount}, Errores: ${errorCount}`);

  } catch (err: any) {
    console.error('Error crítico durante el procesamiento diario de cobranzas:', err);
    errorCount++; 
  } finally {
      dbClient.release();
  }
  revalidatePath('/dashboard/collections');
  revalidatePath('/dashboard'); 
  return { processed: processedCount, errors: errorCount, totalCustomers: totalCustomersFromQuery };
}

// --- Test a la Lógica de Procesamiento de Cobranza y Prevención ---
async function runGenericTest(
  filterType: 'in_arrears' | 'not_in_arrears',
  logCampaignId: string
): Promise<{ processed: number; errors: number; totalCustomers?: number, error?: string }> {
  console.log(`[${new Date().toISOString()}] Iniciando PRUEBA de proceso (${logCampaignId})...`);
  let processedCount = 0;
  let errorCount = 0;
  let totalCustomersInScope = 0;

  const db = getDbPool();
  if (!db) {
      return { processed: 0, errors: 1, error: "No se pudo conectar a la base de datos." };
  }
  const dbClient = await db.connect();

  try {
    const configResult = await getCollectionsConfiguration();
    if (configResult.error || !configResult.config) {
      throw new Error(configResult.error || 'Configuración de cobranza no encontrada para la prueba.');
    }
    const config = configResult.config;

    if (!config.main_collections_query) {
      throw new Error('La consulta SQL principal de cobranza no está definida en la configuración.');
    }

    const rulesResult = await getCollectionsMatrixRules();
    if (rulesResult.error || !rulesResult.rules || rulesResult.rules.length === 0) {
      throw new Error(rulesResult.error || 'No hay reglas de matriz de cobranza definidas para la prueba.');
    }
    const matrixRules = rulesResult.rules;

    console.log(`[PRUEBA: ${logCampaignId}] Ejecutando consulta principal de cobranza...`);
    const customersResult = await dbClient.query(config.main_collections_query);
    const allCustomers = customersResult.rows;

    const customersToProcess = allCustomers.filter(c => {
      const days = c.dias_de_atraso ?? c.DIAS_DE_ATRASO ?? 0;
      const parsedDays = parseInt(String(days), 10);
      return filterType === 'in_arrears' ? parsedDays > 0 : parsedDays <= 0;
    });

    totalCustomersInScope = customersToProcess.length;
    console.log(`[PRUEBA: ${logCampaignId}] Se obtuvieron ${totalCustomersInScope} clientes en el ámbito de la prueba.`);

    if (totalCustomersInScope === 0) {
      console.log(`[PRUEBA: ${logCampaignId}] La consulta no devolvió clientes para este filtro. La prueba ha finalizado.`);
      return { processed: 0, errors: 0, totalCustomers: 0 };
    }

    for (const customer of customersToProcess) {
      const rawContact = customer.contacto || customer.CONTACTO || customer.phone || customer.PHONE || customer.telefono || customer.TELEFONO;
      const contact = typeof rawContact === 'string' ? rawContact.trim() : rawContact;
      const gerenciaId = customer.gerencia_id;

      const daysArrearsInput = customer.dias_de_atraso !== undefined ? customer.dias_de_atraso : (customer.DIAS_DE_ATRASO !== undefined ? customer.DIAS_DE_ATRASO : null);
      const daysArrears = daysArrearsInput !== null ? parseInt(String(daysArrearsInput), 10) : null;

      if (!contact || daysArrears === null || isNaN(daysArrears)) {
        console.warn(`[PRUEBA: ${logCampaignId}] Cliente omitido: falta contacto o dias_de_atraso válidos.`, customer);
        errorCount++;
        continue;
      }
      
      const rulesToApply = matrixRules.filter(r => r.days_of_arrears === daysArrears && r.template_id !== null && (r.channel === 'whatsapp' || r.channel === 'sms' || r.channel === 'llamada-ia'));
      if (rulesToApply.length === 0) {
        continue; 
      }
      
      for (const rule of rulesToApply) {
          let messageSent = false;
          let sendMessageError: string | undefined;
          let providerMsgId: string | undefined;
          let providerResponse: any;

          try {
              const templateResult = await getTemplateById(rule.template_id!); 
              if (templateResult.error || !templateResult.template) {
                throw new Error(`[PRUEBA] Plantilla ID ${rule.template_id} no encontrada.`);
              }
              const template = templateResult.template;

              // Verificar límite antes de enviar
              if (rule.channel === 'whatsapp' || rule.channel === 'sms' || rule.channel === 'llamada-ia') {
                const limitCheck = await checkAndIncrementMessageCount(gerenciaId, rule.channel, dbClient as any);
                if (!limitCheck.allowed) {
                    throw new Error(limitCheck.error || `Límite de mensajes para ${rule.channel} alcanzado.`);
                }
              }

              const templateParams: Record<string, any> = {};
              if (template.parameters) {
                template.parameters.forEach(paramKey => {
                  let valueFound = false;
                  for (const customerKey in customer) {
                    if (customerKey.toLowerCase() === paramKey.toLowerCase()) {
                      const value = customer[customerKey];
                      templateParams[paramKey] = typeof value === 'string' ? value.trim() : value;
                      valueFound = true;
                      break;
                    }
                  }
                  if (!valueFound && customer[paramKey] !== undefined) {
                    const value = customer[paramKey];
                    templateParams[paramKey] = typeof value === 'string' ? value.trim() : value;
                  }
                });
              }

              if (rule.channel === 'whatsapp') {
                if (template.type !== 'whatsapp') throw new Error(`La plantilla '${template.name}' es tipo '${template.type}', se esperaba 'whatsapp' para el canal de la regla.`);
                console.log(`[PRUEBA: ${logCampaignId}] Enviando WhatsApp a ${contact} (Regla: ${daysArrears} días, Plantilla: ${template.name})`);
                const waResult = await sendWhatsAppMessage(contact, template.name, DEFAULT_WHATSAPP_LANG_CODE, templateParams);
                if (waResult.success) {
                  messageSent = true;
                  providerMsgId = waResult.messageId;
                } else {
                  sendMessageError = waResult.error || 'Error desconocido de YaloChat';
                }
                providerResponse = waResult.providerResponse;
              } else if (rule.channel === 'sms') {
                if (template.type !== 'sms') throw new Error(`La plantilla '${template.name}' es tipo '${template.type}', se esperaba 'sms' para el canal de la regla.`);
                 const messageContent = await interpolateTemplate(template.content, templateParams);
                 console.log(`[PRUEBA: ${logCampaignId}] Enviando SMS a ${contact} (Regla: ${daysArrears} días, Plantilla: ${template.name})`);
                 const smsResult = await sendSmsMessage(contact, messageContent);
                 if (smsResult.success) {
                     messageSent = true;
                     providerMsgId = smsResult.messageId;
                 } else {
                     sendMessageError = smsResult.error || 'Error desconocido del proveedor de SMS';
                 }
                 providerResponse = smsResult.providerResponse;
              }

              if (messageSent) {
                processedCount++;
              } else {
                errorCount++;
              }

              await createMessageLog({
                campaignId: logCampaignId, 
                templateId: template.id,
                recipientContact: contact,
                sent_at: new Date().toISOString(),
                status: messageSent ? 'Enviado' : 'Error',
                errorMessage: sendMessageError,
                providerMessageId: providerMsgId,
                provider_response: providerResponse
              });

          } catch(innerError: any) {
              console.error(`[PRUEBA: ${logCampaignId}] Error crítico procesando una regla para el cliente ${contact}:`, innerError.message);
              errorCount++;
              await createMessageLog({
                campaignId: logCampaignId,
                templateId: rule.template_id || 'unknown',
                recipientContact: contact,
                sent_at: new Date().toISOString(),
                status: 'Error',
                errorMessage: innerError.message,
              });
          }
      }
    }

    console.log(`[${new Date().toISOString()}] PRUEBA (${logCampaignId}) completada. Total Clientes: ${totalCustomersInScope}, Mensajes Procesados Exitosamente: ${processedCount}, Errores: ${errorCount}`);
  } catch (err: any) {
    console.error(`[PRUEBA: ${logCampaignId}] Error crítico durante la prueba de cobranzas:`, err.message);
    return { processed: 0, errors: 1, totalCustomers: 0, error: err.message };
  } finally {
      dbClient.release();
  }

  return { processed: processedCount, errors: errorCount, totalCustomers: totalCustomersInScope };
}

export async function runCollectionsTest(): Promise<{ processed: number; errors: number; totalCustomers?: number, error?: string }> {
  return runGenericTest('in_arrears', 'collections-test');
}
export async function runPreventiveCollectionsTest(): Promise<{ processed: number; errors: number; totalCustomers?: number, error?: string }> {
  return runGenericTest('not_in_arrears', 'preventive-collections-test');
}

// Usar el import renombrado para evitar conflicto con la función de templateActions
async function getTemplateById(id: string): Promise<{ template?: Template; error?: string }> {
  return getTemplateByIdReal(id);
}

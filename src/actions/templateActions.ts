

'use server';

import { revalidatePath } from 'next/cache';
import type { Template, TemplateStatus } from '@/lib/mock-data';
import { getDbPool, getDbPoolSafe } from '@/lib/db';
import { updateMatchingCollectionRuleTemplateId } from './collectionsActions';
import { getCurrentUser } from '@/lib/session';

const emojiRegex = /\p{Emoji}/u;

// Cache for getTemplateByNameAndType with 1-minute TTL
const templateCache = new Map<string, { data: { template?: Template; error?: string }, timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute in milliseconds

function getCacheKey(name: string, type: string): string {
  return `${name}-${type}`;
}

function getCachedTemplate(name: string, type: string): { template?: Template; error?: string } | null {
  const key = getCacheKey(name, type);
  const cached = templateCache.get(key);
  
  if (!cached) return null;
  
  const isExpired = Date.now() - cached.timestamp > CACHE_TTL;
  if (isExpired) {
    templateCache.delete(key);
    return null;
  }
  
  return cached.data;
}

function setCachedTemplate(name: string, type: string, data: { template?: Template; error?: string }): void {
  const key = getCacheKey(name, type);
  templateCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

function clearTemplateCache(): void {
  templateCache.clear();
}

/**
 * Crea una nueva plantilla en la base de datos PostgreSQL.
 * @param formData - Los datos del formulario para la nueva plantilla.
 * @returns La plantilla creada o un objeto de error.
 */
export async function createTemplate(
  formData: FormData
): Promise<{ template?: Template; error?: string; ruleUpdateResult?: { success: boolean; error?: string } }> {
  const db = getDbPool(); // Runtime operation
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'No autenticado. Por favor, inicie sesión.' };
  }

  try {
    const name = formData.get('templateName') as string;
    const type = formData.get('templateType') as 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia';
    const content = formData.get('templateContent') as string;
    const parametersString = formData.get('templateParameters') as string | null;
    const parameters = parametersString ? parametersString.split(',').map(p => p.trim()).filter(p => p) : [];
    
    const mediaUrl = formData.get('mediaUrl') as string | null;
    const linkUrl = formData.get('linkUrl') as string | null;
    const buttonType = formData.get('buttonType') as Template['buttonType'] | null;
    const buttonText = formData.get('buttonText') as string | null;
    const buttonValue = formData.get('buttonValue') as string | null;

    // Datos para resolver regla de cobranza pendiente
    const daysToResolveStr = formData.get('daysToResolve') as string | null;
    const channelToResolve = formData.get('channelToResolve') as 'whatsapp' | 'sms' | 'email' | 'llamada' | null;
    
    const daysToResolve = daysToResolveStr ? parseInt(daysToResolveStr, 10) : null;

    if (!name || !type || !content) {
        return { error: "Nombre, tipo y contenido son requeridos." };
    }

    if (type === 'sms') {
      if (content.length > 160) {
        return { error: "El contenido para plantillas SMS no puede exceder los 160 caracteres." };
      }
    }

    const status: TemplateStatus = user.role === 'admin' ? 'Aprobada' : 'Solicitud';
    const userId = user.id;

    const query = `
      INSERT INTO templates (name, content, parameters, type, status, user_id, media_url, link_url, button_type, button_text, button_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, name, content, parameters, type, status, user_id AS "userId", media_url AS "mediaUrl", link_url AS "linkUrl", button_type as "buttonType", button_text as "buttonText", button_value as "buttonValue", created_at AS "createdAt", updated_at AS "updatedAt";
    `;
    
    const values = [
      name,
      content,
      parameters, 
      type,
      status,
      userId,
      mediaUrl,
      linkUrl,
      buttonType,
      buttonText,
      buttonValue
    ];
    const result = await db.query(query, values);
    const newTemplateRow = result.rows[0];

    if (!newTemplateRow) {
      return { error: 'No se pudo crear la plantilla en la base de datos.' };
    }

    const newTemplate: Template = {
        id: newTemplateRow.id,
        name: newTemplateRow.name,
        content: newTemplateRow.content,
        parameters: newTemplateRow.parameters,
        type: newTemplateRow.type,
        status: newTemplateRow.status,
        userId: newTemplateRow.userId,
        mediaUrl: newTemplateRow.mediaUrl,
        linkUrl: newTemplateRow.linkUrl,
        buttonType: newTemplateRow.buttonType,
        buttonText: newTemplateRow.buttonText,
        buttonValue: newTemplateRow.buttonValue,
        createdAt: newTemplateRow.createdAt.toISOString(),
        updatedAt: newTemplateRow.updatedAt.toISOString(),
    };

    let ruleUpdateResult;
    if (daysToResolve !== null && channelToResolve && newTemplate.id && newTemplate.name) {
        console.log(`Intentando actualizar regla de cobranza: días ${daysToResolve}, canal ${channelToResolve}, nuevo tpl ID ${newTemplate.id}, nombre tpl ${newTemplate.name}`);
        ruleUpdateResult = await updateMatchingCollectionRuleTemplateId(daysToResolve, channelToResolve, newTemplate.id, newTemplate.name);
    }

    // Clear cache when templates are modified
    clearTemplateCache();
    
    revalidatePath('/dashboard/templates');
    revalidatePath('/dashboard/campaign/create');
    revalidatePath('/dashboard/collections'); 
    return { template: newTemplate, ruleUpdateResult };
  } catch (err: any) {
    console.error('Error de base de datos al crear plantilla:', err);
    if (err.code === '23505' && err.constraint === 'templates_name_type_key') {
        return { error: `Ya existe una plantilla con el nombre '${formData.get('templateName')}' para el tipo '${formData.get('templateType')}'.` };
    }
    return { error: `Error al crear la plantilla: ${err.message}` };
  }
}

/**
 * Recupera todas las plantillas de la base de datos PostgreSQL.
 * @returns Una promesa que resuelve a un array de plantillas o un objeto de error.
 */
export async function getAllTemplates(): Promise<{ templates?: Template[]; error?: string }> {
  const db = getDbPoolSafe(); // Could be called during build
  if (!db) {
      return { error: 'Database not available during build time or connection failed.' };
  }
  try {
    const query = `SELECT id, name, content, parameters, type, status, user_id AS "userId", media_url AS "mediaUrl", link_url AS "linkUrl", button_type as "buttonType", button_text as "buttonText", button_value as "buttonValue", created_at AS "createdAt", updated_at AS "updatedAt" FROM templates ORDER BY "createdAt" DESC;`;
    const result = await db.query(query);
    const templates: Template[] = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        content: row.content,
        parameters: row.parameters,
        type: row.type,
        status: row.status,
        userId: row.userId,
        mediaUrl: row.mediaUrl,
        linkUrl: row.linkUrl,
        buttonType: row.buttonType,
        buttonText: row.buttonText,
        buttonValue: row.buttonValue,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }));

    return { templates };
  } catch (err: any) {
    console.error('Error de base de datos al obtener plantillas:', err);
    return { error: `Error al obtener las plantillas: ${err.message}` };
  }
}

/**
 * Recupera una plantilla por su ID de la base de datos PostgreSQL.
 * @param id - El ID de la plantilla a recuperar.
 * @returns Una promesa que resuelve a la plantilla o undefined si no se encuentra, o un objeto de error.
 */
export async function getTemplateById(id: string): Promise<{ template?: Template; error?: string }> {
  const db = getDbPoolSafe(); // Could be called during build
  if (!db) {
      return { error: 'Database not available during build time or connection failed.' };
  }
  try {
    const query = `SELECT id, name, content, parameters, type, status, user_id as "userId", media_url AS "mediaUrl", link_url AS "linkUrl", button_type as "buttonType", button_text as "buttonText", button_value as "buttonValue", created_at AS "createdAt", updated_at AS "updatedAt" FROM templates WHERE id = $1;`;
    const result = await db.query(query, [id]);
    const templateRow = result.rows[0];

    if (!templateRow) {
      return { error: `Plantilla con ID '${id}' no encontrada.` };
    }
    
    const template: Template = {
        id: templateRow.id,
        name: templateRow.name,
        content: templateRow.content,
        parameters: templateRow.parameters,
        type: templateRow.type,
        status: templateRow.status,
        userId: templateRow.userId,
        mediaUrl: templateRow.mediaUrl,
        linkUrl: templateRow.linkUrl,
        buttonType: templateRow.buttonType,
        buttonText: templateRow.buttonText,
        buttonValue: templateRow.buttonValue,
        createdAt: templateRow.createdAt.toISOString(),
        updatedAt: templateRow.updatedAt.toISOString(),
    };

    return { template };
  } catch (err: any) {
    console.error('Error de base de datos al obtener plantilla por ID:', err);
    return { error: `Error al obtener la plantilla: ${err.message}` };
  }
}

/**
 * Recupera una plantilla por su nombre y tipo.
 * @param name - El nombre de la plantilla.
 * @param type - El tipo de plantilla.
 * @returns Una promesa que resuelve a la plantilla o undefined si no se encuentra, o un objeto de error.
 */
export async function getTemplateByNameAndType(
  name: string,
  type: 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia'
): Promise<{ template?: Template; error?: string }> {
  // Check cache first
  const cached = getCachedTemplate(name, type);
  if (cached) {
    return cached;
  }

  const db = getDbPoolSafe(); // Could be called during build
  if (!db) {
      const errorResponse = { error: 'Database not available during build time or connection failed.' };
      setCachedTemplate(name, type, errorResponse);
      return errorResponse;
  }
  try {
    const query = `SELECT id, name, content, parameters, type, status, user_id as "userId", media_url AS "mediaUrl", link_url AS "linkUrl", button_type as "buttonType", button_text as "buttonText", button_value as "buttonValue", created_at AS "createdAt", updated_at AS "updatedAt" FROM templates WHERE name = $1 AND type = $2;`;
    const result = await db.query(query, [name, type]);
    const templateRow = result.rows[0];

    let responseData: { template?: Template; error?: string };

    if (!templateRow) {
      responseData = {}; 
    } else {
      const template: Template = {
          id: templateRow.id,
          name: templateRow.name,
          content: templateRow.content,
          parameters: templateRow.parameters,
          type: templateRow.type,
          status: templateRow.status,
          userId: templateRow.userId,
          mediaUrl: templateRow.mediaUrl,
          linkUrl: templateRow.linkUrl,
          buttonType: templateRow.buttonType,
          buttonText: templateRow.buttonText,
          buttonValue: templateRow.buttonValue,
          createdAt: templateRow.createdAt.toISOString(),
          updatedAt: templateRow.updatedAt.toISOString(),
      };
      responseData = { template };
    }

    // Cache the result
    setCachedTemplate(name, type, responseData);
    return responseData;
  } catch (err: any) {
    console.error(`Error de BD al obtener plantilla por nombre y tipo: ${name}, ${type}`, err);
    const errorResponse = { error: `Error al obtener la plantilla: ${err.message}` };
    // Cache error responses too (for a shorter time)
    setCachedTemplate(name, type, errorResponse);
    return errorResponse;
  }
}

/**
 * Actualiza una plantilla existente en la base de datos PostgreSQL.
 * @param id - El ID de la plantilla a actualizar.
 * @param templateData - Los datos parciales para actualizar la plantilla.
 * @returns La plantilla actualizada o undefined si no se encuentra, o un objeto de error.
 */
export async function updateTemplate(
  id: string,
  templateData: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'userId'>> 
): Promise<{ template?: Template; error?: string }> {
  const db = getDbPool(); // Runtime operation
  const user = await getCurrentUser();
  if (!user) return { error: 'No autenticado.' };

  try {
    const existingTemplateResult = await getTemplateById(id);
    if (existingTemplateResult.error || !existingTemplateResult.template) {
        return { error: "Plantilla no encontrada para actualizar." };
    }
    const existingTemplate = existingTemplateResult.template;

    if (user.role !== 'admin' && existingTemplate.userId !== user.id) {
        return { error: "No tienes permiso para editar esta plantilla." };
    }
    
    const finalData = { ...existingTemplate, ...templateData };

    if (finalData.type === 'sms') {
      if (finalData.content.length > 160) {
        return { error: "El contenido para plantillas SMS no puede exceder los 160 caracteres." };
      }
    }

    const fieldsToUpdate: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (templateData.name !== undefined) { fieldsToUpdate.push(`name = $${paramIndex++}`); values.push(templateData.name); }
    if (templateData.content !== undefined) { fieldsToUpdate.push(`content = $${paramIndex++}`); values.push(templateData.content); }
    if (templateData.parameters !== undefined) { fieldsToUpdate.push(`parameters = $${paramIndex++}`); values.push(templateData.parameters); } 
    if (templateData.type !== undefined) { fieldsToUpdate.push(`type = $${paramIndex++}`); values.push(templateData.type); }
    if (templateData.status !== undefined) { 
        if(user.role !== 'admin') {
            return { error: 'Solo los administradores pueden cambiar el estado.'}
        }
        fieldsToUpdate.push(`status = $${paramIndex++}`); values.push(templateData.status); 
    }
    if (templateData.hasOwnProperty('mediaUrl')) { fieldsToUpdate.push(`media_url = $${paramIndex++}`); values.push(templateData.mediaUrl); }
    if (templateData.hasOwnProperty('linkUrl')) { fieldsToUpdate.push(`link_url = $${paramIndex++}`); values.push(templateData.linkUrl); }
    
    // Button fields
    if (templateData.hasOwnProperty('buttonType')) { fieldsToUpdate.push(`button_type = $${paramIndex++}`); values.push(templateData.buttonType); }
    if (templateData.hasOwnProperty('buttonText')) { fieldsToUpdate.push(`button_text = $${paramIndex++}`); values.push(templateData.buttonText); }
    if (templateData.hasOwnProperty('buttonValue')) { fieldsToUpdate.push(`button_value = $${paramIndex++}`); values.push(templateData.buttonValue); }

    if (fieldsToUpdate.length === 0) {
      return { error: "No hay campos para actualizar." };
    }
    
    values.push(id);

    const query = `
      UPDATE templates
      SET ${fieldsToUpdate.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, name, content, parameters, type, status, user_id as "userId", media_url AS "mediaUrl", link_url AS "linkUrl", button_type as "buttonType", button_text as "buttonText", button_value as "buttonValue", created_at AS "createdAt", updated_at AS "updatedAt";
    `;
    
    const result = await db.query(query, values);
    const updatedTemplateRow = result.rows[0];

    if (!updatedTemplateRow) {
      return { error: 'Plantilla no encontrada o no se pudo actualizar.' };
    }
    
    const updatedTemplate: Template = {
        id: updatedTemplateRow.id,
        name: updatedTemplateRow.name,
        content: updatedTemplateRow.content,
        parameters: updatedTemplateRow.parameters,
        type: updatedTemplateRow.type,
        status: updatedTemplateRow.status,
        userId: updatedTemplateRow.userId,
        mediaUrl: updatedTemplateRow.mediaUrl,
        linkUrl: updatedTemplateRow.linkUrl,
        buttonType: updatedTemplateRow.buttonType,
        buttonText: updatedTemplateRow.buttonText,
        buttonValue: updatedTemplateRow.buttonValue,
        createdAt: updatedTemplateRow.createdAt.toISOString(),
        updatedAt: updatedTemplateRow.updatedAt.toISOString(),
    };

    // Clear cache when templates are modified
    clearTemplateCache();

    revalidatePath('/dashboard/templates');
    revalidatePath(`/dashboard/templates/edit/${id}`);
    revalidatePath('/dashboard/campaigns'); 
    revalidatePath('/dashboard/campaign/create');
    revalidatePath('/dashboard/collections');
    return { template: updatedTemplate };
  } catch (err: any) {
    console.error('Error de base de datos al actualizar plantilla:', err);
    if (err.code === '23505' && err.constraint === 'templates_name_type_key') {
        return { error: `Ya existe otra plantilla con el nombre '${templateData.name}' para el tipo '${templateData.type}'.` };
    }
    return { error: `Error al actualizar la plantilla: ${err.message}` };
  }
}

/**
 * Elimina una plantilla por su ID de la base de datos PostgreSQL.
 * @param id - El ID de la plantilla a eliminar.
 * @returns Un objeto que indica éxito o fracaso, o un objeto de error.
 */
export async function deleteTemplate(id: string): Promise<{ success?: boolean; message?: string; error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') {
    return { error: "Acción no autorizada. Requiere rol de administrador." };
  }

  const db = getDbPool(); // Runtime operation
  try {
    const updateCollectionsQuery = `
      UPDATE collectionsmatrixrules
      SET template_id = NULL, pending_template_name = (SELECT name FROM templates WHERE id = $1 LIMIT 1)
      WHERE template_id = $1;
    `;
    await db.query(updateCollectionsQuery, [id]);

    const query = `DELETE FROM templates WHERE id = $1 RETURNING id;`;
    const result = await db.query(query, [id]);
    
    // Fix: Handle the case where rowCount might be null
    const success = (result.rowCount ?? 0) > 0;

    if (success) {
      // Clear cache when templates are deleted
      clearTemplateCache();
      
      revalidatePath('/dashboard/templates');
      revalidatePath('/dashboard/campaigns');
      revalidatePath('/dashboard/campaign/create');
      revalidatePath('/dashboard/collections');
      return { success: true };
    }
    return { success: false, message: 'Plantilla no encontrada o no se pudo eliminar.' };
  } catch (err: any) {
    console.error('Error de base de datos al eliminar plantilla:', err);
    if (err.code === '23503') { 
        return { error: 'No se puede eliminar la plantilla porque está siendo utilizada por una o más campañas. Actualiza esas campañas primero.' };
    }
    return { error: `Error al eliminar la plantilla: ${err.message}` };
  }
}

/**
 * Aprueba una plantilla que está en estado 'Solicitud'.
 * @param templateId - El ID de la plantilla a aprobar.
 * @returns Un objeto que indica éxito o fracaso.
 */
export async function approveTemplate(templateId: string): Promise<{ success?: boolean; error?: string }> {
    const user = await getCurrentUser();
    if (user?.role !== 'admin') {
        return { error: "Acción no autorizada. Requiere rol de administrador." };
    }

    try {
        const updateResult = await updateTemplate(templateId, { status: 'Aprobada' });
        if (updateResult.error) {
            return { error: `Error al aprobar: ${updateResult.error}` };
        }
        revalidatePath('/dashboard/templates');
        return { success: true };
    } catch (err: any) {
        console.error(`Error aprobando plantilla ${templateId}:`, err);
        return { error: `Error inesperado al aprobar la plantilla: ${err.message}` };
    }
}

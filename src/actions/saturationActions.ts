

'use server';

import { getDbPool, getDbPoolSafe } from '@/lib/db';
import { z } from 'zod';
import type { Campaign, CampaignCategory } from '@/lib/mock-data';
import { revalidatePath } from 'next/cache';
import { startOfWeek, endOfWeek, parseISO, isPast } from 'date-fns';
import { es } from 'date-fns/locale';


export interface ContactFrequencyInCampaigns {
  contact: string;
  count: number;
  campaigns: { id: string; name: string; hasBeenSent: boolean }[];
  categories: string[];
}

export interface CampaignExclusion {
    id: string;
    campaignId: string;
    campaignName: string;
    contact: string;
    createdAt: string;
}

const SaturationFilterSchema = z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(25),
    contactSearch: z.string().optional(),
    frequency: z.number().min(2).optional(),
    category: z.string().optional(),
});

type SaturationFilter = z.infer<typeof SaturationFilterSchema>;

export async function getContactInCampaignsFrequency(
  filters: Pick<SaturationFilter, 'page' | 'limit' | 'contactSearch' | 'frequency' | 'category'>
): Promise<{ 
    stats: ContactFrequencyInCampaigns[]; 
    totalCount: number;
    error?: string 
}> {
  const validation = SaturationFilterSchema.safeParse(filters);
  if (!validation.success) {
    return { stats: [], totalCount: 0, error: 'Filtros inválidos.' };
  }
  
  const { page, limit, contactSearch, frequency, category: filterCategory } = validation.data;
  const offset = (page - 1) * limit;

  try {
    const db = getDbPoolSafe();
    if (!db) {
      return { stats: [], totalCount: 0, error: 'Database not available' };
    }

    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Lunes
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });     // Domingo

    
    const campaignsResult = await db.query<any>(`
        SELECT id, name, category, recipient_db_query AS "recipientDbQuery", schedule_date AS "scheduleDate", schedule_time AS "scheduleTime"
        FROM campaigns
        WHERE status IN ('Aprobada', 'Programada') 
          AND recipient_db_query IS NOT NULL AND recipient_db_query <> ''
          AND schedule_date IS NOT NULL
          AND schedule_date >= $1 AND schedule_date <= $2
    `, [weekStart, weekEnd]);
    const campaigns = campaignsResult.rows;

    const exclusionsResult = await db.query('SELECT campaign_id, contact FROM campaignexclusions');
    const exclusionMap = new Map<string, Set<string>>();
    for (const row of exclusionsResult.rows) {
        if (!exclusionMap.has(row.campaign_id)) {
            exclusionMap.set(row.campaign_id, new Set());
        }
        exclusionMap.get(row.campaign_id)!.add(String(row.contact).trim());
    }

    if (campaigns.length === 0) {
      return { stats: [], totalCount: 0 };
    }

    const allContactsWithCampaign: { 
        contact: string; 
        campaign: {id: string, name: string, hasBeenSent: boolean}; 
        category: string | null 
    }[] = [];
    
    for (const campaign of campaigns) {
      try {
        if(campaign.recipientDbQuery) {
            const result = await db.query(campaign.recipientDbQuery);
            const campaignExclusions = exclusionMap.get(campaign.id);
            
            const nextRunDateTime = campaign.scheduleDate ? parseISO(`${campaign.scheduleDate.toISOString().split('T')[0]}T${campaign.scheduleTime || '00:00:00'}`) : null;
            const hasBeenSent = nextRunDateTime ? isPast(nextRunDateTime) : false;

            result.rows.forEach(row => {
                const contact = row.contacto || row.CONTACTO || row.contact || row.phone || row.PHONE || row.telefono || row.TELEFONO;
                if(contact) {
                    const trimmedContact = String(contact).trim();
                    if (campaignExclusions && campaignExclusions.has(trimmedContact)) {
                        return;
                    }
                    allContactsWithCampaign.push({
                        contact: trimmedContact,
                        campaign: { id: campaign.id, name: campaign.name, hasBeenSent },
                        category: campaign.category,
                    });
                }
            });
        }
      } catch (err: any) {
        console.warn(`Could not execute query for campaign "${campaign.name}" (ID: ${campaign.id}). Error: ${err.message}`);
      }
    }

    const frequencyMap = new Map<string, { count: number; campaigns: Map<string, {name: string, hasBeenSent: boolean}>; categories: Set<string> }>();

    allContactsWithCampaign.forEach(({ contact, campaign, category }) => {
      if (!frequencyMap.has(contact)) {
        frequencyMap.set(contact, { count: 0, campaigns: new Map(), categories: new Set() });
      }
      const entry = frequencyMap.get(contact)!;
      if (!entry.campaigns.has(campaign.id)) {
          entry.count += 1;
          entry.campaigns.set(campaign.id, {name: campaign.name, hasBeenSent: campaign.hasBeenSent});
      }
      if (category) {
        entry.categories.add(category);
      }
    });

    let processedStats: ContactFrequencyInCampaigns[] = [];
    for (const [contact, data] of frequencyMap.entries()) {
        const meetsFrequency = data.count >= (frequency || 1);
        const meetsContactSearch = !contactSearch || contact.includes(contactSearch);
        const meetsCategory = !filterCategory || data.categories.has(filterCategory);

        if (meetsFrequency && meetsContactSearch && meetsCategory) {
            processedStats.push({
                contact,
                count: data.count,
                campaigns: Array.from(data.campaigns.entries()).map(([id, campData]) => ({ id, name: campData.name, hasBeenSent: campData.hasBeenSent })),
                categories: Array.from(data.categories),
            });
        }
    }
    
    processedStats.sort((a, b) => b.count - a.count);

    const totalCount = processedStats.length;
    const paginatedStats = processedStats.slice(offset, offset + limit);

    return { stats: paginatedStats, totalCount };

  } catch (err: any) {
    console.error('Error fetching campaign frequency stats:', err);
    return { stats: [], totalCount: 0, error: `Error de base de datos: ${err.message}` };
  }
}

export async function excludeContactFromCampaign(
    campaignId: string,
    contact: string
): Promise<{ success: boolean; error?: string }> {
    if (!campaignId || !contact) {
        return { success: false, error: "ID de campaña y contacto son requeridos." };
    }

    try {
        const db = getDbPool();
        if (!db) {
            return { success: false, error: "No se pudo conectar a la base de datos." };
        }
        
        const query = `
            INSERT INTO campaignexclusions (campaign_id, contact)
            VALUES ($1, $2)
            ON CONFLICT (campaign_id, contact) DO NOTHING;
        `;
        
        await db.query(query, [campaignId, contact]);
        
        revalidatePath('/dashboard/saturation');
        revalidatePath('/dashboard/saturation/exclusions');
        
        return { success: true };

    } catch (err: any) {
        console.error('Error in excludeContactFromCampaign:', err);
        return { success: false, error: `Error de base de datos: ${err.message}` };
    }
}


export async function getExclusions(): Promise<{ exclusions?: CampaignExclusion[], error?: string }> {
    try {
        const db = getDbPoolSafe();
        if(!db) {
            return { error: 'Database not available' };
        }

        const query = `
            SELECT 
                ce.id,
                ce.campaign_id AS "campaignId",
                c.name AS "campaignName",
                ce.contact,
                ce.created_at AS "createdAt"
            FROM campaignexclusions ce
            JOIN campaigns c ON ce.campaign_id = c.id
            ORDER BY ce.created_at DESC;
        `;
        const result = await db.query(query);

        return { exclusions: result.rows };

    } catch(err: any) {
        console.error('Error fetching exclusions:', err);
        return { error: `Error de base de datos: ${err.message}` };
    }
}

export async function revertExclusion(exclusionId: string): Promise<{ success: boolean, error?: string }> {
    if (!exclusionId) {
        return { success: false, error: "ID de exclusión es requerido." };
    }
    
    try {
        const db = getDbPool();
        if (!db) {
            return { success: false, error: "No se pudo conectar a la base de datos." };
        }

        const result = await db.query('DELETE FROM campaignexclusions WHERE id = $1', [exclusionId]);

        if (result.rowCount === 0) {
            return { success: false, error: "No se encontró la exclusión para revertir." };
        }
        
        revalidatePath('/dashboard/saturation/exclusions');
        revalidatePath('/dashboard/saturation');

        return { success: true };

    } catch (err: any) {
        console.error('Error in revertExclusion:', err);
        return { success: false, error: `Error de base de datos: ${err.message}` };
    }
}

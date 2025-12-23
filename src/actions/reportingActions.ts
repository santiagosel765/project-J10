
'use server';

import { getDbPoolSafe } from '@/lib/db';

export interface CampaignMessageStats {
  campaignId: string;
  campaignName: string;
  totalSent: number;
  successful: number;
  failed: number;
}

interface ReportFilters {
    dateFrom?: string;
    dateTo?: string;
}

export async function getCampaignMessageStats(filters: ReportFilters): Promise<{ stats?: CampaignMessageStats[], error?: string }> {
  try {
    const db = getDbPoolSafe();
    if (!db) {
      return { error: 'Database not available' };
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.dateFrom) {
      conditions.push(`ml.sent_at >= $${paramIndex}`);
      params.push(filters.dateFrom);
      paramIndex++;
    }
    if (filters.dateTo) {
      conditions.push(`ml.sent_at <= $${paramIndex}`);
      params.push(filters.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
        SELECT
            c.id AS "campaignId",
            c.name AS "campaignName",
            COUNT(ml.id) AS "totalSent",
            SUM(CASE WHEN ml.status::text LIKE 'Enviado%' THEN 1 ELSE 0 END) AS "successful",
            SUM(CASE WHEN ml.status::text LIKE 'Error%' OR ml.status::text LIKE 'Fallido%' THEN 1 ELSE 0 END) AS "failed"
        FROM
            campaigns c
        LEFT JOIN
            messagelogs ml ON c.id::text = ml.campaign_id
        ${whereClause}
        GROUP BY
            c.id, c.name
        HAVING COUNT(ml.id) > 0
        ORDER BY
            "totalSent" DESC;
    `;

    const result = await db.query(query, params);
    
    const stats: CampaignMessageStats[] = result.rows.map(row => ({
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        totalSent: parseInt(row.totalSent, 10) || 0,
        successful: parseInt(row.successful, 10) || 0,
        failed: parseInt(row.failed, 10) || 0,
    }));

    return { stats };
  } catch (err: any) {
    console.error('Error fetching campaign message stats:', err);
    return { error: `Error de base de datos: ${err.message}` };
  }
}


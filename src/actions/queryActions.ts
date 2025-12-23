
'use server';

import { getDbPool } from '@/lib/db';
import { Parser } from 'node-sql-parser';

interface DistinctColumnResult {
  column: string;
  values: string[];
}

/**
 * Analyzes a SQL query to extract column names and fetch distinct values for each.
 * This is a read-only operation and uses a subquery for added safety.
 * @param query - The user-provided SQL query.
 * @returns An object with the data or an error.
 */
export async function getDistinctColumnValues(
  query: string
): Promise<{ data?: DistinctColumnResult[]; error?: string }> {
  if (!query || query.trim().length < 15) {
    return { data: [] }; // No query to process
  }

  const db = getDbPool();
  const sqlParser = new Parser();

  try {
    // Basic validation to prevent executing commands that modify data
    const lowerCaseQuery = query.toLowerCase().trim();
    if (
      lowerCaseQuery.startsWith('insert') ||
      lowerCaseQuery.startsWith('update') ||
      lowerCaseQuery.startsWith('delete') ||
      lowerCaseQuery.startsWith('drop') ||
      lowerCaseQuery.startsWith('alter') ||
      lowerCaseQuery.startsWith('truncate')
    ) {
      return { error: 'Solo se permiten consultas SELECT.' };
    }
    
    // Use the parser to get column names safely
    const ast = sqlParser.astify(query);
    const columnList = Array.isArray(ast) ? ast[0]?.columns : ast?.columns;

    if (!columnList || columnList.length === 0) {
        return { error: 'La consulta no es un SELECT válido o no tiene columnas.' };
    }

    const columnNames = columnList
        .map((c: any) => c.as || c.expr?.column)
        .filter((name: string | undefined): name is string => {
            return !!name && name.toLowerCase() !== 'contacto' && name !== '*';
        });

    if (columnNames.length === 0) {
      return { data: [] }; // No columns found to filter by
    }

    const distinctResults: DistinctColumnResult[] = [];
    
    const client = await db.connect();
    try {
        for (const col of columnNames) {
            // IMPORTANT: Use a subquery to avoid executing a modified version of the user's complex logic.
            // This is safer as it treats the user's query as a data source.
            // We also quote the column name to handle special characters or reserved words.
            const distinctQuery = `SELECT DISTINCT "${col}" FROM (${query.replace(/;$/, '')}) as user_query WHERE "${col}" IS NOT NULL ORDER BY 1 LIMIT 100;`;
            
            const result = await client.query(distinctQuery);
            const values = result.rows.map(row => row[col]);
            
            if (values.length > 0) {
                distinctResults.push({ column: col, values });
            }
        }
    } finally {
        client.release();
    }
    
    return { data: distinctResults };

  } catch (err: any) {
    console.error('Error in getDistinctColumnValues:', err);
    // Provide a user-friendly error message
    if (err.message.includes('syntax error')) {
        return { error: `Error de sintaxis en la consulta: ${err.message}` };
    }
    return { error: 'No se pudieron analizar las columnas de la consulta. Verifique la sintaxis.' };
  }
}

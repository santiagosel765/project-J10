
// src/app/api/cron/process-collections/route.ts

import { NextResponse } from 'next/server';
import { processDailyCollections } from '@/actions/collectionsActions';

export async function POST(request: Request) {
  try {
    console.log("CRON JOB: Iniciando procesamiento de cobranzas diarias...");
    const result = await processDailyCollections();
    console.log(`CRON JOB: Procesamiento de cobranzas completado. Procesados: ${result.processed}, Errores: ${result.errors}`);
    
    return NextResponse.json({
      success: true,
      message: "Procesamiento de cobranzas completado.",
      data: result,
    });
  } catch (error: any) {
    console.error("CRON JOB: Error crítico durante el procesamiento de cobranzas:", error);
    return NextResponse.json(
      { success: false, message: "Error interno del servidor.", error: error.message },
      { status: 500 }
    );
  }
}

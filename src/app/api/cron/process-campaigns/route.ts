
// src/app/api/cron/process-campaigns/route.ts

import { NextResponse } from 'next/server';
import { processScheduledCampaigns } from '@/actions/campaignActions';

export async function POST(request: Request) {
  try {
    console.log("CRON JOB: Iniciando procesamiento de campañas programadas...");
    const result = await processScheduledCampaigns();
    console.log(`CRON JOB: Procesamiento de campañas completado. Procesadas: ${result.processed}, Errores: ${result.errors}`);
    
    return NextResponse.json({
      success: true,
      message: "Procesamiento de campañas completado.",
      data: result,
    });
  } catch (error: any) {
    console.error("CRON JOB: Error crítico durante el procesamiento de campañas:", error);
    return NextResponse.json(
      { success: false, message: "Error interno del servidor.", error: error.message },
      { status: 500 }
    );
  }
}

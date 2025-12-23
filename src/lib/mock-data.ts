// Este archivo se mantiene por ahora para los TIPOS y como referencia,
// pero las operaciones CRUD principales se moverán/ya están en los archivos de acciones
// que interactúan con la base de datos real.

export type CampaignRecipientStatus = 'Pendiente' | 'Enviado' | 'Fallido' | 'PendientePrueba' | 'Enviado (Prueba)' | 'Fallido (Prueba)';
export interface CampaignRecipient {
  id: string; // UUID de la tabla CampaignRecipients
  campaignId: string;
  contact: string; // Phone number for SMS/WhatsApp
  parameters: Record<string, any>; // JSONB en la BD
  status: CampaignRecipientStatus;
  processedAt?: string; // ISOString
  errorMessage?: string;
  providerMessageId?: string;
  provider_response?: any; // Campo para la respuesta del proveedor
}

export type TemplateStatus = 'Aprobada' | 'Solicitud';
export interface Template {
  id: string;
  name: string;
  content: string;
  parameters: string[]; 
  type: 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia';
  status: TemplateStatus;
  userId?: string; // ID del usuario que la creó
  createdAt: string; 
  updatedAt: string;
  mediaUrl?: string | null;
  linkUrl?: string | null;
  buttonType?: 'none' | 'call' | 'reply' | null;
  buttonText?: string | null;
  buttonValue?: string | null;
}

export type CampaignStatus = 'Programada' | 'Enviada' | 'Borrador' | 'Pausada' | 'Error Interno' | 'Aprobada' | 'Solicitud';
export type CampaignCategory = 'Ventas' | 'Marketing' | 'Cobranza' | 'Prevencion' | 'Comunicado';

export interface Campaign {
  id: string;
  name: string;
  type: 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia'; 
  category: CampaignCategory | null;
  templateId: string;
  
  recipientDbQuery: string | null; 
  
  recipientsCount: number; 
  schedule: {
    frequency: string; 
    time: string; 
    nextRun?: string; 
  };
  status: CampaignStatus;
  userId?: string; // ID del usuario que la creó
  createdAt: string; 
  updatedAt?: string; 
}

export type MessageStatus = 'Enviado' | 'Error' | 'En Proceso' | 'Enviado (Prueba)' | 'Error (Prueba)';

export interface MessageLog {
  id: string;
  campaignId: string;
  recipientId?: string | null;  // Puede ser null
  recipientContact: string; 
  sent_at: string; 
  templateId: string;
  status: MessageStatus;
  errorMessage?: string; 
  providerMessageId?: string;
  provider_response?: any; 
  createdAt?: string;
}


// Nuevos tipos para la sección de Cobranza
export interface CollectionsMatrixRule {
  id: string; // UUID
  days_of_arrears: number;
  channel: 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia';
  template_id: string | null; // UUID de la plantilla, puede ser NULL si está pendiente
  pending_template_name?: string | null; // Nombre de la plantilla buscada si template_id es NULL
  createdAt?: string;
  updatedAt?: string;
}

export interface CollectionsConfiguration {
  id: string; // UUID
  main_collections_query: string | null;
  processing_time: string | null; // Formato HH:MM
  is_enabled: boolean;
  last_processed_at?: string | null;
  createdAt?: string;
  updatedAt?: string;
}


// ----- Mock Data Store (mantener para referencia o testing unitario si es necesario) -----
// Las funciones que modifican estos arrays ya no serán la fuente principal de verdad
// una vez que las acciones de BD estén completamente integradas.

let mockTemplatesStore: Template[] = [];

let mockCampaignsStore: Campaign[] = [];

let mockMessageLogsStore: MessageLog[] = [];

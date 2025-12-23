-- Script para crear/actualizar el esquema de la base de datos PostgreSQL para Beezend

-- Eliminar objetos existentes en orden inverso de dependencia o usando CASCADE
DROP TABLE IF EXISTS MessageLogs CASCADE;
DROP TABLE IF EXISTS CampaignRecipients CASCADE;
DROP TABLE IF EXISTS Campaigns CASCADE;
DROP TABLE IF EXISTS Templates CASCADE;
DROP TABLE IF EXISTS Users CASCADE;
DROP TABLE IF EXISTS CollectionsMatrixRules CASCADE;
DROP TABLE IF EXISTS CollectionsConfiguration CASCADE;

DROP TYPE IF EXISTS message_status_enum CASCADE;
DROP TYPE IF EXISTS campaign_recipient_status_enum CASCADE;
DROP TYPE IF EXISTS campaign_status_enum CASCADE;
DROP TYPE IF EXISTS campaign_frequency_enum CASCADE; -- Aunque no se usa directamente como tipo de columna, mejor dropear si existe
DROP TYPE IF EXISTS template_type_enum CASCADE;
DROP TYPE IF EXISTS user_role_enum CASCADE;
DROP TYPE IF EXISTS channel_type_enum CASCADE; -- Para CollectionsMatrixRules


DROP FUNCTION IF EXISTS update_updated_at_column();

-- Crear función para actualizar el campo updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';


-- Crear ENUMs para tipos y estados
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE template_type_enum AS ENUM ('whatsapp', 'sms');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE campaign_status_enum AS ENUM (
        'Borrador',      -- Draft, not yet ready for scheduling or sending
        'Aprobada',      -- Approved, ready for the scheduler to pick up based on nextRun
        'Programada',    -- Legacy or specific state if needed, generally 'Aprobada' covers this
        'Enviada',       -- Campaign has been fully processed (for 'once' frequency)
        'Pausada',       -- Manually paused
        'Error Interno'  -- An error occurred during processing that prevents further execution
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_status_enum AS ENUM (
        'Enviado',          -- Message successfully sent to provider
        'Error',            -- Error during sending attempt
        'En Proceso',       -- Message is currently being processed (e.g., by a queue)
        'Enviado (Prueba)', -- Message successfully sent during a test run
        'Error (Prueba)'    -- Error during a test send attempt
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE campaign_recipient_status_enum AS ENUM (
        'Pendiente',         -- Recipient is pending to be processed
        'Enviado',           -- Message sent to this recipient
        'Fallido',           -- Message failed for this recipient
        'PendientePrueba',   -- Recipient is pending for a test send
        'Enviado (Prueba)',  -- Test message sent to this recipient
        'Fallido (Prueba)'   -- Test message failed for this recipient
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE channel_type_enum AS ENUM ('whatsapp', 'sms');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS Users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    "hashedPassword" VARCHAR(255) NOT NULL,
    role user_role_enum DEFAULT 'user' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON Users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- Tabla de Plantillas
CREATE TABLE IF NOT EXISTS Templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    parameters TEXT[] DEFAULT '{}', -- Almacena los nombres de los parámetros, ej: {'nombre_cliente', 'monto_factura'}
    type template_type_enum NOT NULL, -- 'whatsapp' o 'sms'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT templates_name_type_key UNIQUE (name, type)
);

CREATE TRIGGER trigger_templates_updated_at
BEFORE UPDATE ON Templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- Tabla de Campañas
CREATE TABLE IF NOT EXISTS Campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type template_type_enum NOT NULL, -- 'whatsapp' o 'sms', debe coincidir con el tipo de la plantilla asociada
    template_id UUID NOT NULL REFERENCES Templates(id) ON DELETE RESTRICT, -- Prevenir eliminación de plantilla si está en uso
    
    recipient_db_query TEXT, -- Consulta SQL para obtener destinatarios. Puede ser NULL si se usan otras fuentes.

    recipients_count INTEGER DEFAULT 0, -- Conteo de destinatarios (puede ser estimado o actualizado dinámicamente)

    schedule_frequency VARCHAR(50) NOT NULL DEFAULT 'once', -- Ej: 'once', 'daily', 'weekly', 'monthly'
    schedule_time TIME, -- HH:MM:SS, hora del día para enviar
    schedule_date DATE, -- Fecha para 'once', o próxima fecha de ejecución para recurrentes

    status campaign_status_enum NOT NULL DEFAULT 'Borrador',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trigger_campaigns_updated_at
BEFORE UPDATE ON Campaigns
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- Tabla de Destinatarios de Campaña (detalla cada destinatario de una ejecución de campaña)
CREATE TABLE IF NOT EXISTS CampaignRecipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES Campaigns(id) ON DELETE CASCADE, -- Si se borra la campaña, se borran sus destinatarios
    contact VARCHAR(255) NOT NULL, -- Número de teléfono o identificador del contacto
    parameters JSONB DEFAULT '{}', -- Parámetros específicos para este destinatario (ej: {"nombre": "Juan"})
    status campaign_recipient_status_enum NOT NULL DEFAULT 'Pendiente',
    processed_at TIMESTAMPTZ, -- Cuándo se intentó enviar (o se envió)
    error_message TEXT,
    provider_message_id VARCHAR(255), -- ID del mensaje devuelto por el proveedor (Yalo, Twilio, etc.)
    provider_response JSONB, -- Respuesta completa del proveedor (para depuración)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (campaign_id, contact) -- Un contacto solo debe estar una vez por campaña (para evitar duplicados en la misma ejecución)
);

CREATE INDEX idx_campaignrecipients_campaign_id ON CampaignRecipients(campaign_id);
CREATE INDEX idx_campaignrecipients_status ON CampaignRecipients(status);

CREATE TRIGGER trigger_campaign_recipients_updated_at
BEFORE UPDATE ON CampaignRecipients
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- Tabla de Logs de Mensajes (un registro por cada mensaje enviado o intento)
CREATE TABLE IF NOT EXISTS MessageLogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id VARCHAR(255) NOT NULL, -- Puede ser un UUID de Campaign o una cadena especial como 'collections-process'
    recipient_id UUID REFERENCES CampaignRecipients(id) ON DELETE SET NULL, -- Opcional, si el mensaje viene de un CampaignRecipient
    template_id UUID NOT NULL REFERENCES Templates(id) ON DELETE RESTRICT,
    recipient_contact VARCHAR(255) NOT NULL, -- A quién se envió
    sent_at TIMESTAMPTZ NOT NULL,
    status message_status_enum NOT NULL,
    error_message TEXT,
    provider_message_id VARCHAR(255),
    provider_response JSONB, -- Respuesta completa del proveedor (para depuración)
    created_at TIMESTAMPTZ DEFAULT NOW() -- No necesita updated_at, los logs son inmutables
);

CREATE INDEX idx_messagelogs_campaign_id ON MessageLogs(campaign_id);
CREATE INDEX idx_messagelogs_recipient_contact ON MessageLogs(recipient_contact);
CREATE INDEX idx_messagelogs_status ON MessageLogs(status);
CREATE INDEX idx_messagelogs_sent_at ON MessageLogs(sent_at);


-- Tabla para Reglas de la Matriz de Cobranza
CREATE TABLE IF NOT EXISTS CollectionsMatrixRules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    days_of_arrears INTEGER NOT NULL,
    channel channel_type_enum NOT NULL, -- 'whatsapp' o 'sms'
    template_id UUID REFERENCES Templates(id) ON DELETE SET NULL, -- Puede ser NULL si la plantilla está pendiente
    pending_template_name VARCHAR(255), -- Nombre de la plantilla si template_id es NULL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (days_of_arrears, channel) -- Solo una regla por combinación de días y canal
);

CREATE TRIGGER trigger_collectionsmatrixrules_updated_at
BEFORE UPDATE ON CollectionsMatrixRules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- Tabla para Configuración de Cobranza
CREATE TABLE IF NOT EXISTS CollectionsConfiguration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    main_collections_query TEXT, -- Consulta SQL para obtener datos de clientes para cobranza
    processing_time TIME, -- Hora del día (HH:MM) para ejecutar el proceso de cobranza
    is_enabled BOOLEAN DEFAULT TRUE,
    last_processed_at TIMESTAMPTZ, -- Última vez que el proceso de cobranza se ejecutó
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trigger_collectionsconfiguration_updated_at
BEFORE UPDATE ON CollectionsConfiguration
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Ejemplo de inserción de configuración inicial (opcional, puede hacerse desde la UI)
-- INSERT INTO CollectionsConfiguration (main_collections_query, processing_time, is_enabled)
-- VALUES ('SELECT customer_id as contacto, arrears_days as dias_de_atraso, name as nombre_cliente FROM view_customers_in_arrears', '08:00:00', TRUE)
-- ON CONFLICT (id) DO NOTHING; -- O alguna lógica para asegurar que solo haya una fila de config


-- Comentarios finales
-- Asegúrate de tener la extensión pgcrypto habilitada si usas gen_random_uuid() en versiones antiguas de PostgreSQL.
-- En PostgreSQL 13+ gen_random_uuid() está disponible por defecto.
-- Considera añadir más índices según tus patrones de consulta para mejorar el rendimiento.

-- =========== Creación de Tipos ENUM ============
-- Estos tipos definen los valores permitidos para ciertas columnas.
-- Se crean primero porque las tablas dependen de ellos.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_type_enum') THEN
        CREATE TYPE template_type_enum AS ENUM ('whatsapp', 'sms', 'email', 'llamada');
    END IF;
    -- Si el tipo ya existe, se añaden los nuevos valores si no existen.
    -- Esto es seguro de ejecutar múltiples veces.
    ALTER TYPE template_type_enum ADD VALUE IF NOT EXISTS 'email';
    ALTER TYPE template_type_enum ADD VALUE IF NOT EXISTS 'llamada';
END$$;


DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status_enum') THEN
        CREATE TYPE campaign_status_enum AS ENUM ('Programada', 'Enviada', 'Borrador', 'Pausada', 'Error Interno', 'Aprobada', 'Solicitud');
    END IF;
END$$;


DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_status_enum') THEN
        CREATE TYPE template_status_enum AS ENUM ('Aprobada', 'Solicitud');
    END IF;
END$$;


DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_recipient_status_enum') THEN
        CREATE TYPE campaign_recipient_status_enum AS ENUM ('Pendiente', 'Enviado', 'Fallido', 'PendientePrueba', 'Enviado (Prueba)', 'Fallido (Prueba)');
    END IF;
END$$;


DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status_enum') THEN
        CREATE TYPE message_status_enum AS ENUM ('Enviado', 'Error', 'En Proceso', 'Enviado (Prueba)', 'Error (Prueba)');
    END IF;
END$$;


-- =========== Creación de Tablas ============

-- Tabla para Gerencias
CREATE TABLE IF NOT EXISTS Gerencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL UNIQUE,
    max_whatsapp_messages INTEGER NOT NULL DEFAULT 1000,
    max_sms_messages INTEGER NOT NULL DEFAULT 1000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla para Usuarios
CREATE TABLE IF NOT EXISTS Users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL UNIQUE,
    "hashedPassword" VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'colaborador',
    image TEXT,
    gerencia_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_gerencia FOREIGN KEY (gerencia_id) REFERENCES Gerencias(id) ON DELETE SET NULL
);

-- Tabla para Plantillas
CREATE TABLE IF NOT EXISTS Templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    parameters TEXT[],
    type template_type_enum NOT NULL,
    status template_status_enum NOT NULL DEFAULT 'Solicitud',
    user_id UUID REFERENCES Users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, type)
);

-- Tabla para Campañas
CREATE TABLE IF NOT EXISTS Campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type template_type_enum NOT NULL,
    template_id UUID NOT NULL REFERENCES Templates(id) ON DELETE RESTRICT,
    recipient_db_query TEXT,
    recipients_count INTEGER DEFAULT 0,
    schedule_frequency VARCHAR(50) NOT NULL,
    schedule_time TIME,
    schedule_date DATE,
    status campaign_status_enum NOT NULL DEFAULT 'Borrador',
    user_id UUID REFERENCES Users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla para Destinatarios de Campañas (datos pre-procesados antes de enviar)
CREATE TABLE IF NOT EXISTS CampaignRecipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES Campaigns(id) ON DELETE CASCADE,
    contact VARCHAR(255) NOT NULL,
    parameters JSONB,
    status campaign_recipient_status_enum NOT NULL DEFAULT 'Pendiente',
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    provider_message_id VARCHAR(255),
    provider_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, contact)
);

-- Tabla para Logs de Mensajes (historial de todos los envíos)
CREATE TABLE IF NOT EXISTS MessageLogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id VARCHAR(255),
    recipient_id UUID REFERENCES CampaignRecipients(id) ON DELETE SET NULL,
    template_id VARCHAR(255),
    recipient_contact VARCHAR(255) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status message_status_enum NOT NULL,
    error_message TEXT,
    provider_message_id VARCHAR(255),
    provider_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla para Conteo de Mensajes por Gerencia
CREATE TABLE IF NOT EXISTS GerenciaMessageCounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gerencia_id UUID NOT NULL REFERENCES Gerencias(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    sent_count INTEGER NOT NULL DEFAULT 0,
    month_period DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(gerencia_id, channel, month_period)
);

-- Tabla de Configuración de Cobranzas
CREATE TABLE IF NOT EXISTS CollectionsConfiguration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    main_collections_query TEXT,
    processing_time TIME,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    last_processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de Reglas para la Matriz de Cobranzas
CREATE TABLE IF NOT EXISTS CollectionsMatrixRules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    days_of_arrears INTEGER NOT NULL,
    channel template_type_enum NOT NULL,
    template_id UUID REFERENCES Templates(id) ON DELETE SET NULL,
    pending_template_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (days_of_arrears, pending_template_name)
);


-- =========== Creación de Índices ============
-- Índices para mejorar el rendimiento de las consultas más comunes.

CREATE INDEX IF NOT EXISTS idx_users_email ON Users(email);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_date ON Campaigns(status, schedule_date);
CREATE INDEX IF NOT EXISTS idx_messagelogs_campaign_id ON MessageLogs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messagelogs_sent_at ON MessageLogs(sent_at);
CREATE INDEX IF NOT EXISTS idx_gerencia_message_counts_lookup ON GerenciaMessageCounts(gerencia_id, channel, month_period);
CREATE INDEX IF NOT EXISTS idx_collections_matrix_rules_days ON CollectionsMatrixRules(days_of_arrears);

-- =========== Inserción de Datos de Ejemplo (Opcional) ============
-- Puedes descomentar estas líneas para poblar tu base de datos con datos iniciales.
/*
INSERT INTO Gerencias (nombre, max_whatsapp_messages, max_sms_messages)
VALUES
    ('Tecnología', 5000, 5000),
    ('Ventas', 10000, 20000),
    ('Marketing', 15000, 5000)
ON CONFLICT (nombre) DO NOTHING;
*/
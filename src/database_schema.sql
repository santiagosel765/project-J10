-- Drop existing types and tables if they exist to ensure a clean slate.
-- This is useful for development and resetting the database schema.
-- Be cautious running this in production as it will delete all data.

DROP TABLE IF EXISTS MessageLogs;
DROP TABLE IF EXISTS CampaignRecipients;
DROP TABLE IF EXISTS Campaigns;
DROP TABLE IF EXISTS CollectionsMatrixRules;
DROP TABLE IF EXISTS CollectionsConfiguration;
DROP TABLE IF EXISTS Templates;
DROP TABLE IF EXISTS Users;

DROP TYPE IF EXISTS user_role_enum;
DROP TYPE IF EXISTS template_type_enum;
DROP TYPE IF EXISTS template_status_enum;
DROP TYPE IF EXISTS campaign_status_enum;
DROP TYPE IF EXISTS campaign_recipient_status_enum;
DROP TYPE IF EXISTS message_status_enum;

-- Recreate all types and tables from scratch.

-- Enum for User Roles
CREATE TYPE user_role_enum AS ENUM ('admin', 'colaborador');

-- Enum for Template Types
CREATE TYPE template_type_enum AS ENUM ('whatsapp', 'sms');

-- Enum for Template Statuses
CREATE TYPE template_status_enum AS ENUM ('Aprobada', 'Solicitud');

-- Enum for Campaign Statuses
-- 'Programada' is added later for legacy compatibility.
CREATE TYPE campaign_status_enum AS ENUM ('Aprobada', 'Enviada', 'Borrador', 'Pausada', 'Error Interno', 'Solicitud');

-- Enum for Campaign Recipient Statuses
CREATE TYPE campaign_recipient_status_enum AS ENUM ('Pendiente', 'Enviado', 'Fallido', 'PendientePrueba', 'Enviado (Prueba)', 'Fallido (Prueba)');

-- Enum for Message Statuses
CREATE TYPE message_status_enum AS ENUM ('Enviado', 'Error', 'En Proceso', 'Enviado (Prueba)', 'Error (Prueba)');


-- Users Table
CREATE TABLE Users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    "hashedPassword" VARCHAR(255),
    role user_role_enum NOT NULL DEFAULT 'colaborador',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- Templates Table
CREATE TABLE Templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    parameters TEXT[],
    type template_type_enum NOT NULL,
    status template_status_enum NOT NULL,
    user_id UUID REFERENCES Users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, type)
);

-- Campaigns Table
CREATE TABLE Campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type template_type_enum NOT NULL,
    template_id UUID REFERENCES Templates(id) ON DELETE CASCADE NOT NULL,
    recipient_db_query TEXT,
    recipients_count INTEGER DEFAULT 0,
    schedule_frequency VARCHAR(50),
    schedule_time TIME,
    schedule_date DATE,
    status campaign_status_enum NOT NULL,
    user_id UUID REFERENCES Users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CampaignRecipients Table
CREATE TABLE CampaignRecipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES Campaigns(id) ON DELETE CASCADE,
    contact VARCHAR(255) NOT NULL,
    parameters JSONB,
    status campaign_recipient_status_enum,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    provider_message_id VARCHAR(255),
    provider_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, contact)
);

-- MessageLogs Table
CREATE TABLE MessageLogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id VARCHAR(255), 
    recipient_id UUID REFERENCES CampaignRecipients(id) ON DELETE SET NULL,
    template_id UUID REFERENCES Templates(id) ON DELETE SET NULL,
    recipient_contact VARCHAR(255) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    status message_status_enum NOT NULL,
    error_message TEXT,
    provider_message_id VARCHAR(255),
    provider_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CollectionsMatrixRules Table
CREATE TABLE CollectionsMatrixRules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  days_of_arrears INTEGER NOT NULL,
  channel template_type_enum NOT NULL,
  template_id UUID REFERENCES Templates(id) ON DELETE SET NULL,
  pending_template_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CollectionsConfiguration Table
CREATE TABLE CollectionsConfiguration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  main_collections_query TEXT,
  processing_time TIME,
  is_enabled BOOLEAN DEFAULT TRUE,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add legacy 'Programada' status to the campaign_status_enum if it doesn't exist.
-- This ensures backward compatibility if needed, without causing errors on re-runs.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'campaign_status_enum'::regtype AND enumlabel = 'Programada') THEN
        ALTER TYPE campaign_status_enum ADD VALUE 'Programada';
    END IF;
END$$;

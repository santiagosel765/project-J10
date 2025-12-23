# JOE

This is a NextJS application built in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment Variables

### Required Variables

#### Database
- `POSTGRES_URL`: PostgreSQL connection string

#### DAPTA API (Llamadas IA)
- `DAPTA_API_KEY`: API key for DAPTA service (required for AI calls)
- `DAPTA_API_URL`: DAPTA API endpoint (defaults to `https://api.dapta.ai/api/e1b76ceb27df1c6e/sendcalls`)

#### Other Integrations
- `YALO_CHAT_API_TOKEN`: YaloChat API token for WhatsApp
- `YALO_CHAT_API_URL`: YaloChat API endpoint
- `SMS_API_URL`: SMS provider API endpoint
- `SMS_API_ID`: SMS provider API ID
- `SMS_API_KEY`: SMS provider API key

### Setup

Create a `.env.local` file in the root directory:

```bash
# Database
POSTGRES_URL="postgresql://user:pass@host:5432/dbname"

# DAPTA (AI Calls)
DAPTA_API_KEY="your-dapta-api-key-here"
DAPTA_API_URL="https://api.dapta.ai/api/e1b76ceb27df1c6e/sendcalls"

# WhatsApp (YaloChat)
YALO_CHAT_API_TOKEN="your-yalo-token"
YALO_CHAT_API_URL="https://api-global.yalochat.com/notifications/api/v1/..."

# SMS
SMS_API_URL="your-sms-api-url"
SMS_API_ID="your-sms-id"
SMS_API_KEY="your-sms-key"
```

**⚠️ IMPORTANT**: Never commit `.env.local` to version control. API keys should be stored securely.

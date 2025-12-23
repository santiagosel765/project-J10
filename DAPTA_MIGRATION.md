# DAPTA Migration Guide - Llamadas IA

## Resumen de Cambios

Se migró el canal **"llamada-ia"** de **HiveAI** a **DAPTA API**.

### Archivos Modificados

1. ✅ `src/actions/campaignActions.ts`:
   - `sendAiCall()` - Reemplazado para usar DAPTA API
   - `getRecipientsForCampaign()` - Parámetros obligatorios reducidos a solo `nombre_cliente`

2. ✅ `src/components/dashboard/CreateTemplateForm.tsx`:
   - Actualizado label y descripción (metadata interna, no se envía a API)

3. ✅ `src/components/dashboard/EditTemplateForm.tsx`:
   - Actualizado label y descripción (consistencia con Create)

4. ✅ `README.md`:
   - Agregada sección de variables de entorno

---

## Variables de Entorno Requeridas

### Desarrollo Local (`.env.local`)

```bash
# DAPTA API Configuration
DAPTA_API_KEY="your-dapta-api-key-here"
DAPTA_API_URL="https://api.dapta.ai/api/e1b76ceb27df1c6e/sendcalls"
```

### Producción (Vercel/Servidor)

Configurar en Dashboard → Settings → Environment Variables:
- `DAPTA_API_KEY` (Secret)
- `DAPTA_API_URL` (String)

---

## Especificación Técnica - DAPTA API

### Request

**Endpoint**: `https://api.dapta.ai/api/e1b76ceb27df1c6e/sendcalls`

**Method**: `POST`

**Headers**:
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {DAPTA_API_KEY}"
}
```

**Body**:
```json
{
  "to_number": "+502XXXXXXXX",
  "nombre_cliente": "Juan Pérez",
  "current_time": "2025-01-15T10:30:00.000Z"
}
```

**Notas**:
- `to_number`: Formato E.164 requerido (ej: `+50212345678`)
- `nombre_cliente`: Nombre del cliente (obligatorio)
- `current_time`: ISO 8601 (generado automáticamente server-side)
- ⚠️ **NO se envían**: `call_type`, `nombre_agente`, `nombre_empresa` (HiveAI legacy)

### Response

**Success (200 OK)**:
```json
{
  "call_id": "abc123",
  "status": "initiated",
  ...
}
```

**Error (4xx/5xx)**:
```json
{
  "detail": "Error message",
  "error": "...",
  ...
}
```

---

## Pasos de Prueba Manual

### 1. Configurar Variables de Entorno

```bash
# En .env.local
echo 'DAPTA_API_KEY="your-actual-key"' >> .env.local
echo 'DAPTA_API_URL="https://api.dapta.ai/api/e1b76ceb27df1c6e/sendcalls"' >> .env.local
```

Reiniciar el servidor:
```bash
npm run dev
```

---

### 2. Crear Plantilla Tipo 'llamada-ia'

1. Navegar a: **Dashboard → Plantillas → Crear Plantilla**
2. Completar formulario:
   - **Nombre**: "Prueba DAPTA Cobranza"
   - **Tipo**: **Llamada IA**
   - **Tipo de Llamada**: "cobranza" (metadata interna)
   - **Parámetros**: Dejar vacío (nombre_cliente se obtiene de la consulta)
3. Guardar plantilla
4. ✅ **Verificar**: Plantilla guardada sin errores

---

### 3. Crear Campaña con Plantilla 'llamada-ia'

1. Navegar a: **Dashboard → Campañas → Crear Campaña**
2. Completar formulario:
   - **Nombre**: "Prueba DAPTA"
   - **Plantilla**: Seleccionar "Prueba DAPTA Cobranza"
   - **Categoría**: Cobranza
   - **Consulta SQL**:
     ```sql
     SELECT
       '50212345678' AS contacto,
       'Juan Pérez' AS nombre_cliente
     LIMIT 1;
     ```
   - **Programación**: Once, mañana a las 10:00
3. Guardar campaña
4. ✅ **Verificar**: Campaña creada con status 'Borrador' o 'Solicitud'

---

### 4. Ejecutar Prueba de Campaña (runTestCampaign)

1. Navegar a: **Dashboard → Campañas → [Tu campaña]**
2. Click en botón **"Enviar Prueba"**
3. Esperar respuesta (puede tomar 5-10 segundos)

**Resultado Esperado**:
```
✅ Prueba completada exitosamente
   Procesados: 1
   Enviados: 1
   Fallidos: 0
```

**Si Falla**:
- Verificar logs del servidor:
  ```
  [DAPTA] Initiating AI call to +5021234***
  [DAPTA] API error: ...
  ```
- Verificar variables de entorno configuradas correctamente
- Verificar API key válida

---

### 5. Verificar en Base de Datos

#### A) CampaignRecipients

```sql
SELECT
  id,
  contact,
  parameters,
  status,
  error_message,
  provider_message_id,
  provider_response
FROM campaignrecipients
WHERE campaign_id = '[tu-campaign-id]'
ORDER BY created_at DESC
LIMIT 5;
```

**Verificar**:
- ✅ `status` = 'Enviado (Prueba)' (si exitoso) o 'Fallido (Prueba)' (si error)
- ✅ `provider_response` contiene respuesta de DAPTA (JSON)
- ❌ `provider_response` NO debe contener `api_key` ni `token`
- ✅ `provider_message_id` contiene ID de DAPTA

---

#### B) MessageLogs

```sql
SELECT
  id,
  campaign_id,
  recipient_contact,
  status,
  error_message,
  provider_response,
  sent_at
FROM messagelogs
WHERE campaign_id = '[tu-campaign-id]'
ORDER BY sent_at DESC
LIMIT 5;
```

**Verificar**:
- ✅ `status` = 'Enviado (Prueba)'
- ✅ `provider_response` contiene respuesta de DAPTA

---

#### C) GerenciaMessageCounts

```sql
SELECT
  gmc.*,
  g.nombre AS gerencia_nombre,
  g.max_ai_calls
FROM gerenciamessagecounts gmc
JOIN gerencias g ON g.id = gmc.gerencia_id
WHERE gmc.channel = 'llamada-ia'
  AND gmc.month_period = DATE_TRUNC('month', CURRENT_DATE)
ORDER BY gmc.updated_at DESC;
```

**Verificar**:
- ✅ `sent_count` incrementó después de envío de prueba
- ✅ `sent_count` <= `max_ai_calls` (límite de gerencia)

---

### 6. Prueba de Campaña Real (processScheduledCampaigns)

1. Aprobar campaña: **Dashboard → Campañas → [Tu campaña] → Aprobar**
2. Esperar a que la fecha/hora programada llegue
   - **O** forzar ejecución manual (si tienes endpoint de cron):
     ```bash
     curl -X POST http://localhost:3000/api/cron/process-campaigns
     ```
3. Verificar en BD (igual que paso 5)

**Verificar**:
- ✅ Status de campaña cambió a 'Enviada' (si frequency='once')
- ✅ Destinatarios procesados correctamente
- ✅ GerenciaMessageCounts incrementó

---

### 7. Verificar Seguridad

#### A) Logs del Servidor

```bash
# Buscar en logs
grep -i "dapta" logs/server.log
```

**Verificar**:
- ✅ Logs muestran: `[DAPTA] Initiating AI call to +5021234***`
- ❌ Logs NO deben mostrar API key completa
- ❌ Logs NO deben mostrar `templateParams` completo (puede tener PII)

---

#### B) Provider Response en BD

```sql
SELECT provider_response
FROM campaignrecipients
WHERE campaign_id = '[tu-campaign-id]'
LIMIT 1;
```

**Verificar**:
- ❌ `provider_response` NO debe contener campos: `api_key`, `apiKey`, `token`

---

## Casos de Prueba Adicionales

### 8. Prueba de Error: API Key Inválida

1. Cambiar `.env.local`:
   ```bash
   DAPTA_API_KEY="invalid-key-test"
   ```
2. Reiniciar servidor
3. Ejecutar prueba de campaña

**Resultado Esperado**:
```
❌ Error: DAPTA API key no configurado (o error de autenticación)
```

---

### 9. Prueba de Error: Parámetro Faltante

1. Crear campaña con consulta SQL sin `nombre_cliente`:
   ```sql
   SELECT '50212345678' AS contacto;
   ```
2. Ejecutar prueba

**Resultado Esperado**:
- ✅ Se envía con `nombre_cliente = "Cliente"` (valor por defecto)

---

### 10. Prueba de Límite de Gerencia

1. Obtener límite actual:
   ```sql
   SELECT max_ai_calls FROM gerencias WHERE id = '[tu-gerencia-id]';
   ```
2. Reducir límite temporalmente:
   ```sql
   UPDATE gerencias SET max_ai_calls = 5 WHERE id = '[tu-gerencia-id]';
   ```
3. Crear campaña con 10 destinatarios
4. Ejecutar campaña

**Verificar**:
- ✅ Solo se envían los primeros 5 mensajes
- ✅ Los restantes 5 se marcan como 'Fallido' con error "Límite de gerencia alcanzado"

---

## Compatibilidad con Otros Canales

**✅ NO afectado**: WhatsApp (YaloChat)
**✅ NO afectado**: SMS
**✅ NO afectado**: Email
**✅ NO afectado**: Llamada (legacy)

### Prueba Rápida de Compatibilidad

1. Crear plantilla tipo **WhatsApp**
2. Crear campaña con esa plantilla
3. Ejecutar prueba

**Resultado Esperado**:
- ✅ WhatsApp funciona normalmente (sin cambios)

---

## Troubleshooting

### Error: "DAPTA API key no configurado"

**Causa**: Variable de entorno `DAPTA_API_KEY` no está configurada.

**Solución**:
```bash
echo 'DAPTA_API_KEY="your-key"' >> .env.local
npm run dev
```

---

### Error: "Invalid API URL"

**Causa**: Variable `DAPTA_API_URL` tiene formato inválido.

**Solución**:
```bash
# Verificar URL
echo $DAPTA_API_URL

# Debe ser una URL válida
DAPTA_API_URL="https://api.dapta.ai/api/e1b76ceb27df1c6e/sendcalls"
```

---

### Error: "Failed to initiate AI call via DAPTA"

**Causa**: Error de comunicación con DAPTA API.

**Solución**:
1. Verificar API key válida
2. Verificar endpoint correcto
3. Verificar conectividad de red
4. Revisar logs del servidor para más detalles

---

### Error: "Límite de gerencia alcanzado"

**Causa**: La gerencia del usuario alcanzó su límite mensual de llamadas IA.

**Solución**:
1. Esperar al siguiente mes (límite se resetea)
2. O aumentar límite:
   ```sql
   UPDATE gerencias
   SET max_ai_calls = 10000
   WHERE id = '[gerencia-id]';
   ```

---

## Rollback (Si es Necesario)

Si necesitas revertir a HiveAI:

```bash
git revert HEAD
git push origin main
```

Luego restaurar variables de entorno:
```bash
# .env.local
HIVEAI_API_TOKEN="your-old-token"
```

**Nota**: Los cambios de BD (enum 'llamada-ia', columna max_ai_calls) son compatibles hacia atrás y no necesitan revertirse.

---

## Checklist de Deploy a Producción

- [ ] Variables de entorno configuradas en servidor
  - [ ] `DAPTA_API_KEY` (Secret)
  - [ ] `DAPTA_API_URL`
- [ ] Código mergeado a `main`
- [ ] Pruebas locales exitosas
- [ ] Backup de BD reciente
- [ ] Monitoreo de logs activado
- [ ] Plan de rollback preparado
- [ ] Equipo notificado del deploy

---

## Contacto

Si encuentras problemas o tienes preguntas, contacta al equipo de desarrollo.

**Última actualización**: 2025-01-15

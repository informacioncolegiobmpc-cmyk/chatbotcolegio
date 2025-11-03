import { GoogleAuth } from 'google-auth-library'
import { google } from 'googleapis'

/**
 * @class GoogleSheetService
 * Encapsula toda la lógica para interactuar con Google Sheets,
 * usando las credenciales cargadas desde el archivo .env.
 */
class GoogleSheetService {
    constructor() {
        // ✅ Leer credenciales desde .env
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
        if (!credentialsJson) {
            throw new Error('❌ No se encontró GOOGLE_APPLICATION_CREDENTIALS_JSON en el archivo .env')
        }

        let credentials
        try {
            credentials = JSON.parse(credentialsJson)
        } catch (error) {
            console.error('❌ Error al parsear las credenciales JSON:', error.message)
            throw new Error('El formato de GOOGLE_APPLICATION_CREDENTIALS_JSON no es válido')
        }

        // ✅ Crear autenticador con las credenciales parseadas
        this.auth = new GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })

        // ✅ Inicializar la API de Sheets
        this.sheets = google.sheets({ version: 'v4', auth: this.auth })

        // ✅ ID de la hoja desde .env
        this.sheetId = process.env.SHEET_ID

        // Cachés
        this.flowsCache = null
        this.promptsCache = null
        this.scheduledMessagesCache = null
        this.lastFlowsFetch = 0
        this.lastPromptsFetch = 0
        this.lastScheduledMessagesFetch = 0
        this.cacheDuration = 5 * 60 * 1000 // 5 minutos
    }
    // ==============================================
// 🤖 findFlowAnswer.js
// Servicio para encontrar respuestas según Google Sheets
// ==============================================

import googleSheetService from "./googleSheetService.js";

/**
 * Normaliza texto para comparar sin errores de mayúsculas/tildes/espacios.
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD") // elimina tildes
    .replace(/[\u0300-\u036f]/g, "") // remueve acentos
    .replace(/[^a-z0-9\s]/g, "") // elimina símbolos
    .trim();
}

/**
 * Busca una coincidencia entre el mensaje del usuario y las keywords del Sheet.
 * @param {string} userMessage - El mensaje entrante del usuario
 * @returns {object|null} - Devuelve el flujo coincidente o null si no se encontró
 */
export async function findFlowAnswer(userMessage) {
  const msg = normalizeText(userMessage);
  const flows = await googleSheetService.getFlows();

  for (const flow of flows) {
    const rawKeywords = flow.addKeyword || "";
    const keywords = rawKeywords
      .split(",")
      .map(k => normalizeText(k));

    // Recorremos todas las palabras clave
    for (const keyword of keywords) {
      if (!keyword) continue;

      // === Coincidencia exacta ===
      if (msg === keyword) {
        console.log(`✅ Coincidencia exacta: "${keyword}"`);
        return flow;
      }

      // === Coincidencia por palabra completa ===
      const regexWord = new RegExp(`\\b${keyword}\\b`, "i");
      if (regexWord.test(msg)) {
        console.log(`✅ Coincidencia por palabra: "${keyword}"`);
        return flow;
      }

      // === Coincidencia parcial (por ejemplo: "hola buenos dias") ===
      if (msg.includes(keyword)) {
        console.log(`✅ Coincidencia parcial: "${keyword}"`);
        return flow;
      }
    }
  }

  console.log("⚠️ No se encontró coincidencia para:", msg);
  return null;
}

    /* ================================
       🧩 Obtener flujos
    ================================= */
    async getFlows() {
        const now = Date.now()
        if (this.flowsCache && now - this.lastFlowsFetch < this.cacheDuration) {
            console.log('✅ Usando caché de flujos.')
            return this.flowsCache
        }

        console.log('🔄 Caché expirada. Obteniendo flujos desde Google Sheets...')
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Flujos!A2:C',
            })

            const rows = response.data.values || []
            const headers = ['addKeyword', 'addAnswer', 'media']

            const flows = rows.map((row) => {
                const flow = {}
                headers.forEach((header, index) => {
                    flow[header] = row[index] || null
                })
                return flow
            })

            this.flowsCache = flows
            this.lastFlowsFetch = now
            console.log(`✅ Flujos cargados y cacheados correctamente. Total: ${flows.length}`)
            return flows
        } catch (error) {
            console.error('❌ Error al obtener datos de Google Sheets:', error)
            return []
        }
    }

    /* ================================
       🧠 Obtener prompts de IA
    ================================= */
    async getPrompts() {
        const now = Date.now()
        if (this.promptsCache && now - this.lastPromptsFetch < this.cacheDuration) {
            console.log('✅ Usando caché de prompts.')
            return this.promptsCache
        }

        console.log('🔄 Caché expirada. Obteniendo prompts desde Google Sheets...')
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'IA_Prompts!A2:C',
            })

            const rows = response.data.values || []
            const settings = {}

            if (rows.length > 0 && rows[0][0]) {
                settings['system_prompt'] = rows[0][0]
            }

            rows.forEach(row => {
                const key = row[1]
                const value = row[2]
                if (key && value) {
                    settings[key] = value
                }
            })

            this.promptsCache = settings
            this.lastPromptsFetch = now
            console.log(`✅ Prompts cargados y cacheados correctamente.`, settings)
            return settings
        } catch (error) {
            console.error('❌ Error al obtener prompts de Google Sheets:', error)
            return {}
        }
    }

    /* ================================
       🕒 Obtener mensajes programados
    ================================= */
    async getScheduledMessages() {
        const now = Date.now()
        if (this.scheduledMessagesCache && now - this.lastScheduledMessagesFetch < this.cacheDuration) {
            console.log('✅ Usando caché de mensajes programados.')
            return this.scheduledMessagesCache
        }

        console.log('🔄 Caché expirada. Obteniendo mensajes programados desde Google Sheets...')
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Mensajes_Programados!A2:F',
            })

            const rows = response.data.values || []
            const headers = ['fecha', 'hora', 'phone', 'addAnswer', 'media', 'estado']

            const scheduledMessages = rows.map((row, index) => {
                const message = { rowIndex: index + 2 } // +2 porque empieza en A2
                headers.forEach((header, colIndex) => {
                    message[header] = row[colIndex] || null
                })
                return message
            })

            this.scheduledMessagesCache = scheduledMessages
            this.lastScheduledMessagesFetch = now
            console.log(`✅ Mensajes programados cargados y cacheados correctamente. Total: ${scheduledMessages.length}`)
            return scheduledMessages
        } catch (error) {
            console.error('❌ Error al obtener mensajes programados de Google Sheets:', error)
            return []
        }
    }

    /* ================================
       ✏️ Actualizar estado de mensaje
    ================================= */
    async updateMessageStatus(rowIndex, newStatus) {
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.sheetId,
                range: `Mensajes_Programados!F${rowIndex}`,
                valueInputOption: 'RAW',
                resource: {
                    values: [[newStatus]]
                }
            })

            this.scheduledMessagesCache = null
            console.log(`✅ Estado actualizado en fila ${rowIndex}: ${newStatus}`)
            return true
        } catch (error) {
            console.error(`❌ Error al actualizar estado en fila ${rowIndex}:`, error)
            return false
        }
    }
    

    /* ================================
       ♻️ Invalidar caché
    ================================= */
    invalidateCache() {
        this.flowsCache = null
        this.promptsCache = null
        this.scheduledMessagesCache = null
        this.lastFlowsFetch = 0
        this.lastPromptsFetch = 0
        this.lastScheduledMessagesFetch = 0
        console.log('🔄 Todas las cachés invalidadas')
    }
        /**
     * Guarda un mensaje (entrante o saliente) en la hoja 'Logs'.
     * @param {string} phone - Número de teléfono del usuario
     * @param {string} message - Mensaje de texto
     * @param {string} direction - 'IN' (entrante) o 'OUT' (saliente)
     * @param {string} status - Estado opcional, por ejemplo 'Enviado', 'Recibido', 'Error'
     */
    async logMessage(phone, message, direction = 'IN', role = 'user', status = 'OK') {
    try {
        const timestamp = new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' });

        const values = [
            timestamp,
            phone,
            direction,
            role,
            message,
            status
        ];

        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.sheetId,
            range: 'Logs!A:F',
            valueInputOption: 'RAW',
            resource: { values: [values] }
        });

        console.log(`✅ [Sheets] Mensaje de ${phone} registrado en Logs`);
    } catch (error) {
        console.error('❌ Error al guardar mensaje en Logs:', error.message);
    }
}
}

// ✅ Exportar una instancia única
const googleSheetService = new GoogleSheetService()
export default googleSheetService

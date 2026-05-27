import cron from 'node-cron';
import { supabase } from '../config/supabase';
import { waService } from './whatsapp';
import { getAIResponse } from './ai';

// Configuração do ID do grupo da igreja via .env ou Hardcoded (Correção solicitada)
const CHURCH_GROUP_ID = process.env.WHATSAPP_GROUP_ID || '120363134268223078@g.us';

// Número do Pastor ou Líder Principal para notificações
const LEADER_PHONE = process.env.LEADER_PHONE || '';

export function initScheduler() {
    console.log('📅 Inicializando agendador de tarefas...');

    // ---------------------------------------------------------------
    // KEEP-ALIVE: pinga o próprio servidor a cada 10 minutos
    // Impede hibernação no Render free tier (dorme após 15 min idle)
    // Configure SELF_URL=https://seu-app.onrender.com no .env / painel
    // ---------------------------------------------------------------
    const SELF_URL = process.env.SELF_URL;
    if (SELF_URL) {
        let finalUrl = SELF_URL.trim();
        if (!finalUrl.startsWith('http')) {
            finalUrl = `https://${finalUrl}`;
        }
        
        console.log(`💓 Keep-alive ativado → pingando ${finalUrl} a cada 10 min`);
        cron.schedule('*/10 * * * *', async () => {
            try {
                const res = await fetch(`${finalUrl.replace(/\/$/, '')}/`);
                console.log(`💓 Keep-alive OK (status ${res.status})`);
            } catch (e: any) {
                console.warn(`💔 Keep-alive falhou em ${finalUrl}: ${e.message}`);
            }
        });
    } else {
        console.log('ℹ️ SELF_URL não configurado — keep-alive desativado');
    }
}

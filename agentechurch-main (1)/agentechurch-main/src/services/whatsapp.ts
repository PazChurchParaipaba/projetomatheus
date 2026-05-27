import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, WASocket, WAMessage, proto, downloadMediaMessage, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import { Buffer } from 'buffer';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { supabase } from '../config/supabase';
import { findNearestLife } from '../utils/location';

import PDFDocument from 'pdfkit';

interface UserState {
    type: 'HUMAN_ATTENDANCE' | 'BOT';
    step?: string;
    data?: any;
    lastInteraction: number;
    notifiedInactivity: boolean;
}

export class WhatsAppService {
    public sock: WASocket | undefined;
    private authStateStr = 'auth_session_v2';
    private retryCount = 0;
    private MAX_RETRIES = 999;
    private reconnectTimer: NodeJS.Timeout | null = null;
    public lastMessageAt: number = Date.now();
    private isReconnecting: boolean = false;
    private watchdogTimer: NodeJS.Timeout | null = null;
    private inactivityTimer: NodeJS.Timeout | null = null;

    public qrCodeString: string | null = null;
    public qrCodeDataUrl: string | null = null;
    public isConnected: boolean = false;
    public connecting: boolean = false;
    private connectionWatchdog: NodeJS.Timeout | null = null;
    private LEADER_PHONE = process.env.LEADER_PHONE;

    private userStates: { [key: string]: UserState } = {};

    public setHumanAttendance(phone: string) {
        const jid = phone.includes('@') ? phone : (phone.length >= 14 ? `${phone}@lid` : `${phone}@s.whatsapp.net`);
        this.userStates[jid] = {
            type: 'HUMAN_ATTENDANCE',
            lastInteraction: Date.now(),
            notifiedInactivity: false
        };
    }

    constructor() {
        this.watchdogTimer = setInterval(() => {
            if (!this.isConnected && !this.isReconnecting) {
                this.scheduleReconnect(0);
            } else if (this.isConnected) {
                const idleMs = Date.now() - this.lastMessageAt;
                if (idleMs > 10 * 60 * 1000) {
                    try {
                        this.sock?.sendPresenceUpdate('available').catch(() => {
                            console.log('⚠️ Falha ao atualizar presença, marcando como offline.');
                            this.isConnected = false;
                            this.scheduleReconnect(5000);
                        });
                    } catch (e) {
                        this.isConnected = false;
                        this.scheduleReconnect(5000);
                    }
                } else if (!this.sock || !this.sock.user) {
                    // Se o socket existe mas não tem usuário, algo está errado
                    console.log('⚠️ Socket sem usuário detectado pelo watchdog.');
                    this.isConnected = false;
                    this.scheduleReconnect(5000);
                }
            }
        }, 2 * 60 * 1000); // Check every 2 minutes instead of 3

        // Monitor de Inatividade (20 minutos)
        this.inactivityTimer = setInterval(() => {
            this.checkInactivity();
        }, 1 * 60 * 1000); // Checa a cada minuto
    }

    private async checkInactivity() {
        const now = Date.now();
        const INACTIVITY_THRESHOLD = 20 * 60 * 1000; // 20 minutos

        for (const jid in this.userStates) {
            const state = this.userStates[jid];
            if (!state.notifiedInactivity && (now - state.lastInteraction) > INACTIVITY_THRESHOLD) {
                state.notifiedInactivity = true;
                // Pode adicionar lógica de inatividade aqui se necessário no futuro
            }
        }
    }

    private scheduleReconnect(delayMs: number) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        const backoffMs = Math.min(delayMs + (this.retryCount * 5000), 5 * 60 * 1000);
        this.isReconnecting = true;
        this.reconnectTimer = setTimeout(() => {
            this.isReconnecting = false;
            this.connectToWhatsApp();
        }, backoffMs);
    }

    public async forceReset() {
        console.log('⚠️ Forçando reset geral de conex\u00e3o...');
        this.connecting = false;
        this.isConnected = false;
        this.qrCodeString = null;
        this.qrCodeDataUrl = null;
        this.retryCount = 0;
        this.isReconnecting = false;
        
        if (this.connectionWatchdog) {
            clearTimeout(this.connectionWatchdog);
            this.connectionWatchdog = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.sock) {
            try { this.sock.logout(); } catch(e) {}
            try { this.sock.end(undefined); } catch(e) {}
            this.sock = undefined;
        }

        const authPath = path.resolve(this.authStateStr);
        if (fs.existsSync(authPath)) {
            try { fs.rmSync(authPath, { recursive: true, force: true }); } catch(e) {}
        }
    }

    async connectToWhatsApp() {
        try {
            let version;
            try {
                const latest = await fetchLatestBaileysVersion();
                version = latest.version;
                console.log(`📡 Usando Baileys v${version.join('.')}`);
            } catch (e) {
                console.warn('⚠️ Erro ao buscar vers\u00e3o do WhatsApp, usando fallback...');
                version = [2, 3000, 1015901307]; // Fallback gen\u00e9rico est\u00e1vel
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.authStateStr);

            if (this.sock) {
                try { 
                    this.sock.ev.removeAllListeners('connection.update');
                    this.sock.ev.removeAllListeners('creds.update');
                    this.sock.ev.removeAllListeners('messages.upsert');
                    this.sock.end(undefined); 
                } catch (e) { }
                this.sock = undefined;
            }

            this.sock = makeWASocket({
                logger: pino({ level: 'silent' }), // Alterado para silent para não travar o Koyeb com excesso de logs
                auth: state,
                version,
                browser: ['AssistenteShows', 'Chrome', '1.0.0'], // Alterado para evitar bloqueios no pareamento
                syncFullHistory: false,
                markOnlineOnConnect: true,
                keepAliveIntervalMs: 30000,
                defaultQueryTimeoutMs: 60000,
                getMessage: async (key) => {
                    return { conversation: 'Mensagem de fallback' };
                }
            });

            this.sock.ev.on('connection.update', async (update: any) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    this.qrCodeString = qr;
                    this.qrCodeDataUrl = await QRCode.toDataURL(qr);
                    console.log('💠 Novo QR Code gerado.');
                    if (qrcodeTerminal) qrcodeTerminal.generate(qr, { small: true });
                }

                if (connection === 'close') {
                    this.isConnected = false;
                    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    console.log(`❌ Conex\u00e3o fechada. Motivo: ${statusCode || 'Desconhecido'}`);

                    if (statusCode === DisconnectReason.loggedOut) {
                        console.log('🚪 Sess\u00e3o encerrada. Limpando dados de autentica\u00e7\u00e3o...');
                        const authPath = path.resolve(this.authStateStr);
                        if (fs.existsSync(authPath)) {
                            fs.rmSync(authPath, { recursive: true, force: true });
                        }
                        this.qrCodeString = null;
                        this.qrCodeDataUrl = null;
                        this.retryCount = 0;
                    }

                    if (shouldReconnect) {
                        this.retryCount++;
                        const delay = Math.min(10000 * Math.pow(1.5, this.retryCount), 60000);
                        console.log(`⏳ Agendando reconex\u00e3o em ${Math.round(delay/1000)}s... (Tentativa ${this.retryCount})`);
                        this.scheduleReconnect(delay);
                    }
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.qrCodeString = null;
                    this.qrCodeDataUrl = null;
                    this.retryCount = 0;
                    this.lastMessageAt = Date.now();
                    console.log('✅ WhatsApp conectado com sucesso! 🚀');
                }
            });

            // Detecção e Atendimento Humanizado de Chamadas (Voice/Video)
            this.sock.ev.on('call', async (calls: any) => {
                for (const call of calls) {
                    if (call.status === 'offer') {
                        const from = call.from;
                        const callId = call.id;

                        console.log(`📞 Chamada recebida de ${from} (ID: ${callId}). Rejeitando para iniciar Modo Voz...`);

                        try {
                            // Rejeita a chamada para liberar o áudio do celular para o navegador
                            await this.sock?.rejectCall(callId, from);
                        } catch (e) {
                            console.error("Erro ao rejeitar chamada:", e);
                        }

                        // Link Dinâmico Gratuito (voz.html hospedada localmente)
                        let baseUrl = process.env.SELF_URL ? process.env.SELF_URL.trim().replace(/\/$/, '') : 'http://localhost:3000';
                        if (baseUrl !== 'http://localhost:3000' && !baseUrl.startsWith('http')) {
                            baseUrl = `https://${baseUrl}`;
                        }
                        const voiceRoomLink = `${baseUrl}/voz.html?cid=${from.split('@')[0]}`;

                        const msg = `🌟 *ATENDIMENTO POR VOZ EM REAL-TIME (GRÁTIS)* 🌟\n\nOlá! Notei sua ligação. Para conversarmos por voz em tempo real (estilo *ChatGPT Voice*), clique no link abaixo:\n\n🔗 ${voiceRoomLink}\n\nLá eu consigo te ouvir e falar sem custos! 🎤`;

                        await this.sendMessage(from, msg);
                    }
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

            // Listener para dar as boas-vindas a novos membros (Pode ser ajustado para Shows)
            this.sock.ev.on('group-participants.update', async (event) => {
                if (event.action === 'add') {
                    const groupId = event.id;
                    const newMembers = event.participants;
                    try {
                        const groupMeta = await this.sock?.groupMetadata(groupId);
                        const groupName = groupMeta?.subject;

                        for (const member of newMembers) {
                            const memberId = member.id;
                            const welcomeMessage = `Olá, @${memberId.split('@')[0]}! 👋\n\nSeja muito bem-vindo(a) ao grupo *${groupName}*!`;
                            await this.sock?.sendMessage(groupId, {
                                text: welcomeMessage,
                                mentions: [memberId]
                            });
                        }
                    } catch (error) {
                        console.error('Erro ao dar boas-vindas:', error);
                    }
                }
            });

            this.sock.ev.on('messages.upsert', async (m: any) => {
                const msg = m.messages[0];
                if (!msg.message || m.type !== 'notify') return;
                const remoteJid = msg.key.remoteJid;
                if (!remoteJid || remoteJid === 'status@broadcast' || msg.key.fromMe) return;

                let textBody = msg.message.conversation || msg.message.extendedTextMessage?.text;
                let imageBase64: string | undefined;
                let imageMimeType: string | undefined;

                if (msg.message.imageMessage) {
                    try {
                        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) } as any);
                        imageBase64 = (buffer as Buffer).toString('base64');
                        imageMimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
                        textBody = msg.message.imageMessage.caption || "Analise esta foto.";
                    } catch (e) { console.error("Erro imagem:", e); }
                }

                let isAudioMessage = false;
                if (msg.message.audioMessage) {
                    isAudioMessage = true;
                    try {
                        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) } as any);
                        const audioPath = path.join(__dirname, `../../temp_audio_${Date.now()}.ogg`);
                        fs.writeFileSync(audioPath, (buffer as Buffer));
                        const { transcribeAudio } = await import('./ai');
                        const text = await transcribeAudio(fs.createReadStream(audioPath));
                        fs.unlinkSync(audioPath);
                        if (text) textBody = text;
                    } catch (e) { console.error("Erro áudio:", e); }
                }

                if (!textBody && !imageBase64) return;

                // Atualiza último contato se houver estado ativo
                if (this.userStates[remoteJid]) {
                    this.userStates[remoteJid].lastInteraction = Date.now();
                    this.userStates[remoteJid].notifiedInactivity = false;
                }

                const phone = remoteJid.replace(/\D/g, '');
                const isGroup = remoteJid.includes('@g.us');

                const now = new Date();
                const spTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                const isSunday = spTime.getDay() === 0; // 0 = Domingo
                const dayName = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][spTime.getDay()];
                const lowerText = textBody ? textBody.toLowerCase() : '';

                // NOVA LÓGICA DE GRUPO: Responder apenas se for mencionado ou se for um comando.
                if (isGroup) {
                    const botJid = this.sock?.user?.id;
                    // a menção pode vir no contextInfo (oficial) ou no texto (manual)
                    const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    const isMentioned = mentionedJid.includes(botJid);

                }

                // Fluxo de IA (Shows)
                if (!isGroup) {
                try {
                    // Ignora AI se estiver em atendimento humano
                    if (this.userStates[remoteJid]?.type === 'HUMAN_ATTENDANCE') {
                        return;
                    }

                    const { getAIResponse } = await import('./ai');
                    if (this.sock) await this.sock.sendPresenceUpdate(isAudioMessage ? 'recording' : 'composing', remoteJid);

                    // Modificação p/ f97: Se for imagem com legenda "reembolso", dar contexto extra p/ IA
                    let contextMessage = textBody || '';
                    if (isAudioMessage) {
                        contextMessage = `[O USUÁRIO ENVIOU UM ÁUDIO] Responda de forma sucinta e amigável. Hoje é ${dayName}. Contexto: ${contextMessage}`;
                    }
                    if (imageBase64 && (lowerText.includes('reembolso') || lowerText.includes('nota') || lowerText.includes('recibo'))) {
                        contextMessage = `[MÓDULO REEMBOLSO ATIVO] Extraia o valor total e o nome do estabelecimento desta nota fiscal: ${contextMessage}`;
                    }

                    const aiResponse = await getAIResponse(contextMessage, remoteJid, imageBase64, imageMimeType);

                    if (aiResponse) {
                        if (aiResponse.includes('Estamos transferindo seu atendimento para nossos atendentes')) {
                            this.setHumanAttendance(remoteJid);
                        }
                        const matchImg = aiResponse.match(/\[GERAR_IMAGEM:\s*(.*?)\s*\]/i);
                        const matchPdf = aiResponse.match(/\[GERAR_PDF:\s*(.*?)\s*\|\s*(.*?)\]/is);

                        // f83: Card de Versículo ou Artes Gerais
                        if (matchImg) {
                            await this.sendGeneratedImageMessage(remoteJid, matchImg[1], aiResponse.replace(matchImg[0], '').trim());
                        } else if (matchPdf) {
                            const title = matchPdf[1].trim();
                            const content = matchPdf[2].trim();
                            const pdfPath = path.join(__dirname, `../../temp_tts/pdf_${Date.now()}.pdf`);
                            const doc = new PDFDocument();
                            doc.pipe(fs.createWriteStream(pdfPath));
                            doc.fontSize(20).text(title, { align: 'center' }).moveDown().fontSize(12).text(content);
                            doc.end();
                            
                            // Bufferiza para não depender do disco por muito tempo
                            await new Promise(r => setTimeout(r, 1500));
                            if (this.sock && fs.existsSync(pdfPath)) {
                                await this.sock.sendMessage(remoteJid, { document: fs.readFileSync(pdfPath), fileName: `${title}.pdf`, mimetype: 'application/pdf' });
                                try { fs.unlinkSync(pdfPath); } catch(_) {}
                            }
                        } else {
                            await this.sendMessage(remoteJid, aiResponse);
                        }
                    }
                    if (this.sock) await this.sock.sendPresenceUpdate('available', remoteJid);
                } catch (e) { console.error("Erro IA:", e); }
                }
            });
        } catch (error) {
            console.error("Erro fatal na inicialização ou conexão do WhatsApp:", error);
        }
    }
    
    // Helper para evitar hangs (travamentos eternos da conexão wa socket)
    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage = 'Tempo limite excedido da conexão (Timeout)'): Promise<T> {
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<T>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        });
        return Promise.race([
            promise.finally(() => clearTimeout(timeoutId)),
            timeoutPromise
        ]);
    }

    async sendMessage(to: string, text: string) {
        if (!this.sock || !this.isConnected) {
            console.error(`❌ Falha ao enviar mensagem para ${to}: Socket desconectado.`);
            throw new Error('Whatsapp não está conectado.');
        }
        try {
            const jid = await this.resolveJid(to);
            // Timeout de 15 segundos em vez de travar o disparo para sempre
            await this.withTimeout(this.sock.sendMessage(jid, { text }), 15000);
            this.lastMessageAt = Date.now();
        } catch (e: any) {
            console.error(`❌ Erro ao enviar mensagem para ${to}:`, e.message);
            if (e.message.includes('Closed') || e.message.includes('Timeout')) {
                this.isConnected = false;
                this.scheduleReconnect(5000);
            }
            throw e; // Lança o erro para o disparo não computar como sucesso
        }
    }

    async sendGeneratedImageMessage(to: string, prompt: string, caption?: string) {
        if (!this.sock) return;
        try {
            const response = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.HF_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: prompt })
            });
            if (!response.ok) throw new Error("Erro HF");
            const buffer = Buffer.from(await response.arrayBuffer());
            let jid = to.includes('@') ? to : (to.length >= 14 ? `${to}@lid` : `${to}@s.whatsapp.net`);
            await this.sock.sendMessage(jid, { image: buffer, caption: caption || '✨ Imagem gerada!' });
        } catch (e) { console.error("Erro imagem gerada:", e); await this.sendMessage(to, "Erro ao gerar imagem."); }
    }

    async sendAudioMessage(to: string, audioPath: string) {
        if (!this.sock) return;
        const jid = to.includes('@') ? to : (to.length >= 14 ? `${to}@lid` : `${to}@s.whatsapp.net`);
        const isMp3 = audioPath.endsWith('.mp3');
        await this.sock.sendMessage(jid, {
            audio: fs.readFileSync(audioPath),
            mimetype: isMp3 ? 'audio/mpeg' : 'audio/ogg; codecs=opus',
            ptt: true
        });
    }

    /**
     * Resolve o JID correto de um número usando sock.onWhatsApp().
     * Isso garante que contas LID (novo padrão WhatsApp) sejam encontradas.
     * Fallback: usa @s.whatsapp.net se a consulta falhar.
     */
    async resolveJid(phone: string): Promise<string> {
        if (phone.includes('@')) return phone; // já é um JID (@s.whatsapp.net ou @g.us)
        
        const clean = phone.replace(/\D/g, '');
        // Adiciona DDI 55 p/ números brasileiros se necessário (10 ou 11 dígitos)
        const normalized = (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11))
            ? '55' + clean : clean;

        // Se o número tiver o formato padrão (DDI + DDD + 8 ou 9 dígitos), já podemos construir o JID.
        // Isso evita o onWhatsApp (rede/CPU) que trava o sistema em broadcasts.
        if (normalized.length >= 10 && normalized.length <= 13) {
            return `${normalized}@s.whatsapp.net`;
        }

        try {
            if (this.sock && normalized.length > 5) { // Evita consulta de números muito curtos
                // Consulta super lenta/pesada: limitamos a 5 segundos para não travar!
                const [result] = await this.withTimeout(this.sock.onWhatsApp(normalized), 5000, 'onWhatsApp timeout');
                if (result?.exists && result.jid) {
                    return result.jid;
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Erro ao resolver JID para ${normalized}: ${e.message}. Usando fallback de comprimento.`);
        }
        
        return normalized.length >= 14 ? `${normalized}@lid` : `${normalized}@s.whatsapp.net`;
    }

    async sendImage(to: string, content: string | Buffer, caption?: string) {
        if (!this.sock || !this.isConnected) {
            throw new Error('Whatsapp não está conectado.');
        }
        const jid = await this.resolveJid(to);
        const imageContent = typeof content === 'string' ? { url: content } : content;
        try {
            await this.withTimeout(this.sock.sendMessage(jid, { image: imageContent, caption }), 25000); // 25s timeout pra imagem
            this.lastMessageAt = Date.now();
        } catch (e: any) {
            console.error(`❌ Erro ao enviar imagem para ${to}:`, e.message);
            if (e.message.includes('Closed') || e.message.includes('Timeout')) {
                this.isConnected = false;
                this.scheduleReconnect(5000);
            }
            throw e;
        }
    }
}

export const waService = new WhatsAppService();

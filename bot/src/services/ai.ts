
import Groq from "groq-sdk";
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.warn('⚠️ Chave da API Groq não encontrada (GROQ_API_KEY). O bot não responderá com IA.');
}

const groq = apiKey ? new Groq({ apiKey: apiKey }) : null;



const SYSTEM_PROMPT = `
Você é o Assistente Virtual Oficial do Matheus Shows. Você é uma IA séria, objetiva e direta.
Sua missão principal é recolher as informações necessárias para um orçamento de show e então transferir o atendimento.

REGRAS ESTritas DE COMPORTAMENTO:
1. SEJA SÉRIO E OBJETIVO. NUNCA, SOB NENHUMA HIPÓTESE, USE EMOJIS.
2. Fale de forma natural, profissional e muito educada (Português do Brasil).
3. Nunca dê valores finais por conta própria. Sua função é APENAS captar os dados.

O QUE VOCÊ DEVE COLETAR:
- A DATA desejada para o evento.
- O LOCAL (cidade/estado ou espaço).
- O TIPO de evento (aniversário, formatura, casamento, show público, etc).

FLUXO DE ATENDIMENTO:
- Converse com o cliente fazendo perguntas diretas até conseguir coletar ESSAS 3 INFORMAÇÕES (Data, Local e Tipo de show).
- ASSIM QUE o cliente tiver fornecido as 3 informações, VOCÊ DEVE PARAR DE CONVERSAR.
- Quando as 3 informações forem coletadas, a sua ÚNICA RESPOSTA deverá ser EXATAMENTE a seguinte frase, sem adicionar mais nenhuma palavra e sem emojis:
Estamos transferindo seu atendimento para nossos atendentes

--- REGRAS AVANÇADAS DE CONVERSAÇÃO ---
4. MEMÓRIA CONTEXTUAL: Preste muita atenção ao histórico da conversa. Não peça informações que o usuário já forneceu.
5. PROATIVIDADE: Conduza a conversa para obter os dados que faltam. Exemplo: "Precisamos saber a data, a cidade e o tipo do evento para prosseguir. Qual a data?"
6. TRANSFERÊNCIA IMEDIATA: Lembre-se, ao ter Data, Local e Tipo do show, responda APENAS "Estamos transferindo seu atendimento para nossos atendentes".
`;

// Memória Contextual (Histórico)
const messageHistory = new Map<string, any[]>();
const MAX_HISTORY = 10;

export async function getAIResponse(userMessage: string, remoteJid: string, imageBase64?: string, imageMimeType?: string): Promise<string> {
    if (!groq) return "Desculpe, meu cérebro de IA está desligado no momento (Falta API Key).";

    try {
        const dynamicPrompt = SYSTEM_PROMPT;

        // Recuperar ou inicializar histórico
        if (!messageHistory.has(remoteJid)) {
            messageHistory.set(remoteJid, []);
        }
        const history = messageHistory.get(remoteJid)!;

        let messages: any[] = [
            { role: "system", content: dynamicPrompt },
            ...history
        ];

        if (imageBase64 && imageMimeType) {
            messages.push({
                role: "user",
                content: [
                    { type: "text", text: userMessage },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:${imageMimeType};base64,${imageBase64}`,
                        },
                    },
                ],
            });
        } else {
            messages.push({ role: "user", content: userMessage });
        }

        let models: string[] = [];
        if (imageBase64) {
            console.log("📸 Processando imagem com IA Vision (Llama 3.2 11B)...");
            models = ["llama-3.2-11b-vision-preview"]; 
        } else {
            models = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile"];
        }

        let lastError: any;
        for (const model of models) {
            try {
                console.log(`🤖 Tentando modelo: ${model}`);
                const chatCompletion = await groq.chat.completions.create({
                    messages,
                    model,
                    temperature: 0.6,
                    max_tokens: 1024,
                });
                const response = chatCompletion.choices[0]?.message?.content;
                if (response) {
                    console.log(`✅ Resposta via ${model}`);
                    
                    // Salvar no histórico (apenas texto)
                    history.push({ role: "user", content: userMessage });
                    history.push({ role: "assistant", content: response });
                    
                    // Limitar tamanho do histórico
                    if (history.length > MAX_HISTORY) {
                        history.splice(0, history.length - MAX_HISTORY);
                    }
                    
                    return response;
                }
            } catch (err: any) {
                lastError = err;
                console.warn(`⚠️ Modelo ${model} falhou: ${err?.message}`);
                if (err?.status === 429 || err?.status === 503) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
            }
        }

        console.error("Erro ao gerar resposta com Groq:", lastError);
        return "Tirei um cochilo aqui (erro na IA). Pode repetir? 🙏";
    } catch (error) {
        console.error("Erro crítico em getAIResponse:", error);
        return "Ops, algo deu errado no meu processamento central. 🙏";
    }
}

export async function transcribeAudio(audioFileStream: any): Promise<string> {
    if (!groq) return "";

    try {
        const transcription = await groq.audio.transcriptions.create({
            file: audioFileStream,
            model: "whisper-large-v3-turbo",
            response_format: "text",
            language: "pt"
        });
        return typeof transcription === "string" ? transcription : (transcription as any).text || "";
    } catch (error) {
        console.error("Erro na transcrição de áudio com Groq:", error);
        return "";
    }
}

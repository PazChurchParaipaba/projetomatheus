import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Credenciais do Supabase não encontradas. Verifique o arquivo .env.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false
    },
    realtime: {
        transport: WebSocket as any
    }
});

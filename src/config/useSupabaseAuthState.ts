import { proto, AuthenticationCreds, AuthenticationState, SignalDataTypeMap, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { supabase } from './supabase';

/**
 * Supabase Auth State for Baileys
 * Based on Baileys useMultiFileAuthState but using Supabase for persistence.
 */
export const useSupabaseAuthState = async (sessionName: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
    // Helper para ler e converter do banco
    const readData = async (id: string) => {
        try {
            const { data, error } = await supabase
                .from('auth_session')
                .select('data')
                .eq('id', `${sessionName}_${id}`)
                .single();

            if (error || !data) return null;
            return JSON.parse(data.data, BufferJSON.reviver);
        } catch (error) {
            return null;
        }
    };

    // Helper para salvar no banco
    const writeData = async (id: string, value: any) => {
        try {
            const strData = JSON.stringify(value, BufferJSON.replacer);
            await supabase
                .from('auth_session')
                .upsert({ id: `${sessionName}_${id}`, data: strData }, { onConflict: 'id' });
        } catch (error) {
            console.error(`Error saving auth state for ${id}:`, error);
        }
    };

    // Helper para deletar do banco
    const removeData = async (id: string) => {
        try {
            await supabase
                .from('auth_session')
                .delete()
                .eq('id', `${sessionName}_${id}`);
        } catch (error) {
            console.error(`Error deleting auth state for ${id}:`, error);
        }
    };

    const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type: string, ids: string[]) => {
                    const data: { [key: string]: any } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data: any) => {
                    const tasks: Promise<void>[] = [];
                    for (const category of Object.keys(data)) {
                        for (const id of Object.keys(data[category])) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(key, value));
                            } else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData('creds', creds)
    };
};

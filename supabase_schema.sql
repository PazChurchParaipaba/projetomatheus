-- Script para inicialização do Banco de Dados no Supabase
-- Cole e execute isso no SQL Editor do seu projeto Supabase

-- 1. Criação da tabela de Shows
CREATE TABLE IF NOT EXISTS public.shows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data TIMESTAMP NOT NULL,
    local TEXT NOT NULL,
    cidade TEXT NOT NULL,
    contratante TEXT,
    valor NUMERIC(10, 2) DEFAULT 0,
    status TEXT DEFAULT 'orcamento',
    obs TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Criação da tabela do Financeiro
CREATE TABLE IF NOT EXISTS public.financeiro (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data DATE NOT NULL,
    descricao TEXT NOT NULL,
    categoria TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    valor NUMERIC(10, 2) DEFAULT 0,
    status TEXT DEFAULT 'pendente',
    show_id UUID REFERENCES public.shows(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Políticas de Segurança (Row Level Security - RLS)
-- Para este painel administrativo, se você for o único usuário, 
-- podemos habilitar o anonimato ou criar políticas restritas.
-- Por enquanto, habilitando RLS e permitindo acesso anonimo apenas para facilitar testes
-- RECOMENDAÇÃO: Em produção, mude para autenticação JWT e restrições corretas.

ALTER TABLE public.shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso total anonimo para shows"
    ON public.shows FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Permitir acesso total anonimo para financeiro"
    ON public.financeiro FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. Função para atualizar "updated_at" se quiser adicionar depois
-- ... 

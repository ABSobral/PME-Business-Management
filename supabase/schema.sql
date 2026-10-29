-- Gestão para pequenos negócios: esquema da base de dados (Supabase / Postgres 15+)
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. Pode ser corrido mais do que uma vez:
-- cria o que falta e atualiza funções, políticas e gatilhos sem apagar dados.
--
-- Depois de correr, em Project Settings > Data API > Exposed schemas, acrescenta "app".
--
-- Segurança (RLS):
--   * só membros ativos da equipa (tabela app.membros) leem e escrevem dados;
--   * só administradores gerem a equipa e as definições do negócio;
--   * a primeira pessoa a entrar, com a tabela de membros vazia, passa a administradora;
--   * visitantes sem conta (anon) só podem chamar app.proposta_publica e app.proposta_responder;
--   * os módulos Email e Banco são para administradores e para os membros com esse acesso (app.membros.acessos);
--     passwords e chaves ficam no Supabase Vault e só as Edge Functions as leem (app.ler_segredo, service_role).

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists app.membros (
  email         text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  nome          text not null check (length(btrim(nome)) between 1 and 120),
  cor           text not null default '#475569' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  telefone      text check (telefone is null or length(telefone) <= 40),
  papel         text not null default 'membro' check (papel in ('admin', 'membro')),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists app.definicoes (
  id                      smallint primary key default 1 check (id = 1),
  nome_negocio            text not null default 'O meu negócio' check (length(btrim(nome_negocio)) between 1 and 120),
  logo_url                text check (logo_url is null or logo_url ~ '^https?://'),
  cor                     text not null default '#334155' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  moeda                   text not null default 'EUR' check (moeda ~ '^[A-Z]{3}$'),
  iva_pct                 numeric(5,2) not null default 23 check (iva_pct between 0 and 100),
  email                   text,
  telefone                text,
  site                    text,
  morada                  text,
  nif                     text,
  estados                 jsonb not null default '[
    {"id": "lead",       "nome": "Novo contacto",    "cor": "cinza",    "tipo": "aberto"},
    {"id": "conversa",   "nome": "Em conversa",      "cor": "azul",     "tipo": "aberto"},
    {"id": "proposta",   "nome": "Proposta enviada", "cor": "ambar",    "tipo": "aberto"},
    {"id": "negociacao", "nome": "Em negociação",    "cor": "violeta",  "tipo": "aberto"},
    {"id": "ganho",      "nome": "Ganho",            "cor": "verde",    "tipo": "ganho"},
    {"id": "perdido",    "nome": "Perdido",          "cor": "vermelho", "tipo": "perdido"}
  ]'::jsonb check (jsonb_typeof(estados) = 'array' and jsonb_array_length(estados) between 2 and 12),
  proposta_intro          text not null default 'Obrigado pelo seu interesse. Junto enviamos a nossa proposta, preparada a partir da nossa conversa. Qualquer dúvida, estamos ao dispor.',
  proposta_condicoes      text not null default 'Valores sem IVA, acrescidos da taxa legal em vigor.
Pagamento de 50% na adjudicação e o restante na entrega.',
  proposta_validade_dias  integer not null default 30 check (proposta_validade_dias between 1 and 365),
  atualizado_em           timestamptz not null default now()
);
insert into app.definicoes (id) values (1) on conflict (id) do nothing;

create table if not exists app.empresas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(btrim(nome)) between 1 and 200),
  tipo          text not null default 'cliente' check (tipo in ('cliente', 'parceiro', 'fornecedor', 'outro')),
  setor         text,
  site          text,
  email         text,
  telefone      text,
  nif           text,
  morada        text,
  notas         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists app.contactos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(btrim(nome)) between 1 and 200),
  empresa_id    uuid references app.empresas(id) on delete set null,
  cargo         text,
  email         text check (email is null or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  telefone      text check (telefone is null or length(telefone) <= 40),
  categoria     text,
  origem        text,
  responsavel   text,
  notas         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contactos_empresa_idx on app.contactos (empresa_id);

create table if not exists app.negocios (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null check (length(btrim(titulo)) between 1 and 200),
  estado           text not null default 'lead' check (estado ~ '^[a-z0-9_]{1,40}$'),
  contacto_id      uuid references app.contactos(id) on delete set null,
  empresa_id       uuid references app.empresas(id) on delete set null,
  valor            numeric(14,2) check (valor is null or valor >= 0),
  data             date,
  origem           text,
  responsavel      text,
  proximo_passo    text,
  proximo_passo_em date,
  motivo_perda     text,
  notas            text,
  ordem            double precision not null default 0,
  arquivado        boolean not null default false,
  estado_desde     timestamptz not null default now(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists negocios_contacto_idx on app.negocios (contacto_id);
create index if not exists negocios_empresa_idx on app.negocios (empresa_id);

create table if not exists app.atividades (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid references app.negocios(id) on delete cascade,
  contacto_id uuid references app.contactos(id) on delete cascade,
  tipo        text not null default 'nota' check (tipo in ('nota', 'chamada', 'email', 'reuniao', 'whatsapp', 'proposta', 'estado')),
  resumo      text not null check (length(btrim(resumo)) between 1 and 4000),
  data        timestamptz not null default now(),
  autor       text
);
create index if not exists atividades_negocio_idx on app.atividades (negocio_id);
create index if not exists atividades_contacto_idx on app.atividades (contacto_id);
create index if not exists atividades_data_idx on app.atividades (data desc);

create table if not exists app.agenda (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (length(btrim(titulo)) between 1 and 200),
  tipo          text not null default 'reuniao' check (tipo in ('reuniao', 'servico', 'seguimento', 'outro')),
  inicio        timestamptz not null,
  fim           timestamptz,
  dia_inteiro   boolean not null default false,
  local         text,
  negocio_id    uuid references app.negocios(id) on delete set null,
  contacto_id   uuid references app.contactos(id) on delete set null,
  responsavel   text,
  notas         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
create index if not exists agenda_inicio_idx on app.agenda (inicio);

create table if not exists app.tarefas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (length(btrim(titulo)) between 1 and 300),
  feito         boolean not null default false,
  feito_em      timestamptz,
  prazo         date,
  hora          time,
  prioridade    smallint not null default 0 check (prioridade between 0 and 3),
  responsavel   text,
  notas         text,
  negocio_id    uuid references app.negocios(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists app.propostas (
  id              uuid primary key default gen_random_uuid(),
  -- 24 caracteres hexadecimais aleatórios: é a "chave" do link público /p/:token
  token           text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 24) check (token ~ '^[0-9a-f]{24}$'),
  numero          integer generated by default as identity unique,
  negocio_id      uuid references app.negocios(id) on delete set null,
  titulo          text not null check (length(btrim(titulo)) between 1 and 200),
  cliente_nome    text,
  cliente_empresa text,
  cliente_email   text,
  introducao      text,
  linhas          jsonb not null default '[]'::jsonb check (jsonb_typeof(linhas) = 'array'),
  desconto        numeric(14,2) not null default 0 check (desconto >= 0),
  iva_pct         numeric(5,2) not null default 23 check (iva_pct between 0 and 100),
  moeda           text not null default 'EUR' check (moeda ~ '^[A-Z]{3}$'),
  condicoes       text,
  validade        date,
  estado          text not null default 'rascunho' check (estado in ('rascunho', 'enviada', 'vista', 'aceite', 'recusada')),
  enviada_em      timestamptz,
  vista_em        timestamptz,
  vistas          integer not null default 0 check (vistas >= 0),
  respondida_em   timestamptz,
  respondida_por  text,
  resposta        text,
  criado_por      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists propostas_negocio_idx on app.propostas (negocio_id);

-- ---------------------------------------------------------------------------
-- Funções de apoio (quem sou eu, sou membro, sou admin)
-- ---------------------------------------------------------------------------

create or replace function app.meu_email() returns text
language sql stable security definer set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function app.e_membro() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from app.membros m where m.email = app.meu_email() and m.ativo) $$;

create or replace function app.e_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from app.membros m where m.email = app.meu_email() and m.ativo and m.papel = 'admin') $$;

-- Chamada pela app logo depois de entrar. Se ainda não há membros, quem entra passa a admin.
-- Devolve {"estado": "admin" | "membro" | "inativo" | "sem_acesso" | "sem_sessao"}.
create or replace function app.entrar_primeira_vez() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := app.meu_email();
  v_meta  jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  v_nome  text;
  m       app.membros;
begin
  if v_email = '' or auth.uid() is null then
    return jsonb_build_object('estado', 'sem_sessao');
  end if;
  -- evita que duas pessoas a entrar ao mesmo tempo fiquem as duas admin
  lock table app.membros in share row exclusive mode;
  select * into m from app.membros where email = v_email;
  if found then
    return jsonb_build_object('estado', case when m.ativo then m.papel else 'inativo' end);
  end if;
  if exists (select 1 from app.membros) then
    return jsonb_build_object('estado', 'sem_acesso');
  end if;
  v_nome := left(coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), nullif(btrim(v_meta ->> 'name'), ''), initcap(split_part(v_email, '@', 1))), 120);
  insert into app.membros (email, nome, papel, ativo) values (v_email, v_nome, 'admin', true);
  return jsonb_build_object('estado', 'admin', 'primeiro', true);
end
$$;

-- O próprio membro muda o seu nome, cor e telefone (sem poder mudar o papel nem o estado ativo)
create or replace function app.atualizar_perfil(p_nome text, p_cor text, p_telefone text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not app.e_membro() then return false; end if;
  update app.membros
     set nome = left(btrim(p_nome), 120),
         cor = coalesce(nullif(p_cor, ''), cor),
         telefone = nullif(btrim(coalesce(p_telefone, '')), '')
   where email = app.meu_email();
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

create or replace function app.tocar() returns trigger
language plpgsql set search_path = ''
as $$ begin new.atualizado_em := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['membros', 'definicoes', 'empresas', 'contactos', 'negocios', 'agenda', 'tarefas', 'propostas'] loop
    execute format('drop trigger if exists tocar on app.%I', t);
    execute format('create trigger tocar before update on app.%I for each row execute function app.tocar()', t);
  end loop;
end $$;

-- quem fez a mudança, para o histórico (as funções públicas marcam "Cliente")
create or replace function app.autor_atual() returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(current_setting('app.autor', true), ''),
                  (select m.nome from app.membros m where m.email = app.meu_email()),
                  'Sistema')
$$;

-- mudar de fase guarda a data e deixa uma linha no histórico do negócio
create or replace function app.negocio_mudou_estado() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    new.estado_desde := now();
    insert into app.atividades (negocio_id, contacto_id, tipo, resumo, autor)
    values (new.id, new.contacto_id, 'estado', old.estado || ' → ' || new.estado, app.autor_atual());
  end if;
  return new;
end
$$;
drop trigger if exists mudou_estado on app.negocios;
create trigger mudou_estado before update of estado on app.negocios
  for each row execute function app.negocio_mudou_estado();

-- nunca ficar sem nenhum administrador ativo
create or replace function app.garantir_admin() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from app.membros) and not exists (select 1 from app.membros where papel = 'admin' and ativo) then
    raise exception 'Tem de ficar pelo menos um administrador ativo.' using errcode = 'check_violation';
  end if;
  return null;
end
$$;
drop trigger if exists garantir_admin on app.membros;
create trigger garantir_admin after update or delete on app.membros
  for each statement execute function app.garantir_admin();

-- ---------------------------------------------------------------------------
-- Propostas públicas (o cliente abre o link sem conta)
-- ---------------------------------------------------------------------------

-- Devolve a proposta pelo token, com o nome, logótipo e cor do negócio. Conta as visitas de quem não é da equipa.
-- Rascunhos só são visíveis para a equipa.
create or replace function app.proposta_publica(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  p       app.propostas;
  d       app.definicoes;
  membro  boolean := app.e_membro();
begin
  if p_token is null or p_token !~ '^[0-9a-f]{24}$' then return null; end if;
  select * into p from app.propostas where token = p_token;
  if not found then return null; end if;
  if p.estado = 'rascunho' and not membro then return null; end if;
  if not membro then
    update app.propostas
       set vistas = vistas + 1,
           vista_em = coalesce(vista_em, now()),
           estado = case when estado = 'enviada' then 'vista' else estado end
     where id = p.id
     returning * into p;
  end if;
  select * into d from app.definicoes where id = 1;
  return (to_jsonb(p) - 'id' - 'negocio_id' - 'criado_por')
      || jsonb_build_object(
           'expirada', p.validade is not null and p.validade < current_date,
           'marca', jsonb_build_object('nome', d.nome_negocio, 'logo_url', d.logo_url, 'cor', d.cor,
                                       'email', d.email, 'telefone', d.telefone, 'site', d.site, 'morada', d.morada, 'nif', d.nif));
end
$$;

-- O cliente aceita (com o nome) ou recusa. Recusa depois da validade ou se já tiver resposta.
-- Ao aceitar, o negócio ligado passa para a primeira fase do tipo "ganho".
-- Devolve {"ok": true} ou {"ok": false, "motivo": "nao_encontrada" | "ja_respondida" | "expirada" | "falta_nome"}.
create or replace function app.proposta_responder(p_token text, p_aceita boolean, p_nome text, p_resposta text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  p        app.propostas;
  n        app.negocios;
  v_nome   text := left(btrim(coalesce(p_nome, '')), 120);
  v_resp   text := nullif(left(btrim(coalesce(p_resposta, '')), 2000), '');
  v_ganho  text;
  v_base   numeric;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{24}$' or p_aceita is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;
  select * into p from app.propostas where token = p_token for update;
  if not found or p.estado = 'rascunho' then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;
  if p.estado in ('aceite', 'recusada') then
    return jsonb_build_object('ok', false, 'motivo', 'ja_respondida');
  end if;
  if p.validade is not null and p.validade < current_date then
    return jsonb_build_object('ok', false, 'motivo', 'expirada');
  end if;
  if p_aceita and v_nome = '' then
    return jsonb_build_object('ok', false, 'motivo', 'falta_nome');
  end if;

  perform set_config('app.autor', 'Cliente', true);
  update app.propostas
     set estado = case when p_aceita then 'aceite' else 'recusada' end,
         respondida_em = now(),
         respondida_por = nullif(v_nome, ''),
         resposta = v_resp
   where id = p.id;

  if p.negocio_id is not null then
    select * into n from app.negocios where id = p.negocio_id for update;
    if found then
      insert into app.atividades (negocio_id, contacto_id, tipo, resumo, autor)
      values (n.id, n.contacto_id, 'proposta',
              format('Proposta nº %s %s%s%s', p.numero, case when p_aceita then 'aceite' else 'recusada' end,
                     case when v_nome <> '' then ' por ' || v_nome else '' end,
                     case when v_resp is not null then ': ' || v_resp else '' end),
              'Cliente');
      if p_aceita then
        select e ->> 'id' into v_ganho
          from app.definicoes d, jsonb_array_elements(d.estados) e
         where d.id = 1 and e ->> 'tipo' = 'ganho'
         limit 1;
        select greatest(0, coalesce(sum((l ->> 'quantidade')::numeric * (l ->> 'preco')::numeric), 0) - p.desconto)
          into v_base from jsonb_array_elements(p.linhas) l;
        update app.negocios
           set estado = coalesce(v_ganho, estado),
               valor = case when v_base > 0 then round(v_base, 2) else valor end,
               motivo_perda = null
         where id = n.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------------
-- Segurança: RLS em todas as tabelas
-- ---------------------------------------------------------------------------

alter table app.membros    enable row level security;
alter table app.definicoes enable row level security;
alter table app.empresas   enable row level security;
alter table app.contactos  enable row level security;
alter table app.negocios   enable row level security;
alter table app.atividades enable row level security;
alter table app.agenda     enable row level security;
alter table app.tarefas    enable row level security;
alter table app.propostas  enable row level security;

-- equipa: todos os membros veem; só admins acrescentam, mudam ou tiram
drop policy if exists membros_ler on app.membros;
create policy membros_ler on app.membros for select to authenticated using (app.e_membro());
drop policy if exists membros_criar on app.membros;
create policy membros_criar on app.membros for insert to authenticated with check (app.e_admin());
drop policy if exists membros_mudar on app.membros;
create policy membros_mudar on app.membros for update to authenticated using (app.e_admin()) with check (app.e_admin());
drop policy if exists membros_apagar on app.membros;
create policy membros_apagar on app.membros for delete to authenticated using (app.e_admin());

-- definições do negócio: todos os membros leem; só admins mudam
drop policy if exists definicoes_ler on app.definicoes;
create policy definicoes_ler on app.definicoes for select to authenticated using (app.e_membro());
drop policy if exists definicoes_mudar on app.definicoes;
create policy definicoes_mudar on app.definicoes for update to authenticated using (app.e_admin()) with check (app.e_admin());

-- dados do dia a dia: qualquer membro ativo lê e escreve
do $$
declare t text;
begin
  foreach t in array array['empresas', 'contactos', 'negocios', 'atividades', 'agenda', 'tarefas', 'propostas'] loop
    execute format('drop policy if exists membros_tudo on app.%I', t);
    execute format('create policy membros_tudo on app.%I for all to authenticated using (app.e_membro()) with check (app.e_membro())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Módulos opcionais: Email (IMAP e SMTP) e Banco (Enable Banking e extratos)
-- ---------------------------------------------------------------------------
-- Cada módulo liga-se e desliga-se em Definições (app.definicoes.modulo_email / modulo_banco).
-- Os administradores usam tudo; os membros só os módulos que estão em app.membros.acessos.
-- As passwords e chaves ficam no Supabase Vault: o browser só pode guardá-las (administradores)
-- e perguntar se existem; quem as lê são as Edge Functions, com a chave service_role.

alter table app.membros add column if not exists acessos text[] not null default '{}';
alter table app.membros drop constraint if exists membros_acessos_check;
alter table app.membros add constraint membros_acessos_check check (acessos <@ array['email', 'banco']::text[]);

alter table app.definicoes add column if not exists modulo_email boolean not null default false;
alter table app.definicoes add column if not exists modulo_banco boolean not null default false;
-- servidores, portas, utilizador e nome do remetente (sem a password, que vai para o Vault)
alter table app.definicoes add column if not exists email_config jsonb not null default '{}'::jsonb;
-- ID da aplicação no Enable Banking, país e endereço de regresso (a chave privada vai para o Vault)
alter table app.definicoes add column if not exists banco_config jsonb not null default '{}'::jsonb;
alter table app.definicoes add column if not exists banco_categorias jsonb not null default '["Vendas", "Sinal de cliente", "Fornecedores", "Material", "Salários", "Impostos e Segurança Social", "Renda", "Comunicações", "Transportes", "Publicidade", "Comissões bancárias", "Transferência entre contas", "Outros"]'::jsonb;
alter table app.definicoes drop constraint if exists definicoes_modulos_check;
alter table app.definicoes add constraint definicoes_modulos_check check (
  jsonb_typeof(email_config) = 'object' and jsonb_typeof(banco_config) = 'object'
  and jsonb_typeof(banco_categorias) = 'array' and jsonb_array_length(banco_categorias) <= 60);

-- pastas da caixa de correio, com o último UID lido (sincronização incremental)
create table if not exists app.email_pastas (
  caminho         text primary key check (length(caminho) between 1 and 300),
  nome            text not null,
  especial        text check (especial is null or especial in ('entrada', 'enviados', 'lixo', 'rascunhos', 'spam', 'arquivo')),
  separador       text,
  uidvalidity     bigint,
  ultimo_uid      bigint not null default 0,
  total           integer not null default 0,
  nao_lidos       integer not null default 0,
  sincronizada_em timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists app.emails (
  id            uuid primary key default gen_random_uuid(),
  pasta         text not null,
  uid           bigint not null,
  uidvalidity   bigint,
  message_id    text,
  in_reply_to   text,
  referencias   text,
  de_nome       text,
  de_email      text,
  para          jsonb not null default '[]'::jsonb check (jsonb_typeof(para) = 'array'),
  cc            jsonb not null default '[]'::jsonb check (jsonb_typeof(cc) = 'array'),
  assunto       text not null default '',
  data          timestamptz not null default now(),
  lido          boolean not null default false,
  respondido    boolean not null default false,
  -- [{"parte": "2", "nome": "fatura.pdf", "tipo": "application/pdf", "tamanho": 12345}]
  anexos        jsonb not null default '[]'::jsonb check (jsonb_typeof(anexos) = 'array'),
  resumo        text,
  -- texto e HTML completos, guardados na primeira vez que o email é aberto
  texto         text,
  html          text,
  corpo_em      timestamptz,
  contacto_id   uuid references app.contactos(id) on delete set null,
  criado_em     timestamptz not null default now(),
  unique (pasta, uid)
);
create index if not exists emails_data_idx on app.emails (pasta, data desc);
create index if not exists emails_message_id_idx on app.emails (message_id);
create index if not exists emails_contacto_idx on app.emails (contacto_id);

create table if not exists app.banco_ligacoes (
  id            uuid primary key default gen_random_uuid(),
  banco         text not null,
  pais          text not null default 'PT' check (pais ~ '^[A-Z]{2}$'),
  psu_type      text not null default 'business' check (psu_type in ('business', 'personal')),
  estado        text not null default 'pendente' check (estado in ('pendente', 'escolher', 'ativa', 'expirada')),
  session_id    text,
  conta_uid     text,
  iban          text,
  nome_conta    text,
  moeda         text,
  valido_ate    timestamptz,
  saldo_atual   numeric(14,2),
  saldo_em      timestamptz,
  ultima_sinc   timestamptz,
  ultimo_erro   text,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists app.movimentos (
  id            uuid primary key default gen_random_uuid(),
  ligacao_id    uuid references app.banco_ligacoes(id) on delete set null,
  data          date not null,
  valor         numeric(14,2) not null,
  descritivo    text not null default '' check (length(descritivo) <= 500),
  contraparte   text,
  saldo         numeric(14,2),
  origem        text not null default 'extrato' check (origem in ('enablebanking', 'extrato', 'manual')),
  -- impressão digital do movimento: o mesmo movimento nunca entra duas vezes
  hash          text not null unique check (hash ~ '^[0-9a-f]{16,64}$'),
  categoria     text check (categoria is null or length(categoria) <= 80),
  negocio_id    uuid references app.negocios(id) on delete set null,
  notas         text check (notas is null or length(notas) <= 4000),
  revisto       boolean not null default false,
  revisto_por   text,
  revisto_em    timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists movimentos_data_idx on app.movimentos (data desc);
create index if not exists movimentos_negocio_idx on app.movimentos (negocio_id);

do $$
declare t text;
begin
  foreach t in array array['email_pastas', 'banco_ligacoes', 'movimentos'] loop
    execute format('drop trigger if exists tocar on app.%I', t);
    execute format('create trigger tocar before update on app.%I for each row execute function app.tocar()', t);
  end loop;
end $$;

-- o membro ativo pode usar o módulo? (administradores sempre; membros se o tiverem em "acessos")
create or replace function app.pode(p_modulo text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from app.membros m
                  where m.email = app.meu_email() and m.ativo
                    and (m.papel = 'admin' or p_modulo = any (m.acessos)))
$$;

-- nomes de segredos que a app pode guardar (nada mais entra no Vault por aqui)
create or replace function app.segredo_permitido(p_nome text) returns boolean
language sql immutable set search_path = ''
as $$ select p_nome in ('email_password', 'enablebanking_key') $$;

-- Guarda (ou substitui) um segredo no Vault. Só administradores e só nomes da lista.
-- Nunca devolve o valor. No Vault fica com o nome "app.<nome>".
create or replace function app.guardar_segredo(p_nome text, p_valor text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.e_admin() then
    raise exception 'Só os administradores guardam passwords e chaves.' using errcode = 'insufficient_privilege';
  end if;
  if not app.segredo_permitido(p_nome) then
    raise exception 'Nome de segredo não permitido.' using errcode = 'check_violation';
  end if;
  if p_valor is null or length(btrim(p_valor)) = 0 or length(p_valor) > 20000 then
    raise exception 'Valor vazio ou demasiado grande.' using errcode = 'check_violation';
  end if;
  select s.id into v_id from vault.secrets s where s.name = 'app.' || p_nome;
  if v_id is null then
    perform vault.create_secret(p_valor, 'app.' || p_nome, 'Gestão: ' || p_nome);
  else
    perform vault.update_secret(v_id, p_valor);
  end if;
  return true;
end
$$;

-- Apaga um segredo (desligar o email ou o banco). Só administradores.
create or replace function app.apagar_segredo(p_nome text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not app.e_admin() then
    raise exception 'Só os administradores apagam passwords e chaves.' using errcode = 'insufficient_privilege';
  end if;
  if not app.segredo_permitido(p_nome) then
    raise exception 'Nome de segredo não permitido.' using errcode = 'check_violation';
  end if;
  delete from vault.secrets where name = 'app.' || p_nome;
  return true;
end
$$;

-- Diz só se o segredo existe (para a app mostrar "guardada"). Qualquer membro ativo.
create or replace function app.segredo_existe(p_nome text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app.e_membro() or not app.segredo_permitido(p_nome) then return false; end if;
  return exists (select 1 from vault.secrets where name = 'app.' || p_nome);
end
$$;

-- Lê o segredo em claro. Só para as Edge Functions (service_role); nunca é dada ao browser.
create or replace function app.ler_segredo(p_nome text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v text;
begin
  if not app.segredo_permitido(p_nome) then return null; end if;
  select d.decrypted_secret into v from vault.decrypted_secrets d where d.name = 'app.' || p_nome;
  return v;
end
$$;

alter table app.email_pastas   enable row level security;
alter table app.emails         enable row level security;
alter table app.banco_ligacoes enable row level security;
alter table app.movimentos     enable row level security;

-- email: quem tem acesso lê; as mudanças passam pela Edge Function (para ficarem também no servidor de correio)
drop policy if exists email_ler on app.email_pastas;
create policy email_ler on app.email_pastas for select to authenticated using (app.pode('email'));
drop policy if exists email_ler on app.emails;
create policy email_ler on app.emails for select to authenticated using (app.pode('email'));

-- banco: quem tem acesso lê as ligações (criadas e mudadas só pela Edge Function) e trabalha nos movimentos;
-- apagar movimentos é só para administradores
drop policy if exists banco_ler on app.banco_ligacoes;
create policy banco_ler on app.banco_ligacoes for select to authenticated using (app.pode('banco'));
drop policy if exists banco_ler on app.movimentos;
create policy banco_ler on app.movimentos for select to authenticated using (app.pode('banco'));
drop policy if exists banco_criar on app.movimentos;
create policy banco_criar on app.movimentos for insert to authenticated with check (app.pode('banco') and origem <> 'enablebanking');
drop policy if exists banco_mudar on app.movimentos;
create policy banco_mudar on app.movimentos for update to authenticated using (app.pode('banco')) with check (app.pode('banco'));
drop policy if exists banco_apagar on app.movimentos;
create policy banco_apagar on app.movimentos for delete to authenticated using (app.e_admin());

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

grant usage on schema app to anon, authenticated, service_role;

revoke all on all tables in schema app from anon, public;
grant select, insert, update, delete on all tables in schema app to authenticated;
revoke insert, delete on app.definicoes from authenticated;
-- email e ligações ao banco: o browser só lê (escreve a Edge Function, com service_role)
revoke insert, update, delete on app.emails, app.email_pastas, app.banco_ligacoes from authenticated;
-- movimentos: o browser importa extratos e classifica; data, valor e descritivo não se mudam depois
revoke update on app.movimentos from authenticated;
grant update (categoria, negocio_id, notas, revisto, revisto_por, revisto_em) on app.movimentos to authenticated;
grant all on all tables in schema app to service_role;
grant usage, select on all sequences in schema app to authenticated, service_role;

revoke execute on all functions in schema app from public, anon;
grant execute on function app.meu_email(), app.e_membro(), app.e_admin(), app.entrar_primeira_vez(),
  app.atualizar_perfil(text, text, text), app.pode(text), app.guardar_segredo(text, text),
  app.apagar_segredo(text), app.segredo_existe(text) to authenticated;
-- app.ler_segredo e app.segredo_permitido ficam só para service_role (as Edge Functions)
revoke execute on function app.ler_segredo(text) from authenticated;
grant execute on function app.proposta_publica(text), app.proposta_responder(text, boolean, text, text) to anon, authenticated;
grant execute on all functions in schema app to service_role;

-- Testes de segurança do schema.sql (correr num Postgres de teste com stub_auth.sql e schema.sql já aplicados).
-- Cada bloco falha com "FALHOU" se alguma regra não se cumprir.
\set ON_ERROR_STOP 1
\set QUIET 1

-- 0. sem ninguém: anon não lê tabelas nem chama funções internas
begin;
set local role anon;
do $$ begin
  perform 1 from app.negocios; raise exception 'FALHOU: anon leu negocios';
exception when insufficient_privilege then raise notice 'ok 0.1 anon sem acesso às tabelas'; end $$;
do $$ begin
  perform app.entrar_primeira_vez(); raise exception 'FALHOU: anon chamou entrar_primeira_vez';
exception when insufficient_privilege then raise notice 'ok 0.2 anon não chama entrar_primeira_vez'; end $$;
commit;

-- 1. primeira pessoa a entrar passa a admin
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"Ana@Exemplo.pt","role":"authenticated","user_metadata":{"full_name":"Ana Silva"}}', true) \g /dev/null
do $$ declare r jsonb := app.entrar_primeira_vez(); begin
  if r ->> 'estado' <> 'admin' or (r ->> 'primeiro')::boolean is not true then raise exception 'FALHOU 1.1: %', r; end if;
  raise notice 'ok 1.1 primeira pessoa ficou admin: %', r;
end $$;
do $$ declare r jsonb := app.entrar_primeira_vez(); begin
  if r ->> 'estado' <> 'admin' or r ? 'primeiro' then raise exception 'FALHOU 1.2: %', r; end if;
  if (select nome from app.membros where email = 'ana@exemplo.pt') <> 'Ana Silva' then raise exception 'FALHOU 1.2 nome'; end if;
  raise notice 'ok 1.2 entrar outra vez não muda nada e o email ficou em minúsculas';
end $$;
commit;

-- 2. segunda pessoa, fora da equipa: não vê nem escreve nada
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"bruno@exemplo.pt","role":"authenticated"}', true) \g /dev/null
do $$ declare r jsonb := app.entrar_primeira_vez(); n int; begin
  if r ->> 'estado' <> 'sem_acesso' then raise exception 'FALHOU 2.1: %', r; end if;
  select count(*) into n from app.membros; if n <> 0 then raise exception 'FALHOU 2.2 viu % membros', n; end if;
  select count(*) into n from app.definicoes; if n <> 0 then raise exception 'FALHOU 2.3 viu definicoes'; end if;
  update app.definicoes set nome_negocio = 'Pirata'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU 2.4 mudou definicoes'; end if;
  raise notice 'ok 2.1 a 2.4 quem não é membro não vê membros nem definições';
end $$;
do $$ begin
  insert into app.negocios (titulo) values ('intruso'); raise exception 'FALHOU 2.5 inseriu negocio';
exception when insufficient_privilege then raise notice 'ok 2.5 quem não é membro não cria negócios (RLS)'; end $$;
do $$ begin
  insert into app.membros (email, nome, papel) values ('bruno@exemplo.pt', 'Bruno', 'admin'); raise exception 'FALHOU 2.6 fez-se membro';
exception when insufficient_privilege then raise notice 'ok 2.6 não se acrescenta a si próprio à equipa'; end $$;
commit;

-- 3. a admin prepara a equipa e os dados
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"ana@exemplo.pt","role":"authenticated"}', true) \g /dev/null
insert into app.membros (email, nome, papel) values ('bruno@exemplo.pt', 'Bruno Costa', 'membro');
insert into app.membros (email, nome, papel, ativo) values ('carla@exemplo.pt', 'Carla Dias', 'membro', false);
update app.definicoes set nome_negocio = 'Estúdio Exemplo', cor = '#0f766e' where id = 1;
insert into app.empresas (id, nome) values ('10000000-0000-0000-0000-000000000001', 'Cliente Lda');
insert into app.contactos (id, nome, empresa_id, email) values ('20000000-0000-0000-0000-000000000001', 'Rui Lopes', '10000000-0000-0000-0000-000000000001', 'rui@cliente.pt');
insert into app.negocios (id, titulo, contacto_id, empresa_id, estado) values ('30000000-0000-0000-0000-000000000001', 'Site novo', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'proposta');
insert into app.propostas (id, token, negocio_id, titulo, linhas, desconto, iva_pct, estado, validade)
values ('40000000-0000-0000-0000-000000000001', 'aaaaaaaaaaaaaaaaaaaaaaa1', '30000000-0000-0000-0000-000000000001', 'Site novo',
        '[{"descricao":"Design","quantidade":1,"preco":650.5},{"descricao":"Horas extra","quantidade":2,"preco":40}]', 30.5, 23, 'enviada', current_date + 10),
       ('40000000-0000-0000-0000-000000000002', 'bbbbbbbbbbbbbbbbbbbbbbb2', null, 'Proposta antiga', '[]', 0, 23, 'enviada', current_date - 1),
       ('40000000-0000-0000-0000-000000000003', 'ccccccccccccccccccccccc3', null, 'Rascunho', '[]', 0, 23, 'rascunho', null),
       ('40000000-0000-0000-0000-000000000004', 'ddddddddddddddddddddddd4', null, 'Para recusar', '[]', 0, 23, 'enviada', current_date);
do $$ declare t text; begin
  insert into app.propostas (titulo) values ('Token automático') returning token into t;
  if t !~ '^[0-9a-f]{24}$' then raise exception 'FALHOU 3.1 token %', t; end if;
  raise notice 'ok 3.1 token aleatório com 24 hex: %', t;
end $$;
do $$ begin
  update app.membros set papel = 'membro' where email = 'ana@exemplo.pt'; raise exception 'FALHOU 3.2 ficou sem admin';
exception when check_violation then raise notice 'ok 3.2 a última admin não se pode despromover'; end $$;
do $$ begin
  insert into app.contactos (nome, email) values ('Mau', 'nao-e-email'); raise exception 'FALHOU 3.3 email inválido aceite';
exception when check_violation then raise notice 'ok 3.3 email inválido recusado pela base de dados'; end $$;
commit;

-- 4. membro ativo: trabalha nos dados, mas não mexe na equipa nem nas definições
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"bruno@exemplo.pt","role":"authenticated"}', true) \g /dev/null
do $$ declare r jsonb := app.entrar_primeira_vez(); n int; begin
  if r ->> 'estado' <> 'membro' then raise exception 'FALHOU 4.1: %', r; end if;
  select count(*) into n from app.negocios; if n <> 1 then raise exception 'FALHOU 4.2 viu % negocios', n; end if;
  select count(*) into n from app.membros; if n <> 3 then raise exception 'FALHOU 4.3 viu % membros', n; end if;
  insert into app.tarefas (titulo, prazo) values ('Ligar ao Rui', current_date);
  update app.definicoes set nome_negocio = 'Pirata'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU 4.4 membro mudou definicoes'; end if;
  update app.membros set papel = 'admin' where email = 'bruno@exemplo.pt'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU 4.5 membro promoveu-se'; end if;
  if not app.atualizar_perfil('Bruno C.', '#123456', '912345678') then raise exception 'FALHOU 4.6'; end if;
  if (select papel || nome from app.membros where email = 'bruno@exemplo.pt') <> 'membroBruno C.' then raise exception 'FALHOU 4.6 perfil'; end if;
  update app.negocios set estado = 'negociacao' where id = '30000000-0000-0000-0000-000000000001';
  if not exists (select 1 from app.atividades where tipo = 'estado' and resumo = 'proposta → negociacao' and autor = 'Bruno C.') then raise exception 'FALHOU 4.7 histórico'; end if;
  raise notice 'ok 4.1 a 4.7 membro lê e escreve dados, muda o seu perfil, não muda equipa nem definições; mudança de fase fica no histórico';
end $$;
do $$ begin
  insert into app.membros (email, nome) values ('x@exemplo.pt', 'X'); raise exception 'FALHOU 4.8';
exception when insufficient_privilege then raise notice 'ok 4.8 membro não acrescenta pessoas à equipa'; end $$;
do $$ begin
  insert into app.definicoes (id) values (1); raise exception 'FALHOU 4.9';
exception when insufficient_privilege then raise notice 'ok 4.9 ninguém cria outra linha de definições'; end $$;
commit;

-- 5. membro inativo: não vê nada
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"carla@exemplo.pt","role":"authenticated"}', true) \g /dev/null
do $$ declare r jsonb := app.entrar_primeira_vez(); n int; begin
  if r ->> 'estado' <> 'inativo' then raise exception 'FALHOU 5.1: %', r; end if;
  select count(*) into n from app.negocios; if n <> 0 then raise exception 'FALHOU 5.2'; end if;
  select count(*) into n from app.propostas; if n <> 0 then raise exception 'FALHOU 5.3'; end if;
  if app.atualizar_perfil('Carla', null, null) then raise exception 'FALHOU 5.4'; end if;
  raise notice 'ok 5.1 a 5.4 membro inativo não vê nada';
end $$;
do $$ begin
  insert into app.tarefas (titulo) values ('não devia'); raise exception 'FALHOU 5.5';
exception when insufficient_privilege then raise notice 'ok 5.5 membro inativo não escreve'; end $$;
commit;

-- 6. visitante sem conta (anon) com o link da proposta
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) \g /dev/null
do $$ declare r jsonb; begin
  r := app.proposta_publica('aaaaaaaaaaaaaaaaaaaaaaa1');
  if r is null or r -> 'marca' ->> 'nome' <> 'Estúdio Exemplo' or (r ->> 'vistas')::int <> 1 or r ->> 'estado' <> 'vista' or (r ->> 'expirada')::boolean then raise exception 'FALHOU 6.1: %', r; end if;
  if r ? 'id' or r ? 'criado_por' or r ? 'negocio_id' then raise exception 'FALHOU 6.2 campos internos: %', r; end if;
  r := app.proposta_publica('aaaaaaaaaaaaaaaaaaaaaaa1');
  if (r ->> 'vistas')::int <> 2 then raise exception 'FALHOU 6.3'; end if;
  if app.proposta_publica('ccccccccccccccccccccccc3') is not null then raise exception 'FALHOU 6.4 rascunho visível'; end if;
  if app.proposta_publica('nao-e-token') is not null or app.proposta_publica('eeeeeeeeeeeeeeeeeeeeeee9') is not null then raise exception 'FALHOU 6.5'; end if;
  r := app.proposta_publica('bbbbbbbbbbbbbbbbbbbbbbb2');
  if not (r ->> 'expirada')::boolean then raise exception 'FALHOU 6.6 %', r; end if;
  raise notice 'ok 6.1 a 6.6 anon vê a proposta pelo token, conta visitas, não vê rascunhos nem campos internos';

  r := app.proposta_responder('bbbbbbbbbbbbbbbbbbbbbbb2', true, 'Rui', null);
  if r ->> 'motivo' <> 'expirada' then raise exception 'FALHOU 6.7 %', r; end if;
  r := app.proposta_responder('aaaaaaaaaaaaaaaaaaaaaaa1', true, '   ', null);
  if r ->> 'motivo' <> 'falta_nome' then raise exception 'FALHOU 6.8 %', r; end if;
  r := app.proposta_responder('ccccccccccccccccccccccc3', true, 'Rui', null);
  if r ->> 'motivo' <> 'nao_encontrada' then raise exception 'FALHOU 6.9 %', r; end if;
  r := app.proposta_responder('aaaaaaaaaaaaaaaaaaaaaaa1', true, 'Rui Lopes', 'Avancem!');
  if not (r ->> 'ok')::boolean then raise exception 'FALHOU 6.10 %', r; end if;
  r := app.proposta_responder('aaaaaaaaaaaaaaaaaaaaaaa1', false, 'Rui Lopes', null);
  if r ->> 'motivo' <> 'ja_respondida' then raise exception 'FALHOU 6.11 %', r; end if;
  r := app.proposta_responder('ddddddddddddddddddddddd4', false, '', 'Fica para o ano');
  if not (r ->> 'ok')::boolean then raise exception 'FALHOU 6.12 %', r; end if;
  raise notice 'ok 6.7 a 6.12 validade, nome obrigatório, rascunho, resposta única, recusa e aceitação';
end $$;
do $$ begin
  perform 1 from app.propostas; raise exception 'FALHOU 6.13';
exception when insufficient_privilege then raise notice 'ok 6.13 anon continua sem ler a tabela de propostas'; end $$;
do $$ begin
  perform app.e_membro(); raise exception 'FALHOU 6.14';
exception when insufficient_privilege then raise notice 'ok 6.14 anon só chama as duas funções públicas'; end $$;
commit;

-- 7. efeitos da aceitação, vistos pela admin; a admin a abrir o link não conta como visita
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"ana@exemplo.pt","role":"authenticated"}', true) \g /dev/null
do $$ declare n app.negocios; p app.propostas; r jsonb; begin
  select * into n from app.negocios where id = '30000000-0000-0000-0000-000000000001';
  if n.estado <> 'ganho' or n.valor <> 700.00 then raise exception 'FALHOU 7.1 estado % valor %', n.estado, n.valor; end if;
  select * into p from app.propostas where id = '40000000-0000-0000-0000-000000000001';
  if p.estado <> 'aceite' or p.respondida_por <> 'Rui Lopes' or p.resposta <> 'Avancem!' then raise exception 'FALHOU 7.2'; end if;
  if not exists (select 1 from app.atividades where negocio_id = n.id and tipo = 'proposta' and autor = 'Cliente') then raise exception 'FALHOU 7.3'; end if;
  if not exists (select 1 from app.atividades where negocio_id = n.id and tipo = 'estado' and resumo = 'negociacao → ganho' and autor = 'Cliente') then raise exception 'FALHOU 7.4'; end if;
  if (select estado from app.propostas where id = '40000000-0000-0000-0000-000000000004') <> 'recusada' then raise exception 'FALHOU 7.5'; end if;
  r := app.proposta_publica('aaaaaaaaaaaaaaaaaaaaaaa1');
  if (r ->> 'vistas')::int <> 2 then raise exception 'FALHOU 7.6 visita da equipa contou'; end if;
  if app.proposta_publica('ccccccccccccccccccccccc3') is null then raise exception 'FALHOU 7.7 equipa não vê o rascunho'; end if;
  raise notice 'ok 7.1 a 7.7 aceitar passa o negócio a ganho com o valor sem IVA (700), regista no histórico; a equipa vê rascunhos e não conta visitas';
end $$;
commit;

-- 8. módulos Email e Banco: segredos no Vault e acessos por membro
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"ana@exemplo.pt","role":"authenticated"}', true) \g /dev/null
do $$ begin
  if not app.guardar_segredo('email_password', 'password-da-app-1') then raise exception 'FALHOU 8.1'; end if;
  if not app.guardar_segredo('email_password', 'password-da-app-2') then raise exception 'FALHOU 8.2'; end if;
  if not app.segredo_existe('email_password') or app.segredo_existe('enablebanking_key') then raise exception 'FALHOU 8.3'; end if;
  raise notice 'ok 8.1 a 8.3 a admin guarda e substitui a password; segredo_existe só diz sim ou não';
end $$;
do $$ begin
  perform app.guardar_segredo('service_role_key', 'x'); raise exception 'FALHOU 8.4';
exception when check_violation then raise notice 'ok 8.4 nomes fora da lista recusados'; end $$;
do $$ begin
  perform app.ler_segredo('email_password'); raise exception 'FALHOU 8.5 admin leu o segredo';
exception when insufficient_privilege then raise notice 'ok 8.5 nem a admin lê o segredo pelo browser'; end $$;
do $$ begin
  perform 1 from vault.decrypted_secrets; raise exception 'FALHOU 8.6';
exception when insufficient_privilege then raise notice 'ok 8.6 o Vault não se lê diretamente'; end $$;
do $$ declare n int; begin
  update app.definicoes set modulo_email = true, modulo_banco = true, email_config = '{"imap_host":"imap.exemplo.pt"}' where id = 1;
  update app.membros set acessos = array['email'] where email = 'bruno@exemplo.pt';
  insert into app.banco_ligacoes (banco) values ('Banco Pirata'); raise exception 'FALHOU 8.7 browser criou ligação';
exception when insufficient_privilege then raise notice 'ok 8.7 ligações ao banco só pela Edge Function'; end $$;
do $$ begin
  update app.membros set acessos = array['tudo'] where email = 'bruno@exemplo.pt'; raise exception 'FALHOU 8.8';
exception when check_violation then raise notice 'ok 8.8 acessos só "email" e "banco"'; end $$;
update app.definicoes set modulo_email = true, modulo_banco = true where id = 1;
update app.membros set acessos = array['email'] where email = 'bruno@exemplo.pt';
insert into app.movimentos (data, valor, descritivo, hash) values (current_date, -12.5, 'Papelaria', 'aaaaaaaaaaaaaaaa1111'), (current_date, 1234.56, 'Transferência de cliente', 'aaaaaaaaaaaaaaaa2222');
insert into app.movimentos (data, valor, descritivo, hash) values (current_date, -12.5, 'Papelaria', 'aaaaaaaaaaaaaaaa1111') on conflict (hash) do nothing;
do $$ declare n int; begin
  select count(*) into n from app.movimentos; if n <> 2 then raise exception 'FALHOU 8.9 % movimentos', n; end if;
  if not app.pode('banco') or not app.pode('email') then raise exception 'FALHOU 8.10'; end if;
  raise notice 'ok 8.9 e 8.10 importar não repete movimentos (hash único); a admin pode tudo';
end $$;
do $$ begin
  insert into app.movimentos (data, valor, hash, origem) values (current_date, 1, 'bbbbbbbbbbbbbbbb0000', 'enablebanking'); raise exception 'FALHOU 8.11';
exception when insufficient_privilege then raise notice 'ok 8.11 o browser não finge movimentos do banco'; end $$;
commit;

-- service_role (Edge Function) lê o segredo e escreve emails e ligações
begin;
set local role service_role;
do $$ begin
  if app.ler_segredo('email_password') <> 'password-da-app-2' then raise exception 'FALHOU 8.12'; end if;
  insert into app.email_pastas (caminho, nome, especial) values ('INBOX', 'Entrada', 'entrada');
  insert into app.emails (pasta, uid, assunto, de_email) values ('INBOX', 1, 'Olá', 'rui@cliente.pt');
  insert into app.banco_ligacoes (banco, estado) values ('Banco Teste', 'ativa');
  raise notice 'ok 8.12 a Edge Function (service_role) lê o segredo e escreve';
end $$;
commit;

-- membro com acesso ao email mas não ao banco
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"bruno@exemplo.pt","role":"authenticated"}', true) \g /dev/null
do $$ declare n int; begin
  select count(*) into n from app.emails; if n <> 1 then raise exception 'FALHOU 8.13 viu % emails', n; end if;
  select count(*) into n from app.movimentos; if n <> 0 then raise exception 'FALHOU 8.14 viu % movimentos', n; end if;
  select count(*) into n from app.banco_ligacoes; if n <> 0 then raise exception 'FALHOU 8.15'; end if;
  update app.movimentos set categoria = 'Outros'; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHOU 8.16'; end if;
  if not app.segredo_existe('email_password') then raise exception 'FALHOU 8.17'; end if;
  if app.pode('banco') or not app.pode('email') then raise exception 'FALHOU 8.18'; end if;
  raise notice 'ok 8.13 a 8.18 membro sem acesso "banco" não vê movimentos nem ligações; vê os emails';
end $$;
do $$ begin
  perform app.guardar_segredo('email_password', 'roubada'); raise exception 'FALHOU 8.19';
exception when insufficient_privilege then raise notice 'ok 8.19 membro não guarda segredos'; end $$;
do $$ begin
  perform app.apagar_segredo('email_password'); raise exception 'FALHOU 8.20';
exception when insufficient_privilege then raise notice 'ok 8.20 membro não apaga segredos'; end $$;
do $$ begin
  update app.emails set lido = true; raise exception 'FALHOU 8.21';
exception when insufficient_privilege then raise notice 'ok 8.21 emails só mudam pela Edge Function'; end $$;
do $$ begin
  insert into app.movimentos (data, valor, hash) values (current_date, 5, 'cccccccccccccccc0000'); raise exception 'FALHOU 8.22';
exception when insufficient_privilege then raise notice 'ok 8.22 membro sem acesso não importa movimentos'; end $$;
commit;

-- a admin dá acesso ao banco: o membro classifica, mas não muda o valor nem apaga
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"ana@exemplo.pt","role":"authenticated"}', true) \g /dev/null
update app.membros set acessos = array['email', 'banco'] where email = 'bruno@exemplo.pt';
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"bruno@exemplo.pt","role":"authenticated"}', true) \g /dev/null
do $$ declare n int; begin
  select count(*) into n from app.movimentos; if n <> 2 then raise exception 'FALHOU 8.23 viu %', n; end if;
  update app.movimentos set categoria = 'Material', notas = 'Canetas', revisto = true where hash = 'aaaaaaaaaaaaaaaa1111'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU 8.24'; end if;
  delete from app.movimentos; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHOU 8.25 apagou'; end if;
  raise notice 'ok 8.23 a 8.25 com acesso "banco" vê e classifica; apagar só administradores';
end $$;
do $$ begin
  update app.movimentos set valor = 999 where hash = 'aaaaaaaaaaaaaaaa1111'; raise exception 'FALHOU 8.26';
exception when insufficient_privilege then raise notice 'ok 8.26 o valor do movimento não se muda'; end $$;
commit;

-- membro inativo e anon: nada
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"carla@exemplo.pt","role":"authenticated"}', true) \g /dev/null
do $$ declare n int; begin
  select count(*) into n from app.emails; if n <> 0 then raise exception 'FALHOU 8.27'; end if;
  select count(*) into n from app.movimentos; if n <> 0 then raise exception 'FALHOU 8.28'; end if;
  if app.segredo_existe('email_password') then raise exception 'FALHOU 8.29'; end if;
  raise notice 'ok 8.27 a 8.29 membro inativo não vê emails, movimentos nem se há segredos';
end $$;
commit;
begin;
set local role anon;
do $$ begin
  perform 1 from app.movimentos; raise exception 'FALHOU 8.30';
exception when insufficient_privilege then raise notice 'ok 8.30 anon não lê movimentos'; end $$;
do $$ begin
  perform 1 from app.emails; raise exception 'FALHOU 8.31';
exception when insufficient_privilege then raise notice 'ok 8.31 anon não lê emails'; end $$;
do $$ begin
  perform app.segredo_existe('email_password'); raise exception 'FALHOU 8.32';
exception when insufficient_privilege then raise notice 'ok 8.32 anon não chama funções de segredos'; end $$;
do $$ begin
  perform app.ler_segredo('email_password'); raise exception 'FALHOU 8.33';
exception when insufficient_privilege then raise notice 'ok 8.33 anon não lê segredos'; end $$;
commit;

\echo 'TODOS OS TESTES PASSARAM'

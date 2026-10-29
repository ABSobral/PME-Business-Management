# Gestão para pequenos negócios

Uma app simples para gerir clientes, negócios, agenda e propostas de um pequeno negócio: serviços, eventos, agências, lojas, ateliers. Feita para o telemóvel e para o computador, em português de Portugal, com os dados guardados no Supabase e a app publicada como site estático (Cloudflare Workers, Netlify, Vercel ou outro).

Cada negócio põe o seu nome, logótipo, cor, moeda, IVA e fases do pipeline dentro da app, em Definições. Não é preciso mexer no código para começar.

![Início](docs/inicio.png)

| Pipeline no computador | Proposta que o cliente abre, no telemóvel |
| --- | --- |
| ![Pipeline](docs/pipeline.png) | <img src="docs/telemovel.png" alt="Proposta no telemóvel" width="300"> |

## O que tem

* **Entrar** com Google ou com um link enviado por email (Supabase Auth). A primeira pessoa a entrar fica administradora.
* **Início**: valor do pipeline em curso, negócios por fase, o que há para hoje (agenda e tarefas), próximos passos em atraso e contactos a arrefecer.
* **Pipeline**: negócios por fase, arrastar entre colunas no computador e botões de fase no telemóvel. Cada negócio tem pessoa, empresa, valor, data prevista, próximo passo com data, notas e histórico (notas, chamadas, emails, reuniões, WhatsApp). Ao passar a uma fase de "perdido" a app pergunta o motivo.
* **Contactos e empresas**: pesquisa que ignora acentos e pontuação ("goncalves" encontra "Gonçalves"), categorias, ligar, WhatsApp e email num toque, aviso de possíveis repetidos e de emails inválidos.
* **Calendário**: vista do mês e agenda do dia, com marcações (reuniões, serviços, seguimentos) e tarefas com prazo, hora, prioridade e responsável.
* **Propostas**: editor com linhas (descrição, quantidade, preço), desconto, IVA e totais; página pública `/p/:token` onde o cliente vê a proposta e aceita (com o nome) ou recusa. A validade é verificada no servidor e, ao aceitar, o negócio passa a "ganho".
* **Definições**: perfil do negócio (nome, logótipo, cor, moeda, IVA, contactos), fases do pipeline, textos por omissão das propostas, módulos, equipa (administrador ou membro, ativo ou não, acessos ao Email e ao Banco) e o perfil de cada pessoa.
* **Email** (módulo opcional): a caixa de correio do negócio dentro da app, por IMAP e SMTP, de qualquer fornecedor. Ver [Email (IMAP e SMTP)](#email-imap-e-smtp).
* **Banco** (módulo opcional): saldo e movimentos pelo Enable Banking ou por extratos em CSV e Excel, com categorias, notas e ligação aos negócios. Ver [Banco](#banco).
* **Aviso de versão nova**: quando publica uma versão nova, quem tem a app aberta vê "Há uma versão mais recente desta app." com o botão Atualizar.

Tecnologia: React 19, Vite, Tailwind CSS 4, TypeScript, lucide-react, dnd-kit e supabase-js. Sem servidor próprio: a segurança está nas regras da base de dados (RLS). Os dois módulos opcionais usam duas Edge Functions do Supabase (Deno), que só são precisas se ligar os módulos.

## Instalar, passo a passo

Precisa de uma conta gratuita no [Supabase](https://supabase.com) e do Node.js 20 ou mais recente.

1. **Criar o projeto no Supabase.** Em supabase.com, crie um projeto novo (escolha a região mais perto, por exemplo Frankfurt ou Paris para Portugal) e guarde a password da base de dados.
2. **Criar as tabelas.** Abra o *SQL Editor*, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e carregue em *Run*. Pode correr outra vez mais tarde (por exemplo depois de atualizar o modelo): não apaga dados.
3. **Expor o esquema `app`.** Em *Project Settings > Data API*, em *Exposed schemas*, acrescente `app` e guarde. Sem isto a app mostra "Não foi possível ler os dados".
4. **Entrar por email (link mágico).** Em *Authentication > Sign In / Providers*, confirme que *Email* está ligado. O link chega por email e não há passwords.
5. **Entrar com Google (opcional).** Na [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um *OAuth client ID* do tipo *Web application* e, em *Authorized redirect URIs*, ponha `https://<o-seu-projeto>.supabase.co/auth/v1/callback`. Depois, no Supabase, em *Authentication > Sign In / Providers > Google*, ligue e cole o *Client ID* e o *Client secret*.
6. **Endereços autorizados.** Em *Authentication > URL Configuration*, ponha em *Site URL* o endereço final da app e acrescente em *Redirect URLs* `http://localhost:5173` (para testar no computador) e o endereço publicado (por exemplo `https://gestao.o-meu-negocio.pt`).
7. **Ligar a app ao projeto.** Copie `.env.example` para `.env` e preencha com os valores de *Project Settings > API*:
   ```
   VITE_SUPABASE_URL=https://<o-seu-projeto>.supabase.co
   VITE_SUPABASE_KEY=<a chave pública: anon ou publishable>
   ```
   Use só a chave pública. A chave `service_role` nunca vai para a app.
8. **Arrancar.**
   ```
   npm install
   npm run dev
   ```
   Abra http://localhost:5173 e entre. **A primeira pessoa a entrar fica administradora**, por isso entre logo a seguir a instalar. As outras pessoas são acrescentadas em Definições > Equipa, com o email com que vão entrar.

## Publicar

A app é um site estático (a pasta `dist` depois de `npm run build`). As variáveis do `.env` entram no momento da construção.

**Cloudflare Workers** (só ficheiros estáticos, sem código no servidor):
1. Mude o `name` em [`wrangler.jsonc`](wrangler.jsonc) se quiser.
2. `npx wrangler login` e depois `npm run deploy`.
3. A app fica em `https://<name>.<a-sua-conta>.workers.dev`. Para um domínio próprio, acrescente em *Workers > Settings > Domains*.

**Netlify**: comando de construção `npm run build`, pasta `dist`, as duas variáveis `VITE_...` em *Environment variables* e um ficheiro `public/_redirects` com a linha `/*  /index.html  200` para as rotas da app (como `/p/...`) abrirem direto.

**Vercel**: escolha Vite, ponha as duas variáveis e crie `vercel.json` com `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.

**Outro alojamento**: qualquer servidor que devolva `index.html` para os endereços que não são ficheiros (o chamado *SPA fallback*).

No fim, acrescente o endereço publicado em *Redirect URLs* no Supabase (passo 6).

**O ficheiro `versao.json` não pode ficar em cache.** Cada `npm run build` grava em `dist/versao.json` um código da versão (data, hora e commit) e põe o mesmo código dentro da app. A app pergunta pelo `versao.json` de 5 em 5 minutos e quando o separador volta a ficar visível (sempre com `cache: 'no-store'` e um parâmetro novo no endereço); se o código for outro, mostra o aviso de versão nova. O ficheiro [`public/_headers`](public/_headers) já diz ao Cloudflare Workers e ao Netlify para não o guardar em cache (`Cache-Control: no-store`). No Vercel acrescente ao `vercel.json`: `"headers": [{ "source": "/versao.json", "headers": [{ "key": "Cache-Control", "value": "no-store" }] }]`. Noutro alojamento configure o mesmo cabeçalho para `/versao.json`.

## Email (IMAP e SMTP)

Módulo opcional: a caixa de correio do negócio dentro da app. Funciona com qualquer fornecedor que tenha IMAP (para ler) e SMTP (para enviar): Gmail, Google Workspace, Hostinger, Sapo, IONOS, OVH, Zoho e outros. Os emails ficam ligados aos contactos pelo endereço e cada email enviado a um contacto fica no histórico dele (e no negócio em curso).

O que faz: pastas (com gaveta no telemóvel), lista com pesquisa e não lidos, conversa com as mensagens ligadas, HTML numa moldura isolada (sem scripts e sem imagens de fora até carregar em "Mostrar imagens"), texto citado escondido, anexos, marcar como lido ou não lido, mover, apagar (vai para o Lixo; no Lixo apaga de vez), escrever, responder, responder a todos e reencaminhar (com os anexos do original), destinatários sugeridos dos contactos, endereços inválidos assinalados e bloqueados, anexos até 15 MB. Nas propostas aparece **Enviar proposta por email**, que envia pela caixa do negócio. A sincronização é incremental: em cada pasta só se trazem as mensagens com UID maior do que o último lido; o texto completo é lido ao abrir e fica guardado.

**Instalar, passo a passo**

1. Corra outra vez o [`supabase/schema.sql`](supabase/schema.sql) (não apaga dados). O Supabase já traz o **Vault**, onde fica a password, cifrada.
2. Instale a [Supabase CLI](https://supabase.com/docs/guides/cli), entre (`supabase login`) e ligue a pasta ao projeto (`supabase link --project-ref <o-seu-projeto>`).
3. Publique a função:
   ```
   supabase functions deploy email --no-verify-jwt
   ```
   O `--no-verify-jwt` é intencional: a função verifica ela própria a sessão (pede ao Supabase Auth quem é a pessoa) e confirma que é membro ativo com acesso ao email. Assim responde também ao pedido de CORS do browser. A chave `service_role` só existe dentro da função (o Supabase põe-na sozinho) e nunca vai para o browser.
4. Na app, em **Definições > Módulos**, ligue **Email (IMAP e SMTP)**. Aparece a secção **Email**: escolha o fornecedor (os servidores ficam preenchidos), escreva o endereço, o nome do remetente e a **password de aplicação**, carregue em **Testar ligação** e depois em **Guardar**.
5. Em **Definições > Equipa**, dê o acesso **Email** aos membros que o devem usar (os administradores têm sempre).

**Passwords de aplicação**

* **Gmail e Google Workspace**: ative a verificação em dois passos e crie uma password de aplicação em *Conta Google > Segurança > Passwords de aplicações*. Confirme que o IMAP está ativo (Gmail, Definições, Encaminhamento e POP/IMAP). O Gmail guarda sozinho os enviados, por isso a predefinição não guarda outra cópia.
* **Outlook.com e Microsoft 365**: a Microsoft desligou o acesso por password (IMAP e SMTP) na maioria das contas e pede OAuth; além disso o SMTP da Microsoft só usa a porta 587, que o Supabase bloqueia. A app mostra um aviso nesta predefinição. Para estas contas seria preciso acrescentar OAuth (ver Ideias).
* **Hostinger, Sapo, IONOS, OVH**: o endereço completo e a password da caixa. **Zoho**: ative o IMAP e crie uma password de aplicação.

**Portas**: as Edge Functions do Supabase não podem usar as portas 25 e 587. Use SMTP na porta **465 (SSL/TLS)**, que quase todos os fornecedores têm. IMAP na 993.

**Sincronização periódica (opcional)**: a app sincroniza ao abrir a página Email e no botão Sincronizar. Para sincronizar sozinha (por exemplo de 10 em 10 minutos), crie um segredo e agende um pedido com `pg_cron` e `pg_net` (ative as duas extensões em *Database > Extensions*):
```
supabase secrets set CRON_SEGREDO=<um-texto-comprido-ao-acaso>
```
```sql
select cron.schedule('email-sincronizar', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://<o-seu-projeto>.supabase.co/functions/v1/email',
    headers := '{"Content-Type": "application/json", "x-cron-segredo": "<o mesmo texto>"}'::jsonb,
    body := '{"acao": "cron"}'::jsonb)
$$);
```

## Banco

Módulo opcional: saldo e movimentos da conta da empresa, para classificar (categoria, notas, ligação a um negócio) e marcar como revistos. Os movimentos chegam de duas maneiras, que se podem usar juntas: pela ligação ao banco (**Enable Banking**, open banking PSD2, só leitura) ou importando extratos em **CSV ou Excel**. A página Banco tem o saldo, entradas e saídas, filtros por mês, entradas ou saídas, categoria e por rever, pesquisa, importação com pré-visualização e exportação em CSV (separador `;` e vírgula decimal, abre bem no Excel).

**Importar extratos**: a leitura descobre sozinha o separador, a linha de cabeçalho (os bancos põem dados da conta antes) e as colunas de data, descritivo e valor (ou débito e crédito separados). Percebe "1.234,56", "1 500,00", "−12,50", "(40,00)", datas como 31/12/2025, 2025-12-31 ou 31-12-25, e datas e números do Excel. Uma linha com data impossível (31/02/2026) ou valor ilegível fica de fora, com o número da linha e o motivo, e as outras entram. Cada movimento tem uma impressão digital (hash): importar o mesmo ficheiro duas vezes não repete nada, e um movimento do banco com a mesma data e valor de um importado não entra outra vez.

**Ligar ao banco, passo a passo**

1. Corra outra vez o `schema.sql` e publique a função:
   ```
   supabase functions deploy banco --no-verify-jwt
   ```
   (tal como a do email, verifica ela própria a sessão e o acesso **Banco**).
2. Crie uma conta em [enablebanking.com](https://enablebanking.com) e, no *Control Panel*, uma **aplicação** (ambiente de produção). Em *Redirect URLs* registe o endereço de regresso, que é o endereço da app seguido de `/banco` (por exemplo `https://gestao.o-meu-negocio.pt/banco`); a app mostra-o em Definições. O Enable Banking gera a chave privada: guarde o ficheiro `.pem`.
3. Enquanto a aplicação estiver em modo restrito, só vê as contas que ativar no painel deles (*Activate by linking accounts*). Para uso só pela própria empresa isto chega.
4. Na app, em **Definições > Módulos**, ligue **Banco**. Na secção **Banco** escreva o **ID da aplicação**, carregue o ficheiro `.pem` (ou cole o conteúdo), escolha o país e carregue em **Guardar**.
5. Em **Contas ligadas**, carregue em **Ligar um banco**, escolha o banco e o tipo de conta: vai para o site do banco, autoriza a leitura e volta à página Banco, já com o saldo e os movimentos dos últimos 90 dias. Se o banco partilhar várias contas, escolhe as que quer.
6. A autorização dura até 180 dias (depende do banco). A data aparece em Definições e no cartão do saldo; perto do fim surge **Voltar a ligar**, que mantém a mesma conta e os mesmos movimentos. **Desligar** termina a autorização no Enable Banking e deixa os movimentos.
7. Em **Equipa**, dê o acesso **Banco** aos membros que o devem ver. Ligar e desligar bancos é só para administradores; apagar movimentos também.

As categorias editam-se em **Definições > Categorias dos movimentos**. Os bancos só deixam ler a conta sozinhos algumas vezes por dia (regra PSD2); se passar o limite, a app avisa e tenta mais tarde. Para sincronizar sozinho, use o mesmo `CRON_SEGREDO` e o pedido do email com o endereço `.../functions/v1/banco` (por exemplo de 6 em 6 horas: `'0 */6 * * *'`).

**Segurança dos módulos**

* A password do email e a chave privada do Enable Banking vão do browser para a base de dados uma única vez, pela função `app.guardar_segredo` (só administradores e só os nomes `email_password` e `enablebanking_key`), e ficam no **Supabase Vault**, cifradas. O browser só pode perguntar se existem (`app.segredo_existe`, que devolve sim ou não) ou apagá-las. Quem as lê é a função `app.ler_segredo`, que só o papel `service_role` (as Edge Functions) pode chamar.
* As tabelas `app.emails`, `app.email_pastas` e `app.banco_ligacoes` só se leem no browser; quem escreve são as funções. Nos movimentos, o browser importa extratos e muda só a categoria, o negócio, as notas e o revisto; data, valor e descritivo não se mudam.
* Membros sem o acesso não veem emails nem movimentos (RLS com `app.pode('email')` e `app.pode('banco')`), e as funções recusam os pedidos.
* O HTML dos emails abre numa moldura `sandbox` sem scripts, com uma política de conteúdo que bloqueia pedidos para fora (imagens só quando se pede).
* A ligação ao banco é só de leitura. A app nunca vê as credenciais do banco: a pessoa entra no site do próprio banco.
* Os servidores de email são escolhidos pelos administradores; a função liga ao servidor que estiver nas Definições.

## Adaptar ao seu negócio

**Sem código, em Definições** (só administradores):
* nome, logótipo (endereço de uma imagem), cor principal, moeda, IVA por omissão, email, telefone, site, NIF e morada; aparecem na app e nas propostas;
* fases do pipeline: nome, cor, tipo (em curso, ganho, perdido) e ordem;
* introdução, condições e validade das propostas novas;
* equipa: acrescentar pessoas, mudar o papel, desativar.

**No código**:
* [`src/config.ts`](src/config.ts): categorias de contacto, origens, dias até um contacto "arrefecer", nome e cor antes de entrar.
* [`src/index.css`](src/index.css): a cor principal é a variável `--marca`; os tons claros e escuros são calculados a partir dela com `color-mix`, por isso a app toda muda com uma só cor. Tipos de letra em `--font-sans`.
* [`src/lib/tipos.ts`](src/lib/tipos.ts): cores possíveis das fases, tipos de marcação na agenda e tipos de atividade.

## Segurança

* RLS ligado em todas as tabelas: só membros ativos (tabela `app.membros`) leem e escrevem; só administradores mudam a equipa e as definições.
* Visitantes sem conta só podem chamar `app.proposta_publica` e `app.proposta_responder`. A proposta abre por um código aleatório de 24 caracteres; rascunhos não aparecem; a validade, a resposta única e o nome obrigatório são verificados na base de dados.
* Nunca fica sem administrador: a base de dados recusa tirar ou despromover o último.
* A primeira pessoa a entrar com a equipa vazia fica administradora. Entre logo depois de instalar ou, se preferir, crie o primeiro administrador à mão no SQL Editor: `insert into app.membros (email, nome, papel) values ('o-seu@email.pt', 'O seu nome', 'admin');`
* A validade das propostas compara com a data do servidor do Supabase (UTC).
* Email e Banco: ver a secção "Segurança dos módulos" acima.

## Testes

* **Base de dados**: `tests/sql/correr.sh` cria um Postgres descartável, aplica o `schema.sql` duas vezes (tem de ser idempotente) e testa as regras: primeira pessoa admin, conta fora da equipa, membro, membro inativo e visitante sem conta com propostas válidas e fora de validade. Precisa dos programas do Postgres 15 ou mais recente (`initdb`, `pg_ctl`, `psql`).
* **Base de dados, módulos**: os mesmos testes verificam os segredos (só administradores guardam, ninguém os lê pelo browser, só `service_role`), os acessos por membro (sem "banco" não vê movimentos; sem conta nada) e o hash único dos movimentos. O Postgres local não tem Vault: `tests/sql/stub_vault.sql` cria uma imitação mínima (`vault.secrets`, `vault.decrypted_secrets`, `vault.create_secret`, `vault.update_secret`) só para os testes. No Supabase o Vault já existe.
* **Edge Functions** (Deno 2): `deno test -A --config supabase/functions/deno.json tests/funcoes/`.
  * `email_test.ts` corre contra um servidor de correio verdadeiro, local: o GreenMail (IMAP 3143, SMTP 3025). Arranque com `tests/funcoes/greenmail.sh` (Java 17 ou mais recente) ou com Docker (comando no início do ficheiro). Testa ligar, sincronização incremental, leitura, anexos, marcas, envio com resposta (In-Reply-To e References), cópia em Enviados, reencaminhar, mover, apagar e permissões. Nunca usa servidores reais.
  * `banco_test.ts` simula a API do Enable Banking (verifica a assinatura RS256 do JWT) e testa listar bancos, autorizar, sessão, páginas de transações, movimentos repetidos, limite diário, autorização expirada, voltar a ligar, várias contas e desligar.
  * `extrato_test.ts` testa a leitura de extratos com os ficheiros de `tests/amostras` (CSV e XLSX, com "1.234,56", "−12,50" e uma linha "31/02/2026" que fica de fora sem estragar as outras).
* **App no browser**: `tests/historias.py` (Python com Playwright) simula a API do Supabase e percorre as histórias principais a 1440, 390 e 360 px de largura: entrar pela primeira vez, criar empresa e contacto, criar negócio, mudar de fase, perder com motivo, tarefa e marcação, proposta com "650,5" e IVA, aceitar pelo link público, mudar nome e cor. Também percorre os módulos (ligar e configurar o Email, testar, sincronizar, abrir, responder com um endereço inválido bloqueado, anexo, enviar, enviar uma proposta; ligar o Banco com o regresso simulado, classificar, filtrar, importar CSV com pré-visualização, exportar; acessos de um membro) e o aviso de versão nova. Verifica que não há deslocamento horizontal nem erros na consola. Como correr está no início do ficheiro (use a porta 4199).

## Estrutura

```
supabase/schema.sql      tabelas, regras de segurança e funções públicas
supabase/functions/      Edge Functions dos módulos: email (IMAP e SMTP) e banco (Enable Banking)
src/config.ts            valores por omissão e listas simples
src/lib/                 ligação ao Supabase, dados, tipos, tema, formatação e leitura de extratos
src/components/          painéis, formulários, diálogos e o documento da proposta
src/pages/               Início, Pipeline, Contactos, Calendário, Propostas, Email, Banco, Definições, Entrar e proposta pública
tests/                   testes da base de dados, das funções (Deno) e do browser
wrangler.jsonc           publicação no Cloudflare Workers (só ficheiros estáticos)
```

## Ideias para módulos opcionais

Já feitos: Email (IMAP e SMTP) e Banco (Enable Banking e extratos).

* Email com OAuth (Microsoft 365, Outlook.com e Gmail sem password de aplicação) e envio por um serviço com API (para contornar a porta 587).
* Email: rascunhos guardados no servidor, assinatura por pessoa, respostas modelo.
* Banco: sugerir a categoria e o negócio a partir de movimentos parecidos; reconciliar com propostas aceites.
* Assistente com IA para resumir o dia, escrever respostas e preencher fichas.
* Faturação através de um programa certificado (em Portugal a fatura tem de sair de software certificado).
* Exportar e importar contactos em CSV; anexos com o Supabase Storage.
* Subscrever o calendário no telemóvel (ICS) e um resumo diário por email.

## Licença

MIT. Ver [LICENSE](LICENSE).

## English

**Small business management app template.** A mobile friendly CRM for small businesses (services, events, agencies, shops), with the interface in European Portuguese: dashboard, deal pipeline with drag and drop, contacts and companies, calendar with tasks, and proposals with a public accept or decline page. Built with React 19, Vite, Tailwind CSS 4, TypeScript and Supabase (Postgres with row level security; no custom backend).

Setup in short: create a Supabase project, run `supabase/schema.sql` in the SQL Editor, add `app` to *Exposed schemas* in the Data API settings, enable email (magic link) and optionally Google sign in, add your local and production URLs to the auth redirect list, copy `.env.example` to `.env` with your project URL and public key, then `npm install` and `npm run dev`. The first person to sign in becomes the administrator. Business name, logo, colour, currency, VAT rate, pipeline stages and proposal texts are edited in the app under *Definições*. Deploy the `dist` folder to Cloudflare Workers (`npm run deploy`), Netlify, Vercel or any static host with a single page app fallback; make sure `/versao.json` is served with `Cache-Control: no-store` (already set in `public/_headers` for Cloudflare and Netlify) so the "new version available" banner works.

Two optional modules can be switched on in *Definições*: **Email** (any IMAP and SMTP provider; deploy with `supabase functions deploy email --no-verify-jwt`, the function checks the session and team membership itself; use SMTP port 465 because Supabase blocks 25 and 587) and **Banco** (bank balance and transactions through Enable Banking open banking, plus CSV and XLSX statement import; deploy with `supabase functions deploy banco --no-verify-jwt` and register `<app url>/banco` as the redirect URL of your Enable Banking application). Passwords and private keys are stored in Supabase Vault through admin only RPCs and are only readable by the Edge Functions. Members get access per module in the team section. Licensed under MIT.

# Histórias de utilizador de ponta a ponta, no Chromium, com a API do Supabase simulada (tests/mock.py).
# Uso:  VITE_SUPABASE_URL=https://teste.supabase.co VITE_SUPABASE_KEY=teste npm run build && npx vite preview --port 4199 &
#       python3 tests/historias.py            (acrescente --fotos para gravar as imagens do README em docs/)
import os, re, sys, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
import json
from mock import Mock, URL, abrir, scroll_horizontal, HOJE, correio_exemplo
from playwright.sync_api import sync_playwright, expect

VISTAS = [('computador', {'width': 1440, 'height': 900}), ('telemovel', {'width': 390, 'height': 844}), ('pequeno', {'width': 360, 'height': 740})]
FOTOS = '--fotos' in sys.argv
# python3 tests/historias.py --so historia_modulos   (corre só essas histórias)
SO = sys.argv[sys.argv.index('--so') + 1].split(',') if '--so' in sys.argv else []
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ok, falhas, erros = [], [], []

def verifica(cond, msg):
  (ok if cond else falhas).append(msg)
  if not cond: print('  FALHOU:', msg)

def sem_scroll(pg, onde, rotulo):
  x = scroll_horizontal(pg)
  verifica(x <= 0, f'[{rotulo}] sem scroll horizontal em {onde} ({x}px)')

def ir(pg, caminho):
  pg.goto(URL + caminho); pg.wait_for_load_state('networkidle')

def historia(p, rotulo, vp):
  movel = vp['width'] < 1024
  mock = Mock()
  ctx = p.chromium.launch().new_context(viewport=vp)
  ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL)
  pg = abrir(ctx, mock, 'ana@exemplo.pt', 'Ana Silva', erros, rotulo)

  # 1. primeira entrada: fica admin
  ir(pg, '/')
  expect(pg.get_by_role('heading', name='Olá, Ana')).to_be_visible()
  verifica([(m['email'], m['papel']) for m in mock.d['membros']] == [('ana@exemplo.pt', 'admin')], f'[{rotulo}] primeira pessoa ficou admin')
  sem_scroll(pg, 'Início', rotulo)

  # 2. empresa e contacto
  ir(pg, '/contactos')
  pg.get_by_role('tab', name=re.compile('Empresas')).click()
  pg.get_by_role('button', name='Nova empresa').click()
  dlg = pg.get_by_role('dialog')
  dlg.get_by_label('Nome', exact=True).fill('Padaria Central')
  dlg.get_by_role('button', name='Criar').click()
  expect(pg.get_by_text('Padaria Central')).to_be_visible()
  pg.get_by_role('tab', name=re.compile('Pessoas')).click()
  pg.get_by_role('button', name='Novo contacto').click()
  dlg = pg.get_by_role('dialog')
  dlg.get_by_label('Nome', exact=True).fill('Rita Gonçalves')
  dlg.get_by_label('Empresa', exact=True).fill('Padaria Central')
  dlg.get_by_role('textbox', name='Email').fill('rita@padaria')
  expect(dlg.get_by_text('Este email não parece válido.')).to_be_visible()
  dlg.get_by_role('button', name='Criar').click()
  expect(dlg.get_by_role('alert')).to_contain_text('não parece válido')
  verifica(len(mock.d['contactos']) == 0, f'[{rotulo}] email inválido não grava')
  dlg.get_by_role('textbox', name='Email').fill('rita@padaria.pt')
  dlg.get_by_role('textbox', name='Telefone').fill('912 345 678')
  dlg.get_by_role('button', name='Cliente', exact=True).click()
  sem_scroll(pg, 'painel de contacto', rotulo)
  dlg.get_by_role('button', name='Criar').click()
  expect(pg.get_by_role('dialog')).to_have_count(0)
  rita = mock.d['contactos'][0] if mock.d['contactos'] else {}
  empresa = mock.d['empresas'][0] if mock.d['empresas'] else {}
  verifica(rita.get('empresa_id') == empresa.get('id') and len(mock.d['empresas']) == 1 and rita.get('categoria') == 'cliente', f'[{rotulo}] contacto ligado à empresa existente (sem a duplicar)')
  # repetido: mesmo nome sem acentos avisa
  pg.get_by_role('button', name='Novo contacto').click()
  dlg = pg.get_by_role('dialog')
  dlg.get_by_label('Nome', exact=True).fill('rita goncalves')
  expect(dlg.get_by_role('status')).to_contain_text('Parece repetido')
  dlg.get_by_role('button', name='Cancelar').click()
  # procurar sem acentos nem pontuação
  pg.get_by_label('Procurar').fill('GONCALVES.')
  expect(pg.get_by_text('Rita Gonçalves')).to_be_visible()
  pg.get_by_label('Procurar').fill('345678')
  expect(pg.get_by_text('Rita Gonçalves')).to_be_visible()
  verifica(pg.locator('a[href^="https://wa.me/351912345678"]').count() >= 1 or movel, f'[{rotulo}] link de WhatsApp com indicativo')
  sem_scroll(pg, 'Contactos', rotulo)

  # 3. negócio
  ir(pg, '/pipeline')
  pg.get_by_role('button', name='Novo negócio').click()
  dlg = pg.get_by_role('dialog')
  dlg.get_by_label('Título').fill('Bolos para o evento')
  dlg.get_by_label('Pessoa').fill('Rita')
  dlg.get_by_role('button', name=re.compile('Rita Gonçalves')).click()
  dlg.get_by_label('Valor (sem IVA)').fill('1.250,5')
  dlg.get_by_label('Próximo passo', exact=True).fill('Ligar à Rita')
  dlg.get_by_role('button', name='Hoje', exact=True).click()
  dlg.get_by_role('button', name='Criar').click()
  expect(pg.get_by_role('dialog')).to_have_count(0)
  n = mock.d['negocios'][0] if mock.d['negocios'] else {}
  verifica(n.get('valor') == 1250.5 and n.get('contacto_id') == rita.get('id') and n.get('empresa_id') == empresa.get('id') and n.get('proximo_passo_em') == HOJE(), f'[{rotulo}] negócio criado com valor 1250,5, pessoa, empresa e passo para hoje')
  cartao = pg.locator('[data-negocio="Bolos para o evento"]:visible').first
  expect(cartao).to_be_visible()

  # 4. mudar de fase: arrastar no computador, botões no telemóvel
  if movel:
    pg.get_by_role('button', name='Passar a Em conversa').click()
  else:
    alvo = pg.locator('[data-fase="conversa"]')
    a = cartao.bounding_box(); b = alvo.bounding_box()
    pg.mouse.move(a['x'] + a['width'] / 2, a['y'] + a['height'] / 2); pg.mouse.down()
    pg.mouse.move(a['x'] + a['width'] / 2 + 20, a['y'] + a['height'] / 2 + 5, steps=5)
    pg.mouse.move(b['x'] + b['width'] / 2, b['y'] + 60, steps=15); pg.mouse.up()
  pg.wait_for_timeout(500)
  verifica(n.get('estado') == 'conversa', f'[{rotulo}] negócio passou a "Em conversa" ({"botão" if movel else "arrastar"})')
  verifica(any(x['tipo'] == 'estado' and x['resumo'] == 'lead → conversa' for x in mock.d['atividades']), f'[{rotulo}] mudança de fase ficou no histórico')
  sem_scroll(pg, 'Pipeline', rotulo)

  # 5. perdido pede o motivo (cancelar não muda nada)
  pg.locator('[data-negocio="Bolos para o evento"]:visible').first.click()
  dlg = pg.get_by_role('dialog')
  fases = dlg.get_by_role('group', name='Fase')
  fases.get_by_role('button', name='Perdido').click()
  pergunta = pg.get_by_role('alertdialog')
  expect(pergunta).to_contain_text('Porque se perdeu?')
  pergunta.get_by_role('button', name='Cancelar').click()
  verifica(n.get('estado') == 'conversa', f'[{rotulo}] cancelar o motivo não muda a fase')
  fases.get_by_role('button', name='Perdido').click()
  pergunta = pg.get_by_role('alertdialog')
  pergunta.get_by_role('textbox').fill('Preço')
  pergunta.get_by_role('button', name='Marcar como perdido').click()
  pg.wait_for_timeout(300)
  verifica(n.get('estado') == 'perdido' and n.get('motivo_perda') == 'Preço', f'[{rotulo}] perdido grava o motivo')
  fases.get_by_role('button', name='Proposta enviada').click()
  pg.wait_for_timeout(300)
  verifica(n.get('estado') == 'proposta' and n.get('motivo_perda') is None, f'[{rotulo}] voltar a uma fase em curso limpa o motivo')
  dlg.get_by_label('O que se passou').fill('Pediu orçamento por telefone')
  dlg.get_by_role('button', name='Chamada').click()
  dlg.get_by_role('button', name='Registar').click()
  expect(dlg.get_by_text('Pediu orçamento por telefone')).to_be_visible()
  verifica(any(x['tipo'] == 'chamada' for x in mock.d['atividades']), f'[{rotulo}] atividade (chamada) registada')
  sem_scroll(pg, 'painel do negócio', rotulo)
  pg.keyboard.press('Escape')

  # 6. tarefa e marcação no calendário
  ir(pg, '/calendario')
  pg.get_by_label('Nova tarefa').fill('Enviar orçamento à Rita')
  pg.get_by_role('button', name='Prioridade').click()
  pg.get_by_role('button', name=re.compile('Alta')).click()
  pg.get_by_role('button', name='Criar tarefa').click()
  pg.wait_for_timeout(300)
  t = mock.d['tarefas'][0] if mock.d['tarefas'] else {}
  verifica(t.get('titulo') == 'Enviar orçamento à Rita' and t.get('prazo') == HOJE() and t.get('prioridade') == 3 and t.get('responsavel') == 'Ana Silva', f'[{rotulo}] tarefa com prazo, prioridade e responsável')
  pg.get_by_role('button', name='Marcar', exact=True).click()
  dlg = pg.get_by_role('dialog')
  dlg.get_by_label('Título').fill('Reunião na padaria')
  dlg.get_by_label('Local').fill('Lisboa')
  dlg.get_by_role('button', name='Guardar').click()
  expect(pg.get_by_role('dialog')).to_have_count(0)
  verifica(len(mock.d['agenda']) == 1 and mock.d['agenda'][0]['inicio'].startswith(HOJE()[:7]), f'[{rotulo}] marcação na agenda')
  dia = pg.get_by_label('Agenda do dia')
  expect(dia.get_by_text('Reunião na padaria')).to_be_visible()
  expect(dia.get_by_text('!!! Enviar orçamento à Rita')).to_be_visible()
  sem_scroll(pg, 'Calendário', rotulo)

  # 7. proposta com decimais e IVA
  ir(pg, f"/propostas/nova?negocio={n.get('id')}")
  pg.get_by_label('Descrição da linha 1').fill('Bolo de casamento')
  pg.get_by_label('Preço da linha 1').fill('650,5')
  pg.get_by_role('button', name='Acrescentar linha').click()
  pg.get_by_label('Descrição da linha 2').fill('Entrega')
  pg.get_by_label('Preço da linha 2').fill('25')
  expect(pg.locator('[data-teste="total-editor"]')).to_have_text(re.compile(r'830,87\s*€'))
  pg.get_by_role('button', name='Guardar', exact=True).click()
  pg.wait_for_url(re.compile(r'/propostas/[0-9a-f-]{36}$'))
  pg.get_by_role('button', name='Copiar link').click()
  expect(pg.get_by_role('button', name='Link copiado')).to_be_visible()
  pr = mock.d['propostas'][0] if mock.d['propostas'] else {}
  verifica(pr.get('estado') == 'enviada' and pr.get('linhas', [{}])[0].get('preco') == 650.5 and pr.get('iva_pct') == 23 and len(pr.get('token', '')) == 24, f'[{rotulo}] proposta guardada (650,5 + 25, IVA 23%) e marcada como enviada')
  verifica(n.get('valor') == 675.5, f'[{rotulo}] valor do negócio acompanha a proposta (675,5)')
  if not movel:
    copiado = pg.evaluate('navigator.clipboard.readText()')
    verifica(copiado == f"{URL}/p/{pr.get('token')}", f'[{rotulo}] link copiado para a área de transferência')
  sem_scroll(pg, 'editor de proposta', rotulo)

  # 8. o cliente abre o link e aceita (sem sessão)
  cliente = ctx.browser.new_context(viewport=vp)
  pc = abrir(cliente, mock, None, None, erros, rotulo + ' cliente')
  ir(pc, f"/p/{pr.get('token')}")
  expect(pc.get_by_role('heading', name='Aceita esta proposta?')).to_be_visible()
  expect(pc.locator('[data-total="total"]')).to_have_text(re.compile(r'830,87\s*€'))
  expect(pc.locator('[data-total="iva"]')).to_have_text(re.compile(r'155,37\s*€'))
  verifica(pr.get('vistas') == 1 and pr.get('estado') == 'vista', f'[{rotulo}] visita do cliente contada')
  sem_scroll(pc, 'proposta pública', rotulo)
  pc.get_by_label('O seu nome').fill('Rita Gonçalves')
  pc.get_by_role('button', name='Aceitar proposta').click()
  expect(pc.get_by_role('status')).to_contain_text('Proposta aceite por Rita Gonçalves')
  verifica(pr.get('estado') == 'aceite' and pr.get('respondida_por') == 'Rita Gonçalves', f'[{rotulo}] proposta aceite com o nome')
  verifica(n.get('estado') == 'ganho' and n.get('valor') == 675.5, f'[{rotulo}] negócio passou a Ganho')
  # proposta fora de validade: não deixa aceitar
  velha = mock.novo('propostas', {'titulo': 'Proposta antiga', 'estado': 'enviada', 'validade': (dt.date.today() - dt.timedelta(days=1)).isoformat(), 'linhas': [{'descricao': 'X', 'quantidade': 1, 'preco': 10}]})
  ir(pc, f"/p/{velha['token']}")
  expect(pc.get_by_text('já passou da validade')).to_be_visible()
  verifica(pc.get_by_role('button', name='Aceitar proposta').count() == 0, f'[{rotulo}] proposta fora de validade sem botão de aceitar')
  verifica(mock.rpc('proposta_responder', {'p_token': velha['token'], 'p_aceita': True, 'p_nome': 'X'}, '', {})['motivo'] == 'expirada', f'[{rotulo}] servidor recusa resposta fora de validade')
  # recusar pede confirmação
  outra = mock.novo('propostas', {'titulo': 'Outra proposta', 'estado': 'enviada', 'validade': HOJE(), 'linhas': [{'descricao': 'Y', 'quantidade': 2, 'preco': 12.5}]})
  ir(pc, f"/p/{outra['token']}")
  pc.get_by_role('button', name='Recusar').click()
  pergunta = pc.get_by_role('alertdialog')
  expect(pergunta).to_contain_text('Recusar esta proposta?')
  pergunta.get_by_role('button', name='Recusar').click()
  expect(pc.get_by_role('status')).to_contain_text('Obrigado pela resposta')
  verifica(outra['estado'] == 'recusada', f'[{rotulo}] recusa com confirmação')
  cliente.close()

  # 9. definições: nome e cor do negócio aplicados na hora
  ir(pg, '/definicoes')
  sec = pg.locator('section', has=pg.get_by_role('heading', name='O negócio'))
  sec.get_by_label('Nome do negócio').fill('Doces da Rita')
  sec.get_by_label('Código da cor').fill('#9333ea')
  sec.get_by_role('button', name='Guardar', exact=True).click()
  expect(sec.get_by_role('status')).to_have_text('Guardado.')
  expect(pg.locator('header:visible, aside:visible').filter(has_text='Doces da Rita').first).to_be_visible()
  pg.mouse.move(1, 1); pg.wait_for_timeout(400)  # sem o rato por cima (hover escurece) e depois da transição de cor
  cor = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--marca').trim()")
  fundo = pg.evaluate("getComputedStyle(document.querySelector('.btn-primary')).backgroundColor")
  verifica(cor == '#9333ea' and fundo == 'rgb(147, 51, 234)', f'[{rotulo}] cor nova aplicada ({cor}, botão {fundo})')
  verifica(pg.title() == 'Doces da Rita', f'[{rotulo}] título da página com o nome do negócio')
  verifica(mock.d['definicoes'][0]['nome_negocio'] == 'Doces da Rita', f'[{rotulo}] definições gravadas')
  eq = pg.locator('section', has=pg.get_by_role('heading', name='Equipa'))
  eq.get_by_label('Email da pessoa nova').fill('bruno@exemplo.pt')
  eq.get_by_label('Nome da pessoa nova').fill('Bruno Costa')
  eq.get_by_role('button', name='Acrescentar').click()
  expect(eq.get_by_text('bruno@exemplo.pt')).to_be_visible()
  sem_scroll(pg, 'Definições', rotulo)
  ir(pg, '/'); sem_scroll(pg, 'Início com dados', rotulo)
  expect(pg.locator('[data-teste="pipeline-aberto"]')).to_be_visible()
  ir(pg, '/propostas'); sem_scroll(pg, 'lista de propostas', rotulo)

  # 10. outra conta: membro novo entra; quem não está na equipa não
  outro = ctx.browser.new_context(viewport=vp)
  pb = abrir(outro, mock, 'bruno@exemplo.pt', None, erros, rotulo + ' bruno')
  ir(pb, '/')
  expect(pb.get_by_role('heading', name='Olá, Bruno')).to_be_visible()
  outro.close()
  intruso = ctx.browser.new_context(viewport=vp)
  pi = abrir(intruso, mock, 'intruso@exemplo.pt', None, erros, rotulo + ' intruso')
  ir(pi, '/')
  expect(pi.get_by_role('heading', name='Ainda sem acesso')).to_be_visible()
  verifica(len(mock.d['membros']) == 2, f'[{rotulo}] intruso não entrou na equipa')
  intruso.close()
  ctx.browser.close()

def semente_modulos(s):
  s.novo('membros', {'email': 'ana@exemplo.pt', 'nome': 'Ana Silva', 'papel': 'admin'})
  s.novo('membros', {'email': 'bruno@exemplo.pt', 'nome': 'Bruno Costa'})
  rita = s.novo('contactos', {'nome': 'Rita Gonçalves', 'email': 'rita@padaria.pt', 'categoria': 'cliente'})
  n = s.novo('negocios', {'titulo': 'Bolos para o evento', 'contacto_id': rita['id'], 'estado': 'proposta', 'valor': 120})
  s.novo('propostas', {'titulo': 'Bolos para o evento', 'negocio_id': n['id'], 'cliente_nome': 'Rita Gonçalves', 'cliente_email': 'rita@padaria.pt', 'linhas': [{'descricao': 'Bolo', 'quantidade': 3, 'preco': 40}], 'validade': HOJE()})
  correio_exemplo(s)

PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7teste\n-----END PRIVATE KEY-----'

def menu(pg, movel, nome):
  """abre um item do menu (no telemóvel está em "Mais")"""
  if movel:
    pg.get_by_role('button', name='Mais').click()
  pg.get_by_role('link', name=nome, exact=True).first.click()
  pg.wait_for_load_state('networkidle')

def historia_modulos(p, rotulo, vp):
  movel = vp['width'] < 1024
  mock = Mock(semente_modulos)
  ctx = p.chromium.launch().new_context(viewport=vp, accept_downloads=True)
  pg = abrir(ctx, mock, 'ana@exemplo.pt', None, erros, rotulo + ' módulos')
  d = mock.d['definicoes'][0]

  # módulos desligados: sem Email nem Banco no menu
  ir(pg, '/')
  if movel: pg.get_by_role('button', name='Mais').click()
  verifica(pg.locator('a[href="/email"]').count() == 0 and pg.locator('a[href="/banco"]').count() == 0, f'[{rotulo}] módulos desligados não aparecem no menu')
  if movel: pg.get_by_role('button', name='Mais').click()

  # ---- Email: ligar o módulo e configurar ----
  ir(pg, '/definicoes')
  cx = pg.get_by_role('checkbox', name=re.compile('Email \\(IMAP e SMTP\\)')); cx.click(); expect(cx).to_be_checked()
  sec = pg.locator('section#email')
  expect(sec).to_be_visible()
  verifica(d['modulo_email'] is True, f'[{rotulo}] módulo Email ligado')
  sec.get_by_label('Fornecedor').select_option('hostinger')
  verifica(sec.get_by_label('Servidor IMAP (receber)').input_value() == 'imap.hostinger.com', f'[{rotulo}] predefinição da Hostinger preenche os servidores')
  sec.get_by_label('Fornecedor').select_option('outlook')
  expect(sec.get_by_text('Muito provavelmente não vai funcionar')).to_be_visible()
  sec.get_by_label('Fornecedor').select_option('outro')
  sec.get_by_label('Servidor IMAP (receber)').fill('imap.teste.pt')
  sec.get_by_label('Servidor SMTP (enviar)').fill('smtp.teste.pt')
  sec.get_by_label('Endereço de email').fill('ana@exemplo.pt')
  sec.get_by_label('Nome do remetente').fill('Ana da Padaria')
  sec.get_by_label('Password de aplicação').fill('errada')
  sec.get_by_role('button', name='Testar ligação').click()
  expect(sec.get_by_role('status', name='Resultado do teste')).to_contain_text('recusou o utilizador ou a password')
  sec.get_by_label('Password de aplicação').fill('segredo')
  sec.get_by_role('button', name='Testar ligação').click()
  expect(sec.get_by_role('status', name='Resultado do teste')).to_contain_text('Receber (IMAP): ligação feita')
  verifica('email_password' not in mock.segredos, f'[{rotulo}] testar não guarda a password')
  sec.get_by_role('button', name='Guardar', exact=True).click()
  expect(sec.get_by_role('status').filter(has_text='Guardado.')).to_be_visible()
  verifica(mock.segredos.get('email_password') == 'segredo', f'[{rotulo}] password guardada pela função guardar_segredo (Vault)')
  verifica('segredo' not in json.dumps(d) and d['email_config'].get('imap_host') == 'imap.teste.pt' and d['email_config'].get('utilizador') == 'ana@exemplo.pt', f'[{rotulo}] a password não vai para as definições')
  expect(sec.get_by_label('Password de aplicação (guardada)')).to_have_value('')
  sem_scroll(pg, 'Definições com módulos', rotulo)

  # ---- Email: sincronizar, abrir, responder ----
  menu(pg, movel, 'Email')
  expect(pg).to_have_url(re.compile('/email$'))
  lista = pg.get_by_role('region', name='Lista de emails')
  expect(lista.get_by_text('Pedido de orçamento')).to_be_visible()
  verifica(len(mock.d['emails']) == 2 and any(e['contacto_id'] for e in mock.d['emails']), f'[{rotulo}] sincronizou 2 emails e ligou o da Rita ao contacto')
  sem_scroll(pg, 'Email (lista)', rotulo)
  # procurar e não lidos
  pg.get_by_label('Procurar emails').fill('orcamento')
  expect(lista.locator('[data-email]')).to_have_count(1)
  pg.get_by_label('Procurar emails').fill('')
  lista.get_by_role('button', name=re.compile('^Não lidos')).click()
  expect(lista.locator('[data-email]')).to_have_count(1)
  lista.get_by_role('button', name='Todos', exact=True).click()
  # a newsletter em HTML abre numa moldura isolada, sem scripts
  lista.locator('[data-email="Novidades da semana"]').click()
  moldura = pg.locator('iframe[title="Conteúdo do email"]')
  expect(moldura).to_be_visible()
  sandbox = moldura.get_attribute('sandbox') or ''
  verifica('allow-scripts' not in sandbox, f'[{rotulo}] HTML do email sem scripts (sandbox="{sandbox}")')
  expect(pg.frame_locator('iframe[title="Conteúdo do email"]').get_by_text('com desconto')).to_be_visible()
  expect(pg.frame_locator('iframe[title="Conteúdo do email"]').get_by_text('Mensagem antiga citada')).to_be_hidden()
  if movel: pg.get_by_role('button', name='Voltar à lista').click()
  lista.locator('[data-email="Pedido de orçamento"]').click()
  aberta = pg.get_by_role('region', name='Email aberto')
  expect(aberta.get_by_text('queria um orçamento para 3 bolos')).to_be_visible()
  expect(aberta.get_by_text('diga-nos do que precisa')).to_be_hidden()
  aberta.get_by_role('button', name='Mostrar texto citado').click()
  expect(aberta.get_by_text('diga-nos do que precisa')).to_be_visible()
  expect(aberta.get_by_role('button', name=re.compile('lista.pdf'))).to_be_visible()
  with pg.expect_download() as dl: aberta.get_by_role('button', name=re.compile('lista.pdf')).click()
  verifica(dl.value.suggested_filename == 'lista.pdf', f'[{rotulo}] anexo descarregado')
  sem_scroll(pg, 'Email aberto', rotulo)
  aberta.get_by_role('button', name='Responder', exact=True).click()
  dlg = pg.get_by_role('dialog')
  expect(dlg.locator('[data-endereco="rita@padaria.pt"]')).to_be_visible()
  expect(dlg.get_by_label('Assunto')).to_have_value('Re: Pedido de orçamento')
  verifica('> Olá Ana,' in dlg.get_by_label('Mensagem').input_value(), f'[{rotulo}] resposta cita o original')
  dlg.get_by_label('Mensagem').press('Control+Home')
  dlg.get_by_label('Mensagem').type('Olá Rita, segue o orçamento. ')
  cc = dlg.get_by_role('textbox', name='Cc')
  cc.fill('rita@padaria'); cc.press('Enter')
  expect(dlg.locator('[data-endereco="rita@padaria"]')).to_be_visible()
  dlg.get_by_role('button', name='Enviar').click()
  expect(dlg.get_by_role('alert')).to_contain_text('Há endereços inválidos: rita@padaria')
  verifica(len(mock.enviados) == 0, f'[{rotulo}] endereço inválido bloqueia o envio')
  dlg.get_by_role('button', name='Tirar rita@padaria', exact=True).click()
  # sugestão de contacto no Cc
  cc.fill('gonc')
  expect(dlg.get_by_role('option', name=re.compile('Rita Gonçalves'))).to_be_visible()
  cc.fill('')
  dlg.get_by_label('Escolher anexos').set_input_files(files=[{'name': 'orçamento.txt', 'mimeType': 'text/plain', 'buffer': '3 bolos: 120 €'.encode()}])
  expect(dlg.get_by_role('list', name='Anexos')).to_contain_text('orçamento.txt')
  sem_scroll(pg, 'Escrever email', rotulo)
  dlg.get_by_role('button', name='Enviar').click()
  expect(pg.get_by_role('status').filter(has_text='Email enviado.')).to_be_visible()
  env = mock.enviados[0] if mock.enviados else {}
  orig = next((e for e in mock.d['emails'] if e['assunto'] == 'Pedido de orçamento'), {})
  verifica(env.get('responder_a') == orig.get('id') and env.get('para') == ['rita@padaria.pt'] and len(env.get('anexos') or []) == 1 and env.get('texto', '').startswith('Olá Rita, segue'), f'[{rotulo}] resposta enviada com anexo e ligação ao original')
  verifica(orig.get('respondido') is True, f'[{rotulo}] original marcado como respondido')
  verifica(any(a['tipo'] == 'email' and a['resumo'] == 'Email enviado: Re: Pedido de orçamento' and a['negocio_id'] for a in mock.d['atividades']), f'[{rotulo}] envio ficou no histórico do contacto e do negócio')
  # pastas (gaveta no telemóvel) e Enviados
  if movel:
    if pg.get_by_role('button', name='Voltar à lista').is_visible(): pg.get_by_role('button', name='Voltar à lista').click()
    pg.get_by_role('button', name='Pastas').click()
    gav = pg.get_by_role('dialog', name='Pastas')
    gav.get_by_role('button', name='Enviados').click()
  else:
    pg.get_by_role('navigation', name='Pastas').get_by_role('button', name='Enviados').click()
  expect(lista.get_by_text('Re: Pedido de orçamento')).to_be_visible()
  sem_scroll(pg, 'Email enviados', rotulo)

  # proposta enviada pelo módulo Email
  pr = mock.d['propostas'][0]
  ir(pg, f"/propostas/{pr['id']}")
  pg.get_by_role('button', name='Enviar proposta por email').click()
  dlg = pg.get_by_role('dialog')
  expect(dlg.get_by_label('Assunto')).to_have_value('Proposta: Bolos para o evento')
  verifica(f"/p/{pr['token']}" in dlg.get_by_label('Mensagem').input_value(), f'[{rotulo}] email da proposta leva o link')
  dlg.get_by_role('button', name='Enviar').click()
  expect(pg.get_by_role('status').filter(has_text='Proposta enviada por email')).to_be_visible()
  verifica(pr['estado'] == 'enviada' and len(mock.enviados) == 2 and mock.enviados[1].get('negocio_id') == pr['negocio_id'], f'[{rotulo}] proposta marcada como enviada e email ligado ao negócio')

  # ---- Banco ----
  ir(pg, '/definicoes')
  cx = pg.get_by_role('checkbox', name=re.compile('^Banco Saldo')); cx.click(); expect(cx).to_be_checked()
  sec = pg.locator('section#banco')
  expect(sec).to_be_visible()
  sec.get_by_label('ID da aplicação (Enable Banking)').fill('11111111-2222-3333-4444-555555555555')
  verifica(sec.get_by_label('Endereço de regresso (registe-o na aplicação)').input_value() == f'{URL}/banco', f'[{rotulo}] endereço de regresso por omissão')
  sec.get_by_label('Chave privada', exact=True).fill('isto não é uma chave')
  sec.get_by_role('button', name='Guardar', exact=True).click()
  expect(sec.get_by_role('alert')).to_contain_text('ficheiro .pem')
  sec.get_by_label('Chave privada', exact=True).fill(PEM)
  sec.get_by_role('button', name='Guardar', exact=True).click()
  expect(sec.get_by_text('Guardada', exact=True)).to_be_visible()
  verifica(mock.segredos.get('enablebanking_key') == PEM and 'PRIVATE' not in json.dumps(d), f'[{rotulo}] chave do Enable Banking só no Vault')
  contas = pg.locator('section', has=pg.get_by_role('heading', name='Contas ligadas'))
  contas.get_by_role('button', name='Ligar um banco').click()
  dlg = pg.get_by_role('dialog')
  dlg.get_by_label('Procurar banco').fill('exemplo')
  dlg.get_by_role('button', name=re.compile('Banco Exemplo')).click()
  pg.wait_for_url(re.compile('/banco$'))
  expect(pg.get_by_role('status').filter(has_text='Banco ligado. 3 movimentos trazidos.')).to_be_visible()
  expect(pg.locator('[data-teste="saldo"]')).to_contain_text('1500,25')
  expect(pg.locator('[data-teste="saldo"]')).to_contain_text('Autorização até')
  verifica(mock.d['banco_ligacoes'][0]['estado'] == 'ativa', f'[{rotulo}] banco ligado pelo regresso do Enable Banking (simulado)')
  sem_scroll(pg, 'Banco', rotulo)
  # classificar
  pg.locator('[data-movimento="COMPRA PAPELARIA"]').click()
  dlg = pg.get_by_role('dialog')
  dlg.get_by_label('Categoria').select_option('Material')
  dlg.get_by_label('Negócio').select_option(label='Bolos para o evento')
  dlg.get_by_label('Notas').fill('Caixas para os bolos'); dlg.get_by_label('Categoria').focus()
  dlg.get_by_role('button', name='Marcar como revisto').click()
  expect(dlg.get_by_role('button', name='Voltar a por rever')).to_be_visible()
  m = next(x for x in mock.d['movimentos'] if x['descritivo'] == 'COMPRA PAPELARIA')
  verifica(m['categoria'] == 'Material' and m['negocio_id'] and m['notas'] == 'Caixas para os bolos' and m['revisto'] and m['revisto_por'] == 'Ana Silva', f'[{rotulo}] movimento classificado e revisto')
  sem_scroll(pg, 'movimento', rotulo)
  pg.keyboard.press('Escape')
  # filtros
  pg.get_by_role('group', name='Filtros').get_by_role('button', name='Entradas').click()
  expect(pg.locator('[data-movimento]')).to_have_count(1)
  pg.get_by_role('group', name='Filtros').get_by_role('button', name='Todos').click()
  pg.get_by_label('Categoria').select_option('Material')
  expect(pg.locator('[data-movimento]')).to_have_count(1)
  pg.get_by_label('Categoria').select_option('')
  pg.get_by_role('group', name='Filtros').get_by_role('button', name='Por rever').click()
  expect(pg.locator('[data-movimento]')).to_have_count(2)
  pg.get_by_role('group', name='Filtros').get_by_role('button', name='Por rever').click()
  # importar extrato com pré-visualização (a linha de 31/02/2026 e a de "abc" ficam de fora)
  pg.get_by_role('button', name='Importar').click()
  dlg = pg.get_by_role('dialog')
  dlg.get_by_label('Ficheiro do extrato').set_input_files(os.path.join(RAIZ, 'tests', 'amostras', 'extrato-debito-credito.csv'))
  expect(dlg.locator('[data-teste="pre-visualizacao"]')).to_contain_text('5 movimentos')
  expect(dlg.locator('[data-teste="pre-visualizacao"]')).to_contain_text('2 linhas ficaram de fora')
  expect(dlg.get_by_label('Linhas que ficaram de fora')).to_contain_text('Data inválida: "31/02/2026"')
  expect(dlg.get_by_label('Linhas que ficaram de fora')).to_contain_text('Valor inválido: "abc"')
  verifica(len(mock.d['movimentos']) == 3, f'[{rotulo}] pré-visualizar não grava')
  sem_scroll(pg, 'importar extrato', rotulo)
  dlg.get_by_role('button', name='Importar 5 movimentos').click()
  expect(pg.get_by_role('status').filter(has_text='5 movimentos importados.')).to_be_visible()
  imp = [x for x in mock.d['movimentos'] if x['origem'] == 'extrato']
  verifica(len(imp) == 5 and sorted(x['valor'] for x in imp) == [-40, -12.5, -12.5, -12.5, 1234.56], f'[{rotulo}] extrato importado (1.234,56 e −12,50)')
  # importar o mesmo ficheiro outra vez não repete
  pg.get_by_role('button', name='Importar').click()
  pg.get_by_role('dialog').get_by_label('Ficheiro do extrato').set_input_files(os.path.join(RAIZ, 'tests', 'amostras', 'extrato-debito-credito.csv'))
  pg.get_by_role('dialog').get_by_role('button', name='Importar 5 movimentos').click()
  expect(pg.get_by_role('status').filter(has_text='0 movimentos importados. 5 já existiam.')).to_be_visible()
  # exportar
  with pg.expect_download() as dl: pg.get_by_role('button', name=re.compile('Exportar')).click()
  csv = open(dl.value.path(), encoding='utf-8-sig').read()
  verifica(csv.startswith('Data;Descritivo;Contraparte;Valor') and '1234,56' in csv and 'Material' in csv, f'[{rotulo}] exportação em CSV à portuguesa')

  # ---- acessos: o Bruno só vê o que lhe derem ----
  outro = ctx.browser.new_context(viewport=vp)
  pb = abrir(outro, mock, 'bruno@exemplo.pt', None, erros, rotulo + ' bruno')
  ir(pb, '/banco')
  expect(pb.get_by_role('heading', name='Olá, Bruno')).to_be_visible()
  if movel: pb.get_by_role('button', name='Mais').click()
  verifica(pb.locator('a[href="/banco"]').count() == 0 and pb.locator('a[href="/email"]').count() == 0, f'[{rotulo}] membro sem acesso não vê Email nem Banco')
  ir(pg, '/definicoes')
  eq = pg.locator('section', has=pg.get_by_role('heading', name='Equipa'))
  cx = eq.get_by_role('group', name='Acessos de Bruno Costa').get_by_role('checkbox', name='Banco'); cx.click(); expect(cx).to_be_checked()
  pg.wait_for_timeout(300)
  bruno = next(x for x in mock.d['membros'] if x['email'] == 'bruno@exemplo.pt')
  verifica(bruno['acessos'] == ['banco'], f'[{rotulo}] administradora dá acesso ao Banco ({bruno["acessos"]})')
  sem_scroll(pg, 'Definições com acessos', rotulo)
  ir(pb, '/banco')
  expect(pb.get_by_role('heading', name='Banco')).to_be_visible()
  expect(pb.locator('[data-movimento]').first).to_be_visible()
  verifica(pb.get_by_role('button', name='Ligar um banco').count() == 0, f'[{rotulo}] membro não liga bancos')
  outro.close()
  ctx.browser.close()

def historia_versao(p, rotulo, vp):
  """aviso de versão nova: aparece quando /versao.json muda, fecha-se, volta na verificação seguinte e Atualizar recarrega"""
  mock = Mock(semente_modulos)
  ctx = p.chromium.launch().new_context(viewport=vp)
  pg = abrir(ctx, mock, 'ana@exemplo.pt', None, erros, rotulo + ' versão')
  publicada = {'v': None}
  def versao(route):
    if publicada['v']: return route.fulfill(status=200, json={'versao': publicada['v']}, headers={'Cache-Control': 'no-store'})
    return route.continue_()
  pg.route(re.compile(r'.*/versao\.json(\?.*)?$'), versao)
  pedidos = []
  pg.on('request', lambda r: pedidos.append(r) if '/versao.json' in r.url else None)
  ir(pg, '/')
  pg.wait_for_timeout(400)
  aviso = pg.get_by_role('status', name='Nova versão')
  verifica(aviso.count() == 0, f'[{rotulo}] sem aviso quando a versão é a mesma')
  verifica(len(pedidos) >= 1 and all('?t=' in r.url for r in pedidos), f'[{rotulo}] verifica a versão ao abrir (sem cache)')
  publicada['v'] = 'outra-versao'
  pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  expect(aviso).to_contain_text('Há uma versão mais recente desta app.')
  sem_scroll(pg, 'aviso de versão', rotulo)
  caixa = aviso.bounding_box()
  verifica(caixa and caixa['y'] < 40 and caixa['x'] >= 0 and caixa['x'] + caixa['width'] <= vp['width'], f'[{rotulo}] aviso no topo, dentro do ecrã')
  aviso.get_by_role('button', name='Fechar aviso de versão').click()
  expect(aviso).to_have_count(0)
  pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  expect(aviso).to_be_visible()
  with pg.expect_navigation():
    aviso.get_by_role('button', name='Atualizar').click()
  verifica(True, f'[{rotulo}] Atualizar recarrega a página')
  ctx.browser.close()

def demo(s):
  # dados de exemplo só para as imagens do README
  s.d['definicoes'][0].update({'nome_negocio': 'Atelier Exemplo', 'cor': '#0f766e', 'email': 'ola@exemplo.pt', 'site': 'exemplo.pt'})
  s.novo('membros', {'email': 'ana@exemplo.pt', 'nome': 'Ana Silva', 'papel': 'admin', 'cor': '#0f766e'})
  s.novo('membros', {'email': 'rui@exemplo.pt', 'nome': 'Rui Lopes', 'cor': '#b45309'})
  hoje = dt.date.today(); d = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
  emp = {nome: s.novo('empresas', {'nome': nome})['id'] for nome in ['Café Central', 'Clínica Sorriso', 'Hotel Atlântico', 'Escola Nova', 'Loja do Bairro']}
  pessoas = [('Marta Ferreira', 'Café Central'), ('João Pires', 'Clínica Sorriso'), ('Sofia Matos', 'Hotel Atlântico'), ('Pedro Alves', 'Escola Nova'), ('Inês Rocha', 'Loja do Bairro'), ('Carlos Dias', 'Hotel Atlântico')]
  cs = [s.novo('contactos', {'nome': nome, 'empresa_id': emp[e], 'email': nome.split()[0].lower() + '@exemplo.pt', 'telefone': '91234567' + str(i), 'categoria': 'cliente'}) for i, (nome, e) in enumerate(pessoas)]
  negs = [('Identidade visual', 0, 'lead', 1800, 'Marcar reunião', d(0)), ('Site novo com loja', 1, 'conversa', 4200, 'Enviar exemplos', d(-1)), ('Fotografias do hotel', 2, 'proposta', 2650, 'Ligar para fechar', d(2)),
          ('Manual de marca', 3, 'negociacao', 3100, 'Rever desconto', d(1)), ('Montra de Natal', 4, 'ganho', 950, None, None), ('Brochura anual', 5, 'perdido', 1200, None, None), ('Campanha de verão', 2, 'lead', 2300, None, None)]
  for i, (t, c, e, v, pp, ppe) in enumerate(negs):
    n = s.novo('negocios', {'titulo': t, 'contacto_id': cs[c]['id'], 'empresa_id': cs[c]['empresa_id'], 'estado': e, 'valor': v, 'proximo_passo': pp, 'proximo_passo_em': ppe, 'responsavel': 'Ana Silva' if i % 2 == 0 else 'Rui Lopes', 'ordem': i, 'motivo_perda': 'Orçamento' if e == 'perdido' else None, 'data': d(10 + i * 4) if e in ('proposta', 'negociacao') else None})
    s.novo('atividades', {'negocio_id': n['id'], 'contacto_id': n['contacto_id'], 'tipo': 'nota', 'resumo': 'Entrou no pipeline', 'data': (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=20 if i == 6 else 2)).isoformat()})
  s.novo('agenda', {'titulo': 'Reunião com a Marta', 'inicio': f'{d(0)}T10:00:00+00:00', 'local': 'Café Central'})
  s.novo('agenda', {'titulo': 'Sessão fotográfica', 'tipo': 'servico', 'inicio': f'{d(3)}T09:00:00+00:00', 'dia_inteiro': True})
  s.novo('tarefas', {'titulo': 'Enviar fatura da montra', 'prazo': d(0), 'prioridade': 2, 'responsavel': 'Ana Silva'})
  s.novo('tarefas', {'titulo': 'Pedir logótipo em alta resolução', 'prazo': d(0), 'hora': '15:00'})
  s.novo('propostas', {'titulo': 'Fotografias do hotel', 'cliente_nome': 'Sofia Matos', 'cliente_empresa': 'Hotel Atlântico', 'estado': 'enviada', 'validade': d(20), 'token': 'abcdef0123456789abcdef01',
                       'introducao': 'Obrigado pelo seu interesse. Junto enviamos a nossa proposta, preparada a partir da nossa conversa.',
                       'linhas': [{'descricao': 'Sessão fotográfica (dia inteiro)', 'quantidade': 1, 'preco': 1800}, {'descricao': 'Edição de fotografias', 'quantidade': 40, 'preco': 18.5}, {'descricao': 'Deslocação', 'quantidade': 1, 'preco': 110}],
                       'desconto': 0, 'iva_pct': 23, 'condicoes': 'Valores sem IVA. Pagamento de 50% na adjudicação e o restante na entrega.'})

def fotos(p):
  b = p.chromium.launch()
  for nome, vp, caminho, email in [('inicio', {'width': 1440, 'height': 900}, '/', 'ana@exemplo.pt'), ('pipeline', {'width': 1440, 'height': 860}, '/pipeline', 'ana@exemplo.pt'), ('telemovel', {'width': 390, 'height': 844}, '/p/abcdef0123456789abcdef01', None)]:
    mock = Mock(demo); ctx = b.new_context(viewport=vp, device_scale_factor=1 if vp['width'] > 1000 else 2)
    pg = abrir(ctx, mock, email, None, erros, 'fotos'); ir(pg, caminho); pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(RAIZ, 'docs', f'{nome}.png'))
    ctx.close()
  b.close()

with sync_playwright() as p:
  for rotulo, vp in VISTAS:
    print(f'== {rotulo} {vp["width"]}px')
    for h in (historia, historia_modulos, historia_versao):
      if SO and h.__name__ not in SO: continue
      try: h(p, rotulo, vp)
      except Exception as e: falhas.append(f'[{rotulo}] {h.__name__} parou: {str(e)[:600]}'); print(f'  PAROU ({h.__name__}):', str(e)[:600])
  if FOTOS: fotos(p)

print(f'\n{len(ok)} verificações passaram, {len(falhas)} falharam, {len(erros)} erros na consola ou na página')
for f in falhas: print(' x', f)
for e in erros: print(' !', e)
sys.exit(1 if falhas or erros else 0)

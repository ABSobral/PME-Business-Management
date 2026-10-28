# Histórias de utilizador de ponta a ponta, no Chromium, com a API do Supabase simulada (tests/mock.py).
# Uso:  VITE_SUPABASE_URL=https://teste.supabase.co VITE_SUPABASE_KEY=teste npm run build && npx vite preview --port 4199 &
#       python3 tests/historias.py            (acrescente --fotos para gravar as imagens do README em docs/)
import os, re, sys, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from mock import Mock, URL, abrir, scroll_horizontal, HOJE
from playwright.sync_api import sync_playwright, expect

VISTAS = [('computador', {'width': 1440, 'height': 900}), ('telemovel', {'width': 390, 'height': 844}), ('pequeno', {'width': 360, 'height': 740})]
FOTOS = '--fotos' in sys.argv
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
    try: historia(p, rotulo, vp)
    except Exception as e: falhas.append(f'[{rotulo}] parou: {str(e)[:600]}'); print('  PAROU:', str(e)[:600])
  if FOTOS: fotos(p)

print(f'\n{len(ok)} verificações passaram, {len(falhas)} falharam, {len(erros)} erros na consola ou na página')
for f in falhas: print(' x', f)
for e in erros: print(' !', e)
sys.exit(1 if falhas or erros else 0)

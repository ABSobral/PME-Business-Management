# Simulação da API do Supabase (PostgREST, RPC e Auth) para testar a app no browser sem base de dados.
# Imita as regras do supabase/schema.sql que a app usa: primeira pessoa fica admin, histórico de mudança de fase,
# propostas públicas com validade e aceitação que passa o negócio a "ganho".
import base64, copy, json, os, re, time, uuid, datetime as dt, urllib.parse as up

URL = os.environ.get('URL_TESTE', 'http://localhost:4199')
CHAVE_SESSAO = 'gestao-auth'
AGORA = lambda: dt.datetime.now(dt.timezone.utc).isoformat()
HOJE = lambda: dt.date.today().isoformat()

FASES = [
  {"id": "lead", "nome": "Novo contacto", "cor": "cinza", "tipo": "aberto"},
  {"id": "conversa", "nome": "Em conversa", "cor": "azul", "tipo": "aberto"},
  {"id": "proposta", "nome": "Proposta enviada", "cor": "ambar", "tipo": "aberto"},
  {"id": "negociacao", "nome": "Em negociação", "cor": "violeta", "tipo": "aberto"},
  {"id": "ganho", "nome": "Ganho", "cor": "verde", "tipo": "ganho"},
  {"id": "perdido", "nome": "Perdido", "cor": "vermelho", "tipo": "perdido"},
]
DEFINICOES = {"id": 1, "nome_negocio": "O meu negócio", "logo_url": None, "cor": "#334155", "moeda": "EUR", "iva_pct": 23,
  "email": None, "telefone": None, "site": None, "morada": None, "nif": None, "estados": FASES,
  "proposta_intro": "Obrigado pelo seu interesse. Junto enviamos a nossa proposta.", "proposta_condicoes": "Valores sem IVA.", "proposta_validade_dias": 30,
  "modulo_email": False, "modulo_banco": False, "email_config": {}, "banco_config": {},
  "banco_categorias": ["Vendas", "Sinal de cliente", "Fornecedores", "Material", "Renda", "Comissões bancárias", "Outros"]}

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
def sessao(email, uid=None, nome=None):
  uid = uid or str(uuid.uuid5(uuid.NAMESPACE_DNS, email))
  meta = {"full_name": nome} if nome else {}
  jwt = b64({"alg": "HS256", "typ": "JWT"}) + "." + b64({"sub": uid, "email": email, "role": "authenticated", "aud": "authenticated", "exp": int(time.time()) + 360000, "user_metadata": meta}) + ".sig"
  return {"access_token": jwt, "refresh_token": "r", "token_type": "bearer", "expires_in": 360000, "expires_at": int(time.time()) + 360000,
          "user": {"id": uid, "email": email, "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": meta, "created_at": AGORA()}}

def email_do_pedido(req):
  a = req.headers.get('authorization', '')
  try:
    p = a.split(' ', 1)[1].split('.')[1]; p += '=' * (-len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p)).get('email', '').lower(), json.loads(base64.urlsafe_b64decode(p)).get('user_metadata', {})
  except Exception: return '', {}

PADROES = {
  'membros': lambda: {"cor": "#475569", "telefone": None, "papel": "membro", "ativo": True, "acessos": []},
  'movimentos': lambda: {"ligacao_id": None, "contraparte": None, "saldo": None, "origem": "extrato", "categoria": None, "negocio_id": None, "notas": None, "revisto": False, "revisto_por": None, "revisto_em": None},
  'empresas': lambda: {"tipo": "cliente", "setor": None, "site": None, "email": None, "telefone": None, "nif": None, "morada": None, "notas": None},
  'contactos': lambda: {"empresa_id": None, "cargo": None, "email": None, "telefone": None, "categoria": None, "origem": None, "responsavel": None, "notas": None},
  'negocios': lambda: {"estado": "lead", "contacto_id": None, "empresa_id": None, "valor": None, "data": None, "origem": None, "responsavel": None, "proximo_passo": None, "proximo_passo_em": None, "motivo_perda": None, "notas": None, "ordem": 0, "arquivado": False, "estado_desde": AGORA()},
  'atividades': lambda: {"negocio_id": None, "contacto_id": None, "tipo": "nota", "data": AGORA(), "autor": None},
  'agenda': lambda: {"tipo": "reuniao", "fim": None, "dia_inteiro": False, "local": None, "negocio_id": None, "contacto_id": None, "responsavel": None, "notas": None},
  'tarefas': lambda: {"feito": False, "feito_em": None, "prazo": None, "hora": None, "prioridade": 0, "responsavel": None, "notas": None, "negocio_id": None},
  'propostas': lambda: {"token": uuid.uuid4().hex[:24], "negocio_id": None, "cliente_nome": None, "cliente_empresa": None, "cliente_email": None, "introducao": None, "linhas": [], "desconto": 0, "iva_pct": 23, "moeda": "EUR", "condicoes": None, "validade": None, "estado": "rascunho", "enviada_em": None, "vista_em": None, "vistas": 0, "respondida_em": None, "respondida_por": None, "resposta": None, "criado_por": None},
}

class Mock:
  def __init__(s, semente=None):
    s.d = {t: [] for t in ['membros', 'empresas', 'contactos', 'negocios', 'atividades', 'agenda', 'tarefas', 'propostas', 'emails', 'email_pastas', 'banco_ligacoes', 'movimentos']}
    s.d['definicoes'] = [copy.deepcopy(DEFINICOES)]
    s.numero = 0; s.pedidos = []
    # módulos: segredos (o "Vault"), a caixa de correio simulada e o que foi enviado
    s.segredos = {}; s.enviados = []; s.funcoes = []
    s.correio = {'INBOX': [], 'Sent': [], 'Trash': []}; s.uid_seguinte = 1
    if semente: semente(s)

  # --- ajudas ---
  def novo(s, t, linha):
    x = {**PADROES.get(t, dict)(), **linha}
    x.setdefault('id', str(uuid.uuid4())); x.setdefault('criado_em', AGORA()); x.setdefault('atualizado_em', AGORA())
    if t == 'propostas' and not x.get('numero'): s.numero += 1; x['numero'] = s.numero
    if t == 'membros': x.pop('id', None); x['email'] = x['email'].lower()
    s.d[t].append(x); return x
  def autor(s, email): return next((m['nome'] for m in s.d['membros'] if m['email'] == email), 'Sistema')
  def mudar_negocio(s, n, campos, autor):
    if 'estado' in campos and campos['estado'] != n['estado']:
      s.novo('atividades', {"negocio_id": n['id'], "contacto_id": n.get('contacto_id'), "tipo": "estado", "resumo": f"{n['estado']} → {campos['estado']}", "autor": autor})
      n['estado_desde'] = AGORA()
    n.update(campos); n['atualizado_em'] = AGORA()

  def _teste(s, row, col, expr):
    op, _, v = expr.partition('.'); x = row.get(col)
    if op == 'eq': return (str(x).lower() == v.lower()) if isinstance(x, bool) else (x is not None and str(x) == v)
    if op == 'neq': return x is not None and str(x) != v
    if op == 'is': return (x is None) if v == 'null' else (x is (v == 'true'))
    if op in ('gt', 'gte', 'lt', 'lte'):
      if x is None: return False
      a, b = str(x), v
      return {'gt': a > b, 'gte': a >= b, 'lt': a < b, 'lte': a <= b}[op]
    if op == 'in': return str(x) in [i.strip('"') for i in v.strip('()').split(',')]
    return True
  def filtrar(s, rows, params):
    return [r for r in rows if all(s._teste(r, k, v) for k, vs in params.items() if k not in ('select', 'order', 'limit', 'offset', 'columns', 'on_conflict') for v in vs)]
  def ordenar(s, rows, params):
    for o in reversed(params.get('order', [''])[0].split(',')):
      if not o: continue
      col, *resto = o.split('.')
      rows = sorted(rows, key=lambda r: (r.get(col) is None, r.get(col) if isinstance(r.get(col), (int, float)) else str(r.get(col) or '')), reverse='desc' in resto)
    if params.get('limit'): rows = rows[:int(params['limit'][0])]
    return rows

  # --- funções (RPC) ---
  def rpc(s, f, b, email, meta):
    membro = next((m for m in s.d['membros'] if m['email'] == email and m['ativo']), None)
    if f == 'entrar_primeira_vez':
      if not email: return {"estado": "sem_sessao"}
      m = next((m for m in s.d['membros'] if m['email'] == email), None)
      if m: return {"estado": m['papel'] if m['ativo'] else 'inativo'}
      if s.d['membros']: return {"estado": "sem_acesso"}
      s.novo('membros', {"email": email, "nome": meta.get('full_name') or email.split('@')[0].title(), "papel": "admin"})
      return {"estado": "admin", "primeiro": True}
    if f == 'atualizar_perfil':
      if not membro: return False
      membro.update({"nome": b['p_nome'], "cor": b.get('p_cor') or membro['cor'], "telefone": b.get('p_telefone') or None}); return True
    admin = membro and membro['papel'] == 'admin'
    if f == 'guardar_segredo':
      if not admin: return ('erro', 403, {'code': '42501', 'message': 'Só os administradores guardam passwords e chaves.'})
      if b.get('p_nome') not in ('email_password', 'enablebanking_key'): return ('erro', 400, {'code': '23514', 'message': 'Nome de segredo não permitido.'})
      s.segredos[b['p_nome']] = b['p_valor']; return True
    if f == 'apagar_segredo':
      if not admin: return ('erro', 403, {'code': '42501', 'message': 'Só os administradores apagam passwords e chaves.'})
      s.segredos.pop(b.get('p_nome'), None); return True
    if f == 'segredo_existe': return bool(membro) and b.get('p_nome') in s.segredos
    if f == 'proposta_publica':
      p = next((p for p in s.d['propostas'] if p['token'] == b.get('p_token')), None)
      if not p or (p['estado'] == 'rascunho' and not membro): return None
      if not membro:
        p['vistas'] += 1; p['vista_em'] = p['vista_em'] or AGORA()
        if p['estado'] == 'enviada': p['estado'] = 'vista'
      d = s.d['definicoes'][0]
      r = {k: v for k, v in p.items() if k not in ('id', 'negocio_id', 'criado_por')}
      r['expirada'] = bool(p['validade'] and p['validade'] < HOJE())
      r['marca'] = {"nome": d['nome_negocio'], "logo_url": d['logo_url'], "cor": d['cor'], "email": d['email'], "telefone": d['telefone'], "site": d['site'], "morada": d['morada'], "nif": d['nif']}
      return r
    if f == 'proposta_responder':
      p = next((p for p in s.d['propostas'] if p['token'] == b.get('p_token')), None)
      nome = (b.get('p_nome') or '').strip(); aceita = b.get('p_aceita')
      if not p or p['estado'] == 'rascunho': return {"ok": False, "motivo": "nao_encontrada"}
      if p['estado'] in ('aceite', 'recusada'): return {"ok": False, "motivo": "ja_respondida"}
      if p['validade'] and p['validade'] < HOJE(): return {"ok": False, "motivo": "expirada"}
      if aceita and not nome: return {"ok": False, "motivo": "falta_nome"}
      p.update({"estado": "aceite" if aceita else "recusada", "respondida_em": AGORA(), "respondida_por": nome or None, "resposta": (b.get('p_resposta') or '').strip() or None})
      n = next((n for n in s.d['negocios'] if n['id'] == p['negocio_id']), None)
      if n:
        s.novo('atividades', {"negocio_id": n['id'], "contacto_id": n['contacto_id'], "tipo": "proposta", "resumo": f"Proposta nº {p['numero']} {'aceite' if aceita else 'recusada'}" + (f" por {nome}" if nome else ''), "autor": "Cliente"})
        if aceita:
          ganho = next((f['id'] for f in s.d['definicoes'][0]['estados'] if f['tipo'] == 'ganho'), n['estado'])
          base = max(0, sum(l['quantidade'] * l['preco'] for l in p['linhas']) - p['desconto'])
          s.mudar_negocio(n, {"estado": ganho, "valor": round(base, 2) if base > 0 else n['valor'], "motivo_perda": None}, 'Cliente')
      return {"ok": True}
    return None

  # --- encaminhar pedidos do browser ---
  def rota(s, route):
    r = route.request; u = up.urlparse(r.url); params = up.parse_qs(u.query, keep_blank_values=True)
    email, meta = email_do_pedido(r)
    acc = r.headers.get('accept', ''); um = 'vnd.pgrst.object' in acc
    if '/auth/v1/' in u.path:
      if u.path.endswith('/logout'): return route.fulfill(status=204, body='')
      return route.fulfill(status=200, json=sessao(email or 'x@exemplo.pt')['user'])
    m = re.search(r'/rest/v1/rpc/(\w+)', u.path)
    if m:
      b = json.loads(r.post_data or '{}'); s.pedidos.append(('RPC', m.group(1), b))
      res = s.rpc(m.group(1), b, email, meta)
      if isinstance(res, tuple) and res and res[0] == 'erro': return route.fulfill(status=res[1], json=res[2])
      return route.fulfill(status=200, json=res)
    m = re.search(r'/functions/v1/(\w+)', u.path)
    if m:
      if r.method == 'OPTIONS': return route.fulfill(status=200, headers=CORS, body='ok')
      b = json.loads(r.post_data or '{}'); s.funcoes.append((m.group(1), b.get('acao'), b))
      membro = next((x for x in s.d['membros'] if x['email'] == email and x['ativo']), None)
      try: estado, res = s.funcao(m.group(1), b, membro)
      except Exception as e: estado, res = 500, {'erro': f'mock: {e}'}
      return route.fulfill(status=estado, json=res, headers=CORS)
    m = re.search(r'/rest/v1/(\w+)', u.path)
    if not m: return route.fulfill(status=404, json={})
    t = m.group(1); L = s.d.setdefault(t, [])
    if r.method in ('GET', 'HEAD'):
      rows = s.ordenar(s.filtrar(L, params), params)
      if um:
        if len(rows) != 1: return route.fulfill(status=406, json={'code': 'PGRST116', 'message': 'JSON object requested, multiple (or no) rows returned', 'details': '', 'hint': None})
        return route.fulfill(status=200, json=rows[0])
      return route.fulfill(status=200, json=rows)
    body = json.loads(r.post_data or 'null'); s.pedidos.append((r.method, t, body))
    if r.method == 'DELETE':
      alvo = s.filtrar(L, params); s.d[t] = [x for x in L if x not in alvo]
      return route.fulfill(status=204, body='')
    if r.method == 'PATCH':
      alvo = s.filtrar(L, params)
      for x in alvo:
        if t == 'negocios': s.mudar_negocio(x, body, s.autor(email))
        else: x.update(body); x['atualizado_em'] = AGORA()
      return route.fulfill(status=200, json=(alvo[0] if alvo else None) if um else alvo)
    if r.method == 'POST':
      linhas = body if isinstance(body, list) else [body]
      conflito = params.get('on_conflict', [''])[0]
      if conflito and 'ignore-duplicates' in r.headers.get('prefer', ''):
        cols = conflito.split(',')
        linhas = [x for x in linhas if not any(all(y.get(c) == x.get(c) for c in cols) for y in L)]
      novos = [s.novo(t, x) for x in linhas]
      return route.fulfill(status=201, json=novos[0] if um else novos)
    return route.fulfill(status=405, json={})

CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'}
EMAIL_RE = re.compile(r'^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[^\s@<>(),;:"\[\]]{2,}$')

def _funcao(s, nome, b, membro):
  """Imita as Edge Functions "email" e "banco" (a lógica verdadeira está testada em tests/funcoes com deno)."""
  acao = b.get('acao')
  if not membro: return 401, {'erro': 'A sessão não é válida. Entre outra vez.'}
  admin = membro['papel'] == 'admin'
  d = s.d['definicoes'][0]
  if nome == 'email':
    if not (admin or 'email' in (membro.get('acessos') or [])): return 403, {'erro': 'Não tem acesso ao email. Peça a um administrador.'}
    if acao == 'testar':
      pw = b.get('password') or s.segredos.get('email_password')
      cfg = b.get('config') or d['email_config']
      if not cfg.get('imap_host'): return 400, {'erro': 'A configuração do email está incompleta.'}
      ok = pw == 'segredo'
      return 200, {'imap': None if ok else 'IMAP: o servidor recusou o utilizador ou a password. Confirme a password de aplicação.', 'smtp': None if ok else 'SMTP: o servidor recusou o utilizador ou a password. Confirme a password de aplicação.', 'pastas': 3 if ok else 0}
    if not d['modulo_email']: return 400, {'erro': 'O módulo de email está desligado em Definições.'}
    if not s.segredos.get('email_password'): return 400, {'erro': 'Falta a password do email.'}
    eu = (d['email_config'].get('endereco') or '').lower()
    especiais = {'INBOX': ('Entrada', 'entrada'), 'Sent': ('Sent', 'enviados'), 'Trash': ('Trash', 'lixo')}
    def sinc():
      novos = 0
      for caminho, msgs in s.correio.items():
        p = next((x for x in s.d['email_pastas'] if x['caminho'] == caminho), None)
        if not p:
          p = s.novo('email_pastas', {'caminho': caminho, 'nome': especiais[caminho][0], 'especial': especiais[caminho][1], 'ultimo_uid': 0, 'total': 0, 'nao_lidos': 0, 'sincronizada_em': None}); p.pop('id', None)
        for m in msgs:
          if m['uid'] > p['ultimo_uid']:
            outro = m['para'][0]['email'] if caminho == 'Sent' else m['de_email']
            c = next((x for x in s.d['contactos'] if (x.get('email') or '').lower() == outro), None)
            s.novo('emails', {**{k: v for k, v in m.items() if k not in ('texto', 'html', 'conteudo')}, 'pasta': caminho, 'texto': None, 'html': None, 'corpo_em': None, 'contacto_id': c['id'] if c else None})
            novos += 1
        p['ultimo_uid'] = max([p['ultimo_uid']] + [m['uid'] for m in msgs])
        p['total'] = len(msgs); p['nao_lidos'] = len([e for e in s.d['emails'] if e['pasta'] == caminho and not e['lido']]); p['sincronizada_em'] = AGORA()
      return novos
    def msg_de(e): return next((m for m in s.correio.get(e['pasta'], []) if m['uid'] == e['uid']), None)
    if acao == 'sincronizar': return 200, {'novos': sinc(), 'pastas': s.d['email_pastas']}
    ids = b.get('ids') or ([b['id']] if b.get('id') else [])
    es = [e for e in s.d['emails'] if e['id'] in ids]
    if acao == 'ler':
      if not es: return 404, {'erro': 'Email não encontrado.'}
      e = es[0]; m = msg_de(e) or {}
      e.update({'texto': m.get('texto'), 'html': m.get('html'), 'corpo_em': AGORA(), 'lido': True})
      return 200, e
    if acao == 'anexo':
      m = msg_de(es[0]) if es else None
      a = next((a for a in (m or {}).get('anexos', []) if a['parte'] == b.get('parte')), None)
      if not a: return 404, {'erro': 'Anexo não encontrado.'}
      return 200, {'nome': a['nome'], 'tipo': a['tipo'], 'base64': base64.b64encode(m['conteudo'][a['parte']]).decode()}
    if acao == 'marcar':
      for e in es: e['lido'] = b.get('lido') is not False
      return 200, {'ok': True, 'n': len(es)}
    if acao in ('mover', 'apagar'):
      destino = 'Trash' if acao == 'apagar' else b.get('destino')
      for e in es:
        m = msg_de(e)
        s.correio[e['pasta']] = [x for x in s.correio[e['pasta']] if x is not m]
        s.d['emails'] = [x for x in s.d['emails'] if x is not e]
        if m and not (acao == 'apagar' and e['pasta'] == 'Trash'):
          s.uid_seguinte += 1; s.correio[destino].append({**m, 'uid': s.uid_seguinte})
      return 200, {'ok': True, 'n': len(es)}
    if acao == 'enviar':
      todos = (b.get('para') or []) + (b.get('cc') or [])
      maus = [x for x in todos if not EMAIL_RE.match(x)]
      if not b.get('para'): return 400, {'erro': 'Falta pelo menos um destinatário.'}
      if maus: return 400, {'erro': 'Endereços inválidos: ' + ', '.join(maus)}
      s.enviados.append(b)
      s.uid_seguinte += 1
      s.correio['Sent'].append({'uid': s.uid_seguinte, 'message_id': f'<{uuid.uuid4()}@exemplo.pt>', 'in_reply_to': None, 'referencias': None, 'de_nome': d['email_config'].get('nome_remetente'), 'de_email': eu,
        'para': [{'nome': None, 'email': x} for x in b['para']], 'cc': [{'nome': None, 'email': x} for x in (b.get('cc') or [])], 'assunto': b.get('assunto') or '', 'data': AGORA(), 'lido': True, 'respondido': False,
        'anexos': [{'parte': str(i + 2), 'nome': a['nome'], 'tipo': a.get('tipo') or '', 'tamanho': len(a['base64']) * 3 // 4} for i, a in enumerate(b.get('anexos') or [])], 'resumo': (b.get('texto') or '')[:200], 'texto': b.get('texto'), 'html': None})
      if b.get('responder_a'):
        for e in s.d['emails']:
          if e['id'] == b['responder_a']: e['respondido'] = True
      n = 0
      for c in s.d['contactos']:
        if (c.get('email') or '').lower() in [x.lower() for x in todos]:
          neg = b.get('negocio_id') or next((x['id'] for x in s.d['negocios'] if x['contacto_id'] == c['id'] and not x['arquivado']), None)
          s.novo('atividades', {'tipo': 'email', 'resumo': f"Email enviado: {b.get('assunto') or '(sem assunto)'}", 'contacto_id': c['id'], 'negocio_id': neg, 'autor': membro['nome']}); n += 1
      sinc()
      return 200, {'ok': True, 'message_id': '<x@exemplo.pt>', 'atividades': n, 'avisos': []}
    return 400, {'erro': 'Ação desconhecida.'}
  if nome == 'banco':
    if not (admin or 'banco' in (membro.get('acessos') or [])): return 403, {'erro': 'Não tem acesso ao banco. Peça a um administrador.'}
    cfg = d['banco_config']
    if acao == 'configurado': return 200, {'app_id': bool(cfg.get('app_id')), 'chave': 'enablebanking_key' in s.segredos}
    if acao in ('bancos', 'iniciar', 'concluir', 'escolher', 'desligar') and not admin: return 403, {'erro': 'Só os administradores ligam e desligam o banco.'}
    if not cfg.get('app_id') or 'enablebanking_key' not in s.segredos: return 400, {'erro': 'Falta a chave privada do Enable Banking em Definições.'}
    if acao == 'bancos':
      return 200, {'bancos': [{'nome': 'Banco Exemplo', 'pais': b.get('pais') or 'PT', 'logo': None, 'psu_types': ['business', 'personal'], 'dias': 180}, {'nome': 'Caixa Teste', 'pais': 'PT', 'logo': None, 'psu_types': ['personal'], 'dias': 90}]}
    if acao == 'iniciar':
      s.d['banco_ligacoes'] = [x for x in s.d['banco_ligacoes'] if x['estado'] != 'pendente']
      l = s.novo('banco_ligacoes', {'banco': b.get('banco'), 'pais': b.get('pais') or 'PT', 'psu_type': b.get('psu_type') or 'business', 'estado': 'pendente', 'iban': None, 'nome_conta': None, 'moeda': None, 'valido_ate': None, 'saldo_atual': None, 'saldo_em': None, 'ultima_sinc': None, 'ultimo_erro': None, 'criado_por': membro['nome']})
      # o banco "devolve" logo a pessoa à app (no Enable Banking seria depois de entrar no site do banco)
      return 200, {'url': f"{URL}/banco?code=codigo-teste&state={l['id']}"}
    if acao == 'concluir':
      l = next((x for x in s.d['banco_ligacoes'] if x['id'] == b.get('state') and x['estado'] == 'pendente'), None)
      if not l or b.get('code') != 'codigo-teste': return 400, {'erro': 'Esta autorização já não é válida. Volte a ligar o banco.'}
      validade = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=180)).isoformat()
      l.update({'estado': 'ativa', 'iban': 'PT50000100000000000000001', 'nome_conta': 'Conta à ordem', 'moeda': 'EUR', 'valido_ate': validade, 'saldo_atual': 1500.25, 'saldo_em': AGORA(), 'ultima_sinc': AGORA()})
      hoje = dt.date.today()
      for i, (desc, contra, valor) in enumerate([('TRF CLIENTE', 'Cliente Lda', 1234.56), ('COMPRA PAPELARIA', 'Papelaria Central', -12.5), ('PAGAMENTO TELECOM', 'Telecom', -40.0)]):
        s.novo('movimentos', {'ligacao_id': l['id'], 'data': (hoje - dt.timedelta(days=i)).isoformat(), 'valor': valor, 'descritivo': desc, 'contraparte': contra, 'origem': 'enablebanking', 'hash': uuid.uuid4().hex})
      return 200, {'escolher': False, 'novos': 3, 'saldo': 1500.25, 'valido_ate': validade}
    if acao == 'sincronizar':
      if not d['modulo_banco']: return 400, {'erro': 'O módulo Banco está desligado em Definições.'}
      for l in s.d['banco_ligacoes']:
        if l['estado'] == 'ativa': l['ultima_sinc'] = AGORA()
      return 200, {'res': [{'ligacao': l['id'], 'novos': 0} for l in s.d['banco_ligacoes'] if l['estado'] == 'ativa']}
    if acao == 'desligar':
      s.d['banco_ligacoes'] = [x for x in s.d['banco_ligacoes'] if x['id'] != b.get('ligacao_id')]
      return 200, {'ok': True}
    return 400, {'erro': 'Ação desconhecida.'}
  return 404, {'erro': 'Função desconhecida.'}
Mock.funcao = lambda s, nome, b, membro: _funcao(s, nome, b, membro)

def correio_exemplo(s):
  """Caixa de entrada com dois emails da Rita (texto com citação e anexo) e uma newsletter em HTML."""
  agora = dt.datetime.now(dt.timezone.utc)
  def msg(assunto, de_nome, de_email, texto, html=None, anexos=None, horas=1, lido=False):
    s.uid_seguinte += 1
    conteudo = {}
    meta = []
    for i, (nome, tipo, dados) in enumerate(anexos or []):
      parte = str(i + 2); conteudo[parte] = dados; meta.append({'parte': parte, 'nome': nome, 'tipo': tipo, 'tamanho': len(dados)})
    s.correio['INBOX'].append({'uid': s.uid_seguinte, 'message_id': f'<{uuid.uuid4()}@padaria.pt>', 'in_reply_to': None, 'referencias': None, 'de_nome': de_nome, 'de_email': de_email,
      'para': [{'nome': 'Ana Silva', 'email': 'ana@exemplo.pt'}], 'cc': [], 'assunto': assunto, 'data': (agora - dt.timedelta(hours=horas)).isoformat(), 'lido': lido, 'respondido': False,
      'anexos': meta, 'resumo': ' '.join(l for l in texto.splitlines() if not l.startswith('>'))[:200], 'texto': texto, 'html': html, 'conteudo': conteudo})
  msg('Pedido de orçamento', 'Rita Gonçalves', 'rita@padaria.pt', 'Olá Ana,\nqueria um orçamento para 3 bolos de aniversário.\n\nObrigada,\nRita\n\nEm 20 de outubro, Ana Silva escreveu:\n> Olá Rita, diga-nos do que precisa.', anexos=[('lista.pdf', 'application/pdf', b'%PDF-1.4 lista')], horas=1)
  msg('Novidades da semana', 'Fornecedor de Farinhas', 'novidades@farinhas.pt', 'Novos produtos esta semana.', html='<h1>Novidades</h1><p>Farinha <b>T65</b> com desconto.</p><blockquote>Mensagem antiga citada</blockquote><script>window.parent.alert(1)</script>', horas=30, lido=True)

def abrir(contexto, mock, email=None, nome=None, erros=None, rotulo=''):
  pg = contexto.new_page()
  if erros is not None:
    pg.on('pageerror', lambda e: erros.append(f'[{rotulo}] erro na página: {e}'))
    pg.on('console', lambda m: erros.append(f'[{rotulo}] consola: {m.text[:300]}') if m.type == 'error' else None)
  pg.route(re.compile(r'.*\.supabase\.co/.*'), mock.rota)
  pg.goto(URL + '/nada')
  if email: pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_SESSAO, json.dumps(sessao(email, nome=nome))])
  return pg

def scroll_horizontal(pg):
  return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')

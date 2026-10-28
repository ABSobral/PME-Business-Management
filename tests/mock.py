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
  "proposta_intro": "Obrigado pelo seu interesse. Junto enviamos a nossa proposta.", "proposta_condicoes": "Valores sem IVA.", "proposta_validade_dias": 30}

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
  'membros': lambda: {"cor": "#475569", "telefone": None, "papel": "membro", "ativo": True},
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
    s.d = {t: [] for t in ['membros', 'empresas', 'contactos', 'negocios', 'atividades', 'agenda', 'tarefas', 'propostas']}
    s.d['definicoes'] = [copy.deepcopy(DEFINICOES)]
    s.numero = 0; s.pedidos = []
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
      return route.fulfill(status=200, json=s.rpc(m.group(1), b, email, meta))
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
      novos = [s.novo(t, x) for x in (body if isinstance(body, list) else [body])]
      return route.fulfill(status=201, json=novos[0] if um else novos)
    return route.fulfill(status=405, json={})

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

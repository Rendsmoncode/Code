// Faux serveur Supabase en mémoire, utilisé par les tests (aucune donnée réelle).
// Faux serveur Supabase en mémoire, branché via page.route.
export function makeMock() {
  const st = { users: {}, profiles: {}, cards: {}, starters: {}, coll: {}, decks: {}, tokens: {}, invites: {}, stats: {}, ach: {} };
  const grantStarter = (uid, sid, reveal = false) => {
    const s = st.starters[sid]; if (!s) return;
    add(uid, s.leader, 1); for (const [k, v] of Object.entries(s.cards)) add(uid, k, v);
    if (reveal) (st.reveals ||= {})[uid] = [...(st.reveals[uid] || []), { id: s.leader, n: 1, new: true }, ...Object.entries(s.cards).map(([id, n]) => ({ id, n, new: true }))];
    const id = 'deck-' + Math.random(); st.decks[id] = { id, user_id: uid, name: s.name, leader: s.leader, cards: s.cards };
    st.profiles[uid].starter_claimed = true;
  };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const session = (u) => ({ access_token: 'tok-' + u.id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: u });
  const uidOf = (req) => (req.headers()['authorization'] || '').replace('Bearer tok-', '');
  const R = ['C', 'UC', 'R', 'UR', 'L', 'S'];
  const pick = (r) => { for (let i = R.indexOf(r); i >= 0; i--) { const l = Object.values(st.cards).filter((c) => c.in_boosters && c.rarity === R[i]); if (l.length) return l[Math.floor(Math.random() * l.length)].id; } return Object.keys(st.cards)[0]; };
  const add = (uid, id, n) => { st.coll[uid] ||= {}; st.coll[uid][id] = (st.coll[uid][id] || 0) + n; };
  const status = (p) => ({ username: p.username, role: p.role, free: p.free, free_max: 6, gifted: p.boosters, next_free_at: p.free < 6 ? new Date(Date.now() + 65000).toISOString() : null, starter_claimed: p.starter_claimed, surprise: p.surprise || null, packs: (p.packs || []).map((x) => ({ r: x.r, n: x.cards.length, opened: Boolean(x.opened) })), now: new Date().toISOString() });
  async function handle(route) {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname; const m = req.method();
    const body = req.postData() ? (() => { try { return JSON.parse(req.postData()); } catch { return null; } })() : null;
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const uid = uidOf(req); const p = st.profiles[uid];
    if (path === '/auth/v1/signup') {
      const name = body.data.username; if (Object.values(st.profiles).some((x) => x.username === name)) return json(route, { msg: 'User already registered', error_code: 'user_already_exists' }, 422);
      const first = !Object.keys(st.profiles).length;
      const inv = st.invites[body.data.invite];
      if (!first && (!inv || inv.used_by || inv.username !== name)) return json(route, { msg: 'Database error saving new user' }, 500);
      const id = 'u' + (Object.keys(st.users).length + 1); const u = { id, email: body.email, aud: 'authenticated', role: 'authenticated', user_metadata: { username: name }, app_metadata: {}, created_at: new Date().toISOString() };
      st.users[id] = { u, pw: body.password }; st.profiles[id] = { username: name, role: first ? 'owner' : 'player', boosters: inv ? inv.boosters : 0, free: first ? 6 : 0, starter_claimed: false, surprise: inv?.surprise ? 'wait' : null, packs: inv?.packs || null };
      if (inv) { inv.used_by = id; inv.used_at = new Date().toISOString(); if (inv.starter_id) grantStarter(id, inv.starter_id, inv.surprise); }
      return json(route, session(u));
    }
    if (path === '/auth/v1/token') { const e = Object.values(st.users).find((x) => x.u.email === body.email && x.pw === body.password); return e ? json(route, session(e.u)) : json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400); }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path === '/auth/v1/user' && m === 'PUT') { st.users[uid].pw = body.password; return json(route, st.users[uid].u); }
    if (path === '/auth/v1/user') return json(route, st.users[uid].u);
    if (path === '/storage/v1/object/sign/cards') return json(route, (body.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/cards/${p}?token=t`, signedUrl: `https://mock.supabase.co/storage/v1/object/sign/cards/${p}?token=t`, error: null })));
    if (path === '/storage/v1/object/list/cards') return json(route, (st.files || []).filter((f) => f.startsWith(`${body.prefix}/`)).map((f) => ({ name: f.slice(body.prefix.length + 1), id: f })).sort((a, b) => (a.name < b.name ? 1 : -1)));
    if (path === '/storage/v1/object/cards' && route.request().method() === 'DELETE') { st.files = (st.files || []).filter((f) => !(body.prefixes || []).includes(f)); return json(route, []); }
    if (path.startsWith('/storage/v1/object/cards/')) { const f = decodeURIComponent(path.slice('/storage/v1/object/cards/'.length)); (st.files ||= []).push(f); return json(route, { Key: 'cards/' + f, Id: 'x' }); }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop();
      if (fn === 'booster_status') return json(route, status(p));
      const stats = () => (st.stats[uid] ||= { boosters_opened: 0, best_batch: 0, wins: 0, games: 0, best_win_streak: 0, win_streak: 0, perfect_wins: 0, comeback_wins: 0, beaten: [], god_packs: 0, max_dry_streak: 0, two_legends: false });
      const openOne = (giftOnly = false) => { if (p.free > 0 && !giftOnly) p.free--; else if (p.boosters > 0) p.boosters--; else return null;
        const roll = Math.random(); const god = st.god === true; const slots = god ? ['L', 'L', 'L', 'L', 'L'] : ['C', 'C', 'C', 'UC', st.force || (roll < 0.3 ? 'S' : roll < 0.6 ? 'L' : 'R')];
        stats().boosters_opened++; if (god) { stats().god_packs++; st.god = false; }
        return slots.map((r) => { const id = pick(r); const isNew = !st.coll[uid]?.[id]; add(uid, id, 1); return { id, new: isNew, god }; }); };
      if (fn === 'open_booster') { const r = openOne(); return r ? json(route, r) : json(route, { message: 'Aucun booster disponible pour le moment.' }, 400); }
      if (fn === 'open_boosters') { if (body.n > 10 && p.boosters < body.n) return json(route, { message: 'Au-delà de 10, on ne peut ouvrir d\'un coup que des boosters offerts.' }, 400);
        const out = []; for (let i = 0; i < body.n; i++) { const r = openOne(body.n > 10); if (!r) { if (!i) return json(route, { message: 'Aucun booster disponible pour le moment.' }, 400); break; } out.push(...r); }
        stats().best_batch = Math.max(stats().best_batch, out.length / 5); return json(route, out); }
      const owner = p?.role === 'owner'; const tu = () => Object.keys(st.profiles).find((k) => st.profiles[k].username === body.target);
      if (fn.startsWith('gm_') && !owner) return json(route, { message: 'Réservé au propriétaire.' }, 400);
      if (fn === 'gm_collection') return json(route, Object.entries(st.coll[tu()] || {}).map(([card_id, qty]) => ({ card_id, qty })));
      if (fn === 'take_reveals') { const r = (st.reveals ||= {})[uid] || []; st.reveals[uid] = []; return json(route, r); }
      if (fn === 'gm_add_card') { const u = tu(); const c = (st.coll[u] ||= {}); if (body.delta > 0) ((st.reveals ||= {})[u] ||= []).push({ id: body.cid, n: body.delta, new: !c[body.cid] }); const n = (c[body.cid] || 0) + body.delta; if (n <= 0) delete c[body.cid]; else c[body.cid] = n; return json(route, Math.max(0, n)); }
      if (fn === 'gm_reset_collection') { const u = tu(); st.backups ||= []; st.backups.unshift({ id: st.backups.length + 1, username: body.target, user: u, cards: { ...(st.coll[u] || {}) }, created_at: new Date().toISOString(), restored_at: null }); st.coll[u] = {}; return json(route, st.backups[0].id); }
      if (fn === 'gm_restore_backup') { const b = st.backups.find((x) => x.id === body.bid); const c = (st.coll[b.user] ||= {}); for (const [k, v] of Object.entries(b.cards)) c[k] = (c[k] || 0) + v; b.restored_at = new Date().toISOString(); return json(route, Object.keys(b.cards).length); }
      if (fn === 'gm_backups') return json(route, (st.backups || []).map((b) => ({ id: b.id, username: b.username, nb: Object.keys(b.cards).length, total: Object.values(b.cards).reduce((x, y) => x + y, 0), created_at: b.created_at, restored_at: b.restored_at })));
      if (fn === 'record_game') { const s = stats(); s.games++; if (body.won) { s.wins++; s.win_streak++; } else s.win_streak = 0; s.best_win_streak = Math.max(s.best_win_streak, s.win_streak); return json(route, null); }
      if (fn === 'check_achievements') { const s = stats(); const own = Object.keys(st.coll[uid] || {}).map((id) => st.cards[id]); const ach = (st.ach[uid] ||= {});
        const rules = [['open1', s.boosters_opened >= 1, 1], ['open10', s.boosters_opened >= 10, 1], ['batch10', s.best_batch >= 10, 2], ['win1', s.wins >= 1, 1], ['god', s.god_packs >= 1, 10],
          ['firstUR', own.some((c) => c.rarity === 'UR'), 1], ['firstL', own.some((c) => c.rarity === 'L'), 2], ['leg1', own.some((c) => c.rarity === 'L'), 2], ['own25', own.length >= 25, 1]];
        const fresh = rules.filter(([c, ok]) => ok && !ach[c]).map(([code, , reward]) => { ach[code] = new Date().toISOString(); p.boosters += reward; return { code, reward }; });
        return json(route, fresh); }
      if (fn === 'claim_starter') { const s = st.starters[body.starter_id]; if (st.starterReveal) (st.reveals ||= {})[uid] = [{ id: s.leader, n: 1, new: true }, ...Object.entries(s.cards).map(([id, n]) => ({ id, n, new: true }))]; add(uid, s.leader, 1); for (const [k, v] of Object.entries(s.cards)) add(uid, k, v); const id = 'deck-' + Date.now(); st.decks[id] = { id, user_id: uid, name: s.name, leader: s.leader, cards: s.cards }; p.starter_claimed = true; return json(route, id); }
      if (fn === 'admin_give_boosters') { if (!['admin', 'owner'].includes(p.role)) return json(route, { message: 'Réservé aux admins.' }, 400); const t = Object.values(st.profiles).filter((x) => body.target == null || x.username === body.target); t.forEach((x) => { x.boosters += body.amount; }); return json(route, t.length); }
      if (fn === 'one_of_one_owners') return json(route, Object.entries(st.coll).flatMap(([u, c]) => Object.keys(c).filter((id) => st.cards[id]?.rarity === 'S').map((id) => ({ card_id: id, username: st.profiles[u]?.username }))));
      if (fn === 'invite_info') { const v = st.invites[body.t]; return json(route, v && !v.used_by ? { username: v.username, boosters: v.boosters, surprise: Boolean(v.surprise), starter: st.starters[v.starter_id]?.name || null } : null); }
      if (fn === 'admin_create_invite') {
        if (!['admin', 'owner'].includes(p?.role)) return json(route, { message: 'Réservé aux admins.' }, 400);
        const u = body.uname.trim().toLowerCase();
        if (Object.values(st.profiles).some((x) => x.username === u)) return json(route, { message: 'Ce pseudo est déjà pris par un joueur.' }, 400);
        const token = crypto.randomUUID(); st.invites[token] = { token, username: u, starter_id: body.starter || null, boosters: body.nb, used_by: null, created_at: new Date().toISOString() };
        return json(route, token);
      }
      if (fn === 'admin_create_surprise') {
        const u = body.uname.trim().toLowerCase();
        if (Object.values(st.profiles).some((x) => x.username === u)) return json(route, { message: 'Ce pseudo est déjà pris par un joueur.' }, 400);
        const token = crypto.randomUUID(); st.invites[token] = { token, username: u, starter_id: body.starter || null, boosters: body.nb, used_by: null, surprise: true, created_at: new Date().toISOString() };
        return json(route, token);
      }
      if (fn === 'admin_surprise_list') return json(route, [...Object.values(st.profiles).filter((x) => x.surprise).map((x) => ({ username: x.username, state: x.surprise })),
        ...Object.values(st.invites).filter((i) => i.surprise && !i.used_by).map((i) => ({ username: i.username, state: 'invite', packs: (i.packs || []).length, starter: st.starters[i.starter_id]?.leader }))]);
      if (fn === 'admin_surprise_go') { const t = Object.values(st.profiles).filter((x) => x.surprise === 'wait' && (body.target == null || x.username === body.target)); t.forEach((x) => { x.surprise = 'go'; }); return json(route, t.length); }
      if (fn === 'admin_set_packs') { const u = tu(); if (u) st.profiles[u].packs = body.packs; else { const i = Object.values(st.invites).find((x) => x.username === body.target && !x.used_by); if (!i) return json(route, { message: 'introuvable' }, 400); i.packs = body.packs; } return json(route, null); }
      if (fn === 'open_surprise_pack') { const pk = (p.packs || [])[body.i]; if (!pk || pk.opened) return json(route, { message: 'Booster déjà ouvert.' }, 400);
        const out = pk.cards.map((id) => { const isNew = !st.coll[uid]?.[id]; add(uid, id, 1); return { id, new: isNew }; }); pk.opened = true; return json(route, out); }
      if (fn === 'surprise_done') { if (p.surprise === 'go') p.surprise = 'done'; return json(route, null); }
      if (fn === 'admin_reset_test') { const u = tu(); const t = st.profiles[u]; if (!t || !t.username.startsWith('test')) return json(route, { message: 'Réservé aux comptes de test.' }, 400);
        st.coll[u] = {}; (st.reveals ||= {})[u] = []; for (const k of Object.keys(st.decks)) if (st.decks[k].user_id === u) delete st.decks[k];
        Object.assign(t, { surprise: 'wait', starter_claimed: false, boosters: body.nb, free: 0 }); (t.packs || []).forEach((x) => { x.opened = false; }); if (body.starter) grantStarter(u, body.starter, true); return json(route, null); }
      if (fn === 'admin_set_role') { const t = Object.values(st.profiles).find((x) => x.username === body.target); t.role = body.new_role; return json(route, null); }
    }
    const table = path.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const map = { cards: st.cards, starter_decks: st.starters, decks: st.decks };
    if (table === 'profiles') return json(route, Object.values(st.profiles).map((x) => ({ username: x.username, role: x.role, boosters: x.boosters, created_at: '' })));
    if (table === 'invites') {
      if (m === 'DELETE') { delete st.invites[url.searchParams.get('token').replace('eq.', '')]; return route.fulfill({ status: 204 }); }
      return json(route, Object.values(st.invites));
    }
    if (table === 'stats') { const v = st.stats[uid] || null; return single ? (v ? json(route, v) : json(route, null)) : json(route, v ? [v] : []); }
    if (table === 'achievements') return json(route, Object.entries(st.ach[uid] || {}).map(([code, unlocked_at]) => ({ code, unlocked_at })));
    if (table === 'collection') return json(route, Object.entries(st.coll[uid] || {}).map(([card_id, qty]) => ({ card_id, qty })));
    if (map[table]) {
      const store = map[table];
      const mine = (r) => table !== 'decks' || r.user_id === uid;
      if (m === 'GET') return json(route, Object.values(store).filter(mine));
      if (m === 'POST') { if (table === 'cards' && !['admin', 'owner'].includes(p.role)) return json(route, { message: 'new row violates row-level security policy' }, 403);
        const rows = Array.isArray(body) ? body : [body]; rows.forEach((r) => { store[r.id] = { ...store[r.id], ...r, ...(table === 'decks' ? { user_id: uid } : {}) }; });
        const out = rows.map((r) => store[r.id]); return json(route, single ? out[0] : out, 201); }
      if (m === 'DELETE') { const id = url.searchParams.get('id').replace('eq.', ''); delete store[id]; return route.fulfill({ status: 204 }); }
    }
    return json(route, { message: 'mock: non géré ' + m + ' ' + path }, 404);
  }
  return { st, handle };
}

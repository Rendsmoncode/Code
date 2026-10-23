// Faux serveur Supabase en mémoire, utilisé par les tests (aucune donnée réelle).
// Faux serveur Supabase en mémoire, branché via page.route.
export function makeMock() {
  const st = { users: {}, profiles: {}, cards: {}, starters: {}, coll: {}, decks: {}, tokens: {}, invites: {}, stats: {}, ach: {} };
  const grantStarter = (uid, sid) => {
    const s = st.starters[sid]; if (!s) return;
    add(uid, s.leader, 1); for (const [k, v] of Object.entries(s.cards)) add(uid, k, v);
    const id = 'deck-' + Math.random(); st.decks[id] = { id, user_id: uid, name: s.name, leader: s.leader, cards: s.cards };
    st.profiles[uid].starter_claimed = true;
  };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const session = (u) => ({ access_token: 'tok-' + u.id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: u });
  const uidOf = (req) => (req.headers()['authorization'] || '').replace('Bearer tok-', '');
  const R = ['C', 'UC', 'R', 'UR', 'L', 'S'];
  const pick = (r) => { for (let i = R.indexOf(r); i >= 0; i--) { const l = Object.values(st.cards).filter((c) => c.in_boosters && c.rarity === R[i]); if (l.length) return l[Math.floor(Math.random() * l.length)].id; } return Object.keys(st.cards)[0]; };
  const add = (uid, id, n) => { st.coll[uid] ||= {}; st.coll[uid][id] = (st.coll[uid][id] || 0) + n; };
  const status = (p) => ({ username: p.username, role: p.role, free: p.free, free_max: 6, gifted: p.boosters, next_free_at: p.free < 6 ? new Date(Date.now() + 65000).toISOString() : null, starter_claimed: p.starter_claimed, now: new Date().toISOString() });
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
      st.users[id] = { u, pw: body.password }; st.profiles[id] = { username: name, role: first ? 'owner' : 'player', boosters: inv ? inv.boosters : 0, free: first ? 6 : 0, starter_claimed: false };
      if (inv) { inv.used_by = id; inv.used_at = new Date().toISOString(); if (inv.starter_id) grantStarter(id, inv.starter_id); }
      return json(route, session(u));
    }
    if (path === '/auth/v1/token') { const e = Object.values(st.users).find((x) => x.u.email === body.email && x.pw === body.password); return e ? json(route, session(e.u)) : json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400); }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path === '/auth/v1/user') return json(route, st.users[uid].u);
    if (path === '/storage/v1/object/sign/cards') return json(route, (body.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/cards/${p}?token=t`, signedUrl: `https://mock.supabase.co/storage/v1/object/sign/cards/${p}?token=t`, error: null })));
    if (path.startsWith('/storage/v1/object/cards/')) return json(route, { Key: 'cards/' + path.split('/').pop(), Id: 'x' });
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
      if (fn === 'record_game') { const s = stats(); s.games++; if (body.won) { s.wins++; s.win_streak++; } else s.win_streak = 0; s.best_win_streak = Math.max(s.best_win_streak, s.win_streak); return json(route, null); }
      if (fn === 'check_achievements') { const s = stats(); const own = Object.keys(st.coll[uid] || {}).map((id) => st.cards[id]); const ach = (st.ach[uid] ||= {});
        const rules = [['open1', s.boosters_opened >= 1, 1], ['open10', s.boosters_opened >= 10, 1], ['batch10', s.best_batch >= 10, 2], ['win1', s.wins >= 1, 1], ['god', s.god_packs >= 1, 10],
          ['firstUR', own.some((c) => c.rarity === 'UR'), 1], ['firstL', own.some((c) => c.rarity === 'L'), 2], ['leg1', own.some((c) => c.rarity === 'L'), 2], ['own25', own.length >= 25, 1]];
        const fresh = rules.filter(([c, ok]) => ok && !ach[c]).map(([code, , reward]) => { ach[code] = new Date().toISOString(); p.boosters += reward; return { code, reward }; });
        return json(route, fresh); }
      if (fn === 'claim_starter') { const s = st.starters[body.starter_id]; add(uid, s.leader, 1); for (const [k, v] of Object.entries(s.cards)) add(uid, k, v); const id = 'deck-' + Date.now(); st.decks[id] = { id, user_id: uid, name: s.name, leader: s.leader, cards: s.cards }; p.starter_claimed = true; return json(route, id); }
      if (fn === 'admin_give_boosters') { if (!['admin', 'owner'].includes(p.role)) return json(route, { message: 'Réservé aux admins.' }, 400); const t = Object.values(st.profiles).filter((x) => body.target == null || x.username === body.target); t.forEach((x) => { x.boosters += body.amount; }); return json(route, t.length); }
      if (fn === 'one_of_one_owners') return json(route, []);
      if (fn === 'invite_info') { const v = st.invites[body.t]; return json(route, v && !v.used_by ? { username: v.username, boosters: v.boosters, starter: st.starters[v.starter_id]?.name || null } : null); }
      if (fn === 'admin_create_invite') {
        if (!['admin', 'owner'].includes(p?.role)) return json(route, { message: 'Réservé aux admins.' }, 400);
        const u = body.uname.trim().toLowerCase();
        if (Object.values(st.profiles).some((x) => x.username === u)) return json(route, { message: 'Ce pseudo est déjà pris par un joueur.' }, 400);
        const token = crypto.randomUUID(); st.invites[token] = { token, username: u, starter_id: body.starter || null, boosters: body.nb, used_by: null, created_at: new Date().toISOString() };
        return json(route, token);
      }
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

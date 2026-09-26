/* ============================================================
   Үг Таа — Монгол үг таах тоглоом
   index.js — v7
   ------------------------------------------------------------
   Бүтэц:
     1. Туслах функцууд (DOM, HTML escape, формат, хадгалалт)
     2. API
     3. UI суурь: Toast, Modal, confetti, цаг
     4. Нэвтрэлт + нүүр хуудас
     5. Router
     6. Тоглоом: гар, талбар, логик, үр дүн
     7. Хуудсууд: дасгал, шилдэг, тэмцээн, хэтэвч, профайл,
        найз урих, premium, админ
     8. Эхлүүлэх
   ============================================================ */
'use strict';

(() => {
  const VERSION = '7.5.0';

  /* ============================================================
     1. ТУСЛАХ ФУНКЦУУД
     ============================================================ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  /** Аюулгүй HTML: ${...} доторх бүх утга автоматаар escape хийгдэнэ. */
  class Safe {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  const raw = (s) => new Safe(String(s));
  const toHtml = (v) => {
    if (v == null || v === false || v === true) return '';
    if (v instanceof Safe) return v.s;
    if (Array.isArray(v)) return v.map(toHtml).join('');
    return esc(v);
  };
  const html = (strings, ...vals) =>
    new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? toHtml(vals[i]) : ''), ''));

  const fmt = (n) => {
    const x = Math.round(Number(n) || 0);
    const s = Math.abs(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (x < 0 ? '−' : '') + s;
  };
  const money = (n) => fmt(n) + '₮';
  const signedMoney = (n) => (n > 0 ? '+' : '') + money(n);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
  const ymd = (s) => String(s || '').slice(0, 10).split('-').map(Number);
  const fmtDate = (s) => { const [, m, d] = ymd(s); return m ? `${m}-р сарын ${d}` : ''; };
  const fmtDateTime = (s) => (s ? `${fmtDate(s)}, ${String(s).slice(11, 16)}` : '');
  const weekday = (s) => { const [y, m, d] = ymd(s); return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
  const addDays = (iso, n) => {
    const [y, m, d] = ymd(iso);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
  };
  const relDay = (s) => {
    const day = String(s).slice(0, 10);
    if (day === Clock.today) return 'Өнөөдөр';
    if (day === addDays(Clock.today, -1)) return 'Өчигдөр';
    return fmtDate(day);
  };

  const store = {
    get(k, d = null) {
      try { const v = localStorage.getItem('ugtaa:' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
    },
    set(k, v) { try { localStorage.setItem('ugtaa:' + k, JSON.stringify(v)); } catch { /* хувийн горим */ } },
    del(k) { try { localStorage.removeItem('ugtaa:' + k); } catch { /* */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem('ugtaa:' + k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem('ugtaa:' + k, v); } catch { /* */ } },
    del(k) { try { sessionStorage.removeItem('ugtaa:' + k); } catch { /* */ } },
  };

  const Prefs = {
    data: Object.assign({ theme: 'auto', contrast: false, layout: 'mn', haptics: true, seenHelp: false }, store.get('prefs', {})),
    get(k) { return this.data[k]; },
    set(k, v) { this.data[k] = v; store.set('prefs', this.data); this.apply(); },
    apply() {
      const d = document.documentElement;
      if (this.data.theme === 'dark' || this.data.theme === 'light') d.dataset.theme = this.data.theme;
      else delete d.dataset.theme;
      if (this.data.contrast) d.dataset.contrast = 'high';
      else delete d.dataset.contrast;
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.content = isDark() ? '#0a0f1f' : '#f5f6fb';
    },
  };
  const isDark = () => {
    const t = Prefs.get('theme');
    return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  };

  const buzz = (pattern) => {
    if (!Prefs.get('haptics') || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try { navigator.vibrate(pattern); } catch { /* */ }
  };

  /* ── Дүрс тэмдэгүүд (Lucide, ISC) ───────────────────────── */
  const ICONS = {
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
    backspace: '<path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><line x1="18" x2="12" y1="9" y2="15"/><line x1="12" x2="18" y1="9" y2="15"/>',
    enter: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    banknote: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    gamepad: '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
    skip: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
    swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
    columns: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  };
  const icon = (name, cls = '') =>
    raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);

  const avatar = (url, name, size = 40, cls = '') => {
    const letter = (String(name || '?').trim().charAt(0) || '?').toUpperCase();
    const hue = Array.from(String(name || '')).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
    const img = url && /^https:\/\//.test(url)
      ? html`<img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : '';
    return html`<span class="avatar ${cls}" style="--s:${size}px;--h:${hue}" aria-hidden="true"><span>${letter}</span>${img}</span>`;
  };

  /* Wordle-ийн дүрмээр тооцоо (зөвхөн жишээ/демо-д; жинхэнэ тооцоо серверт) */
  const scoreLocal = (guess, answer) => {
    const g = Array.from(guess), a = Array.from(answer), res = g.map(() => 'absent'), left = {};
    a.forEach((ch, i) => { if (g[i] === ch) res[i] = 'correct'; else left[ch] = (left[ch] || 0) + 1; });
    g.forEach((ch, i) => { if (res[i] !== 'correct' && left[ch] > 0) { res[i] = 'present'; left[ch]--; } });
    return res;
  };

  const DEFAULT_CONFIG = {
    google_client_id: '399324970310-96ddmej2nge9r0qij35dr5eum2cll6g5.apps.googleusercontent.com',
    app_url: location.origin + location.pathname.replace(/[^/]*$/, ''),
    max_attempts: 5, reward_amount: 500, reward_by_attempt: {}, premium_multiplier: 1, premium_price: 20000,
    premium_days: 30, tournament_fee: 5000, tournament_split: [50, 30, 20], referral_bonus: 2000,
    referral_unlock: 15, min_withdrawal: 20000, max_withdrawal: 2000000, practice_daily_free: 3,
    require_valid_word: false, banks: {},
    mini_daily_free: 8, mini_play_price: 200, hint_price: 500, hint_price_premium: 250,
    blitz_seconds: 60, blitz_fee: 1000, blitz_split: [50, 30, 20], blitz_premium_free: 1, blitz_rake: 25,
  };

  /* ============================================================
     2. API
     ============================================================ */
  class ApiError extends Error {
    constructor(message, status = 0, code = null) { super(message); this.status = status; this.code = code; }
  }

  const Api = {
    token: store.get('token'),

    async call(action, { method = 'GET', body = null, query = null, timeout = 20000, retried = false } = {}) {
      const url = new URL('api.php', location.href);
      url.searchParams.set('action', action);
      if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, v);

      const headers = { Accept: 'application/json' };
      let payload;
      if (this.token) {
        headers.Authorization = 'Bearer ' + this.token;
        headers['X-Token'] = this.token; // InfinityFree Authorization-ийг хасвал нөөц
      }
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify({ ...(body || {}), ...(this.token ? { _token: this.token } : {}) });
      }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      let res, text;
      try {
        res = await fetch(url, { method, headers, body: payload, signal: ctrl.signal, credentials: 'same-origin', cache: 'no-store' });
        text = await res.text();
      } catch {
        throw new ApiError(navigator.onLine ? 'Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.' : 'Интернэт холболт алга байна.', 0, 'network');
      } finally {
        clearTimeout(timer);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // InfinityFree-ийн бот шалгалтын cookie дууссан үед HTML буцаадаг → нэг удаа дахин ачаална
        if (/aes\.js|slowAES|__test/i.test(text) && !session.get('reloaded')) {
          session.set('reloaded', '1');
          location.reload();
          return new Promise(() => {});
        }
        throw new ApiError(`Серверийн хариу буруу байна (${res.status}).`, res.status, 'bad_response');
      }
      session.del('reloaded');

      // Сервер өгөгдлийн сангаа өөрөө шинэчилсэн — нэг удаа дахин илгээнэ
      if (data.code === 'schema_migrated' && !retried) return this.call(action, { method, body, query, timeout, retried: true });
      if (!res.ok || data.success === false) {
        const err = new ApiError(data.message || 'Алдаа гарлаа.', res.status, data.code || null);
        if (res.status === 401 && this.token && action !== 'google_login') Auth.expired(err.message);
        throw err;
      }
      return data;
    },
    get(action, query) { return this.call(action, { query }); },
    post(action, body = {}) { return this.call(action, { method: 'POST', body }); },
  };

  /* ============================================================
     3. UI СУУРЬ
     ============================================================ */
  const Toast = {
    show(message, type = 'info', duration = 2600) {
      const root = $('#toasts');
      const el = document.createElement('div');
      el.className = 'toast toast-' + type;
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
      el.textContent = message;
      root.prepend(el);
      while (root.children.length > 3) root.lastChild.remove();
      requestAnimationFrame(() => el.classList.add('in'));
      setTimeout(() => {
        el.classList.remove('in');
        el.classList.add('out');
        setTimeout(() => el.remove(), 260);
      }, duration);
    },
    error(e) { Toast.show(e instanceof Error ? e.message : String(e), 'error', 3600); },
  };

  const Modal = {
    stack: [],

    open({ title = '', body = '', className = '', onClose = null } = {}) {
      const root = $('#modal-root');
      const prevFocus = document.activeElement;
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = html`
        <div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${title}" tabindex="-1">
          <div class="modal-head">
            <h2 class="modal-title">${title}</h2>
            <button class="icon-btn" type="button" data-close aria-label="Хаах">${icon('x')}</button>
          </div>
          <div class="modal-body">${body}</div>
        </div>`;
      root.appendChild(wrap);
      document.body.classList.add('has-modal');
      const dlg = $('.modal', wrap);
      let closed = false;
      const m = {
        el: dlg,
        body: $('.modal-body', dlg),
        close(value) {
          if (closed) return;
          closed = true;
          Modal.stack = Modal.stack.filter((x) => x !== m);
          wrap.classList.remove('open');
          wrap.classList.add('closing');
          setTimeout(() => {
            wrap.remove();
            if (!Modal.stack.length) document.body.classList.remove('has-modal');
          }, 200);
          if (onClose) onClose(value);
          if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
        },
        set(bodyHtml) { this.body.innerHTML = bodyHtml; },
      };
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) m.close();
      });
      Modal.stack.push(m);
      requestAnimationFrame(() => {
        wrap.classList.add('open');
        const af = $('[data-autofocus]', dlg);
        (af || dlg).focus({ preventScroll: true });
      });
      return m;
    },

    top() { return this.stack[this.stack.length - 1]; },
    closeAll() { [...this.stack].reverse().forEach((m) => m.close()); },

    confirm({ title, message, confirmText = 'Тийм', cancelText = 'Болих', danger = false }) {
      return new Promise((resolve) => {
        const m = Modal.open({
          title,
          className: 'modal-sm',
          body: html`<div class="confirm-msg">${message}</div>
            <div class="modal-actions">
              <button class="btn btn-ghost" type="button" data-close>${cancelText}</button>
              <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok data-autofocus>${confirmText}</button>
            </div>`,
          onClose: (v) => resolve(v === true),
        });
        $('[data-ok]', m.el).addEventListener('click', () => m.close(true));
      });
    },

    /** fields: [{name, label, type, value, placeholder, hint, options:[[v,l]], min, max, required}] */
    form({ title, intro = '', fields, submitText = 'Хадгалах', danger = false }) {
      return new Promise((resolve) => {
        const field = (f) => {
          const id = 'f-' + f.name;
          const common = html`id="${id}" name="${f.name}" ${f.required ? raw('required') : ''} placeholder="${f.placeholder || ''}"`;
          let input;
          if (f.type === 'textarea') input = html`<textarea class="input" rows="${f.rows || 5}" ${common}>${f.value ?? ''}</textarea>`;
          else if (f.type === 'select') input = html`<select class="input" ${common}>${f.options.map(([v, l]) => html`<option value="${v}" ${String(v) === String(f.value) ? raw('selected') : ''}>${l}</option>`)}</select>`;
          else if (f.type === 'checkbox') return html`<label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${f.value ? raw('checked') : ''}><span>${f.label}</span></label>`;
          else input = html`<input class="input" type="${f.type || 'text'}" value="${f.value ?? ''}" ${f.min != null ? raw(`min="${esc(f.min)}"`) : ''} ${f.max != null ? raw(`max="${esc(f.max)}"`) : ''} ${common}>`;
          return html`<label class="field" for="${id}"><span class="field-label">${f.label}</span>${input}${f.hint ? html`<span class="field-hint">${f.hint}</span>` : ''}</label>`;
        };
        const m = Modal.open({
          title,
          className: 'modal-sm',
          body: html`<form class="form" novalidate>
              ${intro ? html`<p class="form-intro">${intro}</p>` : ''}
              ${fields.map(field)}
              <div class="modal-actions">
                <button class="btn btn-ghost" type="button" data-close>Болих</button>
                <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="submit">${submitText}</button>
              </div>
            </form>`,
          onClose: (v) => resolve(v || null),
        });
        const form = $('form', m.el);
        setTimeout(() => { const first = $('input:not([type=checkbox]),textarea,select', form); if (first) first.focus(); }, 60);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const out = {};
          for (const f of fields) {
            const el = form.elements[f.name];
            out[f.name] = f.type === 'checkbox' ? el.checked : el.value.trim();
            if (f.required && !out[f.name]) { el.focus(); el.classList.add('invalid'); return; }
          }
          m.close(out);
        });
      });
    },
  };

  /* ── Confetti ─────────────────────────────────────────── */
  const Confetti = {
    burst() {
      if (reducedMotion()) return;
      const cv = $('#confetti');
      const ctx = cv.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = innerWidth * dpr;
      cv.height = innerHeight * dpr;
      cv.classList.add('on');
      const css = getComputedStyle(document.documentElement);
      const colors = ['--correct', '--present', '--accent', '--gold', '--blue'].map((v) => css.getPropertyValue(v).trim() || '#fff');
      const parts = Array.from({ length: 140 }, () => ({
        x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3,
        y: innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 13 - 5,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[(Math.random() * colors.length) | 0],
      }));
      const start = performance.now();
      const frame = (t) => {
        const el = t - start;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        ctx.globalAlpha = Math.max(0, 1 - el / 2600);
        for (const p of parts) {
          p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
          ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
          ctx.restore();
        }
        if (el < 2600) requestAnimationFrame(frame);
        else { ctx.clearRect(0, 0, innerWidth, innerHeight); cv.classList.remove('on'); }
      };
      requestAnimationFrame(frame);
    },
  };

  const countUp = (el, from, to, ms = 700) => {
    if (!el) return;
    if (reducedMotion() || from === to || document.hidden) { el._countRun = null; el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const run = (el._countRun = {});
    setTimeout(() => { if (el._countRun === run) el.textContent = fmt(to); }, ms + 400); // rAF зогссон ч эцсийн утга үлдэнэ
    const step = (t) => {
      if (el._countRun !== run) return;
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const copyText = async (text, okMsg = 'Хуулагдлаа!') => {
    try {
      await navigator.clipboard.writeText(text);
      Toast.show(okMsg, 'success');
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* */ }
      ta.remove();
      Toast.show(ok ? okMsg : 'Хуулж чадсангүй', ok ? 'success' : 'error');
      return ok;
    }
  };

  const shareOrCopy = async (text, title = 'Үг Таа') => {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    copyText(text, 'Хуулагдлаа — хүссэн газраа буулгаад илгээгээрэй!');
  };

  /* ── Сервертэй тааруулсан цаг ─────────────────────────── */
  const Clock = {
    offset: 0,
    nextReset: 0,
    today: new Date().toISOString().slice(0, 10),
    sync(t) {
      if (!t) return;
      this.offset = t.now - Date.now() / 1000;
      this.nextReset = t.next_reset;
      this.today = t.today;
    },
    now() { return Date.now() / 1000 + this.offset; },
    left() { return Math.max(0, Math.round(this.nextReset - this.now())); },
    format(s) {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      return [h, m, x].map((v) => String(v).padStart(2, '0')).join(':');
    },
    tick() {
      if (!this.nextReset) return;
      const left = this.left();
      $$('[data-countdown]').forEach((el) => { el.textContent = this.format(left); });
      if (left === 0 && Game.mode === 'daily' && Game.date && Game.date < this.todayFromNow()) Game.markStale();
    },
    todayFromNow() {
      // Шинэ өдөр эхэлсэн эсэхийг серверийн цагаар тооцно
      return this.now() >= this.nextReset ? addDays(this.today, 1) : this.today;
    },
  };

  /* ============================================================
     4. НЭВТРЭЛТ + НҮҮР ХУУДАС
     ============================================================ */
  const App = {
    user: null,
    config: { ...DEFAULT_CONFIG },
    stats: null,
    publicToday: null,
    installPrompt: null,

    setUser(u) {
      const prevBal = this.user ? this.user.balance : u.balance;
      this.user = u;
      const b = $('#balance');
      if (b) countUp(b, prevBal, u.balance);
      document.body.classList.toggle('is-premium', !!u.is_premium);
    },
    setBalance(balance) {
      if (!this.user || balance == null) return;
      const prev = this.user.balance;
      this.user.balance = balance;
      countUp($('#balance'), prev, balance, 900);
      if (balance > prev) {
        const pill = $('.balance-pill');
        pill.classList.remove('bump');
        void pill.offsetWidth;
        pill.classList.add('bump');
      }
    },
    patchUser(u) { if (u) this.setUser({ ...this.user, ...u }); },
    shareLink() {
      const base = (this.config.app_url || DEFAULT_CONFIG.app_url).replace(/\/$/, '');
      return this.user && this.user.referral_code ? `${base}/?ref=${encodeURIComponent(this.user.referral_code)}` : base + '/';
    },

    enter() {
      $('#landing').hidden = true;
      $('#app').hidden = false;
      document.body.classList.add('in-app');
      Router.start();
      Live.start();
    },
  };

  const Auth = {
    gsiTries: 0,

    async credential(resp) {
      if (!resp || !resp.credential) return;
      const slot = $('#gsi-btn');
      slot.classList.add('loading');
      try {
        const r = await Api.post('google_login', { credential: resp.credential, referral_code: store.get('ref') || '' });
        Api.token = r.token;
        store.set('token', r.token);
        store.del('ref');
        App.setUser(r.user);
        App.enter();
        Toast.show(r.is_new ? `Тавтай морил, ${r.user.username}! 🎉` : `Сайн байна уу, ${r.user.username}!`, 'success');
      } catch (e) {
        Toast.error(e);
      } finally {
        slot.classList.remove('loading');
      }
    },

    initGsi() {
      const g = window.google && window.google.accounts && window.google.accounts.id;
      if (!g) {
        if (++this.gsiTries < 60) setTimeout(() => this.initGsi(), 150);
        else $('#gsi-fallback').hidden = false;
        return;
      }
      try {
        g.initialize({
          client_id: App.config.google_client_id,
          callback: (r) => this.credential(r),
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
        });
        $$('[data-gsi]').forEach((el) => {
          el.innerHTML = '';
          g.renderButton(el, {
            type: 'standard', theme: isDark() ? 'filled_black' : 'outline', size: 'large', shape: 'pill',
            text: 'continue_with', logo_alignment: 'left', locale: 'mn', width: clamp(el.clientWidth || 300, 220, 360),
          });
        });
      } catch {
        $('#gsi-fallback').hidden = false;
      }
    },

    async logout() {
      const ok = await Modal.confirm({ title: 'Гарах', message: 'Та системээс гарахдаа итгэлтэй байна уу?', confirmText: 'Гарах', danger: true });
      if (!ok) return;
      this.clear();
      Toast.show('Системээс гарлаа.');
    },

    expired(message) {
      if (!App.user) { this.clear(true); return; }
      this.clear(true);
      Toast.show(message || 'Дахин нэвтэрнэ үү.', 'error', 4000);
    },

    clear(silent = false) {
      Live.since = 0;
      Live.last = null;
      Api.token = null;
      store.del('token');
      App.user = null;
      App.stats = null;
      Game.reset();
      Modal.closeAll();
      try { window.google && google.accounts.id.disableAutoSelect(); } catch { /* */ }
      $('#app').hidden = true;
      $$('#main > .page:not(#page-play)').forEach((p) => { p.innerHTML = ''; });
      document.body.classList.remove('in-app', 'is-premium');
      history.replaceState(null, '', location.pathname);
      Landing.show();
      if (!silent) window.scrollTo(0, 0);
    },
  };

  const Landing = {
    demoTimer: null,
    running: false,

    renderLive() {
      const live = $('#hero-live');
      if (!live) return;
      const t = App.publicToday;
      if (t && t.players > 0) {
        live.innerHTML = html`<span class="pulse-dot"></span> Өнөөдөр <b>${fmt(t.players)}</b> хүн тоглож, <b>${fmt(t.winners)}</b> нь таасан`;
        live.hidden = false;
      } else {
        live.hidden = true;
      }
    },

    show() {
      $('#landing').hidden = false;
      const c = App.config;
      $('#step-reward').textContent = '+' + money(c.reward_amount);
      $('#hero-sub').textContent = `Нууц монгол үгийг ${c.max_attempts} оролдлогоор таа. Зөв таавал ${money(c.reward_amount)} шагнал шууд хэтэвчинд орно.`;
      this.renderLive();
      const ref = store.get('ref');
      if (ref) {
        $('#ref-note').innerHTML = html`${icon('gift')} Урилгын код <b>${ref}</b> хадгалагдлаа`;
        $('#ref-note').hidden = false;
      }
      this.renderFaq();
      this.checkInApp();
      this.demo();
      Auth.initGsi();
    },

    renderFaq() {
      const c = App.config;
      const split = (c.tournament_split || []).join('/');
      const items = [
        ['Өдрийн үг хэзээ солигдох вэ?', 'Монголын цагаар шөнийн 00:00-д. Хүн бүрт ӨӨР санамсаргүй үг ирнэ (урт нь ижил) — тиймээс хариултаа найздаа хэлээд нэмэргүй 😉'],
        ['Шагнал хэд вэ?', `Өдрийн үгийг таавал ${money(c.reward_amount)}${c.reward_by_attempt && c.reward_by_attempt[1] ? ` (1-р оролдлогоор бол ${money(c.reward_by_attempt[1])})` : ''}.${c.daily_winner_cap > 0 ? ` Мөнгөн шагналыг өдөр бүр эхний ${c.daily_winner_cap} хүн авна.` : ''}${c.premium_multiplier > 1 ? ` Premium хэрэглэгч ${c.premium_multiplier} дахин их шагнал авна.` : ''}`],
        ['Мөнгөө яаж авах вэ?', `Хэтэвч хэсгээс банкны данс руугаа татна. Хамгийн багадаа ${money(c.min_withdrawal)}, мөн ${c.referral_unlock} найзаа урьж баталгаажуулсан байх шаардлагатай. Ажлын 1–3 өдөрт шилжүүлнэ.`],
        ['Найз урих гэж юу вэ?', `Өөрийн холбоосоо найздаа илгээ. Найз тань бүртгүүлээд анх удаа үг таамагц танд ${money(c.referral_bonus)} урамшуулал орно.`],
        ['Тэмцээн яаж явагддаг вэ?', `${money(c.tournament_fee)} хураамж төлж, өдрийн үгээ таахаас өмнө нэгдэнэ. Хамгийн цөөн оролдлогоор, хамгийн эрт таасан 3 хүн сангаа ${split} хувиар хуваана.${c.tournament_rake > 0 ? ` Хураамжийн ${c.tournament_rake}% нь үйлчилгээний шимтгэл.` : ''}`],
        ['Ямар тоглоомууд байгаа вэ?', 'Өдрийн үгээс гадна Хос үг, Үг хайх, Үнэн үү худал уу, Дүүжлүүр, Үг холих, Тайлбар таах, Blitz арена гэсэн 7 тоглоом, мөн мөрийтэй 1 vs 1 Дуэль бий. Тоглоом бүр оноо өгч, 7 хоногийн шилдгийн жагсаалтад тооцогдоно.'],
        ['Дуэль гэж юу вэ?', `Найзтайгаа эсвэл дурын тоглогчтой мөрийтэй өрсөлдөнө (${(c.duel_stakes || []).map(money).join(', ')}). Хоёулаа ижил үгсийг 60 секундэд тайлж, их оноотой нь хоёр мөрийн нийлбэрийг авна (${c.duel_rake}% шимтгэл). ${c.duel_expire_hours || 24} цагт хэн ч хүлээж авахгүй бол мөрий бүтнээрээ буцна.`],
        ['Blitz арена гэж юу вэ?', `60 секундэд холимог үгсийг аль болох олноор тайлна. Оноотой тоглолтын хураамж ${money(c.blitz_fee)}. Хураамжийн ${100 - (c.blitz_rake ?? 25)}% шагналын санд орж, маргааш нь өдрийн шилдэг 3 тоглогчид автоматаар хуваарилагдана.`],
        ['Premium гэж юу вэ?', `Сард ${money(c.premium_price)}. ${c.premium_multiplier > 1 ? `${c.premium_multiplier}× шагнал, ` : ''}тэмцээнд үнэгүй оролцох, бүх тоглоом, дасгалыг хязгааргүй тоглох, Blitz-д өдөр бүр үнэгүй оролцох, сэжүүр хагас үнээр авах эрх.`],
      ];
      $('#faq-list').innerHTML = html`${items.map(([q, a]) => html`<details class="faq-item"><summary>${q}${icon('right', 'chev')}</summary><p>${a}</p></details>`)}`;
    },

    checkInApp() {
      const ua = navigator.userAgent || '';
      if (!/FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|Snapchat|; wv\)/i.test(ua)) return;
      const el = $('#inapp-warning');
      const android = /Android/i.test(ua);
      const intent = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
      el.innerHTML = html`
        <div class="inapp-title">${icon('alert')} Энэ хөтчөөс Google-ээр нэвтрэх боломжгүй</div>
        <p>Facebook, Messenger зэрэг апп доторх хөтчийг Google хориглодог. Chrome эсвэл Safari-гаар нээнэ үү.</p>
        <div class="inapp-actions">
          ${android ? html`<a class="btn btn-primary btn-sm" href="${intent}">${icon('external')} Chrome-оор нээх</a>` : html`<span class="muted">⋯ цэс → «Хөтчөөр нээх»</span>`}
          <button class="btn btn-ghost btn-sm" type="button" data-action="copy-url">${icon('copy')} Холбоос хуулах</button>
        </div>`;
      el.hidden = false;
    },

    demo() {
      const board = $('#hero-board');
      if (!board || this.running) return;
      this.running = true;
      const answer = 'НОХОЙ';
      const guesses = ['МОРИН', 'НОГОО', 'НОХОЙ'];
      board.innerHTML = guesses.map(() => `<div class="row">${'<div class="tile" data-state="empty"></div>'.repeat(5)}</div>`).join('');
      const rows = $$('.row', board);
      const run = async () => {
        rows.forEach((r) => $$('.tile', r).forEach((t) => { t.textContent = ''; t.dataset.state = 'empty'; }));
        await sleep(600);
        for (let r = 0; r < guesses.length; r++) {
          if ($('#landing').hidden) { this.running = false; return; }
          const letters = Array.from(guesses[r]);
          const res = scoreLocal(guesses[r], answer);
          for (let c = 0; c < 5; c++) {
            const t = rows[r].children[c];
            t.textContent = letters[c];
            t.dataset.state = 'tbd';
            t.classList.add('pop');
            setTimeout(() => t.classList.remove('pop'), 120);
            await sleep(110);
          }
          await sleep(250);
          await Board.flipTiles(Array.from(rows[r].children), res);
          await sleep(500);
        }
        $$('.tile', rows[2]).forEach((t, i) => { t.style.animationDelay = i * 90 + 'ms'; t.classList.add('bounce'); });
        setTimeout(() => $$('.tile', rows[2]).forEach((t) => { t.classList.remove('bounce'); t.style.animationDelay = ''; }), 1200);
        this.demoTimer = setTimeout(run, 3800);
      };
      run();
    },
  };

  /* ============================================================
     5. ROUTER
     ============================================================ */
  const TITLES = {
    play: 'Тоглох', archive: 'Дасгал', practice: 'Дасгал', leaders: 'Шилдэгүүд', tournament: 'Тэмцээн', wallet: 'Хэтэвч',
    profile: 'Профайл', referral: 'Найз урих', premium: 'Premium', admin: 'Админ', topup: 'Цэнэглэх',
    games: 'Тоглоомууд', g: 'Тоглоом',
  };
  /* Дэд хуудас нээгдэхэд доод цэсний аль таб идэвхтэй харагдах вэ */
  const PARENT_TAB = { archive: 'play', practice: 'play', topup: 'wallet', referral: 'profile', premium: 'profile', admin: 'profile', leaders: 'games', g: 'games' };

  const Router = {
    current: null,
    started: false,

    start() {
      if (!this.started) {
        this.started = true;
        addEventListener('hashchange', () => this.go());
      }
      this.go();
    },

    parse() {
      const h = location.hash.replace(/^#\/?/, '');
      const [page, ...args] = h.split('/').filter(Boolean);
      return { page: page || 'play', args };
    },

    go() {
      if (!App.user) return;
      let { page, args } = this.parse();
      if (!Pages[page] || (page === 'admin' && !App.user.is_admin)) { page = 'play'; args = []; }
      const isReview = page === 'archive' && /^\d{4}-\d{2}-\d{2}$/.test(args[0] || '');
      const section = isReview || page === 'practice' ? 'play' : page;
      const prev = this.current;
      this.current = isReview ? 'review' : page;

      $$('#main > .page').forEach((p) => { p.hidden = p.id !== 'page-' + section; });
      const tab = section === 'play' ? 'play' : PARENT_TAB[page] || page;
      $$('.tabbar .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
      document.title = `${TITLES[page] || 'Тоглох'} — Үг Таа`;
      document.body.dataset.page = section;
      if (section !== 'play' && prev !== this.current) window.scrollTo(0, 0);
      if (page !== 'g') { Blitz.stop(); Mini.game = null; }
      if (tab === 'games' && !store.get('seenGames')) store.set('seenGames', true);
      const gt = $('.tabbar .tab[data-tab="games"]');
      if (gt) gt.classList.toggle('has-dot', !store.get('seenGames'));

      if (isReview) Game.loadReview(args[0]);
      else Pages[page].show(args);
    },

    nav(path) {
      const target = '#/' + path;
      if (location.hash === target) this.go();
      else location.hash = target;
    },
  };

  /* ============================================================
     6. ТОГЛООМ
     ============================================================ */
  const MN_LETTERS = Array.from('АБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯ');
  const MN_SET = new Set(MN_LETTERS);
  const LAYOUTS = {
    mn: [
      ['Ф', 'Ц', 'У', 'Ж', 'Э', 'Н', 'Г', 'Ш', 'Ү', 'З', 'К', 'Ъ'],
      ['Й', 'Ы', 'Б', 'Ө', 'А', 'Х', 'Р', 'О', 'Л', 'Д', 'П', 'Е'],
      ['Я', 'Ч', 'Ё', 'С', 'М', 'И', 'Т', 'Ь', 'В', 'Ю', 'Щ', 'back'],
    ],
    abc: [
      ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ё', 'Ж', 'З', 'И', 'Й', 'К'],
      ['Л', 'М', 'Н', 'О', 'Ө', 'П', 'Р', 'С', 'Т', 'У', 'Ү', 'Ф'],
      ['Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я', 'back'],
    ],
  };
  /* Англи байрлалтай гар дээр монгол стандарт (ФЦУЖ) байрлалаар бичих */
  const CODE_MAP = {
    KeyQ: 'Ф', KeyW: 'Ц', KeyE: 'У', KeyR: 'Ж', KeyT: 'Э', KeyY: 'Н', KeyU: 'Г', KeyI: 'Ш', KeyO: 'Ү', KeyP: 'З',
    BracketLeft: 'К', BracketRight: 'Ъ', KeyA: 'Й', KeyS: 'Ы', KeyD: 'Б', KeyF: 'Ө', KeyG: 'А', KeyH: 'Х',
    KeyJ: 'Р', KeyK: 'О', KeyL: 'Л', Semicolon: 'Д', Quote: 'П', KeyZ: 'Я', KeyX: 'Ч', KeyC: 'Ё', KeyV: 'С',
    KeyB: 'М', KeyN: 'И', KeyM: 'Т', Comma: 'Ь', Period: 'В', Slash: 'Ю', Minus: 'Е', Equal: 'Щ',
  };
  const STATE_LABEL = { correct: 'зөв байрлалд', present: 'үгэнд бий, өөр байрлалд', absent: 'үгэнд байхгүй' };
  const PRAISE = ['Суут ухаантан!', 'Гайхамшигтай!', 'Маш гоё!', 'Сайн байна!', 'Амжилттай!', 'Арай гэж!'];

  const Keyboard = {
    build() {
      const layout = LAYOUTS[Prefs.get('layout')] || LAYOUTS.mn;
      const key = (k) => k === 'back'
        ? html`<button type="button" class="key key-back" data-key="back" aria-label="Устгах">${icon('backspace')}</button>`
        : html`<button type="button" class="key" data-key="${k}">${k}</button>`;
      $('#keyboard').innerHTML = html`
        ${layout.map((row) => html`<div class="kb-row">${row.map(key)}</div>`)}
        <div class="kb-row kb-row-enter"><button type="button" class="key key-enter" data-key="enter">Илгээх ${icon('enter')}</button></div>`;
      this.paint();
    },
    paint() {
      $$('#keyboard .key').forEach((b) => {
        const s = Game.keyStates[b.dataset.key];
        if (s) b.dataset.state = s;
        else delete b.dataset.state;
      });
      const kb = $('#keyboard');
      kb.classList.toggle('disabled', Game.done || Game.mode === 'review');
    },
    flash(k) {
      const b = $(`#keyboard .key[data-key="${k}"]`);
      if (!b) return;
      b.classList.add('pressed');
      setTimeout(() => b.classList.remove('pressed'), 110);
    },
  };

  const Board = {
    el: null,
    rows: 0,
    cols: 0,

    build(rows, cols) {
      this.el = $('#board');
      this.rows = rows;
      this.cols = cols;
      this.el.style.setProperty('--cols', cols);
      this.el.innerHTML = Array.from({ length: rows }, () =>
        `<div class="row" role="row">${'<div class="tile" role="gridcell" data-state="empty"></div>'.repeat(cols)}</div>`).join('');
      this.fit();
    },
    row(r) { return this.el && this.el.children[r]; },
    tile(r, c) { const row = this.row(r); return row && row.children[c]; },

    fit() {
      const wrap = $('#board-wrap');
      if (!wrap || !this.cols || !this.el) return;
      const gap = this.cols > 7 ? 4 : 6;
      const W = wrap.clientWidth - 8;
      const H = wrap.clientHeight - 8;
      if (W <= 0 || H <= 0) return;
      const cell = clamp(Math.floor(Math.min((W - gap * (this.cols - 1)) / this.cols, (H - gap * (this.rows - 1)) / this.rows)), 26, 66);
      this.el.style.setProperty('--cell', cell + 'px');
      this.el.style.setProperty('--gap', gap + 'px');
    },

    paintRow(r, letters, states) {
      const row = this.row(r);
      if (!row) return;
      Array.from(row.children).forEach((t, c) => {
        const ch = letters[c] || '';
        t.textContent = ch;
        const st = states ? states[c] : (ch ? 'tbd' : 'empty');
        t.dataset.state = st;
        if (states) t.setAttribute('aria-label', `${ch} — ${STATE_LABEL[st] || ''}`);
        else t.removeAttribute('aria-label');
      });
    },

    flipTiles(tiles, states) {
      const quick = reducedMotion();
      const step = quick ? 0 : 260;
      const half = quick ? 0 : 230;
      tiles.forEach((t, c) => {
        setTimeout(() => {
          t.classList.add('flip');
          setTimeout(() => {
            t.dataset.state = states[c];
            t.setAttribute('aria-label', `${t.textContent} — ${STATE_LABEL[states[c]] || ''}`);
          }, half);
          setTimeout(() => t.classList.remove('flip'), half * 2);
        }, c * step);
      });
      return sleep((tiles.length - 1) * step + half * 2 + 40);
    },

    reveal(r, states) { return this.flipTiles(Array.from(this.row(r).children), states); },

    shake(r) {
      const row = this.row(r);
      if (!row) return;
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      setTimeout(() => row.classList.remove('shake'), 520);
      buzz(40);
    },

    dance(r) {
      const tiles = Array.from(this.row(r).children);
      tiles.forEach((t, i) => { t.style.animationDelay = i * 90 + 'ms'; t.classList.add('bounce'); });
      setTimeout(() => tiles.forEach((t) => { t.classList.remove('bounce'); t.style.animationDelay = ''; }), 1300);
    },
  };

  const Game = {
    mode: null,          // 'daily' | 'practice' | 'review'
    practiceId: null,
    pendingPractice: null,
    date: null,
    number: 0,
    length: 5,
    max: 5,
    rows: [],
    current: [],
    done: false,
    won: false,
    answer: null,
    definition: null,
    keyStates: {},
    busy: false,
    loading: false,
    stale: false,
    tournament: null,
    archive: null,
    reward: 0,
    hints: [],
    hinted: false,

    reset() {
      Object.assign(this, { mode: null, date: null, rows: [], current: [], done: false, won: false, answer: null, definition: null, keyStates: {}, stale: false, tournament: null, hints: [], hinted: false });
    },

    active() { return ['play', 'practice', 'review'].includes(Router.current); },

    async loadDaily(force = false) {
      if (!force && this.mode === 'daily' && this.date && !this.stale) {
        this.render();
        return;
      }
      await this.load(() => Api.get('daily'), (r) => {
        Clock.sync(r.time);
        if (r.user) App.patchUser(r.user);
        if (r.stats) App.stats = r.stats;
        this.tournament = r.tournament;
        this.archive = r.archive;
      });
    },

    async loadReview(date) {
      if (this.mode === 'review' && this.date === date) {
        this.render();
        return;
      }
      await this.load(() => Api.get('archive_game', { date }), () => { this.tournament = null; });
    },

    async loadPractice(force = false) {
      if (this.pendingPractice) {
        const g = this.pendingPractice;
        this.pendingPractice = null;
        this.tournament = null;
        this.setGame(g);
        return;
      }
      if (!force && this.mode === 'practice' && this.practiceId && !this.done) {
        this.render();
        return;
      }
      let empty = false;
      await this.load(() => Api.get('practice'), (r) => {
        this.archive = r.allowance;
        this.tournament = null;
        if (!r.game) { empty = true; throw new ApiError('Дуусаагүй дасгал алга.', 404, 'no_practice'); }
      });
      if (empty) Router.nav('archive');
    },

    async load(fetcher, extra) {
      if (this.loading) return;
      this.loading = true;
      $('#board').innerHTML = '<div class="board-loading"><span class="spinner"></span></div>';
      $('#play-foot').hidden = true;
      try {
        const r = await fetcher();
        extra(r);
        this.setGame(r.game);
        if (this.mode === 'daily' && !Prefs.get('seenHelp')) {
          Prefs.set('seenHelp', true);
          setTimeout(() => Help.open(), 500);
        }
      } catch (e) {
        $('#board').innerHTML = html`<div class="board-error">
          <p>${e.message}</p>
          <button class="btn btn-primary btn-sm" type="button" data-action="reload-game">${icon('refresh')} Дахин оролдох</button>
        </div>`;
        $('#play-meta').textContent = '';
      } finally {
        this.loading = false;
      }
    },

    setGame(g) {
      this.mode = g.mode;
      this.practiceId = g.mode === 'practice' ? g.id : null;
      this.date = g.date;
      this.number = g.number;
      this.length = g.length;
      this.max = g.max_attempts;
      const s = g.session;
      this.rows = s ? s.attempts : [];
      this.done = !!(s && s.is_completed);
      this.won = !!(s && s.is_won);
      this.reward = s ? s.reward_amount : 0;
      this.hints = s && s.hints ? s.hints.slice() : [];
      this.hinted = this.hints.length > 0;
      this.answer = g.answer;
      this.definition = g.definition;
      this.current = [];
      this.stale = false;
      this.keyStates = {};
      this.rows.forEach((row) => this.applyKeys(row.guess, row.result));
      Board.build(this.max, this.length);
      this.rows.forEach((row, i) => Board.paintRow(i, Array.from(row.guess), row.result));
      Keyboard.build();
      this.render();
    },

    applyKeys(guess, result) {
      const rank = { absent: 1, present: 2, correct: 3 };
      Array.from(guess).forEach((ch, i) => {
        const cur = this.keyStates[ch];
        if (!cur || rank[result[i]] > rank[cur]) this.keyStates[ch] = result[i];
      });
    },

    render() {
      const daily = this.mode === 'daily';
      const practice = this.mode === 'practice';
      $('#play-mode').textContent = daily ? 'Өдрийн үг' : practice ? `Дасгал #${this.number}` : 'Өмнөх өдөр';
      $('#play-meta').textContent = practice
        ? `${this.length} үсэг · мөнгөн шагналгүй`
        : this.date ? `#${this.number} · ${fmtDate(this.date)}, ${weekday(this.date)}` : '';

      const badges = [];
      const streak = App.stats ? App.stats.current_streak : 0;
      if (daily && streak > 0) badges.push(html`<span class="chip chip-flame" title="Дараалсан ялалт">${icon('flame')} ${streak}</span>`);
      if (daily && this.tournament && this.tournament.joined) {
        badges.push(html`<a class="chip chip-target" href="#/tournament">${icon('target')} ${this.tournament.rank ? '#' + this.tournament.rank : 'Тэмцээн'}</a>`);
      }
      if (this.canHint()) badges.push(html`<button class="icon-btn hint-btn" type="button" data-action="hint" aria-label="Сэжүүр авах" title="Сэжүүр — нэг үсэг нээх">${icon('bulb')}</button>`);
      badges.push(html`<a class="icon-btn" href="#/archive" aria-label="Дасгал" title="Дасгал">${icon('history')}</a>`);
      $('#play-badges').innerHTML = html`${badges}`;

      this.renderBanner();
      this.renderHints();
      this.renderFoot();
      Keyboard.paint();
      requestAnimationFrame(() => Board.fit());
    },

    renderBanner() {
      const el = $('#play-banner');
      let content = '';
      if (this.stale) {
        content = html`<div class="banner banner-accent">${icon('star')}<span><b>Шинэ үг гарлаа!</b></span><button class="btn btn-primary btn-xs" type="button" data-action="reload-game">Тоглох</button></div>`;
      } else if (this.mode !== 'daily') {
        content = html`<div class="banner">${icon('history')}<span>${this.mode === 'review' ? 'Та тэр өдрийн үгээ ингэж тоглосон.' : 'Дасгал — мөнгөн шагналгүй.'}</span><a class="btn btn-ghost btn-xs" href="#/play">Өдрийн үг</a></div>`;
      } else if (this.tournament && this.tournament.status === 'open' && !this.tournament.joined && !this.rows.length && !this.done) {
        const pool = this.tournament.prize_pool;
        content = html`<a class="banner banner-gold" href="#/tournament">${icon('target')}<span><b>Өнөөдрийн тэмцээн</b>${pool > 0 ? ` · сан ${money(pool)}` : ''}. Үгээ таахаас өмнө нэгдээрэй!</span>${icon('right')}</a>`;
      }
      el.innerHTML = content ? String(content) : '';
      el.hidden = !content;
    },

    renderFoot() {
      const el = $('#play-foot');
      if (!this.done) { el.hidden = true; el.innerHTML = ''; return; }
      const daily = this.mode === 'daily';
      el.innerHTML = html`
        <div class="foot-result ${this.won ? 'won' : 'lost'}">
          ${daily
            ? html`<div class="foot-next"><span class="muted">Дараагийн үг</span><b class="mono" data-countdown>${Clock.format(Clock.left())}</b></div>`
            : html`<div class="foot-next"><span class="muted">Хариулт</span><b>${this.answer || ''}</b></div>`}
          <div class="foot-actions">
            ${this.mode === 'practice'
              ? html`<button class="btn btn-ghost btn-sm" type="button" data-action="share">${icon('share')}</button>
                     <button class="btn btn-primary btn-sm" type="button" data-action="practice-new">${icon('refresh')} Дахин</button>`
              : html`<button class="btn btn-ghost btn-sm" type="button" data-action="result">${icon('chart')} Дүн</button>
                     <button class="btn btn-primary btn-sm" type="button" data-action="share">${icon('share')} Хуваалцах</button>`}
          </div>
        </div>`;
      el.hidden = false;
    },

    hintLimit() { return Math.max(1, Math.floor(this.length / 2)); },
    canHint() { return (this.mode === 'daily' || this.mode === 'practice') && !this.done && this.hints.length < this.hintLimit(); },

    renderHints() {
      const el = $('#hint-strip');
      const show = this.hints.length > 0 && !this.done && this.mode !== 'review';
      el.hidden = !show;
      if (!show) { el.innerHTML = ''; return; }
      const at = new Map(this.hints.map((h) => [h.pos, h.letter]));
      el.innerHTML = String(html`<span class="hs-l">${icon('bulb')} Сэжүүр</span>
        <span class="hs-tiles">${Array.from({ length: this.length }, (_, i) => html`<span class="tile mini" data-state="${at.has(i) ? 'correct' : 'empty'}">${at.get(i) || ''}</span>`)}</span>`);
    },

    async hint() {
      if (!this.canHint() || this.busy) return;
      const c = App.config;
      const price = App.user && App.user.is_premium ? c.hint_price_premium : c.hint_price;
      const daily = this.mode === 'daily';
      const ok = await Modal.confirm({
        title: 'Сэжүүр авах',
        message: html`Нэг үсгийг байрлалтай нь нээнэ. Хэтэвчнээс <b>${money(price)}</b> хасагдана.
          ${daily ? html`<br><br><b>Анхаар:</b> өдрийн үгэнд сэжүүр авбал энэ өдрийн мөнгөн шагнал, шилдгийн оноо авахгүй бөгөөд тэмцээнд нэгдэх боломжгүй. Цуврал тань хадгалагдана.` : ''}`,
        confirmText: `Нээх — ${money(price)}`,
      });
      if (!ok || !this.canHint()) return;
      this.busy = true;
      try {
        const r = await Api.post('hint', { mode: this.mode, id: this.practiceId });
        this.hints.push({ pos: r.pos, letter: r.letter });
        this.hinted = true;
        App.setBalance(r.balance);
        Toast.show(r.message, 'success');
        this.render();
      } catch (e) {
        moneyError(e);
      } finally {
        this.busy = false;
      }
    },

    markStale() {
      if (this.stale) return;
      this.stale = true;
      if (this.active() && this.mode === 'daily') this.renderBanner();
    },

    canType() {
      return this.mode && this.mode !== 'review' && !this.done && !this.busy && !this.loading && this.rows.length < this.max;
    },

    type(ch) {
      if (!this.canType()) return;
      if (this.current.length >= this.length) { Board.shake(this.rows.length); return; }
      this.current.push(ch);
      const r = this.rows.length;
      Board.paintRow(r, this.current, null);
      const t = Board.tile(r, this.current.length - 1);
      if (t) { t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
      buzz(8);
    },

    back() {
      if (!this.canType() || !this.current.length) return;
      this.current.pop();
      Board.paintRow(this.rows.length, this.current, null);
      buzz(8);
    },

    async submit() {
      if (!this.canType()) return;
      const r = this.rows.length;
      if (this.mode === 'daily' && Clock.nextReset && Clock.left() === 0) {
        Toast.show('Шинэ өдөр эхэллээ — шинэ үг ачаалж байна…');
        this.loadDaily(true);
        return;
      }
      if (this.current.length < this.length) {
        Toast.show(`${this.length} үсэгтэй үг оруулна уу`);
        Board.shake(r);
        return;
      }
      const guess = this.current.join('');
      if (this.rows.some((x) => x.guess === guess)) {
        Toast.show('Энэ үгийг аль хэдийн оруулсан');
        Board.shake(r);
        return;
      }
      this.busy = true;
      const rowEl = Board.row(r);
      rowEl.classList.add('pending');
      try {
        const res = this.mode === 'daily'
          ? await Api.post('guess', { guess })
          : await Api.post('practice_guess', { id: this.practiceId, guess });
        rowEl.classList.remove('pending');
        this.rows.push({ guess, result: res.result });
        this.current = [];
        await Board.reveal(r, res.result);
        this.applyKeys(guess, res.result);
        Keyboard.paint();
        if (res.archive) this.archive = res.archive;
        if (res.is_completed) this.finish(res);
        else if (this.mode === 'daily' && r === 0) this.renderBanner();
      } catch (e) {
        rowEl.classList.remove('pending');
        Toast.error(e);
        Board.shake(r);
      } finally {
        this.busy = false;
      }
    },

    finish(res) {
      this.done = true;
      this.won = !!res.is_won;
      this.answer = res.answer;
      this.definition = res.definition;
      this.reward = res.reward_amount || 0;
      if (res.hinted) this.hinted = true;
      if (res.stats) App.stats = res.stats;
      if (res.tournament) this.tournament = res.tournament;
      const last = this.rows.length - 1;
      if (this.won) {
        Board.dance(last);
        Toast.show(PRAISE[Math.min(last, PRAISE.length - 1)], 'success');
        buzz([30, 60, 30]);
        setTimeout(() => Confetti.burst(), 300);
        if (res.balance != null) setTimeout(() => App.setBalance(res.balance), 700);
      } else {
        Toast.show(`Хариулт: ${this.answer}`, 'info', 4200);
      }
      this.render();
      setTimeout(() => {
        if (!this.active()) return;
        if (this.mode === 'daily') Result.open({ fresh: true, reward: this.reward, capped: !!res.reward_capped });
        else Result.openPractice();
      }, this.won ? 1700 : 1500);
    },

    shareText() {
      const cb = Prefs.get('contrast');
      const map = { correct: cb ? '🟧' : '🟩', present: cb ? '🟦' : '🟨', absent: isDark() ? '⬛' : '⬜' };
      const score = this.won ? this.rows.length : 'X';
      const daily = this.mode === 'daily';
      let head = this.mode === 'practice' ? `Үг Таа · дасгал ${score}/${this.max}` : `Үг Таа #${this.number} ${score}/${this.max}`;
      const streak = App.stats ? App.stats.current_streak : 0;
      if (daily && this.won && streak >= 2) head += ` 🔥${streak}`;
      const grid = this.rows.map((r) => r.result.map((x) => map[x]).join('')).join('\n');
      return `${head}\n\n${grid}\n\n${App.shareLink()}`;
    },
  };

  /* ── Үр дүн / статистик ───────────────────────────────── */
  const Result = {
    async open({ fresh = false, reward = 0, capped = false } = {}) {
      const m = Modal.open({ title: 'Статистик', className: 'modal-result', body: html`<div class="modal-loading"><span class="spinner"></span></div>` });
      if (!App.stats) {
        try { App.stats = (await Api.get('stats')).stats; } catch (e) { m.set(html`<p class="muted">${e.message}</p>`); return; }
      }
      const s = App.stats;
      const g = Game;
      const showGame = g.mode === 'daily' && g.done;
      const title = fresh ? (g.won ? 'Баяр хүргэе! 🎉' : 'Энэ удаа бүтсэнгүй') : 'Статистик';
      $('.modal-title', m.el).textContent = title;
      const prem = App.user && App.user.is_premium;
      m.set(html`
        ${showGame ? this.answerBlock(g.answer, g.definition, g.won) : ''}
        ${fresh && reward > 0 ? html`<div class="reward-pop"><span class="reward-amt">+${money(reward)}</span>${prem && App.config.premium_multiplier > 1 ? html`<span class="chip chip-gold">${icon('crown')} Premium ×${App.config.premium_multiplier}</span>` : ''}<span class="muted">хэтэвчинд орлоо</span></div>` : ''}
        ${fresh && capped ? html`<div class="note">Өнөөдрийн мөнгөн шагналын квот дууссан байна. Маргааш эрт тоглоорой!</div>` : ''}
        ${fresh && g.won && g.hinted ? html`<div class="note">${icon('bulb')} Сэжүүр ашигласан тул энэ удаа мөнгөн шагнал, оноо тооцогдоогүй. Цуврал тань хадгалагдлаа!</div>` : ''}
        ${fresh && g.won && !prem && reward > 0 && App.config.premium_multiplier > 1 ? html`<a class="upsell" href="#/premium" data-close>${icon('crown')}<span>Premium бол энэ шагнал <b>${money(reward * App.config.premium_multiplier)}</b> байх байсан</span>${icon('right')}</a>` : ''}
        ${statTiles(s)}
        <h3 class="sub-h">Оролдлогын тархалт</h3>
        ${distChart(s.distribution, g.mode === 'daily' && g.won ? g.rows.length : 0)}
        ${g.mode === 'daily' && g.tournament && g.tournament.joined ? html`<a class="note note-link" href="#/tournament" data-close>${icon('target')} Тэмцээнд таны байр: <b>${g.tournament.rank ? '#' + g.tournament.rank : '—'}</b>${icon('right')}</a>` : ''}
        ${showGame ? html`
          <div class="result-foot">
            <div class="foot-next"><span class="muted">Дараагийн үг</span><b class="mono big" data-countdown>${Clock.format(Clock.left())}</b></div>
            <button class="btn btn-primary" type="button" data-action="share">${icon('share')} Хуваалцах</button>
          </div>
          <a class="btn btn-ghost btn-block" href="#/games" data-close>${icon('gamepad')} Бусад тоглоом тоглох</a>` : ''}
        ${fresh ? sponsorCard() : ''}
      `);
    },

    openPractice() {
      const g = Game;
      Modal.open({
        title: g.won ? 'Таалаа! 🎉' : 'Бүтсэнгүй',
        className: 'modal-result',
        body: html`
          ${this.answerBlock(g.answer, g.definition, g.won)}
          <p class="center muted">Дасгал #${g.number} · ${g.won ? `${g.rows.length}/${g.max}` : `X/${g.max}`}</p>
          ${g.archive && !g.archive.unlimited ? html`<p class="center muted">Өнөөдрийн дасгалын эрх: <b>${g.archive.left}</b> үлдсэн</p>` : ''}
          <div class="modal-actions">
            <button class="btn btn-ghost" type="button" data-action="share">${icon('share')} Хуваалцах</button>
            <button class="btn btn-primary" type="button" data-action="practice-new">${icon('refresh')} Дахин тоглох</button>
          </div>`,
      });
    },

    answerBlock(answer, definition, won) {
      if (!answer) return '';
      return html`<div class="answer ${won ? 'won' : ''}">
        <div class="answer-tiles">${Array.from(answer).map((ch) => html`<span class="tile mini" data-state="${won ? 'correct' : 'absent'}">${ch}</span>`)}</div>
        ${definition ? html`<p class="answer-def">${icon('book')} ${definition}</p>` : ''}
      </div>`;
    },
  };

  const statTiles = (s) => html`<div class="stat-grid">
    <div class="stat"><div class="stat-v">${fmt(s.played)}</div><div class="stat-l">Тоглосон</div></div>
    <div class="stat"><div class="stat-v">${s.win_rate}%</div><div class="stat-l">Таасан</div></div>
    <div class="stat"><div class="stat-v">${s.current_streak}</div><div class="stat-l">Одоогийн цуврал</div></div>
    <div class="stat"><div class="stat-v">${s.max_streak}</div><div class="stat-l">Дээд цуврал</div></div>
  </div>`;

  /** Оролдлогын тархалт — нэг цуврал хэвтээ багана (өнөөдрийнх онцлогдоно) */
  const distChart = (dist, highlight = 0) => {
    const entries = Object.entries(dist || {}).map(([k, v]) => [Number(k), Number(v)]).sort((a, b) => a[0] - b[0]);
    const max = Math.max(1, ...entries.map(([, v]) => v));
    if (!entries.some(([, v]) => v > 0)) return html`<p class="muted small">Одоогоор таасан үг алга. Эхний үгээ тааж эхэл!</p>`;
    return html`<div class="dist" role="table" aria-label="Оролдлогын тархалт">
      ${entries.map(([n, v]) => html`<div class="dist-row" role="row" title="${n} оролдлогоор ${v} удаа">
        <span class="dist-n" role="rowheader">${n}</span>
        <span class="dist-track" role="cell"><span class="dist-bar ${n === highlight ? 'hi' : ''}" style="width:${Math.max(v / max * 100, v ? 4 : 0)}%"></span><span class="dist-v">${v}</span></span>
      </div>`)}
    </div>`;
  };

  /* ── Заавар ────────────────────────────────────────────── */
  const Help = {
    open() {
      const c = App.config;
      const ex = (word, states) => html`<div class="ex-row">${Array.from(word).map((ch, i) => html`<span class="tile mini" data-state="${states[i] || 'tbd'}">${ch}</span>`)}</div>`;
      Modal.open({
        title: 'Хэрхэн тоглох вэ?',
        className: 'modal-help',
        body: html`
          <p>Өдөр бүр танд <b>тусгай нууц үг</b> ирнэ — хүн бүрт өөр! Түүнийг <b>${c.max_attempts}</b> оролдлогоор таа. Үгийн үсгийн тоо талбарт харагдана.</p>
          <p>Таалт бүрийн дараа нүднүүдийн өнгө үг рүү хэр ойртсоныг харуулна:</p>
          <div class="ex">${ex('НОХОЙ', ['correct', 'tbd', 'tbd', 'tbd', 'tbd'])}<p><b>Н</b> үсэг үгэнд байгаа бөгөөд <b>зөв байрлалдаа</b> байна.</p></div>
          <div class="ex">${ex('ТАХИА', ['tbd', 'present', 'tbd', 'tbd', 'tbd'])}<p><b>А</b> үсэг үгэнд бий, гэхдээ <b>өөр байрлалд</b>.</p></div>
          <div class="ex">${ex('ГУТАЛ', ['tbd', 'tbd', 'tbd', 'tbd', 'absent'])}<p><b>Л</b> үсэг үгэнд <b>огт байхгүй</b>.</p></div>
          <div class="help-box">
            <div>${icon('gift')}<span>Таавал <b>${money(c.reward_amount)}</b> шагнал шууд хэтэвчинд.</span></div>
            <div>${icon('target')}<span>Тэмцээнд үгээ таахаас <b>өмнө</b> нэгдэнэ.</span></div>
            <div>${icon('bulb')}<span>Гацвал <b>Сэжүүр</b> авч нэг үсэг нээ (өдрийн үгэнд шагналгүй болно).</span></div>
            <div>${icon('swords')}<span><b>Дуэль</b> — найзаа мөрийтэй сорьж, ялбал санг ав.</span></div>
            <div>${icon('gamepad')}<span><b>Тоглоом</b> цэсэнд Хос үг, Үг хайх, Үнэн үү худал уу, Дүүжлүүр, Үг холих, Тайлбар таах, <b>Blitz арена</b> бий.</span></div>
            <div>${icon('clock')}<span>Шинэ үг Монголын цагаар <b>00:00</b>-д гарна.</span></div>
          </div>
          <p class="muted small">Компьютер дээр англи байрлалтай гараар шууд бичиж болно — монгол стандарт (ФЦУЖ) байрлалаар хөрвүүлнэ.</p>
          <button class="btn btn-primary btn-block" type="button" data-close data-autofocus>Ойлголоо, тоглоё!</button>`,
      });
    },
  };

  /* ── Тохиргоо ──────────────────────────────────────────── */
  const Settings = {
    open() {
      const seg = (name, opts, cur) => html`<div class="seg seg-sm" role="radiogroup">${opts.map(([v, l]) =>
        html`<button type="button" role="radio" aria-checked="${String(v === cur)}" data-pref="${name}" data-v="${v}">${l}</button>`)}</div>`;
      const tog = (name, label, sub) => html`<label class="set-row">
        <span><b>${label}</b>${sub ? html`<small>${sub}</small>` : ''}</span>
        <input type="checkbox" class="switch" data-pref-toggle="${name}" ${Prefs.get(name) ? raw('checked') : ''}>
      </label>`;
      const m = Modal.open({
        title: 'Тохиргоо',
        body: html`
          <div class="set-row"><span><b>Өнгөний горим</b></span>${seg('theme', [['auto', 'Автомат'], ['dark', 'Харанхуй'], ['light', 'Цайвар']], Prefs.get('theme'))}</div>
          <div class="set-row"><span><b>Гарын байрлал</b><small>ФЦУЖ — утас, компьютерийн стандарт</small></span>${seg('layout', [['mn', 'ФЦУЖ'], ['abc', 'АБВГ']], Prefs.get('layout'))}</div>
          ${tog('contrast', 'Өнгө ялгах горим', 'Улбар шар/цэнхэр өнгө — өнгө ялгахад хүндрэлтэй хүмүүст')}
          ${tog('haptics', 'Чичиргээ', 'Утсан дээр товч дарахад')}
          ${App.installPrompt ? html`<button class="set-row set-link" type="button" data-action="install"><span><b>Утсандаа апп болгож суулгах</b><small>Нүүр дэлгэцэнд дүрс нэмнэ</small></span>${icon('download')}</button>` : ''}
          <button class="set-row set-link" type="button" data-action="help"><span><b>Тоглоомын заавар</b></span>${icon('right')}</button>
          <button class="set-row set-link danger" type="button" data-action="logout"><span><b>Гарах</b><small>${App.user ? App.user.email : ''}</small></span>${icon('logout')}</button>
          <p class="muted small center">Үг Таа v${VERSION}</p>`,
      });
      m.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pref]');
        if (!b) return;
        Prefs.set(b.dataset.pref, b.dataset.v);
        $$(`[data-pref="${b.dataset.pref}"]`, m.el).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        if (b.dataset.pref === 'layout') Keyboard.build();
      });
      m.el.addEventListener('change', (e) => {
        const t = e.target.closest('[data-pref-toggle]');
        if (t) Prefs.set(t.dataset.prefToggle, t.checked);
      });
    },
  };

  /* ============================================================
     7. ХУУДСУУД
     ============================================================ */
  const pageHead = (title, sub = '', right = '') => html`<header class="page-head">
    <div><h1 class="page-title">${title}</h1>${sub ? html`<p class="page-sub">${sub}</p>` : ''}</div>${right}
  </header>`;
  const skeleton = (n = 4) => html`<div class="skel-list">${Array.from({ length: n }, () => raw('<div class="skel"></div>'))}</div>`;
  const empty = (ic, title, text = '', action = '') => html`<div class="empty">
    <div class="empty-ic">${icon(ic)}</div><div class="empty-t">${title}</div>${text ? html`<p class="empty-p">${text}</p>` : ''}${action}
  </div>`;
  const errorBox = (e, retry) => html`<div class="empty">
    <div class="empty-ic">${icon('alert')}</div><div class="empty-t">Ачаалж чадсангүй</div><p class="empty-p">${e.message}</p>
    <button class="btn btn-primary btn-sm" type="button" data-retry="${retry}">${icon('refresh')} Дахин оролдох</button>
  </div>`;
  const segmented = (opts, cur, attr = 'data-v') => html`<div class="seg" role="tablist">${opts.map(([v, l]) =>
    html`<button type="button" role="tab" aria-selected="${String(v === cur)}" ${raw(attr)}="${v}">${l}</button>`)}</div>`;

  const Pages = {};

  Pages.play = { show() { Game.loadDaily(); } };

  /* ── Дасгал + өмнөх өдрүүд ─────────────────────────────── */
  Pages.practice = { show() { Game.loadPractice(); } };

  Pages.archive = {
    async show() {
      const el = $('#page-archive');
      const head = (chip = '') => pageHead('Дасгал', 'Хүссэн үедээ нэмэлт үг тоглож гараа гарга. Мөнгөн шагналгүй.', chip);
      el.innerHTML = html`${head()}${skeleton(4)}`;
      try {
        const r = await Api.get('archive');
        const a = r.allowance;
        const open = r.practice.open;
        const chip = a.unlimited
          ? html`<span class="chip chip-gold">${icon('crown')} Хязгааргүй</span>`
          : html`<span class="chip"><span>Өнөөдөр <b>${a.left}</b>/${a.limit} үлдсэн</span></span>`;
        const canNew = a.unlimited || a.left > 0;
        el.innerHTML = html`${head(chip)}
          <div class="card practice-cta">
            <div class="pc-demo" aria-hidden="true">${['correct', 'absent', 'present', 'absent', 'correct'].map((st, i) => html`<span class="tile mini" data-state="${st}">${'ДАСГЛ'[i]}</span>`)}</div>
            ${open
              ? html`<div class="pc-text"><b>Дуусаагүй дасгал байна</b><small>${open.length} үсэг · ${open.session ? open.session.attempts_count : 0}/${r.max_attempts} оролдлого</small></div>
                     <a class="btn btn-primary btn-block btn-lg" href="#/practice">${icon('arrow')} Үргэлжлүүлэх</a>`
              : canNew
                ? html`<div class="pc-text"><b>Шинэ санамсаргүй үг</b><small>Өмнө нь танд ирээгүй үг сонгогдоно</small></div>
                       <button class="btn btn-primary btn-block btn-lg" type="button" data-action="practice-new">${icon('plus')} Шинэ үг тоглох</button>`
                : html`<a class="note note-link" href="#/premium">${icon('crown')} Өнөөдрийн эрх дууссан. Premium бол хязгааргүй тоглоно.${icon('right')}</a>`}
          </div>
          ${r.practice.recent.length ? html`<h2 class="sub-h">Дасгалын түүх</h2>
            <ul class="list">${r.practice.recent.map((p) => html`<li class="list-item">
              <span class="li-ic ${p.won ? 'pos' : ''}">${icon(p.won ? 'check' : 'x')}</span>
              <span class="li-main"><span class="li-title mono">${p.word}</span>
                <span class="li-sub">${p.won ? `${p.attempts}/${r.max_attempts} оролдлогоор таасан` : 'Бүтээгүй'} · ${fmtDateTime(p.at)}</span></span>
            </li>`)}</ul>` : ''}
          <h2 class="sub-h">Миний өмнөх өдрүүд</h2>
          ${r.items.length ? html`<div class="arch-grid">${r.items.map((it) => html`
            <a class="arch-card s-${it.status}" href="#/archive/${it.date}">
              <span class="arch-num">#${it.number}</span>
              <span class="arch-date">${fmtDate(it.date)}</span>
              <span class="arch-meta">${it.length} үсэг</span>
              <span class="arch-status">${it.status === 'won' ? html`${icon('check')} ${it.attempts}/${r.max_attempts}` : 'Бүтээгүй'}</span>
            </a>`)}</div>` : html`<p class="muted small">Өдрийн үгээ тоглосон өдрүүд тань энд хадгалагдана.</p>`}`;
      } catch (e) {
        el.innerHTML = html`${head()}${errorBox(e, 'archive')}`;
      }
    },
  };

  /* ── Шилдэгүүд ─────────────────────────────────────────── */
  Pages.leaders = {
    period: store.get('lbPeriod', 'week'),

    show() {
      const el = $('#page-leaders');
      el.innerHTML = html`${pageHead('Шилдэгүүд', `Цөөн оролдлогоор таах тусам их оноо: 1 оролдлогоор ${App.config.max_attempts}, ${App.config.max_attempts} оролдлогоор 1 оноо.`)}
        ${segmented([['today', 'Өнөөдөр'], ['week', '7 хоног'], ['month', '30 хоног'], ['all', 'Бүх цаг']], this.period, 'data-period')}
        <div id="lb-body"></div>`;
      this.load();
    },

    async load(silent = false) {
      const body = $('#lb-body');
      if (!body) return;
      if (!silent) body.innerHTML = String(skeleton(6));
      try {
        const r = await Api.get('leaderboard', { period: this.period });
        const L = r.leaders;
        const me = App.user;
        const max = App.config.max_attempts;
        const sub = (x) => this.period === 'today'
          ? `${x.best}/${max} оролдлого${x.time ? ' · ' + x.time : ''}`
          : `${x.wins} ялалт${x.best ? ` · шилдэг ${x.best}/${max}` : ''}`;
        const podium = L.slice(0, 3);
        const order = [podium[1], podium[0], podium[2]].filter(Boolean);
        body.innerHTML = html`
          ${L.length ? html`
            <div class="podium">${order.map((x) => html`
              <div class="pod pod-${x.rank} ${x.id === me.id ? 'me' : ''}">
                ${avatar(x.avatar_url, x.username, x.rank === 1 ? 68 : 54, x.is_premium ? 'ring-gold' : '')}
                <span class="pod-medal m${x.rank}">${x.rank}</span>
                <span class="pod-name">${x.username}</span>
                <span class="pod-pts">${x.points} оноо</span>
                <span class="pod-base">${x.rank}</span>
              </div>`)}</div>
            <ol class="list lb-list">${L.slice(3).map((x) => html`
              <li class="list-item ${x.id === me.id ? 'me' : ''}">
                <span class="rank">${x.rank}</span>
                ${avatar(x.avatar_url, x.username, 38, x.is_premium ? 'ring-gold' : '')}
                <span class="li-main"><span class="li-title">${x.username}${x.is_premium ? html` ${icon('crown', 'gold')}` : ''}</span><span class="li-sub">${sub(x)}</span></span>
                <span class="li-end"><b>${x.points}</b><small>оноо</small></span>
              </li>`)}</ol>`
            : empty('trophy', 'Одоогоор хэн ч таагаагүй', 'Эхний байрыг эзлэх боломж таных!', html`<a class="btn btn-primary btn-sm" href="#/play">Тоглох</a>`)}
          <div class="me-bar">${r.me
            ? html`<span class="rank">${r.me.rank}</span><span class="li-main"><span class="li-title">Таны байр</span><span class="li-sub">${sub(r.me)}</span></span><span class="li-end"><b>${r.me.points}</b><small>оноо</small></span>`
            : html`<span class="li-main"><span class="li-title">Та энэ хугацаанд жагсаалтад ороогүй</span><span class="li-sub">Өдрийн үгээ тааж оноо цуглуул!</span></span><a class="btn btn-primary btn-xs" href="#/play">Тоглох</a>`}</div>`;
      } catch (e) {
        body.innerHTML = String(errorBox(e, 'leaders'));
      }
    },
  };

  /* ── Тэмцээн ───────────────────────────────────────────── */
  Pages.tournament = {
    async show() {
      const el = $('#page-tournament');
      if (!el.innerHTML.trim()) el.innerHTML = html`${pageHead('Тэмцээн')}${skeleton(4)}`;
      try {
        const r = await Api.get('tournament');
        el.innerHTML = html`${pageHead('Тэмцээн', 'Өдрийн үгийг хамгийн цөөн оролдлогоор, хамгийн эрт таасан 3 хүн шагналын санг хуваана.')}
          ${r.current ? this.current(r.current, r.max_attempts) : empty('target', 'Өнөөдөр тэмцээн алга', r.upcoming ? `Дараагийн тэмцээн: ${fmtDate(r.upcoming.tournament_date)} · хураамж ${money(r.upcoming.entry_fee)}` : 'Шинэ тэмцээн зарлагдахаар энд гарна.', html`<a class="btn btn-ghost btn-sm" href="#/play">Өдрийн үг тоглох</a>`)}
          ${r.recent.length ? html`<h2 class="sub-h">Сүүлийн тэмцээнүүд</h2>
            <div class="recent">${r.recent.map((t) => html`<div class="card recent-card">
              <div class="recent-head"><b>${fmtDate(t.date)}</b><span class="muted">${t.participants} оролцогч · ${money(t.prize_pool)}</span></div>
              ${t.winners.length ? html`<ul class="winners">${t.winners.map((w) => html`<li><span class="pod-medal sm m${w.rank}">${w.rank}</span>${avatar(w.avatar_url, w.username, 26)}<span class="w-name">${w.username}</span><b>+${money(w.prize_won)}</b></li>`)}</ul>`
                : html`<p class="muted small">Ялагч гараагүй — хураамжийг буцаасан.</p>`}
            </div>`)}</div>` : ''}`;
      } catch (e) {
        el.innerHTML = html`${pageHead('Тэмцээн')}${errorBox(e, 'tournament')}`;
      }
    },

    current(t, max) {
      const me = App.user;
      const split = App.config.tournament_split || [50, 30, 20];
      const state = { won: 'Таасан', lost: 'Бүтээгүй', playing: 'Тоглож байна', waiting: 'Эхлээгүй' };
      let cta;
      if (t.joined) cta = html`<div class="t-joined">${icon('check')}<span>Та бүртгүүлсэн.</span><a href="#/play">Өдрийн үгээ таа →</a></div>`;
      else if (t.can_join) {
        cta = html`<button class="btn btn-gold btn-block btn-lg" type="button" data-action="join-tournament" data-fee="${t.your_fee}">
          ${icon('target')} Нэгдэх — ${t.your_fee > 0 ? money(t.your_fee) : 'Premium-д үнэгүй'}</button>`;
      } else if (t.started) cta = html`<div class="note">Та өнөөдрийн үгээ таах эхэлсэн тул энэ тэмцээнд нэгдэх боломжгүй. Маргааш тоглохоосоо өмнө нэгдээрэй!</div>`;
      else cta = html`<div class="note">Бүртгэл хаагдсан.</div>`;
      return html`
        <div class="t-hero">
          <div class="t-top"><span class="chip chip-live"><span class="pulse-dot"></span> ${fmtDate(t.date)}</span><span class="muted">${t.participants} оролцогч</span></div>
          <div class="t-pool-l">Шагналын сан</div>
          <div class="t-pool">${money(t.prize_pool)}</div>
          <div class="t-prizes">${t.prizes.map((p, i) => html`<div class="t-prize"><span class="pod-medal sm m${i + 1}">${i + 1}</span><b>${money(p)}</b><small>${split[i]}%</small></div>`)}</div>
          ${cta}
          <p class="muted small center">Хураамж ${money(t.entry_fee)} · Premium хэрэглэгч үнэгүй · Шагналыг маргааш автоматаар олгоно</p>
        </div>
        <h2 class="sub-h">Байр эзлэлт</h2>
        ${t.entries.length ? html`<ol class="list">${t.entries.map((x, i) => html`
          <li class="list-item ${x.user_id === me.id ? 'me' : ''}">
            <span class="rank">${x.rank || '–'}</span>
            ${avatar(x.avatar_url, x.username, 36)}
            <span class="li-main"><span class="li-title">${x.username}</span><span class="li-sub">${state[x.state]}</span></span>
            <span class="li-end">${x.state === 'won' ? html`<b>${x.attempts}/${max}</b><small>${x.time || ''}</small>` : x.state === 'lost' ? html`<b class="muted">X/${max}</b>` : html`<small class="muted">—</small>`}</span>
          </li>`)}</ol>` : html`<p class="muted small center">Анхны оролцогч болоорой!</p>`}`;
    },

    async join(fee) {
      const ok = await Modal.confirm({
        title: 'Тэмцээнд нэгдэх',
        message: fee > 0
          ? html`Хэтэвчнээс <b>${money(fee)}</b> хасагдана. Өдрийн үгээ таахаас өмнө л нэгдэх боломжтой. Үргэлжлүүлэх үү?`
          : 'Premium эрхээр үнэгүй нэгдэнэ. Үргэлжлүүлэх үү?',
        confirmText: 'Нэгдэх',
      });
      if (!ok) return;
      try {
        const r = await Api.post('tournament_join');
        App.setBalance(r.balance);
        Toast.show(r.message, 'success');
        if (Game.tournament) Game.tournament.joined = true;
        this.show();
      } catch (e) { Toast.error(e); }
    },
  };

  /* ── Тоглоомын төв ─────────────────────────────────────── */
  const GAMES = {
    duo: {
      icon: 'columns', title: 'Хос үг', sub: 'Нэг таалтаар хоёр үгийг зэрэг таа', isNew: true,
      rules: [
        ['columns', 'Хоёр нууц үг зэрэг байна. Таны бичсэн үг хоёр талбарт хоёуланд нь шалгагдана.'],
        ['grid', 'Өнгө нь өдрийн үгтэй адил: ногоон — зөв байрлал, шар — үгэнд бий, саарал — байхгүй.'],
        ['star', '7 оролдлогоор хоёуланг нь таа. Хурдан таах тусам их оноо.'],
      ],
    },
    search: {
      icon: 'search', title: 'Үг хайх', sub: 'Үсгийн торноос нуугдсан үгсийг ол', isNew: true,
      rules: [
        ['search', 'Жагсаалтад байгаа үгс торонд хэвтээ, босоо, ташуу чиглэлд нуугдсан.'],
        ['arrow', 'Үгийн эхний үсгийг дараад сүүлийн үсгийг дар (эсвэл чирж зур).'],
        ['star', 'Үг бүр 10 оноо. Бүгдийг хурдан олбол нэмэлт оноо.'],
      ],
    },
    truth: {
      icon: 'scale', title: 'Үнэн үү, худал уу', sub: 'Тайлбар энэ үгийнх мөн үү?', isNew: true, needsDefs: true,
      rules: [
        ['book', 'Үг болон тайлбар гарна. Тайлбар яг энэ үгийнх бол «Үнэн», өөр үгийнх бол «Худал».'],
        ['flame', 'Дараалан 3+ зөв хариулбал асуулт бүрт +5 урамшуулал.'],
        ['star', '12 асуулт. 75%-иас дээш зөв бол ялалт.'],
      ],
    },
    hangman: {
      icon: 'heart', title: 'Дүүжлүүр', sub: 'Үсгээр нь таа — 7 амьтай',
      rules: [
        ['heart', 'Үгийн үсгийг нэг нэгээр сонго. Буруу үсэг бүр 1 амь хасна — нийт 7 амь.'],
        ['book', 'Үгийн тайлбар сэжүүр болж харагдана.'],
        ['star', 'Цөөн алдаатай таавал илүү их оноо.'],
      ],
    },
    anagram: {
      icon: 'shuffle', title: 'Үг холих', sub: 'Холилдсон үсгээс үгээ сэргээ',
      rules: [
        ['shuffle', 'Холилдсон үсгүүдийг дарж зөв дараалалд байрлуул. Буруу байрлуулсан үсгээ дарж буцаана.'],
        ['bulb', 'Сэжүүр эхний үсгийг нээнэ, гэхдээ оноо хасагдана.'],
        ['star', '3 оролдлого. Ижил үсгүүдтэй өөр жинхэнэ үг ч тооцогдоно!'],
      ],
    },
    quiz: {
      icon: 'book', title: 'Тайлбар таах', sub: 'Тайлбараас зөв үгийг сонго', needsDefs: true,
      rules: [
        ['book', 'Тайлбарыг уншаад 4 хувилбараас зөв үгийг сонго.'],
        ['star', 'Зөв хариулт бүр 10 оноо. 70%-иас дээш бол ялалт.'],
        ['clock', 'Нэг тоглолтод 10 асуулт.'],
      ],
    },
    duel: {
      icon: 'swords', title: 'Дуэль', sub: '1 vs 1 мөрийтэй сорилт',
      rules: [
        ['swords', 'Мөрийн дүнгээ сонгоод дуэль үүсгэ, эсвэл бусдын сорилтыг хүлээж ав.'],
        ['clock', 'Хоёулаа яг ижил холимог үгсийг 60 секундэд тайлна. Өрсөлдөгчийн оноо тоглож дуусахаас өмнө харагдахгүй.'],
        ['trophy', 'Их оноотой нь хоёр мөрийн нийлбэрийг (шимтгэл хасаад) авна. Тэнцвэл хуваана.'],
        ['refresh', '24 цагт хэн ч хүлээж авахгүй бол мөрий бүтнээрээ буцна.'],
      ],
    },
    blitz: {
      icon: 'zap', title: 'Blitz арена', sub: '60 секундэд аль болох олон үг',
      rules: [
        ['clock', '60 секундэд аль болох олон холимог үг тайл.'],
        ['star', 'Үг бүр үсэг × 10 оноо. Ижил үсэгтэй өөр жинхэнэ үг ч тооцогдоно.'],
        ['skip', 'Хэцүү үгийг алгасаж болно — оноо хасагдахгүй, цаг л зарцуулна.'],
        ['trophy', 'Оноотой тоглолтын шилдэг 3 нь маргааш шагналын санг хуваана.'],
      ],
    },
  };
  const MINI_ORDER = ['duo', 'search', 'truth', 'hangman', 'anagram', 'quiz'];

  /** Үлдэгдэл хүрэлцэхгүй бол цэнэглэх хуудас руу чиглүүлнэ */
  const moneyError = (e) => {
    Toast.error(e);
    if (e.code === 'insufficient_balance') setTimeout(() => Router.nav('topup'), 1200);
  };

  /** Үнэгүй эрх дууссан (402) бол төлбөрийг зөвшөөрүүлээд дахин илгээнэ. Болих дарвал null. */
  const withPay = async (action, body) => {
    try {
      return await Api.post(action, body);
    } catch (e) {
      if (e.code !== 'mini_pay_required') throw e;
      const price = App.config.mini_play_price;
      const ok = await Modal.confirm({
        title: 'Үнэгүй эрх дууслаа',
        message: html`${e.message}<br><br>Хэтэвчнээс <b>${money(price)}</b> хасаж тоглох уу? <a href="#/premium">Premium</a> бол хязгааргүй.`,
        confirmText: `Тоглох — ${money(price)}`,
      });
      if (!ok) return null;
      return Api.post(action, { ...body, pay: true });
    }
  };

  const allowanceChip = (a, compact = false) => a.unlimited
    ? html`<span class="chip chip-gold" title="Premium — хязгааргүй">${icon('crown')}${compact ? '' : ' Хязгааргүй'}</span>`
    : html`<span class="chip" title="Өнөөдрийн үнэгүй тоглолт" aria-label="Өнөөдөр ${a.left}/${a.limit} үнэгүй тоглолт">${icon('gamepad')} <span><b>${a.left}</b>/${a.limit}${compact ? '' : ' үнэгүй'}</span></span>`;

  /** Ивээн тэтгэгчийн баннер (админ тохируулсан бол) */
  const sponsorCard = () => {
    const sp = App.sponsor;
    if (!sp) return '';
    return html`<a class="sponsor" href="${sp.url}" target="_blank" rel="sponsored noopener noreferrer" data-sponsor>
      ${sp.image ? html`<img class="sp-img" src="${sp.image}" alt="" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="sp-img sp-ph">${icon('star')}</span>`}
      <span class="sp-main"><small>Ивээн тэтгэгч</small><b>${sp.name}</b>${sp.text ? html`<span>${sp.text}</span>` : ''}</span>
      <span class="sp-cta">${sp.cta} ${icon('external')}</span>
    </a>`;
  };

  const rulesModal = (kind) => {
    const g = GAMES[kind];
    Modal.open({
      title: g.title,
      body: html`<ul class="mi-rules">${g.rules.map(([ic, t]) => html`<li>${icon(ic)}<span>${t}</span></li>`)}</ul>
        <button class="btn btn-primary btn-block" type="button" data-close data-autofocus>Ойлголоо</button>`,
    });
  };

  Pages.games = {
    async show() {
      const el = $('#page-games');
      const sub = 'Оноо цуглуулж 7 хоногийн шилдэгт ор. Blitz аренад мөнгөн шагнал!';
      if (!el.innerHTML.trim()) el.innerHTML = html`${pageHead('Тоглоомууд', sub)}${skeleton(5)}`;
      try {
        const r = await Api.get('games');
        const a = r.allowance, ar = r.arena, me = App.user, per = r.per_game || {};
        const tile = (k) => {
          const g = GAMES[k];
          const off = g.needsDefs && !r.quiz_ready;
          const open = r.open.includes(k);
          const p = per[k];
          const foot = open
            ? html`<span class="gt-live"><span class="pulse-dot"></span> Үргэлжлүүлэх</span>`
            : p && p.played ? html`<span class="gt-stat">${icon('star')} Шилдэг ${fmt(p.best)}</span>` : g.isNew ? html`<span class="gt-new">Шинэ</span>` : html`<span class="gt-stat">Тоглож үзээгүй</span>`;
          return html`<a class="game-tile gc-${k} ${off ? 'off' : ''}" href="${off ? '#/games' : '#/g/' + k}" ${off ? raw('aria-disabled="true"') : ''}>
            <span class="gc-ic">${icon(g.icon)}</span>
            <b class="gt-title">${g.title}</b>
            <small class="gt-sub">${off ? 'Үгэнд тайлбар нэмэгдмэгц нээгдэнэ' : g.sub}</small>
            ${foot}
          </a>`;
        };
        el.innerHTML = html`${pageHead('Тоглоомууд', sub, allowanceChip(a))}
          <a class="arena-card" href="#/g/blitz">
            <div class="arena-top"><span class="chip chip-live"><span class="pulse-dot"></span> Blitz арена</span><span class="muted">${ar.participants} оролцогч</span></div>
            <div class="arena-pool"><small>Өнөөдрийн шагналын сан</small><b>${money(ar.pool)}</b></div>
            <div class="arena-sub">${icon('zap')}<span>60 секундэд холимог үгс тайл. Шилдэг 3 нь маргааш шагнал авна.</span></div>
            <div class="arena-foot">
              ${ar.me ? html`<span>Таны шилдэг: <b>${fmt(ar.me.best)}</b>${ar.me.rank ? ` · #${ar.me.rank}` : ''}</span>` : html`<span>${ar.free_left > 0 ? 'Premium: өнөөдөр үнэгүй оролцоно' : `Хураамж ${money(ar.fee)}`}</span>`}
              <span class="btn btn-gold btn-sm">Тоглох ${icon('arrow')}</span>
            </div>
          </a>
          <a class="duel-card" href="#/g/duel">
            <span class="gc-ic gc-duel">${icon('swords')}</span>
            <span class="gc-main"><b>Дуэль — 1 vs 1 мөрий</b><small>${r.duels && r.duels.open
              ? `${r.duels.open} нээлттэй сорилт · хамгийн их ${money(r.duels.top)}`
              : 'Найзаа мөрийтэй сорь, ялагч санг авна'}</small></span>
            ${r.duels && r.duels.waiting ? html`<span class="chip chip-xs chip-live"><span class="pulse-dot"></span> ${r.duels.waiting}</span>` : icon('right', 'chev')}
          </a>
          ${sponsorCard()}
          <div class="game-grid">${MINI_ORDER.map(tile)}</div>
          <div class="game-list">
            <a class="game-card gc-practice" href="#/archive"><span class="gc-ic">${icon('grid')}</span><span class="gc-main"><b>Дасгал</b><small>Өдрийн үгийн дүрмээр нэмэлт үг</small></span>${icon('right', 'chev')}</a>
            <a class="game-card gc-leaders" href="#/leaders"><span class="gc-ic">${icon('trophy')}</span><span class="gc-main"><b>Өдрийн үгийн шилдэгүүд</b><small>Өдөр, 7 хоног, сарын жагсаалт</small></span>${icon('right', 'chev')}</a>
          </div>
          ${a.unlimited ? '' : html`<a class="note note-link" href="#/premium">${icon('crown')}<span>Өдөрт ${a.limit} тоглолт үнэгүй, дараа нь ${money(a.price)}. Premium бол хязгааргүй.</span>${icon('right')}</a>`}
          <h2 class="sub-h">7 хоногийн тоглоомын оноо</h2>
          ${r.leaders.length ? html`<ol class="list">${r.leaders.map((x) => html`
            <li class="list-item ${x.id === me.id ? 'me' : ''}">
              <span class="rank">${x.rank}</span>
              ${avatar(x.avatar_url, x.username, 36, x.is_premium ? 'ring-gold' : '')}
              <span class="li-main"><span class="li-title">${x.username}</span></span>
              <span class="li-end"><b>${fmt(x.points)}</b><small>оноо</small></span>
            </li>`)}</ol>` : html`<p class="muted small">Энэ долоо хоногт хэн ч оноо аваагүй байна. Анхных нь болоорой!</p>`}
          <div class="me-bar">${r.me
            ? html`<span class="rank">${r.me.rank}</span><span class="li-main"><span class="li-title">Таны байр</span><span class="li-sub">Нийт ${r.mine.played} тоглолт · ${r.mine.won} ялалт</span></span><span class="li-end"><b>${fmt(r.me.points)}</b><small>оноо</small></span>`
            : html`<span class="li-main"><span class="li-title">Та энэ 7 хоногт оноо аваагүй</span><span class="li-sub">Дурын тоглоом тоглож оноо цуглуул</span></span>`}</div>`;
      } catch (e) {
        el.innerHTML = html`${pageHead('Тоглоомууд', sub)}${errorBox(e, 'games')}`;
      }
    },
  };

  /* ── Үсэг байрлуулагч (Үг холих, Blitz) ────────────────── */
  const Builder = {
    make(letters, prefix = '') {
      const b = { letters: letters.slice(), used: letters.map(() => false), locked: [], picked: [], order: letters.map((_, i) => i) };
      for (const ch of Array.from(prefix)) {
        const i = b.letters.findIndex((x, j) => x === ch && !b.used[j]);
        if (i >= 0) { b.used[i] = true; b.locked.push(i); }
      }
      return b;
    },
    word(b) { return [...b.locked, ...b.picked].map((i) => b.letters[i]).join(''); },
    full(b) { return b.locked.length + b.picked.length === b.letters.length; },
    pick(b, i) {
      if (b.used[i] || this.full(b)) return false;
      b.used[i] = true;
      b.picked.push(i);
      buzz(8);
      return true;
    },
    pickChar(b, ch) {
      const i = b.order.find((j) => !b.used[j] && b.letters[j] === ch);
      return i != null && this.pick(b, i);
    },
    back(b) {
      const i = b.picked.pop();
      if (i == null) return false;
      b.used[i] = false;
      return true;
    },
    unpick(b, slot) {
      const k = slot - b.locked.length;
      if (k < 0 || k >= b.picked.length) return false;
      const [i] = b.picked.splice(k, 1);
      b.used[i] = false;
      return true;
    },
    clear(b) { b.picked.forEach((i) => { b.used[i] = false; }); b.picked = []; },
    shuffle(b) {
      for (let i = b.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b.order[i], b.order[j]] = [b.order[j], b.order[i]];
      }
    },
    view(b) {
      const slots = [...b.locked.map((i) => [b.letters[i], 'correct']), ...b.picked.map((i) => [b.letters[i], 'tbd'])];
      while (slots.length < b.letters.length) slots.push(['', 'empty']);
      return html`<div class="bld-slots" style="--n:${b.letters.length}">${slots.map(([ch, st], k) =>
        html`<button type="button" class="tile bld-slot" data-state="${st}" data-slot="${k}" ${st !== 'tbd' ? raw('tabindex="-1"') : ''} aria-label="${ch || 'хоосон'}">${ch}</button>`)}</div>
        <div class="bld-pool">${b.order.map((i) => html`<button type="button" class="bld-key" data-pool="${i}" ${b.used[i] ? raw('disabled') : ''}>${b.letters[i]}</button>`)}</div>`;
    },
    shake() {
      const s = $('.bld-slots');
      if (!s) return;
      s.classList.remove('shake');
      void s.offsetWidth;
      s.classList.add('shake');
      buzz(40);
    },
  };

  const miniHead = (kind, right = '') => html`<header class="mini-head">
    <a class="icon-btn" href="#/games" aria-label="Тоглоомууд руу буцах">${icon('left')}</a>
    <div class="mini-title"><span class="gc-ic sm gc-${kind}">${icon(GAMES[kind].icon)}</span><h1>${GAMES[kind].title}</h1></div>
    <div class="mini-right" id="mini-right">${right}</div>
    <button class="icon-btn" type="button" data-action="mini-rules" data-kind="${kind}" aria-label="Дүрэм">${icon('help')}</button>
  </header>`;

  const SEARCH_COLORS = 6;
  const sameCell = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  /** Хоёр нүд нэг шулуун дээр (хэвтээ, босоо, ташуу) байгаа эсэх */
  const inLine = (a, b) => {
    const dr = b[0] - a[0], dc = b[1] - a[1];
    return !sameCell(a, b) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc));
  };
  const lineCells = (a, b) => {
    const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1]);
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    return Array.from({ length: n + 1 }, (_, k) => [a[0] + dr * k, a[1] + dc * k]);
  };

  /* ── Мини тоглоомууд ──────────────────────────────────── */
  const Mini = {
    game: null,
    s: null,
    b: null,
    allow: null,
    busy: false,
    cur: [],        // Хос үг: бичиж буй үг
    sel: null,      // Үг хайх: сонгосон эхний нүд
    drag: null,
    dragEnd: 0,
    el() { return $('#page-g'); },
    current() { return this.game === 'blitz' ? Blitz : this; },

    async open(kind, code = null) {
      Blitz.stop();
      if (kind === 'blitz' || kind === 'duel') {
        this.game = 'blitz';
        if (kind === 'duel') Blitz.openDuel(code ? String(code).toUpperCase() : null);
        else Blitz.open();
        return;
      }
      if (!GAMES[kind]) { Router.nav('games'); return; }
      this.game = kind;
      this.s = null;
      const el = this.el();
      el.innerHTML = html`${miniHead(kind)}${skeleton(3)}`;
      try {
        const r = await Api.get('mini', { game: kind });
        if (this.game !== kind) return;
        this.allow = r.allowance;
        if (r.game) this.set(r.game);
        else this.intro();
      } catch (e) {
        el.innerHTML = html`${miniHead(kind)}${errorBox(e, 'g')}`;
      }
    },

    intro() {
      const k = this.game, g = GAMES[k], a = this.allow;
      this.el().innerHTML = html`${miniHead(k, allowanceChip(a, true))}
        <div class="card mini-intro">
          <div class="mi-hero gc-${k}">${icon(g.icon)}</div>
          <p class="mi-lead">${g.sub}</p>
          <ul class="mi-rules">${g.rules.map(([ic, t]) => html`<li>${icon(ic)}<span>${t}</span></li>`)}</ul>
          <button class="btn btn-primary btn-block btn-lg" type="button" data-action="mini-start" data-autofocus>${icon('arrow')} Эхлэх</button>
          <p class="muted small center">${a.unlimited ? 'Premium — хязгааргүй тоглоно.' : a.left > 0 ? `Өнөөдөр ${a.left} үнэгүй тоглолт үлдсэн.` : `Үнэгүй эрх дууссан — нэг тоглолт ${money(App.config.mini_play_price)}.`}</p>
        </div>`;
    },

    async start(btn) {
      if (this.busy || this.game === 'blitz' || !this.game) return;
      this.busy = true;
      if (btn) btn.disabled = true;
      try {
        const r = await withPay('mini_start', { game: this.game });
        if (!r) return;
        this.allow = r.allowance;
        if (App.user && r.balance !== App.user.balance) App.setBalance(r.balance);
        this.set(r.game);
        window.scrollTo(0, 0);
      } catch (e) {
        moneyError(e);
      } finally {
        this.busy = false;
        if (btn && btn.isConnected) btn.disabled = false;
      }
    },

    set(g) {
      const fresh = !this.s || this.s.id !== g.id;
      const wasDone = !fresh && this.s.completed;
      this.s = g;
      if (fresh) { this.cur = []; this.sel = null; }
      if (g.game === 'anagram') this.b = Builder.make(g.letters, g.prefix);
      this.render();
      if (g.completed && !wasDone) {
        if (g.is_won) { setTimeout(() => Confetti.burst(), 200); buzz([30, 60, 30]); }
        const res = $('.mini-result');
        if (res) setTimeout(() => res.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' }), 250);
      }
    },

    render() {
      const s = this.s;
      const body = this[s.game](s);
      this.el().innerHTML = html`${miniHead(s.game, s.completed ? '' : this.status())}${this.reviveBar(s)}${body}${s.completed ? this.result(s) : ''}`;
    },

    reviveBar(s) {
      if (s.completed || !s.revive || !s.revive.available) return '';
      const what = { hangman: '+2 амь', anagram: '+1 оролдлого', duo: '+2 оролдлого' }[s.game];
      return html`<div class="revive-bar" role="status">
        ${icon('heart')}<span><b>Бараг дууслаа!</b> ${what} авч үргэлжлүүлэх үү?</span>
        <button class="btn btn-gold btn-xs" type="button" data-action="mini-revive">${what} · ${money(s.revive.price)}</button>
      </div>`;
    },

    async revive() {
      const s = this.s;
      if (!s || !s.revive || !s.revive.available) return;
      const ok = await Modal.confirm({ title: 'Сэргээх', message: html`Хэтэвчнээс <b>${money(s.revive.price)}</b> хасагдана. Тоглоом бүрт нэг л удаа сэргээнэ.`, confirmText: `Төлөх — ${money(s.revive.price)}` });
      if (!ok) return;
      const bal = App.user ? App.user.balance : null;
      const r = await this.move({ revive: true });
      if (!r) return;
      if (bal != null) App.setBalance(bal - s.revive.price);
      Toast.show('Сэргээлээ! Амжилт хүсье 💪', 'success');
      this.set(r.game);
    },

    status() {
      const s = this.s;
      switch (s.game) {
        case 'hangman': return html`<span class="chip chip-hearts" aria-label="Үлдсэн амь">${icon('heart')} <span>${s.lives}/${s.max_lives}</span></span>`;
        case 'anagram': return html`<span class="chip"><span>Оролдлого <b>${s.tries}</b>/${s.max_tries}</span></span>`;
        case 'duo': return html`<span class="chip"><span><b>${s.max_attempts - s.rows.length}</b> оролдлого</span></span>`;
        case 'search': return html`<span class="chip"><span><b>${s.words.filter((w) => w.found).length}</b>/${s.words.length} үг</span></span>`;
        case 'truth': return html`<span class="chip ${s.streak >= 3 ? 'chip-flame' : ''}">${icon(s.streak >= 3 ? 'flame' : 'star')} <span>${s.points}</span></span>`;
        default: return html`<span class="chip">${icon('check')} <span>${s.correct}/${s.total}</span></span>`;
      }
    },

    /* ─ Дүүжлүүр ─ */
    hangman(s) {
      const guessed = new Map(s.guessed.map((x) => [x.l, x.hit]));
      const keys = LAYOUTS[Prefs.get('layout')] || LAYOUTS.mn;
      const tileState = (ch) => (!ch ? 'empty' : guessed.has(ch) ? 'correct' : 'present');
      return html`
        <div class="hm-lives" role="img" aria-label="${s.lives} амь үлдсэн">${Array.from({ length: s.max_lives }, (_, i) => html`<span class="${i < s.lives ? 'on' : ''}">${icon('heart')}</span>`)}</div>
        <div class="hm-word" style="--n:${s.pattern.length}" aria-label="${s.pattern.length} үсэгтэй үг">${s.pattern.map((ch) => html`<span class="tile" data-state="${tileState(ch)}">${ch}</span>`)}</div>
        ${s.clue ? html`<div class="clue">${icon('book')}<p>${s.clue}</p></div>` : html`<p class="muted small center">${s.pattern.length} үсэгтэй үг</p>`}
        ${s.completed ? '' : html`<div class="keyboard hm-keys">${keys.map((row) => html`<div class="kb-row">${row.filter((k) => k !== 'back').map((k) => {
          const st = guessed.has(k) ? (guessed.get(k) ? 'correct' : 'absent') : '';
          return html`<button type="button" class="key" data-letter="${k}" ${st ? raw(`data-state="${st}" disabled`) : ''}>${k}</button>`;
        })}</div>`)}</div>`}`;
    },

    /* ─ Үг холих ─ */
    anagram(s) {
      const wrong = s.wrong.length ? html`<div class="wrong-list" aria-label="Буруу оролдлогууд">${s.wrong.map((w) => html`<span class="chip chip-bad">${w}</span>`)}</div>` : '';
      if (s.completed) return wrong;
      const len = s.letters.length;
      return html`
        <p class="muted center mini-lead">${len} үсэгтэй үгийг сэргээ</p>
        <div id="bld">${Builder.view(this.b)}</div>
        ${wrong}
        <div class="mini-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="bld-shuffle">${icon('shuffle')} Холих</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="bld-clear">${icon('backspace')} Арилгах</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="mini-hint" ${Array.from(s.prefix).length >= len - 1 ? raw('disabled') : ''}>${icon('bulb')} Сэжүүр <small>−10</small></button>
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="button" data-action="mini-submit" id="mini-submit" ${Builder.full(this.b) ? '' : raw('disabled')}>Шалгах ${icon('enter')}</button>`;
    },

    /* ─ Тайлбар таах ─ */
    quiz(s) {
      if (s.completed) return '';
      const q = s.question;
      return html`
        <div class="quiz-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.index}"><span style="width:${(s.index / Math.max(1, s.total)) * 100}%"></span></div>
        <p class="muted small center">Асуулт ${s.index + 1}/${s.total}</p>
        <div class="clue clue-big">${icon('book')}<p>${q ? q.clue : ''}</p></div>
        <div class="quiz-opts">${(q ? q.options : []).map((w, i) => html`<button type="button" class="quiz-opt" data-choice="${i}"><span class="qo-n">${i + 1}</span><b>${w}</b></button>`)}</div>
        <p class="muted small center kb-hint">Компьютер дээр 1–4 товчоор хариулж болно</p>`;
    },

    /* ─ Хос үг ─ */
    duoBoard(s, idx) {
      const n = s.length, rows = [];
      const done = s.solved[idx];
      for (let i = 0; i < s.max_attempts; i++) {
        const r = s.rows[i];
        let cells;
        if (r && r.r[idx]) cells = Array.from(r.g).map((ch, c) => [ch, r.r[idx][c]]);
        else if (r) cells = Array.from({ length: n }, () => ['', 'void']);
        else if (i === s.rows.length && !done && !s.completed) cells = Array.from({ length: n }, (_, c) => [this.cur[c] || '', this.cur[c] ? 'tbd' : 'empty']);
        else cells = Array.from({ length: n }, () => ['', done ? 'void' : 'empty']);
        rows.push(html`<div class="duo-row">${cells.map(([ch, st]) => html`<span class="tile" data-state="${st}">${ch}</span>`)}</div>`);
      }
      return html`<div class="duo-board ${done ? 'solved' : ''}" style="--cols:${n}" aria-label="${idx + 1}-р үг${done ? ' — тааагдсан' : ''}">
        <div class="duo-label">${done ? html`${icon('check')} ${idx + 1}-р үг` : `${idx + 1}-р үг`}</div>
        ${rows}
      </div>`;
    },

    duoKeys(s) {
      const rank = { absent: 1, present: 2, correct: 3 };
      const st = [{}, {}];
      s.rows.forEach((r) => [0, 1].forEach((b) => {
        if (!r.r[b]) return;
        Array.from(r.g).forEach((ch, i) => {
          const v = r.r[b][i];
          if (!st[b][ch] || rank[v] > rank[st[b][ch]]) st[b][ch] = v;
        });
      }));
      const col = (v) => (v ? `var(--${v === 'absent' ? 'absent' : v})` : 'var(--key-bg)');
      const layout = LAYOUTS[Prefs.get('layout')] || LAYOUTS.mn;
      const key = (k) => {
        if (k === 'back') return html`<button type="button" class="key key-back" data-duo-key="back" aria-label="Устгах">${icon('backspace')}</button>`;
        const l = s.solved[0] ? null : st[0][k], r = s.solved[1] ? null : st[1][k];
        const dead = (s.solved[0] || l === 'absent') && (s.solved[1] || r === 'absent') && (l || r);
        return html`<button type="button" class="key duo-key ${dead ? 'dead' : ''}" data-duo-key="${k}" style="--kl:${col(l)};--kr:${col(r)}" ${l || r ? raw('data-painted="1"') : ''}>${k}</button>`;
      };
      return html`<div class="keyboard duo-keys" role="group" aria-label="Гар">
        ${layout.map((row) => html`<div class="kb-row">${row.map(key)}</div>`)}
        <div class="kb-row kb-row-enter"><button type="button" class="key key-enter" data-duo-key="enter">Илгээх ${icon('enter')}</button></div>
      </div>`;
    },

    duo(s) {
      return html`
        <div class="duo-boards">${this.duoBoard(s, 0)}${this.duoBoard(s, 1)}</div>
        ${s.completed ? '' : this.duoKeys(s)}`;
    },

    redrawDuo() {
      const s = this.s;
      const boards = $('.duo-boards');
      if (boards) boards.innerHTML = String(html`${this.duoBoard(s, 0)}${this.duoBoard(s, 1)}`);
    },

    duoKey(k) {
      const s = this.s;
      if (!s || s.game !== 'duo' || s.completed || this.busy) return;
      if (k === 'enter') { this.submitDuo(); return; }
      if (k === 'back') { if (this.cur.length) { this.cur.pop(); this.redrawDuo(); } return; }
      if (this.cur.length >= s.length) return;
      this.cur.push(k);
      buzz(8);
      this.redrawDuo();
    },

    async submitDuo() {
      const s = this.s;
      if (this.cur.length < s.length) {
        Toast.show(`${s.length} үсэгтэй үг бичнэ үү`);
        this.shakeDuo();
        return;
      }
      const guess = this.cur.join('');
      if (s.rows.some((r) => r.g === guess)) { Toast.show('Энэ үгийг аль хэдийн оруулсан'); this.shakeDuo(); return; }
      const r = await this.move({ guess });
      if (!r) { this.shakeDuo(); return; }
      this.cur = [];
      this.set(r.game);
      if (!r.game.completed && r.game.solved.filter(Boolean).length > s.solved.filter(Boolean).length) Toast.show('Нэг үгийг таалаа! 🎯', 'success');
    },

    shakeDuo() {
      $$('.duo-board:not(.solved) .duo-row').forEach((row, i, all) => {
        const idx = this.s.rows.length;
        if (i % this.s.max_attempts !== idx) return;
        row.classList.remove('shake');
        void row.offsetWidth;
        row.classList.add('shake');
      });
      buzz(40);
    },

    /* ─ Үг хайх ─ */
    search(s) {
      const color = new Map();
      s.words.forEach((w, i) => { if (w.cells) w.cells.forEach(([r, c]) => color.set(r + ',' + c, (i % SEARCH_COLORS) + 1)); });
      const sel = this.sel;
      return html`
        <p class="muted small center mini-lead">${s.completed ? '' : 'Үгийн эхний үсгийг дараад сүүлийн үсгийг дар'}</p>
        <div class="ws-grid" style="--n:${s.size}" role="grid" aria-label="Үсгийн тор">${s.grid.map((row, r) => row.map((ch, c) => {
          const k = color.get(r + ',' + c);
          return html`<button type="button" class="ws-cell ${k ? 'f' + k : ''} ${sameCell(sel, [r, c]) ? 'sel' : ''}" data-cell="${r},${c}" ${s.completed ? raw('disabled') : ''}>${ch}</button>`;
        }))}</div>
        <div class="ws-words">${s.words.map((w, i) => html`<span class="ws-word ${w.found ? 'found f' + ((i % SEARCH_COLORS) + 1) : ''} ${!w.found && w.cells ? 'missed' : ''}">${w.found ? icon('check') : ''}${w.w}</span>`)}</div>
        ${s.completed ? '' : html`<div class="mini-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="ws-giveup">${icon('flag')} Бууж өгөх</button></div>`}`;
    },

    cellAt(el) {
      const c = el && el.closest && el.closest('[data-cell]');
      return c ? c.dataset.cell.split(',').map(Number) : null;
    },

    highlight(a, b) {
      $$('.ws-cell.trace').forEach((x) => x.classList.remove('trace'));
      if (!a || !b || !inLine(a, b)) return;
      lineCells(a, b).forEach(([r, c]) => { const x = $(`.ws-cell[data-cell="${r},${c}"]`); if (x) x.classList.add('trace'); });
    },

    cellTap(cell) {
      const s = this.s;
      if (!s || s.game !== 'search' || s.completed || this.busy) return;
      if (!this.sel) { this.sel = cell; this.markSel(); buzz(8); return; }
      if (sameCell(this.sel, cell)) { this.sel = null; this.markSel(); return; }
      if (!inLine(this.sel, cell)) { this.sel = cell; this.markSel(); buzz(8); return; }
      this.submitSearch(this.sel, cell);
    },

    markSel() {
      $$('.ws-cell.sel').forEach((x) => x.classList.remove('sel'));
      if (this.sel) { const x = $(`.ws-cell[data-cell="${this.sel[0]},${this.sel[1]}"]`); if (x) x.classList.add('sel'); }
    },

    async submitSearch(a, b) {
      this.highlight(a, b);
      const r = await this.move({ a, b });
      this.sel = null;
      if (!r) { this.highlight(); this.markSel(); return; }
      if (r.move.found) {
        buzz([15, 30, 15]);
        this.set(r.game);
      } else {
        const trace = $$('.ws-cell.trace');
        trace.forEach((x) => x.classList.add('miss'));
        buzz(40);
        setTimeout(() => { trace.forEach((x) => x.classList.remove('trace', 'miss')); this.markSel(); }, 420);
      }
    },

    async giveUp() {
      const ok = await Modal.confirm({ title: 'Бууж өгөх үү?', message: 'Олоогүй үгсийн байрлал харагдаж, тоглоом дуусна. Олсон үгсийн оноо тань хадгалагдана.', confirmText: 'Бууж өгөх', danger: true });
      if (!ok) return;
      const r = await this.move({ giveup: true });
      if (r) this.set(r.game);
    },

    /* ─ Үнэн үү, худал уу ─ */
    truth(s) {
      if (s.completed) return '';
      const c = s.card;
      return html`
        <div class="quiz-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.index}"><span style="width:${(s.index / Math.max(1, s.total)) * 100}%"></span></div>
        <p class="muted small center">Асуулт ${s.index + 1}/${s.total}${s.streak >= 2 ? html` · <span class="streak">${icon('flame')} ${s.streak} дараалан</span>` : ''}</p>
        <div class="tf-card" id="tf-card">
          <div class="tf-word">${c ? c.word : ''}</div>
          <div class="tf-clue">${icon('book')}<p>${c ? c.clue : ''}</p></div>
          <div class="tf-verdict" id="tf-verdict" aria-live="polite"></div>
        </div>
        <div class="tf-actions">
          <button type="button" class="tf-btn tf-no" data-truth="0">${icon('x')}<span>Худал</span></button>
          <button type="button" class="tf-btn tf-yes" data-truth="1">${icon('check')}<span>Үнэн</span></button>
        </div>
        <p class="muted small center kb-hint">Компьютер дээр ← худал, → үнэн</p>`;
    },

    async answerTruth(v) {
      const s = this.s;
      if (!s || s.game !== 'truth' || s.completed || this.busy) return;
      $$('.tf-btn').forEach((b) => { b.disabled = true; });
      const r = await this.move({ answer: v });
      if (!r) { $$('.tf-btn').forEach((b) => { b.disabled = false; }); return; }
      const m = r.move;
      const card = $('#tf-card'), verdict = $('#tf-verdict');
      if (card) card.classList.add(m.correct ? 'good' : 'bad');
      if (verdict) {
        verdict.innerHTML = String(html`${icon(m.correct ? 'check' : 'x')} <b>${m.correct ? `Зөв! +${m.gain}` : 'Буруу'}</b>
          <span>${m.truth ? 'Энэ тайлбар яг энэ үгийнх.' : html`Энэ бол <b>${m.real}</b> гэдэг үгийн тайлбар.`}</span>`);
      }
      if (!m.correct) buzz(40);
      await sleep(m.correct ? 700 : 1500);
      if (Router.current === 'g' && this.game === 'truth') this.set(r.game);
    },

    /* ─ Үр дүн ─ */
    result(s) {
      const won = s.is_won;
      const record = s.score > 0 && s.best != null && s.score >= s.best;
      const titles = {
        quiz: won ? 'Гайхалтай! 🎉' : 'Сайн оролдлого!',
        truth: won ? 'Гайхалтай! 🎉' : 'Сайн оролдлого!',
        search: won ? 'Бүгдийг оллоо! 🎉' : 'Тоглоом дууслаа',
        duo: won ? 'Хоёуланг нь таалаа! 🎉' : s.solved && s.solved.some(Boolean) ? 'Нэгийг нь таалаа!' : 'Энэ удаа бүтсэнгүй',
      };
      const title = titles[s.game] || (won ? 'Таалаа! 🎉' : 'Энэ удаа бүтсэнгүй');
      let detail = '';
      if (s.game === 'anagram') detail = Result.answerBlock(s.answer, s.definition, won);
      else if (s.game === 'duo') detail = html`<div class="duo-answers">${Result.answerBlock(s.answer, s.definition, s.solved[0])}${Result.answerBlock(s.answer2, s.definition2, s.solved[1])}</div>`;
      else if (s.game === 'quiz' || s.game === 'truth') {
        detail = html`<p class="center"><b>${s.correct}/${s.total}</b> зөв хариулт</p>
          <ul class="quiz-hist">${s.history.map((h) => html`<li class="${h.ok ? 'ok' : ''}">${icon(h.ok ? 'check' : 'x')}<span>${h.w}</span></li>`)}</ul>`;
      } else if (s.game === 'search') detail = html`<p class="center muted">${s.words.filter((w) => w.found).length}/${s.words.length} үг олсон</p>`;
      return html`<div class="card mini-result ${won ? 'won' : ''}" aria-live="polite">
        <div class="mr-title">${title}</div>
        ${detail}
        <div class="mr-score">${s.score > 0 ? `+${fmt(s.score)} оноо` : '0 оноо'}</div>
        ${record ? html`<div class="mr-record">${icon('trophy')} Шинэ дээд амжилт!</div>` : s.best ? html`<div class="muted small">Таны шилдэг: ${fmt(s.best)}</div>` : ''}
        <div class="modal-actions">
          <a class="btn btn-ghost" href="#/games">${icon('gamepad')} Бусад</a>
          <button class="btn btn-primary" type="button" data-action="mini-start">${icon('refresh')} Дахин тоглох</button>
        </div>
        <p class="muted small">Enter — дахин тоглох</p>
      </div>${sponsorCard()}`;
    },

    redrawBuilder() {
      const box = $('#bld');
      if (!box) return;
      box.innerHTML = String(Builder.view(this.b));
      const sub = $('#mini-submit');
      if (sub) sub.disabled = !Builder.full(this.b);
    },

    async move(body) {
      if (this.busy || !this.s || this.s.completed) return null;
      this.busy = true;
      try {
        return await Api.post('mini_move', { id: this.s.id, ...body });
      } catch (e) {
        Toast.error(e);
        if (e.status === 409) this.open(this.game);
        return null;
      } finally {
        this.busy = false;
      }
    },

    async letter(ch) {
      if (!this.s || this.s.game !== 'hangman' || this.s.completed) return;
      if (this.s.guessed.some((x) => x.l === ch)) return;
      const r = await this.move({ letter: ch });
      if (!r) return;
      if (!r.move.hit) buzz(40);
      this.set(r.game);
    },

    async submitAnagram() {
      if (!this.s || this.s.game !== 'anagram' || !Builder.full(this.b)) return;
      const r = await this.move({ guess: Builder.word(this.b) });
      if (!r) return;
      if (!r.move.ok && !r.game.completed) {
        Builder.shake();
        Toast.show('Буруу байна — дахин оролдоорой');
        setTimeout(() => this.set(r.game), 450);
        return;
      }
      this.set(r.game);
    },

    async hint() {
      const r = await this.move({ hint: true });
      if (r) this.set(r.game);
    },

    async choose(i, btn) {
      if (!this.s || this.s.game !== 'quiz' || this.busy) return;
      $$('.quiz-opt').forEach((b) => { b.disabled = true; });
      const r = await this.move({ choice: i });
      if (!r) { $$('.quiz-opt').forEach((b) => { b.disabled = false; }); return; }
      const opts = $$('.quiz-opt');
      if (opts[r.move.right]) opts[r.move.right].classList.add('good');
      if (!r.move.correct) { btn.classList.add('bad'); buzz(40); }
      await sleep(r.move.correct ? 550 : 1100);
      if (Router.current === 'g' && this.game === 'quiz') this.set(r.game);
    },

    // Хуудас доторх гар, товч
    pool(i) { if (this.s && this.s.game === 'anagram' && !this.s.completed && Builder.pick(this.b, i)) this.redrawBuilder(); },
    slot(k) { if (this.s && this.s.game === 'anagram' && Builder.unpick(this.b, k)) this.redrawBuilder(); },
    key(ch) {
      const s = this.s;
      if (!s || s.completed) return;
      if (s.game === 'hangman') this.letter(ch);
      else if (s.game === 'anagram') { if (Builder.pickChar(this.b, ch)) this.redrawBuilder(); }
      else if (s.game === 'duo') this.duoKey(ch);
    },
    special(e) {
      const s = this.s;
      if (!s || s.completed) return false;
      if (s.game === 'quiz' && /^[1-4]$/.test(e.key)) {
        const b = $(`.quiz-opt[data-choice="${Number(e.key) - 1}"]`);
        if (b && !b.disabled) this.choose(Number(e.key) - 1, b);
        return true;
      }
      if (s.game === 'truth' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { this.answerTruth(e.key === 'ArrowRight'); return true; }
      if (s.game === 'search' && e.key === 'Escape') { this.sel = null; this.markSel(); return true; }
      return false;
    },
    backspace() {
      const s = this.s;
      if (!s || s.completed) return;
      if (s.game === 'anagram' && Builder.back(this.b)) this.redrawBuilder();
      if (s.game === 'duo') this.duoKey('back');
    },
    enter() {
      const s = this.s;
      if (!s) return;
      if (s.completed) { this.start(); return; }
      if (s.game === 'anagram') this.submitAnagram();
      if (s.game === 'duo') this.submitDuo();
    },
  };

  /* ── Blitz арена ──────────────────────────────────────── */
  const Blitz = {
    run: null,
    arena: null,
    allow: null,
    b: null,
    timer: null,
    deadline: 0,
    busy: false,
    el() { return $('#page-g'); },
    stop() { clearInterval(this.timer); this.timer = null; },

    /* ─── Дуэль ─── */
    mode: 'arena',
    duels: null,
    stake: 1000,

    async openDuel(code = null) {
      this.stop();
      this.mode = 'duel';
      this.lastDuel = null;
      this.run = null;
      const el = this.el();
      el.innerHTML = html`${miniHead('duel')}${skeleton(4)}`;
      try {
        const r = await Api.get('duels');
        if (Mini.game !== 'blitz' || this.mode !== 'duel') return;
        this.duels = r;
        App.setBalance(r.balance);
        if (!r.stakes.includes(this.stake)) this.stake = r.stakes[Math.min(1, r.stakes.length - 1)];
        if (r.run) { this.begin(r.run); return; }
        if (code) {
          const d = await Api.get('duel', { code });
          this.duelInvite(d.duel);
          return;
        }
        this.duelLobby();
      } catch (e) {
        el.innerHTML = html`${miniHead('duel')}${errorBox(e, 'g')}`;
      }
    },

    duelStatus(d) {
      const left = Math.max(0, Math.round((new Date(d.expires_at.replace(' ', 'T') + '+08:00') - Date.now()) / 3600000));
      switch (d.status) {
        case 'open': return d.role === 'creator' ? html`<span class="badge badge-warn">Өрсөлдөгч хүлээж байна</span><small class="muted"> · ${left} цаг үлдсэн</small>` : html`<span class="badge">Нээлттэй</span>`;
        case 'active': return html`<span class="badge badge-warn">Тоглогдож байна</span>`;
        case 'expired': return html`<span class="badge">Хугацаа дууссан — буцаасан</span>`;
        default:
          if (d.result === 'won') return html`<span class="badge badge-good">Ялсан +${money(d.payout)}</span>`;
          if (d.result === 'tie') return html`<span class="badge">Тэнцсэн +${money(d.payout)}</span>`;
          return html`<span class="badge badge-bad">Ялагдсан</span>`;
      }
    },

    duelRow(d) {
      const opp = d.role === 'creator' ? d.opponent : d.creator;
      const score = d.my_score != null ? html`<b>${fmt(d.my_score)}</b>${d.their_score != null ? html` : ${fmt(d.their_score)}` : ''}` : '';
      return html`<li class="list-item duel-item">
        ${opp ? avatar(opp.avatar, opp.name, 36) : html`<span class="li-ic">${icon('swords')}</span>`}
        <span class="li-main">
          <span class="li-title">${opp ? opp.name : 'Өрсөлдөгч хүлээж байна'}</span>
          <span class="li-sub">${money(d.stake)} мөрий · ${this.duelStatus(d)}</span>
        </span>
        <span class="li-end">${score}${d.status === 'open' && d.role === 'creator'
          ? html`<button class="btn btn-ghost btn-xs" type="button" data-action="duel-share" data-code="${d.code}" data-stake="${d.stake}">${icon('share')} Урих</button>` : ''}</span>
      </li>`;
    },

    duelResultCard(run, d) {
      if (!d) return '';
      if (d.status === 'done') {
        const t = { won: ['Та ялалаа! 🎉', 'won'], lost: ['Энэ удаа ялагдлаа', ''], tie: ['Тэнцлээ!', ''] }[d.result] || ['Дууслаа', ''];
        return html`<div class="card mini-result ${t[1]}" aria-live="polite">
          <div class="mr-title">${t[0]}</div>
          <div class="duel-score"><span><small>Та</small><b>${fmt(d.my_score)}</b></span><span class="vs">VS</span><span><small>${(d.role === 'creator' ? d.opponent : d.creator)?.name || 'Өрсөлдөгч'}</small><b>${fmt(d.their_score)}</b></span></div>
          ${d.result !== 'lost' ? html`<div class="mr-score">+${money(d.payout)}</div>` : html`<p class="muted small">Дахин сорьж хожоорой!</p>`}
        </div>`;
      }
      return html`<div class="card mini-result" aria-live="polite">
        <div class="mr-title">Таны оноо: ${fmt(run ? run.score : d.my_score)}</div>
        <p class="muted">${d.status === 'open'
          ? 'Дуэль бэлэн боллоо. Хэн нэгэн сорилтыг хүлээж аваад тоглож дуусмагц үр дүн гарна.'
          : 'Өрсөлдөгч тоглож дуусмагц үр дүн гарч, мөнгө автоматаар хэтэвчинд орно.'}</p>
        ${d.status === 'open' ? html`<button class="btn btn-gold btn-block" type="button" data-action="duel-share" data-code="${d.code}" data-stake="${d.stake}">${icon('share')} Найзаа сорих — холбоос илгээх</button>` : ''}
      </div>`;
    },

    duelLobby(last = this.lastDuel) {
      const r = this.duels, c = App.config;
      const prize = (s) => s * 2 - Math.floor(s * 2 * (r.rake || 0) / 100);
      this.el().innerHTML = html`${miniHead('duel', r.stats.played ? html`<span class="chip"><span><b>${r.stats.won}</b>/${r.stats.played} ялалт</span></span>` : '')}
        ${last ? this.duelResultCard(last.run, last.duel) : ''}
        <div class="card duel-new">
          <div class="duel-hero">${icon('swords')}<div><b>Мөрийтэй 1 vs 1</b><small>Хоёулаа яг ижил холимог үгсийг 60 секундэд тайлна. Их оноотой нь санг авна.</small></div></div>
          <div class="field-label">Мөрийн дүн</div>
          <div class="stake-grid" role="radiogroup" aria-label="Мөрийн дүн">${r.stakes.map((s) => html`<button type="button" role="radio" class="stake ${s === this.stake ? 'active' : ''}" aria-checked="${String(s === this.stake)}" data-stake="${s}">${money(s)}</button>`)}</div>
          <div class="duel-prize"><span>Ялагч авна</span><b>${money(prize(this.stake))}</b></div>
          <button class="btn btn-gold btn-block btn-lg" type="button" data-action="duel-create">${icon('swords')} Дуэль үүсгээд тоглох</button>
          <p class="muted small center">Шимтгэл ${r.rake}%. Тэнцвэл сангаа хуваана. ${c.duel_expire_hours || 24} цагт хэн ч хүлээж авахгүй бол мөрий бүтнээрээ буцна.</p>
        </div>
        <h2 class="sub-h">Нээлттэй сорилтууд</h2>
        ${r.open.length ? html`<ul class="list">${r.open.map((d) => html`<li class="list-item">
            ${avatar(d.creator.avatar, d.creator.name, 38)}
            <span class="li-main"><span class="li-title">${d.creator.name}</span><span class="li-sub">Мөрий ${money(d.stake)} · ялагч ${money(d.prize)}</span></span>
            <button class="btn btn-primary btn-sm" type="button" data-action="duel-accept" data-code="${d.code}" data-stake="${d.stake}" data-name="${d.creator.name}">${icon('swords')} Сорих</button>
          </li>`)}</ul>`
          : html`<p class="muted small">Одоогоор нээлттэй сорилт алга. Өөрөө дуэль үүсгээд найзаа урь!</p>`}
        ${r.mine.length ? html`<h2 class="sub-h">Миний дуэлүүд</h2><ul class="list">${r.mine.map((d) => this.duelRow(d))}</ul>` : ''}
        ${r.stats.earned ? html`<p class="muted small center">Дуэлээс нийт хожсон: <b>${money(r.stats.earned)}</b></p>` : ''}
        ${sponsorCard()}`;
    },

    duelInvite(d) {
      if (d.role && d.status === 'done') {
        this.el().innerHTML = html`${miniHead('duel')}${this.duelResultCard(null, d)}<a class="btn btn-ghost btn-block" href="#/g/duel">Бүх дуэль</a>`;
        return;
      }
      const mineOrClosed = d.role || d.status !== 'open';
      this.el().innerHTML = html`${miniHead('duel')}
        <div class="card duel-invite">
          ${avatar(d.creator.avatar, d.creator.name, 72)}
          <h2>${d.role === 'creator' ? 'Таны дуэль' : html`${d.creator.name} таныг сорьж байна!`}</h2>
          <div class="duel-prize big"><span>Мөрий ${money(d.stake)}</span><b>Ялагч ${money(d.prize)}</b></div>
          ${mineOrClosed
            ? html`${d.role ? this.duelStatus(d) : html`<p class="muted">Энэ сорилтыг өөр хүн аль хэдийн хүлээж авсан эсвэл хугацаа нь дууссан байна.</p>`}
              ${d.status === 'open' && d.role === 'creator' ? html`<button class="btn btn-gold btn-block" type="button" data-action="duel-share" data-code="${d.code}" data-stake="${d.stake}">${icon('share')} Холбоос илгээх</button>` : ''}`
            : html`<p class="muted">Хоёулаа яг ижил холимог үгсийг 60 секундэд тайлна. Өрсөлдөгчийн оноо тоглож дуусахаас өмнө харагдахгүй.</p>
              <button class="btn btn-gold btn-block btn-lg" type="button" data-action="duel-accept" data-code="${d.code}" data-stake="${d.stake}" data-name="${d.creator.name}">${icon('swords')} Сорилт авах — ${money(d.stake)}</button>`}
          <a class="btn btn-ghost btn-block" href="#/g/duel">Бүх дуэль</a>
        </div>`;
    },

    async duelCreate(btn) {
      if (this.busy) return;
      const s = this.stake, r = this.duels;
      const prize = s * 2 - Math.floor(s * 2 * (r.rake || 0) / 100);
      const ok = await Modal.confirm({
        title: 'Дуэль үүсгэх',
        message: html`Хэтэвчнээс <b>${money(s)}</b> хасагдана. Та одоо шууд <b>60 секунд</b> тоглоно.<br><br>Өрсөлдөгч таны оноог мэдэхгүйгээр яг ижил үгсийг тоглоно. Ялбал <b>${money(prize)}</b> авна.`,
        confirmText: 'Эхлэх',
      });
      if (!ok) return;
      this.busy = true;
      if (btn) btn.disabled = true;
      try {
        const res = await Api.post('duel_create', { stake: s });
        App.setBalance(res.balance);
        this.pendingDuel = res.duel;
        this.begin(res.run);
      } catch (e) {
        moneyError(e);
      } finally {
        this.busy = false;
        if (btn && btn.isConnected) btn.disabled = false;
      }
    },

    async duelAccept(b) {
      if (this.busy) return;
      const ok = await Modal.confirm({
        title: 'Сорилт авах',
        message: html`<b>${b.dataset.name}</b>-ийн сорилт. Хэтэвчнээс <b>${money(Number(b.dataset.stake))}</b> хасагдаж, та шууд <b>60 секунд</b> тоглоно. Бэлэн үү?`,
        confirmText: 'Тоглох',
      });
      if (!ok) return;
      this.busy = true;
      b.disabled = true;
      try {
        const res = await Api.post('duel_accept', { code: b.dataset.code });
        App.setBalance(res.balance);
        this.pendingDuel = res.duel;
        this.begin(res.run);
      } catch (e) {
        moneyError(e);
        if (e.code === 'duel_taken') this.openDuel();
      } finally {
        this.busy = false;
        if (b.isConnected) b.disabled = false;
      }
    },

    duelShare(b) {
      const stake = Number(b.dataset.stake);
      const link = `${(App.config.app_url || location.origin + '/').replace(/\/$/, '')}/#/g/duel/${b.dataset.code}`;
      shareOrCopy(`⚔️ Би чамайг Үг Таа дээр ${money(stake)}-ийн мөрийтэй үгийн дуэльд урьж байна! Чадах уу?\n${link}`, 'Үг Таа — Дуэль');
    },

    pickStake(s) {
      if (!this.duels || this.mode !== 'duel' || this.run) return;
      this.stake = s;
      this.duelLobby(this.lastDuel);
    },

    lastResult: null,
    lastDuel: null,

    async refreshArena() {
      try {
        const r = await Api.get('blitz');
        if (Router.current !== 'g' || Mini.game !== 'blitz' || this.mode !== 'arena' || this.run || r.run) return;
        this.arena = r.arena;
        this.allow = r.allowance;
        this.lobby(this.lastResult);
      } catch { /* дараагийн удаа */ }
    },

    async refreshDuel() {
      try {
        const r = await Api.get('duels');
        if (Router.current !== 'g' || Mini.game !== 'blitz' || this.mode !== 'duel' || this.run || r.run) return;
        if (!$('.duel-new')) return;   // Урилгын хуудсыг хөндөхгүй
        this.duels = r;
        App.setBalance(r.balance);
        if (this.lastDuel && this.lastDuel.duel) {
          const fresh = r.mine.find((d) => d.code === this.lastDuel.duel.code);
          if (fresh) {
            if (fresh.status === 'done' && this.lastDuel.duel.status !== 'done' && fresh.result === 'won') setTimeout(() => Confetti.burst(), 200);
            this.lastDuel.duel = fresh;
          }
        }
        this.duelLobby(this.lastDuel);
      } catch { /* дараагийн удаа */ }
    },

    async open() {
      this.stop();
      this.mode = 'arena';
      this.lastResult = null;
      this.run = null;
      const el = this.el();
      el.innerHTML = html`${miniHead('blitz')}${skeleton(4)}`;
      try {
        const r = await Api.get('blitz');
        if (Mini.game !== 'blitz') return;
        this.arena = r.arena;
        this.allow = r.allowance;
        if (r.run) this.begin(r.run);
        else this.lobby();
      } catch (e) {
        el.innerHTML = html`${miniHead('blitz')}${errorBox(e, 'g')}`;
      }
    },

    lobby(last = null) {
      const a = this.arena, c = App.config, al = this.allow;
      const split = c.blitz_split || [50, 30, 20];
      const rankedLabel = a.free_left > 0 ? 'Premium — үнэгүй' : money(a.fee);
      this.el().innerHTML = html`${miniHead('blitz', allowanceChip(al, true))}
        ${last ? html`<div class="card mini-result ${last.solved > 0 ? 'won' : ''}">
          <div class="mr-title">${last.ranked ? 'Оноотой тоглолт дууслаа' : 'Дасгал дууслаа'}</div>
          <div class="blitz-final"><b>${fmt(last.score)}</b><small>оноо</small></div>
          <p class="center muted">${last.solved} үг тайлсан · ${last.skipped} алгассан${last.ranked && a.me && a.me.rank ? ` · өнөөдөр #${a.me.rank}` : ''}</p>
        </div>` : ''}
        <div class="t-hero arena-hero">
          <div class="t-top"><span class="chip chip-live"><span class="pulse-dot"></span> ${fmtDate(a.date)}</span><span class="muted">${a.participants} оролцогч</span></div>
          <div class="t-pool-l">Шагналын сан</div>
          <div class="t-pool">${money(a.pool)}</div>
          <div class="t-prizes">${a.prizes.map((p, i) => html`<div class="t-prize"><span class="pod-medal sm m${i + 1}">${i + 1}</span><b>${money(p)}</b><small>${split[i]}%</small></div>`)}</div>
          ${a.me ? html`<div class="t-joined">${icon('zap')}<span>Таны шилдэг: <b>${fmt(a.me.best)}</b>${a.me.rank ? ` · #${a.me.rank}` : ''} · ${a.me.runs} тоглолт</span></div>` : ''}
          <button class="btn btn-gold btn-block btn-lg" type="button" data-action="blitz-start" data-ranked="1">${icon('zap')} Оноотой тоглох — ${rankedLabel}</button>
          <button class="btn btn-ghost btn-block" type="button" data-action="blitz-start" data-ranked="0">Дасгал — шагналгүй</button>
          <p class="muted small center">Хэдэн ч удаа тоглож болно, хамгийн сайн оноо тань тооцогдоно. Хураамжийн ${100 - (c.blitz_rake ?? 25)}% шагналын санд орж, маргааш 00:05-аас хойш шилдэг 3-т автоматаар олгогдоно.</p>
        </div>
        <div class="card"><ul class="mi-rules">
          <li>${icon('clock')}<span><b>${c.blitz_seconds || 60} секунд</b> — аль болох олон холимог үг тайл.</span></li>
          <li>${icon('star')}<span>Үг бүр <b>үсэг × 10</b> оноо. Ижил үсэгтэй өөр жинхэнэ үг ч тооцогдоно.</span></li>
          <li>${icon('skip')}<span>Хэцүү үгийг алгасаж болно — оноо хасагдахгүй, цаг л зарцуулна.</span></li>
        </ul></div>
        <h2 class="sub-h">Өнөөдрийн шилдэгүүд</h2>
        ${a.leaders.length ? html`<ol class="list">${a.leaders.map((x) => html`
          <li class="list-item ${x.user_id === App.user.id ? 'me' : ''}">
            <span class="rank">${x.rank}</span>
            ${avatar(x.avatar_url, x.username, 36)}
            <span class="li-main"><span class="li-title">${x.username}</span><span class="li-sub">${x.runs} тоглолт</span></span>
            <span class="li-end"><b>${fmt(x.best)}</b><small>оноо</small></span>
          </li>`)}</ol>` : html`<p class="muted small center">Өнөөдөр хэн ч оноотой тоглоогүй байна — эхний байрыг эзэл!</p>`}
        ${a.yesterday.length ? html`<h2 class="sub-h">Өчигдрийн ялагчид</h2>
          <div class="card"><ul class="winners">${a.yesterday.map((w, i) => html`<li><span class="pod-medal sm m${i + 1}">${i + 1}</span>${avatar(w.avatar_url, w.username, 26)}<span class="w-name">${w.username}</span><b>+${money(w.prize_won)}</b></li>`)}</ul></div>` : ''}
        ${sponsorCard()}`;
    },

    async start(ranked, btn) {
      if (this.busy) return;
      const a = this.arena;
      if (ranked && a.free_left <= 0) {
        const ok = await Modal.confirm({
          title: 'Оноотой тоглолт',
          message: html`Хэтэвчнээс <b>${money(a.fee)}</b> хасагдана. Эхэлмэгц ${App.config.blitz_seconds || 60} секундийн цаг явж эхэлнэ. Бэлэн үү?`,
          confirmText: 'Эхлэх',
        });
        if (!ok) return;
      }
      this.busy = true;
      if (btn) btn.disabled = true;
      try {
        const r = await withPay('blitz_start', { ranked });
        if (!r) return;
        this.allow = r.allowance;
        if (App.user && r.balance !== App.user.balance) App.setBalance(r.balance);
        this.begin(r.run);
      } catch (e) {
        moneyError(e);
      } finally {
        this.busy = false;
        if (btn && btn.isConnected) btn.disabled = false;
      }
    },

    begin(run) {
      this.run = run;
      this.deadline = performance.now() + run.left * 1000;
      this.b = run.current ? Builder.make(run.current.letters) : null;
      this.render();
      this.stop();
      this.timer = setInterval(() => this.tick(), 100);
      this.tick();
    },

    left() { return Math.max(0, this.deadline - performance.now()) / 1000; },

    tick() {
      const left = this.left();
      const t = $('#blitz-time');
      if (t) t.textContent = left.toFixed(left < 10 ? 1 : 0);
      const bar = $('#blitz-bar');
      if (bar) {
        bar.style.width = (left / (this.run.seconds || 60)) * 100 + '%';
        bar.classList.toggle('low', left < 10);
      }
      if (left <= 0) this.finish();
    },

    render() {
      const r = this.run;
      const duel = this.mode === 'duel';
      this.el().innerHTML = html`${miniHead(duel ? 'duel' : 'blitz', html`<span class="chip ${r.ranked ? 'chip-gold' : ''}">${duel ? 'Дуэль' : r.ranked ? 'Оноотой' : 'Дасгал'}</span>`)}
        <div class="blitz-hud">
          <div class="bh-time"><b id="blitz-time">${Math.ceil(r.left)}</b><small>сек</small></div>
          <div class="bh-score"><b id="blitz-score">${fmt(r.score)}</b><small>оноо · ${r.solved} үг</small></div>
        </div>
        <div class="blitz-track"><span id="blitz-bar"></span></div>
        <div id="bld">${this.b ? Builder.view(this.b) : ''}</div>
        <div class="mini-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="bld-shuffle">${icon('shuffle')} Холих</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="bld-clear">${icon('backspace')} Арилгах</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="blitz-skip">${icon('skip')} Алгасах</button>
        </div>
        <p class="muted small center">Бүх үсгийг байрлуулмагц автоматаар шалгана.</p>`;
    },

    redrawBuilder() {
      const box = $('#bld');
      if (box && this.b) box.innerHTML = String(Builder.view(this.b));
      if (this.b && Builder.full(this.b)) this.answer();
    },

    apply(run) {
      this.run = run;
      if (run.finished) { this.finish(); return; }
      this.b = run.current ? Builder.make(run.current.letters) : null;
      const box = $('#bld');
      if (box) box.innerHTML = this.b ? String(Builder.view(this.b)) : '';
      const sc = $('#blitz-score');
      if (sc) sc.textContent = fmt(run.score);
      const sub = $('.bh-score small');
      if (sub) sub.textContent = `оноо · ${run.solved} үг`;
    },

    async answer() {
      if (this.busy || !this.run || !this.b) return;
      this.busy = true;
      try {
        const r = await Api.post('blitz_answer', { id: this.run.id, guess: Builder.word(this.b) });
        if (!this.run || this.finishing) return;
        if (r.move.ok) {
          buzz([15, 30, 15]);
          const box = $('.bld-slots');
          if (box) box.classList.add('solved');
          await sleep(180);
          this.apply(r.run);
        } else if (r.move.over || r.run.finished) {
          this.run = r.run;
          this.finish();
        } else {
          Builder.shake();
          setTimeout(() => { if (this.b) { Builder.clear(this.b); this.redrawBuilder(); } }, 380);
        }
      } catch (e) {
        Toast.error(e);
      } finally {
        this.busy = false;
      }
    },

    async skip() {
      if (this.busy || !this.run) return;
      this.busy = true;
      try {
        const r = await Api.post('blitz_answer', { id: this.run.id, skip: true });
        if (!this.run || this.finishing) return;
        if (r.move.word) Toast.show(`Хариулт: ${r.move.word}`, 'info', 1600);
        this.apply(r.run);
      } catch (e) {
        Toast.error(e);
      } finally {
        this.busy = false;
      }
    },

    async finish() {
      if (!this.run || this.finishing) return;
      this.stop();
      this.finishing = true;
      const id = this.run.id;
      try {
        const r = await Api.post('blitz_finish', { id });
        this.arena = r.arena;
        if (r.balance != null) App.setBalance(r.balance);
        if (this.mode === 'duel') {
          if (Router.current === 'g' && Mini.game === 'blitz') {
            try { this.duels = await Api.get('duels'); App.setBalance(this.duels.balance); } catch { /* өмнөх жагсаалтаар харуулна */ }
            this.lastDuel = { run: r.run, duel: r.duel || this.pendingDuel };
            this.duelLobby(this.lastDuel);
            Live.soon(1500);
            window.scrollTo(0, 0);
            if (r.duel && r.duel.result === 'won') setTimeout(() => Confetti.burst(), 200);
          }
          this.pendingDuel = null;
          return;
        }
        if (Router.current === 'g' && Mini.game === 'blitz') {
          this.lastResult = r.run;
          this.lobby(r.run);
          if (r.run.solved > 0) setTimeout(() => Confetti.burst(), 200);
        }
        if (r.run.ranked) Toast.show(`Blitz: ${fmt(r.run.score)} оноо`, 'success');
      } catch (e) {
        Toast.error(e);
        if (Router.current === 'g' && Mini.game === 'blitz') this.open();
      } finally {
        this.run = null;
        this.b = null;
        this.finishing = false;
      }
    },

    pool(i) { if (this.b && Builder.pick(this.b, i)) this.redrawBuilder(); },
    slot(k) { if (this.b && Builder.unpick(this.b, k)) this.redrawBuilder(); },
    key(ch) { if (this.b && Builder.pickChar(this.b, ch)) this.redrawBuilder(); },
    backspace() { if (this.b && Builder.back(this.b)) this.redrawBuilder(); },
    enter() { if (this.b && Builder.full(this.b)) this.answer(); },
  };

  Pages.g = { show(args) { Mini.open(args[0], args[1]); } };

  /* ── Хэтэвч ────────────────────────────────────────────── */
  const TX = {
    win: ['trophy', 'Өдрийн шагнал'], referral: ['users', 'Урилгын урамшуулал'], withdrawal: ['wallet', 'Мөнгө татсан'],
    withdrawal_refund: ['refresh', 'Таталт буцаав'], tournament_fee: ['target', 'Тэмцээний хураамж'],
    tournament_prize: ['trophy', 'Тэмцээний шагнал'], tournament_refund: ['refresh', 'Тэмцээний буцаалт'],
    premium: ['crown', 'Premium'], admin_adjust: ['shield', 'Засвар'],
    hint: ['bulb', 'Сэжүүр'], mini_play: ['gamepad', 'Нэмэлт тоглолт'], blitz_fee: ['zap', 'Blitz хураамж'],
    duel_stake: ['swords', 'Дуэлийн мөрий'], duel_win: ['trophy', 'Дуэль ялсан'], duel_refund: ['refresh', 'Дуэлийн буцаалт'], revive: ['heart', 'Сэргээх'],
    blitz_prize: ['trophy', 'Blitz шагнал'], blitz_refund: ['refresh', 'Blitz буцаалт'], topup: ['banknote', 'Хэтэвч цэнэглэлт'], tournament: ['target', 'Тэмцээн'], deposit: ['wallet', 'Гүйлгээ'],
  };
  const WD_STATUS = { pending: ['Хүлээгдэж байна', 'warn'], approved: ['Шилжүүлсэн', 'good'], rejected: ['Цуцлагдсан', 'bad'] };

  Pages.wallet = {
    async show() {
      const el = $('#page-wallet');
      if (!el.innerHTML.trim()) el.innerHTML = html`${pageHead('Хэтэвч')}${skeleton(4)}`;
      try {
        const r = await Api.get('wallet');
        App.patchUser(r.user);
        const u = r.user, q = r.requirements, c = App.config;
        const checks = [
          [u.balance >= q.min_withdrawal, `Үлдэгдэл ${money(q.min_withdrawal)}-с их`, `${money(u.balance)}`],
          [q.verified_referrals >= q.referral_unlock, `${q.referral_unlock} найз урьж баталгаажуулсан`, `${q.verified_referrals}/${q.referral_unlock}`],
          [!q.has_pending, 'Хүлээгдэж буй хүсэлт байхгүй', q.has_pending ? '1 хүлээгдэж байна' : ''],
        ];
        const canWithdraw = checks.every((x) => x[0]);
        const banks = Object.entries(c.banks || {});
        el.innerHTML = html`${pageHead('Хэтэвч')}
          <div class="wallet-hero">
            <div class="wh-l">Үлдэгдэл</div>
            <div class="wh-v">${money(u.balance)}</div>
            <div class="wh-sub"><span>Нийт хожсон <b>${money(u.won_balance)}</b></span><span>Урамшуулал <b>${money(u.referral_balance)}</b></span></div>
            <a class="btn btn-gold btn-block wh-btn" href="#/topup">${icon('plus')} Хэтэвч цэнэглэх</a>
          </div>
          ${r.deposits ? r.deposits.pending.map((d) => html`<a class="note note-wait note-link" href="#/topup">${icon('clock')}<span>Цэнэглэлт <b>${money(d.amount)}</b> шалгагдаж байна · <span class="mono">${d.reference}</span></span>${icon('right')}</a>`) : ''}

          <div class="card">
            <h2 class="card-h">Мөнгө татах</h2>
            <ul class="checklist">${checks.map(([ok, label, v]) => html`<li class="${ok ? 'ok' : ''}">${icon(ok ? 'check' : 'lock')}<span>${label}</span><small>${v}</small></li>`)}</ul>
            ${q.verified_referrals < q.referral_unlock ? html`<a class="note note-link" href="#/referral">${icon('users')} Найзаа урих — дахиад ${q.referral_unlock - q.verified_referrals} найз${icon('right')}</a>` : ''}
            ${canWithdraw ? '' : html`<p class="muted small">Дээрх шаардлагуудыг хангамагц банкны данс руугаа татах маягт энд нээгдэнэ.</p>`}
            <form class="form" id="wd-form" ${canWithdraw ? '' : raw('data-locked="1" hidden')}>
              <label class="field"><span class="field-label">Банк</span>
                <select class="input" name="bank" required><option value="">Банк сонгох</option>${banks.map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
              <label class="field"><span class="field-label">Дансны дугаар</span>
                <input class="input" name="account_number" inputmode="numeric" autocomplete="off" placeholder="5000123456 эсвэл MN12…" required></label>
              <label class="field"><span class="field-label">Дансны эзэмшигчийн нэр</span>
                <input class="input" name="account_name" autocomplete="name" placeholder="Банкинд бүртгэлтэй нэр" required></label>
              <label class="field"><span class="field-label">Дүн (₮)</span>
                <span class="input-group"><input class="input" name="amount" type="number" inputmode="numeric" min="${q.min_withdrawal}" max="${Math.min(u.balance, c.max_withdrawal)}" step="1000" placeholder="${q.min_withdrawal}" required>
                <button class="btn btn-ghost btn-sm" type="button" data-action="wd-max">Бүгд</button></span></label>
              <button class="btn btn-primary btn-block" type="submit" ${canWithdraw ? '' : raw('disabled')}>${canWithdraw ? 'Татах хүсэлт илгээх' : html`${icon('lock')} Шаардлага хангаагүй`}</button>
            </form>
          </div>

          ${r.withdrawals.length ? html`<h2 class="sub-h">Таталтын хүсэлтүүд</h2>
            <ul class="list">${r.withdrawals.map((w) => html`<li class="list-item">
              <span class="li-ic">${icon('wallet')}</span>
              <span class="li-main"><span class="li-title">${w.bank_label} · ${w.account_number}</span><span class="li-sub">${fmtDateTime(w.requested_at)}${w.admin_note ? ' · ' + w.admin_note : ''}</span></span>
              <span class="li-end"><b>${money(w.amount)}</b><span class="badge badge-${WD_STATUS[w.status] ? WD_STATUS[w.status][1] : ''}">${WD_STATUS[w.status] ? WD_STATUS[w.status][0] : w.status}</span></span>
            </li>`)}</ul>` : ''}

          <h2 class="sub-h">Гүйлгээний түүх</h2>
          ${r.transactions.length ? html`<ul class="list">${r.transactions.map((t) => {
            const [ic, label] = TX[t.type] || ['wallet', t.type];
            return html`<li class="list-item">
              <span class="li-ic ${t.amount > 0 ? 'pos' : ''}">${icon(ic)}</span>
              <span class="li-main"><span class="li-title">${label}</span><span class="li-sub">${t.description} · ${fmtDateTime(t.created_at)}</span></span>
              <span class="li-end"><b class="${t.amount > 0 ? 'pos' : ''}">${signedMoney(t.amount)}</b></span>
            </li>`;
          })}</ul>` : empty('wallet', 'Гүйлгээ алга', 'Өдрийн үгээ тааж анхны шагналаа аваарай!', html`<a class="btn btn-primary btn-sm" href="#/play">Тоглох</a>`)}`;
      } catch (e) {
        el.innerHTML = html`${pageHead('Хэтэвч')}${errorBox(e, 'wallet')}`;
      }
    },

    async submit(form) {
      if (form.dataset.locked) return;
      const d = Object.fromEntries(new FormData(form).entries());
      d.amount = parseInt(d.amount, 10) || 0;
      if (!d.bank) return Toast.show('Банкаа сонгоно уу', 'error');
      if (!d.account_number || !d.account_name) return Toast.show('Дансны мэдээллээ бөглөнө үү', 'error');
      if (d.amount < App.config.min_withdrawal) return Toast.show(`Хамгийн багадаа ${money(App.config.min_withdrawal)}`, 'error');
      const bankName = (App.config.banks || {})[d.bank] || d.bank;
      const ok = await Modal.confirm({
        title: 'Мөнгө татах',
        message: html`<b>${money(d.amount)}</b>-г <b>${bankName}</b>-ны <b>${d.account_number}</b> данс руу (<b>${d.account_name}</b>) шилжүүлэх хүсэлт илгээх үү?<br><small class="muted">Нэр, дансаа сайтар шалгаарай.</small>`,
        confirmText: 'Илгээх',
      });
      if (!ok) return;
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const r = await Api.post('withdraw', d);
        App.setBalance(r.balance);
        Toast.show(r.message, 'success', 4000);
        this.show();
      } catch (e) {
        Toast.error(e);
        btn.disabled = false;
      }
    },
  };

  /* ── Хэтэвч цэнэглэх ───────────────────────────────────── */
  const DEP_STATUS = {
    submitted: ['Шалгагдаж байна', 'warn'], approved: ['Орсон', 'good'], rejected: ['Татгалзсан', 'bad'],
    created: ['Төлөөгүй', ''], expired: ['Хугацаа дууссан', ''], cancelled: ['Цуцалсан', ''],
  };

  Pages.topup = {
    data: null,
    changing: false,

    head() {
      return html`<a class="back-link" href="#/wallet">${icon('left')} Хэтэвч</a>
        ${pageHead('Хэтэвч цэнэглэх', 'Банкны аппаараа шилжүүлээд баталгаажуулна. Админ шалгаж баталгаажуулмагц хэтэвчинд тань орно.')}`;
    },

    async show() {
      const el = $('#page-topup');
      if (!el.innerHTML.trim()) el.innerHTML = html`${this.head()}${skeleton(3)}`;
      try {
        this.data = (await Api.get('deposit_info')).deposit;
        this.changing = false;
        this.render();
      } catch (e) {
        el.innerHTML = html`${this.head()}${errorBox(e, 'topup')}`;
      }
    },

    render() {
      const d = this.data;
      const el = $('#page-topup');
      if (!d.enabled) {
        el.innerHTML = html`${this.head()}${App.user && App.user.is_admin
          ? this.setup()
          : empty('lock', 'Цэнэглэлт түр хаалттай', 'Админ хүлээн авах дансаа тохируулмагц энд нээгдэнэ. Асуух зүйл байвал админтай холбогдоно уу.')}${this.history()}`;
        return;
      }
      el.innerHTML = html`${this.head()}${d.open && !this.changing ? this.transfer(d.open, d.bank) : this.picker()}${this.history()}`;
    },

    /** Админд: хүлээн авах дансаа энд шууд тохируулж цэнэглэлтийг нээнэ */
    setup() {
      const banks = Object.entries(App.config.banks || {});
      return html`<div class="card form-card">
        <div class="setup-hero">${icon('banknote')}<div><b>Цэнэглэлтийг идэвхжүүлэх</b><small>Хэрэглэгчид энэ данс руу мөнгө шилжүүлж, та баталгаажуулмагц хэтэвчинд нь орно. Зөвхөн админд харагдана.</small></div></div>
        <form class="form" data-form="deposit-setup" novalidate>
          <label class="field"><span class="field-label">Банк</span>
            <select class="input" name="deposit_bank" required><option value="">Сонгох</option>${banks.map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
          <label class="field"><span class="field-label">Данс эзэмшигчийн нэр</span>
            <input class="input" name="deposit_account_name" maxlength="100" placeholder="Жишээ: Бат-Эрдэнэ Б." required></label>
          <label class="field"><span class="field-label">Дансны дугаар</span>
            <input class="input mono" name="deposit_account_number" inputmode="numeric" placeholder="5000123456" required></label>
          <label class="field"><span class="field-label">IBAN <small class="muted">(заавал биш)</small></span>
            <input class="input mono" name="deposit_iban" placeholder="MN12 3456 7890 1234 5678"></label>
          <button class="btn btn-gold btn-block btn-lg" type="submit">${icon('check')} Хадгалаад цэнэглэлтийг нээх</button>
          <p class="muted small center">Дараа нь Админ → Тохиргоо хэсгээс өөрчилж болно. Цэнэглэлтийн хүсэлтийг Telegram-аар авах бол тэнд Telegram-аа холбоно уу.</p>
        </form>
      </div>`;
    },

    async saveSetup(f) {
      const v = (n) => f.elements[n].value.trim();
      for (const n of ['deposit_bank', 'deposit_account_name', 'deposit_account_number']) {
        if (!v(n)) { f.elements[n].classList.add('invalid'); f.elements[n].focus(); return; }
      }
      const btn = $('button[type=submit]', f);
      btn.disabled = true;
      try {
        const r = await Api.post('admin_settings_save', {
          deposit_enabled: true, deposit_bank: v('deposit_bank'), deposit_account_name: v('deposit_account_name'),
          deposit_account_number: v('deposit_account_number'), deposit_iban: v('deposit_iban'),
        });
        Toast.show(r.ready ? 'Цэнэглэлт нээгдлээ! Хэрэглэгчид одоо хэтэвчээ цэнэглэж болно.' : r.message, r.ready ? 'success' : 'info', 5000);
        this.show();
      } catch (e) {
        Toast.error(e);
      } finally {
        if (btn.isConnected) btn.disabled = false;
      }
    },

    picker() {
      const d = this.data, c = App.config;
      const pending = d.recent.filter((x) => x.status === 'submitted');
      return html`
        ${pending.map((p) => html`<div class="note note-wait">${icon('clock')}<span><b>${money(p.amount)}</b> шалгагдаж байна · <span class="mono">${p.reference}</span></span></div>`)}
        <ol class="stepper"><li class="cur">Дүн</li><li>Шилжүүлэх</li><li>Баталгаажуулах</li></ol>
        <div class="card">
          <h2 class="card-h">Хэдийг цэнэглэх вэ?</h2>
          <div class="amount-grid">${d.presets.map((v) => html`<button type="button" class="amount-chip ${d.open && d.open.amount === v ? 'active' : ''}" data-topup-amount="${v}">${money(v)}</button>`)}</div>
          <form class="form" data-form="topup-create" novalidate>
            <label class="field"><span class="field-label">Эсвэл өөр дүн (₮)</span>
              <input class="input" name="amount" type="number" inputmode="numeric" min="${d.min}" max="${d.max}" step="500" placeholder="${d.min}" value="${d.open ? d.open.amount : ''}" required></label>
            <button class="btn btn-primary btn-block btn-lg" type="submit">Үргэлжлүүлэх ${icon('arrow')}</button>
            <p class="muted small center">Хамгийн бага ${money(d.min)} · хамгийн их ${money(d.max)}</p>
          </form>
        </div>
        <div class="hint-row">${icon('crown')}<span>Premium ${money(c.premium_price)} · Тэмцээний хураамж ${money(c.tournament_fee)}</span></div>`;
    },

    transfer(o, b) {
      const rows = [
        ['Банк', b.bank, null],
        ['Хүлээн авагч', b.account_name, b.account_name],
        ['Дансны дугаар', b.account_number, b.account_number],
        b.iban ? ['IBAN', b.iban.replace(/(.{4})/g, '$1 ').trim(), b.iban] : null,
        ['Дүн', money(o.amount), String(o.amount)],
      ].filter(Boolean);
      return html`
        <ol class="stepper"><li class="done">Дүн</li><li class="cur">Шилжүүлэх</li><li>Баталгаажуулах</li></ol>
        <div class="card pay-card">
          <h2 class="card-h">Дараах данс руу шилжүүлнэ үү</h2>
          <dl class="pay-list">${rows.map(([k, v, copy]) => html`<div class="pay-item"><dt>${k}</dt><dd>${copy
            ? html`<button type="button" class="copy-row" data-copy="${copy}" aria-label="${k} хуулах"><span>${v}</span>${icon('copy')}</button>`
            : html`<span class="pay-static">${v}</span>`}</dd></div>`)}</dl>
        </div>
        <div class="ref-box">
          <div class="ref-box-l">Гүйлгээний утга <b>(заавал)</b></div>
          <button type="button" class="ref-box-code" data-copy="${o.reference}" aria-label="Гүйлгээний утга хуулах">${o.reference} ${icon('copy')}</button>
          <p>${icon('alert')}<span>Гүйлгээний утгыг яг ингэж бичээгүй бол таны төлбөрийг таних боломжгүй.</span></p>
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="button" data-action="topup-submit" data-id="${o.id}">${icon('check')} Шилжүүлсэн — баталгаажуулах</button>
        <div class="row-2 mt-10">
          <button class="btn btn-ghost" type="button" data-action="topup-change">Дүн өөрчлөх</button>
          <button class="btn btn-danger-ghost" type="button" data-action="topup-cancel" data-id="${o.id}">Цуцлах</button>
        </div>`;
    },

    history() {
      const list = this.data ? this.data.recent : [];
      if (!list.length) return '';
      return html`<h2 class="sub-h">Цэнэглэлтийн түүх</h2>
        <ul class="list">${list.map((x) => {
          const [label, tone] = DEP_STATUS[x.status] || [x.status, ''];
          return html`<li class="list-item">
            <span class="li-ic ${x.status === 'approved' ? 'pos' : ''}">${icon('banknote')}</span>
            <span class="li-main"><span class="li-title">${money(x.amount)}</span>
              <span class="li-sub"><span class="mono">${x.reference}</span> · ${fmtDateTime(x.submitted_at || x.created_at)}${x.status === 'rejected' && x.admin_note ? ' · ' + x.admin_note : ''}</span></span>
            <span class="badge badge-${tone}">${label}</span>
          </li>`;
        })}</ul>`;
    },

    async create(form) {
      const amount = parseInt(form.elements.amount.value, 10) || 0;
      const d = this.data;
      if (amount < d.min || amount > d.max) {
        form.elements.amount.classList.add('invalid');
        Toast.show(`${money(d.min)}–${money(d.max)} хооронд дүн оруулна уу`, 'error');
        return;
      }
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        this.data = (await Api.post('deposit_create', { amount })).deposit;
        this.changing = false;
        this.render();
        window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      } catch (e) {
        Toast.error(e);
        btn.disabled = false;
      }
    },

    async submit(id) {
      const o = this.data && this.data.open;
      if (!o) return;
      const ok = await Modal.confirm({
        title: 'Шилжүүлсэн үү?',
        message: html`Та <b>${money(o.amount)}</b>-г <b class="mono">${o.reference}</b> гүйлгээний утгатайгаар шилжүүлсэн үү?<br><small class="muted">Шилжүүлээгүй байхад баталгаажуулбал хүсэлт тань татгалзагдана.</small>`,
        confirmText: 'Тийм, шилжүүлсэн',
      });
      if (!ok) return;
      try {
        const r = await Api.post('deposit_submit', { id });
        this.data = r.deposit;
        this.changing = false;
        this.render();
        Toast.show(r.message, 'success', 5000);
      } catch (e) { Toast.error(e); }
    },

    async cancel(id) {
      const ok = await Modal.confirm({ title: 'Цэнэглэлт цуцлах', message: 'Энэ цэнэглэлтийн хүсэлтийг цуцлах уу? Мөнгө шилжүүлсэн бол цуцалж болохгүй.', confirmText: 'Цуцлах', danger: true });
      if (!ok) return;
      try {
        this.data = (await Api.post('deposit_cancel', { id })).deposit;
        this.render();
      } catch (e) { Toast.error(e); }
    },
  };

  /* ── Профайл ───────────────────────────────────────────── */
  Pages.profile = {
    async show() {
      const el = $('#page-profile');
      if (!el.innerHTML.trim()) el.innerHTML = skeleton(5);
      try {
        const r = await Api.get('profile');
        App.patchUser(r.user);
        App.stats = r.stats;
        const u = r.user, s = r.stats, c = App.config;
        const item = (href, ic, title, sub = '', cls = '') => html`<a class="menu-item ${cls}" href="${href}"><span class="li-ic">${icon(ic)}</span><span class="li-main"><span class="li-title">${title}</span>${sub ? html`<span class="li-sub">${sub}</span>` : ''}</span>${icon('right', 'chev')}</a>`;
        el.innerHTML = html`
          <div class="profile-head">
            ${avatar(u.avatar_url, u.username, 84, u.is_premium ? 'ring-gold' : '')}
            <h1 class="profile-name">${u.username}</h1>
            <div class="profile-email">${u.email}</div>
            <div class="profile-badges">
              ${u.is_premium ? html`<span class="chip chip-gold">${icon('crown')} Premium · ${fmtDate(u.premium_expires_at)} хүртэл</span>` : ''}
              ${u.is_admin ? html`<span class="chip">${icon('shield')} Админ</span>` : ''}
            </div>
          </div>
          ${statTiles(s)}
          <div class="card">
            <h2 class="card-h">Оролдлогын тархалт</h2>
            ${distChart(s.distribution)}
            <div class="earned"><span class="muted">Нийт олсон</span><b>${money(s.earned)}</b></div>
          </div>
          <nav class="menu">
            ${item('#/wallet', 'wallet', 'Хэтэвч', money(u.balance))}
            ${item('#/topup', 'plus', 'Хэтэвч цэнэглэх', 'Банкны шилжүүлгээр')}
            ${item('#/referral', 'users', 'Найз урих', `${r.referrals.verified}/${c.referral_unlock} баталгаажсан`)}
            ${item('#/premium', 'crown', 'Premium', u.is_premium ? 'Идэвхтэй' : `${money(c.premium_price)}/сар`)}
            ${item('#/games', 'gamepad', 'Тоглоомууд', '7 тоглоом · Blitz арена')}
            ${item('#/leaders', 'trophy', 'Шилдэгүүд', 'Өдрийн үгийн жагсаалт')}
            ${item('#/archive', 'history', 'Дасгал', r.archive.unlimited ? 'Хязгааргүй' : `Өнөөдөр ${r.archive.left} үлдсэн`)}
            ${u.is_admin ? item('#/admin', 'shield', 'Админ самбар', '', 'admin') : ''}
          </nav>
          <div class="menu">
            <button class="menu-item" type="button" data-action="settings"><span class="li-ic">${icon('sliders')}</span><span class="li-main"><span class="li-title">Тохиргоо</span></span>${icon('right', 'chev')}</button>
            <button class="menu-item danger" type="button" data-action="logout"><span class="li-ic">${icon('logout')}</span><span class="li-main"><span class="li-title">Гарах</span></span></button>
          </div>`;
      } catch (e) {
        el.innerHTML = String(errorBox(e, 'profile'));
      }
    },
  };

  /* ── Найз урих ─────────────────────────────────────────── */
  const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
  const QR_SRI = 'sha384-lQXOAyZwHXE55JFyrOMB7nY2Wv+m5ZWNtJcHrd1rceRQXAYNLak8ukN5TjBTcIwz';
  let qrLoading = null;
  const loadQr = () => {
    if (window.qrcode) return Promise.resolve();
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = QR_SRC;
        s.integrity = QR_SRI;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => { qrLoading = null; reject(new Error('qr')); };
        document.head.appendChild(s);
      });
    }
    return qrLoading;
  };

  Pages.referral = {
    async show() {
      const el = $('#page-referral');
      if (!el.innerHTML.trim()) el.innerHTML = html`${pageHead('Найз урих')}${skeleton(4)}`;
      try {
        const r = await Api.get('referrals');
        const pct = Math.min(100, Math.round((r.verified / r.unlock) * 100));
        el.innerHTML = html`${pageHead('Найз урих', `Найз тань таны холбоосоор бүртгүүлж, анх удаа үг таамагц танд ${money(r.bonus)}.`)}
          <div class="card ref-card">
            <div class="ref-qr" id="ref-qr" aria-label="Урилгын QR код"></div>
            <div class="ref-code-l">Таны урилгын код</div>
            <button class="ref-code" type="button" data-copy="${r.code}" aria-label="Код хуулах">${r.code} ${icon('copy')}</button>
            <div class="ref-link"><span>${r.link}</span></div>
            <div class="row-2">
              <button class="btn btn-ghost" type="button" data-copy="${r.link}">${icon('copy')} Холбоос хуулах</button>
              <button class="btn btn-primary" type="button" data-action="share-invite">${icon('share')} Урих</button>
            </div>
          </div>
          <div class="card">
            <div class="prog-head"><b>${r.verified}/${r.unlock}</b><span class="muted">найз баталгаажсан — мөнгө татах эрх</span></div>
            <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${r.unlock}" aria-valuenow="${r.verified}"><span style="width:${pct}%"></span></div>
            <p class="muted small">Урьсан найз анх удаа өдрийн үгээ таамагц «баталгаажсан» болно.</p>
          </div>
          <h2 class="sub-h">Урьсан найзууд <span class="muted">(${r.total})</span></h2>
          ${r.referrals.length ? html`<ul class="list">${r.referrals.map((x) => html`<li class="list-item">
            ${avatar(x.avatar_url, x.username, 36)}
            <span class="li-main"><span class="li-title">${x.username}</span><span class="li-sub">${relDay(x.created_at)}</span></span>
            <span class="badge ${x.is_verified ? 'badge-good' : 'badge-warn'}">${x.is_verified ? 'Баталгаажсан' : 'Хүлээгдэж байна'}</span>
          </li>`)}</ul>` : empty('users', 'Одоогоор урьсан найз алга', 'Холбоосоо Facebook, Messenger-ээр хуваалцаад эхлээрэй.')}`;
        this.link = r.link;
        this.qr(r.link);
      } catch (e) {
        el.innerHTML = html`${pageHead('Найз урих')}${errorBox(e, 'referral')}`;
      }
    },

    async qr(link) {
      const box = $('#ref-qr');
      if (!box) return;
      try {
        await loadQr();
        const q = window.qrcode(0, 'M');
        q.addData(link);
        q.make();
        box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      } catch {
        box.remove();
      }
    },

    share() {
      const c = App.config;
      shareOrCopy(`Үг Таа — өдөр бүр монгол үг тааж, ${money(c.reward_amount)} шагнал ав! Миний холбоосоор бүртгүүлээрэй 👇\n${this.link || App.shareLink()}`);
    },
  };

  /* ── Premium ───────────────────────────────────────────── */
  Pages.premium = {
    plan: 'month',
    planInfo(plan) {
      const c = App.config;
      return plan === 'week' ? { price: c.premium_week_price, days: c.premium_week_days } : { price: c.premium_price, days: c.premium_days };
    },

    show(args, fresh = false) {
      if (!fresh) Api.get('me').then((r) => { App.patchUser(r.user); if (Router.current === 'premium') this.show(args, true); }).catch(() => {});
      const el = $('#page-premium');
      const u = App.user, c = App.config;
      if (!c.premium_week_price) this.plan = 'month';
      const cur = this.planInfo(this.plan);
      const short = Math.max(0, cur.price - u.balance);
      const perDay = (p) => Math.round(p.price / Math.max(1, p.days));
      const save = c.premium_week_price ? Math.round((1 - perDay(this.planInfo('month')) / perDay(this.planInfo('week'))) * 100) : 0;
      const planCard = (key, title) => {
        const p = this.planInfo(key);
        return html`<button type="button" class="plan ${this.plan === key ? 'active' : ''}" role="radio" aria-checked="${String(this.plan === key)}" data-action="premium-plan" data-plan="${key}">
          ${key === 'month' && save > 0 ? html`<span class="plan-badge">${save}% хэмнэлт</span>` : ''}
          <b>${title}</b><span class="plan-price">${money(p.price)}</span><small>${p.days} хоног · өдөрт ${money(perDay(p))}</small>
        </button>`;
      };
      const perks = [
        c.premium_multiplier > 1 && ['trophy', `${c.premium_multiplier}× шагнал`, `Өдрийн үг таавал ${money(c.reward_amount * c.premium_multiplier)}`],
        ['target', 'Тэмцээнд үнэгүй', `${money(c.tournament_fee)} хураамжгүйгээр оролцоно`],
        ['history', 'Дасгал хязгааргүй', `Энгийн хэрэглэгч өдөрт ${c.practice_daily_free}`],
        ['gamepad', 'Бүх тоглоом хязгааргүй', `Бүх 6 мини тоглоом, Blitz дасгал — өдөрт ${c.mini_daily_free} биш, хязгааргүй`],
        c.blitz_premium_free > 0 && ['zap', 'Blitz аренад үнэгүй', `Өдөр бүр ${c.blitz_premium_free} оноотой тоглолт ${money(c.blitz_fee)} хураамжгүй`],
        ['bulb', 'Сэжүүр хагас үнээр', `${money(c.hint_price_premium)} (энгийн ${money(c.hint_price)})`],
        ['crown', 'Алтан тэмдэг', 'Жагсаалт, профайлд алтан хүрээ'],
      ];
      el.innerHTML = html`
        <div class="prem-hero">
          <div class="prem-crown">${icon('crown')}</div>
          <h1>Premium</h1>
          <div class="prem-price">${money(cur.price)} <small>/ ${cur.days} хоног</small></div>
          ${u.is_premium ? html`<span class="chip chip-gold">${icon('check')} Идэвхтэй · ${fmtDate(u.premium_expires_at)} хүртэл</span>` : ''}
        </div>
        ${c.premium_week_price ? html`<div class="plans" role="radiogroup" aria-label="Хугацаа">${planCard('week', '7 хоног')}${planCard('month', '30 хоног')}</div>` : ''}
        <div class="card">
          <div class="pay-row"><span class="muted">Таны үлдэгдэл</span><b>${money(u.balance)}</b></div>
          <div class="pay-row"><span class="muted">Төлбөр</span><b>− ${money(cur.price)}</b></div>
          ${short > 0
            ? html`<a class="btn btn-gold btn-block btn-lg" href="#/topup">${icon('banknote')} Хэтэвч цэнэглэх (${money(short)} дутуу)</a>`
            : html`<button class="btn btn-gold btn-block btn-lg" type="button" data-action="buy-premium">${u.is_premium ? `${cur.days} хоногоор сунгах` : 'Premium авах'}</button>`}
          <p class="muted small center">Төлбөрийг хэтэвчний үлдэгдлээс хасна. Сунгавал хугацаа дээр нь нэмэгдэнэ.</p>
        </div>
        <h2 class="sub-h">Premium-ийн давуу талууд</h2>
        <ul class="perks">${perks.filter(Boolean).map(([ic, t, s]) => html`<li><span class="perk-ic">${icon(ic)}</span><span><b>${t}</b><small>${s}</small></span></li>`)}</ul>`;
    },

    async buy() {
      const c = App.config;
      const p = this.planInfo(this.plan);
      const ok = await Modal.confirm({
        title: 'Premium',
        message: html`Хэтэвчнээс <b>${money(p.price)}</b> хасаж ${p.days} хоногийн Premium ${App.user.is_premium ? 'сунгах' : 'идэвхжүүлэх'} үү?`,
        confirmText: 'Төлөх',
      });
      if (!ok) return;
      try {
        const r = await Api.post('premium_buy', { plan: this.plan });
        App.setUser(r.user);
        Toast.show(r.message, 'success');
        Confetti.burst();
        this.show();
      } catch (e) { Toast.error(e); }
    },
  };

  /* ── Админ ─────────────────────────────────────────────── */
  const ADMIN_TABS = [
    ['overview', 'activity', 'Самбар'], ['deposits', 'banknote', 'Цэнэглэлт'], ['withdrawals', 'wallet', 'Таталт'],
    ['users', 'users', 'Хэрэглэгч'], ['words', 'book', 'Үгс'], ['tournaments', 'target', 'Тэмцээн'],
    ['settings', 'sliders', 'Тохиргоо'], ['system', 'shield', 'Систем'],
  ];

  const niceCeil = (v) => {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  };

  /** 14 хоногийн тоглолт — нэг цуврал багана, hover/tap tooltip */
  const columnChart = (series) => {
    const top = niceCeil(Math.max(1, ...series.map((d) => d.games)));
    return html`<figure class="colchart">
      <figcaption class="sr-only">Сүүлийн 14 хоногийн тоглолтын тоо</figcaption>
      <div class="cc-plot">
        <span class="cc-y cc-y-top">${fmt(top)}</span>${Number.isInteger(top / 2) ? html`<span class="cc-y cc-y-mid">${fmt(top / 2)}</span>` : ''}<span class="cc-y cc-y-0">0</span>
        <div class="cc-cols">${series.map((d) => html`<div class="cc-col" tabindex="0" data-tip="${fmtDate(d.date)} · ${d.games} тоглолт · ${d.wins} таасан · ${money(d.paid)}">
          <span class="cc-bar" style="height:${(d.games / top) * 100}%"></span>
          <span class="cc-x">${Number(d.date.slice(8, 10))}</span>
        </div>`)}</div>
      </div>
      <details class="cc-table"><summary>Хүснэгтээр харах</summary>
        <table><thead><tr><th>Огноо</th><th>Тоглолт</th><th>Таасан</th><th>Шагнал</th></tr></thead>
        <tbody>${series.map((d) => html`<tr><td>${fmtDate(d.date)}</td><td>${d.games}</td><td>${d.wins}</td><td>${money(d.paid)}</td></tr>`)}</tbody></table>
      </details>
    </figure>`;
  };

  Pages.admin = {
    tab: 'overview',
    wdStatus: 'pending',
    depStatus: 'submitted',
    userQ: '',
    userPage: 1,
    wordQ: '',
    wordFilter: 'all',
    wordPage: 1,

    show(args) {
      this.tab = ADMIN_TABS.some((t) => t[0] === args[0]) ? args[0] : 'overview';
      const el = $('#page-admin');
      el.innerHTML = html`${pageHead('Админ самбар')}
        <nav class="admin-tabs">${ADMIN_TABS.map(([k, ic, l]) => html`<a class="atab ${k === this.tab ? 'active' : ''}" href="#/admin/${k}">${icon(ic)} ${l}</a>`)}</nav>
        <div id="admin-body">${skeleton(4)}</div>`;
      this[this.tab]();
    },

    body(content) { const b = $('#admin-body'); if (b) b.innerHTML = String(content); },
    async run(fn) {
      try { await fn(); } catch (e) { this.body(errorBox(e, 'admin')); }
    },

    overview() {
      return this.run(async () => {
        const r = await Api.get('admin_overview');
        const s = r.stats;
        const tile = (l, v, sub = '', warn = false) => html`<div class="stat ${warn ? 'warn' : ''}"><div class="stat-v">${v}</div><div class="stat-l">${l}</div>${sub ? html`<div class="stat-s">${sub}</div>` : ''}</div>`;
        this.body(html`
          ${s.deposit_pending ? html`<a class="note note-link note-warn" href="#/admin/deposits">${icon('banknote')} ${s.deposit_pending} цэнэглэлт шалгах шаардлагатай (${money(s.deposit_pending_sum)})${icon('right')}</a>` : ''}
          ${s.pending_count ? html`<a class="note note-link note-warn" href="#/admin/withdrawals">${icon('alert')} ${s.pending_count} таталтын хүсэлт хүлээгдэж байна (${money(s.pending_sum)})${icon('right')}</a>` : ''}
          ${s.words_answers < 30 ? html`<a class="note note-link note-warn" href="#/admin/words">${icon('alert')} Хариулт болох үг ${s.words_answers} л байна — хэрэглэгчдэд давтагдахаас сэргийлж үг нэмнэ үү${icon('right')}</a>` : ''}
          <div class="card today-word">
            <div><div class="muted small">Өнөөдөр #${r.today.number}</div>
            <div class="tw-len">${r.today.length ? `${r.today.length} үсэгтэй үгс` : 'Үгийн сан хоосон'}</div>
            ${r.today.fixed
              ? html`<div class="tw-word" data-hidden="1" data-secret="${r.today.fixed.word}">${'•'.repeat(Array.from(r.today.fixed.word).length)}</div>
                     <div class="muted small">Бүгдэд нэг үг товлосон</div>`
              : html`<div class="muted small">Хэрэглэгч бүрт өөр санамсаргүй үг</div>`}</div>
            ${r.today.fixed ? html`<button class="btn btn-ghost btn-sm" type="button" data-action="reveal-word">${icon('eye')} Харах</button>` : ''}
          </div>
          <h3 class="sub-h">Өнөөдөр</h3>
          <div class="stat-grid stat-grid-3">
            ${tile('Тоглолт', fmt(s.games_today))}${tile('Таасан', fmt(s.wins_today))}${tile('Олгосон шагнал', money(s.rewards_today))}
            ${tile('Идэвхтэй хэрэглэгч', fmt(s.active_today))}${tile('Шинэ бүртгэл', fmt(s.users_today))}${tile('Нийт хэрэглэгч', fmt(s.users_total))}
          </div>
          <h3 class="sub-h">Сүүлийн 14 хоногийн тоглолт</h3>
          <div class="card">${columnChart(r.series)}</div>
          ${r.revenue ? html`<h3 class="sub-h">Орлогын задаргаа (30 хоног)</h3>
          <div class="card rev-card">
            ${r.revenue.map((x) => html`<div class="rev-row"><span>${x.label}</span><b class="${x.amount > 0 ? 'pos' : x.amount < 0 ? 'neg' : 'muted'}">${x.amount > 0 ? '+' : ''}${money(x.amount)}</b></div>`)}
            <div class="rev-row rev-total"><span>Цэвэр ашиг</span><b class="${r.profit >= 0 ? 'pos' : 'neg'}">${money(r.profit)}</b></div>
            <p class="muted small">Сантай тоглоомуудын (Дуэль, Blitz, Тэмцээн) хувьд зөвхөн шийдэгдсэн хэсгийн шимтгэлийг тооцно.</p>
          </div>` : ''}
          <h3 class="sub-h">Санхүү</h3>
          <div class="stat-grid stat-grid-3">
            ${tile('Хэрэглэгчдийн нийт үлдэгдэл', money(s.liability), 'Таны өр төлбөр')}
            ${tile('Хүлээгдэж буй таталт', money(s.pending_sum), `${s.pending_count} хүсэлт`, s.pending_count > 0)}
            ${tile('Нийт шилжүүлсэн', money(s.paid_total))}
            ${tile('Premium хэрэглэгч', fmt(s.premium_users))}
            ${tile('Premium орлого (30 хоног)', money(s.premium_30d))}
            ${tile('Цэнэглэлт (30 хоног)', money(s.deposits_30d))}
            ${tile('Тоглоомын орлого (30 хоног)', money(s.games_revenue_30d || 0), `Өнөөдөр ${money(s.games_revenue_today || 0)} · сэжүүр, нэмэлт тоглолт, Blitz`)}
            ${tile('Хоригдсон', fmt(s.banned))}
          </div>
          <h3 class="sub-h">Үгийн сан</h3>
          <div class="stat-grid stat-grid-3">
            ${tile('Идэвхтэй хариулт', fmt(s.words_answers))}
            ${tile('Хэнд ч ирээгүй', fmt(s.words_unused))}
          </div>`);
      });
    },

    deposits() {
      return this.run(async () => {
        const r = await Api.get('admin_deposits', { status: this.depStatus });
        this.body(html`
          ${segmented([['submitted', 'Шалгах'], ['created', 'Төлөөгүй'], ['approved', 'Орсон'], ['rejected', 'Татгалзсан'], ['all', 'Бүгд']], this.depStatus, 'data-dep-status')}
          <p class="muted small">Банкны аппаасаа орлогын гүйлгээг <b>гүйлгээний утгаар</b> хайж, дүн таарвал «Орсон» дарна.</p>
          ${r.deposits.length ? html`<div class="wd-list">${r.deposits.map((d) => {
            const [label, tone] = DEP_STATUS[d.status] || [d.status, ''];
            const open = d.status === 'submitted' || d.status === 'created';
            return html`<div class="card wd-card ${d.status === 'submitted' ? 'pending' : ''}">
              <div class="wd-top">
                <div><div class="wd-amt">${money(d.amount)}</div><div class="muted small">${fmtDateTime(d.submitted_at || d.created_at)} · #${d.id}</div></div>
                <span class="badge badge-${tone}">${label}</span>
              </div>
              <dl class="kv">
                <dt>Гүйлгээний утга</dt><dd><button class="copy-inline" type="button" data-copy="${d.reference}"><b>${d.reference}</b> ${icon('copy')}</button></dd>
                <dt>Хэрэглэгч</dt><dd>${d.username} <span class="muted">· ${d.email} · ID ${d.user_id}</span></dd>
                <dt>Үлдэгдэл</dt><dd>${money(d.balance)} <span class="muted">· нийт цэнэглэсэн ${money(d.approved_total)}</span></dd>
                ${d.admin_note ? html`<dt>Тэмдэглэл</dt><dd>${d.admin_note}</dd>` : ''}
              </dl>
              ${open ? html`<div class="row-2">
                <button class="btn btn-ghost" type="button" data-dep="${d.id}" data-op="reject">${icon('x')} Татгалзах</button>
                <button class="btn btn-primary" type="button" data-dep="${d.id}" data-op="approve" data-amount="${d.amount}" data-ref="${d.reference}">${icon('check')} Орсон</button>
              </div>` : ''}
            </div>`;
          })}</div>` : empty('banknote', 'Хүсэлт алга')}`);
      });
    },

    async depAction(btn) {
      const id = Number(btn.dataset.dep), op = btn.dataset.op;
      const body = { id, op };
      if (op === 'approve') {
        const v = await Modal.form({
          title: 'Цэнэглэлт баталгаажуулах',
          intro: html`Банкны орлогод <b>${btn.dataset.ref}</b> утгатай гүйлгээ орсныг шалгасан уу? Бодит орсон дүнг оруулна.`,
          fields: [{ name: 'amount', label: 'Орсон дүн (₮)', type: 'number', value: btn.dataset.amount, min: 1, required: true }],
          submitText: 'Хэтэвчинд оруулах',
        });
        if (!v) return;
        body.amount = parseInt(v.amount, 10);
      } else {
        const v = await Modal.form({ title: 'Татгалзах', fields: [{ name: 'note', label: 'Шалтгаан', placeholder: 'Жишээ: Шилжүүлэг олдсонгүй', required: true }], submitText: 'Татгалзах', danger: true });
        if (!v) return;
        body.note = v.note;
      }
      try {
        const r = await Api.post('admin_deposit', body);
        Toast.show(r.message, 'success');
        this.deposits();
      } catch (e) { Toast.error(e); }
    },

    settings() {
      return this.run(async () => {
        const r = await Api.get('admin_settings');
        const s = r.settings;
        this.body(html`
          <form class="card form" data-form="settings-deposit" novalidate>
            <h3 class="card-h card-h-ic">${icon('banknote')} Цэнэглэлт хүлээн авах данс</h3>
            <label class="set-row"><span><b>Цэнэглэлт идэвхтэй</b><small>${r.ready ? 'Хэрэглэгчдэд «Хэтэвч цэнэглэх» товч харагдаж байна' : 'Банк, нэр, дансаа бөглөөд асаана'}</small></span>
              <input type="checkbox" class="switch" name="deposit_enabled" ${s.deposit_enabled ? raw('checked') : ''}></label>
            <label class="field"><span class="field-label">Банк</span>
              <select class="input" name="deposit_bank"><option value="">Сонгох</option>${Object.entries(r.banks).map(([k, v]) => html`<option value="${k}" ${k === s.deposit_bank ? raw('selected') : ''}>${v}</option>`)}</select></label>
            <label class="field"><span class="field-label">Данс эзэмшигчийн нэр</span>
              <input class="input" name="deposit_account_name" value="${s.deposit_account_name}" placeholder="Жишээ: Бат-Эрдэнэ Б."></label>
            <label class="field"><span class="field-label">Дансны дугаар</span>
              <input class="input mono" name="deposit_account_number" value="${s.deposit_account_number}" inputmode="numeric" placeholder="5000123456"></label>
            <label class="field"><span class="field-label">IBAN <small class="muted">(заавал биш)</small></span>
              <input class="input mono" name="deposit_iban" value="${s.deposit_iban}" placeholder="MN12 3456 7890 1234 5678"></label>
            <div class="row-2">
              <label class="field"><span class="field-label">Хамгийн бага (₮)</span><input class="input" type="number" name="deposit_min" value="${s.deposit_min}" min="100"></label>
              <label class="field"><span class="field-label">Хамгийн их (₮)</span><input class="input" type="number" name="deposit_max" value="${s.deposit_max}" min="1000"></label>
            </div>
            <button class="btn btn-primary" type="submit">Хадгалах</button>
          </form>

          <form class="card form" data-form="settings-sponsor" novalidate>
            <h3 class="card-h card-h-ic">${icon('star')} Ивээн тэтгэгч (зарын байр)</h3>
            <p class="form-intro">Компани, дэлгүүрт зарын байр зарж орлого ол. Баннер Тоглоом цэс, тоглоомын дүн, Blitz, Дуэлийн хуудсанд харагдана.</p>
            <label class="set-row"><span><b>Баннер харуулах</b><small>Сүүлийн 30 хоногт: ${fmt(s.sponsor_stats ? s.sponsor_stats.views : 0)} үзэлт · ${fmt(s.sponsor_stats ? s.sponsor_stats.clicks : 0)} дарсан</small></span>
              <input type="checkbox" class="switch" name="sponsor_enabled" ${s.sponsor_enabled ? raw('checked') : ''}></label>
            <label class="field"><span class="field-label">Нэр</span><input class="input" name="sponsor_name" value="${s.sponsor_name}" maxlength="60" placeholder="Жишээ: Номин супермаркет"></label>
            <label class="field"><span class="field-label">Тайлбар</span><input class="input" name="sponsor_text" value="${s.sponsor_text}" maxlength="160" placeholder="Жишээ: Үг Таа тоглогчдод 10% хямдрал"></label>
            <label class="field"><span class="field-label">Холбоос (https://)</span><input class="input mono" name="sponsor_url" value="${s.sponsor_url}" placeholder="https://..."></label>
            <label class="field"><span class="field-label">Лого/зураг (https://, заавал биш)</span><input class="input mono" name="sponsor_image" value="${s.sponsor_image}" placeholder="https://.../logo.png"></label>
            <label class="field"><span class="field-label">Товчны бичиг</span><input class="input" name="sponsor_cta" value="${s.sponsor_cta}" maxlength="24" placeholder="Дэлгэрэнгүй"></label>
            <button class="btn btn-primary" type="submit">Хадгалах</button>
          </form>

          <form class="card form" data-form="settings-telegram" novalidate>
            <h3 class="card-h card-h-ic">${icon('send')} Telegram мэдэгдэл</h3>
            <ol class="howto">
              <li>Telegram-д <b>@BotFather</b>-г нээгээд <code>/newbot</code> гэж бичиж бот үүсгэнэ.</li>
              <li>BotFather-ийн өгсөн <b>token</b>-ийг доор оруулна.</li>
              <li>Өөрийн шинэ бот руугаа ороод <code>/start</code> гэж бичнэ.</li>
              <li>«Олох» товчоор Chat ID-гаа олоод, «Тест мессеж» дарна.</li>
            </ol>
            <label class="field"><span class="field-label">Bot token</span>
              <input class="input mono" name="telegram_bot_token" type="password" autocomplete="off" placeholder="${s.telegram_token_hint ? 'Хадгалсан: ' + s.telegram_token_hint : '123456789:AA…'}"></label>
            <label class="field"><span class="field-label">Chat ID</span>
              <span class="input-group"><input class="input mono" name="telegram_chat_id" value="${s.telegram_chat_id}" placeholder="123456789">
              <button class="btn btn-ghost btn-sm" type="button" data-action="tg-find">Олох</button></span></label>
            <label class="field"><span class="field-label">«Орсон» дарах эрхтэй Telegram ID</span>
              <input class="input mono" name="telegram_admin_ids" value="${s.telegram_admin_ids}" placeholder="«Олох» дарахад автоматаар бөглөгдөнө">
              <span class="field-hint">Олон админ бол таслалаар: 123456789,987654321</span></label>
            <label class="set-row"><span><b>Мөнгө татах хүсэлтийг мэдэгдэх</b><small>Цэнэглэлтийн хүсэлт үргэлж мэдэгдэнэ</small></span>
              <input type="checkbox" class="switch" name="notify_withdrawals" ${s.notify_withdrawals ? raw('checked') : ''}></label>
            <div class="tg-mode">
              ${s.platform !== 'shared' && s.telegram_mode !== 'webhook' && s.webhook_possible
                ? html`<div class="note note-warn">${icon('alert')}<span>Та <b>${s.platform === 'vercel' ? 'Vercel' : 'Render'}</b> дээр ажиллаж байна — «Webhook»-ийг асаавал Telegram товч шууд, найдвартай ажиллана.</span></div>`
                : ''}
              <div class="field-label">Telegram-аас шууд «✅ Орсон» дарах</div>
              <div class="seg seg-sm" role="radiogroup">
                <button type="button" role="radio" aria-checked="${String(s.telegram_mode !== 'webhook')}" data-action="tg-mode" data-v="poll">Автомат шалгалт</button>
                <button type="button" role="radio" aria-checked="${String(s.telegram_mode === 'webhook')}" data-action="tg-mode" data-v="webhook" ${s.webhook_possible ? '' : raw('disabled')}>Webhook</button>
              </div>
              <p class="field-hint">${s.telegram_mode === 'webhook'
                ? 'Webhook: товч дармагц шууд ажиллана (Render мэт https сервер).'
                : `Автомат шалгалт: InfinityFree дээр ажиллана — сайтад хэн нэгэн орох бүрт ${5} секунд тутам Telegram-ийг шалгана. Админ самбар нээхэд шууд шалгагдана.`}
                ${s.webhook_possible ? '' : ' Webhook-д https хаяг шаардлагатай.'}</p>
              <button class="btn btn-ghost btn-xs" type="button" data-action="tg-status">${icon('activity')} Төлөв шалгах</button>
            </div>
            <div class="row-2">
              <button class="btn btn-ghost" type="button" data-action="tg-test">${icon('send')} Тест мессеж</button>
              <button class="btn btn-primary" type="submit">Хадгалах</button>
            </div>
          </form>`);
      });
    },

    async telegramMode(mode) {
      const ok = await Modal.confirm(mode === 'webhook'
        ? { title: 'Webhook идэвхжүүлэх', message: 'Telegram товч дармагц шууд сайт руу илгээгдэнэ. Зөвхөн Render мэт https сервер дээр ажиллана — InfinityFree дээр бүү асаа.', confirmText: 'Идэвхжүүлэх' }
        : { title: 'Автомат шалгалт', message: 'Webhook-ийг унтрааж, сайт өөрөө Telegram-ийг шалгадаг горимд шилжих үү?', confirmText: 'Шилжих' });
      if (!ok) return;
      try {
        const r = await Api.post('admin_telegram', { op: mode === 'webhook' ? 'webhook_on' : 'webhook_off' });
        Toast.show(r.message, 'success', 4500);
        this.settings();
      } catch (e) { Toast.error(e); }
    },

    async telegramStatus() {
      try {
        const r = await Api.post('admin_telegram', { op: 'status' });
        const msg = r.mode === 'webhook'
          ? `Webhook · хүлээгдэж буй: ${r.pending}${r.last_error ? ` · Сүүлийн алдаа (${r.last_error_at}): ${r.last_error}` : ' · алдаагүй'}`
          : `Автомат шалгалт горим${r.webhook_url ? ' (анхаар: webhook тохируулагдсан хэвээр!)' : ''}`;
        Toast.show(msg, r.last_error ? 'error' : 'success', 6000);
      } catch (e) { Toast.error(e); }
    },

    formValues(form, names) {
      const out = {};
      for (const n of names) {
        const el = form.elements[n];
        if (!el) continue;
        out[n] = el.type === 'checkbox' ? el.checked : el.value.trim();
      }
      return out;
    },

    async saveSettings(form, quiet = false) {
      const names = {
        'settings-deposit': ['deposit_enabled', 'deposit_bank', 'deposit_account_name', 'deposit_account_number', 'deposit_iban', 'deposit_min', 'deposit_max'],
        'settings-sponsor': ['sponsor_enabled', 'sponsor_name', 'sponsor_text', 'sponsor_url', 'sponsor_image', 'sponsor_cta'],
      }[form.dataset.form] || ['telegram_bot_token', 'telegram_chat_id', 'telegram_admin_ids', 'notify_withdrawals'];
      const body = this.formValues(form, names);
      if ('deposit_min' in body) { body.deposit_min = parseInt(body.deposit_min, 10) || 0; body.deposit_max = parseInt(body.deposit_max, 10) || 0; }
      const r = await Api.post('admin_settings_save', body);
      if (!quiet) Toast.show(r.message, 'success', 4000);
      const tok = form.elements.telegram_bot_token;
      if (tok) { tok.value = ''; if (r.settings.telegram_token_hint) tok.placeholder = 'Хадгалсан: ' + r.settings.telegram_token_hint; }
      return r;
    },

    async telegram(op) {
      const form = $('[data-form="settings-telegram"]');
      if (!form) return;
      try {
        await this.saveSettings(form, true);
        const r = await Api.post('admin_telegram', { op });
        if (r.chat_id) form.elements.telegram_chat_id.value = r.chat_id;
        if (r.admin_ids) form.elements.telegram_admin_ids.value = r.admin_ids;
        Toast.show(r.message, 'success', 4500);
      } catch (e) { Toast.error(e); }
    },

    withdrawals() {
      return this.run(async () => {
        const r = await Api.get('admin_withdrawals', { status: this.wdStatus });
        this.body(html`
          ${segmented([['pending', 'Хүлээгдэж буй'], ['approved', 'Шилжүүлсэн'], ['rejected', 'Цуцалсан'], ['all', 'Бүгд']], this.wdStatus, 'data-wd-status')}
          ${r.withdrawals.length ? html`<div class="wd-list">${r.withdrawals.map((w) => {
            const risk = w.same_ip > 1;
            return html`<div class="card wd-card ${w.status}">
              <div class="wd-top">
                <div><div class="wd-amt">${money(w.amount)}</div><div class="muted small">${fmtDateTime(w.requested_at)} · #${w.id}</div></div>
                <span class="badge badge-${WD_STATUS[w.status] ? WD_STATUS[w.status][1] : ''}">${WD_STATUS[w.status] ? WD_STATUS[w.status][0] : w.status}</span>
              </div>
              <dl class="kv">
                <dt>Хэрэглэгч</dt><dd>${w.username} <span class="muted">· ${w.email} · ID ${w.user_id}</span></dd>
                <dt>Банк</dt><dd>${w.bank_label}</dd>
                <dt>Данс</dt><dd><button class="copy-inline" type="button" data-copy="${w.account_number}">${w.account_number} ${icon('copy')}</button></dd>
                <dt>Нэр</dt><dd><button class="copy-inline" type="button" data-copy="${w.account_name}">${w.account_name} ${icon('copy')}</button></dd>
                <dt>Үзүүлэлт</dt><dd>${w.wins} ялалт · ${w.refs} урилга${risk ? html` · <span class="risk">${icon('alert')} Ижил IP-с ${w.same_ip} бүртгэл</span>` : ''}</dd>
                ${w.admin_note ? html`<dt>Тэмдэглэл</dt><dd>${w.admin_note}</dd>` : ''}
              </dl>
              ${w.status === 'pending' ? html`<div class="row-2">
                <button class="btn btn-ghost" type="button" data-wd="${w.id}" data-op="reject">${icon('x')} Цуцлах</button>
                <button class="btn btn-primary" type="button" data-wd="${w.id}" data-op="approve">${icon('check')} Шилжүүлсэн</button>
              </div>` : ''}
            </div>`;
          })}</div>` : empty('wallet', 'Хүсэлт алга')}`);
      });
    },

    async wdAction(id, op) {
      let note = '';
      if (op === 'reject') {
        const v = await Modal.form({ title: 'Таталт цуцлах', intro: 'Мөнгө хэрэглэгчийн хэтэвчинд буцаан орно.', fields: [{ name: 'note', label: 'Шалтгаан', placeholder: 'Жишээ: Дансны нэр таарахгүй', required: true }], submitText: 'Цуцлах', danger: true });
        if (!v) return;
        note = v.note;
      } else {
        const ok = await Modal.confirm({ title: 'Шилжүүлсэн гэж тэмдэглэх', message: 'Та мөнгийг банкаар шилжүүлсэн үү? Энэ үйлдлийг буцаах боломжгүй.', confirmText: 'Тийм, шилжүүлсэн' });
        if (!ok) return;
      }
      try {
        const r = await Api.post('admin_withdrawal', { id, op, note });
        Toast.show(r.message, 'success');
        this.withdrawals();
      } catch (e) { Toast.error(e); }
    },

    users() {
      return this.run(async () => {
        const r = await Api.get('admin_users', { q: this.userQ, page: this.userPage });
        this.body(html`
          <form class="search" data-form="user-search">${icon('search')}<input class="input" name="q" value="${this.userQ}" placeholder="Нэр, имэйл, ID, урилгын код, IP" autocomplete="off"></form>
          <p class="muted small">${fmt(r.total)} хэрэглэгч</p>
          <div class="user-list">${r.users.map((u) => html`<div class="card user-card ${u.is_banned ? 'banned' : ''}">
            <div class="uc-top">
              ${avatar(u.avatar_url, u.username, 42, u.is_premium ? 'ring-gold' : '')}
              <div class="li-main"><span class="li-title">${u.username} ${u.is_admin ? html`<span class="chip chip-xs">${icon('shield')} админ</span>` : ''}${u.is_banned ? html` <span class="badge badge-bad">Хоригдсон</span>` : ''}</span>
              <span class="li-sub">${u.email} · ID ${u.id} · ${u.referral_code}</span></div>
              <div class="li-end"><b>${money(u.balance)}</b></div>
            </div>
            <div class="uc-meta">
              <span>${u.wins} ялалт</span><span>${u.refs} урилга</span>
              ${u.is_premium ? html`<span class="gold">${icon('crown')} ${fmtDate(u.premium_expires_at)}</span>` : ''}
              ${u.same_ip > 1 ? html`<span class="risk">${icon('alert')} Ижил IP: ${u.same_ip}</span>` : ''}
              <span class="muted">Сүүлд: ${u.last_seen_at ? fmtDateTime(u.last_seen_at) : '—'}</span>
            </div>
            <div class="uc-actions">
              <button class="btn btn-ghost btn-xs" type="button" data-user="${u.id}" data-op="premium">${icon('crown')} Premium</button>
              <button class="btn btn-ghost btn-xs" type="button" data-user="${u.id}" data-op="adjust">${icon('wallet')} Баланс</button>
              <button class="btn btn-ghost btn-xs" type="button" data-user="${u.id}" data-op="extra_plays" data-v="${u.extra_plays}">${icon('history')} Дасгал +${u.extra_plays}</button>
              ${u.is_premium ? html`<button class="btn btn-ghost btn-xs" type="button" data-user="${u.id}" data-op="unpremium">Premium цуцлах</button>` : ''}
              <button class="btn ${u.is_banned ? 'btn-ghost' : 'btn-danger-ghost'} btn-xs" type="button" data-user="${u.id}" data-op="${u.is_banned ? 'unban' : 'ban'}" data-name="${u.username}">${icon('ban')} ${u.is_banned ? 'Хориг цуцлах' : 'Хориглох'}</button>
            </div>
          </div>`)}</div>
          ${r.pages > 1 ? html`<div class="pager">
            <button class="btn btn-ghost btn-sm" type="button" data-user-page="${r.page - 1}" ${r.page <= 1 ? raw('disabled') : ''}>${icon('left')}</button>
            <span>${r.page} / ${r.pages}</span>
            <button class="btn btn-ghost btn-sm" type="button" data-user-page="${r.page + 1}" ${r.page >= r.pages ? raw('disabled') : ''}>${icon('right')}</button>
          </div>` : ''}`);
      });
    },

    async userAction(id, op, btn) {
      let body = { id, op };
      if (op === 'premium') {
        const v = await Modal.form({ title: 'Premium олгох', fields: [{ name: 'days', label: 'Хоног', type: 'number', value: App.config.premium_days, min: 1, max: 366, required: true }] });
        if (!v) return;
        body.days = parseInt(v.days, 10);
      } else if (op === 'adjust') {
        const v = await Modal.form({
          title: 'Баланс засах', intro: 'Нэмэх бол эерэг, хасах бол сөрөг тоо. Гүйлгээний түүхэнд бичигдэнэ.',
          fields: [{ name: 'amount', label: 'Дүн (₮)', type: 'number', placeholder: '5000 эсвэл -5000', required: true }, { name: 'note', label: 'Шалтгаан', placeholder: 'Жишээ: Алдааны нөхөн олговор', required: true }],
        });
        if (!v) return;
        body.amount = parseInt(v.amount, 10);
        body.note = v.note;
      } else if (op === 'extra_plays') {
        const v = await Modal.form({ title: 'Нэмэлт дасгал эрх', intro: `Өдөр бүр үндсэн ${App.config.practice_daily_free} дээр нэмэгдэнэ.`, fields: [{ name: 'value', label: 'Өдөрт нэмэлт', type: 'number', value: btn.dataset.v || 0, min: 0, max: 100, required: true }] });
        if (!v) return;
        body.value = parseInt(v.value, 10);
      } else if (op === 'ban') {
        const ok = await Modal.confirm({ title: 'Хориглох', message: html`<b>${btn.dataset.name}</b>-г хориглох уу? Нэвтэрч, тоглох боломжгүй болно.`, confirmText: 'Хориглох', danger: true });
        if (!ok) return;
      }
      try {
        const r = await Api.post('admin_user', body);
        Toast.show(r.message, 'success');
        this.users();
      } catch (e) { Toast.error(e); }
    },

    words() {
      return this.run(async () => {
        const r = await Api.get('admin_words', { q: this.wordQ, filter: this.wordFilter, page: this.wordPage });
        const c = r.counts;
        this.body(html`
          <div class="card">
            <h3 class="card-h">Үг нэмэх</h3>
            <form class="form" data-form="words-add">
              <textarea class="input mono" name="text" rows="5" placeholder="Мөр бүрт нэг үг, хүсвэл тайлбартай:&#10;НОХОЙ - Хүний үнэнч найз&#10;ТЭМЭЭ&#10;эсвэл: ЦЭЦЭГ, ШУВУУ, ЗАГАС"></textarea>
              <label class="check"><input type="checkbox" name="is_answer" checked><span>Өдрийн үг болж болно <small class="muted">(унтраавал зөвхөн толь бичигт)</small></span></label>
              <button class="btn btn-primary" type="submit">${icon('plus')} Нэмэх</button>
            </form>
          </div>
          ${r.upcoming.length ? html`<div class="card"><h3 class="card-h">Бүгдэд товлосон үгс</h3><ul class="sched">${r.upcoming.map((u) => html`<li><span class="muted">${relDay(u.game_date)}</span><b>${u.game_date === Clock.today ? '•'.repeat(Array.from(u.word).length) : u.word}</b>${u.game_date > Clock.today ? html`<button class="icon-btn sm danger" type="button" title="Цуцлах" data-word="${u.word_id}" data-op="unschedule" data-date="${u.game_date}" data-text="${u.word}">${icon('x')}</button>` : ''}</li>`)}</ul></div>` : ''}
          ${segmented([['all', `Бүгд ${c.total}`], ['answers', `Хариулт ${c.answers}`], ['unused', `Ашиглаагүй ${c.unused}`], ['dict', `Толь ${c.dict}`], ['inactive', `Идэвхгүй ${c.inactive}`]], this.wordFilter, 'data-word-filter')}
          <form class="search" data-form="word-search">${icon('search')}<input class="input" name="q" value="${this.wordQ}" placeholder="Үг хайх" autocomplete="off"></form>
          ${r.words.length ? html`<div class="table-wrap"><table class="table">
            <thead><tr><th>Үг</th><th>Тайлбар</th><th>Төрөл</th><th>Ашигласан</th><th></th></tr></thead>
            <tbody>${r.words.map((w) => html`<tr class="${w.is_active ? '' : 'inactive'}">
              <td><b class="mono">${w.word}</b> <small class="muted">${w.length}</small></td>
              <td class="td-def">${w.definition || html`<span class="muted">—</span>`}</td>
              <td>${w.is_answer ? html`<span class="badge badge-good">Хариулт</span>` : html`<span class="badge">Толь</span>`}${w.is_active ? '' : html` <span class="badge badge-bad">Идэвхгүй</span>`}</td>
              <td>${w.used_count ? html`${w.used_count}× <small class="muted">${w.last_used_date ? fmtDate(w.last_used_date) : ''}</small>` : html`<span class="muted">—</span>`}</td>
              <td class="td-act">
                <button class="icon-btn sm" type="button" title="Засах" data-word="${w.id}" data-op="edit" data-def="${w.definition}" data-answer="${w.is_answer ? 1 : 0}" data-active="${w.is_active ? 1 : 0}" data-text="${w.word}">${icon('edit')}</button>
                <button class="icon-btn sm" type="button" title="Товлох" data-word="${w.id}" data-op="schedule" data-text="${w.word}">${icon('calendar')}</button>
                <button class="icon-btn sm danger" type="button" title="Устгах" data-word="${w.id}" data-op="delete" data-text="${w.word}">${icon('trash')}</button>
              </td>
            </tr>`)}</tbody></table></div>` : empty('book', 'Үг олдсонгүй')}
          ${r.pages > 1 ? html`<div class="pager">
            <button class="btn btn-ghost btn-sm" type="button" data-word-page="${r.page - 1}" ${r.page <= 1 ? raw('disabled') : ''}>${icon('left')}</button>
            <span>${r.page} / ${r.pages}</span>
            <button class="btn btn-ghost btn-sm" type="button" data-word-page="${r.page + 1}" ${r.page >= r.pages ? raw('disabled') : ''}>${icon('right')}</button>
          </div>` : ''}`);
      });
    },

    async wordAction(btn) {
      const id = Number(btn.dataset.word), op = btn.dataset.op, word = btn.dataset.text;
      let body = null;
      if (op === 'edit') {
        const v = await Modal.form({
          title: `«${word}» засах`,
          fields: [
            { name: 'definition', label: 'Тайлбар', type: 'textarea', rows: 3, value: btn.dataset.def, placeholder: 'Тоглоом дууссаны дараа харагдана' },
            { name: 'is_answer', label: 'Өдрийн үг болж болно', type: 'checkbox', value: btn.dataset.answer === '1' },
            { name: 'is_active', label: 'Идэвхтэй', type: 'checkbox', value: btn.dataset.active === '1' },
          ],
        });
        if (!v) return;
        body = { id, op: 'update', ...v };
      } else if (op === 'schedule') {
        const v = await Modal.form({ title: `«${word}» бүгдэд товлох`, intro: 'Сонгосон өдөр БҮХ хэрэглэгчид энэ нэг үг ирнэ (онцгой өдөр). Бусад өдөр хүн бүрт санамсаргүй үг ирдэг.', fields: [{ name: 'date', label: 'Огноо', type: 'date', value: addDays(Clock.today, 1), min: addDays(Clock.today, 1), required: true }], submitText: 'Товлох' });
        if (!v) return;
        body = { id, op: 'schedule', date: v.date };
      } else if (op === 'unschedule') {
        const ok = await Modal.confirm({ title: 'Товлолт цуцлах', message: html`${fmtDate(btn.dataset.date)}-ний <b>${word}</b> товлолтыг цуцлах уу?`, confirmText: 'Цуцлах', danger: true });
        if (!ok) return;
        body = { id, op: 'unschedule', date: btn.dataset.date };
      } else if (op === 'delete') {
        const ok = await Modal.confirm({ title: 'Үг устгах', message: html`<b>${word}</b> үгийг устгах уу?`, confirmText: 'Устгах', danger: true });
        if (!ok) return;
        body = { id, op: 'delete' };
      }
      try {
        const r = await Api.post('admin_word', body);
        Toast.show(r.message, 'success');
        this.words();
      } catch (e) { Toast.error(e); }
    },

    tournaments() {
      return this.run(async () => {
        const r = await Api.get('admin_tournaments');
        const status = { open: ['Нээлттэй', 'good'], closed: ['Хаалттай', 'warn'], finished: ['Дууссан', ''] };
        this.body(html`
          <div class="card">
            <h3 class="card-h">Тэмцээн зарлах</h3>
            <form class="form form-inline" data-form="tournament-create">
              <label class="field"><span class="field-label">Огноо</span><input class="input" type="date" name="date" value="${r.today}" min="${r.today}" required></label>
              <label class="field"><span class="field-label">Хураамж (₮)</span><input class="input" type="number" name="fee" value="${r.default_fee}" min="0" step="500" required></label>
              <button class="btn btn-primary" type="submit">${icon('plus')} Зарлах</button>
            </form>
          </div>
          ${r.tournaments.length ? html`<div class="table-wrap"><table class="table">
            <thead><tr><th>Огноо</th><th>Төлөв</th><th>Оролцогч</th><th>Сан</th><th>Шагнал</th><th></th></tr></thead>
            <tbody>${r.tournaments.map((t) => html`<tr>
              <td><b>${t.tournament_date}</b></td>
              <td><span class="badge badge-${(status[t.status] || ['', ''])[1]}">${(status[t.status] || [t.status])[0]}</span></td>
              <td>${t.participant_count} <small class="muted">(${t.winners_count} таасан)</small></td>
              <td>${money(t.prize_pool)} <small class="muted">· ${money(t.entry_fee)}</small></td>
              <td class="small">${t.status === 'finished' ? `${money(t.first_prize)} / ${money(t.second_prize)} / ${money(t.third_prize)}` : '—'}</td>
              <td class="td-act">${t.status !== 'finished' ? html`
                ${t.tournament_date < r.today ? html`<button class="btn btn-primary btn-xs" type="button" data-t="${t.id}" data-op="finalize">Дүгнэх</button>` : ''}
                <button class="btn btn-danger-ghost btn-xs" type="button" data-t="${t.id}" data-op="cancel">Цуцлах</button>` : ''}</td>
            </tr>`)}</tbody></table></div>` : empty('target', 'Тэмцээн зарлаагүй байна')}`);
      });
    },

    async tAction(id, op) {
      const ok = await Modal.confirm(op === 'cancel'
        ? { title: 'Тэмцээн цуцлах', message: 'Бүх оролцогчийн хураамжийг буцаана. Итгэлтэй байна уу?', confirmText: 'Цуцлах', danger: true }
        : { title: 'Тэмцээн дүгнэх', message: 'Шагналыг одоо хуваарилах уу?', confirmText: 'Дүгнэх' });
      if (!ok) return;
      try {
        const r = await Api.post('admin_tournament', { op, id });
        Toast.show(r.message, 'success');
        this.tournaments();
      } catch (e) { Toast.error(e); }
    },

    system() {
      return this.run(async () => {
        const r = await Api.get('admin_health');
        this.body(html`<div class="card"><ul class="health">${r.checks.map((c) => html`<li class="${c.ok ? 'ok' : 'bad'}">${icon(c.ok ? 'check' : 'alert')}<span>${c.label}</span><b>${c.value}</b></li>`)}</ul></div>
          <p class="muted small">Шалгалт бүрийг дахин ажиллуулахын тулд хуудсаа сэргээнэ үү. Мэдээллийн сангийн бүтэц дутуу бол setup.php-г ажиллуулна.</p>`);
      });
    },
  };

  /* ============================================================
     БОДИТ ЦАГ — нэг хөнгөн хүсэлтээр бүх өөрчлөлтийг шалгана.
     Юу өөрчлөгдсөнийг «гарын үсэг»-ээр харьцуулж, зөвхөн тухайн хуудсыг
     чимээгүй шинэчилнэ. Таб нуугдвал зогсож, идэвхгүй бол удааширна.
     ============================================================ */
  const LIVE_TOAST = {
    topup: '💰 Хэтэвч цэнэглэгдлээ', deposit: '💰 Хэтэвч цэнэглэгдлээ', duel_win: '⚔️ Дуэль ялсан!', duel_refund: '⚔️ Дуэль',
    blitz_prize: '🏆 Blitz шагнал', blitz_refund: '↩️ Blitz хураамж буцаав', tournament_prize: '🏆 Тэмцээний шагнал',
    tournament_refund: '↩️ Тэмцээний хураамж буцаав', referral: '👥 Урилгын урамшуулал', admin_adjust: '🛡️ Админ засвар',
    withdrawal_refund: '↩️ Таталт буцаав',
  };

  /** Хуудсыг чимээгүй дахин зурахад аюулгүй эсэх — хэрэглэгч бичиж байхад хөндөхгүй */
  const safeToRefresh = (el) => {
    if (!el || el.hidden || Modal.stack.length) return false;
    const a = document.activeElement;
    if (a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    return !$$('input:not([type=checkbox]):not([type=hidden]), textarea', el).some((i) => i.value !== i.defaultValue);
  };

  const Live = {
    timer: null,
    since: 0,
    last: null,
    interval: 5000,
    lastInput: Date.now(),
    busy: false,
    started: false,
    lastHub: 0,

    start() {
      if (this.started) { this.poll(); return; }
      this.started = true;
      const touch = () => { const idle = this.idle(); this.lastInput = Date.now(); if (idle) this.poll(); };
      ['pointerdown', 'keydown', 'scroll'].forEach((ev) => addEventListener(ev, touch, { passive: true }));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); else clearTimeout(this.timer); });
      addEventListener('online', () => this.poll());
      this.poll();
    },

    idle() { return Date.now() - this.lastInput > 5 * 60 * 1000; },

    schedule() {
      clearTimeout(this.timer);
      if (document.hidden) return;
      this.timer = setTimeout(() => this.poll(), this.idle() ? 60000 : this.interval);
    },

    /** Үйлдэл хийсний дараа шууд шалгуулах (жишээ нь дуэль үүсгэсний дараа) */
    soon(ms = 800) { clearTimeout(this.timer); this.timer = setTimeout(() => this.poll(), ms); },

    async poll() {
      if (this.busy) return;
      this.busy = true;
      try {
        const r = await Api.get('live', this.since ? { since: this.since } : null);
        this.apply(r);
      } catch {
        // Сүлжээний алдаа — дараагийн удаа дахин оролдоно
      } finally {
        this.busy = false;
        this.schedule();
      }
    },

    apply(r) {
      this.interval = clamp((r.interval || 5) * 1000, 2000, 60000);
      Clock.sync(r.time);
      const prev = this.last;
      const g = r.g || {};

      // Нүүр хуудас (нэвтрээгүй)
      App.publicToday = { players: g.daily ? g.daily.players : 0, winners: g.daily ? g.daily.winners : 0 };
      if (!App.user) { Landing.renderLive(); this.last = { g }; return; }

      // Хэрэглэгч: үлдэгдэл, Premium
      if (r.user && App.user) {
        if (r.user.balance !== App.user.balance) App.setBalance(r.user.balance);
        if (r.user.is_premium !== App.user.is_premium || r.user.is_admin !== App.user.is_admin) App.patchUser(r.user);
      }

      // Гүйлгээний мэдэгдэл
      if (this.since && r.events) {
        for (const e of r.events) {
          const t = LIVE_TOAST[e.type];
          if (t && e.amount !== 0) Toast.show(`${t} ${signedMoney(e.amount)}`, e.amount > 0 ? 'success' : 'info', 5000);
        }
      }
      if (r.tx != null) this.since = r.tx;

      const me = r.me || {};
      const pm = prev && prev.me ? prev.me : null;
      if (pm) {
        const d = me.duel, pd = pm.duel;
        if (d && pd && d.id === pd.id && d.status !== pd.status) {
          if (d.status === 'active' && d.mine) Toast.show(`⚔️ Таны ${money(d.stake)}-ийн дуэлийг хүлээж авлаа! Үр дүн удахгүй.`, 'info', 5000);
          if (d.status === 'done' && d.result === 'lost') Toast.show('⚔️ Дуэль: энэ удаа ялагдлаа. Дахин сорь!', 'info', 5000);
        }
        if (me.wd && pm.wd && me.wd.id === pm.wd.id && me.wd.status !== pm.wd.status && me.wd.status === 'approved') {
          Toast.show(`✅ Таны ${money(me.wd.amount)} данс руу шилжүүлэгдлээ`, 'success', 6000);
        }
      }
      const adm = r.admin, pa = prev && prev.admin;
      if (adm && pa) {
        if (adm.last_dep > pa.last_dep && adm.deposits > pa.deposits) Toast.show(`🔔 Шинэ цэнэглэлтийн хүсэлт (${adm.deposits} хүлээгдэж байна)`, 'info', 6000);
        if (adm.last_wd > pa.last_wd && adm.withdrawals > pa.withdrawals) Toast.show(`🔔 Шинэ таталтын хүсэлт (${adm.withdrawals} хүлээгдэж байна)`, 'info', 6000);
      }
      const profileTab = $('.tabbar .tab[data-tab="profile"]');
      if (profileTab) profileTab.classList.toggle('has-dot', !!(adm && (adm.deposits || adm.withdrawals)));

      this.last = { g, me, admin: adm };
      if (!prev) return;

      // Юу өөрчлөгдсөн бэ
      const ch = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
      const changed = {
        daily: ch(g.daily, prev.g.daily),
        arena: ch(g.arena, prev.g.arena),
        duels: ch(g.duels, prev.g.duels) || ch(me.duel, pm && pm.duel),
        tour: ch(g.tour, prev.g.tour) || ch(g.daily, prev.g.daily),
        board: ch(g.board, prev.g.board),
        money: ch(me.wd, pm && pm.wd) || ch(me.dep, pm && pm.dep) || !!(r.events && r.events.length),
        admin: ch(adm, pa),
      };
      this.refreshPages(changed);
    },

    refreshPages(c) {
      const page = Router.current;
      if (page === 'games' && (c.arena || c.duels || c.daily || (c.board && Date.now() - this.lastHub > 15000))) {
        if (safeToRefresh($('#page-games'))) { this.lastHub = Date.now(); Pages.games.show(); }
      }
      if (page === 'g' && Mini.game === 'blitz' && !Blitz.run && !Blitz.busy && safeToRefresh($('#page-g'))) {
        if (Blitz.mode === 'duel' && c.duels) Blitz.refreshDuel();
        if (Blitz.mode === 'arena' && c.arena) Blitz.refreshArena();
      }
      if (page === 'tournament' && c.tour && safeToRefresh($('#page-tournament'))) Pages.tournament.show();
      if (page === 'leaders' && c.daily && safeToRefresh($('#page-leaders'))) Pages.leaders.load(true);
      if (page === 'wallet' && c.money && safeToRefresh($('#page-wallet'))) Pages.wallet.show();
      if (page === 'topup' && c.money && safeToRefresh($('#page-topup'))) Pages.topup.show();
      if (page === 'admin' && c.admin && ['overview', 'deposits', 'withdrawals'].includes(Pages.admin.tab) && safeToRefresh($('#page-admin'))) {
        Pages.admin[Pages.admin.tab]();
      }
      if (page === 'play' && c.tour && Game.mode === 'daily' && Game.tournament && this.last.g.tour) {
        Game.tournament.prize_pool = this.last.g.tour.pool;
        Game.tournament.participants = this.last.g.tour.n;
        Game.renderBanner();
      }
    },
  };

  /* ============================================================
     8. ҮЙЛ ЯВДЛЫН ХОЛБОЛТ, ЭХЛҮҮЛЭХ
     ============================================================ */
  const actions = {
    help: () => Help.open(),
    stats: () => Result.open(),
    result: () => Result.open(),
    settings: () => Settings.open(),
    logout: () => { Modal.closeAll(); Auth.logout(); },
    share: () => shareOrCopy(Game.shareText()),
    'share-invite': () => Pages.referral.share(),
    'reload-game': () => {
      if (Router.current === 'review') Game.loadReview(Router.parse().args[0]);
      else if (Router.current === 'practice') Game.loadPractice(true);
      else Game.loadDaily(true);
    },
    reload: () => location.reload(),
    'copy-url': () => copyText(location.href, 'Холбоос хуулагдлаа — хөтөчдөө буулгаарай'),
    'join-tournament': (b) => Pages.tournament.join(Number(b.dataset.fee)),
    'buy-premium': () => Pages.premium.buy(),
    'topup-submit': (b) => Pages.topup.submit(Number(b.dataset.id)),
    'topup-cancel': (b) => Pages.topup.cancel(Number(b.dataset.id)),
    'topup-change': () => { Pages.topup.changing = true; Pages.topup.render(); },
    'tg-find': () => Pages.admin.telegram('find_chat'),
    'tg-mode': (b) => { if (!b.disabled && b.getAttribute('aria-checked') !== 'true') Pages.admin.telegramMode(b.dataset.v); },
    'tg-status': () => Pages.admin.telegramStatus(),
    'practice-new': async (b) => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        const r = await Api.post('practice_new');
        Game.pendingPractice = r.game;
        Game.archive = r.allowance;
        Modal.closeAll();
        Router.nav('practice');
      } catch (e) {
        Toast.error(e);
        if (e.code === 'practice_limit') setTimeout(() => Router.nav('premium'), 1200);
      } finally {
        b.disabled = false;
      }
    },
    'tg-test': () => Pages.admin.telegram('test'),
    hint: () => Game.hint(),
    'mini-start': (b) => Mini.start(b),
    'mini-submit': () => Mini.submitAnagram(),
    'mini-hint': () => Mini.hint(),
    'mini-rules': (b) => rulesModal(b.dataset.kind),
    'mini-revive': () => Mini.revive(),
    'duel-create': (b) => Blitz.duelCreate(b),
    'duel-accept': (b) => Blitz.duelAccept(b),
    'duel-share': (b) => Blitz.duelShare(b),
    'premium-plan': (b) => { Pages.premium.plan = b.dataset.plan; Pages.premium.show(null, true); },
    'ws-giveup': () => Mini.giveUp(),
    'bld-shuffle': () => { const c = Mini.current(); if (c.b) { Builder.shuffle(c.b); c.redrawBuilder(); } },
    'bld-clear': () => { const c = Mini.current(); if (c.b) { Builder.clear(c.b); c.redrawBuilder(); } },
    'blitz-start': (b) => Blitz.start(b.dataset.ranked === '1', b),
    'blitz-skip': () => Blitz.skip(),
    'wd-max': () => {
      const inp = $('#wd-form [name=amount]');
      if (inp && App.user) inp.value = Math.min(App.user.balance, App.config.max_withdrawal);
    },
    'reveal-word': (b) => {
      const w = $('.tw-word');
      if (!w) return;
      const hidden = w.dataset.hidden === '1';
      w.textContent = hidden ? w.dataset.secret : '•'.repeat(Array.from(w.dataset.secret).length);
      w.dataset.hidden = hidden ? '0' : '1';
      const def = $('.tw-def');
      if (def) def.hidden = !hidden;
      b.innerHTML = String(html`${icon('eye')} ${hidden ? 'Нуух' : 'Харах'}`);
    },
    install: async () => {
      const p = App.installPrompt;
      if (!p) return;
      Modal.closeAll();
      p.prompt();
      try { await p.userChoice; } catch { /* */ }
      App.installPrompt = null;
    },
  };

  const bindEvents = () => {
    document.addEventListener('click', (e) => {
      const t = e.target;
      const act = t.closest('[data-action]');
      if (act && actions[act.dataset.action]) { e.preventDefault(); actions[act.dataset.action](act); return; }
      const cp = t.closest('[data-copy]');
      if (cp) { copyText(cp.dataset.copy); return; }
      if (t.closest('[data-sponsor]')) { Api.post('sponsor_click').catch(() => {}); return; }
      const retry = t.closest('[data-retry]');
      if (retry) { Router.go(); return; }
      const lb = t.closest('[data-period]');
      if (lb) {
        Pages.leaders.period = lb.dataset.period;
        store.set('lbPeriod', lb.dataset.period);
        $$('[data-period]').forEach((x) => x.setAttribute('aria-selected', String(x === lb)));
        Pages.leaders.load();
        return;
      }
      const amt = t.closest('[data-topup-amount]');
      if (amt) {
        const inp = $('[data-form="topup-create"] [name=amount]');
        if (inp) { inp.value = amt.dataset.topupAmount; inp.classList.remove('invalid'); }
        $$('[data-topup-amount]').forEach((x) => x.classList.toggle('active', x === amt));
        return;
      }
      const A = Pages.admin;
      const ds = t.closest('[data-dep-status]');
      if (ds) { A.depStatus = ds.dataset.depStatus; A.deposits(); return; }
      const dp = t.closest('[data-dep]');
      if (dp) { A.depAction(dp); return; }
      const ws = t.closest('[data-wd-status]');
      if (ws) { A.wdStatus = ws.dataset.wdStatus; A.withdrawals(); return; }
      const wd = t.closest('[data-wd]');
      if (wd) { A.wdAction(Number(wd.dataset.wd), wd.dataset.op); return; }
      const us = t.closest('[data-user]');
      if (us) { A.userAction(Number(us.dataset.user), us.dataset.op, us); return; }
      const up = t.closest('[data-user-page]');
      if (up) { A.userPage = Number(up.dataset.userPage); A.users(); return; }
      const wf = t.closest('[data-word-filter]');
      if (wf) { A.wordFilter = wf.dataset.wordFilter; A.wordPage = 1; A.words(); return; }
      const wp = t.closest('[data-word-page]');
      if (wp) { A.wordPage = Number(wp.dataset.wordPage); A.words(); return; }
      const wa = t.closest('[data-word]');
      if (wa) { A.wordAction(wa); return; }
      const ta = t.closest('[data-t]');
      if (ta) { A.tAction(Number(ta.dataset.t), ta.dataset.op); return; }
      // Модал доторх холбоос дарахад модалыг хаана
      const link = t.closest('.modal a[href^="#"]');
      if (link) Modal.closeAll();
    });

    document.addEventListener('submit', async (e) => {
      const f = e.target;
      if (f.id === 'wd-form') { e.preventDefault(); Pages.wallet.submit(f); return; }
      const kind = f.dataset.form;
      if (!kind) return;
      e.preventDefault();
      const A = Pages.admin;
      if (kind === 'topup-create') { Pages.topup.create(f); return; }
      if (kind === 'deposit-setup') { Pages.topup.saveSetup(f); return; }
      if (kind === 'settings-deposit' || kind === 'settings-telegram' || kind === 'settings-sponsor') {
        const btn = $('button[type=submit]', f);
        btn.disabled = true;
        try { await A.saveSettings(f); } catch (err) { Toast.error(err); } finally { btn.disabled = false; }
        return;
      }
      if (kind === 'user-search') { A.userQ = f.elements.q.value.trim(); A.userPage = 1; A.users(); }
      if (kind === 'word-search') { A.wordQ = f.elements.q.value.trim(); A.wordPage = 1; A.words(); }
      if (kind === 'words-add') {
        const btn = $('button[type=submit]', f);
        btn.disabled = true;
        try {
          const r = await Api.post('admin_words_add', { text: f.elements.text.value, is_answer: f.elements.is_answer.checked });
          Toast.show(r.message, r.added ? 'success' : 'info', 4000);
          if (r.invalid && r.invalid.length) Toast.show('Буруу: ' + r.invalid.slice(0, 5).join(', '), 'error', 5000);
          A.words();
        } catch (err) { Toast.error(err); btn.disabled = false; }
      }
      if (kind === 'tournament-create') {
        try {
          const r = await Api.post('admin_tournament', { op: 'create', date: f.elements.date.value, fee: parseInt(f.elements.fee.value, 10) || 0 });
          Toast.show(r.message, 'success');
          A.tournaments();
        } catch (err) { Toast.error(err); }
      }
    });

    // Мини тоглоомын товчнууд (үсэг, хариулт)
    const pg = $('#page-g');
    pg.addEventListener('mousedown', (e) => { if (e.target.closest('[data-pool],[data-slot],[data-letter]')) e.preventDefault(); });
    pg.addEventListener('click', (e) => {
      const t = e.target;
      const c = Mini.current();
      const p = t.closest('[data-pool]');
      if (p) { c.pool(Number(p.dataset.pool)); return; }
      const sl = t.closest('[data-slot]');
      if (sl) { c.slot(Number(sl.dataset.slot)); return; }
      const l = t.closest('[data-letter]');
      if (l) { Mini.letter(l.dataset.letter); return; }
      const ch = t.closest('[data-choice]');
      if (ch && !ch.disabled) { Mini.choose(Number(ch.dataset.choice), ch); return; }
      const sk = t.closest('[data-stake]');
      if (sk && !sk.dataset.action) { Blitz.pickStake(Number(sk.dataset.stake)); return; }
      const dk = t.closest('[data-duo-key]');
      if (dk) { Mini.duoKey(dk.dataset.duoKey); return; }
      const tf = t.closest('[data-truth]');
      if (tf && !tf.disabled) { Mini.answerTruth(tf.dataset.truth === '1'); return; }
      const cell = Mini.cellAt(t);
      if (cell) {
        // Чирж дууссаны дараах click-ийг тоохгүй
        if (performance.now() - Mini.dragEnd < 350) return;
        Mini.cellTap(cell);
      }
    });

    // Үг хайх: чирж зурах (хулгана, хуруу)
    pg.addEventListener('pointerdown', (e) => {
      const cell = Mini.cellAt(e.target);
      if (!cell || !Mini.s || Mini.s.game !== 'search' || Mini.s.completed) return;
      Mini.drag = cell;
    });
    pg.addEventListener('pointermove', (e) => {
      if (!Mini.drag) return;
      const cell = Mini.cellAt(document.elementFromPoint(e.clientX, e.clientY));
      if (cell && !sameCell(cell, Mini.drag)) { e.preventDefault(); Mini.highlight(Mini.drag, cell); }
    });
    addEventListener('pointerup', (e) => {
      if (!Mini.drag) return;
      const start = Mini.drag;
      Mini.drag = null;
      const cell = Mini.cellAt(document.elementFromPoint(e.clientX, e.clientY));
      if (cell && !sameCell(cell, start) && inLine(start, cell)) {
        Mini.dragEnd = performance.now();
        Mini.sel = null;
        Mini.submitSearch(start, cell);
      } else {
        Mini.highlight();
      }
    });

    // Дэлгэцийн гар
    const kb = $('#keyboard');
    kb.addEventListener('mousedown', (e) => { if (e.target.closest('.key')) e.preventDefault(); });
    kb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]');
      if (!b) return;
      const k = b.dataset.key;
      if (k === 'enter') Game.submit();
      else if (k === 'back') Game.back();
      else Game.type(k);
    });

    // Компьютерийн гар
    document.addEventListener('keydown', (e) => {
      if (Modal.stack.length) {
        const m = Modal.top();
        if (e.key === 'Escape') { e.preventDefault(); m.close(); return; }
        if (e.key === 'Tab') {
          const f = $$('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]', m.el).filter((x) => x.offsetParent !== null);
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (App.user && Router.current === 'g' && Mini.game && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tg = e.target && e.target.tagName;
        if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
        const c = Mini.current();
        if (c === Mini && Mini.special(e)) { e.preventDefault(); return; }
        if (e.key === 'Enter') {
          if ((tg === 'BUTTON' || tg === 'A') && !e.target.closest('.bld-pool,.bld-slots')) return;
          e.preventDefault(); c.enter(); return;
        }
        if (e.key === 'Backspace') { e.preventDefault(); c.backspace(); return; }
        let k = e.key && e.key.length === 1 ? e.key.toUpperCase() : '';
        if (!MN_SET.has(k)) k = CODE_MAP[e.code] || '';
        if (k) { e.preventDefault(); c.key(k); }
        return;
      }
      if (!App.user || !Game.active() || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') {
        if ((tag === 'BUTTON' || tag === 'A') && !e.target.closest('#keyboard')) return;
        e.preventDefault(); Keyboard.flash('enter'); Game.submit(); return;
      }
      if (e.key === 'Backspace') { e.preventDefault(); Keyboard.flash('back'); Game.back(); return; }
      let ch = e.key && e.key.length === 1 ? e.key.toUpperCase() : '';
      if (!MN_SET.has(ch)) ch = CODE_MAP[e.code] || '';
      if (ch) { e.preventDefault(); Keyboard.flash(ch); Game.type(ch); }
    });

    // Ачаалагдаагүй аватар зургийг нуух (CSP-ийн улмаас inline onerror ашиглахгүй)
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (img && img.tagName === 'IMG' && img.closest('.avatar')) img.remove();
    }, true);

    // Талбарын хэмжээ
    const wrap = $('#board-wrap');
    if ('ResizeObserver' in window) new ResizeObserver(() => Board.fit()).observe(wrap);
    addEventListener('resize', () => Board.fit());

    // Сүлжээ
    const bar = $('#offline-bar');
    addEventListener('offline', () => { bar.hidden = false; });
    addEventListener('online', () => { bar.hidden = true; Toast.show('Интернэт холбогдлоо', 'success'); });
    if (!navigator.onLine) bar.hidden = false;

    // Таб руу буцаж ирэхэд шинэ өдөр эхэлсэн бол үгээ шинэчилнэ
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !App.user) return;
      if (Game.mode === 'daily' && Clock.nextReset && Clock.left() === 0) {
        Game.markStale();
        if (Router.current === 'play') Game.loadDaily(true);
      }
    });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => Prefs.apply());

    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); App.installPrompt = e; });

    setInterval(() => Clock.tick(), 1000);
  };

  const captureReferral = () => {
    const p = new URLSearchParams(location.search);
    const ref = (p.get('ref') || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
    if (ref) {
      store.set('ref', ref);
      p.delete('ref');
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
  };

  const hydrateIcons = () => {
    $$('[data-icon]').forEach((el) => { el.innerHTML = String(icon(el.dataset.icon)); });
  };

  const boot = async () => {
    Prefs.apply();
    hydrateIcons();
    captureReferral();
    bindEvents();
    try { localStorage.removeItem('auth_token'); sessionStorage.removeItem('auth_token'); } catch { /* v5 */ }

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    const cfg = Api.get('config').then((r) => {
      App.config = { ...DEFAULT_CONFIG, ...r.config };
      App.publicToday = r.today;
      App.sponsor = r.sponsor || null;
      Clock.sync(r.time);
    }).catch(() => {});

    if (Api.token) {
      try {
        const me = await Api.get('me');
        Clock.sync(me.time);
        App.setUser(me.user);
        await cfg;
        App.enter();
      } catch (e) {
        await cfg;
        if (e.status === 401 || e.status === 403) {
          Auth.clear(true);
          if (e.status === 403) Toast.show(e.message, 'error', 5000);
        } else {
          // Сүлжээний алдаа: token-оо хадгалж, дахин оролдох боломж өгнө
          Landing.show();
          Toast.show(e.message, 'error', 5000);
        }
      }
    } else {
      await cfg;
      Landing.show();
    }

    Live.start();
    const splash = $('#splash');
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 400);
  };

  boot();
})();

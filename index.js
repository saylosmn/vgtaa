/* ============================================================
   Үг Таа — Монгол үг таах тоглоом
   index.js — v6
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
  const VERSION = '6.3.0';

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
  };

  /* ============================================================
     2. API
     ============================================================ */
  class ApiError extends Error {
    constructor(message, status = 0, code = null) { super(message); this.status = status; this.code = code; }
  }

  const Api = {
    token: store.get('token'),

    async call(action, { method = 'GET', body = null, query = null, timeout = 20000 } = {}) {
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

    show() {
      $('#landing').hidden = false;
      const c = App.config;
      $('#step-reward').textContent = '+' + money(c.reward_amount);
      $('#hero-sub').textContent = `Нууц монгол үгийг ${c.max_attempts} оролдлогоор таа. Зөв таавал ${money(c.reward_amount)} шагнал шууд хэтэвчинд орно.`;
      const live = $('#hero-live');
      if (App.publicToday && App.publicToday.players > 0) {
        live.innerHTML = html`<span class="pulse-dot"></span> Өнөөдөр <b>${fmt(App.publicToday.players)}</b> хүн тоглож, <b>${fmt(App.publicToday.winners)}</b> нь таасан`;
        live.hidden = false;
      }
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
        ['Premium гэж юу вэ?', `Сард ${money(c.premium_price)}. ${c.premium_multiplier > 1 ? `${c.premium_multiplier}× шагнал, ` : ''}тэмцээнд үнэгүй оролцох, дасгалыг хязгааргүй тоглох эрх.`],
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
  };
  /* Дэд хуудас нээгдэхэд доод цэсний аль таб идэвхтэй харагдах вэ */
  const PARENT_TAB = { archive: 'play', practice: 'play', topup: 'wallet', referral: 'profile', premium: 'profile', admin: 'profile' };

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

    reset() {
      Object.assign(this, { mode: null, date: null, rows: [], current: [], done: false, won: false, answer: null, definition: null, keyStates: {}, stale: false, tournament: null });
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
      badges.push(html`<a class="icon-btn" href="#/archive" aria-label="Дасгал" title="Дасгал">${icon('history')}</a>`);
      $('#play-badges').innerHTML = html`${badges}`;

      this.renderBanner();
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
          <a class="btn btn-ghost btn-block" href="#/archive" data-close>${icon('history')} Дасгал тоглох</a>` : ''}
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
            <div>${icon('history')}<span>Нэмэлт үг тоглох бол <b>Дасгал</b> горимд ор.</span></div>
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

    async load() {
      const body = $('#lb-body');
      body.innerHTML = String(skeleton(6));
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

  /* ── Хэтэвч ────────────────────────────────────────────── */
  const TX = {
    win: ['trophy', 'Өдрийн шагнал'], referral: ['users', 'Урилгын урамшуулал'], withdrawal: ['wallet', 'Мөнгө татсан'],
    withdrawal_refund: ['refresh', 'Таталт буцаав'], tournament_fee: ['target', 'Тэмцээний хураамж'],
    tournament_prize: ['trophy', 'Тэмцээний шагнал'], tournament_refund: ['refresh', 'Тэмцээний буцаалт'],
    premium: ['crown', 'Premium'], admin_adjust: ['shield', 'Засвар'], topup: ['banknote', 'Хэтэвч цэнэглэлт'], tournament: ['target', 'Тэмцээн'], deposit: ['wallet', 'Гүйлгээ'],
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
            ${r.deposits && r.deposits.enabled ? html`<a class="btn btn-gold btn-block wh-btn" href="#/topup">${icon('plus')} Хэтэвч цэнэглэх</a>` : ''}
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
        el.innerHTML = html`${this.head()}${empty('lock', 'Цэнэглэлт түр хаалттай', 'Удахгүй нээгдэнэ. Асуух зүйл байвал админтай холбогдоно уу.')}${this.history()}`;
        return;
      }
      el.innerHTML = html`${this.head()}${d.open && !this.changing ? this.transfer(d.open, d.bank) : this.picker()}${this.history()}`;
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
            ${item('#/referral', 'users', 'Найз урих', `${r.referrals.verified}/${c.referral_unlock} баталгаажсан`)}
            ${item('#/premium', 'crown', 'Premium', u.is_premium ? 'Идэвхтэй' : `${money(c.premium_price)}/сар`)}
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
    show(args, fresh = false) {
      if (!fresh) Api.get('me').then((r) => { App.patchUser(r.user); if (Router.current === 'premium') this.show(args, true); }).catch(() => {});
      const el = $('#page-premium');
      const u = App.user, c = App.config;
      const short = Math.max(0, c.premium_price - u.balance);
      const perks = [
        c.premium_multiplier > 1 && ['trophy', `${c.premium_multiplier}× шагнал`, `Өдрийн үг таавал ${money(c.reward_amount * c.premium_multiplier)}`],
        ['target', 'Тэмцээнд үнэгүй', `${money(c.tournament_fee)} хураамжгүйгээр оролцоно`],
        ['history', 'Дасгал хязгааргүй', `Энгийн хэрэглэгч өдөрт ${c.practice_daily_free}`],
        ['crown', 'Алтан тэмдэг', 'Жагсаалт, профайлд алтан хүрээ'],
      ];
      el.innerHTML = html`
        <div class="prem-hero">
          <div class="prem-crown">${icon('crown')}</div>
          <h1>Premium</h1>
          <div class="prem-price">${money(c.premium_price)} <small>/ ${c.premium_days} хоног</small></div>
          ${u.is_premium ? html`<span class="chip chip-gold">${icon('check')} Идэвхтэй · ${fmtDate(u.premium_expires_at)} хүртэл</span>` : ''}
        </div>
        <ul class="perks">${perks.filter(Boolean).map(([ic, t, s]) => html`<li><span class="perk-ic">${icon(ic)}</span><span><b>${t}</b><small>${s}</small></span></li>`)}</ul>
        <div class="card">
          <div class="pay-row"><span class="muted">Таны үлдэгдэл</span><b>${money(u.balance)}</b></div>
          <div class="pay-row"><span class="muted">Төлбөр</span><b>− ${money(c.premium_price)}</b></div>
          <button class="btn btn-gold btn-block btn-lg" type="button" data-action="buy-premium" ${short > 0 ? raw('disabled') : ''}>
            ${short > 0 ? `Үлдэгдэл хүрэлцэхгүй (${money(short)} дутуу)` : u.is_premium ? `${c.premium_days} хоногоор сунгах` : 'Premium авах'}</button>
          <p class="muted small center">Төлбөрийг хэтэвчний үлдэгдлээс хасна. Сунгавал хугацаа дээр нь нэмэгдэнэ.</p>
        </div>`;
    },

    async buy() {
      const c = App.config;
      const ok = await Modal.confirm({
        title: 'Premium',
        message: html`Хэтэвчнээс <b>${money(c.premium_price)}</b> хасаж ${c.premium_days} хоногийн Premium ${App.user.is_premium ? 'сунгах' : 'идэвхжүүлэх'} үү?`,
        confirmText: 'Төлөх',
      });
      if (!ok) return;
      try {
        const r = await Api.post('premium_buy');
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
          <h3 class="sub-h">Санхүү</h3>
          <div class="stat-grid stat-grid-3">
            ${tile('Хэрэглэгчдийн нийт үлдэгдэл', money(s.liability), 'Таны өр төлбөр')}
            ${tile('Хүлээгдэж буй таталт', money(s.pending_sum), `${s.pending_count} хүсэлт`, s.pending_count > 0)}
            ${tile('Нийт шилжүүлсэн', money(s.paid_total))}
            ${tile('Premium хэрэглэгч', fmt(s.premium_users))}
            ${tile('Premium орлого (30 хоног)', money(s.premium_30d))}
            ${tile('Цэнэглэлт (30 хоног)', money(s.deposits_30d))}
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
      const names = form.dataset.form === 'settings-deposit'
        ? ['deposit_enabled', 'deposit_bank', 'deposit_account_name', 'deposit_account_number', 'deposit_iban', 'deposit_min', 'deposit_max']
        : ['telegram_bot_token', 'telegram_chat_id', 'telegram_admin_ids', 'notify_withdrawals'];
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
      if (kind === 'settings-deposit' || kind === 'settings-telegram') {
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

    const splash = $('#splash');
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 400);
  };

  boot();
})();

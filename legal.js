/* Үг Таа — Үйлчилгээний нөхцөл, Нууцлалын бодлогын хуудас.
 * Сэдэв (харанхуй/цайвар)-ийг апптай ижил болгож, дүн, хувь, холбоо барих хаягийг
 * серверийн тохиргооноос авч шинэчилнэ. Сервер хариулахгүй бол HTML-д бичсэн утга үлдэнэ. */
(function () {
  'use strict';
  try {
    const p = JSON.parse(localStorage.getItem('ugtaa:prefs') || '{}'), d = document.documentElement;
    if (p.theme === 'dark' || p.theme === 'light') d.setAttribute('data-theme', p.theme);
    if (p.contrast) d.setAttribute('data-contrast', 'high');
  } catch (e) { /* хувийн горим */ }

  const fmt = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const money = (n) => fmt(n) + '₮';
  const FORMAT = {
    money, pct: (n) => n + '%', num: fmt,
    list: (a) => (Array.isArray(a) ? a.map(money).join(', ') : ''),
  };

  fetch('api.php?action=config', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then((r) => r.json())
    .then((r) => {
      const c = (r && r.config) || {};
      document.querySelectorAll('[data-cfg]').forEach((el) => {
        const v = c[el.dataset.cfg];
        if (v == null || v === '') return;
        el.textContent = (FORMAT[el.dataset.fmt || 'num'] || String)(v);
      });
      if (c.support_email) {
        document.querySelectorAll('[data-support-email]').forEach((a) => { a.href = 'mailto:' + c.support_email; a.textContent = c.support_email; });
      }
      if (/^https:\/\//i.test(c.support_facebook || '')) {
        document.querySelectorAll('[data-support-fb]').forEach((a) => { a.href = c.support_facebook; a.hidden = false; });
      }
    })
    .catch(() => {});
})();

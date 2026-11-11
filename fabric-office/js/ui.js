/* ========== أدوات الواجهة ========== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = v => num(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const money = v => `${fmt(v)} ${esc(db.settings.currency)}`;

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, type = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

/* ---------- Modal ---------- */
let lastFocus = null;
function openModal(title, html, { wide = false, onOpen } = {}) {
  lastFocus = document.activeElement;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  const bd = $('#modalBackdrop');
  $('.modal', bd).classList.toggle('wide', wide);
  bd.hidden = false;
  document.body.classList.add('no-scroll');
  if (onOpen) onOpen($('#modalBody'));
  const first = $('#modalBody input:not([type=hidden]), #modalBody select, #modalBody textarea, #modalBody button');
  if (first) first.focus();
}

function closeModal() {
  $('#modalBackdrop').hidden = true;
  $('#modalBody').innerHTML = '';
  document.body.classList.remove('no-scroll');
  if (lastFocus) lastFocus.focus();
}

function confirmDialog(message, confirmLabel = 'حذف') {
  return new Promise(resolve => {
    openModal('تأكيد', `
      <p class="confirm-text">${esc(message)}</p>
      <div class="form-actions">
        <button class="btn btn-danger" id="cfYes">${esc(confirmLabel)}</button>
        <button class="btn" id="cfNo">إلغاء</button>
      </div>`);
    $('#cfYes').onclick = () => { closeModal(); resolve(true); };
    $('#cfNo').onclick = () => { closeModal(); resolve(false); };
  });
}

/* ---------- عناصر النماذج ---------- */
function field(label, name, value = '', { type = 'text', required = false, attrs = '', hint = '' } = {}) {
  return `<label class="field">
    <span>${esc(label)}${required ? ' <b class="req">*</b>' : ''}</span>
    <input type="${type}" name="${name}" value="${esc(value)}" ${required ? 'required' : ''} ${attrs}>
    ${hint ? `<small>${esc(hint)}</small>` : ''}
  </label>`;
}

function selectField(label, name, options, value = '', { required = false, placeholder = '' } = {}) {
  const opts = options.map(o => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  return `<label class="field">
    <span>${esc(label)}${required ? ' <b class="req">*</b>' : ''}</span>
    <select name="${name}" ${required ? 'required' : ''}>
      ${placeholder !== '' ? `<option value="">${esc(placeholder)}</option>` : ''}${opts}
    </select>
  </label>`;
}

function textareaField(label, name, value = '') {
  return `<label class="field field-full"><span>${esc(label)}</span><textarea name="${name}" rows="2">${esc(value)}</textarea></label>`;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function emptyState(text, actionHtml = '') {
  return `<div class="empty"><p>${esc(text)}</p>${actionHtml}</div>`;
}

function statCard(label, value, cls = '') {
  return `<div class="stat ${cls}"><span class="stat-label">${esc(label)}</span><span class="stat-value">${value}</span></div>`;
}

/* ---------- واتساب ---------- */
function waPhone(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.length === 11 && p.startsWith('01')) p = '2' + p; // رقم مصري
  return p;
}

function openWhatsApp(phone, text) {
  const p = waPhone(phone);
  window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

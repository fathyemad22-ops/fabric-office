/* ========== فواتير البيع والشراء ========== */
const invFilter = { sale: { q: '', from: '', to: '' }, purchase: { q: '', from: '', to: '' } };

function renderInvoices(kind) {
  const isSale = kind === 'sale';
  const st = invFilter[kind];
  const canCreate = can(isSale ? 'sales' : 'purchases');
  $('#view').innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" id="invSearch" placeholder="ابحث برقم الفاتورة أو اسم ${isSale ? 'العميل' : 'المورد'} أو رقم توب..." value="${esc(st.q)}" aria-label="بحث">
      <label class="inline-field">من <input type="date" id="invFrom" value="${st.from}"></label>
      <label class="inline-field">إلى <input type="date" id="invTo" value="${st.to}"></label>
      ${canCreate ? `<button class="btn btn-primary" id="addInv">+ فاتورة ${isSale ? 'بيع' : 'شراء'} جديدة</button>` : ''}
    </div>
    <div id="invList"></div>`;
  $('#invSearch').oninput = e => { st.q = e.target.value; drawInvoiceList(kind); };
  $('#invFrom').onchange = e => { st.from = e.target.value; drawInvoiceList(kind); };
  $('#invTo').onchange = e => { st.to = e.target.value; drawInvoiceList(kind); };
  if ($('#addInv')) $('#addInv').onclick = () => (isSale ? openSaleForm() : openPurchaseForm());
  drawInvoiceList(kind);
}

function drawInvoiceList(kind) {
  const isSale = kind === 'sale';
  const st = invFilter[kind];
  const pk = isSale ? 'customer' : 'supplier';
  const all = isSale ? db.sales : db.purchases;
  const q = st.q.trim().toLowerCase();
  const list = all.filter(inv => {
    const name = partyName(pk, isSale ? inv.customerId : inv.supplierId).toLowerCase();
    const boltHit = q && inv.lines.some(l => (l.bolts || []).some(b => String(b.no).toLowerCase() === q));
    return (!q || String(inv.no) === q || name.includes(q) || boltHit) && (!st.from || inv.date >= st.from) && (!st.to || inv.date <= st.to);
  }).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);

  const box = $('#invList');
  if (!all.length) { box.innerHTML = emptyState(`لا توجد فواتير ${isSale ? 'بيع' : 'شراء'} بعد`); return; }
  const sum = list.reduce((a, i) => a + i.total, 0);
  const paid = list.reduce((a, i) => a + i.paid, 0);
  const editable = can('edit');
  box.innerHTML = list.length ? `
    <div class="table-wrap card"><table class="table">
      <thead><tr><th>رقم</th><th>التاريخ</th><th>${isSale ? 'العميل' : 'المورد'}</th><th>الأصناف</th><th>التوبات</th><th>الإجمالي</th><th>الباقي</th><th></th></tr></thead>
      <tbody>${list.map(inv => {
        const rem = round2(inv.total - inv.paid);
        const bolts = inv.lines.reduce((a, l) => a + lineBoltCount(l), 0);
        const meters = inv.lines.reduce((a, l) => a + lineMeters(l), 0);
        return `<tr>
          <td><b>${inv.no}</b></td>
          <td>${fmtDate(inv.date)}${inv.createdBy && Backend.isOnline() ? `<div class="muted small">${esc(inv.createdBy)}</div>` : ''}</td>
          <td>${esc(partyName(pk, isSale ? inv.customerId : inv.supplierId))}</td>
          <td class="muted">${inv.lines.map(l => esc(l.name)).join('، ')}</td>
          <td>${bolts} <small class="muted">(${fmt(meters)} م)</small></td>
          <td>${money(inv.total)}</td>
          <td>${rem > 0 ? `<span class="badge warn">${money(rem)}</span>` : '<span class="badge ok">خالص</span>'}</td>
          <td class="actions">
            ${isSale ? `<button class="btn btn-sm btn-wa" data-wa="${inv.id}" title="إرسال واتساب">واتساب</button>` : ''}
            <button class="btn btn-sm" data-print="${inv.id}">طباعة</button>
            ${editable ? `<button class="btn btn-sm" data-edit="${inv.id}">تعديل</button>
            <button class="btn btn-sm btn-ghost-danger" data-del="${inv.id}">حذف</button>` : ''}
          </td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="muted summary">عدد الفواتير: ${list.length} — الإجمالي: ${money(sum)} — المدفوع: ${money(paid)} — الباقي: ${money(sum - paid)}</p>`
    : emptyState('مفيش فواتير مطابقة للبحث');

  box.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.wa) sendInvoiceWhatsApp(t.dataset.wa);
    if (t.dataset.print) printInvoice(kind, t.dataset.print);
    if (t.dataset.edit) (isSale ? openSaleForm : openPurchaseForm)(t.dataset.edit);
    if (t.dataset.del) {
      const inv = byId(all, t.dataset.del);
      const msg = isSale ? `حذف فاتورة البيع رقم ${inv.no}؟ التوبات هترجع للمخزن.` : `حذف فاتورة الشراء رقم ${inv.no}؟ توباتها هتتشال من المخزن.`;
      if (await confirmDialog(msg)) {
        const err = deleteInvoice(kind, inv.id);
        if (err) return toast(err, 'error');
        toast('تم حذف الفاتورة'); render();
      }
    }
  };
}

/* ---------- جزء الإجماليات المشترك ---------- */
function accountSelectHtml(name, value, label = 'اتدفع في') {
  return `<label class="acc-field"><span>${label}</span><select name="${name}">${accountsList().map(a => `<option value="${esc(a.id)}" ${a.id === (value || 'cash') ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>`;
}

function totalsHtml(inv, isSale) {
  return `<div class="totals">
    <div><span>المجموع</span><b id="tSub">0</b></div>
    <label><span>الخصم</span><input type="number" name="discount" step="any" min="0" value="${inv ? inv.discount : 0}"></label>
    <div class="grand"><span>الإجمالي</span><b id="tTotal">0</b></div>
    <label><span>المدفوع</span><input type="number" name="paid" step="any" min="0" value="${inv ? inv.paid : ''}" placeholder="0"></label>
    <div class="pay-row"><button type="button" class="btn btn-sm" id="payAll">دفع كامل</button>${accountSelectHtml('paidAccount', inv && inv.paidAccount)}</div>
    <div><span>الباقي ${isSale ? 'على العميل' : 'للمورد'}</span><b id="tRem">0</b></div>
    ${isSale ? '<div class="credit-msg" id="creditMsg" hidden></div>' : `
    <div class="transport-box">
      <label><span>مصاريف النقل (دفعتها انت)</span><input type="number" name="transport" step="any" min="0" value="${inv && inv.transport ? inv.transport : ''}" placeholder="0"></label>
      ${accountSelectHtml('transportAccount', inv && inv.transportAccount, 'النقل اتدفع من')}
      <small class="muted" id="transportHint">بتتوزع على أمتار الفاتورة وتتحسب في تكلفة التوب</small>
    </div>`}
  </div>`;
}

function readTotals(form, sub) {
  const disc = round2(form.discount.value);
  return { disc, total: round2(sub - disc), paid: round2(form.paid.value) };
}

function validateTotals(disc, total, paid) {
  if (disc < 0) return 'الخصم غير صحيح';
  if (total < 0) return 'الخصم أكبر من المجموع';
  if (paid < 0 || paid > total + 1e-9) return 'المبلغ المدفوع لازم يكون بين صفر وإجمالي الفاتورة';
  return null;
}

/* =====================================================
   فاتورة بيع: بتكتب عدد التوب والسيستم بيختار لوحده
   ===================================================== */
function stepperHtml(value, max, label = 'عدد التوب') {
  return `<div class="field qty-field"><span>${label}</span>
    <div class="stepper">
      <button type="button" class="step-btn" data-step="-1" aria-label="أقل">−</button>
      <input type="number" data-k="count" min="0" ${max !== undefined ? `max="${max}"` : ''} step="1" value="${value}" inputmode="numeric" aria-label="${label}">
      <button type="button" class="step-btn" data-step="1" aria-label="أكتر">+</button>
    </div></div>`;
}

const boltNosPreview = nos => {
  const shown = nos.slice(0, 6).map(n => '#' + esc(n)).join('، ');
  return nos.length > 6 ? `${shown} و${nos.length - 6} كمان` : shown;
};

function openSaleForm(id) {
  if (!id && !can('sales')) return;
  if (!db.bolts.some(b => b.status === 'in') && !id) { toast('مفيش توبات في المخزن. سجل التوبات الأول.', 'error'); return; }
  const inv = id ? byId(db.sales, id) : null;
  if (inv && saleHasReturns(inv.id)) { toast('الفاتورة دي ليها مرتجع، مينفعش تتعدل', 'error'); return; }
  const saleId = inv ? inv.id : null;
  // boltIds: مصفوفة بالترتيب عشان لما العدد يقل نشيل آخر توب اتضاف
  const newLine = () => ({ fabricId: '', price: '', boltIds: [], open: false });
  const lines = inv ? inv.lines.filter(l => l.bolts && l.bolts.length).map(l => ({ fabricId: l.fabricId, price: l.price, boltIds: l.bolts.map(b => b.boltId), open: false })) : [newLine()];
  if (!lines.length) lines.push(newLine());
  const parties = db.customers.map(p => ({ value: p.id, label: p.name }));
  // الأقدم في المخزن يتباع الأول
  const available = fid => db.bolts.filter(b => b.fabricId === fid && (b.status === 'in' || (saleId && b.saleId === saleId)))
    .sort((a, b) => String(a.addedAt || '').localeCompare(String(b.addedAt || '')) || String(a.no).localeCompare(String(b.no), 'en', { numeric: true }));
  const fabricsWithStock = () => sortedFabrics().filter(f => available(f.id).length);

  openModal(id ? `تعديل فاتورة بيع رقم ${inv.no}` : 'فاتورة بيع جديدة', `
    <form id="invForm">
      <div class="form-grid">
        ${selectField('العميل', 'party', parties, inv ? inv.customerId : '', { placeholder: 'عميل نقدي (بدون حساب)' })}
        ${field('التاريخ', 'date', inv ? inv.date : todayISO(), { type: 'date', required: true })}
      </div>
      <div id="saleLines"></div>
      <div class="row-actions between">
        <button type="button" class="btn btn-sm" id="addLine">+ صنف تاني</button>
        <label class="quick-inline"><span class="muted small">أو ضيف توب برقمه:</span>
          <input id="boltQuick" placeholder="رقم التوب" autocomplete="off" inputmode="numeric" aria-label="إضافة توب برقمه"></label>
      </div>
      <div id="quickChoices" class="quick-choices"></div>
      ${totalsHtml(inv, true)}
      ${textareaField('ملاحظات', 'note', inv ? inv.note : '')}
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${id ? 'حفظ التعديلات' : 'حفظ الفاتورة'}</button>
        <button class="btn" type="submit" data-after="print">حفظ وطباعة</button>
        <button class="btn btn-wa" type="submit" data-after="wa">حفظ وإرسال واتساب</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`, { wide: true });

  const form = $('#invForm');
  const box = $('#saleLines');
  const boltLen = bid => num((byId(db.bolts, bid) || {}).length);
  const lineMetersOf = l => round2(l.boltIds.reduce((a, bid) => a + boltLen(bid), 0));
  const lineSub = l => round2(lineMetersOf(l) * num(l.price));

  function setCount(l, n) {
    const av = available(l.fabricId);
    n = Math.max(0, Math.min(av.length, parseInt(n, 10) || 0));
    const valid = l.boltIds.filter(bid => av.some(b => b.id === bid));
    if (n < valid.length) l.boltIds = valid.slice(0, n);
    else {
      l.boltIds = valid;
      for (const b of av) { if (l.boltIds.length >= n) break; if (!l.boltIds.includes(b.id)) l.boltIds.push(b.id); }
    }
  }

  function detailsHtml(l, i) {
    const f = byId(db.fabrics, l.fabricId);
    if (!f) return '';
    const av = available(l.fabricId);
    if (!av.length) return '<p class="muted small">مفيش توبات متاحة من الصنف ده</p>';
    const lens = new Set(av.map(b => num(b.length)));
    return `<details class="bolt-details" data-i="${i}" ${l.open ? 'open' : ''}>
      <summary><span class="link">اختيار توبات معينة بالرقم</span></summary>
      <div class="bolt-pick">${av.map(b => `
        <label class="bolt-chip ${l.boltIds.includes(b.id) ? 'on' : ''}"><input type="checkbox" data-bolt="${b.id}" ${l.boltIds.includes(b.id) ? 'checked' : ''}>
          <span>#${esc(b.no)}</span>${lens.size > 1 ? `<small>${fmt(b.length)}</small>` : ''}</label>`).join('')}</div>
      ${lens.size === 1 ? `<p class="muted small">كل التوبات طولها ${fmt([...lens][0])} ${esc(f.unit)}</p>` : ''}
    </details>`;
  }

  function lastHint(l) {
    const last = lastPriceFor(form.party.value, l.fabricId);
    return last !== null ? `<small class="muted last-price">آخر سعر للعميل: ${fmt(last)}</small>` : '';
  }

  function sumHtml(l) {
    const f = byId(db.fabrics, l.fabricId);
    return `<span>${l.boltIds.length} توب — ${fmt(lineMetersOf(l))} ${f ? esc(f.unit) : 'م'}</span><b>${fmt(lineSub(l))}</b>`;
  }

  function draw() {
    box.innerHTML = lines.map((l, i) => {
      const f = byId(db.fabrics, l.fabricId);
      const avCount = l.fabricId ? available(l.fabricId).length : 0;
      const list = fabricsWithStock();
      const opts = list.concat(f && !list.includes(f) ? [f] : []).map(x =>
        `<option value="${x.id}" ${x.id === l.fabricId ? 'selected' : ''}>${esc(fabricLabel(x))} (${available(x.id).length} توب)</option>`).join('');
      return `<div class="inv-line" data-i="${i}">
        <div class="inv-line-head">
          <label class="field grow"><span>الصنف</span><select data-k="fabricId"><option value="">— اختر الصنف —</option>${opts}</select></label>
          ${f ? stepperHtml(l.boltIds.length, avCount) : ''}
          ${f ? `<label class="field price-field"><span>سعر ال${esc(f.unit)}</span><input type="number" step="any" min="0" data-k="price" value="${esc(l.price)}">${lastHint(l)}</label>` : ''}
          <div class="line-sum">${sumHtml(l)}</div>
          ${lines.length > 1 || l.fabricId ? `<button type="button" class="icon-btn" data-rm="${i}" aria-label="حذف الصنف">✕</button>` : ''}
        </div>
        ${f ? `<div class="avail-note muted small">متاح ${avCount} توب</div>` : ''}
        <div class="details-slot">${detailsHtml(l, i)}</div>
      </div>`;
    }).join('');
    updateTotals();
  }

  // تحديث كارت واحد من غير ما نرسم الفورم كله (عشان الكتابة متتقطعش)
  function refreshCard(card) {
    const i = +card.dataset.i; const l = lines[i];
    $('.line-sum', card).innerHTML = sumHtml(l);
    const cnt = $('[data-k=count]', card);
    if (cnt && document.activeElement !== cnt) cnt.value = l.boltIds.length;
    $('.details-slot', card).innerHTML = detailsHtml(l, i);
    updateTotals();
  }

  function sub() { return round2(lines.reduce((a, l) => a + lineSub(l), 0)); }
  function updateTotals() {
    const s = sub();
    const { total, paid } = readTotals(form, s);
    if (!form.party.value) form.paid.value = total;
    $('#tSub').textContent = fmt(s);
    $('#tTotal').textContent = money(total);
    $('#tRem').textContent = money(round2(total - (form.party.value ? paid : total)));
    const v = s > 0 ? creditViolation(form.party.value, total, form.party.value ? paid : total, id) : null;
    const box = $('#creditMsg');
    box.hidden = !v;
    if (v) box.innerHTML = `⚠️ ${esc(v)}${isOwner() ? '<label class="check override"><input type="checkbox" id="creditOverride"> تجاوز القاعدة المرة دي (صاحب المكتب)</label>' : ''}`;
  }

  function lineFor(fabricId) {
    let l = lines.find(x => x.fabricId === fabricId);
    if (!l) {
      const f = byId(db.fabrics, fabricId);
      l = lines.find(x => !x.fabricId);
      if (l) { l.fabricId = fabricId; l.price = f.price; } else { l = { fabricId, price: f.price, boltIds: [], open: false }; lines.push(l); }
    }
    return l;
  }

  function addBolt(b) {
    const l = lineFor(b.fabricId);
    if (l.boltIds.includes(b.id)) return toast(`التوب رقم ${b.no} موجود في الفاتورة`, 'error');
    l.boltIds.push(b.id);
    $('#quickChoices').innerHTML = '';
    draw();
    toast(`تمت إضافة التوب #${b.no}`);
  }

  box.addEventListener('change', e => {
    const card = e.target.closest('.inv-line'); if (!card) return;
    const l = lines[card.dataset.i];
    if (e.target.dataset.k === 'fabricId') {
      const fid = e.target.value;
      if (fid && lines.some(x => x !== l && x.fabricId === fid)) { toast('الصنف ده موجود في سطر تاني', 'error'); e.target.value = l.fabricId; return; }
      l.fabricId = fid; l.boltIds = []; l.open = false;
      const f = byId(db.fabrics, fid);
      const last = f ? lastPriceFor(form.party.value, fid) : null;
      l.price = f ? (last !== null ? last : f.price) : '';
      if (f) setCount(l, 1);
      draw();
      const cnt = $(`.inv-line[data-i="${card.dataset.i}"] [data-k=count]`, box);
      if (cnt) cnt.select();
    }
    if (e.target.dataset.k === 'count') { setCount(l, e.target.value); e.target.value = l.boltIds.length; refreshCard(card); }
    if (e.target.dataset.bolt) {
      const bid = e.target.dataset.bolt;
      if (e.target.checked) { if (!l.boltIds.includes(bid)) l.boltIds.push(bid); } else l.boltIds = l.boltIds.filter(x => x !== bid);
      l.open = true;
      refreshCard(card);
    }
  });
  box.addEventListener('input', e => {
    const card = e.target.closest('.inv-line'); if (!card) return;
    const l = lines[card.dataset.i];
    if (e.target.dataset.k === 'price') { l.price = e.target.value; refreshCard(card); }
    if (e.target.dataset.k === 'count' && e.target.value !== '') { setCount(l, e.target.value); refreshCard(card); }
  });
  box.addEventListener('toggle', e => {
    if (!e.target.matches || !e.target.matches('.bolt-details')) return;
    lines[e.target.dataset.i].open = e.target.open;
  }, true);
  box.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    const st = e.target.closest('[data-step]');
    if (rm) { lines.splice(+rm.dataset.rm, 1); if (!lines.length) lines.push(newLine()); draw(); }
    if (st) {
      const card = st.closest('.inv-line'); const l = lines[card.dataset.i];
      const before = l.boltIds.length;
      setCount(l, before + Number(st.dataset.step));
      if (l.boltIds.length === before && st.dataset.step === '1') toast('مفيش توبات تانية متاحة من الصنف ده', 'error');
      refreshCard(card);
    }
  });

  $('#boltQuick').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = e.target.value.trim();
    if (!q) return;
    const hits = db.fabrics.flatMap(f => available(f.id)).filter(b => String(b.no) === q);
    if (!hits.length) return toast(`مفيش توب متاح رقمه ${q}`, 'error');
    e.target.value = '';
    if (hits.length === 1) return addBolt(hits[0]);
    $('#quickChoices').innerHTML = `<span class="muted small">فيه أكتر من توب رقمه ${esc(q)}، اختار:</span> ` + hits.map(b => {
      const f = byId(db.fabrics, b.fabricId);
      return `<button type="button" class="btn btn-sm" data-pick="${b.id}">${esc(f.name)}${f.color ? ' - ' + esc(f.color) : ''}</button>`;
    }).join(' ');
  });
  $('#quickChoices').onclick = e => { const b = e.target.closest('[data-pick]'); if (b) addBolt(byId(db.bolts, b.dataset.pick)); };
  $('#addLine').onclick = () => { lines.push(newLine()); draw(); $$('#saleLines select').pop().focus(); };
  $('#payAll').onclick = () => { form.paid.value = readTotals(form, sub()).total; updateTotals(); };
  form.discount.oninput = updateTotals;
  form.paid.oninput = updateTotals;
  form.party.onchange = () => {
    if (form.party.value && !inv) form.paid.value = '';
    // آخر سعر للعميل ده في كل صنف
    lines.forEach(l => { if (!l.fabricId) return; const last = lastPriceFor(form.party.value, l.fabricId); if (last !== null) l.price = last; });
    draw();
  };
  draw();

  form.onsubmit = e => {
    e.preventDefault();
    const after = e.submitter && e.submitter.dataset.after;
    const used = lines.filter(l => l.fabricId || l.boltIds.length);
    if (!used.length) return toast('اختار صنف وعدد التوب', 'error');
    for (const l of used) {
      if (!l.fabricId) return toast('اختار الصنف في كل سطر', 'error');
      if (!l.boltIds.length) return toast(`اكتب عدد التوب من "${byId(db.fabrics, l.fabricId).name}"`, 'error');
      if (num(l.price) <= 0) return toast('اكتب سعر المتر', 'error');
    }
    const s = sub();
    let { disc, total, paid } = readTotals(form, s);
    if (!form.party.value) paid = total;
    const err0 = validateTotals(disc, total, paid);
    if (err0) return toast(err0, 'error');
    const cv = creditViolation(form.party.value, total, paid, id);
    if (cv && !($('#creditOverride') && $('#creditOverride').checked)) return toast(cv, 'error');
    const err = saveSale({ customerId: form.party.value, date: form.date.value, discount: disc, paid, paidAccount: form.paidAccount.value, note: form.note.value.trim(),
      lines: used.map(l => ({ fabricId: l.fabricId, price: l.price, boltIds: [...l.boltIds] })) }, id);
    if (err) return toast(err, 'error');
    closeModal();
    toast(id ? 'تم حفظ التعديلات' : 'تم حفظ الفاتورة');
    render();
    const saved = id ? byId(db.sales, id) : db.sales[db.sales.length - 1];
    if (after === 'print') printInvoice('sale', saved.id);
    if (after === 'wa') sendInvoiceWhatsApp(saved.id);
  };
}

/* =====================================================
   محرر التوبات (عدد × طول، والتفاصيل عند الحاجة)
   بيستخدم في فاتورة الشراء وفي إضافة توبات للمخزن
   ===================================================== */
const uniformLength = bolts => {
  const s = new Set(bolts.map(b => String(num(b.length))));
  return s.size === 1 && bolts.length && num(bolts[0].length) > 0 ? num(bolts[0].length) : '';
};

function resizeBolts(bolts, fabricId, n, len) {
  n = Math.max(0, Math.min(1000, parseInt(n, 10) || 0));
  if (bolts.length > n) bolts.length = n;
  while (bolts.length < n) bolts.push({ no: nextBoltNo(fabricId, bolts.map(b => b.no)), length: len !== undefined ? len : (uniformLength(bolts) || '') });
  return bolts;
}

function boltEditorHtml(bolts, unit, open, idx) {
  const u = uniformLength(bolts);
  const mixed = bolts.length > 1 && u === '';
  return `<div class="bolt-editor">
      ${stepperHtml(bolts.length)}
      <label class="field len-field"><span>طول التوب (${esc(unit)})</span>
        <input type="number" step="any" min="0" data-k="len" value="${u}" placeholder="${mixed ? 'مختلف' : 'مثلاً 50'}"></label>
    </div>
    <div class="details-slot">${bolts.length ? `
      <details class="bolt-details" data-i="${idx}" ${open ? 'open' : ''}>
        <summary><span class="link">تعديل أرقام أو أطوال التوبات</span></summary>
        <table class="table compact bolt-rows"><thead><tr><th>رقم التوب</th><th>الطول</th><th></th></tr></thead><tbody>
          ${bolts.map((b, j) => `<tr><td><input data-b="${j}" data-f="no" value="${esc(b.no)}" aria-label="رقم التوب"></td><td><input type="number" step="any" min="0" data-b="${j}" data-f="length" value="${esc(b.length)}" aria-label="الطول"></td><td><button type="button" class="icon-btn" data-rmb="${j}" aria-label="حذف التوب">✕</button></td></tr>`).join('')}
        </tbody></table>
      </details>` : ''}</div>`;
}

/* =====================================================
   فاتورة شراء
   ===================================================== */
function openPurchaseForm(id) {
  if (!db.fabrics.length) { toast('ضيف أصناف القماش الأول', 'error'); location.hash = '#fabrics'; return; }
  if (!db.suppliers.length) { toast('ضيف مورد الأول من شاشة الموردين', 'error'); location.hash = '#suppliers'; return; }
  const inv = id ? byId(db.purchases, id) : null;
  if (inv && purchaseHasSoldBolts(inv.id)) return toast('مينفعش تعدل فاتورة شراء اتباع منها توبات', 'error');
  const newLine = () => ({ fabricId: '', price: '', bolts: [], open: false });
  const lines = inv ? inv.lines.filter(l => l.bolts && l.bolts.length).map(l => ({ fabricId: l.fabricId, price: l.price, open: false, bolts: l.bolts.map(b => ({ boltId: b.boltId, no: b.no, length: b.length })) })) : [newLine()];
  if (!lines.length) lines.push(newLine());
  const parties = db.suppliers.map(p => ({ value: p.id, label: p.name }));

  openModal(id ? `تعديل فاتورة شراء رقم ${inv.no}` : 'فاتورة شراء جديدة', `
    <form id="invForm">
      <div class="form-grid">
        ${selectField('المورد', 'party', parties, inv ? inv.supplierId : '', { required: true, placeholder: '— اختر المورد —' })}
        ${field('التاريخ', 'date', inv ? inv.date : todayISO(), { type: 'date', required: true })}
      </div>
      <div id="purLines"></div>
      <button type="button" class="btn btn-sm" id="addLine">+ صنف تاني</button>
      ${totalsHtml(inv, false)}
      ${textareaField('ملاحظات', 'note', inv ? inv.note : '')}
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${id ? 'حفظ التعديلات' : 'حفظ الفاتورة'}</button>
        <button class="btn" type="submit" data-after="print">حفظ وطباعة</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`, { wide: true });

  const form = $('#invForm');
  const box = $('#purLines');
  const lineMetersOf = l => l.bolts.reduce((a, b) => a + num(b.length), 0);
  const sub = () => round2(lines.reduce((a, l) => a + lineMetersOf(l) * num(l.price), 0));
  const allMeters = () => lines.reduce((a, l) => a + lineMetersOf(l), 0);
  const sumHtml = l => { const f = byId(db.fabrics, l.fabricId); return `<span>${l.bolts.length} توب — ${fmt(lineMetersOf(l))} ${f ? esc(f.unit) : 'م'}</span><b>${fmt(lineMetersOf(l) * num(l.price))}</b>`; };

  function draw() {
    box.innerHTML = lines.map((l, i) => {
      const f = byId(db.fabrics, l.fabricId);
      return `<div class="inv-line" data-i="${i}">
        <div class="inv-line-head">
          <label class="field grow"><span>الصنف</span><select data-k="fabricId"><option value="">— اختر الصنف —</option>
            ${sortedFabrics().map(x => `<option value="${x.id}" ${x.id === l.fabricId ? 'selected' : ''}>${esc(fabricLabel(x))}</option>`).join('')}</select></label>
          ${f ? `<label class="field price-field"><span>سعر ال${esc(f.unit)} (شراء)</span><input type="number" step="any" min="0" data-k="price" value="${esc(l.price)}"></label>` : ''}
          <div class="line-sum">${sumHtml(l)}</div>
          ${lines.length > 1 || l.fabricId ? `<button type="button" class="icon-btn" data-rm="${i}" aria-label="حذف الصنف">✕</button>` : ''}
        </div>
        ${f ? boltEditorHtml(l.bolts, f.unit, l.open, i) : ''}
      </div>`;
    }).join('');
    updateTotals();
  }

  function refreshCard(card, redrawDetails = true) {
    const i = +card.dataset.i; const l = lines[i]; const f = byId(db.fabrics, l.fabricId);
    $('.line-sum', card).innerHTML = sumHtml(l);
    const cnt = $('[data-k=count]', card);
    if (cnt && document.activeElement !== cnt) cnt.value = l.bolts.length;
    const len = $('[data-k=len]', card);
    if (len && document.activeElement !== len) { const u = uniformLength(l.bolts); len.value = u; len.placeholder = l.bolts.length > 1 && u === '' ? 'مختلف' : 'مثلاً 50'; }
    if (redrawDetails && f) {
      const tmp = document.createElement('div'); tmp.innerHTML = boltEditorHtml(l.bolts, f.unit, l.open, i);
      $('.details-slot', card).replaceWith($('.details-slot', tmp));
    }
    updateTotals();
  }

  function updateTotals() {
    const s = sub();
    const { total, paid } = readTotals(form, s);
    $('#tSub').textContent = fmt(s);
    $('#tTotal').textContent = money(total);
    $('#tRem').textContent = money(round2(total - paid));
    const t = num(form.transport.value); const m = allMeters();
    $('#transportHint').textContent = t > 0 && m > 0 ? `النقل هيزود تكلفة المتر ${fmt(t / m)} ${db.settings.currency}` : 'بتتوزع على أمتار الفاتورة وتتحسب في تكلفة التوب';
  }

  box.addEventListener('change', e => {
    const card = e.target.closest('.inv-line'); if (!card) return;
    const l = lines[card.dataset.i];
    if (e.target.dataset.k === 'fabricId') {
      const fid = e.target.value;
      if (fid && lines.some(x => x !== l && x.fabricId === fid)) { toast('الصنف ده موجود في سطر تاني', 'error'); e.target.value = l.fabricId; return; }
      l.fabricId = fid; l.bolts = []; l.open = false;
      const f = byId(db.fabrics, fid); l.price = f ? f.buyPrice || f.cost || '' : '';
      draw();
      const cnt = $(`.inv-line[data-i="${card.dataset.i}"] [data-k=count]`, box);
      if (cnt) cnt.focus();
    }
    if (e.target.dataset.k === 'count') { resizeBolts(l.bolts, l.fabricId, e.target.value); refreshCard(card); }
  });
  box.addEventListener('input', e => {
    const card = e.target.closest('.inv-line'); if (!card) return;
    const l = lines[card.dataset.i];
    const k = e.target.dataset.k;
    if (k === 'price') { l.price = e.target.value; refreshCard(card, false); }
    if (k === 'count' && e.target.value !== '') { resizeBolts(l.bolts, l.fabricId, e.target.value); refreshCard(card); }
    if (k === 'len') { l.bolts.forEach(b => { b.length = e.target.value; }); refreshCard(card); }
    if (e.target.dataset.b !== undefined) { l.bolts[+e.target.dataset.b][e.target.dataset.f] = e.target.value; refreshCard(card, false); }
  });
  box.addEventListener('toggle', e => {
    if (e.target.matches && e.target.matches('.bolt-details')) lines[e.target.dataset.i].open = e.target.open;
  }, true);
  box.addEventListener('click', e => {
    const card = e.target.closest('.inv-line'); if (!card) return;
    const l = lines[card.dataset.i];
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.rm !== undefined) { lines.splice(+t.dataset.rm, 1); if (!lines.length) lines.push(newLine()); draw(); }
    if (t.dataset.rmb !== undefined) { l.bolts.splice(+t.dataset.rmb, 1); refreshCard(card); }
    if (t.dataset.step !== undefined) { resizeBolts(l.bolts, l.fabricId, l.bolts.length + Number(t.dataset.step)); refreshCard(card); }
  });
  $('#addLine').onclick = () => { lines.push(newLine()); draw(); $$('#purLines select').pop().focus(); };
  $('#payAll').onclick = () => { form.paid.value = readTotals(form, sub()).total; updateTotals(); };
  form.discount.oninput = updateTotals;
  form.paid.oninput = updateTotals;
  form.transport.oninput = updateTotals;
  draw();

  form.onsubmit = e => {
    e.preventDefault();
    const after = e.submitter && e.submitter.dataset.after;
    if (!form.party.value) return toast('اختر المورد', 'error');
    if (num(form.transport.value) < 0) return toast('مصاريف النقل غير صحيحة', 'error');
    const used = lines.filter(l => l.fabricId);
    if (!used.length) return toast('ضيف صنف واحد على الأقل', 'error');
    for (const l of used) {
      const f = byId(db.fabrics, l.fabricId);
      if (!l.bolts.length) return toast(`اكتب عدد التوب من "${f.name}"`, 'error');
      if (l.bolts.some(b => num(b.length) <= 0)) return toast(`اكتب طول التوب في "${f.name}"`, 'error');
      if (num(l.price) <= 0) return toast(`اكتب سعر شراء المتر في "${f.name}"`, 'error');
    }
    const { disc, total, paid } = readTotals(form, sub());
    const err0 = validateTotals(disc, total, paid);
    if (err0) return toast(err0, 'error');
    const err = savePurchase({ supplierId: form.party.value, date: form.date.value, discount: disc, paid, paidAccount: form.paidAccount.value,
      transport: form.transport.value, transportAccount: form.transportAccount.value, note: form.note.value.trim(),
      lines: used.map(l => ({ fabricId: l.fabricId, price: l.price, bolts: l.bolts })) }, id);
    if (err) return toast(err, 'error');
    closeModal();
    toast(id ? 'تم حفظ التعديلات' : 'تم حفظ الفاتورة والتوبات اتضافت للمخزن');
    render();
    if (after === 'print') printInvoice('purchase', id || db.purchases[db.purchases.length - 1].id);
  };
}

/* =====================================================
   الطباعة وواتساب
   ===================================================== */
function printHtml(html) {
  $('#printArea').innerHTML = html;
  window.print();
}

function printHeader(title) {
  const s = db.settings;
  return `<div class="p-head">
    <div><h1>${esc(s.shopName)}</h1>${s.address ? `<p>${esc(s.address)}</p>` : ''}${s.phone ? `<p dir="ltr">${esc(s.phone)}</p>` : ''}</div>
    <div class="p-title">${title}</div>
  </div>`;
}

function printInvoice(kind, id) {
  const isSale = kind === 'sale';
  const inv = byId(isSale ? db.sales : db.purchases, id);
  const pk = isSale ? 'customer' : 'supplier';
  const pid = isSale ? inv.customerId : inv.supplierId;
  const party = pid ? byId(isSale ? db.customers : db.suppliers, pid) : null;
  let n = 0;
  printHtml(`
    ${printHeader(`<h2>فاتورة ${isSale ? 'بيع' : 'شراء'}</h2><p>رقم: <b>${inv.no}</b></p><p>التاريخ: ${fmtDate(inv.date)}</p>`)}
    <p class="p-party">${isSale ? 'العميل' : 'المورد'}: <b>${esc(partyName(pk, pid))}</b>${party && party.phone ? ` — <span dir="ltr">${esc(party.phone)}</span>` : ''}</p>
    <table class="p-table">
      <thead><tr><th>#</th><th>الصنف</th><th>رقم التوب</th><th>الطول</th><th>سعر المتر</th><th>الإجمالي</th></tr></thead>
      <tbody>${inv.lines.map(l => (l.bolts && l.bolts.length ? l.bolts : [{ no: '—', length: lineMeters(l) }]).map(b => `
        <tr><td>${++n}</td><td>${esc(l.name)}</td><td>${esc(b.no)}</td><td>${fmt(b.length)} ${esc(l.unit)}</td><td>${fmt(l.price)}</td><td>${fmt(num(b.length) * num(l.price))}</td></tr>`).join('')
        + `<tr class="p-subtotal"><td></td><td colspan="2">إجمالي ${esc(l.name)}: ${lineBoltCount(l)} توب</td><td>${fmt(lineMeters(l))} ${esc(l.unit)}</td><td></td><td>${fmt(lineTotal(l))}</td></tr>`).join('')}</tbody>
    </table>
    <table class="p-totals">
      <tr><td>المجموع</td><td>${money(invSubtotal(inv))}</td></tr>
      ${inv.discount ? `<tr><td>الخصم</td><td>${money(inv.discount)}</td></tr>` : ''}
      <tr class="grand"><td>الإجمالي</td><td>${money(inv.total)}</td></tr>
      <tr><td>المدفوع</td><td>${money(inv.paid)}</td></tr>
      <tr><td>الباقي</td><td>${money(inv.total - inv.paid)}</td></tr>
      ${party ? `<tr><td>إجمالي رصيد الحساب</td><td>${money(isSale ? customerBalance(pid) : supplierBalance(pid))}</td></tr>` : ''}
    </table>
    ${inv.note ? `<p>ملاحظات: ${esc(inv.note)}</p>` : ''}
    ${isSale && db.settings.invoiceNote ? `<p class="p-foot">${esc(db.settings.invoiceNote)}</p>` : ''}`);
}

function invoiceText(inv) {
  const cur = db.settings.currency;
  const out = [`*${db.settings.shopName}*`, `فاتورة بيع رقم ${inv.no} — ${fmtDate(inv.date)}`, `العميل: ${partyName('customer', inv.customerId)}`, ''];
  inv.lines.forEach(l => {
    out.push(`▪️ ${l.name}`);
    if (l.bolts && l.bolts.length) out.push(`   ${l.bolts.length} توب: ${l.bolts.map(b => `#${b.no} (${fmt(b.length)})`).join(' ، ')}`);
    out.push(`   ${fmt(lineMeters(l))} ${l.unit} × ${fmt(l.price)} = ${fmt(lineTotal(l))} ${cur}`);
  });
  out.push('', `المجموع: ${fmt(invSubtotal(inv))} ${cur}`);
  if (inv.discount) out.push(`الخصم: ${fmt(inv.discount)} ${cur}`);
  out.push(`*الإجمالي: ${fmt(inv.total)} ${cur}*`, `المدفوع: ${fmt(inv.paid)} ${cur}${inv.paid && inv.paidAccount && inv.paidAccount !== 'cash' ? ` (${accountName(inv.paidAccount)})` : ''}`);
  if (inv.total - inv.paid > 0) out.push(`الباقي: ${fmt(inv.total - inv.paid)} ${cur}`);
  if (inv.customerId) {
    out.push(`رصيد حسابك الحالي: ${fmt(customerBalance(inv.customerId))} ${cur}`);
    if (inv.total - inv.paid > 0) out.push(`القسط الأسبوعي: ${fmt(customerWeekly(byId(db.customers, inv.customerId)))} ${cur}`);
  }
  if (inv.note) out.push('', inv.note);
  if (db.settings.invoiceNote) out.push('', db.settings.invoiceNote);
  return out.join('\n');
}

function sendInvoiceWhatsApp(id) {
  const inv = byId(db.sales, id);
  const c = inv.customerId ? byId(db.customers, inv.customerId) : null;
  if (c && !c.phone) toast('العميل ده ملوش رقم تليفون — اختار الرقم من واتساب', 'error');
  openWhatsApp(c ? c.phone : '', invoiceText(inv));
}

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
function totalsHtml(inv, isSale) {
  return `<div class="totals">
    <div><span>المجموع</span><b id="tSub">0</b></div>
    <label><span>الخصم</span><input type="number" name="discount" step="any" min="0" value="${inv ? inv.discount : 0}"></label>
    <div class="grand"><span>الإجمالي</span><b id="tTotal">0</b></div>
    <label><span>المدفوع</span><input type="number" name="paid" step="any" min="0" value="${inv ? inv.paid : ''}" placeholder="0"></label>
    <button type="button" class="btn btn-sm" id="payAll">دفع كامل</button>
    <div><span>الباقي ${isSale ? 'على العميل' : 'للمورد'}</span><b id="tRem">0</b></div>
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
   فاتورة بيع (اختيار التوبات)
   ===================================================== */
function openSaleForm(id) {
  if (!id && !can('sales')) return;
  if (!db.bolts.some(b => b.status === 'in') && !id) { toast('مفيش توبات في المخزن. سجل التوبات الأول.', 'error'); return; }
  const inv = id ? byId(db.sales, id) : null;
  const saleId = inv ? inv.id : null;
  const lines = inv ? inv.lines.filter(l => l.bolts && l.bolts.length).map(l => ({ fabricId: l.fabricId, price: l.price, boltIds: new Set(l.bolts.map(b => b.boltId)) }))
    : [{ fabricId: '', price: '', boltIds: new Set() }];
  if (!lines.length) lines.push({ fabricId: '', price: '', boltIds: new Set() });
  const parties = db.customers.map(p => ({ value: p.id, label: p.name }));
  const available = fid => db.bolts.filter(b => b.fabricId === fid && (b.status === 'in' || (saleId && b.saleId === saleId)))
    .sort((a, b) => String(a.no).localeCompare(String(b.no), 'en', { numeric: true }));
  const fabricsWithStock = () => db.fabrics.filter(f => available(f.id).length);

  openModal(id ? `تعديل فاتورة بيع رقم ${inv.no}` : 'فاتورة بيع جديدة', `
    <form id="invForm">
      <div class="form-grid">
        ${selectField('العميل', 'party', parties, inv ? inv.customerId : '', { placeholder: 'عميل نقدي (بدون حساب)' })}
        ${field('التاريخ', 'date', inv ? inv.date : todayISO(), { type: 'date', required: true })}
        <label class="field"><span>إضافة سريعة برقم التوب</span>
          <input id="boltQuick" placeholder="اكتب رقم التوب واضغط Enter" autocomplete="off" inputmode="numeric">
        </label>
      </div>
      <div id="quickChoices" class="quick-choices"></div>
      <div id="saleLines"></div>
      <button type="button" class="btn btn-sm" id="addLine">+ صنف تاني</button>
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

  const lineSub = l => round2([...l.boltIds].reduce((a, bid) => a + num((byId(db.bolts, bid) || {}).length), 0) * num(l.price));

  function draw() {
    box.innerHTML = lines.map((l, i) => {
      const f = byId(db.fabrics, l.fabricId);
      const av = l.fabricId ? available(l.fabricId) : [];
      const meters = [...l.boltIds].reduce((a, bid) => a + num((byId(db.bolts, bid) || {}).length), 0);
      const opts = fabricsWithStock().concat(f && !fabricsWithStock().includes(f) ? [f] : []).map(x =>
        `<option value="${x.id}" ${x.id === l.fabricId ? 'selected' : ''}>${esc(x.name)}${x.color ? ' - ' + esc(x.color) : ''}${x.code ? ' (' + esc(x.code) + ')' : ''} — ${available(x.id).length} توب</option>`).join('');
      return `<div class="inv-line" data-i="${i}">
        <div class="inv-line-head">
          <label class="field grow"><span>الصنف</span><select data-k="fabricId"><option value="">— اختر الصنف —</option>${opts}</select></label>
          <label class="field"><span>سعر ال${f ? esc(f.unit) : 'متر'}</span><input type="number" step="any" min="0" data-k="price" value="${esc(l.price)}"></label>
          <div class="line-sum"><span>${l.boltIds.size} توب — ${fmt(meters)} ${f ? esc(f.unit) : 'م'}</span><b>${fmt(lineSub(l))}</b></div>
          <button type="button" class="icon-btn" data-rm="${i}" aria-label="حذف الصنف">✕</button>
        </div>
        ${f ? (av.length ? `
          <div class="bolt-pick-head"><span class="muted small">اختار التوبات (${av.length} متاح):</span>
            <button type="button" class="btn btn-sm" data-all="${i}">${av.every(b => l.boltIds.has(b.id)) ? 'إلغاء الكل' : 'اختيار الكل'}</button></div>
          <div class="bolt-pick">${av.map(b => `
            <label class="bolt-chip ${l.boltIds.has(b.id) ? 'on' : ''}"><input type="checkbox" data-bolt="${b.id}" ${l.boltIds.has(b.id) ? 'checked' : ''}>
              <span>#${esc(b.no)}</span><small>${fmt(b.length)}</small></label>`).join('')}</div>`
          : '<p class="muted small">مفيش توبات متاحة من الصنف ده</p>') : ''}
      </div>`;
    }).join('');
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
  }

  function lineFor(fabricId) {
    let l = lines.find(x => x.fabricId === fabricId);
    if (!l) {
      const f = byId(db.fabrics, fabricId);
      l = lines.find(x => !x.fabricId);
      if (l) { l.fabricId = fabricId; l.price = f.price; } else { l = { fabricId, price: f.price, boltIds: new Set() }; lines.push(l); }
    }
    return l;
  }

  function addBolt(b) {
    const l = lineFor(b.fabricId);
    if (l.boltIds.has(b.id)) return toast(`التوب رقم ${b.no} موجود في الفاتورة`, 'error');
    l.boltIds.add(b.id);
    $('#quickChoices').innerHTML = '';
    draw();
    toast(`تمت إضافة التوب #${b.no} (${fmt(b.length)})`);
  }

  box.addEventListener('change', e => {
    const card = e.target.closest('.inv-line'); if (!card) return;
    const l = lines[card.dataset.i];
    if (e.target.dataset.k === 'fabricId') {
      const fid = e.target.value;
      if (fid && lines.some(x => x !== l && x.fabricId === fid)) { toast('الصنف ده موجود في سطر تاني', 'error'); e.target.value = l.fabricId; return; }
      l.fabricId = fid; l.boltIds = new Set();
      const f = byId(db.fabrics, fid); l.price = f ? f.price : '';
      draw();
    }
    if (e.target.dataset.bolt) {
      e.target.checked ? l.boltIds.add(e.target.dataset.bolt) : l.boltIds.delete(e.target.dataset.bolt);
      draw();
    }
  });
  box.addEventListener('input', e => {
    if (e.target.dataset.k !== 'price') return;
    const card = e.target.closest('.inv-line');
    const l = lines[card.dataset.i];
    l.price = e.target.value;
    $('.line-sum b', card).textContent = fmt(lineSub(l));
    updateTotals();
  });
  box.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    const all = e.target.closest('[data-all]');
    if (rm) { lines.splice(+rm.dataset.rm, 1); if (!lines.length) lines.push({ fabricId: '', price: '', boltIds: new Set() }); draw(); }
    if (all) {
      const l = lines[all.dataset.all];
      const av = available(l.fabricId);
      if (av.every(b => l.boltIds.has(b.id))) l.boltIds = new Set(); else av.forEach(b => l.boltIds.add(b.id));
      draw();
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
      return `<button type="button" class="btn btn-sm" data-pick="${b.id}">${esc(f.name)}${f.color ? ' - ' + esc(f.color) : ''} (${fmt(b.length)})</button>`;
    }).join(' ');
  });
  $('#quickChoices').onclick = e => { const b = e.target.closest('[data-pick]'); if (b) addBolt(byId(db.bolts, b.dataset.pick)); };
  $('#addLine').onclick = () => { lines.push({ fabricId: '', price: '', boltIds: new Set() }); draw(); };
  $('#payAll').onclick = () => { form.paid.value = readTotals(form, sub()).total; updateTotals(); };
  form.discount.oninput = updateTotals;
  form.paid.oninput = updateTotals;
  form.party.onchange = () => { if (form.party.value && !inv) form.paid.value = ''; updateTotals(); };
  draw();

  form.onsubmit = e => {
    e.preventDefault();
    const after = e.submitter && e.submitter.dataset.after;
    const used = lines.filter(l => l.fabricId || l.boltIds.size);
    if (!used.length) return toast('اختار توب واحد على الأقل', 'error');
    for (const l of used) {
      if (!l.fabricId) return toast('اختار الصنف في كل سطر', 'error');
      if (!l.boltIds.size) return toast(`اختار التوبات من "${byId(db.fabrics, l.fabricId).name}"`, 'error');
      if (num(l.price) <= 0) return toast('اكتب سعر المتر', 'error');
    }
    const s = sub();
    let { disc, total, paid } = readTotals(form, s);
    if (!form.party.value) paid = total;
    const err0 = validateTotals(disc, total, paid);
    if (err0) return toast(err0, 'error');
    const err = saveSale({ customerId: form.party.value, date: form.date.value, discount: disc, paid, note: form.note.value.trim(),
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
   فاتورة شراء (تسجيل التوبات الجديدة)
   ===================================================== */
function openPurchaseForm(id) {
  if (!db.fabrics.length) { toast('ضيف أصناف القماش الأول', 'error'); location.hash = '#fabrics'; return; }
  if (!db.suppliers.length) { toast('ضيف مورد الأول من شاشة الموردين', 'error'); location.hash = '#suppliers'; return; }
  const inv = id ? byId(db.purchases, id) : null;
  if (inv && purchaseHasSoldBolts(inv.id)) return toast('مينفعش تعدل فاتورة شراء اتباع منها توبات', 'error');
  const lines = inv ? inv.lines.filter(l => l.bolts && l.bolts.length).map(l => ({ fabricId: l.fabricId, price: l.price, bolts: l.bolts.map(b => ({ boltId: b.boltId, no: b.no, length: b.length })) }))
    : [{ fabricId: '', price: '', bolts: [] }];
  if (!lines.length) lines.push({ fabricId: '', price: '', bolts: [] });
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

  function draw() {
    box.innerHTML = lines.map((l, i) => {
      const f = byId(db.fabrics, l.fabricId);
      return `<div class="inv-line" data-i="${i}">
        <div class="inv-line-head">
          <label class="field grow"><span>الصنف</span><select data-k="fabricId"><option value="">— اختر الصنف —</option>
            ${db.fabrics.map(x => `<option value="${x.id}" ${x.id === l.fabricId ? 'selected' : ''}>${esc(x.name)}${x.color ? ' - ' + esc(x.color) : ''}${x.code ? ' (' + esc(x.code) + ')' : ''}</option>`).join('')}</select></label>
          <label class="field"><span>سعر ال${f ? esc(f.unit) : 'متر'} (شراء)</span><input type="number" step="any" min="0" data-k="price" value="${esc(l.price)}"></label>
          <div class="line-sum"><span>${l.bolts.length} توب — ${fmt(lineMetersOf(l))} ${f ? esc(f.unit) : 'م'}</span><b>${fmt(lineMetersOf(l) * num(l.price))}</b></div>
          <button type="button" class="icon-btn" data-rm="${i}" aria-label="حذف الصنف">✕</button>
        </div>
        ${f ? `
          ${l.bolts.length ? `<table class="table compact bolt-rows"><thead><tr><th>رقم التوب</th><th>الطول</th><th></th></tr></thead><tbody>
            ${l.bolts.map((b, j) => `<tr><td><input data-b="${j}" data-f="no" value="${esc(b.no)}" aria-label="رقم التوب"></td><td><input type="number" step="any" min="0" data-b="${j}" data-f="length" value="${esc(b.length)}" aria-label="الطول"></td><td><button type="button" class="icon-btn" data-rmb="${j}" aria-label="حذف التوب">✕</button></td></tr>`).join('')}
          </tbody></table>` : ''}
          <div class="row-actions">
            <button type="button" class="btn btn-sm" data-addb="${i}">+ توب</button>
            <span class="bulk">أو أضف <input type="number" data-bulkn min="1" step="1" placeholder="عدد"> توب طول كل واحد <input type="number" data-bulkl min="0" step="any" placeholder="طول"> <button type="button" class="btn btn-sm" data-bulk="${i}">إضافة</button></span>
          </div>` : ''}
      </div>`;
    }).join('');
    updateTotals();
  }

  function updateTotals() {
    const s = sub();
    const { total, paid } = readTotals(form, s);
    $('#tSub').textContent = fmt(s);
    $('#tTotal').textContent = money(total);
    $('#tRem').textContent = money(round2(total - paid));
    $$('.inv-line', box).forEach(card => {
      const l = lines[card.dataset.i]; const f = byId(db.fabrics, l.fabricId);
      $('.line-sum span', card).textContent = `${l.bolts.length} توب — ${fmt(lineMetersOf(l))} ${f ? f.unit : 'م'}`;
      $('.line-sum b', card).textContent = fmt(lineMetersOf(l) * num(l.price));
    });
  }

  const usedNos = l => l.bolts.map(b => b.no);
  const pushBolt = (l, len = '') => l.bolts.push({ no: nextBoltNo(l.fabricId, usedNos(l)), length: len });

  box.addEventListener('change', e => {
    if (e.target.dataset.k !== 'fabricId') return;
    const l = lines[e.target.closest('.inv-line').dataset.i];
    const fid = e.target.value;
    if (fid && lines.some(x => x !== l && x.fabricId === fid)) { toast('الصنف ده موجود في سطر تاني', 'error'); e.target.value = l.fabricId; return; }
    l.fabricId = fid; l.bolts = [];
    const f = byId(db.fabrics, fid); l.price = f ? f.cost || '' : '';
    if (f) pushBolt(l);
    draw();
  });
  box.addEventListener('input', e => {
    const card = e.target.closest('.inv-line'); if (!card) return;
    const l = lines[card.dataset.i];
    if (e.target.dataset.k === 'price') l.price = e.target.value;
    if (e.target.dataset.b !== undefined) l.bolts[+e.target.dataset.b][e.target.dataset.f] = e.target.value;
    updateTotals();
  });
  box.addEventListener('click', e => {
    const card = e.target.closest('.inv-line'); if (!card) return;
    const l = lines[card.dataset.i];
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.rm !== undefined) { lines.splice(+t.dataset.rm, 1); if (!lines.length) lines.push({ fabricId: '', price: '', bolts: [] }); draw(); }
    if (t.dataset.rmb !== undefined) { l.bolts.splice(+t.dataset.rmb, 1); draw(); }
    if (t.dataset.addb !== undefined) {
      pushBolt(l); draw();
      const ins = $$(`.inv-line[data-i="${card.dataset.i}"] [data-f=length]`, box); ins[ins.length - 1].focus();
    }
    if (t.dataset.bulk !== undefined) {
      const n = parseInt($('[data-bulkn]', card).value, 10);
      if (!(n > 0) || n > 500) return toast('اكتب عدد صحيح', 'error');
      const len = $('[data-bulkl]', card).value;
      l.bolts = l.bolts.filter(b => String(b.no).trim() && num(b.length) > 0);
      for (let k = 0; k < n; k++) pushBolt(l, len);
      draw();
    }
  });
  $('#addLine').onclick = () => { lines.push({ fabricId: '', price: '', bolts: [] }); draw(); };
  $('#payAll').onclick = () => { form.paid.value = readTotals(form, sub()).total; updateTotals(); };
  form.discount.oninput = updateTotals;
  form.paid.oninput = updateTotals;
  draw();

  form.onsubmit = e => {
    e.preventDefault();
    const after = e.submitter && e.submitter.dataset.after;
    if (!form.party.value) return toast('اختر المورد', 'error');
    const used = lines.filter(l => l.fabricId);
    if (!used.length) return toast('ضيف صنف واحد على الأقل', 'error');
    if (used.some(l => num(l.price) <= 0)) return toast('اكتب سعر شراء المتر لكل صنف', 'error');
    const { disc, total, paid } = readTotals(form, sub());
    const err0 = validateTotals(disc, total, paid);
    if (err0) return toast(err0, 'error');
    const err = savePurchase({ supplierId: form.party.value, date: form.date.value, discount: disc, paid, note: form.note.value.trim(),
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
  out.push(`*الإجمالي: ${fmt(inv.total)} ${cur}*`, `المدفوع: ${fmt(inv.paid)} ${cur}`);
  if (inv.total - inv.paid > 0) out.push(`الباقي: ${fmt(inv.total - inv.paid)} ${cur}`);
  if (inv.customerId) out.push(`رصيد حسابك الحالي: ${fmt(customerBalance(inv.customerId))} ${cur}`);
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

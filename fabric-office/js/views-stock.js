/* ========== الأقمشة: خامة ← رسمة ← ألوان ========== */
const fabricFilter = { q: '', material: 'all', low: false };

function renderFabrics(view) {
  const materials = [...new Set(db.fabrics.map(f => f.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  if (fabricFilter.material !== 'all' && !materials.includes(fabricFilter.material)) fabricFilter.material = 'all';
  view.innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" id="fabSearch" placeholder="ابحث بالخامة أو الرسمة أو اللون أو رقم التوب..." value="${esc(fabricFilter.q)}" aria-label="بحث">
      <label class="check"><input type="checkbox" id="fabLow" ${fabricFilter.low ? 'checked' : ''}> القليل بس</label>
      <span class="spacer"></span>
      ${can('stock') ? '<button class="btn" id="stocktakeBtn">📋 جرد</button><button class="btn btn-primary" id="addDesign">+ رسمة جديدة بألوانها</button>' : ''}
    </div>
    ${materials.length > 1 ? `<div class="chips" id="fabChips">
      <button class="chip ${fabricFilter.material === 'all' ? 'active' : ''}" data-m="all">كل الخامات</button>
      ${materials.map(m => `<button class="chip ${fabricFilter.material === m ? 'active' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}
    </div>` : ''}
    <div id="fabList"></div>`;

  $('#fabSearch').oninput = e => { fabricFilter.q = e.target.value; drawFabricList(); };
  $('#fabLow').onchange = e => { fabricFilter.low = e.target.checked; drawFabricList(); };
  if ($('#addDesign')) $('#addDesign').onclick = () => openDesignForm();
  if ($('#stocktakeBtn')) $('#stocktakeBtn').onclick = openStocktake;
  if ($('#fabChips')) $('#fabChips').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    fabricFilter.material = b.dataset.m;
    $$('.chip', $('#fabChips')).forEach(c => c.classList.toggle('active', c === b));
    drawFabricList();
  };
  drawFabricList();
}

function drawFabricList() {
  const box = $('#fabList');
  if (!db.fabrics.length) {
    box.innerHTML = emptyState('لسه مفيش أصناف. ابدأ بإضافة رسمة وألوانها.', can('stock') ? '<button class="btn btn-primary" id="addDesign2">+ رسمة جديدة بألوانها</button>' : '');
    if ($('#addDesign2')) $('#addDesign2').onclick = () => openDesignForm();
    return;
  }
  const q = fabricFilter.q.trim().toLowerCase();
  const boltHits = q ? new Set(db.bolts.filter(b => b.status === 'in' && String(b.no).toLowerCase() === q).map(b => b.fabricId)) : new Set();
  const list = sortedFabrics().filter(f =>
    (fabricFilter.material === 'all' || f.name === fabricFilter.material) &&
    (!fabricFilter.low || stockOf(f.id).count <= num(f.minBolts)) &&
    (!q || boltHits.has(f.id) || [f.name, f.code, f.color, f.type].some(v => String(v || '').toLowerCase().includes(q))));
  if (!list.length) { box.innerHTML = emptyState('مفيش أصناف مطابقة'); return; }

  // تجميع: خامة ← رسمة
  const groups = {};
  list.forEach(f => {
    const m = f.name || '—';
    const d = f.code || '';
    groups[m] = groups[m] || {};
    (groups[m][d] = groups[m][d] || []).push(f);
  });
  let totBolts = 0, totMeters = 0, totValue = 0;
  const showCost = can('reports');
  const html = Object.entries(groups).map(([m, designs]) => {
    let mBolts = 0;
    const rows = Object.entries(designs).map(([d, colors]) => {
      const first = colors[0];
      const dBolts = colors.reduce((a, f) => a + stockOf(f.id).count, 0);
      mBolts += dBolts;
      const prices = [...new Set(colors.map(f => num(f.price)))];
      return `<tr>
        <td><b>${d ? esc(d) : '<span class="muted">بدون رسمة</span>'}</b></td>
        <td><div class="color-pills">${colors.map(f => {
          const st = stockOf(f.id); totBolts += st.count; totMeters += st.meters; totValue += st.value;
          const low = st.count <= num(f.minBolts);
          return `<button class="color-pill ${low ? 'low' : ''} ${boltHits.has(f.id) ? 'hit' : ''}" data-bolts="${f.id}" title="${esc(fabricLabel(f))}">${esc(f.color || 'بدون لون')} <b>${st.count}</b></button>`;
        }).join('')}${can('stock') ? `<button class="color-pill add" data-addcolor="${esc(m)}|${esc(d)}" title="ضيف لون">+ لون</button>` : ''}</div></td>
        <td>${prices.map(p => money(p)).join(' / ')}${showCost && first.cost ? `<div class="muted small">تكلفة ${money(first.cost)}</div>` : ''}</td>
        <td><b>${dBolts}</b> توب</td>
      </tr>`;
    }).join('');
    return `<section class="card material-card">
      <div class="card-head"><h3>${esc(m)}</h3><span class="muted">${mBolts} توب</span></div>
      <div class="table-wrap"><table class="table compact">
        <thead><tr><th>الرسمة</th><th>الألوان (عدد التوب)</th><th>سعر المتر</th><th>الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </section>`;
  }).join('');
  box.innerHTML = `${boltHits.size ? `<p class="hint">🔎 التوب رقم <b>${esc(q)}</b> موجود في: ${[...boltHits].map(id => esc(fabricLabel(byId(db.fabrics, id)))).join('، ')}</p>` : ''}
    ${html}
    <p class="muted summary">الإجمالي: ${totBolts} توب (${fmt(totMeters)} متر)${showCost ? ` — القيمة بالتكلفة: ${money(totValue)}` : ''} — دوس على أي لون عشان تشوف توباته أو تعدله</p>`;

  box.onclick = e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.bolts) openBoltsModal(t.dataset.bolts);
    if (t.dataset.addcolor) { const [m, d] = t.dataset.addcolor.split('|'); openDesignForm({ name: m, code: d, addColorsOnly: true }); }
  };
}

/* ---------- رسمة جديدة بألوانها (أو إضافة ألوان لرسمة موجودة) ---------- */
function openDesignForm(preset = {}) {
  const sample = preset.addColorsOnly ? db.fabrics.find(f => f.name === preset.name && (f.code || '') === preset.code) : null;
  const materials = [...new Set(db.fabrics.map(f => f.name).filter(Boolean))];
  const colors = preset.addColorsOnly ? [{ color: '', count: '', length: 50 }] : [1, 2, 3, 4].map(() => ({ color: '', count: '', length: 50 }));
  openModal(preset.addColorsOnly ? `ألوان جديدة: ${preset.name}${preset.code ? ' — رسمة ' + preset.code : ''}` : 'رسمة جديدة بألوانها', `
    <form id="designForm">
      <div class="form-grid">
        ${preset.addColorsOnly ? '' : `
        <label class="field"><span>الخامة <b class="req">*</b></span><input name="name" list="matList" required placeholder="مثلاً: فورتي"></label>
        <datalist id="matList">${materials.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
        ${field('الرسمة (رقم أو كود)', 'code', '', { attrs: 'placeholder="مثلاً: A2"' })}
        ${field('سعر المتر (بيع)', 'price', '', { type: 'number', required: true, attrs: 'step="any" min="0"' })}
        ${can('reports') ? field('سعر المتر (شراء)', 'cost', '', { type: 'number', attrs: 'step="any" min="0"' }) : ''}
        ${field('نبهني لما التوبات تقل عن', 'minBolts', 3, { type: 'number', attrs: 'step="1" min="0"' })}
        ${selectField('المورد', 'supplierId', db.suppliers.map(s => ({ value: s.id, label: s.name })), '', { placeholder: '— بدون —' })}`}
      </div>
      <h3 class="section-title">الألوان</h3>
      <p class="muted small">لو عندك توبات من اللون ده دلوقتي اكتب عددها وطولها، أو سيبها فاضية وسجلها بعدين بفاتورة شراء.</p>
      <table class="table compact colors-table"><thead><tr><th>اللون</th><th>عدد التوب الموجود</th><th>طول التوب</th><th></th></tr></thead><tbody id="colorRows"></tbody></table>
      <button type="button" class="btn btn-sm" id="addColorRow">+ لون تاني</button>
      <div class="form-actions"><button class="btn btn-primary" type="submit">حفظ</button><button class="btn" type="button" data-close>إلغاء</button></div>
    </form>`, { wide: true });
  const body = $('#colorRows');
  const draw = () => {
    body.innerHTML = colors.map((c, i) => `<tr data-i="${i}">
      <td><input data-k="color" value="${esc(c.color)}" placeholder="مثلاً: برجندي" aria-label="اللون"></td>
      <td><input type="number" data-k="count" min="0" step="1" value="${esc(c.count)}" placeholder="0" aria-label="عدد التوب"></td>
      <td><input type="number" data-k="length" min="0" step="any" value="${esc(c.length)}" aria-label="طول التوب"></td>
      <td>${colors.length > 1 ? `<button type="button" class="icon-btn" data-rm="${i}" aria-label="حذف">✕</button>` : ''}</td></tr>`).join('');
  };
  draw();
  body.oninput = e => { const tr = e.target.closest('tr'); if (tr && e.target.dataset.k) colors[tr.dataset.i][e.target.dataset.k] = e.target.value; };
  body.onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { colors.splice(+b.dataset.rm, 1); draw(); } };
  $('#addColorRow').onclick = () => { colors.push({ color: '', count: '', length: colors[colors.length - 1].length || 50 }); draw(); $$('#colorRows [data-k=color]').pop().focus(); };
  $('#designForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    const base = sample ? { name: sample.name, code: sample.code || '', type: sample.type || '', unit: sample.unit, price: sample.price, cost: sample.cost, buyPrice: sample.buyPrice, minBolts: sample.minBolts, supplierId: sample.supplierId }
      : { name: d.name.trim(), code: d.code.trim(), type: '', unit: 'متر', price: round2(d.price), cost: round2(d.cost), buyPrice: round2(d.cost), minBolts: parseInt(d.minBolts, 10) || 0, supplierId: d.supplierId };
    if (!base.name) return toast('اكتب اسم الخامة', 'error');
    if (!sample && base.price <= 0) return toast('اكتب سعر المتر', 'error');
    const used = colors.filter(c => c.color.trim());
    if (!used.length) return toast('اكتب لون واحد على الأقل', 'error');
    for (const c of used) {
      if (db.fabrics.some(f => f.name === base.name && (f.code || '') === base.code && f.color === c.color.trim())) return toast(`اللون "${c.color}" موجود بالفعل في الرسمة دي`, 'error');
      if (num(c.count) > 0 && num(c.length) <= 0) return toast(`اكتب طول التوب للون "${c.color}"`, 'error');
    }
    let bolts = 0;
    used.forEach(c => {
      const id = uid();
      db.fabrics.push(Object.assign({ id, color: c.color.trim(), notes: '' }, base));
      const n = parseInt(c.count, 10) || 0;
      if (n > 0) { addOpeningBolts(id, Array.from({ length: n }, (_, k) => ({ no: String(k + 1), length: c.length }))); bolts += n; }
    });
    saveDB(); closeModal(); toast(`تم إضافة ${used.length} لون${bolts ? ` و${bolts} توب` : ''}`); render();
  };
}

/* ---------- تعديل لون واحد ---------- */
function openFabricForm(id) {
  const f = byId(db.fabrics, id);
  if (!f) return;
  openModal(`تعديل: ${fabricLabel(f)}`, `
    <form id="fabForm" class="form-grid">
      ${field('الخامة', 'name', f.name, { required: true })}
      ${field('الرسمة', 'code', f.code)}
      ${field('اللون', 'color', f.color)}
      ${field('سعر المتر (بيع)', 'price', f.price, { type: 'number', required: true, attrs: 'step="any" min="0"' })}
      ${can('reports') ? field('تكلفة المتر', 'cost', f.cost, { type: 'number', attrs: 'step="any" min="0"', hint: 'بتتحدث لوحدها مع كل فاتورة شراء (شاملة النقل)' }) : ''}
      ${field('نبهني لما التوبات تقل عن', 'minBolts', f.minBolts, { type: 'number', attrs: 'step="1" min="0"' })}
      ${selectField('المورد', 'supplierId', db.suppliers.map(s => ({ value: s.id, label: s.name })), f.supplierId, { placeholder: '— بدون —' })}
      ${selectField('طول التوب بيتقاس بـ', 'unit', UNITS.map(u => ({ value: u, label: u })), f.unit)}
      <label class="check field-full"><input type="checkbox" name="allColors" checked> طبّق السعر على كل ألوان الرسمة دي</label>
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">حفظ</button>
        <button class="btn btn-ghost-danger" type="button" id="delFabric">حذف اللون ده</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`, { wide: true });
  $('#delFabric').onclick = async () => {
    if (db.bolts.some(b => b.fabricId === f.id)) return toast('مينفعش تحذف لون ليه توبات أو فواتير', 'error');
    if (await confirmDialog(`حذف "${fabricLabel(f)}"؟`)) { db.fabrics = db.fabrics.filter(x => x.id !== f.id); saveDB(); toast('تم الحذف'); render(); }
  };
  $('#fabForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    const cur = byId(db.fabrics, id); if (!cur) return;
    const oldName = cur.name, oldCode = cur.code || '';
    const rec = { name: d.name.trim(), code: d.code.trim(), color: d.color.trim(), price: round2(d.price), minBolts: parseInt(d.minBolts, 10) || 0, supplierId: d.supplierId, unit: d.unit };
    if ('cost' in d) rec.cost = round2(d.cost);
    if (!rec.name) return toast('اكتب اسم الخامة', 'error');
    Object.assign(cur, rec);
    if (d.allColors) db.fabrics.forEach(x => { if (x.name === oldName && (x.code || '') === oldCode) { x.price = rec.price; x.name = rec.name; x.code = rec.code; } });
    saveDB(); closeModal(); toast('تم الحفظ'); render();
  };
}

/* ---------- الجرد ---------- */
function openStocktake() {
  const list = sortedFabrics();
  if (!list.length) return toast('مفيش أصناف', 'error');
  openModal('جرد المخزن', `
    <form id="stForm">
      <p class="muted">اكتب عدد التوب اللي موجود فعلاً من كل لون. اللي تسيبه زي ما هو مش هيتغير.</p>
      <div class="table-wrap"><table class="table compact stocktake-table">
        <thead><tr><th>الصنف</th><th>في السيستم</th><th>الموجود فعلاً</th><th>الفرق</th></tr></thead>
        <tbody>${list.map(f => { const n = stockOf(f.id).count; return `<tr data-f="${f.id}" data-sys="${n}">
          <td>${esc(fabricLabel(f))}</td><td>${n}</td>
          <td><input type="number" min="0" step="1" value="${n}" aria-label="الموجود فعلاً"></td><td class="st-diff muted">—</td></tr>`; }).join('')}</tbody>
      </table></div>
      ${field('ملاحظات', 'note', '')}
      <div class="form-actions"><button class="btn btn-primary" type="submit">حفظ الجرد</button><button class="btn" type="button" data-close>إلغاء</button></div>
    </form>`, { wide: true });
  const form = $('#stForm');
  form.oninput = e => {
    const tr = e.target.closest('tr[data-f]'); if (!tr) return;
    const diff = (parseInt(e.target.value, 10) || 0) - num(tr.dataset.sys);
    const c = $('.st-diff', tr);
    c.textContent = diff ? (diff < 0 ? `ناقص ${-diff}` : `زيادة ${diff}`) : '—';
    c.className = 'st-diff ' + (diff < 0 ? 'text-danger' : diff > 0 ? 'text-accent' : 'muted');
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const rows = $$('tr[data-f]', form).map(tr => ({ fabricId: tr.dataset.f, actual: $('input', tr).value, sys: num(tr.dataset.sys) }))
      .filter(r => (parseInt(r.actual, 10) || 0) !== r.sys);
    if (!rows.length) { closeModal(); toast('الجرد مظبوط — مفيش فروق 👌'); return; }
    const lost = rows.reduce((a, r) => a + Math.max(0, r.sys - (parseInt(r.actual, 10) || 0)), 0);
    const added = rows.reduce((a, r) => a + Math.max(0, (parseInt(r.actual, 10) || 0) - r.sys), 0);
    if (!(await confirmDialog(`فيه ${lost ? `${lost} توب ناقص` : ''}${lost && added ? ' و' : ''}${added ? `${added} توب زيادة` : ''}. تأكيد الجرد؟`, 'تأكيد الجرد'))) return;
    const items = saveStocktake(todayISO(), rows, form.note ? form.note.value.trim() : '');
    const loss = items.reduce((a, i) => a + i.lossValue, 0);
    toast(`تم الجرد${loss ? ` — قيمة العجز ${fmt(loss)} ${db.settings.currency}` : ''}`); render();
  };
}

/* ---------- نافذة التوبات ---------- */
function openBoltsModal(fabricId, showList = false) {
  const f = byId(db.fabrics, fabricId);
  if (!f) return;
  const inStock = boltsInStock(fabricId);
  const sold = db.bolts.filter(b => b.fabricId === fabricId && b.status === 'sold');
  const s = stockOf(fabricId);
  const editable = can('stock');
  const lens = new Set(inStock.map(b => num(b.length)));

  openModal(fabricLabel(f), `
    ${editable ? `<div class="row-actions modal-tools"><span class="muted small">سعر المتر ${money(f.price)}</span><span class="spacer"></span><button class="btn btn-sm" id="editFabricBtn">تعديل اللون / السعر</button></div>` : ''}
    <div class="bolt-summary">
      <div><b>${s.count}</b><span>توب في المخزن</span></div>
      <div><b>${fmt(s.meters)}</b><span>${esc(f.unit)}</span></div>
      <div><b>${sold.length}</b><span>توب اتباع</span></div>
    </div>
    ${editable ? `
      <form id="openingForm" class="add-bolts">
        <h3 class="section-title">إضافة توبات للمخزن</h3>
        <div id="openingEditor"></div>
        <p class="muted small">دي للتوبات اللي عندك فعلاً (رصيد أول المدة أو جرد). البضاعة الجديدة من مورد سجلها بفاتورة شراء عشان حسابه يتحدث.</p>
        <div class="form-actions"><button class="btn btn-primary" type="submit">إضافة للمخزن</button><button class="btn" type="button" data-close>إغلاق</button></div>
      </form>` : ''}
    ${inStock.length ? `
      <details class="bolt-list" ${showList ? 'open' : ''}>
        <summary>عرض التوبات الموجودة (${inStock.length})${lens.size === 1 ? ` — كلها ${fmt([...lens][0])} ${esc(f.unit)}` : ''}</summary>
        <table class="table compact"><thead><tr><th>رقم التوب</th><th>الطول</th><th>المصدر</th><th></th></tr></thead><tbody>
          ${inStock.map(b => `<tr><td><b>#${esc(b.no)}</b></td><td>${fmt(b.length)} ${esc(f.unit)}</td><td class="muted small">${b.source === 'purchase' ? 'فاتورة شراء' : 'رصيد أول'} — ${fmtDate(b.addedAt)}</td>
            <td class="actions">${editable && b.source !== 'purchase' ? `<button class="btn btn-sm" data-edit-bolt="${b.id}">تعديل الطول</button><button class="btn btn-sm btn-ghost-danger" data-del-bolt="${b.id}">حذف</button>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </details>` : '<p class="muted">مفيش توبات من الصنف ده في المخزن دلوقتي.</p>'}
    ${!editable ? '<div class="form-actions"><button class="btn" data-close>إغلاق</button></div>' : ''}`, { wide: true });

  const modal = $('#modalBody');
  if ($('#editFabricBtn')) $('#editFabricBtn').onclick = () => openFabricForm(fabricId);
  modal.onclick = e => {
    const ed = e.target.closest('[data-edit-bolt]');
    const del = e.target.closest('[data-del-bolt]');
    if (ed) {
      const b = byId(db.bolts, ed.dataset.editBolt);
      const val = prompt(`طول التوب رقم ${b.no}:`, b.length);
      if (val === null) return;
      if (num(val) <= 0) return toast('طول غير صحيح', 'error');
      b.length = round2(val); saveDB(); toast('تم التعديل'); openBoltsModal(fabricId, true); render();
    }
    if (del) {
      const b = byId(db.bolts, del.dataset.delBolt);
      if (!confirm(`حذف التوب رقم ${b.no} من المخزن؟`)) return;
      db.bolts = db.bolts.filter(x => x.id !== b.id); saveDB(); toast('تم حذف التوب'); openBoltsModal(fabricId, true); render();
    }
  };
  if (!editable) return;

  const bolts = [];
  const state = { open: false };
  const ed = $('#openingEditor');
  const draw = () => {
    ed.innerHTML = boltEditorHtml(bolts, f.unit, state.open, 0) +
      (bolts.length ? `<p class="add-total">هيتضاف <b>${bolts.length} توب</b> — ${fmt(bolts.reduce((a, b) => a + num(b.length), 0))} ${esc(f.unit)}</p>` : '');
  };
  const refresh = () => {
    // بنحدّث كل حاجة ما عدا الخانة اللي بتكتب فيها
    const tmp = document.createElement('div');
    tmp.innerHTML = boltEditorHtml(bolts, f.unit, state.open, 0);
    $('.details-slot', ed).replaceWith($('.details-slot', tmp));
    const cnt = $('[data-k=count]', ed); if (document.activeElement !== cnt) cnt.value = bolts.length;
    const len = $('[data-k=len]', ed);
    if (document.activeElement !== len) { const u = uniformLength(bolts); len.value = u; len.placeholder = bolts.length > 1 && u === '' ? 'مختلف' : 'مثلاً 50'; }
    let tot = $('.add-total', ed);
    if (!tot) { tot = document.createElement('p'); tot.className = 'add-total'; ed.appendChild(tot); }
    tot.innerHTML = bolts.length ? `هيتضاف <b>${bolts.length} توب</b> — ${fmt(bolts.reduce((x, y) => x + num(y.length), 0))} ${esc(f.unit)}` : '';
  };
  ed.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (k === 'count' && e.target.value !== '') { resizeBolts(bolts, fabricId, e.target.value); refresh(); }
    if (k === 'len') { bolts.forEach(b => { b.length = e.target.value; }); refresh(); }
    if (e.target.dataset.b !== undefined) { bolts[+e.target.dataset.b][e.target.dataset.f] = e.target.value; const t = $('.add-total', ed); if (t) t.innerHTML = `هيتضاف <b>${bolts.length} توب</b> — ${fmt(bolts.reduce((x, y) => x + num(y.length), 0))} ${esc(f.unit)}`; }
  });
  ed.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.step !== undefined) { resizeBolts(bolts, fabricId, bolts.length + Number(t.dataset.step)); refresh(); }
    if (t.dataset.rmb !== undefined) { bolts.splice(+t.dataset.rmb, 1); refresh(); }
  });
  ed.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('.bolt-details')) state.open = e.target.open; }, true);
  draw();
  $('#openingForm').onsubmit = e => {
    e.preventDefault();
    if (!bolts.length) return toast('اكتب عدد التوب', 'error');
    if (bolts.some(b => num(b.length) <= 0)) return toast('اكتب طول التوب', 'error');
    const err = addOpeningBolts(fabricId, bolts);
    if (err) return toast(err, 'error');
    toast(`تمت إضافة ${bolts.length} توب`); openBoltsModal(fabricId); render();
  };
}

/* ========== الأقمشة والتوبات ========== */
const fabricFilter = { q: '', type: 'all', low: false };

function renderFabrics(view) {
  const types = [...new Set(db.fabrics.map(f => f.type).filter(Boolean))];
  view.innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" id="fabSearch" placeholder="ابحث بالاسم أو الكود أو اللون أو رقم التوب..." value="${esc(fabricFilter.q)}" aria-label="بحث">
      <label class="check"><input type="checkbox" id="fabLow" ${fabricFilter.low ? 'checked' : ''}> الأصناف القليلة فقط</label>
      ${can('stock') ? '<button class="btn btn-primary" id="addFabric">+ صنف جديد</button>' : ''}
    </div>
    <div class="chips" id="fabChips">
      <button class="chip ${fabricFilter.type === 'all' ? 'active' : ''}" data-type="all">الكل</button>
      ${types.map(t => `<button class="chip ${fabricFilter.type === t ? 'active' : ''}" data-type="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>
    <div id="fabList"></div>`;

  $('#fabSearch').oninput = e => { fabricFilter.q = e.target.value; drawFabricList(); };
  $('#fabLow').onchange = e => { fabricFilter.low = e.target.checked; drawFabricList(); };
  if ($('#addFabric')) $('#addFabric').onclick = () => openFabricForm();
  $('#fabChips').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    fabricFilter.type = b.dataset.type;
    $$('.chip', $('#fabChips')).forEach(c => c.classList.toggle('active', c === b));
    drawFabricList();
  };
  drawFabricList();
}

function drawFabricList() {
  const box = $('#fabList');
  if (!db.fabrics.length) {
    box.innerHTML = emptyState('لسه مفيش أصناف.', can('stock') ? '<button class="btn btn-primary" id="addFabric2">+ صنف جديد</button>' : '');
    if ($('#addFabric2')) $('#addFabric2').onclick = () => openFabricForm();
    return;
  }
  const showCost = can('reports');
  const q = fabricFilter.q.trim().toLowerCase();
  const boltHits = q ? new Set(db.bolts.filter(b => b.status === 'in' && String(b.no).toLowerCase() === q).map(b => b.fabricId)) : new Set();
  const list = db.fabrics.filter(f => {
    const s = stockOf(f.id);
    return (fabricFilter.type === 'all' || f.type === fabricFilter.type) &&
      (!fabricFilter.low || s.count <= num(f.minBolts)) &&
      (!q || boltHits.has(f.id) || [f.name, f.code, f.color, f.type].some(v => String(v || '').toLowerCase().includes(q)));
  });

  let totBolts = 0, totMeters = 0, totValue = 0;
  box.innerHTML = list.length ? `
    ${boltHits.size ? `<p class="hint">🔎 التوب رقم <b>${esc(q)}</b> موجود في: ${[...boltHits].map(id => esc(byId(db.fabrics, id).name)).join('، ')}</p>` : ''}
    <div class="table-wrap card"><table class="table">
      <thead><tr><th>الكود</th><th>الصنف</th><th>النوع</th><th>اللون</th><th>المتاح</th><th>سعر ال${'متر'} بيع</th>${showCost ? '<th>سعر الشراء</th>' : ''}<th>المورد</th><th></th></tr></thead>
      <tbody>${list.map(f => {
        const s = stockOf(f.id);
        totBolts += s.count; totMeters += s.meters; totValue += s.value;
        const low = s.count <= num(f.minBolts);
        return `<tr>
          <td><code>${esc(f.code)}</code></td>
          <td><b>${esc(f.name)}</b></td>
          <td>${esc(f.type)}</td>
          <td>${esc(f.color)}</td>
          <td class="${low ? 'text-danger' : ''}"><b>${s.count}</b> توب <small class="muted">${fmt(s.meters)} ${esc(f.unit)}</small> ${low ? '<span class="badge danger">قليل</span>' : ''}</td>
          <td>${money(f.price)}</td>
          ${showCost ? `<td>${money(f.cost)}</td>` : ''}
          <td>${esc(partyName('supplier', f.supplierId))}</td>
          <td class="actions">
            <button class="btn btn-sm" data-bolts="${f.id}">التوبات</button>
            ${can('stock') ? `<button class="btn btn-sm" data-edit="${f.id}">تعديل</button>
            <button class="btn btn-sm btn-ghost-danger" data-del="${f.id}">حذف</button>` : ''}
          </td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="muted summary">عدد الأصناف: ${list.length} — التوبات: ${totBolts} توب (${fmt(totMeters)} متر)${showCost ? ` — القيمة بسعر الشراء: ${money(totValue)}` : ''}</p>`
    : emptyState('مفيش أصناف مطابقة للبحث');

  box.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.bolts) openBoltsModal(t.dataset.bolts);
    if (t.dataset.edit) openFabricForm(t.dataset.edit);
    if (t.dataset.del) {
      const f = byId(db.fabrics, t.dataset.del);
      if (db.bolts.some(b => b.fabricId === f.id)) return toast('لا يمكن حذف صنف ليه توبات أو فواتير مسجلة', 'error');
      if (await confirmDialog(`حذف الصنف "${f.name}"؟`)) {
        db.fabrics = db.fabrics.filter(x => x.id !== f.id); saveDB(); toast('تم حذف الصنف'); render();
      }
    }
  };
}

function openFabricForm(id) {
  const f = id ? byId(db.fabrics, id) : { code: '', name: '', type: '', color: '', unit: 'متر', cost: '', price: '', minBolts: 2, supplierId: '', notes: '' };
  const supOpts = db.suppliers.map(s => ({ value: s.id, label: s.name }));
  openModal(id ? 'تعديل صنف' : 'صنف قماش جديد', `
    <form id="fabForm" class="form-grid">
      ${field('اسم الصنف', 'name', f.name, { required: true })}
      ${field('الكود', 'code', f.code, { hint: 'اختياري - مثلاً C-101' })}
      <label class="field"><span>النوع</span><input name="type" list="typeList" value="${esc(f.type)}"></label>
      <datalist id="typeList">${FABRIC_TYPES.map(t => `<option value="${t}">`).join('')}</datalist>
      ${field('اللون', 'color', f.color)}
      ${selectField('طول التوب بيتقاس بـ', 'unit', UNITS.map(u => ({ value: u, label: u })), f.unit)}
      ${field('سعر المتر (بيع)', 'price', f.price, { type: 'number', required: true, attrs: 'step="any" min="0"', hint: 'سعر التوب = سعر المتر × طول التوب' })}
      ${can('reports') ? field('سعر المتر (شراء)', 'cost', f.cost, { type: 'number', attrs: 'step="any" min="0"', hint: 'بيتحدث لوحده مع كل فاتورة شراء' }) : ''}
      ${field('نبهني لما التوبات تقل عن', 'minBolts', f.minBolts, { type: 'number', attrs: 'step="1" min="0"' })}
      ${selectField('المورد', 'supplierId', supOpts, f.supplierId, { placeholder: '— بدون —' })}
      ${textareaField('ملاحظات', 'notes', f.notes)}
      ${!id ? '<p class="field-full muted">بعد ما تضيف الصنف، تقدر تسجل التوبات اللي عندك فعلاً من زرار "التوبات"، أو من فاتورة شراء.</p>' : ''}
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">${id ? 'حفظ التعديلات' : 'إضافة الصنف'}</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`, { wide: true });

  $('#fabForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    const rec = { code: d.code.trim(), name: d.name.trim(), type: d.type.trim(), color: d.color.trim(), unit: d.unit,
      price: round2(d.price), minBolts: Math.max(0, parseInt(d.minBolts, 10) || 0), supplierId: d.supplierId, notes: d.notes.trim() };
    if ('cost' in d) rec.cost = round2(d.cost);
    if (!rec.name) return toast('اكتب اسم الصنف', 'error');
    if (rec.code && db.fabrics.some(x => x.code === rec.code && x.id !== id)) return toast('الكود ده مستخدم لصنف تاني', 'error');
    let newId = id;
    if (id) { const cur = byId(db.fabrics, id); if (cur) Object.assign(cur, rec); }
    else { newId = uid(); db.fabrics.push(Object.assign({ id: newId, cost: 0 }, rec)); }
    saveDB(); closeModal(); toast(id ? 'تم حفظ التعديلات' : 'تمت إضافة الصنف'); render();
    if (!id && can('stock')) openBoltsModal(newId);
  };
}

/* ---------- نافذة التوبات ---------- */
function openBoltsModal(fabricId) {
  const f = byId(db.fabrics, fabricId);
  if (!f) return;
  const inStock = boltsInStock(fabricId);
  const sold = db.bolts.filter(b => b.fabricId === fabricId && b.status === 'sold');
  const s = stockOf(fabricId);
  const editable = can('stock');

  openModal(`توبات: ${f.name}${f.color ? ' - ' + f.color : ''}`, `
    <div class="stats compact-stats">
      ${statCard('في المخزن', `${s.count} توب`)}
      ${statCard('إجمالي الأطوال', `${fmt(s.meters)} ${esc(f.unit)}`)}
      ${statCard('اتباع', `${sold.length} توب`)}
    </div>
    ${inStock.length ? `<div class="bolt-grid">${inStock.map(b => `
      <div class="bolt-card">
        <span class="bolt-no">#${esc(b.no)}</span>
        <span class="bolt-len">${fmt(b.length)} ${esc(f.unit)}</span>
        <small class="muted">${b.source === 'purchase' ? 'شراء' : 'رصيد أول'} ${fmtDate(b.addedAt)}</small>
        ${editable && b.source !== 'purchase' ? `<span class="bolt-actions"><button class="btn btn-sm" data-edit-bolt="${b.id}">تعديل</button><button class="btn btn-sm btn-ghost-danger" data-del-bolt="${b.id}">حذف</button></span>` : ''}
      </div>`).join('')}</div>` : emptyState('مفيش توبات من الصنف ده في المخزن')}
    ${editable ? `
      <h3 class="section-title">إضافة توبات موجودة عندك (رصيد أول المدة أو جرد)</h3>
      <p class="muted small">للبضاعة الجديدة من مورد استخدم فاتورة شراء عشان حساب المورد يتحدث.</p>
      <form id="openingForm">
        <div id="openingRows"></div>
        <div class="row-actions">
          <button type="button" class="btn btn-sm" id="addOpenRow">+ توب</button>
          <span class="bulk">أو أضف <input type="number" id="bulkCount" min="1" step="1" placeholder="عدد"> توب طول كل واحد <input type="number" id="bulkLen" min="0" step="any" placeholder="طول"> <button type="button" class="btn btn-sm" id="bulkAdd">إضافة</button></span>
        </div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">حفظ التوبات</button><button class="btn" type="button" data-close>إغلاق</button></div>
      </form>` : '<div class="form-actions"><button class="btn" data-close>إغلاق</button></div>'}`, { wide: true });

  const modal = $('#modalBody');
  modal.onclick = async e => {
    const ed = e.target.closest('[data-edit-bolt]');
    const del = e.target.closest('[data-del-bolt]');
    if (ed) {
      const b = byId(db.bolts, ed.dataset.editBolt);
      const val = prompt(`طول التوب رقم ${b.no}:`, b.length);
      if (val === null) return;
      if (num(val) <= 0) return toast('طول غير صحيح', 'error');
      b.length = round2(val); saveDB(); toast('تم التعديل'); openBoltsModal(fabricId); render();
    }
    if (del) {
      const b = byId(db.bolts, del.dataset.delBolt);
      if (!confirm(`حذف التوب رقم ${b.no} من المخزن؟`)) return;
      db.bolts = db.bolts.filter(x => x.id !== b.id); saveDB(); toast('تم حذف التوب'); openBoltsModal(fabricId); render();
    }
  };
  if (!editable) return;

  const rows = [];
  const box = $('#openingRows');
  const draw = () => {
    box.innerHTML = rows.length ? `<table class="table compact bolt-rows"><thead><tr><th>رقم التوب</th><th>الطول (${esc(f.unit)})</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr data-i="${i}"><td><input data-k="no" value="${esc(r.no)}" aria-label="رقم التوب"></td><td><input type="number" step="any" min="0" data-k="length" value="${esc(r.length)}" aria-label="الطول"></td><td><button type="button" class="icon-btn" data-rm="${i}" aria-label="حذف">✕</button></td></tr>`).join('')}
    </tbody></table><p class="muted small">${rows.length} توب — ${fmt(rows.reduce((a, r) => a + num(r.length), 0))} ${esc(f.unit)}</p>` : '';
  };
  const add = (len = '') => rows.push({ no: nextBoltNo(fabricId, rows.map(r => r.no)), length: len });
  box.oninput = e => { const tr = e.target.closest('tr'); if (tr && e.target.dataset.k) rows[tr.dataset.i][e.target.dataset.k] = e.target.value; };
  box.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { rows.splice(+b.dataset.rm, 1); draw(); } });
  $('#addOpenRow').onclick = () => { add(); draw(); const ins = $$('[data-k=length]', box); ins[ins.length - 1].focus(); };
  $('#bulkAdd').onclick = () => {
    const n = parseInt($('#bulkCount').value, 10);
    if (!(n > 0) || n > 500) return toast('اكتب عدد صحيح', 'error');
    for (let i = 0; i < n; i++) add($('#bulkLen').value);
    draw();
  };
  $('#openingForm').onsubmit = e => {
    e.preventDefault();
    if (!rows.length) return toast('ضيف توب واحد على الأقل', 'error');
    const err = addOpeningBolts(fabricId, rows);
    if (err) return toast(err, 'error');
    toast(`تمت إضافة ${rows.length} توب`); openBoltsModal(fabricId); render();
  };
}

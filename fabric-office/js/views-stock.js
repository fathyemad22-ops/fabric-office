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
function openBoltsModal(fabricId, showList = false) {
  const f = byId(db.fabrics, fabricId);
  if (!f) return;
  const inStock = boltsInStock(fabricId);
  const sold = db.bolts.filter(b => b.fabricId === fabricId && b.status === 'sold');
  const s = stockOf(fabricId);
  const editable = can('stock');
  const lens = new Set(inStock.map(b => num(b.length)));

  openModal(`${f.name}${f.color ? ' - ' + f.color : ''}`, `
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

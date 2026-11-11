/* ========== التطبيق والشاشات ========== */
const FABRIC_TYPES = ['قطن', 'حرير', 'كتان', 'شيفون', 'ستان', 'جينز', 'صوف', 'بوليستر', 'دانتيل', 'تريكو', 'قطيفة', 'أخرى'];
const UNITS = ['متر', 'ياردة', 'كيلو', 'ثوب', 'قطعة'];
const EXPENSE_CATS = ['إيجار', 'مرتبات', 'كهرباء ومياه', 'نقل وشحن', 'صيانة', 'نثريات'];

const routes = {
  dashboard: { title: 'الرئيسية', render: renderDashboard },
  fabrics: { title: 'الأقمشة والمخزن', render: renderFabrics },
  sales: { title: 'فواتير البيع', render: () => renderInvoices('sale') },
  purchases: { title: 'فواتير الشراء', render: () => renderInvoices('purchase') },
  customers: { title: 'العملاء', render: () => renderParties('customer') },
  suppliers: { title: 'الموردين', render: () => renderParties('supplier') },
  payments: { title: 'التحصيل والسداد', render: renderPayments },
  expenses: { title: 'المصروفات', render: renderExpenses },
  reports: { title: 'التقارير', render: renderReports },
  settings: { title: 'الإعدادات', render: renderSettings },
};

function currentRoute() {
  const r = location.hash.slice(1);
  return routes[r] ? r : 'dashboard';
}

function render() {
  const r = currentRoute();
  $('#pageTitle').textContent = routes[r].title;
  $('#brandName').textContent = db.settings.shopName || 'مكتب القماش';
  document.title = `${routes[r].title} | ${db.settings.shopName || 'مكتب القماش'}`;
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === r));
  routes[r].render($('#view'));
  document.body.classList.remove('nav-open');
}

/* =====================================================
   الرئيسية
   ===================================================== */
function renderDashboard(view) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const todaySales = db.sales.filter(s => s.date === today).reduce((a, s) => a + s.total, 0);
  const monthSales = db.sales.filter(s => s.date.startsWith(month)).reduce((a, s) => a + s.total, 0);
  const stockValue = db.fabrics.reduce((a, f) => a + num(f.qty) * num(f.cost), 0);
  const receivable = db.customers.reduce((a, c) => a + Math.max(0, customerBalance(c.id)), 0);
  const payable = db.suppliers.reduce((a, s) => a + Math.max(0, supplierBalance(s.id)), 0);
  const low = db.fabrics.filter(f => num(f.qty) <= num(f.minQty));
  const recent = [...db.sales].sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no).slice(0, 6);
  const debtors = db.customers.map(c => ({ c, b: customerBalance(c.id) })).filter(x => x.b > 0).sort((a, b) => b.b - a.b).slice(0, 6);

  if (!db.fabrics.length && !db.customers.length) {
    view.innerHTML = `
      <div class="welcome card">
        <h2>أهلاً بيك في نظام مكتب القماش 👋</h2>
        <p>ابدأ بإضافة أصناف القماش اللي عندك، وبعدها العملاء والموردين، وتقدر تعمل فواتير البيع والشراء ويتحدث المخزن والحسابات تلقائياً.</p>
        <div class="row-actions">
          <a class="btn btn-primary" href="#fabrics">إضافة أول صنف</a>
          <button class="btn" id="seedBtn">تجربة النظام ببيانات تجريبية</button>
        </div>
      </div>`;
    $('#seedBtn').onclick = () => { seedDemo(); toast('تم تحميل بيانات تجريبية'); render(); };
    return;
  }

  view.innerHTML = `
    <div class="stats">
      ${statCard('مبيعات اليوم', money(todaySales))}
      ${statCard('مبيعات الشهر', money(monthSales))}
      ${statCard('قيمة المخزن (بسعر الشراء)', money(stockValue))}
      ${statCard('مستحق لنا عند العملاء', money(receivable), 'accent')}
      ${statCard('مستحق علينا للموردين', money(payable), 'warn')}
      ${statCard('أصناف قاربت على النفاد', low.length, low.length ? 'danger' : '')}
    </div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>آخر فواتير البيع</h3><a href="#sales">عرض الكل</a></div>
        ${recent.length ? `<table class="table compact"><thead><tr><th>رقم</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th></tr></thead><tbody>
          ${recent.map(s => `<tr><td>${s.no}</td><td>${fmtDate(s.date)}</td><td>${esc(partyName('customer', s.customerId))}</td><td>${money(s.total)}</td></tr>`).join('')}
        </tbody></table>` : emptyState('لا توجد فواتير بيع بعد')}
      </section>
      <section class="card">
        <div class="card-head"><h3>تنبيهات المخزن</h3><a href="#fabrics">المخزن</a></div>
        ${low.length ? `<table class="table compact"><thead><tr><th>الصنف</th><th>المتاح</th><th>الحد الأدنى</th></tr></thead><tbody>
          ${low.map(f => `<tr><td>${esc(f.name)} <small class="muted">${esc(f.color)}</small></td><td class="text-danger">${fmt(f.qty)} ${esc(f.unit)}</td><td>${fmt(f.minQty)}</td></tr>`).join('')}
        </tbody></table>` : emptyState('كل الأصناف كمياتها كويسة ✅')}
      </section>
      <section class="card">
        <div class="card-head"><h3>أكبر المديونيات على العملاء</h3><a href="#customers">العملاء</a></div>
        ${debtors.length ? `<table class="table compact"><thead><tr><th>العميل</th><th>التليفون</th><th>الرصيد</th></tr></thead><tbody>
          ${debtors.map(x => `<tr><td>${esc(x.c.name)}</td><td dir="ltr">${esc(x.c.phone)}</td><td class="text-accent">${money(x.b)}</td></tr>`).join('')}
        </tbody></table>` : emptyState('مفيش مديونيات على العملاء')}
      </section>
    </div>`;
}

function partyName(kind, id) {
  if (!id) return kind === 'customer' ? 'عميل نقدي' : '—';
  const p = byId(kind === 'customer' ? db.customers : db.suppliers, id);
  return p ? p.name : '(محذوف)';
}

/* =====================================================
   الأقمشة والمخزن
   ===================================================== */
const fabricFilter = { q: '', type: 'all', low: false };

function renderFabrics(view) {
  const types = [...new Set(db.fabrics.map(f => f.type).filter(Boolean))];
  view.innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" id="fabSearch" placeholder="ابحث بالاسم أو الكود أو اللون..." value="${esc(fabricFilter.q)}" aria-label="بحث">
      <label class="check"><input type="checkbox" id="fabLow" ${fabricFilter.low ? 'checked' : ''}> الأصناف القليلة فقط</label>
      <button class="btn btn-primary" id="addFabric">+ صنف جديد</button>
    </div>
    <div class="chips" id="fabChips">
      <button class="chip ${fabricFilter.type === 'all' ? 'active' : ''}" data-type="all">الكل</button>
      ${types.map(t => `<button class="chip ${fabricFilter.type === t ? 'active' : ''}" data-type="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>
    <div id="fabList"></div>`;

  $('#fabSearch').oninput = e => { fabricFilter.q = e.target.value; drawFabricList(); };
  $('#fabLow').onchange = e => { fabricFilter.low = e.target.checked; drawFabricList(); };
  $('#addFabric').onclick = () => openFabricForm();
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
    box.innerHTML = emptyState('لسه مفيش أصناف. ضيف أول صنف قماش.', '<button class="btn btn-primary" id="addFabric2">+ صنف جديد</button>');
    $('#addFabric2').onclick = () => openFabricForm();
    return;
  }
  const q = fabricFilter.q.trim().toLowerCase();
  const list = db.fabrics.filter(f =>
    (fabricFilter.type === 'all' || f.type === fabricFilter.type) &&
    (!fabricFilter.low || num(f.qty) <= num(f.minQty)) &&
    (!q || [f.name, f.code, f.color, f.type].some(v => String(v || '').toLowerCase().includes(q))));

  const totalQty = list.reduce((a, f) => a + num(f.qty) * num(f.cost), 0);
  box.innerHTML = list.length ? `
    <div class="table-wrap card"><table class="table">
      <thead><tr><th>الكود</th><th>الصنف</th><th>النوع</th><th>اللون</th><th>المتاح</th><th>سعر الشراء</th><th>سعر البيع</th><th>المورد</th><th></th></tr></thead>
      <tbody>${list.map(f => {
        const low = num(f.qty) <= num(f.minQty);
        return `<tr>
          <td><code>${esc(f.code)}</code></td>
          <td><b>${esc(f.name)}</b></td>
          <td>${esc(f.type)}</td>
          <td>${esc(f.color)}</td>
          <td class="${low ? 'text-danger' : ''}">${fmt(f.qty)} ${esc(f.unit)} ${low ? '<span class="badge danger">قليل</span>' : ''}</td>
          <td>${money(f.cost)}</td>
          <td>${money(f.price)}</td>
          <td>${esc(partyName('supplier', f.supplierId))}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${f.id}">تعديل</button>
            <button class="btn btn-sm btn-ghost-danger" data-del="${f.id}">حذف</button>
          </td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="muted summary">عدد الأصناف: ${list.length} — قيمتها بسعر الشراء: ${money(totalQty)}</p>`
    : emptyState('مفيش أصناف مطابقة للبحث');

  box.onclick = async e => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (ed) openFabricForm(ed.dataset.edit);
    if (del) {
      const f = byId(db.fabrics, del.dataset.del);
      const used = [...db.sales, ...db.purchases].some(inv => inv.lines.some(l => l.fabricId === f.id));
      if (used) return toast('لا يمكن حذف صنف مستخدم في فواتير. تقدر تعدل كميته بدل الحذف.', 'error');
      if (await confirmDialog(`حذف الصنف "${f.name}"؟`)) {
        db.fabrics.splice(db.fabrics.indexOf(f), 1); saveDB(); toast('تم حذف الصنف'); render();
      }
    }
  };
}

function openFabricForm(id) {
  const f = id ? byId(db.fabrics, id) : { code: '', name: '', type: '', color: '', unit: 'متر', qty: '', cost: '', price: '', minQty: 10, supplierId: '', notes: '' };
  const supOpts = db.suppliers.map(s => ({ value: s.id, label: s.name }));
  openModal(id ? 'تعديل صنف' : 'صنف قماش جديد', `
    <form id="fabForm" class="form-grid">
      ${field('اسم الصنف', 'name', f.name, { required: true })}
      ${field('الكود', 'code', f.code, { hint: 'اختياري - مثلاً C-101' })}
      <label class="field"><span>النوع</span><input name="type" list="typeList" value="${esc(f.type)}"></label>
      <datalist id="typeList">${FABRIC_TYPES.map(t => `<option value="${t}">`).join('')}</datalist>
      ${field('اللون', 'color', f.color)}
      ${selectField('وحدة القياس', 'unit', UNITS.map(u => ({ value: u, label: u })), f.unit)}
      ${field(id ? 'الكمية الحالية (جرد)' : 'الكمية الافتتاحية', 'qty', f.qty, { type: 'number', attrs: 'step="any" min="0"' })}
      ${field('سعر الشراء', 'cost', f.cost, { type: 'number', attrs: 'step="any" min="0"' })}
      ${field('سعر البيع', 'price', f.price, { type: 'number', required: true, attrs: 'step="any" min="0"' })}
      ${field('حد التنبيه (أقل كمية)', 'minQty', f.minQty, { type: 'number', attrs: 'step="any" min="0"' })}
      ${selectField('المورد', 'supplierId', supOpts, f.supplierId, { placeholder: '— بدون —' })}
      ${textareaField('ملاحظات', 'notes', f.notes)}
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">${id ? 'حفظ التعديلات' : 'إضافة الصنف'}</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`, { wide: true });

  $('#fabForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    const rec = { code: d.code.trim(), name: d.name.trim(), type: d.type.trim(), color: d.color.trim(), unit: d.unit,
      qty: round2(d.qty), cost: round2(d.cost), price: round2(d.price), minQty: round2(d.minQty), supplierId: d.supplierId, notes: d.notes.trim() };
    if (!rec.name) return toast('اكتب اسم الصنف', 'error');
    if (rec.code && db.fabrics.some(x => x.code === rec.code && x.id !== id)) return toast('الكود ده مستخدم لصنف تاني', 'error');
    if (id) Object.assign(f, rec); else db.fabrics.push(Object.assign({ id: uid() }, rec));
    saveDB(); closeModal(); toast(id ? 'تم حفظ التعديلات' : 'تمت إضافة الصنف'); render();
  };
}

/* =====================================================
   الفواتير (بيع / شراء)
   ===================================================== */
const invFilter = { sale: { q: '', from: '', to: '' }, purchase: { q: '', from: '', to: '' } };

function renderInvoices(kind) {
  const isSale = kind === 'sale';
  const st = invFilter[kind];
  const view = $('#view');
  view.innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" id="invSearch" placeholder="ابحث برقم الفاتورة أو اسم ${isSale ? 'العميل' : 'المورد'}..." value="${esc(st.q)}" aria-label="بحث">
      <label class="inline-field">من <input type="date" id="invFrom" value="${st.from}"></label>
      <label class="inline-field">إلى <input type="date" id="invTo" value="${st.to}"></label>
      <button class="btn btn-primary" id="addInv">+ فاتورة ${isSale ? 'بيع' : 'شراء'} جديدة</button>
    </div>
    <div id="invList"></div>`;
  $('#invSearch').oninput = e => { st.q = e.target.value; drawInvoiceList(kind); };
  $('#invFrom').onchange = e => { st.from = e.target.value; drawInvoiceList(kind); };
  $('#invTo').onchange = e => { st.to = e.target.value; drawInvoiceList(kind); };
  $('#addInv').onclick = () => openInvoiceForm(kind);
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
    return (!q || String(inv.no) === q || name.includes(q)) && (!st.from || inv.date >= st.from) && (!st.to || inv.date <= st.to);
  }).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);

  const box = $('#invList');
  if (!all.length) {
    box.innerHTML = emptyState(`لا توجد فواتير ${isSale ? 'بيع' : 'شراء'} بعد`);
    return;
  }
  const sum = list.reduce((a, i) => a + i.total, 0);
  const paid = list.reduce((a, i) => a + i.paid, 0);
  box.innerHTML = list.length ? `
    <div class="table-wrap card"><table class="table">
      <thead><tr><th>رقم</th><th>التاريخ</th><th>${isSale ? 'العميل' : 'المورد'}</th><th>الأصناف</th><th>الإجمالي</th><th>المدفوع</th><th>الباقي</th><th></th></tr></thead>
      <tbody>${list.map(inv => {
        const rem = round2(inv.total - inv.paid);
        return `<tr>
          <td><b>${inv.no}</b></td>
          <td>${fmtDate(inv.date)}</td>
          <td>${esc(partyName(pk, isSale ? inv.customerId : inv.supplierId))}</td>
          <td class="muted">${inv.lines.map(l => esc(l.name)).join('، ')}</td>
          <td>${money(inv.total)}</td>
          <td>${money(inv.paid)}</td>
          <td>${rem > 0 ? `<span class="badge warn">${money(rem)}</span>` : '<span class="badge ok">خالص</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" data-print="${inv.id}">طباعة</button>
            <button class="btn btn-sm" data-edit="${inv.id}">تعديل</button>
            <button class="btn btn-sm btn-ghost-danger" data-del="${inv.id}">حذف</button>
          </td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="muted summary">عدد الفواتير: ${list.length} — الإجمالي: ${money(sum)} — المدفوع: ${money(paid)} — الباقي: ${money(sum - paid)}</p>`
    : emptyState('مفيش فواتير مطابقة للبحث');

  box.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.print) printInvoice(kind, t.dataset.print);
    if (t.dataset.edit) openInvoiceForm(kind, t.dataset.edit);
    if (t.dataset.del) {
      const inv = byId(all, t.dataset.del);
      if (await confirmDialog(`حذف الفاتورة رقم ${inv.no}؟ سيتم ${isSale ? 'إرجاع' : 'خصم'} الكميات ${isSale ? 'إلى' : 'من'} المخزن.`)) {
        deleteInvoice(kind, inv.id); toast('تم حذف الفاتورة'); render();
      }
    }
  };
}

function openInvoiceForm(kind, id) {
  const isSale = kind === 'sale';
  if (!db.fabrics.length) { toast('ضيف أصناف القماش الأول من شاشة الأقمشة', 'error'); location.hash = '#fabrics'; return; }
  const list = isSale ? db.sales : db.purchases;
  const inv = id ? byId(list, id) : null;
  const lines = inv ? inv.lines.map(l => ({ ...l })) : [{ fabricId: '', qty: '', price: '' }];
  const parties = (isSale ? db.customers : db.suppliers).map(p => ({ value: p.id, label: p.name }));
  const partyVal = inv ? (isSale ? inv.customerId : inv.supplierId) : '';

  openModal(id ? `تعديل فاتورة ${isSale ? 'بيع' : 'شراء'} رقم ${inv.no}` : `فاتورة ${isSale ? 'بيع' : 'شراء'} جديدة`, `
    <form id="invForm">
      <div class="form-grid">
        ${selectField(isSale ? 'العميل' : 'المورد', 'party', parties, partyVal, isSale ? { placeholder: 'عميل نقدي (بدون حساب)' } : { required: true, placeholder: '— اختر المورد —' })}
        ${field('التاريخ', 'date', inv ? inv.date : todayISO(), { type: 'date', required: true })}
      </div>
      ${!isSale && !parties.length ? '<p class="text-danger">لازم تضيف مورد الأول من شاشة الموردين.</p>' : ''}
      <div class="table-wrap"><table class="table lines-table">
        <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
        <tbody id="lineRows"></tbody>
      </table></div>
      <button type="button" class="btn btn-sm" id="addLine">+ إضافة صنف</button>
      <div class="totals">
        <div><span>المجموع</span><b id="tSub">0</b></div>
        <label><span>الخصم</span><input type="number" name="discount" step="any" min="0" value="${inv ? inv.discount : 0}"></label>
        <div class="grand"><span>الإجمالي</span><b id="tTotal">0</b></div>
        <label><span>المدفوع</span><input type="number" name="paid" step="any" min="0" value="${inv ? inv.paid : ''}" placeholder="0"></label>
        <button type="button" class="btn btn-sm" id="payAll">دفع كامل</button>
        <div><span>الباقي ${isSale ? 'على العميل' : 'للمورد'}</span><b id="tRem">0</b></div>
      </div>
      ${textareaField('ملاحظات', 'note', inv ? inv.note : '')}
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${id ? 'حفظ التعديلات' : 'حفظ الفاتورة'}</button>
        <button class="btn" type="submit" data-print-after>حفظ وطباعة</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`, { wide: true });

  const form = $('#invForm');
  const rows = $('#lineRows');

  const fabricOptions = sel => db.fabrics.map(f =>
    `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}${f.color ? ' - ' + esc(f.color) : ''}${f.code ? ' (' + esc(f.code) + ')' : ''} — متاح ${fmt(f.qty)} ${esc(f.unit)}</option>`).join('');

  function drawRows() {
    rows.innerHTML = lines.map((l, i) => `
      <tr data-i="${i}">
        <td><select data-k="fabricId" aria-label="الصنف"><option value="">— اختر الصنف —</option>${fabricOptions(l.fabricId)}</select></td>
        <td><input type="number" data-k="qty" step="any" min="0" value="${esc(l.qty)}" aria-label="الكمية"></td>
        <td><input type="number" data-k="price" step="any" min="0" value="${esc(l.price)}" aria-label="السعر"></td>
        <td class="line-total">${fmt(num(l.qty) * num(l.price))}</td>
        <td><button type="button" class="icon-btn" data-rm="${i}" aria-label="حذف السطر">✕</button></td>
      </tr>`).join('');
    updateTotals();
  }

  function calc() {
    const sub = round2(lines.reduce((a, l) => a + num(l.qty) * num(l.price), 0));
    const disc = round2(form.discount.value);
    const total = round2(sub - disc);
    return { sub, disc, total };
  }

  function updateTotals() {
    const { sub, total } = calc();
    $('#tSub').textContent = fmt(sub);
    $('#tTotal').textContent = money(total);
    const paid = isSale && !form.party.value ? total : num(form.paid.value);
    if (isSale && !form.party.value) form.paid.value = total;
    $('#tRem').textContent = money(round2(total - paid));
    $$('tr', rows).forEach(tr => {
      const l = lines[tr.dataset.i];
      $('.line-total', tr).textContent = fmt(num(l.qty) * num(l.price));
    });
  }

  rows.addEventListener('input', e => {
    const tr = e.target.closest('tr'); const k = e.target.dataset.k;
    if (!tr || !k) return;
    const l = lines[tr.dataset.i];
    l[k] = e.target.value;
    if (k === 'fabricId') {
      const f = byId(db.fabrics, l.fabricId);
      if (f) { l.price = isSale ? f.price : f.cost; $('[data-k=price]', tr).value = l.price; if (!l.qty) $('[data-k=qty]', tr).focus(); }
    }
    updateTotals();
  });
  rows.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    lines.splice(+b.dataset.rm, 1);
    if (!lines.length) lines.push({ fabricId: '', qty: '', price: '' });
    drawRows();
  });
  $('#addLine').onclick = () => { lines.push({ fabricId: '', qty: '', price: '' }); drawRows(); $$('select', rows).pop().focus(); };
  $('#payAll').onclick = () => { form.paid.value = calc().total; updateTotals(); };
  form.discount.oninput = updateTotals;
  form.paid.oninput = updateTotals;
  form.party.onchange = () => { if (isSale && form.party.value && !inv) form.paid.value = ''; updateTotals(); };
  drawRows();

  form.onsubmit = e => {
    e.preventDefault();
    const printAfter = e.submitter && e.submitter.hasAttribute('data-print-after');
    const clean = lines.filter(l => l.fabricId || num(l.qty));
    if (!clean.length) return toast('ضيف صنف واحد على الأقل', 'error');
    for (const l of clean) {
      if (!l.fabricId) return toast('اختر الصنف في كل سطر', 'error');
      if (num(l.qty) <= 0) return toast('الكمية لازم تكون أكبر من صفر', 'error');
      if (num(l.price) < 0) return toast('السعر غير صحيح', 'error');
    }
    const { disc, total } = calc();
    if (disc < 0) return toast('الخصم غير صحيح', 'error');
    if (total < 0) return toast('الخصم أكبر من المجموع', 'error');
    const party = form.party.value;
    if (!isSale && !party) return toast('اختر المورد', 'error');
    let paid = round2(form.paid.value);
    if (isSale && !party) paid = total;
    if (paid < 0 || paid > total + 1e-9) return toast('المبلغ المدفوع لازم يكون بين صفر وإجمالي الفاتورة', 'error');

    const data = {
      date: form.date.value,
      lines: clean.map(l => {
        const f = byId(db.fabrics, l.fabricId);
        return { fabricId: l.fabricId, name: f.name + (f.color ? ` - ${f.color}` : ''), unit: f.unit, qty: round2(l.qty), price: round2(l.price), cost: num(f.cost) };
      }),
      discount: disc, total, paid, note: form.note.value.trim(),
    };
    data[isSale ? 'customerId' : 'supplierId'] = party;
    if (inv) data.lines.forEach(l => { const old = inv.lines.find(o => o.fabricId === l.fabricId); if (old && old.cost !== undefined) l.cost = old.cost; });

    const err = saveInvoice(kind, data, id);
    if (err) return toast(err, 'error');
    closeModal();
    toast(id ? 'تم حفظ التعديلات' : 'تم حفظ الفاتورة');
    render();
    if (printAfter) {
      const saved = id ? byId(list, id) : list[list.length - 1];
      printInvoice(kind, saved.id);
    }
  };
}

/* ---------- الطباعة ---------- */
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
  const sub = inv.lines.reduce((a, l) => a + l.qty * l.price, 0);
  printHtml(`
    ${printHeader(`<h2>فاتورة ${isSale ? 'بيع' : 'شراء'}</h2><p>رقم: <b>${inv.no}</b></p><p>التاريخ: ${fmtDate(inv.date)}</p>`)}
    <p class="p-party">${isSale ? 'العميل' : 'المورد'}: <b>${esc(partyName(pk, pid))}</b>${party && party.phone ? ` — <span dir="ltr">${esc(party.phone)}</span>` : ''}</p>
    <table class="p-table">
      <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${inv.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${fmt(l.qty)} ${esc(l.unit)}</td><td>${fmt(l.price)}</td><td>${fmt(l.qty * l.price)}</td></tr>`).join('')}</tbody>
    </table>
    <table class="p-totals">
      <tr><td>المجموع</td><td>${money(sub)}</td></tr>
      ${inv.discount ? `<tr><td>الخصم</td><td>${money(inv.discount)}</td></tr>` : ''}
      <tr class="grand"><td>الإجمالي</td><td>${money(inv.total)}</td></tr>
      <tr><td>المدفوع</td><td>${money(inv.paid)}</td></tr>
      <tr><td>الباقي</td><td>${money(inv.total - inv.paid)}</td></tr>
      ${party ? `<tr><td>إجمالي رصيد الحساب</td><td>${money(isSale ? customerBalance(pid) : supplierBalance(pid))}</td></tr>` : ''}
    </table>
    ${inv.note ? `<p>ملاحظات: ${esc(inv.note)}</p>` : ''}
    ${isSale && db.settings.invoiceNote ? `<p class="p-foot">${esc(db.settings.invoiceNote)}</p>` : ''}`);
}

/* =====================================================
   العملاء / الموردين
   ===================================================== */
const partyFilter = { customer: '', supplier: '' };

function renderParties(kind) {
  const isC = kind === 'customer';
  const view = $('#view');
  view.innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" id="pSearch" placeholder="ابحث بالاسم أو التليفون..." value="${esc(partyFilter[kind])}" aria-label="بحث">
      <button class="btn btn-primary" id="addParty">+ ${isC ? 'عميل' : 'مورد'} جديد</button>
    </div>
    <div id="pList"></div>`;
  $('#pSearch').oninput = e => { partyFilter[kind] = e.target.value; drawPartyList(kind); };
  $('#addParty').onclick = () => openPartyForm(kind);
  drawPartyList(kind);
}

function drawPartyList(kind) {
  const isC = kind === 'customer';
  const all = isC ? db.customers : db.suppliers;
  const balFn = isC ? customerBalance : supplierBalance;
  const q = partyFilter[kind].trim().toLowerCase();
  const list = all.filter(p => !q || p.name.toLowerCase().includes(q) || String(p.phone || '').includes(q));
  const box = $('#pList');
  if (!all.length) { box.innerHTML = emptyState(`لسه مفيش ${isC ? 'عملاء' : 'موردين'}`); return; }
  let totalBal = 0;
  box.innerHTML = list.length ? `
    <div class="table-wrap card"><table class="table">
      <thead><tr><th>الاسم</th><th>التليفون</th><th>العنوان</th><th>الرصيد</th><th></th></tr></thead>
      <tbody>${list.map(p => {
        const b = balFn(p.id); totalBal += b;
        return `<tr>
          <td><b>${esc(p.name)}</b></td>
          <td dir="ltr" class="text-end">${esc(p.phone)}</td>
          <td>${esc(p.address)}</td>
          <td>${b > 0 ? `<span class="${isC ? 'text-accent' : 'text-warn'}">${money(b)} ${isC ? 'عليه' : 'له'}</span>` : b < 0 ? `<span class="muted">${money(-b)} ${isC ? 'له' : 'عليه'}</span>` : '<span class="muted">خالص</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" data-stmt="${p.id}">كشف حساب</button>
            <button class="btn btn-sm" data-pay="${p.id}">${isC ? 'تحصيل' : 'سداد'}</button>
            <button class="btn btn-sm" data-edit="${p.id}">تعديل</button>
            <button class="btn btn-sm btn-ghost-danger" data-del="${p.id}">حذف</button>
          </td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="muted summary">العدد: ${list.length} — إجمالي الأرصدة: ${money(totalBal)}</p>`
    : emptyState('مفيش نتائج مطابقة');

  box.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.stmt) openStatement(kind, t.dataset.stmt);
    if (t.dataset.pay) openPaymentForm(kind, null, t.dataset.pay);
    if (t.dataset.edit) openPartyForm(kind, t.dataset.edit);
    if (t.dataset.del) {
      const p = byId(all, t.dataset.del);
      const used = (isC ? db.sales.some(s => s.customerId === p.id) : db.purchases.some(s => s.supplierId === p.id)) ||
        db.payments.some(x => x.party === kind && x.partyId === p.id);
      if (used) return toast(`لا يمكن حذف ${isC ? 'عميل' : 'مورد'} له حركات مسجلة`, 'error');
      if (await confirmDialog(`حذف "${p.name}"؟`)) { all.splice(all.indexOf(p), 1); saveDB(); toast('تم الحذف'); render(); }
    }
  };
}

function openPartyForm(kind, id) {
  const isC = kind === 'customer';
  const all = isC ? db.customers : db.suppliers;
  const p = id ? byId(all, id) : { name: '', phone: '', address: '', opening: 0, notes: '' };
  openModal(id ? 'تعديل البيانات' : (isC ? 'عميل جديد' : 'مورد جديد'), `
    <form id="pForm" class="form-grid">
      ${field('الاسم', 'name', p.name, { required: true })}
      ${field('التليفون', 'phone', p.phone, { type: 'tel', attrs: 'dir="ltr"' })}
      ${field('العنوان', 'address', p.address)}
      ${field('رصيد افتتاحي', 'opening', p.opening, { type: 'number', attrs: 'step="any"', hint: isC ? 'المبلغ اللي على العميل من قبل استخدام النظام' : 'المبلغ اللي علينا للمورد من قبل استخدام النظام' })}
      ${textareaField('ملاحظات', 'notes', p.notes)}
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">حفظ</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`);
  $('#pForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    const rec = { name: d.name.trim(), phone: d.phone.trim(), address: d.address.trim(), opening: round2(d.opening), notes: d.notes.trim() };
    if (!rec.name) return toast('اكتب الاسم', 'error');
    if (id) Object.assign(p, rec); else all.push(Object.assign({ id: uid() }, rec));
    saveDB(); closeModal(); toast('تم الحفظ'); render();
  };
}

function openStatement(kind, id) {
  const isC = kind === 'customer';
  const p = byId(isC ? db.customers : db.suppliers, id);
  const rows = partyStatement(kind, id);
  const bal = isC ? customerBalance(id) : supplierBalance(id);
  const table = rows.length ? `<table class="table compact p-table">
    <thead><tr><th>التاريخ</th><th>البيان</th><th>${isC ? 'مدين (عليه)' : 'دائن (له)'}</th><th>${isC ? 'دائن (دفع)' : 'مدين (دفعنا)'}</th><th>الرصيد</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.desc)}</td><td>${r.debit ? fmt(r.debit) : ''}</td><td>${r.credit ? fmt(r.credit) : ''}</td><td><b>${fmt(r.balance)}</b></td></tr>`).join('')}</tbody>
  </table>` : emptyState('لا توجد حركات');
  const summary = `<p class="stmt-total">الرصيد الحالي: <b>${money(bal)}</b> ${bal > 0 ? (isC ? '(مستحق على العميل)' : '(مستحق للمورد)') : ''}</p>`;
  openModal(`كشف حساب: ${p.name}`, `${table}${summary}
    <div class="form-actions"><button class="btn btn-primary" id="stmtPrint">طباعة</button><button class="btn" data-close>إغلاق</button></div>`, { wide: true });
  $('#stmtPrint').onclick = () => printHtml(`${printHeader(`<h2>كشف حساب</h2><p>${fmtDate(todayISO())}</p>`)}<p class="p-party">${isC ? 'العميل' : 'المورد'}: <b>${esc(p.name)}</b></p>${table}${summary}`);
}

/* =====================================================
   التحصيل والسداد
   ===================================================== */
let payFilter = 'all';

function renderPayments(view) {
  view.innerHTML = `
    <div class="toolbar">
      <div class="chips" id="payChips">
        <button class="chip ${payFilter === 'all' ? 'active' : ''}" data-f="all">الكل</button>
        <button class="chip ${payFilter === 'customer' ? 'active' : ''}" data-f="customer">تحصيل من عملاء</button>
        <button class="chip ${payFilter === 'supplier' ? 'active' : ''}" data-f="supplier">سداد لموردين</button>
      </div>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="addIn">+ تحصيل من عميل</button>
      <button class="btn" id="addOut">+ سداد لمورد</button>
    </div>
    <div id="payList"></div>`;
  $('#payChips').onclick = e => { const b = e.target.closest('.chip'); if (b) { payFilter = b.dataset.f; render(); } };
  $('#addIn').onclick = () => openPaymentForm('customer');
  $('#addOut').onclick = () => openPaymentForm('supplier');

  const list = db.payments.filter(p => payFilter === 'all' || p.party === payFilter).sort((a, b) => b.date.localeCompare(a.date));
  const box = $('#payList');
  box.innerHTML = list.length ? `
    <div class="table-wrap card"><table class="table">
      <thead><tr><th>التاريخ</th><th>النوع</th><th>الاسم</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr></thead>
      <tbody>${list.map(p => `<tr>
        <td>${fmtDate(p.date)}</td>
        <td>${p.party === 'customer' ? '<span class="badge ok">تحصيل</span>' : '<span class="badge warn">سداد</span>'}</td>
        <td>${esc(partyName(p.party, p.partyId))}</td>
        <td><b>${money(p.amount)}</b></td>
        <td class="muted">${esc(p.note)}</td>
        <td class="actions"><button class="btn btn-sm" data-edit="${p.id}">تعديل</button><button class="btn btn-sm btn-ghost-danger" data-del="${p.id}">حذف</button></td>
      </tr>`).join('')}</tbody>
    </table></div>` : emptyState('لا توجد مدفوعات مسجلة');

  box.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    const p = byId(db.payments, t.dataset.edit || t.dataset.del);
    if (t.dataset.edit) openPaymentForm(p.party, p.id);
    if (t.dataset.del && await confirmDialog('حذف هذه الحركة؟')) { db.payments.splice(db.payments.indexOf(p), 1); saveDB(); toast('تم الحذف'); render(); }
  };
}

function openPaymentForm(kind, id, presetParty) {
  const isC = kind === 'customer';
  const all = isC ? db.customers : db.suppliers;
  if (!all.length) return toast(`ضيف ${isC ? 'عملاء' : 'موردين'} الأول`, 'error');
  const p = id ? byId(db.payments, id) : { partyId: presetParty || '', date: todayISO(), amount: '', note: '' };
  const balFn = isC ? customerBalance : supplierBalance;
  openModal(id ? 'تعديل حركة' : (isC ? 'تحصيل من عميل' : 'سداد لمورد'), `
    <form id="payForm" class="form-grid">
      ${selectField(isC ? 'العميل' : 'المورد', 'partyId', all.map(x => ({ value: x.id, label: x.name })), p.partyId, { required: true, placeholder: '— اختر —' })}
      ${field('التاريخ', 'date', p.date, { type: 'date', required: true })}
      ${field('المبلغ', 'amount', p.amount, { type: 'number', required: true, attrs: 'step="any" min="0.01"' })}
      ${field('ملاحظات', 'note', p.note)}
      <p class="field-full muted" id="balHint"></p>
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">حفظ</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`);
  const form = $('#payForm');
  const hint = () => {
    const pid = form.partyId.value;
    $('#balHint').textContent = pid ? `الرصيد الحالي: ${fmt(balFn(pid))} ${db.settings.currency}` : '';
  };
  form.partyId.onchange = hint; hint();
  form.onsubmit = e => {
    e.preventDefault();
    const d = formData(form);
    const amount = round2(d.amount);
    if (amount <= 0) return toast('اكتب مبلغ صحيح', 'error');
    const rec = { party: kind, partyId: d.partyId, date: d.date, amount, note: d.note.trim() };
    if (id) Object.assign(p, rec); else db.payments.push(Object.assign({ id: uid() }, rec));
    saveDB(); closeModal(); toast('تم الحفظ'); render();
  };
}

/* =====================================================
   المصروفات
   ===================================================== */
function renderExpenses(view) {
  const month = todayISO().slice(0, 7);
  const list = [...db.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const monthTotal = db.expenses.filter(x => x.date.startsWith(month)).reduce((a, x) => a + x.amount, 0);
  view.innerHTML = `
    <div class="toolbar">
      <span>مصروفات الشهر الحالي: <b>${money(monthTotal)}</b></span>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="addExp">+ مصروف جديد</button>
    </div>
    <div id="expList">${list.length ? `
      <div class="table-wrap card"><table class="table">
        <thead><tr><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr></thead>
        <tbody>${list.map(x => `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.category)}</td><td><b>${money(x.amount)}</b></td><td class="muted">${esc(x.note)}</td>
          <td class="actions"><button class="btn btn-sm" data-edit="${x.id}">تعديل</button><button class="btn btn-sm btn-ghost-danger" data-del="${x.id}">حذف</button></td></tr>`).join('')}</tbody>
      </table></div>` : emptyState('لا توجد مصروفات مسجلة')}</div>`;
  $('#addExp').onclick = () => openExpenseForm();
  $('#expList').onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    const x = byId(db.expenses, t.dataset.edit || t.dataset.del);
    if (t.dataset.edit) openExpenseForm(x.id);
    if (t.dataset.del && await confirmDialog('حذف هذا المصروف؟')) { db.expenses.splice(db.expenses.indexOf(x), 1); saveDB(); toast('تم الحذف'); render(); }
  };
}

function openExpenseForm(id) {
  const x = id ? byId(db.expenses, id) : { date: todayISO(), category: '', amount: '', note: '' };
  const cats = [...new Set([...EXPENSE_CATS, ...db.expenses.map(e => e.category)])];
  openModal(id ? 'تعديل مصروف' : 'مصروف جديد', `
    <form id="expForm" class="form-grid">
      ${field('التاريخ', 'date', x.date, { type: 'date', required: true })}
      <label class="field"><span>البند <b class="req">*</b></span><input name="category" list="catList" value="${esc(x.category)}" required></label>
      <datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      ${field('المبلغ', 'amount', x.amount, { type: 'number', required: true, attrs: 'step="any" min="0.01"' })}
      ${field('ملاحظات', 'note', x.note)}
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">حفظ</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`);
  $('#expForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    const rec = { date: d.date, category: d.category.trim(), amount: round2(d.amount), note: d.note.trim() };
    if (!rec.category || rec.amount <= 0) return toast('اكمل البيانات بشكل صحيح', 'error');
    if (id) Object.assign(x, rec); else db.expenses.push(Object.assign({ id: uid() }, rec));
    saveDB(); closeModal(); toast('تم الحفظ'); render();
  };
}

/* =====================================================
   التقارير
   ===================================================== */
const reportRange = { from: '', to: '' };

function renderReports(view) {
  if (!reportRange.from) { reportRange.from = todayISO().slice(0, 8) + '01'; reportRange.to = todayISO(); }
  const { from, to } = reportRange;
  const inRange = d => d >= from && d <= to;
  const sales = db.sales.filter(s => inRange(s.date));
  const purchases = db.purchases.filter(p => inRange(p.date));
  const expenses = db.expenses.filter(x => inRange(x.date));
  const pays = db.payments.filter(p => inRange(p.date));

  const gross = sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty * l.price, 0), 0);
  const discounts = sales.reduce((a, s) => a + num(s.discount), 0);
  const net = sales.reduce((a, s) => a + s.total, 0);
  const cost = sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty * num(l.cost), 0), 0);
  const profit = net - cost;
  const expTotal = expenses.reduce((a, x) => a + x.amount, 0);
  const purTotal = purchases.reduce((a, p) => a + p.total, 0);
  const cashIn = sales.reduce((a, s) => a + s.paid, 0) + pays.filter(p => p.party === 'customer').reduce((a, p) => a + p.amount, 0);
  const cashOut = purchases.reduce((a, p) => a + p.paid, 0) + pays.filter(p => p.party === 'supplier').reduce((a, p) => a + p.amount, 0) + expTotal;

  const byFabric = {};
  sales.forEach(s => s.lines.forEach(l => {
    const k = l.fabricId;
    byFabric[k] = byFabric[k] || { name: l.name, unit: l.unit, qty: 0, revenue: 0, profit: 0 };
    byFabric[k].qty += l.qty; byFabric[k].revenue += l.qty * l.price; byFabric[k].profit += l.qty * (l.price - num(l.cost));
  }));
  const topFabrics = Object.values(byFabric).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const maxRev = Math.max(1, ...topFabrics.map(f => f.revenue));

  const byCust = {};
  sales.forEach(s => { const n = partyName('customer', s.customerId); byCust[n] = (byCust[n] || 0) + s.total; });
  const topCust = Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const byCat = {};
  expenses.forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });

  view.innerHTML = `
    <div class="toolbar">
      <label class="inline-field">من <input type="date" id="rFrom" value="${from}"></label>
      <label class="inline-field">إلى <input type="date" id="rTo" value="${to}"></label>
      <button class="btn btn-sm" data-range="today">اليوم</button>
      <button class="btn btn-sm" data-range="month">الشهر ده</button>
      <button class="btn btn-sm" data-range="year">السنة دي</button>
      <span class="spacer"></span>
      <button class="btn" id="rPrint">طباعة التقرير</button>
    </div>
    <div id="reportBody">
      <div class="stats">
        ${statCard('صافي المبيعات', money(net))}
        ${statCard('تكلفة البضاعة المباعة', money(cost))}
        ${statCard('مجمل الربح', money(profit), profit >= 0 ? 'accent' : 'danger')}
        ${statCard('المصروفات', money(expTotal), 'warn')}
        ${statCard('صافي الربح', money(profit - expTotal), profit - expTotal >= 0 ? 'accent' : 'danger')}
        ${statCard('المشتريات', money(purTotal))}
        ${statCard('النقدية الداخلة', money(cashIn))}
        ${statCard('النقدية الخارجة', money(cashOut))}
      </div>
      <p class="muted summary">عدد فواتير البيع: ${sales.length} — إجمالي قبل الخصم: ${money(gross)} — الخصومات: ${money(discounts)}</p>
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>الأصناف الأكثر مبيعاً</h3></div>
          ${topFabrics.length ? `<table class="table compact"><thead><tr><th>الصنف</th><th>الكمية</th><th>المبيعات</th><th>الربح</th></tr></thead><tbody>
            ${topFabrics.map(f => `<tr><td>${esc(f.name)}<div class="bar"><i style="width:${(f.revenue / maxRev * 100).toFixed(1)}%"></i></div></td><td>${fmt(f.qty)} ${esc(f.unit)}</td><td>${money(f.revenue)}</td><td>${money(f.profit)}</td></tr>`).join('')}
          </tbody></table>` : emptyState('لا توجد مبيعات في الفترة')}
        </section>
        <section class="card">
          <div class="card-head"><h3>المبيعات حسب العميل</h3></div>
          ${topCust.length ? `<table class="table compact"><thead><tr><th>العميل</th><th>المبيعات</th></tr></thead><tbody>
            ${topCust.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${money(v)}</td></tr>`).join('')}
          </tbody></table>` : emptyState('لا توجد مبيعات في الفترة')}
        </section>
        <section class="card">
          <div class="card-head"><h3>المصروفات حسب البند</h3></div>
          ${Object.keys(byCat).length ? `<table class="table compact"><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>
            ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<tr><td>${esc(n)}</td><td>${money(v)}</td></tr>`).join('')}
          </tbody></table>` : emptyState('لا توجد مصروفات في الفترة')}
        </section>
      </div>
    </div>`;

  $('#rFrom').onchange = e => { reportRange.from = e.target.value; render(); };
  $('#rTo').onchange = e => { reportRange.to = e.target.value; render(); };
  $$('[data-range]').forEach(b => b.onclick = () => {
    const t = todayISO();
    reportRange.to = t;
    reportRange.from = b.dataset.range === 'today' ? t : b.dataset.range === 'month' ? t.slice(0, 8) + '01' : t.slice(0, 5) + '01-01';
    render();
  });
  $('#rPrint').onclick = () => printHtml(`${printHeader(`<h2>تقرير</h2><p>من ${fmtDate(from)} إلى ${fmtDate(to)}</p>`)}${$('#reportBody').innerHTML}`);
}

/* =====================================================
   الإعدادات
   ===================================================== */
function renderSettings(view) {
  const s = db.settings;
  view.innerHTML = `
    <section class="card">
      <div class="card-head"><h3>بيانات المكتب (بتظهر في الفواتير)</h3></div>
      <form id="setForm" class="form-grid">
        ${field('اسم المكتب', 'shopName', s.shopName, { required: true })}
        ${field('التليفون', 'phone', s.phone, { attrs: 'dir="ltr"' })}
        ${field('العنوان', 'address', s.address)}
        ${field('العملة', 'currency', s.currency)}
        ${field('رسالة أسفل الفاتورة', 'invoiceNote', s.invoiceNote)}
        <div class="form-actions field-full"><button class="btn btn-primary" type="submit">حفظ البيانات</button></div>
      </form>
    </section>
    <section class="card">
      <div class="card-head"><h3>النسخ الاحتياطي</h3></div>
      <p class="muted">البيانات محفوظة على الجهاز ده داخل المتصفح. اعمل نسخة احتياطية بشكل دوري واحتفظ بالملف في مكان آمن (فلاشة أو جوجل درايف)، وتقدر ترجعها على أي جهاز.</p>
      <div class="row-actions">
        <button class="btn btn-primary" id="exportBtn">تحميل نسخة احتياطية</button>
        <label class="btn">استرجاع نسخة احتياطية<input type="file" id="importFile" accept="application/json,.json" hidden></label>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h3>أدوات</h3></div>
      <div class="row-actions">
        <button class="btn" id="demoBtn">تحميل بيانات تجريبية</button>
        <button class="btn btn-danger" id="wipeBtn">مسح كل البيانات</button>
      </div>
    </section>`;

  $('#setForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    Object.assign(db.settings, { shopName: d.shopName.trim() || 'مكتب القماش', phone: d.phone.trim(), address: d.address.trim(), currency: d.currency.trim() || 'ج.م', invoiceNote: d.invoiceNote.trim() });
    saveDB(); toast('تم حفظ البيانات'); render();
  };
  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fabric-office-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('تم تحميل النسخة الاحتياطية');
  };
  $('#importFile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.fabrics) || !Array.isArray(data.sales)) throw new Error('bad');
      if (!(await confirmDialog('استرجاع النسخة هيستبدل كل البيانات الحالية. متأكد؟', 'استرجاع'))) return;
      localStorage.setItem(DB_KEY, JSON.stringify(data));
      db = loadDB(); toast('تم استرجاع النسخة الاحتياطية'); render();
    } catch (err) {
      toast('الملف ده مش نسخة احتياطية صحيحة', 'error');
    } finally { e.target.value = ''; }
  };
  $('#demoBtn').onclick = async () => {
    if (await confirmDialog('البيانات التجريبية هتستبدل كل البيانات الحالية. متأكد؟', 'تحميل')) { seedDemo(); toast('تم تحميل بيانات تجريبية'); location.hash = '#dashboard'; render(); }
  };
  $('#wipeBtn').onclick = async () => {
    if (await confirmDialog('هيتم مسح كل البيانات نهائياً. يفضل تعمل نسخة احتياطية الأول. متأكد؟', 'مسح الكل')) {
      db = defaultData(); saveDB(); toast('تم مسح البيانات'); location.hash = '#dashboard'; render();
    }
  };
}

/* =====================================================
   تشغيل
   ===================================================== */
window.addEventListener('hashchange', render);
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) closeModal();
  if (e.target.id === 'modalBackdrop') closeModal();
  if (e.target.closest('[data-quick="sale"]')) openInvoiceForm('sale');
});
$('#modalClose').onclick = closeModal;
$('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modalBackdrop').hidden) closeModal();
});
// إعادة تحميل البيانات لو اتغيرت في تاب تاني
window.addEventListener('storage', e => { if (e.key === DB_KEY) { db = loadDB(); render(); } });
render();

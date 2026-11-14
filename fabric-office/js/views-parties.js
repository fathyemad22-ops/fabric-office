/* ========== العملاء والموردين والتحصيل والمصروفات ========== */
const partyFilter = { customer: '', supplier: '' };
const partyList = kind => (kind === 'customer' ? db.customers : db.suppliers);

function renderParties(kind) {
  const isC = kind === 'customer';
  $('#view').innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" id="pSearch" placeholder="ابحث بالاسم أو التليفون..." value="${esc(partyFilter[kind])}" aria-label="بحث">
      ${can('parties') || (!isC && can('purchases')) ? `<button class="btn btn-primary" id="addParty">+ ${isC ? 'عميل' : 'مورد'} جديد</button>` : ''}
    </div>
    <div id="pList"></div>`;
  $('#pSearch').oninput = e => { partyFilter[kind] = e.target.value; drawPartyList(kind); };
  if ($('#addParty')) $('#addParty').onclick = () => openPartyForm(kind);
  drawPartyList(kind);
}

function drawPartyList(kind) {
  const isC = kind === 'customer';
  const all = partyList(kind);
  const balFn = isC ? customerBalance : supplierBalance;
  const q = partyFilter[kind].trim().toLowerCase();
  const list = all.filter(p => !q || p.name.toLowerCase().includes(q) || String(p.phone || '').includes(q));
  const box = $('#pList');
  if (!all.length) { box.innerHTML = emptyState(`لسه مفيش ${isC ? 'عملاء' : 'موردين'}`); return; }
  const canEdit = can('parties') || (!isC && can('purchases'));
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
          <td>${b > 0 ? `<span class="${isC ? 'text-accent' : 'text-warn'}">${money(b)} ${isC ? 'عليه' : 'له'}</span>` : b < 0 ? `<span class="muted">${money(-b)} ${isC ? 'له' : 'عليه'}</span>` : '<span class="muted">خالص</span>'}${isC && b > 0 ? (() => { const d = customerDue(p.id); return d.overdue > 0 ? ` <span class="badge danger" title="المفروض كان دفع">متأخر ${fmt(d.overdue)}</span>` : ''; })() : ''}</td>
          <td class="actions">
            <button class="btn btn-sm" data-stmt="${p.id}">كشف حساب</button>
            ${can('payments') ? `<button class="btn btn-sm" data-pay="${p.id}">${isC ? 'تحصيل' : 'سداد'}</button>` : ''}
            ${canEdit ? `<button class="btn btn-sm" data-edit="${p.id}">تعديل</button>
            <button class="btn btn-sm btn-ghost-danger" data-del="${p.id}">حذف</button>` : ''}
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
        db.payments.some(x => x.party === kind && x.partyId === p.id) || db.adjustments.some(x => x.party === kind && x.partyId === p.id);
      if (used) return toast(`لا يمكن حذف ${isC ? 'عميل' : 'مورد'} له حركات مسجلة`, 'error');
      if (await confirmDialog(`حذف "${p.name}"؟`)) {
        db[isC ? 'customers' : 'suppliers'] = all.filter(x => x.id !== p.id); saveDB(); toast('تم الحذف'); render();
      }
    }
  };
}

function openPartyForm(kind, id) {
  const isC = kind === 'customer';
  const p = id ? byId(partyList(kind), id) : { name: '', phone: '', address: '', opening: 0, notes: '' };
  openModal(id ? 'تعديل البيانات' : (isC ? 'عميل جديد' : 'مورد جديد'), `
    <form id="pForm" class="form-grid">
      ${field('الاسم', 'name', p.name, { required: true })}
      ${field('التليفون (واتساب)', 'phone', p.phone, { type: 'tel', attrs: 'dir="ltr"', hint: 'مثلاً 01012345678' })}
      ${field('العنوان', 'address', p.address)}
      ${field('رصيد افتتاحي', 'opening', p.opening, { type: 'number', attrs: 'step="any"', hint: isC ? 'المبلغ اللي على العميل من قبل استخدام النظام' : 'المبلغ اللي علينا للمورد من قبل استخدام النظام' })}
      ${isC ? `${field('الحد الأقصى للآجل', 'creditLimit', p.creditLimit || '', { type: 'number', attrs: `step="any" min="0" placeholder="${fmt(db.settings.creditLimit)}"`, hint: 'سيبه فاضي عشان ياخد الحد العام من الإعدادات' })}
      ${field('القسط الأسبوعي', 'weekly', p.weekly || '', { type: 'number', attrs: `step="any" min="0" placeholder="${fmt(db.settings.weeklyInstallment)}"`, hint: 'سيبه فاضي عشان ياخد القسط العام' })}` : ''}
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
    if (isC) { rec.creditLimit = round2(d.creditLimit) || ''; rec.weekly = round2(d.weekly) || ''; }
    if (!rec.name) return toast('اكتب الاسم', 'error');
    const cur = id ? byId(partyList(kind), id) : null;
    if (cur) Object.assign(cur, rec); else partyList(kind).push(Object.assign({ id: uid(), createdAt: todayISO() }, rec));
    saveDB(); closeModal(); toast('تم الحفظ'); render();
  };
}

function openStatement(kind, id) {
  const isC = kind === 'customer';
  const p = byId(partyList(kind), id);
  const rows = partyStatement(kind, id);
  const bal = isC ? customerBalance(id) : supplierBalance(id);
  const bs = balanceSide(kind, bal);
  const totDebit = rows.reduce((a, r) => a + r.debit, 0);
  const totCredit = rows.reduce((a, r) => a + r.credit, 0);
  const sideCell = sd => sd.side ? `${fmt(sd.amount)} <small class="side ${sd.side}">${SIDE_LABEL[sd.side]}</small>` : '<small class="muted">خالص</small>';
  const table = rows.length ? `<table class="table compact p-table stmt-table">
    <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.desc)}</td><td class="num-debit">${r.debit ? fmt(r.debit) : ''}</td><td class="num-credit">${r.credit ? fmt(r.credit) : ''}</td><td><b>${sideCell(r.side)}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td></td><td><b>الإجمالي</b></td><td class="num-debit"><b>${fmt(totDebit)}</b></td><td class="num-credit"><b>${fmt(totCredit)}</b></td><td><b>${sideCell(bs)}</b></td></tr></tfoot>
  </table>` : emptyState('لا توجد حركات');
  const meaning = !bs.side ? '' : (isC ? (bs.side === 'debit' ? '(العميل مدين لنا بالمبلغ ده)' : '(العميل دائن — ليه فلوس عندنا)') : (bs.side === 'credit' ? '(المورد دائن — ليه فلوس عندنا)' : '(المورد مدين لنا بالمبلغ ده)'));
  const summary = `<p class="stmt-total">الرصيد الحالي: <b>${bs.side ? `${money(bs.amount)} ${SIDE_LABEL[bs.side]}` : 'خالص'}</b> <span class="muted">${meaning}</span></p>`;
  openModal(`كشف حساب: ${p.name}`, `${table}${summary}
    <div class="form-actions">
      <button class="btn btn-primary" id="stmtPrint">طباعة</button>
      <button class="btn btn-wa" id="stmtWa">إرسال الرصيد واتساب</button>
      ${can('payments') ? '<button class="btn" id="stmtAdj">+ قيد مدين / دائن</button>' : ''}
      <button class="btn" data-close>إغلاق</button>
    </div>`, { wide: true });
  if ($('#stmtAdj')) $('#stmtAdj').onclick = () => openAdjustmentForm(null, { party: kind, partyId: id, back: () => openStatement(kind, id) });
  $('#stmtPrint').onclick = () => printHtml(`${printHeader(`<h2>كشف حساب</h2><p>${fmtDate(todayISO())}</p>`)}<p class="p-party">${isC ? 'العميل' : 'المورد'}: <b>${esc(p.name)}</b></p>${table}${summary}`);
  $('#stmtWa').onclick = () => {
    const cur = db.settings.currency;
    const last = rows.slice(-8).map(r => `${fmtDate(r.date)} | ${r.desc} | ${r.debit ? 'مدين ' + fmt(r.debit) : 'دائن ' + fmt(r.credit)}`);
    const text = [`*${db.settings.shopName}*`, `كشف حساب: ${p.name}`, '', ...(last.length ? ['آخر الحركات:', ...last, ''] : []),
      `إجمالي المدين: ${fmt(totDebit)} ${cur}`, `إجمالي الدائن: ${fmt(totCredit)} ${cur}`,
      `*الرصيد: ${bs.side ? `${fmt(bs.amount)} ${cur} ${SIDE_LABEL[bs.side]}` : 'خالص'}*`,
      isC && bal > 0 ? 'برجاء التكرم بسداد المستحق. شكراً لحضرتك 🌹' : ''].filter(x => x !== '').join('\n');
    if (!p.phone) toast('مفيش رقم تليفون مسجل — اختار الرقم من واتساب', 'error');
    openWhatsApp(p.phone, text);
  };
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
  const editable = can('edit');
  const box = $('#payList');
  box.innerHTML = list.length ? `
    <div class="table-wrap card"><table class="table">
      <thead><tr><th>التاريخ</th><th>النوع</th><th>الاسم</th><th>المبلغ</th><th>في</th><th>ملاحظات</th><th></th></tr></thead>
      <tbody>${list.map(p => `<tr>
        <td>${fmtDate(p.date)}</td>
        <td>${p.party === 'customer' ? '<span class="badge ok">تحصيل</span>' : '<span class="badge warn">سداد</span>'}</td>
        <td>${esc(partyName(p.party, p.partyId))}</td>
        <td><b>${money(p.amount)}</b></td>
        <td class="small">${esc(accountName(p.accountId || 'cash'))}</td>
        <td class="muted">${esc(p.note)}</td>
        <td class="actions">${editable ? `<button class="btn btn-sm" data-edit="${p.id}">تعديل</button><button class="btn btn-sm btn-ghost-danger" data-del="${p.id}">حذف</button>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : emptyState('لا توجد مدفوعات مسجلة');

  box.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    const p = byId(db.payments, t.dataset.edit || t.dataset.del);
    if (t.dataset.edit) openPaymentForm(p.party, p.id);
    if (t.dataset.del && await confirmDialog('حذف هذه الحركة؟')) { db.payments = db.payments.filter(x => x.id !== p.id); saveDB(); toast('تم الحذف'); render(); }
  };
}

function openPaymentForm(kind, id, presetParty) {
  const isC = kind === 'customer';
  const all = partyList(kind);
  if (!all.length) return toast(`ضيف ${isC ? 'عملاء' : 'موردين'} الأول`, 'error');
  const p = id ? byId(db.payments, id) : { partyId: presetParty || '', date: todayISO(), amount: '', note: '' };
  const balFn = isC ? customerBalance : supplierBalance;
  openModal(id ? 'تعديل حركة' : (isC ? 'تحصيل من عميل' : 'سداد لمورد'), `
    <form id="payForm" class="form-grid">
      ${selectField(isC ? 'العميل' : 'المورد', 'partyId', all.map(x => ({ value: x.id, label: x.name })), p.partyId, { required: true, placeholder: '— اختر —' })}
      ${field('التاريخ', 'date', p.date, { type: 'date', required: true })}
      ${field('المبلغ', 'amount', p.amount, { type: 'number', required: true, attrs: 'step="any" min="0.01"' })}
      ${accountSelectHtml('accountId', p.accountId, isC ? 'استلمتها في' : 'دفعتها من')}
      ${field('ملاحظات', 'note', p.note)}
      <p class="field-full muted" id="balHint"></p>
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">حفظ</button>
        ${isC ? '<button class="btn btn-wa" type="submit" data-after="wa">حفظ وإرسال إيصال واتساب</button>' : ''}
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
    const rec = { party: kind, partyId: d.partyId, date: d.date, amount, accountId: d.accountId, note: d.note.trim() };
    const cur = id ? byId(db.payments, id) : null;
    if (cur) Object.assign(cur, rec); else db.payments.push(Object.assign({ id: uid(), createdBy: currentUser.name }, rec));
    saveDB(); closeModal(); toast('تم الحفظ'); render();
    if (e.submitter && e.submitter.dataset.after === 'wa') {
      const c = byId(db.customers, d.partyId);
      const cc = db.settings.currency;
      openWhatsApp(c.phone, [`*${db.settings.shopName}*`, `إيصال استلام نقدية`, `استلمنا من: ${c.name}`, `مبلغ: *${fmt(amount)} ${cc}*`, `بتاريخ: ${fmtDate(d.date)}`,
        d.note ? `ملاحظات: ${d.note}` : '', `رصيدك الحالي: ${fmt(customerBalance(c.id))} ${cc}`, 'شكراً لحضرتك 🌹'].filter(Boolean).join('\n'));
    }
  };
}

/* =====================================================
   المصروفات
   ===================================================== */
function renderExpenses(view) {
  const month = todayISO().slice(0, 7);
  const list = [...db.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const monthTotal = db.expenses.filter(x => x.date.startsWith(month)).reduce((a, x) => a + x.amount, 0);
  const editable = can('edit');
  view.innerHTML = `
    <div class="toolbar">
      <span>مصروفات الشهر الحالي: <b>${money(monthTotal)}</b></span>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="addExp">+ مصروف جديد</button>
    </div>
    <div id="expList">${list.length ? `
      <div class="table-wrap card"><table class="table">
        <thead><tr><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>من</th><th>ملاحظات</th><th></th></tr></thead>
        <tbody>${list.map(x => `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.category)}</td><td><b>${money(x.amount)}</b></td><td class="small">${esc(accountName(x.accountId || 'cash'))}</td><td class="muted">${esc(x.note)}</td>
          <td class="actions">${editable ? `<button class="btn btn-sm" data-edit="${x.id}">تعديل</button><button class="btn btn-sm btn-ghost-danger" data-del="${x.id}">حذف</button>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : emptyState('لا توجد مصروفات مسجلة')}</div>`;
  $('#addExp').onclick = () => openExpenseForm();
  $('#expList').onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    const x = byId(db.expenses, t.dataset.edit || t.dataset.del);
    if (t.dataset.edit) openExpenseForm(x.id);
    if (t.dataset.del && await confirmDialog('حذف هذا المصروف؟')) { db.expenses = db.expenses.filter(y => y.id !== x.id); saveDB(); toast('تم الحذف'); render(); }
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
      ${accountSelectHtml('accountId', x.accountId, 'اتدفع من')}
      ${field('ملاحظات', 'note', x.note)}
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">حفظ</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`);
  $('#expForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    const rec = { date: d.date, category: d.category.trim(), amount: round2(d.amount), accountId: d.accountId, note: d.note.trim() };
    if (!rec.category || rec.amount <= 0) return toast('اكمل البيانات بشكل صحيح', 'error');
    const cur = id ? byId(db.expenses, id) : null;
    if (cur) Object.assign(cur, rec); else db.expenses.push(Object.assign({ id: uid(), createdBy: currentUser.name }, rec));
    saveDB(); closeModal(); toast('تم الحفظ'); render();
  };
}

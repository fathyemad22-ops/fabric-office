/* ========== الدائنون والمدينون والقيود اليدوية ========== */
const ledgerState = { tab: 'balances', q: '' };

function allBalances() {
  const out = [];
  db.customers.forEach(c => { const b = customerBalance(c.id); out.push({ kind: 'customer', p: c, bal: b, bs: balanceSide('customer', b) }); });
  db.suppliers.forEach(s => { const b = supplierBalance(s.id); out.push({ kind: 'supplier', p: s, bal: b, bs: balanceSide('supplier', b) }); });
  return out;
}

function renderLedger(view) {
  const rows = allBalances();
  // المدينون = عليهم فلوس لينا، الدائنون = ليهم فلوس عندنا
  const debtors = rows.filter(r => r.bs.side === 'debit').sort((a, b) => b.bs.amount - a.bs.amount);
  const creditors = rows.filter(r => r.bs.side === 'credit').sort((a, b) => b.bs.amount - a.bs.amount);
  const totD = debtors.reduce((a, r) => a + r.bs.amount, 0);
  const totC = creditors.reduce((a, r) => a + r.bs.amount, 0);
  const net = totD - totC;
  const canAdd = can('payments');

  const table = (list, emptyText) => list.length ? `<table class="table compact">
      <thead><tr><th>الاسم</th><th>النوع</th><th>التليفون</th><th>المبلغ</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td><b>${esc(r.p.name)}</b></td>
        <td><span class="badge ${r.kind === 'customer' ? 'ok' : 'warn'}">${r.kind === 'customer' ? 'عميل' : 'مورد'}</span></td>
        <td dir="ltr" class="text-end">${esc(r.p.phone)}</td>
        <td><b>${money(r.bs.amount)}</b></td>
        <td class="actions"><button class="btn btn-sm" data-stmt="${r.kind}:${r.p.id}">كشف حساب</button></td>
      </tr>`).join('')}</tbody></table>` : emptyState(emptyText);

  const adjList = [...db.adjustments].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const editable = can('edit');

  view.innerHTML = `
    <div class="stats">
      ${statCard('إجمالي المدينين (لينا عندهم)', money(totD), 'accent')}
      ${statCard('إجمالي الدائنين (ليهم عندنا)', money(totC), 'warn')}
      ${statCard('الصافي', `${money(Math.abs(net))}<small>${net > 0 ? 'لصالحنا' : net < 0 ? 'علينا' : 'متوازن'}</small>`, net >= 0 ? 'accent' : 'danger')}
    </div>
    <div class="toolbar">
      <div class="chips" id="ledTabs">
        <button class="chip ${ledgerState.tab === 'balances' ? 'active' : ''}" data-tab="balances">الدائنون والمدينون</button>
        <button class="chip ${ledgerState.tab === 'entries' ? 'active' : ''}" data-tab="entries">القيود اليدوية (${db.adjustments.length})</button>
      </div>
      <span class="spacer"></span>
      ${canAdd ? '<button class="btn btn-primary" id="addAdj">+ قيد مدين / دائن</button>' : ''}
    </div>
    <div id="ledBody">${ledgerState.tab === 'balances' ? `
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>المدينون — عليهم فلوس لينا</h3><span class="text-accent">${money(totD)}</span></div>
          ${table(debtors, 'مفيش حد عليه فلوس')}
        </section>
        <section class="card">
          <div class="card-head"><h3>الدائنون — ليهم فلوس عندنا</h3><span class="text-warn">${money(totC)}</span></div>
          ${table(creditors, 'مفيش حد ليه فلوس عندنا')}
        </section>
      </div>
      <p class="muted summary">💡 العميل بيبقى مدين لما يشتري آجل، والمورد بيبقى دائن لما نشتري منه آجل. ولو عميل دفع زيادة أو رجّع بضاعة بيبقى دائن.</p>`
    : (adjList.length ? `
      <div class="table-wrap card"><table class="table">
        <thead><tr><th>التاريخ</th><th>الاسم</th><th>النوع</th><th>القيد</th><th>المبلغ</th><th>البيان</th><th></th></tr></thead>
        <tbody>${adjList.map(a => `<tr>
          <td>${fmtDate(a.date)}${a.createdBy && Backend.isOnline() ? `<div class="muted small">${esc(a.createdBy)}</div>` : ''}</td>
          <td><b>${esc(partyName(a.party, a.partyId))}</b></td>
          <td>${a.party === 'customer' ? 'عميل' : 'مورد'}</td>
          <td><span class="side ${a.type}">${a.type === 'debit' ? 'مدين' : 'دائن'}</span></td>
          <td><b>${money(a.amount)}</b></td>
          <td class="muted">${esc(a.note)}</td>
          <td class="actions">${editable ? `<button class="btn btn-sm" data-edit="${a.id}">تعديل</button><button class="btn btn-sm btn-ghost-danger" data-del="${a.id}">حذف</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : emptyState('مفيش قيود يدوية. استخدمها للمرتجعات والخصومات والشيكات الراجعة وتسوية فروق الحساب.'))}
    </div>`;

  $('#ledTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { ledgerState.tab = b.dataset.tab; render(); } };
  if ($('#addAdj')) $('#addAdj').onclick = () => openAdjustmentForm();
  $('#ledBody').onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.stmt) { const [k, id] = t.dataset.stmt.split(':'); openStatement(k, id); }
    if (t.dataset.edit) openAdjustmentForm(t.dataset.edit);
    if (t.dataset.del) {
      const a = byId(db.adjustments, t.dataset.del);
      if (await confirmDialog(`حذف القيد ${a.type === 'debit' ? 'المدين' : 'الدائن'} بمبلغ ${fmt(a.amount)} على "${partyName(a.party, a.partyId)}"؟`)) {
        db.adjustments = db.adjustments.filter(x => x.id !== a.id); saveDB(); toast('تم حذف القيد'); render();
      }
    }
  };
}

/* ---------- نموذج القيد اليدوي ---------- */
const ADJ_HINTS = {
  customer: {
    debit: 'مدين: بيزوّد اللي على العميل (مثلاً: شيك راجع، مصاريف عليه، تصحيح فاتورة بأقل من قيمتها).',
    credit: 'دائن: بيقلل اللي على العميل (مثلاً: مرتجع، خصم، تعويض عن عيب، تسوية).',
  },
  supplier: {
    credit: 'دائن: بيزوّد اللي علينا للمورد (مثلاً: فرق سعر لصالحه، مصاريف إضافية علينا).',
    debit: 'مدين: بيقلل اللي علينا للمورد (مثلاً: مرتجع ليه، خصم منه، مصاريف دفعناها على حسابه).',
  },
};

function openAdjustmentForm(id, preset = {}) {
  if (!db.customers.length && !db.suppliers.length) return toast('ضيف عملاء أو موردين الأول', 'error');
  const a = id ? byId(db.adjustments, id)
    : { party: preset.party || (db.customers.length ? 'customer' : 'supplier'), partyId: preset.partyId || '', date: todayISO(), type: 'credit', amount: '', note: '' };
  openModal(id ? 'تعديل قيد' : 'قيد مدين / دائن', `
    <form id="adjForm" class="form-grid">
      ${selectField('الحساب', 'party', [{ value: 'customer', label: 'عميل' }, { value: 'supplier', label: 'مورد' }], a.party)}
      <label class="field"><span>الاسم <b class="req">*</b></span><select name="partyId" required></select></label>
      <fieldset class="field-full side-pick">
        <legend>نوع القيد</legend>
        <label class="side-opt debit"><input type="radio" name="type" value="debit" ${a.type === 'debit' ? 'checked' : ''}> مدين</label>
        <label class="side-opt credit"><input type="radio" name="type" value="credit" ${a.type === 'credit' ? 'checked' : ''}> دائن</label>
        <p class="muted small" id="adjHint"></p>
      </fieldset>
      ${field('المبلغ', 'amount', a.amount, { type: 'number', required: true, attrs: 'step="any" min="0.01"' })}
      ${field('التاريخ', 'date', a.date, { type: 'date', required: true })}
      ${field('البيان (السبب)', 'note', a.note, { required: true, hint: 'مثلاً: مرتجع توب رقم 104' })}
      <p class="field-full balance-preview" id="adjPreview"></p>
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">حفظ القيد</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`);
  const form = $('#adjForm');
  const fillParties = keep => {
    const list = form.party.value === 'customer' ? db.customers : db.suppliers;
    form.partyId.innerHTML = `<option value="">— اختر —</option>` + list.map(p => `<option value="${p.id}" ${p.id === keep ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  };
  const update = () => {
    const kind = form.party.value;
    const type = form.type.value;
    $('#adjHint').textContent = type ? ADJ_HINTS[kind][type] : '';
    const pid = form.partyId.value;
    if (!pid) { $('#adjPreview').innerHTML = ''; return; }
    let before = kind === 'customer' ? customerBalance(pid) : supplierBalance(pid);
    if (id && a.party === kind && a.partyId === pid) before = round2(before - adjustmentEffect(a, kind));
    const after = round2(before + adjustmentEffect({ type, amount: form.amount.value }, kind));
    const lbl = v => { const s = balanceSide(kind, v); return s.side ? `${fmt(s.amount)} ${SIDE_LABEL[s.side]}` : 'خالص'; };
    $('#adjPreview').innerHTML = `الرصيد قبل القيد: <b>${lbl(before)}</b> ← بعد القيد: <b>${lbl(after)}</b>`;
  };
  fillParties(a.partyId);
  form.party.onchange = () => { fillParties(''); update(); };
  form.partyId.onchange = update;
  form.amount.oninput = update;
  $$('input[name=type]', form).forEach(r => { r.onchange = update; });
  update();

  form.onsubmit = e => {
    e.preventDefault();
    const d = formData(form);
    if (!d.partyId) return toast('اختار الاسم', 'error');
    if (!d.type) return toast('اختار مدين أو دائن', 'error');
    if (num(d.amount) <= 0) return toast('اكتب مبلغ صحيح', 'error');
    if (!d.note.trim()) return toast('اكتب سبب القيد', 'error');
    saveAdjustment({ party: d.party, partyId: d.partyId, date: d.date, type: d.type, amount: d.amount, note: d.note.trim() }, id);
    closeModal(); toast('تم حفظ القيد'); render();
    if (preset.back) preset.back();
  };
}

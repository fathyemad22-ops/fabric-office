/* ========== الخزنة والمرتجعات وإرسال واتساب لأكتر من عميل ========== */
const treasuryState = { date: '' };

function renderTreasury(view) {
  const date = treasuryState.date || todayISO();
  const accs = accountsList();
  const moves = moneyMovements().filter(m => m.date === date);
  const inSum = moves.filter(m => m.amount > 0).reduce((a, m) => a + m.amount, 0);
  const outSum = moves.filter(m => m.amount < 0).reduce((a, m) => a - m.amount, 0);
  const closedToday = db.closings.find(c => c.date === date);
  const recentClosings = [...db.closings].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 10);

  view.innerHTML = `
    <div class="stats">
      ${accs.map(a => statCard(a.name, money(accountBalance(a.id)), 'accent')).join('')}
      ${statCard('الإجمالي معاك', money(accs.reduce((x, a) => x + accountBalance(a.id), 0)))}
    </div>
    <div class="toolbar">
      <label class="inline-field">اليوم <input type="date" id="trDate" value="${date}"></label>
      <span class="spacer"></span>
      ${can('payments') ? `<button class="btn" id="trTransfer">⇄ تحويل بين الحسابات</button>
      <button class="btn btn-primary" id="trClose">${closedToday ? '✓ اتقفل — تقفيل تاني' : 'تقفيل اليوم'}</button>` : ''}
    </div>
    <section class="card">
      <div class="card-head"><h3>حركة يوم ${fmtDate(date)}</h3>
        <span><span class="text-accent">داخل ${money(inSum)}</span> — <span class="text-warn">خارج ${money(outSum)}</span></span></div>
      ${moves.length ? `<div class="table-wrap"><table class="table compact">
        <thead><tr><th>البيان</th><th>الحساب</th><th>داخل</th><th>خارج</th></tr></thead>
        <tbody>${moves.map(m => `<tr><td>${esc(m.desc)}</td><td class="small">${esc(accountName(m.accountId))}</td>
          <td class="text-accent">${m.amount > 0 ? fmt(m.amount) : ''}</td><td class="text-warn">${m.amount < 0 ? fmt(-m.amount) : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : emptyState('مفيش حركة فلوس في اليوم ده')}
    </section>
    <section class="card">
      <div class="card-head"><h3>آخر التقفيلات</h3></div>
      ${recentClosings.length ? `<div class="table-wrap"><table class="table compact">
        <thead><tr><th>اليوم</th>${accs.map(a => `<th>${esc(a.name)}</th>`).join('')}<th>الفرق</th><th>بواسطة</th></tr></thead>
        <tbody>${recentClosings.map(c => {
          const diff = (c.items || []).reduce((x, i) => x + i.diff, 0);
          return `<tr><td>${fmtDate(c.date)}</td>${accs.map(a => { const i = (c.items || []).find(x => x.accountId === a.id); return `<td>${i ? fmt(i.actual) : '—'}</td>`; }).join('')}
            <td class="${diff < 0 ? 'text-danger' : diff > 0 ? 'text-accent' : 'muted'}">${diff ? (diff > 0 ? '+' : '') + fmt(diff) : 'مظبوط'}</td><td class="small muted">${esc(c.createdBy || '')}</td></tr>`;
        }).join('')}</tbody></table></div>` : emptyState('لسه مفيش تقفيلات. في آخر كل يوم دوس "تقفيل اليوم" وعد الفلوس اللي معاك.')}
    </section>`;

  $('#trDate').onchange = e => { treasuryState.date = e.target.value; render(); };
  if ($('#trTransfer')) $('#trTransfer').onclick = openTransferForm;
  if ($('#trClose')) $('#trClose').onclick = () => openClosingForm(date);
}

function openTransferForm() {
  const accs = accountsList();
  if (accs.length < 2) return toast('ضيف حساب تاني من الإعدادات الأول', 'error');
  openModal('تحويل بين الحسابات', `
    <form id="trForm" class="form-grid">
      ${accountSelectHtml('from', accs[0].id, 'من')}
      ${accountSelectHtml('to', accs[1].id, 'إلى')}
      ${field('المبلغ', 'amount', '', { type: 'number', required: true, attrs: 'step="any" min="0.01"' })}
      ${field('التاريخ', 'date', todayISO(), { type: 'date', required: true })}
      ${field('ملاحظات', 'note', '', { hint: 'مثلاً: سحبت من فودافون كاش' })}
      <div class="form-actions field-full"><button class="btn btn-primary" type="submit">حفظ التحويل</button><button class="btn" type="button" data-close>إلغاء</button></div>
    </form>`);
  $('#trForm').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.from === d.to) return toast('اختار حسابين مختلفين', 'error');
    if (num(d.amount) <= 0) return toast('اكتب مبلغ صحيح', 'error');
    saveTransfer({ from: d.from, to: d.to, amount: d.amount, date: d.date, note: d.note.trim() });
    closeModal(); toast('تم التحويل'); render();
  };
}

function openClosingForm(date) {
  const accs = accountsList();
  openModal(`تقفيل يوم ${fmtDate(date)}`, `
    <form id="clForm">
      <p class="muted">عد الفلوس اللي معاك فعلاً في كل حساب واكتبها. لو فيه فرق، السيستم بيسجله ويظبط الرصيد عليه.</p>
      <table class="table compact closing-table">
        <thead><tr><th>الحساب</th><th>المفروض</th><th>الفعلي</th><th>الفرق</th></tr></thead>
        <tbody>${accs.map(a => { const exp = accountBalance(a.id, date); return `<tr data-acc="${esc(a.id)}" data-exp="${exp}">
          <td><b>${esc(a.name)}</b></td><td>${fmt(exp)}</td>
          <td><input type="number" step="any" name="act_${esc(a.id)}" value="${exp}" aria-label="الفعلي في ${esc(a.name)}"></td><td class="cl-diff muted">مظبوط</td></tr>`; }).join('')}</tbody>
      </table>
      ${field('ملاحظات', 'note', '')}
      <div class="form-actions"><button class="btn btn-primary" type="submit">تقفيل اليوم</button><button class="btn" type="button" data-close>إلغاء</button></div>
    </form>`);
  const form = $('#clForm');
  form.oninput = () => $$('tr[data-acc]', form).forEach(tr => {
    const diff = round2(num($('input', tr).value) - num(tr.dataset.exp));
    const cell = $('.cl-diff', tr);
    cell.textContent = diff ? (diff > 0 ? `زيادة ${fmt(diff)}` : `عجز ${fmt(-diff)}`) : 'مظبوط';
    cell.className = 'cl-diff ' + (diff < 0 ? 'text-danger' : diff > 0 ? 'text-accent' : 'muted');
  });
  form.onsubmit = e => {
    e.preventDefault();
    const items = $$('tr[data-acc]', form).map(tr => ({ accountId: tr.dataset.acc, expected: num(tr.dataset.exp), actual: num($('input', tr).value) }));
    saveClosing(date, items, form.note.value.trim());
    const diff = items.reduce((a, i) => a + i.actual - i.expected, 0);
    closeModal(); toast(diff ? `تم التقفيل — الفرق ${fmt(diff)}` : 'تم التقفيل — الخزنة مظبوطة 👌'); render();
  };
}

/* =====================================================
   المرتجعات
   ===================================================== */
function renderReturns(view) {
  const list = [...db.returns].sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  view.innerHTML = `
    <div class="toolbar">
      <span class="muted">المرتجع بيرجّع التوب للمخزن (من العميل) أو بيطلّعه (للمورد)، وبيظبط الحساب لوحده.</span>
      <span class="spacer"></span>
      ${can('sales') ? '<button class="btn btn-primary" id="retSale">+ مرتجع من عميل</button>' : ''}
      ${can('purchases') ? '<button class="btn" id="retPur">+ مرتجع لمورد</button>' : ''}
    </div>
    ${list.length ? `<div class="table-wrap card"><table class="table">
      <thead><tr><th>رقم</th><th>التاريخ</th><th>النوع</th><th>الاسم</th><th>التوبات</th><th>القيمة</th><th>فلوس رجعت</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td><b>${r.no}</b></td><td>${fmtDate(r.date)}</td>
        <td>${r.kind === 'sale' ? '<span class="badge ok">من عميل</span>' : '<span class="badge warn">لمورد</span>'}</td>
        <td>${esc(partyName(r.kind === 'sale' ? 'customer' : 'supplier', r.partyId))}</td>
        <td class="small">${r.lines.map(l => `${esc(l.name)}: ${l.bolts.length}`).join('، ')}</td>
        <td>${money(r.total)}</td><td>${r.refund ? money(r.refund) + ` <small class="muted">${esc(accountName(r.refundAccount))}</small>` : '—'}</td>
        <td class="actions">${can('edit') ? `<button class="btn btn-sm btn-ghost-danger" data-del="${r.id}">إلغاء</button>` : ''}</td></tr>`).join('')}</tbody>
    </table></div>` : emptyState('مفيش مرتجعات')}`;
  if ($('#retSale')) $('#retSale').onclick = () => openReturnForm('sale');
  if ($('#retPur')) $('#retPur').onclick = () => openReturnForm('purchase');
  view.onclick = async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const r = byId(db.returns, b.dataset.del);
    if (!(await confirmDialog(`إلغاء المرتجع رقم ${r.no}؟ التوبات هترجع زي ما كانت قبله.`, 'إلغاء المرتجع'))) return;
    const err = deleteReturn(r.id);
    if (err) return toast(err, 'error');
    toast('تم إلغاء المرتجع'); render();
  };
}

function openReturnForm(kind) {
  const isS = kind === 'sale';
  const parties = (isS ? db.customers : db.suppliers).map(p => ({ value: p.id, label: p.name }));
  if (!parties.length) return toast(`مفيش ${isS ? 'عملاء' : 'موردين'}`, 'error');
  openModal(isS ? 'مرتجع من عميل' : 'مرتجع لمورد', `
    <form id="retForm">
      <div class="form-grid">
        ${selectField(isS ? 'العميل' : 'المورد', 'party', parties, '', { required: true, placeholder: '— اختر —' })}
        ${field('التاريخ', 'date', todayISO(), { type: 'date', required: true })}
      </div>
      <div id="retBolts" class="ret-bolts"></div>
      <div class="totals">
        <div class="grand"><span>قيمة المرتجع</span><b id="retTotal">0</b></div>
        <label><span>${isS ? 'فلوس رجعناها للعميل' : 'فلوس رجعها المورد'}</span><input type="number" name="refund" step="any" min="0" value="" placeholder="0"></label>
        ${accountSelectHtml('refundAccount', 'cash', isS ? 'من' : 'في')}
        <small class="muted">${isS ? 'لو مرجعتش فلوس، قيمة المرتجع بتتخصم من حساب العميل.' : 'لو المورد مرجعش فلوس، قيمة المرتجع بتتخصم من حسابه.'}</small>
      </div>
      ${field('السبب', 'note', '', { hint: 'مثلاً: عيب صباغة' })}
      <div class="form-actions"><button class="btn btn-primary" type="submit">حفظ المرتجع</button><button class="btn" type="button" data-close>إلغاء</button></div>
    </form>`, { wide: true });
  const form = $('#retForm');
  const chosen = new Set();
  const draw = () => {
    const pid = form.party.value;
    const items = pid ? returnableBolts(kind, pid) : [];
    if (!pid) { $('#retBolts').innerHTML = ''; return; }
    if (!items.length) { $('#retBolts').innerHTML = emptyState(isS ? 'مفيش توبات متباعة للعميل ده ممكن ترجع' : 'مفيش توبات في المخزن من المورد ده'); return; }
    const groups = {};
    items.forEach(x => { const k = `${x.ref.no}|${x.fabricId}`; (groups[k] = groups[k] || { x, list: [] }).list.push(x); });
    $('#retBolts').innerHTML = Object.values(groups).map(g => `
      <div class="ret-group"><div class="ret-head"><b>${esc(g.x.name)}</b> <span class="muted small">— فاتورة ${isS ? 'بيع' : 'شراء'} ${g.x.ref.no} (${fmtDate(g.x.ref.date)}) — سعر المتر ${fmt(g.x.price)}</span></div>
        <div class="bolt-pick">${g.list.map(x => `<label class="bolt-chip ${chosen.has(x.bolt.id) ? 'on' : ''}"><input type="checkbox" data-bolt="${x.bolt.id}" ${chosen.has(x.bolt.id) ? 'checked' : ''}><span>#${esc(x.bolt.no)}</span><small>${fmt(x.bolt.length)}</small></label>`).join('')}</div></div>`).join('');
    total();
  };
  const total = () => {
    const items = form.party.value ? returnableBolts(kind, form.party.value) : [];
    const t = items.filter(x => chosen.has(x.bolt.id)).reduce((a, x) => a + num(x.bolt.length) * num(x.price), 0);
    $('#retTotal').textContent = `${money(t)} — ${chosen.size} توب`;
  };
  form.party.onchange = () => { chosen.clear(); draw(); total(); };
  $('#retBolts').onchange = e => {
    const id = e.target.dataset.bolt; if (!id) return;
    e.target.checked ? chosen.add(id) : chosen.delete(id);
    e.target.closest('.bolt-chip').classList.toggle('on', e.target.checked);
    total();
  };
  form.onsubmit = e => {
    e.preventDefault();
    if (!form.party.value) return toast('اختار الاسم', 'error');
    if (!chosen.size) return toast('اختار التوبات اللي راجعة', 'error');
    const err = saveReturn({ kind, partyId: form.party.value, date: form.date.value, boltIds: [...chosen], refund: form.refund.value, refundAccount: form.refundAccount.value, note: form.note.value.trim() });
    if (err) return toast(err, 'error');
    closeModal(); toast('تم حفظ المرتجع'); render();
  };
}

/* =====================================================
   إرسال واتساب لأكتر من عميل (واحد ورا التاني)
   واتساب مش بيسمح بإرسال أوتوماتيك ببلاش، فالسيستم بيفتح الشات والرسالة جاهزة
   وانت تدوس إرسال. ده بيحمي رقمك من الحظر.
   ===================================================== */
function openWaQueue(items, title = 'إرسال واتساب') {
  if (!items.length) return toast('مفيش حد في القائمة', 'error');
  let i = 0;
  const sent = new Set();
  const draw = () => {
    const it = items[i];
    $('#modalBody').innerHTML = `
      <div class="wa-queue">
        <div class="wa-progress"><span>${sent.size} من ${items.length} اتبعتلهم</span><div class="bar"><i style="width:${(sent.size / items.length * 100).toFixed(1)}%"></i></div></div>
        <div class="wa-card">
          <div class="wa-to"><b>${esc(it.name)}</b> <span dir="ltr" class="muted">${esc(it.phone || 'مفيش رقم')}</span> ${sent.has(i) ? '<span class="badge ok">اتبعت</span>' : ''}</div>
          <pre class="wa-text">${esc(it.text)}</pre>
        </div>
        <div class="form-actions">
          <button class="btn btn-wa" id="waOpen" ${it.phone ? '' : 'disabled'}>فتح واتساب وإرسال</button>
          <button class="btn" id="waPrev" ${i === 0 ? 'disabled' : ''}>السابق</button>
          <button class="btn btn-primary" id="waNext">${i === items.length - 1 ? 'خلصت' : 'التالي ←'}</button>
        </div>
        <p class="muted small">💡 عشان رقمك يفضل في أمان: ابعت لعدد معقول في اليوم، وخلي الرسالة شخصية.</p>
      </div>`;
    $('#waOpen').onclick = () => { openWhatsApp(it.phone, it.text); sent.add(i); setTimeout(draw, 300); };
    $('#waPrev').onclick = () => { i--; draw(); };
    $('#waNext').onclick = () => { if (i === items.length - 1) { closeModal(); toast(`تم — اتبعت لـ ${sent.size} من ${items.length}`); return; } i++; draw(); };
  };
  openModal(title, '', { wide: true });
  draw();
}

function reminderText(c, d) {
  const cur = db.settings.currency;
  return [`أهلاً أستاذ ${c.name} 👋`, `معاك ${db.settings.shopName}.`, '',
    `رصيد حضرتك عندنا: ${fmt(d.balance)} ${cur}`,
    d.overdue > 0 ? `والمستحق دلوقتي حسب الاتفاق: *${fmt(d.overdue)} ${cur}*` : '',
    `القسط الأسبوعي: ${fmt(d.weekly)} ${cur}`, '', 'برجاء التكرم بالسداد، وشكراً لحضرتك 🌹'].filter((x, k, arr) => x !== '' || arr[k - 1] !== '').join('\n');
}

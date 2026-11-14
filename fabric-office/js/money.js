/* ========== الخزنة، الآجل والأقساط، المرتجعات، الجرد ========== */

/* ---------- أسماء الأصناف (خامة / رسمة / لون) ---------- */
function fabricLabel(f, withStock = false) {
  if (!f) return '';
  const parts = [f.name, f.code ? `رسمة ${f.code}` : '', f.color].filter(Boolean);
  return parts.join(' — ') + (withStock ? ` (${stockOf(f.id).count} توب)` : '');
}

function sortedFabrics() {
  const k = f => `${f.name || ''}|${f.code || ''}|${f.color || ''}`;
  return [...db.fabrics].sort((a, b) => k(a).localeCompare(k(b), 'ar', { numeric: true }));
}

/* ---------- الحسابات (كاش / فودافون كاش / ...) ---------- */
const accountsList = () => db.settings.accounts || [];
const accountName = id => (accountsList().find(a => a.id === id) || { name: id === 'cash' ? 'الكاش' : '—' }).name;

// كل حركة فلوس في السيستم من مكان واحد: { date, accountId, amount (+ داخل / - خارج), desc, kind }
function moneyMovements() {
  const out = [];
  const add = (date, accountId, amount, desc, kind) => { if (num(amount)) out.push({ date, accountId: accountId || 'cash', amount: round2(amount), desc, kind }); };
  db.sales.forEach(s => add(s.date, s.paidAccount, s.paid, `فاتورة بيع ${s.no} — ${partyName('customer', s.customerId)}`, 'sale'));
  db.purchases.forEach(p => {
    add(p.date, p.paidAccount, -num(p.paid), `فاتورة شراء ${p.no} — ${partyName('supplier', p.supplierId)}`, 'purchase');
    add(p.date, p.transportAccount, -num(p.transport), `نقل فاتورة شراء ${p.no}`, 'transport');
  });
  db.payments.forEach(p => add(p.date, p.accountId, p.party === 'customer' ? p.amount : -p.amount,
    `${p.party === 'customer' ? 'تحصيل من' : 'سداد لـ'} ${partyName(p.party, p.partyId)}${p.note ? ' — ' + p.note : ''}`, p.party === 'customer' ? 'collect' : 'pay'));
  db.expenses.forEach(x => add(x.date, x.accountId, -x.amount, `مصروف: ${x.category}${x.note ? ' — ' + x.note : ''}`, 'expense'));
  db.returns.forEach(r => add(r.date, r.refundAccount, r.kind === 'sale' ? -num(r.refund) : num(r.refund),
    `مرتجع ${r.no} — ${partyName(r.kind === 'sale' ? 'customer' : 'supplier', r.partyId)}`, 'return'));
  db.transfers.forEach(t => {
    add(t.date, t.from, -t.amount, `تحويل إلى ${accountName(t.to)}${t.note ? ' — ' + t.note : ''}`, 'transfer');
    add(t.date, t.to, t.amount, `تحويل من ${accountName(t.from)}${t.note ? ' — ' + t.note : ''}`, 'transfer');
  });
  db.closings.forEach(c => (c.items || []).forEach(i => add(c.date, i.accountId, i.diff, `فرق تقفيل يوم ${fmtDate(c.date)}`, 'closing')));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function accountBalance(accountId, upToDate) {
  let b = num((db.settings.accountOpening || {})[accountId]);
  moneyMovements().forEach(m => { if (m.accountId === accountId && (!upToDate || m.date <= upToDate)) b += m.amount; });
  return round2(b);
}

function saveTransfer(data) {
  db.transfers.push({ id: uid(), date: data.date, from: data.from, to: data.to, amount: round2(data.amount), note: data.note, createdBy: currentUser.name });
  saveDB();
}

function saveClosing(date, items, note) {
  db.closings.push({ id: uid(), date, items: items.map(i => ({ accountId: i.accountId, expected: round2(i.expected), actual: round2(i.actual), diff: round2(i.actual - i.expected) })),
    note, createdBy: currentUser.name, createdAt: Date.now() });
  saveDB();
}

/* ---------- سياسة الآجل ---------- */
const customerLimit = c => num(c && c.creditLimit) || num(db.settings.creditLimit);
const customerWeekly = c => num(c && c.weekly) || num(db.settings.weeklyInstallment);

// بيرجع رسالة لو الفاتورة مخالفة لسياسة الآجل، أو null
function creditViolation(customerId, total, paid, editingSaleId) {
  if (!customerId) return null;
  const c = byId(db.customers, customerId);
  const remaining = round2(total - paid);
  if (remaining <= 0) return null;
  const cur = db.settings.currency;
  const minPct = num(db.settings.minDownPct);
  const minPaid = round2(total * minPct / 100);
  if (minPct > 0 && paid + 1e-9 < minPaid) return `الفاتورة آجل: لازم العميل يدفع مقدم ${minPct}% على الأقل (${fmt(minPaid)} ${cur})`;
  let before = customerBalance(customerId);
  if (editingSaleId) { const old = byId(db.sales, editingSaleId); if (old && old.customerId === customerId) before = round2(before - (old.total - old.paid)); }
  const limit = customerLimit(c);
  if (limit > 0 && before + remaining > limit + 1e-9) {
    const need = round2(before + remaining - limit);
    return `العميل عليه ${fmt(before)} ${cur}، وبالفاتورة دي هيبقى ${fmt(before + remaining)} — والحد الأقصى ${fmt(limit)}. لازم يدفع ${fmt(need)} ${cur} زيادة أو يسدد من القديم الأول`;
  }
  return null;
}

/* ---------- الأقساط والمتأخرين ----------
   كل عميل عليه فلوس المفروض يدفع القسط الأسبوعي (10,000 مثلاً) كل 7 أيام.
   بنحسب من آخر دفعة أو من أقدم مديونية لسه مدفوعتش (أيهما أحدث). */
function customerDue(id) {
  const c = byId(db.customers, id);
  const balance = customerBalance(id);
  const res = { balance, weekly: customerWeekly(c), overdue: 0, lateDays: 0, nextDate: '', lastPayment: '' };
  if (balance <= 0) return res;
  const debts = [];
  const credits = [];
  if (num(c.opening) > 0) debts.push({ date: c.createdAt || '2000-01-01', amount: num(c.opening) });
  db.sales.forEach(s => { if (s.customerId === id && s.total - s.paid > 0) debts.push({ date: s.date, amount: s.total - s.paid }); });
  db.adjustments.forEach(a => { if (a.party === 'customer' && a.partyId === id) { const e = adjustmentEffect(a, 'customer'); (e > 0 ? debts : credits).push({ date: a.date, amount: Math.abs(e) }); } });
  db.payments.forEach(p => { if (p.party === 'customer' && p.partyId === id) credits.push({ date: p.date, amount: p.amount, pay: true }); });
  db.returns.forEach(r => { if (r.kind === 'sale' && r.partyId === id) credits.push({ date: r.date, amount: r.total - num(r.refund) }); });
  debts.sort((a, b) => a.date.localeCompare(b.date));
  // نوزع المدفوع على أقدم مديونية الأول
  let pool = credits.reduce((a, x) => a + x.amount, 0);
  let oldest = '';
  for (const d of debts) { if (pool >= d.amount - 1e-9) pool -= d.amount; else { oldest = d.date; break; } }
  const lastPay = credits.filter(x => x.pay).map(x => x.date).sort().pop() || '';
  res.lastPayment = lastPay;
  const ref = [oldest, lastPay].filter(Boolean).sort().pop() || todayISO();
  const days = Math.floor((new Date(todayISO()) - new Date(ref)) / 86400000);
  const weeks = Math.floor(days / 7);
  res.overdue = round2(Math.min(balance, res.weekly * weeks));
  res.lateDays = Math.max(0, days - 7);
  const next = new Date(ref); next.setDate(next.getDate() + 7 * (weeks + 1));
  res.nextDate = next.toISOString().slice(0, 10);
  return res;
}

function lateCustomers() {
  return db.customers.map(c => ({ c, d: customerDue(c.id) })).filter(x => x.d.overdue > 0).sort((a, b) => b.d.overdue - a.d.overdue);
}

/* ---------- آخر سعر للعميل ---------- */
function lastPriceFor(customerId, fabricId) {
  if (!customerId) return null;
  const sales = db.sales.filter(s => s.customerId === customerId).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  for (const s of sales) { const l = s.lines.find(x => x.fabricId === fabricId); if (l) return num(l.price); }
  return null;
}

/* ---------- المرتجعات ----------
   مرتجع بيع: التوب يرجع المخزن وحساب العميل يقل.
   مرتجع شراء: التوب يطلع من المخزن (status = returned) وحساب المورد يقل. */
const saleHasReturns = id => db.returns.some(r => r.kind === 'sale' && r.lines.some(l => l.bolts.some(b => b.saleId === id)));

// التوبات اللي ممكن ترجع: للعميل = اللي اتباعتله، للمورد = اللي لسه في المخزن وجت منه
function returnableBolts(kind, partyId) {
  if (kind === 'sale') {
    const out = [];
    db.sales.filter(s => s.customerId === partyId).forEach(s => s.lines.forEach(l => (l.bolts || []).forEach(b => {
      const bolt = byId(db.bolts, b.boltId);
      if (bolt && bolt.status === 'sold' && bolt.saleId === s.id) out.push({ bolt, price: l.price, fabricId: l.fabricId, name: l.name, unit: l.unit, ref: s, cost: b.cost });
    })));
    return out;
  }
  const out = [];
  db.purchases.filter(p => p.supplierId === partyId).forEach(p => p.lines.forEach(l => (l.bolts || []).forEach(b => {
    const bolt = byId(db.bolts, b.boltId);
    if (bolt && bolt.status === 'in' && bolt.purchaseId === p.id) out.push({ bolt, price: l.price, fabricId: l.fabricId, name: l.name, unit: l.unit, ref: p, cost: bolt.cost });
  })));
  return out;
}

function saveReturn(data) {
  const items = returnableBolts(data.kind, data.partyId).filter(x => data.boltIds.includes(x.bolt.id));
  if (!items.length) return 'اختار التوبات اللي راجعة';
  const byFabric = {};
  items.forEach(x => {
    const k = x.fabricId + '|' + x.price;
    byFabric[k] = byFabric[k] || { fabricId: x.fabricId, name: x.name, unit: x.unit, price: x.price, bolts: [] };
    byFabric[k].bolts.push({ boltId: x.bolt.id, no: x.bolt.no, length: num(x.bolt.length), cost: num(x.cost),
      saleId: data.kind === 'sale' ? x.ref.id : '', purchaseId: data.kind === 'purchase' ? x.ref.id : '' });
  });
  const lines = Object.values(byFabric);
  const total = round2(lines.reduce((a, l) => a + lineTotal(l), 0));
  const refund = round2(data.refund);
  if (refund < 0 || refund > total + 1e-9) return 'الفلوس اللي رجعت لازم تكون بين صفر وقيمة المرتجع';
  const rid = uid();
  items.forEach(x => {
    if (data.kind === 'sale') { x.bolt.status = 'in'; x.bolt.saleId = ''; x.bolt.returnedAt = data.date; }
    else { x.bolt.status = 'returned'; x.bolt.returnId = rid; }
  });
  db.counters.return = (db.counters.return || 0) + 1;
  db.returns.push({ id: rid, no: db.counters.return, kind: data.kind, partyId: data.partyId, date: data.date, lines, total, refund,
    refundAccount: data.refundAccount || 'cash', note: data.note, createdBy: currentUser.name, createdAt: Date.now() });
  saveDB();
  return null;
}

function deleteReturn(id) {
  const r = byId(db.returns, id);
  if (!r) return null;
  for (const l of r.lines) for (const b of l.bolts) {
    const bolt = byId(db.bolts, b.boltId);
    if (!bolt) continue;
    if (r.kind === 'sale' && bolt.status !== 'in') return `التوب رقم ${b.no} اتباع تاني بعد المرتجع، مينفعش تلغي المرتجع ده`;
  }
  r.lines.forEach(l => l.bolts.forEach(b => {
    const bolt = byId(db.bolts, b.boltId);
    if (!bolt) return;
    if (r.kind === 'sale') { bolt.status = 'sold'; bolt.saleId = b.saleId; delete bolt.returnedAt; }
    else { bolt.status = 'in'; delete bolt.returnId; }
  }));
  db.returns = db.returns.filter(x => x.id !== id);
  saveDB();
  return null;
}

/* ---------- الجرد ----------
   بتكتب عدد التوب الموجود فعلاً لكل صنف. لو أقل من السيستم، أحدث التوبات بتتعلم "عجز".
   لو أكتر، بتتضاف توبات بالطول الأكتر تكراراً للصنف. */
function commonLength(fabricId) {
  const counts = {};
  db.bolts.filter(b => b.fabricId === fabricId).forEach(b => { counts[b.length] = (counts[b.length] || 0) + 1; });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? num(best[0]) : 50;
}

function saveStocktake(date, rows, note) {
  const items = [];
  rows.forEach(r => {
    const f = byId(db.fabrics, r.fabricId);
    const inStock = boltsInStock(r.fabricId).sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
    const sys = inStock.length;
    const actual = Math.max(0, parseInt(r.actual, 10) || 0);
    if (actual === sys) { items.push({ fabricId: r.fabricId, system: sys, actual, lost: 0, added: 0, lossValue: 0 }); return; }
    let lossValue = 0;
    if (actual < sys) {
      inStock.slice(0, sys - actual).forEach(b => { b.status = 'lost'; b.lostAt = date; lossValue += num(b.length) * num(b.cost); });
    } else {
      const len = commonLength(r.fabricId);
      for (let i = 0; i < actual - sys; i++) {
        db.bolts.push({ id: uid(), fabricId: r.fabricId, no: nextBoltNo(r.fabricId), length: len, cost: num(f.cost), status: 'in', source: 'stocktake', purchaseId: '', saleId: '', addedAt: date });
      }
    }
    items.push({ fabricId: r.fabricId, system: sys, actual, lost: Math.max(0, sys - actual), added: Math.max(0, actual - sys), lossValue: round2(lossValue) });
  });
  db.stocktakes.push({ id: uid(), date, items, note, createdBy: currentUser.name, createdAt: Date.now() });
  saveDB();
  return items;
}

/* ---------- الأصناف الواقفة ---------- */
function stagnantFabrics() {
  const today = new Date(todayISO());
  const daysSince = d => (d ? Math.floor((today - new Date(d)) / 86400000) : null);
  return db.fabrics.map(f => {
    const st = stockOf(f.id);
    const oldest = boltsInStock(f.id).map(b => b.addedAt).filter(Boolean).sort()[0] || '';
    const lastSale = db.sales.filter(s => s.lines.some(l => l.fabricId === f.id)).map(s => s.date).sort().pop() || '';
    return { f, count: st.count, meters: st.meters, value: st.value, oldestDays: daysSince(oldest), lastSale, sinceSale: daysSince(lastSale) };
  }).filter(x => x.count > 0).sort((a, b) => (b.sinceSale ?? 99999) - (a.sinceSale ?? 99999));
}

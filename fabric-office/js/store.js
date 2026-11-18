/* ========== البيانات ومنطق العمل ========== */
const COLLECTIONS = ['fabrics', 'bolts', 'customers', 'suppliers', 'sales', 'purchases', 'payments', 'expenses', 'adjustments', 'returns', 'transfers', 'closings', 'stocktakes', 'designs', 'votes'];
const LOCAL_KEY = 'fabricOffice.v2';
const LEGACY_KEY = 'fabricOffice.v1';

function defaultSettings() {
  return {
    shopName: 'مكتب القماش', phone: '', address: '', currency: 'ج.م', invoiceNote: 'شكراً لتعاملكم معنا',
    // سياسة الآجل
    creditLimit: 50000, minDownPct: 50, weeklyInstallment: 10000,
    // أماكن الفلوس
    accounts: [{ id: 'cash', name: 'الكاش' }, { id: 'vf', name: 'فودافون كاش' }],
    accountOpening: {},
  };
}

function defaultData() {
  const d = { settings: defaultSettings(), counters: { sale: 0, purchase: 0, return: 0 } };
  COLLECTIONS.forEach(c => { d[c] = []; });
  return d;
}

let db = defaultData();

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = v => Math.round(num(v) * 100) / 100;
const byId = (list, id) => list.find(x => x.id === id);

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* ---------- تحويل البيانات القديمة (نظام المتر) ---------- */
function normalizeData(raw) {
  const d = defaultData();
  if (!raw || typeof raw !== 'object') return d;
  d.settings = Object.assign(defaultSettings(), raw.settings || {});
  d.counters = Object.assign({ sale: 0, purchase: 0, return: 0 }, raw.counters || {});
  if (!Array.isArray(d.settings.accounts) || !d.settings.accounts.length) d.settings.accounts = defaultSettings().accounts;
  COLLECTIONS.forEach(c => { if (Array.isArray(raw[c])) d[c] = raw[c]; });
  const legacy = !Array.isArray(raw.bolts);
  if (legacy) {
    d.fabrics = d.fabrics.map(f => ({
      id: f.id, code: f.code || '', name: f.name || '', type: f.type || '', color: f.color || '',
      unit: f.unit === 'ياردة' ? 'ياردة' : 'متر', price: num(f.price), cost: num(f.cost),
      minBolts: 2, supplierId: f.supplierId || '', notes: f.notes || '',
    }));
    const conv = l => ({ fabricId: l.fabricId, name: l.name, unit: 'متر', price: num(l.price), meters: num(l.qty), legacyCost: num(l.cost), bolts: [] });
    d.sales = d.sales.map(s => Object.assign({}, s, { lines: (s.lines || []).map(conv) }));
    d.purchases = d.purchases.map(s => Object.assign({}, s, { lines: (s.lines || []).map(conv) }));
  }
  return d;
}

function loadLocal() {
  try {
    const v2 = localStorage.getItem(LOCAL_KEY);
    if (v2) return normalizeData(JSON.parse(v2));
    const v1 = localStorage.getItem(LEGACY_KEY);
    if (v1) return normalizeData(JSON.parse(v1));
  } catch (e) { /* بيانات تالفة */ }
  return defaultData();
}

function saveDB() { Backend.persist(); }

/* ---------- حسابات السطور ---------- */
const lineBoltCount = l => (l.bolts || []).length;
const lineMeters = l => round2((l.bolts && l.bolts.length) ? l.bolts.reduce((a, b) => a + num(b.length), 0) : num(l.meters));
const lineTotal = l => round2(lineMeters(l) * num(l.price));
const lineCost = l => round2((l.bolts && l.bolts.length) ? l.bolts.reduce((a, b) => a + num(b.length) * num(b.cost), 0) : num(l.meters) * num(l.legacyCost));
const invSubtotal = inv => round2(inv.lines.reduce((a, l) => a + lineTotal(l), 0));

/* ---------- المخزن (التوبات) ---------- */
function boltsInStock(fabricId) {
  return db.bolts.filter(b => b.fabricId === fabricId && b.status === 'in')
    .sort((a, b) => String(a.no).localeCompare(String(b.no), 'en', { numeric: true }));
}

function stockOf(fabricId) {
  const list = boltsInStock(fabricId);
  return { count: list.length, meters: round2(list.reduce((a, b) => a + num(b.length), 0)),
    value: round2(list.reduce((a, b) => a + num(b.length) * num(b.cost), 0)) };
}

function nextBoltNo(fabricId, extra = []) {
  let max = 0;
  db.bolts.forEach(b => { if (b.fabricId === fabricId) max = Math.max(max, parseInt(b.no, 10) || 0); });
  extra.forEach(n => { max = Math.max(max, parseInt(n, 10) || 0); });
  return String(max + 1);
}

function boltNoTaken(fabricId, no, ignoreIds = new Set()) {
  return db.bolts.some(b => b.fabricId === fabricId && b.status === 'in' && String(b.no) === String(no) && !ignoreIds.has(b.id));
}

function addOpeningBolts(fabricId, rows) {
  const f = byId(db.fabrics, fabricId);
  const seen = new Set();
  for (const r of rows) {
    if (!String(r.no).trim()) return 'اكتب رقم كل توب';
    if (num(r.length) <= 0) return `طول التوب رقم ${r.no} غير صحيح`;
    if (seen.has(String(r.no)) || boltNoTaken(fabricId, r.no)) return `رقم التوب ${r.no} موجود بالفعل في المخزن`;
    seen.add(String(r.no));
  }
  rows.forEach(r => db.bolts.push({ id: uid(), fabricId, no: String(r.no).trim(), length: round2(r.length), cost: num(f.cost),
    status: 'in', source: 'opening', purchaseId: '', saleId: '', addedAt: todayISO() }));
  saveDB();
  return null;
}

/* ---------- أرقام الفواتير ---------- */
const NUMBERED = { sale: 'sales', purchase: 'purchases', return: 'returns' };
// الرقم الجاي = أكبر من العداد ومن أكبر رقم موجود فعلاً (عشان مفيش رقمين زي بعض)
function nextNo(kind) {
  const maxUsed = db[NUMBERED[kind]].reduce((a, x) => Math.max(a, num(x.no)), 0);
  return Math.max(num(db.counters[kind]), maxUsed) + 1;
}

// فحص فاتورة البيع من غير ما نغيّر حاجة (قبل ما نحجز على السيرفر)
function checkSale(data, existingId) {
  const old = existingId ? byId(db.sales, existingId) : null;
  const seen = new Set();
  for (const l of data.lines) {
    const f = byId(db.fabrics, l.fabricId);
    if (!f) return 'صنف غير موجود';
    for (const bid of l.boltIds) {
      const b = byId(db.bolts, bid);
      if (!b) return 'فيه توب مش موجود في المخزن';
      if (seen.has(bid)) return `التوب رقم ${b.no} مكرر في الفاتورة`;
      if (b.status !== 'in' && !(old && b.saleId === old.id)) return `التوب رقم ${b.no} من "${f.name}" اتباع قبل كده`;
      seen.add(bid);
    }
  }
  return null;
}

/* ---------- فواتير البيع ---------- */
// data.lines: [{fabricId, price, boltIds:[...]}]
// opts: { saleId, no } — بييجوا من Backend.reserve عشان الرقم والتوبات يتحجزوا على السيرفر الأول
function saveSale(data, existingId, opts = {}) {
  const old = existingId ? byId(db.sales, existingId) : null;
  const saleId = old ? old.id : (opts.saleId || uid());
  const seen = new Set();
  const lines = [];
  for (const l of data.lines) {
    const f = byId(db.fabrics, l.fabricId);
    if (!f) return 'صنف غير موجود';
    const bolts = [];
    for (const bid of l.boltIds) {
      const b = byId(db.bolts, bid);
      if (!b) return 'فيه توب مش موجود في المخزن';
      if (seen.has(bid)) return `التوب رقم ${b.no} مكرر في الفاتورة`;
      if (b.status !== 'in' && b.saleId !== saleId) return `التوب رقم ${b.no} من "${f.name}" اتباع قبل كده`;
      seen.add(bid);
      bolts.push({ boltId: b.id, no: b.no, length: num(b.length), cost: num(b.cost) });
    }
    lines.push({ fabricId: f.id, name: fabricLabel(f), unit: f.unit, price: round2(l.price), bolts });
  }
  if (old) db.bolts.forEach(b => { if (b.saleId === saleId) { b.status = 'in'; b.saleId = ''; } });
  seen.forEach(bid => { const b = byId(db.bolts, bid); b.status = 'sold'; b.saleId = saleId; });

  const rec = { date: data.date, customerId: data.customerId, lines, discount: data.discount, paid: data.paid, paidAccount: data.paidAccount || 'cash', note: data.note };
  rec.total = round2(invSubtotal(rec) - num(rec.discount));
  if (rec.paid > rec.total) rec.paid = rec.total;
  if (old) Object.assign(old, rec);
  else {
    const no = opts.no || nextNo('sale');
    db.counters.sale = Math.max(db.counters.sale || 0, no);
    db.sales.push(Object.assign({ id: saleId, no, createdAt: Date.now(), createdBy: currentUser.name }, rec));
  }
  saveDB();
  return null;
}

/* ---------- فواتير الشراء ---------- */
// data.lines: [{fabricId, price, bolts:[{boltId?, no, length}]}]
function purchaseHasSoldBolts(id) {
  return db.bolts.some(b => b.purchaseId === id && b.status !== 'in');
}

function savePurchase(data, existingId, opts = {}) {
  const old = existingId ? byId(db.purchases, existingId) : null;
  if (old && purchaseHasSoldBolts(old.id)) return 'مينفعش تعدل فاتورة شراء اتباع منها توبات';
  const pid = old ? old.id : uid();
  const oldIds = new Set(db.bolts.filter(b => b.purchaseId === pid).map(b => b.id));
  const lines = [];
  for (const l of data.lines) {
    const f = byId(db.fabrics, l.fabricId);
    if (!f) return 'صنف غير موجود';
    if (!l.bolts.length) return `ضيف توبات للصنف "${f.name}"`;
    const seen = new Set();
    for (const b of l.bolts) {
      const no = String(b.no).trim();
      if (!no) return `اكتب رقم كل توب في "${f.name}"`;
      if (num(b.length) <= 0) return `طول التوب رقم ${no} في "${f.name}" غير صحيح`;
      if (seen.has(no) || boltNoTaken(f.id, no, oldIds)) return `رقم التوب ${no} مكرر في "${f.name}"`;
      seen.add(no);
    }
    lines.push({ f, price: round2(l.price), bolts: l.bolts });
  }
  db.bolts = db.bolts.filter(b => b.purchaseId !== pid);
  // مصاريف النقل بتتوزع على الأمتار عشان تكلفة المتر تبقى حقيقية
  const transport = round2(data.transport);
  const allMeters = lines.reduce((a, l) => a + l.bolts.reduce((x, b) => x + num(b.length), 0), 0);
  const extra = allMeters > 0 ? transport / allMeters : 0;
  const outLines = lines.map(({ f, price, bolts }) => {
    const landed = round2(price + extra);
    f.cost = landed;
    f.buyPrice = price;
    return { fabricId: f.id, name: fabricLabel(f), unit: f.unit, price,
      bolts: bolts.map(b => {
        const id = b.boltId || uid();
        db.bolts.push({ id, fabricId: f.id, no: String(b.no).trim(), length: round2(b.length), cost: landed,
          status: 'in', source: 'purchase', purchaseId: pid, saleId: '', addedAt: data.date });
        return { boltId: id, no: String(b.no).trim(), length: round2(b.length) };
      }) };
  });
  const rec = { date: data.date, supplierId: data.supplierId, lines: outLines, discount: data.discount, paid: data.paid, paidAccount: data.paidAccount || 'cash',
    transport, transportAccount: data.transportAccount || 'cash', note: data.note };
  rec.total = round2(invSubtotal(rec) - num(rec.discount));
  if (rec.paid > rec.total) rec.paid = rec.total;
  if (old) Object.assign(old, rec);
  else {
    const no = opts.no || nextNo('purchase');
    db.counters.purchase = Math.max(db.counters.purchase || 0, no);
    db.purchases.push(Object.assign({ id: pid, no, createdAt: Date.now(), createdBy: currentUser.name }, rec));
  }
  saveDB();
  return null;
}

function deleteInvoice(kind, id) {
  if (kind === 'sale') {
    if (saleHasReturns(id)) return 'الفاتورة دي ليها مرتجع. احذف المرتجع الأول.';
    db.bolts.forEach(b => { if (b.saleId === id) { b.status = 'in'; b.saleId = ''; } });
    db.sales = db.sales.filter(s => s.id !== id);
  } else {
    if (purchaseHasSoldBolts(id)) return 'مينفعش تحذف فاتورة شراء اتباع منها توبات. احذف فواتير البيع دي الأول.';
    db.bolts = db.bolts.filter(b => b.purchaseId !== id);
    db.purchases = db.purchases.filter(p => p.id !== id);
  }
  saveDB();
  return null;
}

/* ---------- الأرصدة ----------
   حساب العميل: المدين يزود اللي عليه، والدائن يقلله. الرصيد الموجب = مدين (عليه فلوس لينا).
   حساب المورد: الدائن يزود اللي علينا له، والمدين يقلله. الرصيد الموجب = دائن (ليه فلوس عندنا).
   القيود اليدوية (adjustments): type = 'debit' | 'credit' على حساب الطرف نفسه. */
function adjustmentEffect(a, kind) {
  // بيرجع أثر القيد على "الرصيد المستحق": موجب يزوده، سالب يقلله
  const sign = kind === 'customer' ? (a.type === 'debit' ? 1 : -1) : (a.type === 'credit' ? 1 : -1);
  return sign * num(a.amount);
}

function customerBalance(id) {
  const c = byId(db.customers, id);
  let b = num(c && c.opening);
  db.sales.forEach(s => { if (s.customerId === id) b += s.total - s.paid; });
  db.payments.forEach(p => { if (p.party === 'customer' && p.partyId === id) b -= p.amount; });
  db.adjustments.forEach(a => { if (a.party === 'customer' && a.partyId === id) b += adjustmentEffect(a, 'customer'); });
  db.returns.forEach(r => { if (r.kind === 'sale' && r.partyId === id) b += num(r.refund) - r.total; });
  return round2(b);
}

function supplierBalance(id) {
  const s = byId(db.suppliers, id);
  let b = num(s && s.opening);
  db.purchases.forEach(p => { if (p.supplierId === id) b += p.total - p.paid; });
  db.payments.forEach(p => { if (p.party === 'supplier' && p.partyId === id) b -= p.amount; });
  db.adjustments.forEach(a => { if (a.party === 'supplier' && a.partyId === id) b += adjustmentEffect(a, 'supplier'); });
  db.returns.forEach(r => { if (r.kind === 'purchase' && r.partyId === id) b += num(r.refund) - r.total; });
  return round2(b);
}

/* رصيد الطرف بالمعنى المحاسبي: { amount, side: 'debit' | 'credit' | '' } */
function balanceSide(kind, bal) {
  if (!bal) return { amount: 0, side: '' };
  const positiveSide = kind === 'customer' ? 'debit' : 'credit';
  const other = positiveSide === 'debit' ? 'credit' : 'debit';
  return { amount: Math.abs(bal), side: bal > 0 ? positiveSide : other };
}
const SIDE_LABEL = { debit: 'مدين', credit: 'دائن', '': 'خالص' };

/* كشف حساب بالشكل المحاسبي: مدين | دائن | الرصيد */
function partyStatement(kind, id) {
  const isC = kind === 'customer';
  const party = byId(isC ? db.customers : db.suppliers, id);
  const rows = [];
  // inc = بيزود المستحق، dec = بيقلله
  const push = (date, desc, inc, dec, extra = {}) => rows.push(Object.assign({ date, desc, inc, dec }, extra));
  const op = num(party.opening);
  if (op) push('', 'رصيد افتتاحي', Math.max(op, 0), Math.max(-op, 0));
  (isC ? db.sales : db.purchases).forEach(inv => {
    if ((isC ? inv.customerId : inv.supplierId) !== id) return;
    const bolts = inv.lines.reduce((a, l) => a + lineBoltCount(l), 0);
    push(inv.date, `${isC ? 'فاتورة بيع' : 'فاتورة شراء'} رقم ${inv.no}${bolts ? ` (${bolts} توب)` : ''}`, inv.total, 0);
    if (inv.paid) push(inv.date, `مدفوع مع الفاتورة رقم ${inv.no}`, 0, inv.paid);
  });
  db.payments.forEach(p => {
    if (p.party !== kind || p.partyId !== id) return;
    push(p.date, (isC ? 'تحصيل نقدي' : 'سداد نقدي') + (p.note ? ` - ${p.note}` : ''), 0, p.amount);
  });
  db.adjustments.forEach(a => {
    if (a.party !== kind || a.partyId !== id) return;
    const e = adjustmentEffect(a, kind);
    push(a.date, `قيد ${a.type === 'debit' ? 'مدين' : 'دائن'}${a.note ? ` - ${a.note}` : ''}`, Math.max(e, 0), Math.max(-e, 0), { adjustmentId: a.id });
  });
  db.returns.forEach(r => {
    if (r.kind !== (isC ? 'sale' : 'purchase') || r.partyId !== id) return;
    const n = r.lines.reduce((a, l) => a + lineBoltCount(l), 0);
    push(r.date, `مرتجع رقم ${r.no} (${n} توب)`, 0, r.total);
    if (num(r.refund)) push(r.date, isC ? `فلوس رجعناها مع المرتجع رقم ${r.no}` : `فلوس رجعها المورد مع المرتجع رقم ${r.no}`, num(r.refund), 0);
  });
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let bal = 0;
  rows.forEach(r => {
    bal = round2(bal + r.inc - r.dec);
    r.debit = isC ? r.inc : r.dec;
    r.credit = isC ? r.dec : r.inc;
    r.balance = bal;
    r.side = balanceSide(kind, bal);
  });
  return rows;
}

function saveAdjustment(data, id) {
  const rec = { party: data.party, partyId: data.partyId, date: data.date, type: data.type, amount: round2(data.amount), note: data.note };
  const cur = id ? byId(db.adjustments, id) : null;
  if (cur) Object.assign(cur, rec);
  else db.adjustments.push(Object.assign({ id: uid(), createdBy: currentUser.name, createdAt: Date.now() }, rec));
  saveDB();
}

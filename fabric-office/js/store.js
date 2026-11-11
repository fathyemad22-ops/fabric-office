/* ========== تخزين البيانات ومنطق العمل ========== */
const DB_KEY = 'fabricOffice.v1';

function defaultData() {
  return {
    settings: { shopName: 'مكتب القماش', phone: '', address: '', currency: 'ج.م', invoiceNote: 'شكراً لتعاملكم معنا' },
    fabrics: [],
    customers: [],
    suppliers: [],
    sales: [],
    purchases: [],
    payments: [],
    expenses: [],
    counters: { sale: 0, purchase: 0 },
  };
}

function loadDB() {
  try {
    const raw = JSON.parse(localStorage.getItem(DB_KEY));
    if (!raw) return defaultData();
    const d = defaultData();
    Object.keys(d).forEach(k => { if (raw[k] !== undefined) d[k] = raw[k]; });
    d.settings = Object.assign(defaultData().settings, raw.settings || {});
    return d;
  } catch (e) {
    return defaultData();
  }
}

let db = loadDB();

function saveDB() {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = v => Math.round(num(v) * 100) / 100;
const byId = (list, id) => list.find(x => x.id === id);

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* ---------- الأرصدة ---------- */
// رصيد العميل الموجب = مستحق لنا عنده
function customerBalance(id) {
  const c = byId(db.customers, id);
  let b = num(c && c.opening);
  db.sales.forEach(s => { if (s.customerId === id) b += s.total - s.paid; });
  db.payments.forEach(p => { if (p.party === 'customer' && p.partyId === id) b -= p.amount; });
  return round2(b);
}

// رصيد المورد الموجب = مستحق علينا له
function supplierBalance(id) {
  const s = byId(db.suppliers, id);
  let b = num(s && s.opening);
  db.purchases.forEach(p => { if (p.supplierId === id) b += p.total - p.paid; });
  db.payments.forEach(p => { if (p.party === 'supplier' && p.partyId === id) b -= p.amount; });
  return round2(b);
}

function partyStatement(kind, id) {
  const isC = kind === 'customer';
  const party = byId(isC ? db.customers : db.suppliers, id);
  const rows = [];
  if (num(party.opening)) rows.push({ date: '', desc: 'رصيد افتتاحي', debit: num(party.opening), credit: 0 });
  (isC ? db.sales : db.purchases).forEach(inv => {
    if ((isC ? inv.customerId : inv.supplierId) !== id) return;
    rows.push({ date: inv.date, desc: `${isC ? 'فاتورة بيع' : 'فاتورة شراء'} رقم ${inv.no}`, debit: inv.total, credit: 0 });
    if (inv.paid) rows.push({ date: inv.date, desc: `مدفوع مع الفاتورة رقم ${inv.no}`, debit: 0, credit: inv.paid });
  });
  db.payments.forEach(p => {
    if (p.party !== kind || p.partyId !== id) return;
    rows.push({ date: p.date, desc: (isC ? 'تحصيل نقدي' : 'سداد نقدي') + (p.note ? ` - ${p.note}` : ''), debit: 0, credit: p.amount });
  });
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let bal = 0;
  rows.forEach(r => { bal = round2(bal + r.debit - r.credit); r.balance = bal; });
  return rows;
}

/* ---------- المخزن ---------- */
// sign: -1 للبيع (خصم من المخزن)، +1 للشراء (إضافة للمخزن)
function applyStock(lines, sign) {
  lines.forEach(l => {
    const f = byId(db.fabrics, l.fabricId);
    if (f) f.qty = round2(num(f.qty) + sign * num(l.qty));
  });
}

/* ---------- الفواتير ---------- */
// kind: 'sale' | 'purchase'. يعيد رسالة خطأ أو null
function saveInvoice(kind, data, existingId) {
  const list = kind === 'sale' ? db.sales : db.purchases;
  const sign = kind === 'sale' ? -1 : 1;
  const old = existingId ? byId(list, existingId) : null;

  if (old) applyStock(old.lines, -sign); // إلغاء أثر الفاتورة القديمة مؤقتاً

  if (kind === 'sale') {
    const need = {};
    data.lines.forEach(l => { need[l.fabricId] = (need[l.fabricId] || 0) + num(l.qty); });
    for (const fid of Object.keys(need)) {
      const f = byId(db.fabrics, fid);
      if (!f) continue;
      if (need[fid] > num(f.qty) + 1e-9) {
        if (old) applyStock(old.lines, sign);
        return `الكمية المطلوبة من "${f.name}" (${need[fid]}) أكبر من المتاح بالمخزن (${num(f.qty)})`;
      }
    }
  }

  applyStock(data.lines, sign);

  if (kind === 'purchase') {
    // تحديث سعر الشراء بآخر سعر
    data.lines.forEach(l => { const f = byId(db.fabrics, l.fabricId); if (f) f.cost = num(l.price); });
  }

  if (old) {
    Object.assign(old, data);
  } else {
    db.counters[kind] = (db.counters[kind] || 0) + 1;
    list.push(Object.assign({ id: uid(), no: db.counters[kind], createdAt: Date.now() }, data));
  }
  saveDB();
  return null;
}

function deleteInvoice(kind, id) {
  const list = kind === 'sale' ? db.sales : db.purchases;
  const inv = byId(list, id);
  if (!inv) return;
  applyStock(inv.lines, kind === 'sale' ? 1 : -1);
  list.splice(list.indexOf(inv), 1);
  saveDB();
}

/* ---------- بيانات تجريبية ---------- */
function seedDemo() {
  db = defaultData();
  const sup1 = { id: uid(), name: 'مصانع المحلة للغزل', phone: '01000000001', address: 'المحلة الكبرى', opening: 0 };
  const sup2 = { id: uid(), name: 'شركة النيل للأقمشة', phone: '01000000002', address: 'شبرا الخيمة', opening: 0 };
  db.suppliers.push(sup1, sup2);
  const cust = [
    { id: uid(), name: 'أتيليه الأميرة', phone: '01100000001', address: 'وسط البلد', opening: 0 },
    { id: uid(), name: 'ورشة الحاج محمود', phone: '01100000002', address: 'الموسكي', opening: 1500 },
    { id: uid(), name: 'محل الشروق للملابس', phone: '01100000003', address: 'المنصورة', opening: 0 },
  ];
  db.customers.push(...cust);
  const fabrics = [
    ['C-101', 'قطن مصري سادة', 'قطن', 'أبيض', 'متر', 0, 45, 65, 50, sup1.id],
    ['C-102', 'قطن بوبلين', 'قطن', 'لبني', 'متر', 0, 55, 80, 40, sup1.id],
    ['S-201', 'حرير طبيعي', 'حرير', 'بيج', 'متر', 0, 180, 260, 20, sup2.id],
    ['CH-301', 'شيفون سادة', 'شيفون', 'أسود', 'متر', 0, 35, 55, 60, sup2.id],
    ['L-401', 'كتان لينن', 'كتان', 'زيتي', 'متر', 0, 90, 130, 30, sup1.id],
    ['J-501', 'جينز ثقيل', 'جينز', 'أزرق', 'متر', 0, 70, 100, 40, sup2.id],
    ['ST-601', 'ستان لامع', 'ستان', 'نبيتي', 'متر', 0, 40, 60, 50, sup2.id],
  ];
  fabrics.forEach(([code, name, type, color, unit, qty, cost, price, min, supplierId]) =>
    db.fabrics.push({ id: uid(), code, name, type, color, unit, qty, cost, price, minQty: min, supplierId, notes: '' }));

  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const F = db.fabrics;
  const mkLines = arr => arr.map(([f, q, p]) => ({ fabricId: f.id, name: f.name, unit: f.unit, qty: q, price: p, cost: f.cost }));
  const tot = (lines, disc) => round2(lines.reduce((s, l) => s + l.qty * l.price, 0) - disc);

  let L = mkLines([[F[0], 300, 45], [F[1], 200, 55], [F[4], 150, 90]]);
  saveInvoice('purchase', { supplierId: sup1.id, date: d(20), lines: L, discount: 0, total: tot(L, 0), paid: 20000, note: '' });
  L = mkLines([[F[2], 80, 180], [F[3], 250, 35], [F[5], 120, 70], [F[6], 200, 40]]);
  saveInvoice('purchase', { supplierId: sup2.id, date: d(18), lines: L, discount: 400, total: tot(L, 400), paid: 30000, note: '' });

  const sale = (c, days, arr, disc, paidAll) => {
    const lines = arr.map(([f, q]) => ({ fabricId: f.id, name: f.name, unit: f.unit, qty: q, price: f.price, cost: f.cost }));
    const total = tot(lines, disc);
    saveInvoice('sale', { customerId: c ? c.id : '', date: d(days), lines, discount: disc, total, paid: paidAll ? total : Math.round(total / 2), note: '' });
  };
  sale(cust[0], 15, [[F[2], 12], [F[3], 30]], 0, false);
  sale(cust[1], 10, [[F[0], 80], [F[1], 50]], 200, false);
  sale(null, 6, [[F[6], 15]], 0, true);
  sale(cust[2], 3, [[F[5], 60], [F[4], 25]], 0, true);
  sale(cust[0], 1, [[F[2], 50], [F[3], 25]], 100, false);
  sale(null, 0, [[F[0], 10], [F[3], 8]], 0, true);

  db.payments.push({ id: uid(), party: 'customer', partyId: cust[1].id, date: d(5), amount: 2000, note: 'دفعة تحت الحساب' });
  db.payments.push({ id: uid(), party: 'supplier', partyId: sup2.id, date: d(4), amount: 5000, note: '' });
  db.expenses.push({ id: uid(), date: d(12), category: 'إيجار', amount: 6000, note: 'إيجار المحل' });
  db.expenses.push({ id: uid(), date: d(2), category: 'نقل وشحن', amount: 450, note: '' });
  saveDB();
}

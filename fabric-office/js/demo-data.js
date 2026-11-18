/* بيانات تجريبية للاختبار فقط — الملف ده مش متحمّل في السيستم الرسمي */
/* ---------- بيانات تجريبية ---------- */
function seedDemo() {
  const keepSettings = db.settings;
  const fresh = defaultData();
  fresh.settings = keepSettings;
  Object.keys(fresh).forEach(k => { db[k] = fresh[k]; });
  const d0 = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  const sup1 = { id: uid(), name: 'مصانع المحلة للغزل', phone: '01000000001', address: 'المحلة الكبرى', opening: 0, notes: '' };
  const sup2 = { id: uid(), name: 'شركة النيل للأقمشة', phone: '01000000002', address: 'شبرا الخيمة', opening: 0, notes: '' };
  db.suppliers.push(sup1, sup2);
  const cust = [
    { id: uid(), name: 'أتيليه الأميرة', phone: '01100000001', address: 'وسط البلد', opening: 0, notes: '' },
    { id: uid(), name: 'ورشة الحاج محمود', phone: '01100000002', address: 'الموسكي', opening: 15000, notes: '', createdAt: d0(40) },
    { id: uid(), name: 'محل الشروق للملابس', phone: '01100000003', address: 'المنصورة', opening: 0, notes: '' },
  ];
  db.customers.push(...cust);
  // خامة ← رسمة ← 4 ألوان
  [
    ['فورتي', 'A2', ['برجندي', 'كحلي', 'أسود', 'زيتي'], 62, 50, sup1.id],
    ['فورتي', 'B7', ['بيج', 'رمادي', 'أوف وايت', 'نبيتي'], 64, 51, sup1.id],
    ['كريب', 'C1', ['أسود', 'كحلي', 'موف', 'بترولي'], 65, 52, sup2.id],
  ].forEach(([name, code, colors, price, cost, supplierId]) => colors.forEach(color =>
    db.fabrics.push({ id: uid(), name, code, color, type: '', unit: 'متر', price, cost, buyPrice: cost, minBolts: 3, supplierId, notes: '' })));
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const F = db.fabrics;
  db.settings.accountOpening = { cash: 120000, vf: 40000 };
  const mk = (start, n, len, odd = []) => Array.from({ length: n }, (_, i) => ({ no: String(start + i), length: odd[i] || len }));
  savePurchase({ supplierId: sup1.id, date: d(30), discount: 0, paid: 60000, paidAccount: 'cash', transport: 1200, transportAccount: 'cash', note: '',
    lines: F.slice(0, 8).map((f, i) => ({ fabricId: f.id, price: f.cost, bolts: mk(1, 8, 50, i === 0 ? [48, 52] : []) })) });
  savePurchase({ supplierId: sup2.id, date: d(25), discount: 0, paid: 40000, paidAccount: 'vf', transport: 600, transportAccount: 'cash', note: '',
    lines: F.slice(8).map(f => ({ fabricId: f.id, price: f.cost, bolts: mk(1, 6, 50) })) });

  const pick = (f, n) => boltsInStock(f.id).slice(0, n).map(b => b.id);
  const sale = (c, days, arr, paidPct, acc = 'cash') => {
    const lines = arr.map(([f, n, price]) => ({ fabricId: f.id, price: price || f.price, boltIds: pick(f, n) }));
    const total = round2(lines.reduce((a, l) => a + l.price * l.boltIds.reduce((s, id) => s + byId(db.bolts, id).length, 0), 0));
    saveSale({ customerId: c ? c.id : '', date: d(days), lines, discount: 0, paid: c ? Math.round(total * paidPct) : total, paidAccount: acc, note: '' });
  };
  sale(cust[0], 24, [[F[0], 4, 63], [F[1], 3, 63]], 0.5);
  sale(cust[1], 20, [[F[8], 5, 64], [F[9], 2, 64]], 0.6, 'vf');
  sale(null, 9, [[F[4], 2]], 1);
  sale(cust[2], 6, [[F[10], 3], [F[11], 2]], 1, 'vf');
  sale(cust[0], 2, [[F[2], 2, 62]], 0.5);
  sale(null, 0, [[F[5], 1]], 1);
  db.payments.push({ id: uid(), party: 'customer', partyId: cust[1].id, date: d(12), amount: 10000, accountId: 'vf', note: 'قسط' });
  db.payments.push({ id: uid(), party: 'supplier', partyId: sup2.id, date: d(4), amount: 5000, accountId: 'cash', note: '' });
  db.expenses.push({ id: uid(), date: d(12), category: 'إيجار', amount: 6000, note: 'إيجار المحل' });
  db.expenses.push({ id: uid(), date: d(2), category: 'نقل وشحن', amount: 450, note: '' });
  db.adjustments.push({ id: uid(), party: 'customer', partyId: cust[0].id, date: d(7), type: 'credit', amount: 500, note: 'خصم على عيب في توب' });
  db.adjustments.push({ id: uid(), party: 'supplier', partyId: sup1.id, date: d(8), type: 'debit', amount: 300, note: 'مصاريف نقل دفعناها على حساب المورد' });
  saveDB();
}

/* ========== التقارير والإعدادات والموظفين ========== */
const reportRange = { from: '', to: '' };

function renderReports(view) {
  if (!reportRange.from) { reportRange.from = todayISO().slice(0, 8) + '01'; reportRange.to = todayISO(); }
  const { from, to } = reportRange;
  const inRange = d => d >= from && d <= to;
  const sales = db.sales.filter(s => inRange(s.date));
  const purchases = db.purchases.filter(p => inRange(p.date));
  const expenses = db.expenses.filter(x => inRange(x.date));
  const pays = db.payments.filter(p => inRange(p.date));

  const gross = sales.reduce((a, s) => a + invSubtotal(s), 0);
  const discounts = sales.reduce((a, s) => a + num(s.discount), 0);
  const net = sales.reduce((a, s) => a + s.total, 0);
  const cost = sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + lineCost(l), 0), 0);
  const profit = net - cost;
  const expTotal = expenses.reduce((a, x) => a + x.amount, 0);
  const purTotal = purchases.reduce((a, p) => a + p.total, 0);
  const boltsSold = sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + lineBoltCount(l), 0), 0);
  const metersSold = sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + lineMeters(l), 0), 0);
  const cashIn = sales.reduce((a, s) => a + s.paid, 0) + pays.filter(p => p.party === 'customer').reduce((a, p) => a + p.amount, 0);
  const cashOut = purchases.reduce((a, p) => a + p.paid, 0) + pays.filter(p => p.party === 'supplier').reduce((a, p) => a + p.amount, 0) + expTotal;

  const byFabric = {};
  sales.forEach(s => s.lines.forEach(l => {
    const r = byFabric[l.fabricId] = byFabric[l.fabricId] || { name: l.name, unit: l.unit, bolts: 0, meters: 0, revenue: 0, profit: 0 };
    r.bolts += lineBoltCount(l); r.meters += lineMeters(l); r.revenue += lineTotal(l); r.profit += lineTotal(l) - lineCost(l);
  }));
  const topFabrics = Object.values(byFabric).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const maxRev = Math.max(1, ...topFabrics.map(f => f.revenue));

  const byCust = {};
  sales.forEach(s => {
    const n = partyName('customer', s.customerId);
    byCust[n] = byCust[n] || { total: 0, bolts: 0 };
    byCust[n].total += s.total; byCust[n].bolts += s.lines.reduce((a, l) => a + lineBoltCount(l), 0);
  });
  const topCust = Object.entries(byCust).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
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
        ${statCard('صافي المبيعات', `${money(net)}<small>${boltsSold} توب — ${fmt(metersSold)} متر</small>`)}
        ${statCard('تكلفة التوبات المباعة', money(cost))}
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
          ${topFabrics.length ? `<table class="table compact"><thead><tr><th>الصنف</th><th>التوبات</th><th>المبيعات</th><th>الربح</th></tr></thead><tbody>
            ${topFabrics.map(f => `<tr><td>${esc(f.name)}<div class="bar"><i style="width:${(f.revenue / maxRev * 100).toFixed(1)}%"></i></div></td><td>${f.bolts} <small class="muted">(${fmt(f.meters)} ${esc(f.unit)})</small></td><td>${money(f.revenue)}</td><td>${money(f.profit)}</td></tr>`).join('')}
          </tbody></table>` : emptyState('لا توجد مبيعات في الفترة')}
        </section>
        <section class="card">
          <div class="card-head"><h3>المبيعات حسب العميل</h3></div>
          ${topCust.length ? `<table class="table compact"><thead><tr><th>العميل</th><th>التوبات</th><th>المبيعات</th></tr></thead><tbody>
            ${topCust.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.bolts}</td><td>${money(v.total)}</td></tr>`).join('')}
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
  const online = Backend.isOnline();
  view.innerHTML = `
    <section class="card">
      <div class="card-head"><h3>بيانات المكتب (بتظهر في الفواتير والواتساب)</h3></div>
      <form id="setForm" class="form-grid">
        ${field('اسم المكتب', 'shopName', s.shopName, { required: true })}
        ${field('التليفون', 'phone', s.phone, { attrs: 'dir="ltr"' })}
        ${field('العنوان', 'address', s.address)}
        ${field('العملة', 'currency', s.currency)}
        ${field('رسالة أسفل الفاتورة', 'invoiceNote', s.invoiceNote)}
        <div class="form-actions field-full"><button class="btn btn-primary" type="submit">حفظ البيانات</button></div>
      </form>
    </section>

    ${online ? `
    <section class="card">
      <div class="card-head"><h3>الموظفين والصلاحيات</h3><button class="btn btn-primary btn-sm" id="addUser">+ موظف جديد</button></div>
      <div id="usersList"></div>
    </section>` : ''}

    <section class="card">
      <div class="card-head"><h3>التشغيل أونلاين</h3><span class="badge ${online ? 'ok' : 'warn'}">${online ? 'متصل أونلاين' : 'على الجهاز ده بس'}</span></div>
      ${online ? `<p class="muted">النظام شغال أونلاين: البيانات متزامنة بين كل الأجهزة، وكل موظف بيدخل بحسابه. ولو النت قطع، تقدر تكمل شغل عادي والبيانات هتتبعت لما النت يرجع.</p>
        ${window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey ? '' : '<button class="btn btn-ghost-danger" id="fbDisconnect">فصل الربط على الجهاز ده</button>'}`
      : `<p class="muted">عشان تفتح النظام من أكتر من جهاز (موبايل، لابتوب، كمبيوتر المحل) وتعمل حسابات للموظفين، اربطه بـ Firebase (مجاني). الخطوات بالتفصيل في ملف <b>SETUP_ONLINE.md</b>.</p>
        <label class="field"><span>الصق بيانات Firebase (firebaseConfig) هنا</span><textarea id="fbConfig" rows="5" dir="ltr" placeholder='{ apiKey: "...", authDomain: "...", projectId: "...", ... }'></textarea></label>
        <div class="row-actions"><button class="btn btn-primary" id="fbConnect">ربط وتشغيل أونلاين</button></div>
        <p class="muted small">ملاحظة: البيانات الموجودة دلوقتي على الجهاز ده مش هتتنقل لوحدها. اعمل نسخة احتياطية الأول، وبعد الربط والدخول استرجعها من نفس الشاشة دي.</p>`}
    </section>

    <section class="card">
      <div class="card-head"><h3>النسخ الاحتياطي</h3></div>
      <p class="muted">اعمل نسخة احتياطية بشكل دوري واحتفظ بالملف في مكان آمن (فلاشة أو جوجل درايف).</p>
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

  if (online) {
    drawUsers();
    $('#addUser').onclick = () => openUserForm();
    if ($('#fbDisconnect')) $('#fbDisconnect').onclick = async () => {
      if (!(await confirmDialog('فصل الربط الأونلاين على الجهاز ده؟ البيانات الأونلاين مش هتتمسح.', 'فصل'))) return;
      localStorage.removeItem('fabricOffice.firebaseConfig');
      await Backend.signOut(); location.reload();
    };
  } else {
    $('#fbConnect').onclick = () => {
      const cfg = parseFirebaseConfig($('#fbConfig').value);
      if (!cfg) return toast('البيانات دي مش مظبوطة. انسخ الجزء اللي فيه apiKey و projectId كامل.', 'error');
      localStorage.setItem('fabricOffice.firebaseConfig', JSON.stringify(cfg));
      toast('تم الربط — هيتم فتح شاشة الدخول');
      setTimeout(() => location.reload(), 800);
    };
  }

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
      const raw = JSON.parse(await file.text());
      if (!Array.isArray(raw.fabrics) || !Array.isArray(raw.sales)) throw new Error('bad');
      if (!(await confirmDialog('استرجاع النسخة هيستبدل كل البيانات الحالية. متأكد؟', 'استرجاع'))) return;
      const data = normalizeData(raw);
      Object.keys(data).forEach(k => { db[k] = data[k]; });
      saveDB(); toast('تم استرجاع النسخة الاحتياطية'); render();
    } catch (err) {
      toast('الملف ده مش نسخة احتياطية صحيحة', 'error');
    } finally { e.target.value = ''; }
  };
  $('#demoBtn').onclick = async () => {
    if (await confirmDialog('البيانات التجريبية هتستبدل كل البيانات الحالية. متأكد؟', 'تحميل')) { seedDemo(); toast('تم تحميل بيانات تجريبية'); location.hash = '#dashboard'; render(); }
  };
  $('#wipeBtn').onclick = async () => {
    if (await confirmDialog('هيتم مسح كل البيانات نهائياً. يفضل تعمل نسخة احتياطية الأول. متأكد؟', 'مسح الكل')) {
      const fresh = defaultData(); fresh.settings = db.settings;
      Object.keys(fresh).forEach(k => { db[k] = fresh[k]; });
      saveDB(); toast('تم مسح البيانات'); location.hash = '#dashboard'; render();
    }
  };
}

/* يقبل الكود اللي Firebase بيديه (const firebaseConfig = {...}) أو JSON */
function parseFirebaseConfig(text) {
  const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const cfg = {};
  keys.forEach(k => {
    const m = text.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    if (m) cfg[k] = m[1];
  });
  return cfg.apiKey && cfg.projectId && cfg.appId ? cfg : null;
}

/* ---------- الموظفين ---------- */
function drawUsers() {
  const box = $('#usersList');
  if (!box) return;
  const users = [...Backend.users].sort((a, b) => (a.role === 'owner' ? -1 : 1) - (b.role === 'owner' ? -1 : 1));
  box.innerHTML = users.length ? `<div class="table-wrap"><table class="table compact">
    <thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الصلاحيات</th><th>الحالة</th><th></th></tr></thead>
    <tbody>${users.map(u => `<tr>
      <td><b>${esc(u.name)}</b></td>
      <td dir="ltr" class="text-end">${esc(u.login || u.email)}</td>
      <td class="small">${u.role === 'owner' ? '<span class="badge ok">صاحب المكتب — كل الصلاحيات</span>' : PERMS.filter(([k]) => u.perms && u.perms[k]).map(([, l]) => esc(l)).join('، ') || '<span class="muted">عرض فقط</span>'}</td>
      <td>${u.active ? '<span class="badge ok">شغال</span>' : '<span class="badge danger">موقوف</span>'}</td>
      <td class="actions">${u.role === 'owner' ? '' : `<button class="btn btn-sm" data-edit="${u.uid}">تعديل</button>
        <button class="btn btn-sm ${u.active ? 'btn-ghost-danger' : ''}" data-toggle="${u.uid}">${u.active ? 'إيقاف' : 'تشغيل'}</button>`}</td>
    </tr>`).join('')}</tbody></table></div>` : emptyState('جاري التحميل...');
  box.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    const u = Backend.users.find(x => x.uid === (t.dataset.edit || t.dataset.toggle));
    if (t.dataset.edit) openUserForm(u);
    if (t.dataset.toggle) {
      try { await Backend.updateUser(u.uid, { active: !u.active }); toast(u.active ? 'تم إيقاف الحساب' : 'تم تشغيل الحساب'); }
      catch (err) { toast('حصلت مشكلة', 'error'); }
    }
  };
}

function openUserForm(u) {
  const perms = u ? (u.perms || {}) : { sales: true };
  openModal(u ? `تعديل: ${u.name}` : 'موظف جديد', `
    <form id="userForm" class="form-grid">
      ${field('اسم الموظف', 'name', u ? u.name : '', { required: true })}
      ${u ? `<p class="muted">اسم الدخول: <b dir="ltr">${esc(u.login || u.email)}</b></p>` : `
        ${field('اسم الدخول', 'login', '', { required: true, attrs: 'dir="ltr" autocomplete="off"', hint: 'بالإنجليزي، مثلاً ahmed — أو إيميل' })}
        ${field('كلمة السر', 'password', '', { type: 'text', required: true, attrs: 'minlength="6" autocomplete="off"', hint: '6 حروف أو أكتر — بلغها للموظف' })}`}
      <fieldset class="field-full perms">
        <legend>الصلاحيات</legend>
        ${PERMS.map(([k, l]) => `<label class="check"><input type="checkbox" name="perm_${k}" ${perms[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
        <small class="muted">أي موظف يقدر يشوف المخزن والعملاء وفواتير البيع. الصلاحيات دي بتحدد هو يقدر يعمل إيه زيادة.</small>
      </fieldset>
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">${u ? 'حفظ' : 'إنشاء الحساب'}</button>
        ${u && !(u.email || '').endsWith(LOGIN_DOMAIN) ? '<button class="btn" type="button" id="resetPw">إرسال رابط تغيير كلمة السر</button>' : ''}
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`);
  const form = $('#userForm');
  if ($('#resetPw')) $('#resetPw').onclick = async () => {
    try { await Backend.sendReset(u.email); toast('تم إرسال الرابط على إيميل الموظف'); } catch (e) { toast('مقدرتش أبعت الرابط', 'error'); }
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const d = formData(form);
    const p = {};
    PERMS.forEach(([k]) => { p[k] = !!d['perm_' + k]; });
    e.submitter.disabled = true;
    try {
      if (u) await Backend.updateUser(u.uid, { name: d.name.trim(), perms: p });
      else await Backend.createEmployee({ name: d.name.trim(), login: d.login, password: d.password, perms: p });
      closeModal(); toast(u ? 'تم الحفظ' : 'تم إنشاء حساب الموظف');
    } catch (err) {
      e.submitter.disabled = false;
      toast({ 'auth/email-already-in-use': 'اسم الدخول ده مستخدم قبل كده', 'auth/weak-password': 'كلمة السر لازم 6 حروف على الأقل', 'auth/invalid-email': 'اسم الدخول لازم يكون حروف إنجليزي وأرقام بس' }[err.code] || 'حصلت مشكلة، جرب تاني', 'error');
    }
  };
}

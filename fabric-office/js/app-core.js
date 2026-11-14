/* ========== التنقل والدخول والرئيسية ========== */
const FABRIC_TYPES = ['قطن', 'حرير', 'كتان', 'شيفون', 'ستان', 'جينز', 'صوف', 'بوليستر', 'دانتيل', 'تريكو', 'قطيفة', 'أخرى'];
const UNITS = ['متر', 'ياردة'];
const EXPENSE_CATS = ['إيجار', 'مرتبات', 'كهرباء ومياه', 'نقل وشحن', 'صيانة', 'نثريات'];

const routes = {
  dashboard: { title: 'الرئيسية', render: v => renderDashboard(v), allow: () => true },
  fabrics: { title: 'الأقمشة والتوبات', render: v => renderFabrics(v), allow: () => true },
  sales: { title: 'فواتير البيع', render: () => renderInvoices('sale'), allow: () => true },
  purchases: { title: 'فواتير الشراء', render: () => renderInvoices('purchase'), allow: () => can('purchases') },
  customers: { title: 'العملاء', render: () => renderParties('customer'), allow: () => true },
  suppliers: { title: 'الموردين', render: () => renderParties('supplier'), allow: () => can('purchases') || can('parties') },
  ledger: { title: 'الدائنون والمدينون', render: v => renderLedger(v), allow: () => true },
  payments: { title: 'التحصيل والسداد', render: v => renderPayments(v), allow: () => can('payments') },
  expenses: { title: 'المصروفات', render: v => renderExpenses(v), allow: () => can('expenses') },
  reports: { title: 'التقارير', render: v => renderReports(v), allow: () => can('reports') },
  settings: { title: 'الإعدادات', render: v => renderSettings(v), allow: () => isOwner() },
};

function currentRoute() {
  const r = location.hash.slice(1);
  return routes[r] && routes[r].allow() ? r : 'dashboard';
}

function render() {
  const r = currentRoute();
  const shop = db.settings.shopName || 'مكتب القماش';
  $('#pageTitle').textContent = routes[r].title;
  $('#brandName').textContent = shop;
  document.title = `${routes[r].title} | ${shop}`;
  $$('#nav a').forEach(a => {
    a.hidden = !routes[a.dataset.route].allow();
    a.classList.toggle('active', a.dataset.route === r);
  });
  $('[data-quick="sale"]').hidden = !can('sales');
  routes[r].render($('#view'));
  document.body.classList.remove('nav-open');
}

/* إعادة الرسم لما البيانات تتغير من جهاز تاني، من غير ما نقطع الكتابة */
let pendingRender = false;
function remoteRender() {
  const a = document.activeElement;
  if (a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) {
    if (!pendingRender) {
      pendingRender = true;
      a.addEventListener('blur', () => { pendingRender = false; render(); }, { once: true });
    }
    return;
  }
  render();
}

function partyName(kind, id) {
  if (!id) return kind === 'customer' ? 'عميل نقدي' : '—';
  const p = byId(kind === 'customer' ? db.customers : db.suppliers, id);
  return p ? p.name : '(محذوف)';
}

const boltsLabel = (count, meters, unit = 'متر') => `${count} توب${count ? ` (${fmt(meters)} ${unit})` : ''}`;

/* =====================================================
   الرئيسية
   ===================================================== */
function renderDashboard(view) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const showMoney = can('reports');

  if (!db.fabrics.length && !db.customers.length) {
    view.innerHTML = `
      <div class="welcome card">
        <h2>أهلاً بيك في نظام مكتب القماش 👋</h2>
        <p>ابدأ بإضافة أصناف القماش وتوباتها (رقم وطول كل توب)، وبعدها العملاء والموردين. مع كل فاتورة بيع أو شراء المخزن والحسابات بيتحدثوا لوحدهم.</p>
        <div class="row-actions">
          ${can('stock') ? '<a class="btn btn-primary" href="#fabrics">إضافة أول صنف</a>' : ''}
          ${isOwner() ? '<button class="btn" id="seedBtn">تجربة النظام ببيانات تجريبية</button>' : ''}
        </div>
      </div>`;
    if ($('#seedBtn')) $('#seedBtn').onclick = () => { seedDemo(); toast('تم تحميل بيانات تجريبية'); render(); };
    return;
  }

  const todaySales = db.sales.filter(s => s.date === today);
  const monthSales = db.sales.filter(s => s.date.startsWith(month));
  const boltsSoldToday = todaySales.reduce((a, s) => a + s.lines.reduce((b, l) => b + lineBoltCount(l), 0), 0);
  const inStock = db.bolts.filter(b => b.status === 'in');
  const stockValue = inStock.reduce((a, b) => a + num(b.length) * num(b.cost), 0);
  const receivable = db.customers.reduce((a, c) => a + Math.max(0, customerBalance(c.id)), 0);
  const payable = db.suppliers.reduce((a, s) => a + Math.max(0, supplierBalance(s.id)), 0);
  const low = db.fabrics.map(f => ({ f, s: stockOf(f.id) })).filter(x => x.s.count <= num(x.f.minBolts));
  const recent = [...db.sales].sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no).slice(0, 6);
  const debtors = db.customers.map(c => ({ c, b: customerBalance(c.id) })).filter(x => x.b > 0).sort((a, b) => b.b - a.b).slice(0, 6);

  view.innerHTML = `
    <div class="stats">
      ${statCard('مبيعات اليوم', `${money(todaySales.reduce((a, s) => a + s.total, 0))}<small>${boltsSoldToday} توب</small>`)}
      ${statCard('مبيعات الشهر', money(monthSales.reduce((a, s) => a + s.total, 0)))}
      ${statCard('التوبات في المخزن', `${inStock.length} توب<small>${fmt(inStock.reduce((a, b) => a + num(b.length), 0))} متر</small>`)}
      ${showMoney ? statCard('قيمة المخزن (بسعر الشراء)', money(stockValue)) : ''}
      ${statCard('مستحق لنا عند العملاء', money(receivable), 'accent')}
      ${showMoney || can('purchases') ? statCard('مستحق علينا للموردين', money(payable), 'warn') : ''}
      ${statCard('أصناف قاربت على النفاد', low.length, low.length ? 'danger' : '')}
    </div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>آخر فواتير البيع</h3><a href="#sales">عرض الكل</a></div>
        ${recent.length ? `<table class="table compact"><thead><tr><th>رقم</th><th>التاريخ</th><th>العميل</th><th>التوبات</th><th>الإجمالي</th></tr></thead><tbody>
          ${recent.map(s => `<tr><td>${s.no}</td><td>${fmtDate(s.date)}</td><td>${esc(partyName('customer', s.customerId))}</td><td>${s.lines.reduce((a, l) => a + lineBoltCount(l), 0)}</td><td>${money(s.total)}</td></tr>`).join('')}
        </tbody></table>` : emptyState('لا توجد فواتير بيع بعد')}
      </section>
      <section class="card">
        <div class="card-head"><h3>تنبيهات المخزن</h3><a href="#fabrics">المخزن</a></div>
        ${low.length ? `<table class="table compact"><thead><tr><th>الصنف</th><th>المتاح</th><th>الحد الأدنى</th></tr></thead><tbody>
          ${low.map(x => `<tr><td>${esc(x.f.name)} <small class="muted">${esc(x.f.color)}</small></td><td class="text-danger">${boltsLabel(x.s.count, x.s.meters, x.f.unit)}</td><td>${fmt(x.f.minBolts)} توب</td></tr>`).join('')}
        </tbody></table>` : emptyState('كل الأصناف كمياتها كويسة ✅')}
      </section>
      <section class="card">
        <div class="card-head"><h3>أكبر المديونيات على العملاء</h3><a href="#customers">العملاء</a></div>
        ${debtors.length ? `<table class="table compact"><thead><tr><th>العميل</th><th>التليفون</th><th>الرصيد</th></tr></thead><tbody>
          ${debtors.map(x => `<tr><td>${esc(x.c.name)}</td><td dir="ltr" class="text-end">${esc(x.c.phone)}</td><td class="text-accent">${money(x.b)}</td></tr>`).join('')}
        </tbody></table>` : emptyState('مفيش مديونيات على العملاء')}
      </section>
    </div>`;
}

/* =====================================================
   شاشة الدخول (في الوضع الأونلاين)
   ===================================================== */
function showLogin(message = '') {
  document.body.classList.add('auth-mode');
  $('#authScreen').hidden = false;
  $('#authScreen').innerHTML = `
    <div class="auth-card card">
      <div class="brand-mark big">🧵</div>
      <h1>نظام مكتب القماش</h1>
      <div id="authMsg" class="auth-msg ${message ? 'show' : ''}">${esc(message)}</div>
      <form id="loginForm" class="auth-form">
        ${field('اسم المستخدم أو الإيميل', 'login', '', { required: true, attrs: 'dir="ltr" autocomplete="username"' })}
        ${field('كلمة السر', 'password', '', { type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
        <button class="btn btn-primary" type="submit">دخول</button>
      </form>
      <details class="auth-first">
        <summary>أول مرة؟ إنشاء حساب صاحب المكتب</summary>
        <form id="ownerForm" class="auth-form">
          ${field('اسمك', 'name', '', { required: true })}
          ${field('اسم المستخدم أو الإيميل', 'login', '', { required: true, attrs: 'dir="ltr" autocomplete="username"' })}
          ${field('كلمة السر (6 حروف أو أكتر)', 'password', '', { type: 'password', required: true, attrs: 'minlength="6" autocomplete="new-password"' })}
          <button class="btn" type="submit">إنشاء حساب صاحب المكتب</button>
          <small class="muted">الحساب ده بيتعمل مرة واحدة بس. الموظفين بيتعملهم حسابات من الإعدادات.</small>
        </form>
      </details>
    </div>`;

  const setMsg = m => { const el = $('#authMsg'); el.textContent = m; el.classList.toggle('show', !!m); };
  const errText = e => ({
    'auth/invalid-credential': 'اسم المستخدم أو كلمة السر غلط',
    'auth/wrong-password': 'كلمة السر غلط',
    'auth/user-not-found': 'الحساب ده مش موجود',
    'auth/invalid-email': 'اسم المستخدم مكتوب بشكل غير صحيح',
    'auth/email-already-in-use': 'اسم المستخدم ده مستخدم قبل كده',
    'auth/weak-password': 'كلمة السر ضعيفة — لازم 6 حروف على الأقل',
    'auth/network-request-failed': 'مفيش اتصال بالإنترنت',
    'auth/too-many-requests': 'محاولات كتير — استنى شوية وجرب تاني',
    'auth/operation-not-allowed': 'لازم تفعّل الدخول بـ Email/Password من Firebase (الخطوة 3 في دليل التشغيل)',
  }[e.code] || (String(e.code).includes('api-key') ? 'بيانات الربط بـ Firebase غلط — راجع firebaseConfig' : '') || (e.message === 'owner-exists' ? 'حساب صاحب المكتب اتعمل قبل كده. اطلب منه يعملك حساب.' : 'حصلت مشكلة، جرب تاني'));

  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const d = formData(e.target);
    setMsg('');
    e.submitter.disabled = true;
    try { await Backend.signIn(d.login, d.password); } catch (err) { setMsg(errText(err)); e.submitter.disabled = false; }
  };
  $('#ownerForm').onsubmit = async e => {
    e.preventDefault();
    const d = formData(e.target);
    setMsg('');
    e.submitter.disabled = true;
    try {
      const u = await Backend.signupOwner(d.name.trim(), d.login, d.password);
      await onSignedIn(u);
    } catch (err) { setMsg(errText(err)); e.submitter.disabled = false; }
  };
}

function hideLogin() {
  document.body.classList.remove('auth-mode');
  $('#authScreen').hidden = true;
  $('#authScreen').innerHTML = '';
}

async function onSignedIn(user) {
  const prof = await Backend.loadProfile(user).catch(() => null);
  if (!prof) { await Backend.signOut(); return showLogin('الحساب ده مش مسجل في المكتب. كلم صاحب المكتب.'); }
  if (!prof.active) { await Backend.signOut(); return showLogin('الحساب ده متوقف. كلم صاحب المكتب.'); }
  currentUser = prof;
  $('#view').innerHTML = '<p class="muted loading">جاري تحميل البيانات...</p>';
  hideLogin();
  updateUserBar();
  await Backend.subscribe();
  render();
}

function updateUserBar() {
  const bar = $('#userBar');
  if (!Backend.isOnline()) { bar.hidden = true; return; }
  bar.hidden = false;
  const online = navigator.onLine;
  bar.innerHTML = `
    <span class="net ${online ? 'on' : 'off'}" title="${online ? 'متصل' : 'مفيش نت — هيتحفظ لما النت يرجع'}">${online ? '● متصل' : '● أوفلاين'}</span>
    <span class="user-name">${esc(currentUser.name)}</span>
    <button class="btn btn-sm" id="logoutBtn">خروج</button>`;
  $('#logoutBtn').onclick = async () => { await Backend.signOut(); location.reload(); };
}

/* =====================================================
   تشغيل
   ===================================================== */
async function boot() {
  window.addEventListener('hashchange', render);
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) closeModal();
    if (e.target.id === 'modalBackdrop') closeModal();
    if (e.target.closest('[data-quick="sale"]')) openSaleForm();
  });
  $('#modalClose').onclick = closeModal;
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modalBackdrop').hidden) closeModal(); });
  window.addEventListener('online', updateUserBar);
  window.addEventListener('offline', updateUserBar);

  let mode;
  try { mode = await Backend.init(); } catch (e) {
    $('#view').innerHTML = emptyState('مش قادر يتصل بالإنترنت لتحميل النظام الأونلاين. اتأكد من النت وافتح الصفحة تاني.');
    return;
  }
  if (mode === 'local') {
    window.addEventListener('storage', e => { if (e.key === LOCAL_KEY) { db = loadLocal(); render(); } });
    updateUserBar();
    render();
    return;
  }
  Backend.onRemoteChange = remoteRender;
  Backend.auth.onAuthStateChanged(user => {
    if (Backend.signingUp) return;
    if (user) onSignedIn(user); else showLogin();
  });
}

document.addEventListener("DOMContentLoaded", boot);

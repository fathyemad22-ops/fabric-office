/* ========== الحفظ: محلي على الجهاز أو أونلاين (Firebase) ========== */
const LOCAL_OWNER = { uid: 'local', name: 'صاحب المكتب', role: 'owner', perms: {} };
let currentUser = LOCAL_OWNER;

const PERMS = [
  ['sales', 'عمل فواتير بيع'],
  ['purchases', 'فواتير الشراء والموردين'],
  ['stock', 'إدارة الأصناف والتوبات'],
  ['parties', 'إضافة وتعديل العملاء والموردين'],
  ['payments', 'التحصيل والسداد'],
  ['expenses', 'المصروفات'],
  ['reports', 'التقارير والأرباح وأسعار الشراء'],
  ['edit', 'تعديل وحذف الفواتير والحركات'],
];

const isOwner = () => currentUser.role === 'owner';
const can = p => isOwner() || !!(currentUser.perms && currentUser.perms[p]);

const FB_VERSION = '10.12.2';
const LOGIN_DOMAIN = '@fabric-office.app';
const toEmail = login => (login.includes('@') ? login.trim() : login.trim().toLowerCase() + LOGIN_DOMAIN);
const fromEmail = email => (email || '').endsWith(LOGIN_DOMAIN) ? email.slice(0, -LOGIN_DOMAIN.length) : email;

function stableStr(o) {
  if (Array.isArray(o)) return '[' + o.map(stableStr).join(',') + ']';
  if (o && typeof o === 'object') return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableStr(o[k])).join(',') + '}';
  return JSON.stringify(o);
}
const clean = o => JSON.parse(JSON.stringify(o));

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
    document.head.appendChild(s);
  });
}

const Backend = {
  mode: 'local',
  fs: null,
  auth: null,
  cfg: null,
  synced: {},
  unsubs: [],
  users: [],
  onRemoteChange: null,

  savedConfig() {
    if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) return window.FIREBASE_CONFIG;
    try { return JSON.parse(localStorage.getItem('fabricOffice.firebaseConfig') || 'null'); } catch (e) { return null; }
  },

  isOnline() { return this.mode === 'firebase'; },

  /* يرجع 'local' أو 'firebase' */
  async init() {
    this.cfg = this.savedConfig();
    if (!this.cfg) { this.mode = 'local'; db = loadLocal(); currentUser = LOCAL_OWNER; return 'local'; }
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
    await loadScript(base + 'firebase-app-compat.js');
    await loadScript(base + 'firebase-auth-compat.js');
    await loadScript(base + 'firebase-firestore-compat.js');
    firebase.initializeApp(this.cfg);
    this.fs = firebase.firestore();
    // للاختبار بس: لو الصفحة متشغلة على نسخة Firebase محلية (emulator)
    const emu = window.__FB_EMULATOR__;
    if (emu) this.fs.useEmulator(emu.host, emu.firestore);
    else { try { await this.fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* متصفح لا يدعم الحفظ أوفلاين */ } }
    this.auth = firebase.auth();
    if (emu) this.auth.useEmulator(`http://${emu.host}:${emu.auth}`);
    this.mode = 'firebase';
    return 'firebase';
  },

  /* ---------- الحسابات ---------- */
  async signIn(login, password) {
    await this.auth.signInWithEmailAndPassword(toEmail(login), password);
  },

  async signOut() {
    this.unsubs.forEach(u => u()); this.unsubs = [];
    await this.auth.signOut();
  },

  async loadProfile(user) {
    const snap = await this.fs.collection('users').doc(user.uid).get();
    if (!snap.exists) return null;
    return Object.assign({ uid: user.uid }, snap.data());
  },

  async signupOwner(name, login, password) {
    this.signingUp = true;
    try {
      const cred = await this.auth.createUserWithEmailAndPassword(toEmail(login), password);
      const u = cred.user;
      try {
        const b = this.fs.batch();
        b.set(this.fs.doc('meta/owner'), { uid: u.uid });
        b.set(this.fs.doc('users/' + u.uid), { name, email: u.email, login: fromEmail(u.email), role: 'owner', active: true, perms: {}, createdAt: Date.now() });
        await b.commit();
      } catch (e) {
        await u.delete().catch(() => {});
        throw new Error('owner-exists');
      }
      return u;
    } finally { this.signingUp = false; }
  },

  async createEmployee({ name, login, password, perms }) {
    const sec = firebase.apps.find(a => a.name === 'secondary') || firebase.initializeApp(this.cfg, 'secondary');
    const cred = await sec.auth().createUserWithEmailAndPassword(toEmail(login), password);
    const id = cred.user.uid;
    const email = cred.user.email;
    await sec.auth().signOut();
    await this.fs.collection('users').doc(id).set({ name, email, login: fromEmail(email), role: 'employee', active: true, perms, createdAt: Date.now() });
  },

  async updateUser(id, data) { await this.fs.collection('users').doc(id).update(data); },

  /* ---------- حجز رقم الفاتورة والتوبات (عشان جهازين ميعملوش نفس الحاجة في نفس اللحظة) ----------
     kind: sale | purchase | return. boltIds: التوبات اللي هتتباع (للبيع بس). isNew: فاتورة جديدة محتاجة رقم.
     بيرجع { no } أو بيرمي error.code = 'bolt-taken' ومعاه error.boltNo */
  async reserve(kind, docId, boltIds = [], isNew = true) {
    if (this.mode !== 'firebase') return { no: isNew ? nextNo(kind) : null };
    const fs = this.fs;
    const cRef = fs.doc('meta/counters');
    const refs = boltIds.map(id => fs.collection('bolts').doc(id));
    const localMax = nextNo(kind) - 1;
    const res = await fs.runTransaction(async tx => {
      const cSnap = isNew ? await tx.get(cRef) : null;
      const snaps = [];
      for (const r of refs) snaps.push(await tx.get(r));
      snaps.forEach(s => {
        const d = s.exists ? s.data() : null;
        if (!d || (d.status !== 'in' && d.saleId !== docId)) {
          const e = new Error('bolt-taken'); e.code = 'bolt-taken'; e.boltNo = d ? d.no : '?'; throw e;
        }
      });
      let no = null;
      if (isNew) {
        no = Math.max(num(cSnap.exists ? cSnap.data()[kind] : 0), localMax) + 1;
        tx.set(cRef, { [kind]: no }, { merge: true });
      }
      refs.forEach(r => tx.update(r, { status: 'sold', saleId: docId }));
      return { no };
    });
    // نحدّث النسخة المحلية عشان persist ميكتبش فوق اللي اتحجز
    boltIds.forEach(id => {
      const b = byId(db.bolts, id); if (b) { b.status = 'sold'; b.saleId = docId; }
      const m = this.synced.bolts; if (m && b) m[id] = stableStr(b);
    });
    if (res.no) db.counters[kind] = Math.max(num(db.counters[kind]), res.no);
    return res;
  },

  /* ---------- صور الرسومات (منفصلة عشان متتحملش مع كل فتحة للسيستم) ---------- */
  photoCache: new Map(),
  async savePhoto(id, data) {
    this.photoCache.set(id, data);
    if (this.mode === 'local') { localStorage.setItem('fabricOffice.photo.' + id, data); return; }
    await this.fs.collection('designPhotos').doc(id).set({ data });
  },
  async getPhoto(id) {
    if (this.photoCache.has(id)) return this.photoCache.get(id);
    let data = '';
    if (this.mode === 'local') data = localStorage.getItem('fabricOffice.photo.' + id) || '';
    else { const snap = await this.fs.collection('designPhotos').doc(id).get(); data = snap.exists ? snap.data().data : ''; }
    this.photoCache.set(id, data);
    return data;
  },
  async deletePhoto(id) {
    this.photoCache.delete(id);
    if (this.mode === 'local') { localStorage.removeItem('fabricOffice.photo.' + id); return; }
    await this.fs.collection('designPhotos').doc(id).delete();
  },
  // بيانات عامة بتظهر في صفحة التصويت (اسم المكتب بس)
  publishPublicInfo() {
    if (this.mode !== 'firebase' || !isOwner()) return;
    const info = { shopName: db.settings.shopName || '', phone: db.settings.phone || '' };
    const s = stableStr(info);
    if (this.synced.meta_public === s) return;
    this.synced.meta_public = s;
    this.fs.doc('meta/public').set(info).catch(() => {});
  },

  async sendReset(email) { await this.auth.sendPasswordResetEmail(email); },

  /* ---------- مزامنة البيانات ---------- */
  subscribe() {
    const fs = this.fs;
    const firsts = [];
    const watch = (ref, apply) => firsts.push(new Promise(resolve => {
      let first = true;
      this.unsubs.push(ref.onSnapshot(snap => {
        const changed = apply(snap);
        if (first) { first = false; resolve(); } else if (changed && this.onRemoteChange) this.onRemoteChange();
      }, err => { console.error(err); if (first) { first = false; resolve(); } }));
    }));

    COLLECTIONS.forEach(col => {
      watch(fs.collection(col), snap => {
        const map = {};
        const arr = snap.docs.map(d => { const o = Object.assign({}, d.data(), { id: d.id }); map[d.id] = stableStr(o); return o; });
        const prev = this.synced[col] || {};
        const same = Object.keys(prev).length === arr.length && arr.every(o => prev[o.id] === map[o.id]);
        this.synced[col] = map;
        if (same) return false;
        db[col] = arr;
        return true;
      });
    });
    ['settings', 'counters'].forEach(key => {
      watch(fs.doc('meta/' + key), snap => {
        const data = snap.exists ? snap.data() : {};
        const s = stableStr(data);
        if (this.synced['meta_' + key] === s) return false;
        this.synced['meta_' + key] = s;
        db[key] = key === 'settings' ? Object.assign(defaultSettings(), data) : Object.assign({ sale: 0, purchase: 0 }, data);
        return true;
      });
    });
    if (isOwner()) {
      watch(fs.collection('users'), snap => {
        this.users = snap.docs.map(d => Object.assign({ uid: d.id }, d.data()));
        return true;
      });
    }
    return Promise.all(firsts);
  },

  persist() {
    if (this.mode === 'local') {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
      return;
    }
    const ops = [];
    COLLECTIONS.forEach(col => {
      const prev = this.synced[col] || {};
      const now = {};
      db[col].forEach(o => {
        const s = stableStr(o);
        now[o.id] = s;
        if (prev[o.id] !== s) ops.push(['set', this.fs.collection(col).doc(o.id), clean(o)]);
      });
      Object.keys(prev).forEach(id => { if (!(id in now)) ops.push(['delete', this.fs.collection(col).doc(id)]); });
      this.synced[col] = now;
    });
    // العدادات أونلاين بتتكتب من reserve بس (عشان جهاز ميرجّعش رقم أقدم فوق رقم أحدث)
    ['settings'].forEach(key => {
      const s = stableStr(db[key]);
      if (this.synced['meta_' + key] !== s) {
        this.synced['meta_' + key] = s;
        ops.push(['set', this.fs.doc('meta/' + key), clean(db[key])]);
      }
    });
    for (let i = 0; i < ops.length; i += 400) {
      const batch = this.fs.batch();
      ops.slice(i, i + 400).forEach(([op, ref, data]) => (op === 'set' ? batch.set(ref, data) : batch.delete(ref)));
      batch.commit().catch(err => {
        console.error(err);
        toast(err.code === 'permission-denied' ? 'مش مسموحلك بالعملية دي — تم إلغاؤها' : 'حصلت مشكلة في الحفظ أونلاين', 'error');
      });
    }
  },
};

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
    try { await this.fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* متصفح لا يدعم الحفظ أوفلاين */ }
    this.auth = firebase.auth();
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
    ['settings', 'counters'].forEach(key => {
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

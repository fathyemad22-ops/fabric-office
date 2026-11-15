/* ========== لوحة الرسومات (منفصلة عن السيستم) ==========
   رفع صور الرسومات، تعديلها، ومتابعة تصويت العملاء */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const LOGIN_DOMAIN = '@fabric-office.app';
  const toEmail = l => (l.includes('@') ? l.trim() : l.trim().toLowerCase() + LOGIN_DOMAIN);
  const state = { tab: 'gallery', designs: [], votes: [], q: '' };
  let api;

  /* ---------- أدوات ---------- */
  function toast(msg, type = 'ok') {
    const t = $('#toast'); t.textContent = msg; t.className = `toast show ${type}`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3000);
  }
  function openModal(title, html) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; $('#modalBackdrop').hidden = false; }
  function closeModal() { $('#modalBackdrop').hidden = true; $('#modalBody').innerHTML = ''; }
  function confirmBox(msg, label = 'حذف') {
    return new Promise(res => {
      openModal('تأكيد', `<p class="confirm-text">${esc(msg)}</p><div class="form-actions"><button class="btn btn-danger" id="cY">${esc(label)}</button><button class="btn" id="cN">إلغاء</button></div>`);
      $('#cY').onclick = () => { closeModal(); res(true); };
      $('#cN').onclick = () => { closeModal(); res(false); };
    });
  }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  const voteLink = () => new URL('./', location.href.split('#')[0].split('?')[0]).href;
  function openWhatsApp(text) { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); }

  function compressImage(file, max = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  /* ---------- البيانات: Firebase (أو الجهاز نفسه للتجربة) ---------- */
  async function firebaseApi(cfg) {
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await loadScript(base + 'firebase-app-compat.js');
    await loadScript(base + 'firebase-auth-compat.js');
    await loadScript(base + 'firebase-firestore-compat.js');
    firebase.initializeApp(cfg);
    const fs = firebase.firestore();
    const auth = firebase.auth();
    const cache = new Map();
    const self = {
      needsLogin: true,
      signingUp: false,
      currentUser: () => auth.currentUser,
      onAuth: cb => auth.onAuthStateChanged(cb),
      signIn: (l, p) => auth.signInWithEmailAndPassword(toEmail(l), p),
      signOut: () => auth.signOut(),
      async signupOwner(name, login, password) {
        self.signingUp = true;
        try {
          const cred = await auth.createUserWithEmailAndPassword(toEmail(login), password);
          const u = cred.user;
          try {
            const b = fs.batch();
            b.set(fs.doc('meta/owner'), { uid: u.uid });
            b.set(fs.doc('users/' + u.uid), { name, email: u.email, login: login.trim(), role: 'owner', active: true, perms: {}, createdAt: Date.now() });
            await b.commit();
          } catch (e) { await u.delete().catch(() => {}); throw new Error('owner-exists'); }
        } finally { self.signingUp = false; }
      },
      async canManage(user) {
        const s = await fs.collection('users').doc(user.uid).get();
        if (!s.exists) return false;
        const d = s.data();
        return d.active && (d.role === 'owner' || (d.perms && d.perms.stock));
      },
      watch(onDesigns, onVotes) {
        fs.collection('designs').onSnapshot(s => onDesigns(s.docs.map(d => Object.assign({ id: d.id }, d.data()))));
        fs.collection('votes').onSnapshot(s => onVotes(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), () => onVotes([]));
      },
      async addDesign(d, photo) { await fs.collection('designPhotos').doc(d.id).set({ data: photo }); cache.set(d.id, photo); await fs.collection('designs').doc(d.id).set(d); },
      updateDesign: (id, data) => fs.collection('designs').doc(id).update(data),
      async deleteDesign(id) { await fs.collection('designs').doc(id).delete(); await fs.collection('designPhotos').doc(id).delete(); cache.delete(id); },
      async photo(id) {
        if (cache.has(id)) return cache.get(id);
        const s = await fs.collection('designPhotos').doc(id).get();
        const data = s.exists ? s.data().data : ''; cache.set(id, data); return data;
      },
      async clearVotes(ids) { for (let i = 0; i < ids.length; i += 400) { const b = fs.batch(); ids.slice(i, i + 400).forEach(id => b.delete(fs.collection('votes').doc(id))); await b.commit(); } },
    };
    return self;
  }

  function localApi() {
    const KEY = 'fabricOffice.v2';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const write = d => localStorage.setItem(KEY, JSON.stringify(d));
    let cbs = null;
    const emit = () => { if (cbs) { const d = read(); cbs[0](d.designs || []); cbs[1](d.votes || []); } };
    return {
      needsLogin: false,
      watch(a, b) { cbs = [a, b]; emit(); window.addEventListener('storage', emit); },
      async addDesign(d, photo) { localStorage.setItem('fabricOffice.photo.' + d.id, photo); const x = read(); x.designs = x.designs || []; x.designs.push(d); write(x); emit(); },
      async updateDesign(id, data) { const x = read(); Object.assign((x.designs || []).find(d => d.id === id) || {}, data); write(x); emit(); },
      async deleteDesign(id) { const x = read(); x.designs = (x.designs || []).filter(d => d.id !== id); write(x); localStorage.removeItem('fabricOffice.photo.' + id); emit(); },
      async photo(id) { return localStorage.getItem('fabricOffice.photo.' + id) || ''; },
      async clearVotes() { const x = read(); x.votes = []; write(x); emit(); },
    };
  }

  /* ---------- النتايج ---------- */
  function results() {
    const latest = {};
    state.votes.forEach(v => {
      const key = String(v.phone || '').replace(/\D/g, '') || String(v.name || '').trim().toLowerCase();
      if (!latest[key] || (v.createdAt || 0) > (latest[key].createdAt || 0)) latest[key] = v;
    });
    const voters = Object.values(latest);
    const counts = {};
    voters.forEach(v => (v.designIds || []).forEach(id => { (counts[id] = counts[id] || []).push(v); }));
    const ranked = state.designs.map(d => ({ d, voters: counts[d.id] || [] }))
      .sort((a, b) => b.voters.length - a.voters.length || String(a.d.code).localeCompare(String(b.d.code), 'en', { numeric: true }));
    return { voters, ranked };
  }

  /* ---------- الدخول ---------- */
  function showLogin(msg = '') {
    $('#app').innerHTML = `<div class="a-login"><div class="auth-card card">
      <div class="brand-mark big">🎨</div><h1>لوحة الرسومات</h1>
      <div class="auth-msg ${msg ? 'show' : ''}" id="lMsg">${esc(msg)}</div>
      <form id="lForm" class="auth-form">
        <label class="field"><span>اسم المستخدم</span><input name="login" required dir="ltr" autocomplete="username"></label>
        <label class="field"><span>كلمة السر</span><input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn btn-primary" type="submit">دخول</button>
      </form>
      <details class="auth-first"><summary>أول مرة؟ اعمل حسابك</summary>
        <form id="sForm" class="auth-form">
          <label class="field"><span>اسمك</span><input name="name" required></label>
          <label class="field"><span>اسم مستخدم (بالإنجليزي)</span><input name="login" required dir="ltr" autocomplete="username"></label>
          <label class="field"><span>كلمة سر (6 حروف أو أكتر)</span><input name="password" type="password" minlength="6" required autocomplete="new-password"></label>
          <button class="btn" type="submit">إنشاء الحساب</button>
          <small class="muted">لو عملت حساب في سيستم المكتب قبل كده، ادخل بيه فوق علطول.</small>
        </form></details>
    </div></div>`;
    const setMsg = m => { const e = $('#lMsg'); e.textContent = m; e.classList.toggle('show', !!m); };
    const errText = e => ({
      'auth/invalid-credential': 'اسم المستخدم أو كلمة السر غلط', 'auth/wrong-password': 'كلمة السر غلط', 'auth/user-not-found': 'الحساب ده مش موجود',
      'auth/email-already-in-use': 'اسم المستخدم ده مستخدم قبل كده', 'auth/weak-password': 'كلمة السر لازم 6 حروف على الأقل',
      'auth/invalid-email': 'اسم المستخدم لازم يكون حروف إنجليزي وأرقام', 'auth/network-request-failed': 'مفيش اتصال بالإنترنت',
      'auth/operation-not-allowed': 'لازم تفعّل الدخول بـ Email/Password في Firebase',
    }[e.code] || (e.message === 'owner-exists' ? 'فيه حساب صاحب مكتب متعمل قبل كده — ادخل بيه' : 'حصلت مشكلة، جرب تاني'));
    $('#lForm').onsubmit = async e => { e.preventDefault(); setMsg(''); try { await api.signIn(e.target.login.value, e.target.password.value); } catch (err) { setMsg(errText(err)); } };
    $('#sForm').onsubmit = async e => {
      e.preventDefault(); setMsg('');
      try { await api.signupOwner(e.target.name.value.trim(), e.target.login.value, e.target.password.value); await handleUser(api.currentUser()); } catch (err) { setMsg(errText(err)); }
    };
  }

  /* ---------- اللوحة ---------- */
  function shell() {
    $('#app').innerHTML = `
      <header class="a-top"><h1>🎨 لوحة الرسومات</h1>
        <a class="btn btn-sm" href="${esc(voteLink())}" target="_blank">صفحة العملاء ↗</a>
        ${api.needsLogin ? '<button class="btn btn-sm" id="logout">خروج</button>' : ''}</header>
      <main class="a-wrap" id="main"></main>`;
    if ($('#logout')) $('#logout').onclick = async () => { await api.signOut(); location.reload(); };
    api.watch(d => { state.designs = d; draw(); }, v => { state.votes = v; draw(); });
  }

  let io;
  function lazy(root) {
    if (io) io.disconnect();
    io = new IntersectionObserver(en => en.forEach(async x => {
      if (!x.isIntersecting) return; io.unobserve(x.target);
      const data = await api.photo(x.target.dataset.photo).catch(() => '');
      if (data) { x.target.style.backgroundImage = `url("${data}")`; x.target.classList.add('loaded'); } else x.target.classList.add('missing');
    }), { rootMargin: '200px' });
    $$('[data-photo]', root).forEach(el => io.observe(el));
  }

  function draw() {
    const main = $('#main'); if (!main) return;
    const { voters, ranked } = results();
    const count = id => (ranked.find(r => r.d.id === id) || { voters: [] }).voters.length;
    const inVote = state.designs.filter(d => d.status !== 'active').length;
    const q = state.q.trim().toLowerCase();
    const list = state.designs.filter(d => !q || String(d.code).toLowerCase().includes(q))
      .sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
    const max = Math.max(1, ranked[0] ? ranked[0].voters.length : 1);
    main.innerHTML = `
      <div class="stats">
        <div class="stat"><span class="stat-label">الرسومات</span><span class="stat-value">${state.designs.length}<small>${inVote} ظاهرين للعملاء</small></span></div>
        <div class="stat accent"><span class="stat-label">عملاء صوّتوا</span><span class="stat-value">${voters.length}</span></div>
        <div class="stat"><span class="stat-label">الأكتر طلباً</span><span class="stat-value">${ranked[0] && ranked[0].voters.length ? `رسمة ${esc(ranked[0].d.code)}<small>${ranked[0].voters.length} صوت</small>` : '—'}</span></div>
      </div>
      <div class="toolbar">
        <div class="chips" style="margin:0">
          <button class="chip ${state.tab === 'gallery' ? 'active' : ''}" data-tab="gallery">الرسومات</button>
          <button class="chip ${state.tab === 'results' ? 'active' : ''}" data-tab="results">النتايج</button>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-wa" id="share">إرسال رابط التصويت</button>
        <label class="btn btn-primary">+ رفع صور<input type="file" id="upload" accept="image/*" multiple hidden></label>
      </div>
      ${state.tab === 'gallery' ? (state.designs.length ? `
        <input type="search" class="search ds-search" id="q" placeholder="ابحث برقم الرسمة..." value="${esc(state.q)}">
        <div class="design-grid">${list.map(d => `
          <div class="design-card ${d.status === 'active' ? 'is-active' : ''}">
            <div class="design-photo" data-photo="${esc(d.id)}" data-zoom="${esc(d.id)}"></div>
            <div class="design-info"><b>رسمة ${esc(d.code)}</b><span class="${count(d.id) ? 'text-accent' : 'muted'} small">❤️ ${count(d.id)}</span></div>
            <div class="design-status">${d.status === 'active' ? '<span class="badge ok">اتختارت</span>' : '<span class="badge warn">في التصويت</span>'}
              <button class="icon-btn small-icon" data-menu="${esc(d.id)}" aria-label="خيارات">⋯</button></div>
          </div>`).join('')}</div>`
        : `<div class="empty"><p>لسه مفيش رسومات.</p><p class="muted">دوس "+ رفع صور" واختار صور الرسومات كلها مرة واحدة.<br>اسم كل صورة بيبقى رقم الرسمة، وتقدر تغيره بعدين من ⋯</p></div>`)
      : (voters.length ? `
        <div class="table-wrap card"><table class="table results-table">
          <thead><tr><th>#</th><th>الرسمة</th><th>الأصوات</th><th>اللي اختاروها</th><th></th></tr></thead>
          <tbody>${ranked.filter(r => r.voters.length).map((r, i) => `<tr>
            <td><b>${i + 1}</b></td>
            <td><div class="res-design"><div class="design-thumb" data-photo="${esc(r.d.id)}" data-zoom="${esc(r.d.id)}"></div><b>رسمة ${esc(r.d.code)}</b></div></td>
            <td style="min-width:130px"><b>${r.voters.length}</b> <small class="muted">من ${voters.length} (${Math.round(r.voters.length / voters.length * 100)}%)</small><div class="bar"><i style="width:${(r.voters.length / max * 100).toFixed(1)}%"></i></div><button class="link-btn small who-mobile" data-who="${esc(r.d.id)}">مين اختارها؟</button></td>
            <td class="small"><button class="link-btn" data-who="${esc(r.d.id)}">${esc(r.voters.slice(0, 3).map(v => v.name).join('، '))}${r.voters.length > 3 ? ` و${r.voters.length - 3} كمان` : ''}</button></td>
            <td class="actions">${r.d.status === 'active' ? '<span class="badge ok">اتختارت</span>' : `<button class="btn btn-sm btn-primary" data-pick="${esc(r.d.id)}">اختيار ✓</button>`}</td>
          </tr>`).join('')}</tbody></table></div>
        <div class="row-actions"><span class="muted small">${ranked.filter(r => !r.voters.length).length} رسمة محدش اختارها. لو عميل صوّت أكتر من مرة، آخر اختيار ليه بس هو اللي بيتحسب.</span>
          <span class="spacer"></span><button class="btn btn-sm btn-ghost-danger" id="clearVotes">مسح كل الأصوات وبدء تصويت جديد</button></div>`
        : '<div class="empty"><p>لسه محدش صوّت.</p><p class="muted">ابعت رابط التصويت للعملاء من زرار "إرسال رابط التصويت".</p></div>')}
      <p class="muted summary">رابط العملاء: <a href="${esc(voteLink())}" target="_blank" dir="ltr">${esc(voteLink())}</a></p>`;
    lazy(main);
    if ($('#q')) $('#q').oninput = e => { state.q = e.target.value; const p = e.target.selectionStart; draw(); const s = $('#q'); s.focus(); s.setSelectionRange(p, p); };
    $('#upload').onchange = e => upload([...e.target.files]);
    $('#share').onclick = share;
    if ($('#clearVotes')) $('#clearVotes').onclick = async () => {
      if (!(await confirmBox(`مسح كل الأصوات (${state.votes.length})؟ مش هتقدر ترجعها.`, 'مسح الأصوات'))) return;
      await api.clearVotes(state.votes.map(v => v.id)); toast('تم مسح الأصوات');
    };
  }

  async function upload(files) {
    const imgs = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!imgs.length) return;
    let done = 0, failed = 0, reason = '';
    toast(`جاري رفع ${imgs.length} صورة...`);
    for (const f of imgs) {
      let stage = 'image';
      try {
        const photo = await compressImage(f);
        stage = 'save';
        let code = f.name.replace(/\.[^.]+$/, '').trim() || String(state.designs.length + 1);
        if (state.designs.some(d => d.code === code)) code = `${code}-${done + 1}`;
        await api.addDesign({ id: uid(), code, status: 'sample', createdAt: Date.now() }, photo);
        done++;
        if (done % 5 === 0) toast(`اترفع ${done} من ${imgs.length}`);
      } catch (e) {
        failed++;
        console.error(e);
        const code = String(e && e.code || '');
        reason = stage === 'image' ? 'الصورة دي مش مدعومة — جرب صورة JPG أو PNG'
          : code.includes('permission-denied') ? 'Firebase رافض الرفع: لازم تحط قواعد الحماية الجديدة في Firestore ← Rules وتدوس Publish'
          : code.includes('not-found') || code.includes('failed-precondition') ? 'قاعدة البيانات لسه متعملتش في Firebase (Firestore ← Create database)'
          : code.includes('unavailable') ? 'مفيش اتصال كويس بالإنترنت، جرب تاني'
          : code.includes('invalid-argument') || code.includes('resource-exhausted') ? 'الصورة كبيرة زيادة عن اللزوم'
          : `حصلت مشكلة (${code || (e && e.message) || 'غير معروفة'})`;
        if (failed === 1 && done === 0 && stage === 'save') break; // نفس المشكلة هتتكرر مع كل الصور
      }
    }
    if (failed) {
      openModal('الرفع مكملش', `<p>اترفع <b>${done}</b> رسمة، و<b>${failed}</b> مااترفعتش.</p><p class="credit-msg">${esc(reason)}</p><div class="form-actions"><button class="btn" id="okErr">تمام</button></div>`);
      $('#okErr').onclick = closeModal;
    } else toast(`تم رفع ${done} رسمة ✓`);
  }

  async function zoom(id) {
    const d = state.designs.find(x => x.id === id);
    openModal(`رسمة ${d ? d.code : ''}`, '<p class="muted">جاري التحميل...</p>');
    const data = await api.photo(id);
    if (!$('#modalBackdrop').hidden) $('#modalBody').innerHTML = data ? `<img src="${data}" class="zoom-img" alt="">` : '<p>الصورة مش موجودة</p>';
  }

  function menu(id) {
    const d = state.designs.find(x => x.id === id);
    openModal(`رسمة ${d.code}`, `
      <form id="mForm" class="form-grid">
        <label class="field"><span>رقم / اسم الرسمة</span><input name="code" value="${esc(d.code)}" required></label>
        <label class="field"><span>الحالة</span><select name="status">
          <option value="sample" ${d.status !== 'active' ? 'selected' : ''}>في التصويت (ظاهرة للعملاء)</option>
          <option value="active" ${d.status === 'active' ? 'selected' : ''}>اتختارت (مخفية من التصويت)</option></select></label>
        <div class="form-actions field-full"><button class="btn btn-primary" type="submit">حفظ</button>
          <button class="btn btn-ghost-danger" type="button" id="mDel">حذف الرسمة</button><button class="btn" type="button" id="mCancel">إلغاء</button></div>
      </form>`);
    $('#mCancel').onclick = closeModal;
    $('#mForm').onsubmit = async e => {
      e.preventDefault();
      await api.updateDesign(id, { code: e.target.code.value.trim() || d.code, status: e.target.status.value });
      closeModal(); toast('تم الحفظ');
    };
    $('#mDel').onclick = async () => {
      if (!(await confirmBox(`حذف رسمة ${d.code} وصورتها؟`))) return;
      await api.deleteDesign(id); toast('تم الحذف');
    };
  }

  function share() {
    const link = voteLink();
    const text = `أهلاً 👋\nعندنا رسومات قماش جديدة وعايزين رأيك 🌹\nاختار الرسومات اللي عاجباك من هنا:\n${link}`;
    openModal('رابط التصويت', `
      <p>ابعت الرابط ده للعملاء، أو حطه في الحالة أو في جروب العملاء:</p>
      <div class="link-box" dir="ltr">${esc(link)}</div>
      <div class="form-actions"><button class="btn" id="sCopy">نسخ الرابط</button><button class="btn btn-wa" id="sWa">إرسال على واتساب</button></div>`);
    $('#sCopy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('تم نسخ الرابط'); } catch (e) { prompt('انسخ الرابط:', link); } };
    $('#sWa').onclick = () => openWhatsApp(text);
  }

  document.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('[data-tab]'); if (tab) { state.tab = tab.dataset.tab; draw(); return; }
    const z = t.closest('[data-zoom]'); if (z) return zoom(z.dataset.zoom);
    const m = t.closest('[data-menu]'); if (m) return menu(m.dataset.menu);
    const p = t.closest('[data-pick]'); if (p) { api.updateDesign(p.dataset.pick, { status: 'active' }).then(() => toast('اتعلّمت إنها اتختارت ✓')); return; }
    const w = t.closest('[data-who]');
    if (w) {
      const r = results().ranked.find(x => x.d.id === w.dataset.who);
      openModal(`اللي اختاروا رسمة ${r.d.code}`, `<ul class="voter-list">${r.voters.map(v => `<li><b>${esc(v.name)}</b> <span dir="ltr" class="muted">${esc(v.phone || '')}</span></li>`).join('')}</ul>`);
      return;
    }
    if (t.id === 'modalBackdrop' || t.closest('#modalClose')) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  let started = false;
  async function handleUser(user) {
    if (!user) return showLogin();
    const ok = await api.canManage(user).catch(() => false);
    if (!ok) { await api.signOut(); return showLogin('الحساب ده مش مسموحله يدير الرسومات'); }
    if (!started) { started = true; shell(); }
  }

  async function start() {
    const cfg = window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey ? window.FIREBASE_CONFIG : null;
    try { api = cfg ? await firebaseApi(cfg) : localApi(); }
    catch (e) { $('#app').innerHTML = '<div class="empty"><p>مقدرناش نتصل بالإنترنت. افتح الصفحة تاني.</p></div>'; return; }
    if (!api.needsLogin) return shell();
    api.onAuth(user => { if (!api.signingUp) handleUser(user); });
  }
  start();
})();

/* ========== صفحة تصويت العملاء على الرسومات ==========
   بتشتغل من غير تسجيل دخول: بتقرا الرسومات وصورها، وبتبعت صوت العميل في votes */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 30;
  const DONE_KEY = 'fabricOffice.voted';
  const chosen = new Set();
  let designs = [];
  let api;

  function toast(msg, type = 'ok') {
    const t = $('#toast'); t.textContent = msg; t.className = `toast show ${type}`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 2800);
  }

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }

  /* ---------- مصدر البيانات: Firebase، أو الجهاز نفسه لو السيستم مش أونلاين ---------- */
  async function firebaseApi(cfg) {
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await loadScript(base + 'firebase-app-compat.js');
    await loadScript(base + 'firebase-firestore-compat.js');
    firebase.initializeApp(cfg);
    const fs = firebase.firestore();
    if (window.__FB_EMULATOR__) fs.useEmulator(window.__FB_EMULATOR__.host, window.__FB_EMULATOR__.firestore);
    return {
      async info() { try { const s = await fs.doc('meta/public').get(); return s.exists ? s.data() : {}; } catch (e) { return {}; } },
      async designs() { const s = await fs.collection('designs').get(); return s.docs.map(d => Object.assign({ id: d.id }, d.data())); },
      async photo(id) { const s = await fs.collection('designPhotos').doc(id).get(); return s.exists ? s.data().data : ''; },
      async vote(v) { await fs.collection('votes').add(v); },
    };
  }

  function localApi() {
    const KEY = 'fabricOffice.v2';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    return {
      async info() { return read().settings || {}; },
      async designs() { return read().designs || []; },
      async photo(id) { return localStorage.getItem('fabricOffice.photo.' + id) || ''; },
      async vote(v) { const d = read(); d.votes = d.votes || []; d.votes.push(Object.assign({ id: Date.now().toString(36) }, v)); localStorage.setItem(KEY, JSON.stringify(d)); },
    };
  }

  /* ---------- العرض ---------- */
  function updateBar() {
    $('#vCount').textContent = `اخترت ${chosen.size}`;
    $('#vSend').disabled = !chosen.size;
  }

  function render() {
    const list = designs.filter(d => d.status !== 'active')
      .sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
    if (!list.length) { $('#vMain').innerHTML = '<div class="v-done"><div class="big">🧵</div><h2>مفيش رسومات دلوقتي</h2><p class="muted">جرب تاني بعدين.</p></div>'; return; }
    $('#vMain').innerHTML = `<div class="v-grid">${list.map(d => `
      <div class="v-card ${chosen.has(d.id) ? 'on' : ''}" data-id="${esc(d.id)}" role="button" aria-pressed="${chosen.has(d.id)}" tabindex="0">
        <div class="design-photo" data-photo="${esc(d.id)}"></div>
        <span class="v-heart">${chosen.has(d.id) ? '❤️' : '🤍'}</span>
        <button class="v-zoom" data-zoom="${esc(d.id)}" aria-label="تكبير الصورة">⤢</button>
        <div class="v-code"><span>رسمة ${esc(d.code)}</span></div>
      </div>`).join('')}</div>`;
    $('#vBar').hidden = false;
    updateBar();
    const io = new IntersectionObserver(entries => entries.forEach(async en => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const data = await api.photo(en.target.dataset.photo).catch(() => '');
      if (data) { en.target.style.backgroundImage = `url("${data}")`; en.target.classList.add('loaded'); } else en.target.classList.add('missing');
    }), { rootMargin: '300px' });
    document.querySelectorAll('[data-photo]').forEach(el => io.observe(el));
  }

  function toggle(card) {
    const id = card.dataset.id;
    if (chosen.has(id)) chosen.delete(id);
    else {
      if (chosen.size >= MAX) return toast(`تقدر تختار لحد ${MAX} رسمة`, 'error');
      chosen.add(id);
    }
    const on = chosen.has(id);
    card.classList.toggle('on', on);
    card.setAttribute('aria-pressed', on);
    card.querySelector('.v-heart').textContent = on ? '❤️' : '🤍';
    updateBar();
  }

  async function zoom(id) {
    const wrap = document.createElement('div');
    wrap.className = 'zoom-full';
    wrap.innerHTML = '<button aria-label="إغلاق">✕</button><p style="color:#fff">جاري التحميل...</p>';
    document.body.appendChild(wrap);
    wrap.onclick = () => wrap.remove();
    const data = await api.photo(id).catch(() => '');
    if (data && wrap.isConnected) wrap.querySelector('p').outerHTML = `<img src="${data}" alt="">`;
  }

  function openForm() {
    const saved = JSON.parse(localStorage.getItem('fabricOffice.voter') || '{}');
    $('#modalTitle').textContent = `إرسال اختيارك (${chosen.size} رسمة)`;
    $('#modalBody').innerHTML = `
      <form id="vForm" class="auth-form">
        <label class="field"><span>اسمك أو اسم المحل <b class="req">*</b></span><input name="name" required maxlength="80" value="${esc(saved.name || '')}"></label>
        <label class="field"><span>رقم الواتساب <b class="req">*</b></span><input name="phone" type="tel" dir="ltr" maxlength="20" required inputmode="tel" value="${esc(saved.phone || '')}" placeholder="01xxxxxxxxx">
          <small class="muted">عشان نبلغك أول ما الرسومات اللي اخترتها تنزل</small></label>
        <button class="btn btn-primary" type="submit">إرسال</button>
      </form>`;
    $('#modalBackdrop').hidden = false;
    $('#vForm [name=name]').focus();
    $('#vForm').onsubmit = async e => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      const phone = e.target.phone.value.trim();
      if (!name) return toast('اكتب اسمك', 'error');
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return toast('اكتب رقم واتساب صحيح', 'error');
      const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'جاري الإرسال...';
      try {
        await api.vote({ name, phone, designIds: [...chosen], createdAt: Date.now() });
        localStorage.setItem('fabricOffice.voter', JSON.stringify({ name, phone }));
        localStorage.setItem(DONE_KEY, '1');
        $('#modalBackdrop').hidden = true;
        $('#vBar').hidden = true;
        $('#vMain').innerHTML = `<div class="v-done"><div class="big">🌹</div><h2>شكراً يا ${esc(name)}!</h2>
          <p>اختيارك وصلنا (${chosen.size} رسمة). هنبلغك أول ما الرسومات تنزل.</p>
          <button class="btn" id="vAgain">تعديل اختياري</button></div>`;
        $('#vAgain').onclick = () => render();
      } catch (err) {
        btn.disabled = false; btn.textContent = 'إرسال';
        toast('حصلت مشكلة في الإرسال، اتأكد من النت وجرب تاني', 'error');
      }
    };
  }

  async function start() {
    try {
      const cfg = window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey ? window.FIREBASE_CONFIG : null;
      api = cfg ? await firebaseApi(cfg) : localApi();
      const [info, list] = await Promise.all([api.info(), api.designs()]);
      if (info.shopName) { $('#shopName').textContent = `رسومات جديدة من ${info.shopName}`; document.title = `رسومات ${info.shopName}`; }
      designs = list;
      render();
    } catch (e) {
      $('#vMain').innerHTML = '<div class="v-done"><div class="big">📶</div><h2>مقدرناش نحمّل الرسومات</h2><p class="muted">اتأكد من النت وافتح الرابط تاني.</p></div>';
    }
  }

  document.addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]');
    if (z) { e.stopPropagation(); zoom(z.dataset.zoom); return; }
    const card = e.target.closest('.v-card');
    if (card) toggle(card);
    if (e.target.id === 'modalBackdrop' || e.target.closest('#modalClose')) $('#modalBackdrop').hidden = true;
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('v-card')) { e.preventDefault(); toggle(e.target); }
    if (e.key === 'Escape') { $('#modalBackdrop').hidden = true; const z = document.querySelector('.zoom-full'); if (z) z.remove(); }
  });
  $('#vSend').onclick = openForm;
  start();
})();

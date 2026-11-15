/* ========== الرسومات وتصويت العملاء ========== */
const designState = { tab: 'gallery', q: '' };
const VOTE_PATH = 'vote.html';

function voteLink() {
  if (db.settings.voteUrl) return db.settings.voteUrl;
  return new URL(VOTE_PATH, location.href.split('#')[0]).href;
}

// نتايج التصويت: آخر صوت لكل عميل (بالتليفون أو الاسم) هو اللي بيتحسب
function voteResults() {
  const latest = {};
  db.votes.forEach(v => {
    const key = (String(v.phone || '').replace(/\D/g, '') || String(v.name || '').trim().toLowerCase());
    if (!latest[key] || (v.createdAt || 0) > (latest[key].createdAt || 0)) latest[key] = v;
  });
  const voters = Object.values(latest);
  const counts = {};
  voters.forEach(v => (v.designIds || []).forEach(id => { (counts[id] = counts[id] || []).push(v); }));
  const ranked = db.designs.map(d => ({ d, voters: counts[d.id] || [] })).sort((a, b) => b.voters.length - a.voters.length || String(a.d.code).localeCompare(String(b.d.code), 'en', { numeric: true }));
  return { voters, ranked };
}

// تصغير الصورة قبل الرفع (عشان تبقى خفيفة على النت)
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

// الصور بتتحمل لما الكارت يظهر على الشاشة
let photoObserver = null;
function lazyPhotos(root) {
  if (photoObserver) photoObserver.disconnect();
  photoObserver = new IntersectionObserver(entries => entries.forEach(async en => {
    if (!en.isIntersecting) return;
    const el = en.target; photoObserver.unobserve(el);
    const data = await Backend.getPhoto(el.dataset.photo).catch(() => '');
    if (data) { el.style.backgroundImage = `url("${data}")`; el.classList.add('loaded'); } else el.classList.add('missing');
  }), { rootMargin: '200px' });
  $$('[data-photo]', root).forEach(el => photoObserver.observe(el));
}

function renderDesigns(view) {
  const { voters, ranked } = voteResults();
  const samples = db.designs.filter(d => d.status !== 'active');
  const q = designState.q.trim().toLowerCase();
  const list = [...db.designs].filter(d => !q || String(d.code).toLowerCase().includes(q))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
  const countOf = id => (ranked.find(r => r.d.id === id) || { voters: [] }).voters.length;
  const canEdit = can('stock');

  view.innerHTML = `
    <div class="stats">
      ${statCard('الرسومات', `${db.designs.length}<small>${samples.length} في التصويت</small>`)}
      ${statCard('عملاء صوّتوا', voters.length, 'accent')}
      ${statCard('الأكتر طلباً', ranked[0] && ranked[0].voters.length ? `رسمة ${esc(ranked[0].d.code)}<small>${ranked[0].voters.length} صوت</small>` : '—')}
    </div>
    <div class="toolbar">
      <div class="chips" id="dsTabs">
        <button class="chip ${designState.tab === 'gallery' ? 'active' : ''}" data-tab="gallery">الرسومات</button>
        <button class="chip ${designState.tab === 'results' ? 'active' : ''}" data-tab="results">نتايج التصويت</button>
      </div>
      <span class="spacer"></span>
      <button class="btn btn-wa" id="dsShare">إرسال رابط التصويت</button>
      ${canEdit ? `<label class="btn btn-primary">+ رفع صور رسومات<input type="file" id="dsUpload" accept="image/*" multiple hidden></label>` : ''}
    </div>
    <div id="dsBody">${designState.tab === 'results' ? resultsHtml(ranked, voters) : `
      ${db.designs.length ? `<input type="search" class="search ds-search" id="dsSearch" placeholder="ابحث برقم الرسمة..." value="${esc(designState.q)}">
      <div class="design-grid">${list.map(d => `
        <div class="design-card ${d.status === 'active' ? 'is-active' : ''}">
          <div class="design-photo" data-photo="${d.id}" data-zoom="${d.id}"></div>
          <div class="design-info">
            <b>رسمة ${esc(d.code)}</b>
            <span class="${countOf(d.id) ? 'text-accent' : 'muted'} small">❤️ ${countOf(d.id)}</span>
          </div>
          <div class="design-status">${d.status === 'active' ? '<span class="badge ok">في الإنتاج</span>' : '<span class="badge warn">في التصويت</span>'}
            ${canEdit ? `<button class="icon-btn small-icon" data-dmenu="${d.id}" aria-label="خيارات">⋯</button>` : ''}</div>
        </div>`).join('')}</div>`
      : emptyState('لسه مفيش رسومات. ارفع صور الرسومات (ممكن تختار الـ 91 صورة مرة واحدة). اسم كل صورة بيبقى رقم الرسمة.')}`}
    </div>
    <p class="muted summary">رابط التصويت: <a href="${esc(voteLink())}" target="_blank" dir="ltr">${esc(voteLink())}</a></p>`;

  lazyPhotos(view);
  $('#dsTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { designState.tab = b.dataset.tab; render(); } };
  if ($('#dsSearch')) $('#dsSearch').oninput = e => { designState.q = e.target.value; const pos = e.target.selectionStart; render(); const s = $('#dsSearch'); s.focus(); s.setSelectionRange(pos, pos); };
  if ($('#dsUpload')) $('#dsUpload').onchange = e => uploadDesigns([...e.target.files]);
  $('#dsShare').onclick = shareVoteLink;
  $('#dsBody').onclick = e => {
    const z = e.target.closest('[data-zoom]'); const m = e.target.closest('[data-dmenu]'); const pick = e.target.closest('[data-produce]'); const who = e.target.closest('[data-who]');
    if (z) zoomDesign(z.dataset.zoom);
    if (m) designMenu(m.dataset.dmenu);
    if (pick) produceDesign(pick.dataset.produce);
    if (who) { const r = ranked.find(x => x.d.id === who.dataset.who); openModal(`اللي اختاروا رسمة ${r.d.code}`, `<ul class="voter-list">${r.voters.map(v => `<li><b>${esc(v.name)}</b> <span dir="ltr" class="muted">${esc(v.phone || '')}</span></li>`).join('')}</ul><div class="form-actions"><button class="btn" data-close>إغلاق</button></div>`); }
  };
}

function resultsHtml(ranked, voters) {
  if (!voters.length) return emptyState('لسه محدش صوّت. ابعت رابط التصويت للعملاء من زرار "إرسال رابط التصويت".');
  const max = Math.max(1, ranked[0].voters.length);
  return `<div class="table-wrap card"><table class="table results-table">
    <thead><tr><th>#</th><th>الرسمة</th><th>الأصوات</th><th>اللي اختاروها</th><th></th></tr></thead>
    <tbody>${ranked.filter(r => r.voters.length).map((r, i) => `<tr>
      <td><b>${i + 1}</b></td>
      <td><div class="res-design"><div class="design-thumb" data-photo="${r.d.id}" data-zoom="${r.d.id}"></div><b>رسمة ${esc(r.d.code)}</b></div></td>
      <td style="min-width:140px"><b>${r.voters.length}</b> <small class="muted">من ${voters.length} (${Math.round(r.voters.length / voters.length * 100)}%)</small><div class="bar"><i style="width:${(r.voters.length / max * 100).toFixed(1)}%"></i></div></td>
      <td class="small"><button class="link-btn" data-who="${r.d.id}">${esc(r.voters.slice(0, 3).map(v => v.name).join('، '))}${r.voters.length > 3 ? ` و${r.voters.length - 3} كمان` : ''}</button></td>
      <td class="actions">${r.d.status === 'active' ? '<span class="badge ok">في الإنتاج</span>' : can('stock') ? `<button class="btn btn-sm btn-primary" data-produce="${r.d.id}">اختيار للإنتاج</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>
    <p class="muted summary">${ranked.filter(r => !r.voters.length).length} رسمة محدش اختارها. لو عميل صوّت أكتر من مرة، آخر اختيار ليه هو اللي بيتحسب.</p>`;
}

async function uploadDesigns(files) {
  const imgs = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  if (!imgs.length) return;
  let done = 0, failed = 0;
  const base = db.designs.length;
  toast(`جاري رفع ${imgs.length} صورة...`);
  for (const f of imgs) {
    try {
      const data = await compressImage(f);
      const id = uid();
      let code = f.name.replace(/\.[^.]+$/, '').trim() || String(base + done + 1);
      if (db.designs.some(d => d.code === code)) code = `${code}-${done + 1}`;
      await Backend.savePhoto(id, data);
      db.designs.push({ id, code, status: 'sample', createdAt: Date.now() });
      done++;
      if (done % 5 === 0) toast(`اترفع ${done} من ${imgs.length}`);
    } catch (e) { failed++; }
  }
  saveDB();
  toast(`تم رفع ${done} رسمة${failed ? ` — ${failed} صورة مااترفعتش` : ''}`, failed ? 'error' : 'ok');
  render();
}

async function zoomDesign(id) {
  const d = byId(db.designs, id);
  openModal(`رسمة ${d.code}`, `<div class="zoom-wrap"><p class="muted">جاري التحميل...</p></div>`, { wide: true });
  const data = await Backend.getPhoto(id);
  const w = $('.zoom-wrap');
  if (w) w.innerHTML = data ? `<img src="${data}" alt="رسمة ${esc(d.code)}" class="zoom-img">` : emptyState('الصورة مش موجودة');
}

function designMenu(id) {
  const d = byId(db.designs, id);
  openModal(`رسمة ${d.code}`, `
    <form id="dmForm" class="form-grid">
      ${field('رقم / اسم الرسمة', 'code', d.code, { required: true })}
      ${selectField('الحالة', 'status', [{ value: 'sample', label: 'في التصويت' }, { value: 'active', label: 'في الإنتاج' }], d.status || 'sample')}
      <div class="form-actions field-full">
        <button class="btn btn-primary" type="submit">حفظ</button>
        <button class="btn btn-ghost-danger" type="button" id="dmDel">حذف الرسمة</button>
        <button class="btn" type="button" data-close>إلغاء</button>
      </div>
    </form>`);
  $('#dmForm').onsubmit = e => {
    e.preventDefault();
    const fd = formData(e.target);
    const cur = byId(db.designs, id); if (!cur) return;
    cur.code = fd.code.trim() || cur.code; cur.status = fd.status;
    saveDB(); closeModal(); toast('تم الحفظ'); render();
  };
  $('#dmDel').onclick = async () => {
    if (!(await confirmDialog(`حذف رسمة ${d.code} وصورتها؟`))) return;
    db.designs = db.designs.filter(x => x.id !== id);
    saveDB(); Backend.deletePhoto(id).catch(() => {});
    toast('تم الحذف'); render();
  };
}

// اختيار الرسمة للإنتاج: بتتحول لصنف في المخزن بألوانها
function produceDesign(id) {
  const d = byId(db.designs, id);
  d.status = 'active';
  saveDB();
  openDesignForm({ code: d.code });
}

function shareVoteLink() {
  const link = voteLink();
  const text = c => `أهلاً${c ? ' أستاذ ' + c.name : ''} 👋\nمعاك ${db.settings.shopName}.\nعندنا رسومات جديدة وعايزين رأيك 🌹\nاختار الرسومات اللي عاجباك من هنا:\n${link}`;
  const withPhone = db.customers.filter(c => c.phone);
  openModal('إرسال رابط التصويت', `
    <p>ابعت الرابط ده للعملاء، وكل عميل يختار الرسومات اللي عاجباه:</p>
    <div class="link-box" dir="ltr">${esc(link)}</div>
    <div class="form-actions">
      <button class="btn" id="vlCopy">نسخ الرابط</button>
      <button class="btn btn-wa" id="vlOne">إرسال على واتساب (أختار أنا)</button>
      ${withPhone.length ? `<button class="btn btn-primary" id="vlAll">إرسال لكل العملاء (${withPhone.length})</button>` : ''}
    </div>
    <p class="muted small">💡 تقدر كمان تحط الرابط في ستاتس الواتساب أو في جروب العملاء.</p>`);
  $('#vlCopy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('تم نسخ الرابط'); } catch (e) { prompt('انسخ الرابط:', link); } };
  $('#vlOne').onclick = () => openWhatsApp('', text(null));
  if ($('#vlAll')) $('#vlAll').onclick = () => openWaQueue(withPhone.map(c => ({ name: c.name, phone: c.phone, text: text(c) })), 'إرسال رابط التصويت');
}

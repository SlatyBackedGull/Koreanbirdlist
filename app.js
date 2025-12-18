(() => {
        // Ensure we have a valid UUID user id for Supabase. If the `user` value looks like an email (from local fallback), try to resolve the authenticated user's UUID.
        const resolvedUserId = await resolveSupabaseUserId(user);
        if (!resolvedUserId) {
          console.warn('[SAVE] could not resolve supabase user id for', user);
          alert('Supabase에 저장하려면 정상적으로 로그인된 사용자가 필요합니다. 현재는 로컬 저장으로 대체됩니다.');
          // fall through to localStorage save
        } else {
          // profiles 테이블에 species JSON 전체를 저장 using resolved UUID
          // sanitize media entries to avoid uploading large embedded data URIs
          const sanitized = (Array.isArray(list) ? JSON.parse(JSON.stringify(list)) : []).map(sp => {
            const copy = Object.assign({}, sp);
            if (Array.isArray(copy.media)) {
              copy.media = copy.media.map(m => ({ name: m.name || null, type: m.type || null, url: m.url || null, path: m.path || null }));
            }
            return copy;
          });
          const { data, error } = await supabaseClient
            .from('profiles')
            .upsert({ user_id: resolvedUserId, species: sanitized }, { returning: 'minimal' });
          if (error) { console.warn('Supabase save error', error); alert('저장 실패: ' + (error.message || JSON.stringify(error))); return; }
          try { persistBackupLocal(); } catch (e) { console.warn('[BACKUP] persist after supabase save failed', e); }
          return;
        }
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmd2VudG9odWpmeGF2dmdtbmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTM1OTgwMywiZXhwIjoyMDgwOTM1ODAzfQ.JcXRna7LL4GKM5lfOaTTOXETayVZPu_7IuwGvGekwqE';
  const USE_SUPABASE = true; // Supabase 사용 여부 — 현재 로컬 테스트용으로 false로 설정
  let supabaseClient = null;

  if (USE_SUPABASE && typeof supabase !== 'undefined') {
    try { supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e) { console.warn('Supabase init failed', e); supabaseClient = null; }
  }
  // debug: report supabase client/key state
  try {
    console.debug('[SUPABASE INIT] USE_SUPABASE=', USE_SUPABASE, 'supabaseGlobal=', typeof supabase !== 'undefined', 'supabaseClient=', !!supabaseClient, 'SUPABASE_KEY_len=', String(SUPABASE_KEY || '').length);
  } catch(e) {}
  // expose client for debugging and external checks
  try { window.supabaseClient = supabaseClient; } catch(e) {}

  // show banner if USE_SUPABASE is true but client is not initialized
  try {
    if (USE_SUPABASE && !supabaseClient) {
      const existing = document.querySelector('#supabaseInitBanner');
      if (!existing && typeof document !== 'undefined') {
        const b = document.createElement('div');
        b.id = 'supabaseInitBanner';
        b.style.position = 'fixed'; b.style.left = '0'; b.style.right = '0'; b.style.top = '0';
        b.style.background = '#ffdede'; b.style.color = '#333'; b.style.padding = '8px'; b.style.zIndex = 99999;
        b.textContent = 'Supabase 클라이언트 초기화에 실패했습니다. Netlify 환경변수나 키를 확인하세요.';
        document.body.appendChild(b);
      }
    }
  } catch(e) {}

  // Supabase network/error tracking and automatic fallback
  let supabaseErrorCount = 0;
  const SUPABASE_ERROR_THRESHOLD = 5;
  let supabaseFallbacked = false;

  function triggerSupabaseFallback(reason) {
    if (supabaseFallbacked) return;
    supabaseFallbacked = true;
    console.warn('[SUPABASE FALLBACK] reason=', reason);
    try { supabaseClient = null; } catch(e){}
    // show banner at top with retry and keep-local buttons
    try {
      const existing = document.querySelector('#supabaseStatusBanner');
      if (existing) existing.remove();
      const b = document.createElement('div');
      b.id = 'supabaseStatusBanner';
      b.style.position = 'fixed'; b.style.left = '0'; b.style.right = '0'; b.style.top = '0';
      b.style.background = '#ffefc2'; b.style.color = '#333'; b.style.padding = '8px';
      b.style.zIndex = 9999; b.style.display = 'flex'; b.style.justifyContent = 'space-between'; b.style.alignItems = 'center';
      const msg = document.createElement('div');
      msg.textContent = 'Supabase 연결 문제 감지 — 자동으로 로컬 저장 방식으로 전환되었습니다.';
      b.appendChild(msg);
      const controls = document.createElement('div');
      const retry = document.createElement('button'); retry.textContent = '재시도'; retry.style.marginLeft = '8px';
      retry.addEventListener('click', async () => {
        supabaseErrorCount = 0; supabaseFallbacked = false;
        try {
          if (typeof supabase !== 'undefined') {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
          } else supabaseClient = null;
          console.debug('[SUPABASE RETRY] reinitialized supabaseClient=', !!supabaseClient);
          if (supabaseClient) { b.remove(); alert('Supabase 클라이언트가 재초기화되었습니다. 동작을 확인하세요.'); }
          else alert('Supabase 클라이언트 초기화에 실패했습니다.');
        } catch (e) { console.warn('[SUPABASE RETRY] failed', e); alert('Supabase 재연결 실패'); }
      });
      const keepLocal = document.createElement('button'); keepLocal.textContent = '로컬 모드 유지'; keepLocal.style.marginLeft = '8px';
      keepLocal.addEventListener('click', () => { b.remove(); });
      controls.appendChild(retry); controls.appendChild(keepLocal);
      b.appendChild(controls);
      document.body.appendChild(b);
    } catch (e) { console.debug('[SUPABASE FALLBACK] banner create failed', e); }
  }

  function handleSupabaseErrorInfo(info) {
    supabaseErrorCount++;
    console.warn('[SUPABASE ERROR COUNT]', supabaseErrorCount, info);
    if (supabaseErrorCount >= SUPABASE_ERROR_THRESHOLD) triggerSupabaseFallback(info);
  }
  // Wrap `fetch` to detect Supabase upstream 5xx or network errors and count them.
  if (typeof window !== 'undefined' && window.fetch) {
    const _origFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      try {
        const res = await _origFetch(input, init);
        try {
          const url = (typeof input === 'string') ? input : (input && input.url) || '';
          if (url && url.indexOf(SUPABASE_URL) !== -1 && res && res.status >= 500) {
            handleSupabaseErrorInfo({ status: res.status, url });
          }
        } catch(e){}
        return res;
      } catch (err) {
        try {
          const url = (typeof input === 'string') ? input : (input && input.url) || '';
          if (url && url.indexOf(SUPABASE_URL) !== -1) {
            handleSupabaseErrorInfo({ error: err && err.message || String(err), url });
          }
        } catch(e){}
        throw err;
      }
    };
  }

  // Media logging helper to capture media-related events for debugging.
  // Stored in `window.mediaLogs` (most-recent 200 entries persisted to localStorage).
  window.mediaLogs = window.mediaLogs || [];
  function mediaLog(action, details) {
    try {
      const entry = { ts: new Date().toISOString(), action: String(action || ''), details: details || null };
      window.mediaLogs.push(entry);
      // keep size bounded
      if (window.mediaLogs.length > 200) window.mediaLogs = window.mediaLogs.slice(-200);
      try { localStorage.setItem('media_logs', JSON.stringify(window.mediaLogs)); } catch (e) {}
      console.info('[MEDIA LOG]', entry);
      return entry;
    } catch (e) { try { console.warn('[MEDIA LOG] failed', e); } catch(_){} }
    return null;
  }

    // Resolve a valid Supabase user UUID from a provided identifier.
    // If `user` already looks like a UUID, return it. Otherwise, try to query
    // the currently-authenticated user via Supabase client and return its id.
    async function resolveSupabaseUserId(user) {
      if (!supabaseClient || !user) return null;
      const s = String(user || '');
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRe.test(s)) return s;
      try {
        if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.getUser === 'function') {
          const res = await supabaseClient.auth.getUser();
          if (res && res.data && res.data.user && res.data.user.id) return res.data.user.id;
          if (res && res.user && res.user.id) return res.user.id; // older return shape
        }
      } catch (e) { console.debug('[RESOLVE USER] error', e); }
      return null;
    }

  // DEFAULT_SPECIES는 워크스페이스에 생성된 species-data.js의
  // `window.EMBEDDED_DEFAULT_SPECIES`가 있으면 그것을 우선 사용합니다.
  const DEFAULT_SPECIES = (typeof window !== 'undefined' && Array.isArray(window.EMBEDDED_DEFAULT_SPECIES)) ? window.EMBEDDED_DEFAULT_SPECIES : [
    { id: 1, family: '꿩과', kor: '들꿩', eng: 'Hazel grouse', sci: 'Tetrastes bonasia', observed: false, media: [], memo: '' },
    { id: 2, family: '꿩과', kor: '멧닭', eng: 'Black grouse', sci: 'Lyrurus tetrix', observed: false, media: [], memo: '' },
    { id: 3, family: '꿩과', kor: '메추라기', eng: 'Japanese Quail', sci: 'Coturnix japonica', observed: false, media: [], memo: '' },
    { id: 4, family: '꿩과', kor: '꿩', eng: 'Ring-necked pheasant', sci: 'Phasianus colchicus', observed: false, media: [], memo: '' }
  ];

  // Small customizable hint text shown under the date widget in edit view.
  // Empty string = no hint. This is NOT the browser's date placeholder.
  const DATE_HINT_TEXT = '';

  // Normalize species objects: support older `notes` -> `memo` migration
  function normalizeSpecies(list){
    if(!Array.isArray(list)) return list;
    list.forEach(s => {
      if (s.memo === undefined) {
        if (s.notes !== undefined) s.memo = s.notes;
        else s.memo = '';
      }
      // keep special, media, observed as-is
      // migrate legacy `notes`
      if (s.notes !== undefined) delete s.notes;
      // migrate legacy `observed` boolean to `observedDate` (use today if true)
      if (s.observedDate === undefined) {
        if (s.observed === true) {
          s.observedDate = new Date().toISOString().slice(0,10); // YYYY-MM-DD
        } else {
          s.observedDate = '';
        }
      }
      if (s.observedChecked === undefined) s.observedChecked = false;
      if (s.observed !== undefined) delete s.observed;
    });
    return list;
  }

  // (Previously had automatic password generation; now users enter their password on signup.)

  const qs = sel => document.querySelector(sel);
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  // Storage helpers
  function userKey(username) { return `bird_user_${username}`; }
  function getCurrentUser() { return localStorage.getItem('bird_current') || null; }
  function setCurrentUser(name) { localStorage.setItem('bird_current', name); }
  function clearCurrentUser() { localStorage.removeItem('bird_current'); }

  // Write species to localStorage with optional sanitization (omit large media data)
  function writeSpeciesToLocal(user, list, keepMediaData = false) {
    try {
      const key = userKey(user || 'guest');
      const copy = Array.isArray(list) ? JSON.parse(JSON.stringify(list)) : [];
      copy.forEach(sp => {
        if (Array.isArray(sp.media)) {
          sp.media = sp.media.map(m => {
            if (keepMediaData && m.data) return m; // keep full object only if explicitly requested
            return { name: m.name || null, type: m.type || null, url: m.url || null, path: m.path || null };
          });
        }
      });
      localStorage.setItem(key, JSON.stringify(copy));
      return true;
    } catch (e) {
      console.warn('[LOCAL WRITE] failed', e);
      return false;
    }
  }

  async function loadSpeciesFor(user) {
    // If Supabase is configured and a client exists, try loading from Supabase 'profiles' table (species JSON)
    if (supabaseClient && user) {
      try {
        // If the provided `user` is not a UUID (e.g. an email used during local fallback),
        // attempt to resolve the currently authenticated Supabase user id.
        const resolvedUserId = await resolveSupabaseUserId(user);
        if (!resolvedUserId) {
          console.debug('[LOAD] could not resolve supabase user id for', user, 'falling back to localStorage');
          // fall through to localStorage fallback
        } else {
          const { data, error } = await supabaseClient
            .from('profiles')
            .select('species')
            .eq('user_id', resolvedUserId)
            .single();
          if (error && error.code !== 'PGRST116') {
            console.warn('Supabase load error', error);
          }
          if (data && data.species) return normalizeSpecies(data.species);
          // Remote has no stored species for this user. DO NOT auto-upsert defaults here —
          // auto-upserting when a user simply logs in can overwrite another device's data.
          mediaLog('remote-no-species', { resolvedUserId });
          return normalizeSpecies(structuredClone(DEFAULT_SPECIES));
        }
      } catch (e) { console.warn(e); }
    }
    // fallback: localStorage
    const key = userKey(user || 'guest');
    const raw = localStorage.getItem(key);
    if (!raw) {
      try {
        localStorage.setItem(key, JSON.stringify(DEFAULT_SPECIES));
        try { persistBackupLocal(); } catch(e) { console.warn('[BACKUP] persist after init failed', e); }
      } catch (e) {
        console.error('[LOAD] localStorage.setItem failed while initializing default species', e);
        alert('로컬 저장소에 기본 데이터를 쓸 수 없습니다. 브라우저 저장공간을 확인하세요.');
      }
      return normalizeSpecies(structuredClone(DEFAULT_SPECIES));
    }
    try { return normalizeSpecies(JSON.parse(raw)); } catch(e) { return normalizeSpecies(structuredClone(DEFAULT_SPECIES)); }
  }

  async function saveSpeciesFor(user, list) {
    if (supabaseClient && user) {
      try {
        // Ensure we have a valid UUID user id for Supabase. If the `user` value looks like
        // an email (from local fallback), try to resolve the authenticated user's UUID.
        const resolvedUserId = await resolveSupabaseUserId(user);
        if (!resolvedUserId) {
          console.warn('[SAVE] could not resolve supabase user id for', user);
          alert('Supabase에 저장하려면 정상적으로 로그인된 사용자가 필요합니다. 현재는 로컬 저장으로 대체됩니다.');
          // fall through to localStorage save
        } else {
          // profiles 테이블에 species JSON 전체를 저장 using resolved UUID
          // sanitize media entries to avoid uploading large embedded data URIs
          const sanitized = (Array.isArray(list) ? JSON.parse(JSON.stringify(list)) : []).map(sp => {
            const copy = Object.assign({}, sp);
            if (Array.isArray(copy.media)) {
              copy.media = copy.media.map(m => ({ name: m.name || null, type: m.type || null, url: m.url || null, path: m.path || null }));
            }
            return copy;
          });
          const { data, error } = await supabaseClient
            .from('profiles')
            .upsert({ user_id: resolvedUserId, species: sanitized }, { returning: 'minimal' });
          if (error) { console.warn('Supabase save error', error); alert('저장 실패: ' + (error.message || JSON.stringify(error))); return; }
          try { persistBackupLocal(); } catch (e) { console.warn('[BACKUP] persist after supabase save failed', e); }
          return;
        }
      } catch (e) { console.warn(e); }
    }
    // fallback to localStorage
    try {
      const ok = writeSpeciesToLocal(user || 'guest', list, false);
      try { persistBackupLocal(); } catch(e) { console.warn('[BACKUP] persist after save failed', e); }
      if (!ok) {
        console.error('[SAVE] localStorage write reported failure');
        alert('로컬 저장에 실패했습니다. 브라우저 저장공간이 가득 찼을 수 있습니다. 콘솔을 확인하세요.');
      }
    } catch (e) {
      console.error('[SAVE] localStorage.setItem failed', e);
      alert('로컬 저장에 실패했습니다. 브라우저 저장공간이 가득 찼을 수 있습니다. 콘솔을 확인하세요.');
    }
  }

  // Views
  function showView(id) {
    qsa('.view').forEach(v => v.classList.add('hidden'));
    const el = qs(`#${id}`);
    if (el) el.classList.remove('hidden');
    // toggle edit fixed bar
    const fixed = qs('#editFixedBar');
    if (fixed) {
      if (id === 'editView') fixed.classList.remove('hidden');
      else fixed.classList.add('hidden');
    }
    // toggle observed count badge visibility (show on list/edit views)
    const badge = qs('#observedCountBadge');
    if (badge) {
      if (id === 'listView' || id === 'editView') badge.classList.remove('hidden');
      else badge.classList.add('hidden');
    }
    // toggle floating controls
    const sb = qs('#scrollTopBtn');
    const toc = qs('#familyToc');
    if (sb) {
      if (id === 'listView' || id === 'editView') sb.classList.remove('hidden'); else sb.classList.add('hidden');
    }
    if (toc) {
      if (id === 'listView' || id === 'editView') toc.classList.remove('hidden'); else toc.classList.add('hidden');
    }
  }

  // Update observed count badge content
  function updateObservedCount() {
    const el = qs('#observedCount');
    if (!el) return;
    const count = Array.isArray(species) ? species.filter(s => !s.isSubspecies && (s._computedObserved !== undefined ? s._computedObserved : isObservedForDisplay(s))).length : 0;
    el.textContent = String(count);
  }

  // Determine if a species (parent or subspecies) should be shown as observed
  function isObservedForDisplay(s) {
    if (!s) return false;
    // debug
    console.debug(`[OBS CHECK] id=${s.id} kor=${s.kor} isSub=${s.isSubspecies} observedDate=${s.observedDate}`);
    if (s.isSubspecies) return Boolean((s.observedDate && String(s.observedDate).trim().length > 0) || s.observedChecked);
    // parent: observed if any child subspecies observed or parent itself has date
    if (Array.isArray(s.children) && s.children.length > 0) {
      return s.children.some(id => {
        const child = species.find(x => String(x.id) === String(id));
        const res = child && ((child.observedDate && String(child.observedDate).trim().length > 0) || child.observedChecked);
        // debug
        console.debug(`[OBS CHILD CHECK] parent=${s.id} (${s.kor}) child=${child && child.id} (${child && child.kor}) observed=${res} childDate=${child && child.observedDate}`);
        return res;
      });
    }
    return Boolean((s.observedDate && String(s.observedDate).trim().length > 0) || s.observedChecked);
  }

  // Compute and cache observed flag for all species (call after buildHierarchy or after saving)
  function computeObservedFlags() {
    if (!Array.isArray(species)) return;
    species.forEach(s => {
      const computed = isObservedForDisplay(s);
      s._computedObserved = computed;
      // debug
      console.debug(`[OBS] id=${s.id} kor=${s.kor} isSub=${s.isSubspecies} computed=${computed} observedDate=${s.observedDate}`);
    });
  }

  // Utility: slugify family name for id attributes
  function slugify(name) {
    // Preserve unicode letters (including Korean), numbers and hyphens.
    // Use unicode-aware regex to strip only punctuation/control characters.
    const s = String(name || '').toLowerCase().trim();
      return s.replace(/\s+/g, '-').replace(/[^ \p{L}\p{N}\-]+/gu, '').replace(/-+/g, '-');
  }

  // Update or create family TOC element with given family list (in order)
  function updateFamilyToc(families) {
    let toc = qs('#familyToc');
    if (!toc) {
      toc = document.createElement('div'); toc.id = 'familyToc'; document.body.appendChild(toc);
    }
    toc.innerHTML = '';
    // add simple search input at top
    const searchWrap = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'search'; input.id = 'familySearchInput'; input.placeholder = '종 이름 검색';
    input.style.width = '180px'; input.style.marginBottom = '6px';
    searchWrap.appendChild(input);
    const searchBtn = document.createElement('button');
    searchBtn.textContent = '이동';
    searchBtn.style.marginLeft = '6px';
    searchWrap.appendChild(searchBtn);
    toc.appendChild(searchWrap);

    if (!Array.isArray(families) || families.length === 0) return;
    families.forEach(f => {
      const btn = document.createElement('button');
      btn.textContent = f;
      btn.addEventListener('click', () => {
        // prefer active view header: try edit view header first if edit visible, else list
        const famSlug = slugify(f);
        const editVisible = qs('#editView') && !qs('#editView').classList.contains('hidden');
        const listVisible = qs('#listView') && !qs('#listView').classList.contains('hidden');
        let target = null;
        if (editVisible) target = qs('#family-edit-' + famSlug);
        if (!target && listVisible) target = qs('#family-list-' + famSlug);
        if (!target) {
          // fallback: try either id
          target = qs('#family-list-' + famSlug) || qs('#family-edit-' + famSlug);
        }
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      toc.appendChild(btn);
    });

    // search logic: find first matching species by kor or sci in active view and scroll
    function performSearch() {
      const q = (input.value || '').trim().toLowerCase();
      if (!q) return;
      // find species by kor or sci contains
      let found = null;
      for (const s of species) {
        if ((s.kor || '').toLowerCase().includes(q) || (s.sci || '').toLowerCase().includes(q)) { found = s; break; }
      }
      if (!found) return;
      const editVisible = qs('#editView') && !qs('#editView').classList.contains('hidden');
      const listVisible = qs('#listView') && !qs('#listView').classList.contains('hidden');
      let sel = null;
      if (editVisible) sel = qs(`#species-edit-${found.id}`);
      if (!sel && listVisible) sel = qs(`#species-list-${found.id}`);
      if (!sel) sel = qs(`#species-list-${found.id}`) || qs(`#species-edit-${found.id}`);
      if (sel) sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    searchBtn.addEventListener('click', performSearch);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });
  }

  // Create floating controls (top button + toc) if not exist
  function createFloatingControls() {
    if (!qs('#scrollTopBtn')) {
      const b = document.createElement('div');
      b.id = 'scrollTopBtn'; b.title = 'TOP'; b.textContent = 'TOP';
      b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      b.classList.add('hidden');
      document.body.appendChild(b);
    }
    if (!qs('#familyToc')) {
      const t = document.createElement('div'); t.id = 'familyToc'; document.body.appendChild(t);
      t.classList.add('hidden');
    }
  }

  // Build parent-child relationships for subspecies (sci with 3+ words)
  function buildHierarchy(list) {
    if (!Array.isArray(list)) return;
    // clear previous metadata
    list.forEach(it => { delete it.isSubspecies; delete it.parentId; delete it.children; });
    // exceptions: treat these bases (or korean names) NOT as subspecies even if sci has 3 words
    const exceptionBases = new Set(['Columba livia']);
    const exceptionKor = new Set(['집비둘기']);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const sci = (s.sci || '').trim();
      if (!sci) continue;
      const words = sci.split(/\s+/).filter(Boolean);
      if (words.length >= 3) {
        // subspecies: find parent by matching first two words in previous items
        const base = words[0] + ' ' + words[1];
        // exception check: if base or kor is in exceptions, treat as species, not subspecies
        if (exceptionBases.has(base) || exceptionKor.has((s.kor||'').trim())) {
          s.isSubspecies = false;
          continue;
        }
        let parent = null;
        // Try to find a parent species matching the first two words of the subspecies.
        // Search the entire list (not only previous items) to be robust against ordering differences.
        for (let j = 0; j < list.length; j++) {
          if (j === i) continue;
          const cand = list[j];
          const candSci = (cand.sci || '').trim();
          if (!candSci) continue;
          const candWords = candSci.split(/\s+/).filter(Boolean);
          if (candWords.length >= 2 && (candWords[0] + ' ' + candWords[1]) === base) {
            parent = cand; break;
          }
        }
        s.isSubspecies = true;
        // clear special notes for subspecies (user requested)
        s.special = '';
        if (parent) {
          s.parentId = parent.id;
          parent.children = parent.children || [];
          parent.children.push(s.id);
          // debug
          console.debug(`[HIER] parent=${parent.id} (${parent.kor}) <- child=${s.id} (${s.kor}) base=${base}`);
        }
      } else {
        s.isSubspecies = false;
      }
    }
    // ensure parents with children do not have observedDate (keep checkbox state)
    list.forEach(it => {
      if (Array.isArray(it.children) && it.children.length > 0) {
        if (it.observedDate) {
          console.debug(`[HIER CLEAN] clearing observedDate for parent id=${it.id} kor=${it.kor}`);
        }
        it.observedDate = '';
      }
    });
    // assign display numbers like 1, 2 and subspecies 1-1, 1-2
    assignDisplayNumbers(list);
    // debug summary
    try {
      const parentsWithChildren = list.filter(x => Array.isArray(x.children) && x.children.length>0).length;
      console.debug(`[HIER] built hierarchy: items=${list.length} parentsWithChildren=${parentsWithChildren}`);
    } catch(e) {}
  }

  // Assign human-friendly display numbers: parent -> 1,2,... ; subspecies -> 1-1,1-2...
  function assignDisplayNumbers(list) {
    if (!Array.isArray(list)) return;
    const ordered = [...list].sort((a,b) => (Number(a.id)||0) - (Number(b.id)||0));
    let seq = 1;
    const mapById = new Map(list.map(i => [String(i.id), i]));
    for (const item of ordered) {
      if (item.isSubspecies) continue;
      item.displayNumber = String(seq);
      // if parent has children, ensure children have no display number (subspp show no number)
      if (Array.isArray(item.children) && item.children.length > 0) {
        const childrenOrdered = item.children.map(id => mapById.get(String(id))).filter(Boolean).sort((a,b)=> (Number(a.id)||0) - (Number(b.id)||0));
        for (const c of childrenOrdered) {
          c.displayNumber = '';
        }
      }
      seq++;
    }
    // For any remaining items (e.g., subspecies that didn't get number), ensure they have displayNumber
    for (const it of ordered) {
      if (!it.displayNumber) it.displayNumber = '';
    }
  }

  // App state
  let species = [];
  let currentUser = null;
  // List view toggle: when true, show dates in observed column; when false, show 'O'
  let listShowDates = false;

  // Render list view
  async function renderList(filter='all') {
    // ensure hierarchy is up-to-date
    buildHierarchy(species);
    // recompute observed flags so parent state reflects any subspecies dates
    computeObservedFlags();
    const container = qs('#listContainer');
    container.innerHTML = '';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th>번호</th><th>국명</th><th>학명</th><th>관찰여부</th><th>미디어</th><th>특이사항</th><th>메모</th></tr>`;
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    // Render in original/id order and insert family header rows when family changes
    const ordered = [...species].sort((a,b) => (Number(a.id)||0) - (Number(b.id)||0));
    let lastFamily = null;
    let displayCounter = 1;
    const familiesSeen = [];
    for (const s of ordered) {
      const observedFlag = (s._computedObserved !== undefined) ? s._computedObserved : isObservedForDisplay(s);
      if (filter === 'observed' && !observedFlag) continue;
      if (filter === 'not' && observedFlag) continue;
      if (s.family !== lastFamily) {
        const fh = document.createElement('tr');
        fh.className = 'family-row';
        const famName = s.family || '기타';
        const famId = 'family-list-' + slugify(famName);
        fh.id = famId;
        fh.innerHTML = `<td colspan="7" style="background:#eef7ef;font-weight:700;">${famName}</td>`;
        tbody.appendChild(fh);
        lastFamily = s.family;
        familiesSeen.push(famName);
      }
      const tr = document.createElement('tr');
      const mediaBtn = (s.media && s.media.length) ? `<button class="media-btn" data-id="${s.id}">보기</button>` : '';
      const computedObserved = (s._computedObserved !== undefined) ? s._computedObserved : isObservedForDisplay(s);
      // decide display content based on toggle
      let obsDisplay = '';
      if (listShowDates) {
        // If this item has children (is a parent), show 'O' when observed (do not show child dates)
        if (Array.isArray(s.children) && s.children.length > 0) {
          obsDisplay = computedObserved ? 'O' : '';
        } else if (s.observedDate && String(s.observedDate).trim().length > 0) {
          // leaf species with its own date
          obsDisplay = s.observedDate;
        } else if (s.observedChecked) {
          // checked but no date -> show 'O' even in date view
          obsDisplay = 'O';
        } else {
          obsDisplay = '';
        }
      } else {
        obsDisplay = computedObserved ? 'O' : '';
      }
      // build tooltip: show own date if present, otherwise list child dates/checks
      const esc = txt => String(txt || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
      let tooltip = '';
      if (s.observedDate && String(s.observedDate).trim().length > 0) {
        tooltip = s.observedDate;
      } else if (Array.isArray(s.children) && s.children.length > 0) {
        const parts = [];
        for (const cid of s.children) {
          const child = species.find(x => String(x.id) === String(cid));
          if (!child) continue;
          if (child.observedDate && String(child.observedDate).trim().length > 0) parts.push(`${child.kor}: ${child.observedDate}`);
          else if (child.observedChecked) parts.push(`${child.kor}: (체크)`);
        }
        tooltip = parts.join('; ');
      }
      const titleAttr = tooltip ? ` title="${esc(tooltip)}"` : '';
      if (s.isSubspecies) {
        tr.className = 'subspecies-row';
        tr.id = `species-list-${s.id}`;
        tr.innerHTML = `
          <td>${s.displayNumber || ''}</td>
          <td class="subspecies-indent">${s.kor}</td>
          <td><em>${s.sci}</em></td>
          <td style="text-align:center;"${titleAttr}>${obsDisplay}</td>
          <td style="text-align:center;">${mediaBtn}</td>
          <td>${s.special || ''}</td>
          <td>${s.memo || ''}</td>
        `;
      } else {
        tr.id = `species-list-${s.id}`;
        tr.innerHTML = `
          <td>${s.displayNumber || ''}</td>
          <td>${s.kor}</td>
          <td><em>${s.sci}</em></td>
          <td style="text-align:center;"${titleAttr}>${obsDisplay}</td>
          <td style="text-align:center;">${mediaBtn}</td>
          <td>${s.special || ''}</td>
          <td>${s.memo || ''}</td>
        `;
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    container.appendChild(tbl);
    updateFamilyToc(familiesSeen);
    // attach media button handler via single click handler (avoid duplicate listeners)
    container.onclick = (e) => {
      const btn = e.target.closest && e.target.closest('.media-btn');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      openMediaModalFor(id);
    };
    // update badge
    updateObservedCount();
  }

  // Render edit view
  function renderEdit() {
    // ensure hierarchy is up-to-date
    buildHierarchy(species);
    computeObservedFlags();
    const cont = qs('#editContainer');
    cont.innerHTML = '';
    const tbl = document.createElement('table');
    tbl.innerHTML = `<thead><tr><th>번호</th><th>국명</th><th>학명</th><th>관찰여부</th><th>미디어 추가</th><th>특이사항</th><th>메모</th></tr></thead>`;
    const tbody = document.createElement('tbody');

    // Render in id order and insert family header rows
    const ordered = [...species].sort((a,b) => (Number(a.id)||0) - (Number(b.id)||0));
    let lastFamily = null;
    const familiesSeen = [];
    for (const s of ordered) {
      if (s.family !== lastFamily) {
        const fh = document.createElement('tr');
        fh.className = 'family-row';
        const famName = s.family || '기타';
        const famId = 'family-edit-' + slugify(famName);
        fh.id = famId;
        fh.innerHTML = `<td colspan="7" style="background:#eef7ef;font-weight:700;">${famName}</td>`;
        tbody.appendChild(fh);
        lastFamily = s.family;
        familiesSeen.push(famName);
      }
      const tr = document.createElement('tr');
      const mediaInputId = `media_input_${s.id}`;
      const memoId = `memo_${s.id}`;
      // Observed checkbox (only for subspecies or parents without children)
      const hasChildren = Array.isArray(s.children) && s.children.length > 0;
      const showChk = s.isSubspecies || !hasChildren;
      const chkHtml = showChk ? `<input type="checkbox" id="obs_chk_${s.id}" data-id="${s.id}" class="obs-chk" ${s.observedChecked ? 'checked' : ''}>` : '';
      // If this is a subspecies, allow date input; if this is a parent with children, omit date inputs and checkbox
      if (s.isSubspecies) {
        tr.className = 'subspecies-row';
        tr.id = `species-edit-${s.id}`;
        tr.innerHTML = `
          <td>${s.displayNumber || ''}</td>
          <td class="subspecies-indent">${s.kor}</td>
          <td><em>${s.sci}</em></td>
          <td>
            <div style="display:flex;flex-direction:column;align-items:center;">
              <input type="date" id="obs_date_${s.id}" data-id="${s.id}" class="obs-date" value="${s.observedDate || ''}" style="margin:2px 0;">
              ${chkHtml ? `<div style="margin-top:6px;">${chkHtml}</div>` : ''}
              ${DATE_HINT_TEXT ? `<div class="date-hint" style="font-size:12px;color:#666;margin-top:4px;">${DATE_HINT_TEXT}</div>` : ''}
            </div>
          </td>
          <td>
            <input type="file" id="${mediaInputId}" data-id="${s.id}" accept="image/*,audio/*,video/*" multiple>
          </td>
          <td>${s.special || ''}</td>
          <td>
            <div class="media-preview" id="preview_${s.id}"></div>
            <textarea id="${memoId}" placeholder="메모">${s.memo || ''}</textarea>
          </td>`;
      } else {
        // parent species: show checkbox; date inputs only if no subspecies
        const dateCell = hasChildren ? '' : `<div style="display:flex;flex-direction:column;align-items:center;"><input type="date" id="obs_date_${s.id}" data-id="${s.id}" class="obs-date" value="${s.observedDate || ''}" style="margin:2px 0;">${chkHtml ? `<div style="margin-top:6px;">${chkHtml}</div>` : ''}${DATE_HINT_TEXT ? `<div class=\"date-hint\" style=\"font-size:12px;color:#666;margin-top:4px;\">${DATE_HINT_TEXT}</div>` : ''}</div>`;
        tr.id = `species-edit-${s.id}`;
        tr.innerHTML = `
          <td>${s.displayNumber || ''}</td>
          <td>${s.kor}</td>
          <td><em>${s.sci}</em></td>
          <td>${dateCell}</td>
          <td>
            <input type="file" id="${mediaInputId}" data-id="${s.id}" accept="image/*,audio/*,video/*" multiple>
          </td>
          <td>${s.special || ''}</td>
          <td>
            <div class="media-preview" id="preview_${s.id}"></div>
            <textarea id="${memoId}" placeholder="메모">${s.memo || ''}</textarea>
          </td>`;
      }
      tbody.appendChild(tr);

      // After adding row, attach file change listener
      setTimeout(() => {
        const inp = qs(`#${mediaInputId}`);
        const preview = qs(`#preview_${s.id}`);
        // show existing media (with delete buttons)
        if (s.media && s.media.length) {
          s.media.forEach((m, idx) => {
            const node = createMediaPreviewNode(m, s.id, idx);
            preview.appendChild(node);
          });
        }
        // attach change handlers for date, checkbox and memo to auto-save
        try {
          const dateEl = qs(`#obs_date_${s.id}`);
          const chkEl = qs(`#obs_chk_${s.id}`);
          const memoEl = qs(`#memo_${s.id}`);
          const scheduleAutoSave = () => {
            try {
              if (window._speciesAutoSaveTimer) clearTimeout(window._speciesAutoSaveTimer);
              window._speciesAutoSaveTimer = setTimeout(async () => {
                try {
                  if (currentUser) {
                    await saveSpeciesFor(currentUser, species);
                    mediaLog('autosave-supabase', { user: currentUser, count: species.length });
                  } else {
                    try { writeSpeciesToLocal('guest', species, false); } catch(e) { console.warn('[AUTOSAVE] local write failed', e); }
                    try { persistBackupLocal(); } catch(e) { console.warn('[AUTOSAVE] persist backup failed', e); }
                    mediaLog('autosave-local', { count: species.length });
                  }
                } catch (e) { console.warn('[AUTOSAVE] failed', e); mediaLog('autosave-failed', { error: String(e) }); }
              }, 800);
            } catch (e) { console.warn('[AUTOSAVE] schedule failed', e); }
          };
          if (dateEl) dateEl.addEventListener('change', (ev) => { s.observedDate = ev.target.value || ''; scheduleAutoSave(); });
          if (chkEl) chkEl.addEventListener('change', (ev) => { s.observedChecked = !!ev.target.checked; scheduleAutoSave(); });
          if (memoEl) memoEl.addEventListener('input', (ev) => { s.memo = ev.target.value; scheduleAutoSave(); });
        } catch (e) { console.debug('[ATTACH HANDLERS] failed', e); }
        inp && inp.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files || []);
          mediaLog('media-input-change', { speciesId: s.id, fileCount: files.length, files: files.map(f => ({ name: f.name, type: f.type, size: f.size })) });
          for (const f of files) {
            // If Supabase is configured, upload to storage and store public URL
            if (supabaseClient && currentUser) {
              try {
                const path = `user_${currentUser}/species_${s.id}/${Date.now()}_${f.name}`;
                mediaLog('upload-start', { speciesId: s.id, file: f.name, path });
                // create a local preview immediately so user sees the uploaded file even if the storage URL is private
                const localPreview = await readFileAsDataURL(f);
                const { data, error } = await supabaseClient.storage.from('media').upload(path, f);
                if (error) {
                  console.warn('upload error', error);
                  mediaLog('upload-error', { speciesId: s.id, file: f.name, path, error });
                }
                const { data: urlData } = supabaseClient.storage.from('media').getPublicUrl(path);
                const publicUrl = urlData && urlData.publicUrl ? urlData.publicUrl : '';
                s.media = s.media || [];
                // store url and storage path (DO NOT store large base64 data when using Supabase)
                s.media.push({ name: f.name, type: f.type, url: publicUrl, path });
                mediaLog('upload-success', { speciesId: s.id, file: f.name, path, publicUrl });
                try { persistBackupLocal(); } catch (e) { console.warn('[BACKUP] persist after upload failed', e); }
                // show immediate local preview
                addMediaPreviewElement(preview, { name: f.name, type: f.type, data: localPreview });
                // immediately persist species (Supabase if available, otherwise local)
                try {
                  if (currentUser) {
                    await saveSpeciesFor(currentUser, species);
                    mediaLog('save-after-upload', { speciesId: s.id, user: currentUser });
                  } else {
                    try { writeSpeciesToLocal('guest', species, false); } catch(e) { console.warn('[UPLOAD SAVE] local write failed', e); }
                    try { persistBackupLocal(); } catch(e) { console.warn('[UPLOAD SAVE] persist backup failed', e); }
                    mediaLog('save-after-upload-local', { speciesId: s.id });
                  }
                } catch (e) { console.warn('[UPLOAD SAVE] failed', e); mediaLog('save-after-upload-failed', { error: String(e) }); }
              } catch (e) { console.warn(e); mediaLog('upload-exception', { speciesId: s.id, file: f.name, error: String(e) }); }
            } else {
              mediaLog('local-add-start', { speciesId: s.id, file: f.name });
              const data = await readFileAsDataURL(f);
                    s.media = s.media || [];
                    s.media.push({ name: f.name, type: f.type, data });
              // append preview node with delete button (index is last)
              const newIdx = s.media.length - 1;
              preview.appendChild(createMediaPreviewNode(s.media[newIdx], s.id, newIdx));
              mediaLog('local-add-success', { speciesId: s.id, file: f.name, mediaIndex: newIdx });
              try { persistBackupLocal(); } catch (e) { console.warn('[BACKUP] persist after local add failed', e); }
            }
          }
          // clear input
          inp.value = '';
        });
      }, 0);
    }
    tbl.appendChild(tbody);
    cont.appendChild(tbl);
    updateFamilyToc(familiesSeen);
    // update badge
    updateObservedCount();
  }

  function addMediaPreviewElement(container, media) {
    if (!container) return;
    const src = (media && (media.data || media.url)) || media;
    mediaLog('preview-create', { media: (media && media.name) || null, type: media && media.type, resolvedType: typeof src });
    console.debug('[MEDIA PREVIEW] media:', media, 'resolvedSrcType:', typeof src);
    let finalSrc = src;
    try {
      if (src && typeof src !== 'string' && (src instanceof Blob || (src.constructor && src.constructor.name === 'File'))) {
        finalSrc = URL.createObjectURL(src);
        console.debug('[MEDIA PREVIEW] created objectURL for blob/file');
      }
    } catch (e) { console.debug('[MEDIA PREVIEW] objectURL failed', e); mediaLog('preview-objecturl-failed', { error: String(e) }); }
    if ((media.type || '').startsWith('image')) {
      const img = document.createElement('img');
      img.src = finalSrc;
      img.alt = media && media.name ? media.name : '';
      container.appendChild(img);
    } else if ((media.type || '').startsWith('audio')) {
      const a = document.createElement('audio');
      a.controls = true;
      a.src = finalSrc;
      container.appendChild(a);
    } else if ((media.type || '').startsWith('video')) {
      const v = document.createElement('video');
      v.controls = true;
      v.src = finalSrc;
      v.style.maxWidth = '180px';
      container.appendChild(v);
    } else {
      const p = document.createElement('div');
      p.textContent = media && media.name ? media.name : ('' + finalSrc);
      container.appendChild(p);
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Backup utilities: produce a JSON snapshot and persist to localStorage
  // Also keep a rotating history of backups under `bird_backups` (array of entries)
  function makeBackupPayload() {
    try {
      // create a sanitized snapshot: strip large media data/preview fields
      const cloned = Array.isArray(species) ? JSON.parse(JSON.stringify(species)) : [];
      cloned.forEach(s => {
        if (Array.isArray(s.media)) {
          s.media = s.media.map(m => ({ name: m.name || null, type: m.type || null, url: m.url || null, path: m.path || null }));
        }
      });
      const payload = {
        ts: new Date().toISOString(),
        app: '지금까지 본 새',
        version: 1,
        species: cloned,
        currentUser: currentUser || null
      };
      return payload;
    } catch (e) { console.warn('[BACKUP] make payload failed', e); return null; }
  }

  function persistBackupLocal(payload) {
    try {
      if (!payload) payload = makeBackupPayload();
      if (!payload) return null;
      // main snapshot
      try { localStorage.setItem('bird_backup_latest', JSON.stringify(payload)); } catch (e) { console.warn('[BACKUP] localStorage write failed', e); }
      // history (bounded to 50 entries)
      try {
        const raw = localStorage.getItem('bird_backups');
        let arr = [];
        if (raw) arr = JSON.parse(raw) || [];
        arr.push(payload);
        if (arr.length > 50) arr = arr.slice(-50);
        localStorage.setItem('bird_backups', JSON.stringify(arr));
      } catch (e) { console.warn('[BACKUP] history write failed', e); }
      mediaLog('backup-persisted', { ts: payload.ts, count: (payload.species || []).length });
      return payload;
    } catch (e) { console.warn('[BACKUP] persist failed', e); return null; }
  }

  // Optional: trigger a download of the backup JSON file
  function downloadBackup(payload) {
    try {
      if (!payload) payload = makeBackupPayload();
      if (!payload) return;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bird-backup-${payload.ts.replace(/[:.]/g,'-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch(_){} }, 2000);
      mediaLog('backup-download', { file: a.download });
    } catch (e) { console.warn('[BACKUP] download failed', e); }
  }

  // Create a preview node for a media item with optional delete button (used in edit view)
  function createMediaPreviewNode(media, speciesId, mediaIndex) {
    const wrap = document.createElement('div');
    wrap.className = 'media-item';
    wrap.style.position = 'relative';
    wrap.style.display = 'inline-block';
    wrap.style.marginRight = '8px';
    const src = (media && (media.data || media.url)) || media;
    let finalSrc = src;
    try {
      if (src && typeof src !== 'string' && (src instanceof Blob || (src.constructor && src.constructor.name === 'File'))) {
        finalSrc = URL.createObjectURL(src);
      }
    } catch (e) {}
    if ((media.type || '').startsWith('image')) {
      const img = document.createElement('img');
      img.src = finalSrc;
      img.style.maxWidth = '120px';
      img.style.maxHeight = '90px';
      img.style.borderRadius = '4px';
      wrap.appendChild(img);
    } else if ((media.type || '').startsWith('audio')) {
      const a = document.createElement('audio'); a.controls = true; a.src = finalSrc; a.style.display='block'; a.style.width='140px'; wrap.appendChild(a);
    } else if ((media.type || '').startsWith('video')) {
      const v = document.createElement('video'); v.controls = true; v.src = finalSrc; v.style.maxWidth='140px'; v.style.display='block'; wrap.appendChild(v);
    } else {
      const p = document.createElement('div'); p.textContent = media && media.name ? media.name : ('' + finalSrc); wrap.appendChild(p);
    }
    // delete button
    const del = document.createElement('button');
    del.textContent = '삭제';
    del.className = 'media-delete-btn';
    del.style.position = 'absolute';
    del.style.top = '2px';
    del.style.right = '2px';
    del.style.fontSize = '12px';
    del.style.padding = '2px 6px';
    del.dataset.speciesId = String(speciesId);
    del.dataset.mediaIndex = String(mediaIndex);
    del.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm('이 미디어를 삭제하시겠습니까?')) return;
      const sid = del.dataset.speciesId;
      const midx = Number(del.dataset.mediaIndex);
      const sp = species.find(x => String(x.id) === String(sid));
      if (!sp) return;
      const m = sp.media && sp.media[midx];
      if (!m) return;
      mediaLog('delete-attempt', { speciesId: sid, mediaIndex: midx, media: m.name || null, path: m.path || null });
      // remove from array
      sp.media.splice(midx, 1);
      // attempt to delete from Supabase storage if path present
      if (supabaseClient && m.path) {
        try {
          mediaLog('delete-storage-start', { path: m.path });
          const { data, error } = await supabaseClient.storage.from('media').remove([m.path]);
          if (error) {
            console.debug('[MEDIA DELETE] supabase remove error', error);
            mediaLog('delete-storage-error', { path: m.path, error });
          } else {
            console.debug('[MEDIA DELETE] removed from storage', data);
            mediaLog('delete-storage-success', { path: m.path, data });
          }
        } catch (err) { console.debug('[MEDIA DELETE] remove exception', err); mediaLog('delete-storage-exception', { path: m.path, error: String(err) }); }
      }
      // persist immediately
      try {
        if (currentUser) {
          await saveSpeciesFor(currentUser, species);
        } else {
          writeSpeciesToLocal('guest', species, false);
          try { persistBackupLocal(); } catch (e) { console.warn('[BACKUP] persist after delete failed', e); }
        }
        mediaLog('delete-persisted', { speciesId: sid });
      } catch(e){console.debug('[MEDIA DELETE] save failed', e); mediaLog('delete-persist-failed', { error: String(e) }); }
      // refresh edit view to update indices and previews
      renderEdit();
    });
    wrap.appendChild(del);
    return wrap;
  }

  // Media modal functions
  async function openMediaModalFor(id) {
    const s = species.find(x => x.id === id);
    const modal = qs('#mediaModal');
    const body = qs('#mediaModalBody');
    if (!s || !modal || !body) return;
    mediaLog('open-modal', { speciesId: id, mediaCount: Array.isArray(s.media) ? s.media.length : 0 });
    console.debug('[OPEN MEDIA] id=', id, 'media=', s.media);
    body.innerHTML = '';
    if (!s.media || s.media.length === 0) {
      body.textContent = '미디어가 없습니다.';
      mediaLog('open-modal-empty', { speciesId: id });
    } else {
      for (const m of s.media) {
        const src = (m && (m.data || m.url)) || m;
        console.debug('[OPEN MEDIA ITEM]', m, 'resolvedSrcType=', typeof src);
        let finalSrc = src;
        try {
          if (src && typeof src !== 'string' && (src instanceof Blob || (src.constructor && src.constructor.name === 'File'))) {
            finalSrc = URL.createObjectURL(src);
            console.debug('[OPEN MEDIA] created objectURL for blob/file');
            mediaLog('open-media-objecturl', { speciesId: id, name: m && m.name ? m.name : null });
          }
        } catch (e) { console.debug('[OPEN MEDIA] objectURL failed', e); mediaLog('open-media-objecturl-failed', { error: String(e) }); }
        // If this is a supabase-hosted URL but the bucket is private, try creating a signed URL if we saved the path
        if (typeof finalSrc === 'string' && finalSrc.startsWith('http') && supabaseClient && m.path) {
          try {
            mediaLog('signed-url-attempt', { speciesId: id, path: m.path });
            const { data: signedData, error: signedErr } = await supabaseClient.storage.from('media').createSignedUrl(m.path, 60);
            if (signedErr) { console.debug('[OPEN MEDIA] createSignedUrl error', signedErr); mediaLog('signed-url-error', { path: m.path, error: signedErr }); }
            if (signedData && signedData.signedUrl) {
              finalSrc = signedData.signedUrl;
              console.debug('[OPEN MEDIA] using signed URL for private file');
              mediaLog('signed-url-success', { path: m.path });
            }
          } catch (e) { console.debug('[OPEN MEDIA] signed URL request failed', e); mediaLog('signed-url-exception', { path: m.path, error: String(e) }); }
        }
        if (m.type && m.type.startsWith('image')) {
          const img = document.createElement('img');
          img.src = finalSrc;
          body.appendChild(img);
        } else if (m.type && m.type.startsWith('audio')) {
          const a = document.createElement('audio');
          a.controls = true; a.src = finalSrc;
          body.appendChild(a);
        } else if (m.type && m.type.startsWith('video')) {
          const v = document.createElement('video');
          v.controls = true; v.src = finalSrc; v.style.maxWidth = '100%';
          body.appendChild(v);
        } else {
          const p = document.createElement('div'); p.textContent = m.name || (m.url || '파일'); body.appendChild(p);
        }
      }
    }
    modal.style.display = 'flex';
  }

  function closeMediaModal() {
    const modal = qs('#mediaModal');
    if (modal) modal.style.display = 'none';
    const body = qs('#mediaModalBody'); if (body) body.innerHTML = '';
  }

  // Excel import feature removed — species list is provided by embedded data only.

  // Wire events
  function setupEvents() {
    // Signup form handler
    const signupForm = qs('#signupForm');
    signupForm && signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = qs('#signupEmail').value.trim();
      const pw = qs('#signupPw') ? qs('#signupPw').value : '';
      const pwConfirm = qs('#signupPwConfirm') ? qs('#signupPwConfirm').value : '';
      if (!email) return alert('이메일을 입력하세요');
      if (!pw) return alert('비밀번호를 입력하세요');
      if (pw !== pwConfirm) return alert('비밀번호와 확인이 일치하지 않습니다');
      if (pw.length < 6) return alert('비밀번호는 6자 이상이어야 합니다');
      if (supabaseClient) {
        (async () => {
          try {
            const { data, error } = await supabaseClient.auth.signUp({ email, password: pw });
            if (error) { alert('회원가입 실패: ' + error.message); return; }
            // If user object returned, log them in
            if (data && data.user) {
              currentUser = data.user.id;
              setCurrentUser(currentUser);
              await saveSpeciesFor(currentUser, DEFAULT_SPECIES);
              species = await loadSpeciesFor(currentUser);
              alert('회원가입되었습니다. 자동 로그인합니다.');
              showAppAfterLogin();
            } else {
              // Often Supabase requires email confirmation — inform the user
              qs('#signupInfo').textContent = '회원가입 성공. 인증 이메일을 확인하세요.';
              alert('회원가입 성공. 인증 이메일을 확인하세요.');
              // Pre-fill login form for convenience
              showView('loginView');
              qs('#loginId').value = email; qs('#loginPw').value = pw;
            }
          } catch (err) { console.warn(err); alert('회원가입 중 오류가 발생했습니다.'); }
        })();
      } else {
        // Local fallback: store credentials in localStorage map
        try {
          const raw = localStorage.getItem('bird_local_users');
          const map = raw ? JSON.parse(raw) : {};
          if (map[email]) return alert('이미 존재하는 계정입니다. 로그인하세요.');
          map[email] = pw;
          localStorage.setItem('bird_local_users', JSON.stringify(map));
          // initialize species data for this user
          setCurrentUser(email);
          currentUser = email;
          (async () => { await saveSpeciesFor(currentUser, DEFAULT_SPECIES); species = await loadSpeciesFor(currentUser); showAppAfterLogin(); })();
          alert('회원가입 및 자동 로그인되었습니다.');
        } catch (e) { console.warn(e); alert('로컬 회원가입 실패'); }
      }
    });

    // link to login view
    const toLogin = qs('#toLoginBtn');
    toLogin && toLogin.addEventListener('click', () => { showView('loginView'); });

    // link from login to signup
    const gotoSignup = qs('#gotoSignupBtn');
    gotoSignup && gotoSignup.addEventListener('click', () => { showView('signupView'); });

    const loginForm = qs('#loginForm');
    loginForm && loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = qs('#loginId').value.trim();
      const pw = qs('#loginPw').value || '';
      if (!id) return alert('아이디를 입력하세요');
      if (supabaseClient) {
        // Supabase 사용 시 이메일/비밀번호로 로그인 (id는 이메일로 사용하세요)
        (async () => {
          try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email: id, password: pw });
            if (error) {
              console.error('[LOGIN] supabase error', error);
              // detect missing API key message and fallback to local mode
              const errStr = JSON.stringify(error || '');
              if (errStr.includes('No API key') || errStr.includes('apikey') || (error && (error.message || '').includes('apikey'))) {
                console.error('[LOGIN] Supabase API key appears missing or blocked. Disabling Supabase client and falling back to localStorage.');
                try { supabaseClient = null; } catch(e){}
                alert('Supabase 인증에 필요한 API 키가 누락되었거나 차단되었습니다. 로컬 저장 방식으로 대체합니다.');
                // fallback to local login: treat the entered id as local user
                setCurrentUser(id);
                currentUser = id;
                species = await loadSpeciesFor(currentUser);
                showAppAfterLogin();
                return;
              }
              alert('로그인 실패: ' + (error.message || JSON.stringify(error)));
              return;
            }
            const user = data && data.user;
            if (!user) { console.error('[LOGIN] no user returned', data); alert('로그인 실패: 사용자 없음'); return; }
            currentUser = user.id;
            setCurrentUser(currentUser);
            species = await loadSpeciesFor(currentUser);
            showAppAfterLogin();
          } catch (err) {
            console.error('[LOGIN] exception', err);
            alert('로그인 중 오류가 발생했습니다. 콘솔을 확인하세요.');
          }
        })();
      } else {
        // 기존 local 로그인 (임시)
        setCurrentUser(id);
        currentUser = id;
        (async () => { species = await loadSpeciesFor(currentUser); showAppAfterLogin(); })();
      }
    });

    // Guest login removed

    qs('#menuListBtn') && qs('#menuListBtn').addEventListener('click', () => {
      renderList(qs('#filterSelect').value);
      showView('listView');
    });
    qs('#menuEditBtn') && qs('#menuEditBtn').addEventListener('click', () => {
      renderEdit();
      showView('editView');
    });
    qs('#logoutBtn') && qs('#logoutBtn').addEventListener('click', () => {
      clearCurrentUser();
      currentUser = null;
      species = [];
      qs('#loginId').value = '';
      qs('#loginPw').value = '';
      showView('loginView');
      qs('#mainMenu').classList.add('hidden');
    });

    // 데이터 초기화 UI/버튼 제거됨

    qs('#filterSelect') && qs('#filterSelect').addEventListener('change', (e) => {
      renderList(e.target.value);
    });

    qs('#saveImageBtn') && qs('#saveImageBtn').addEventListener('click', () => {
      const el = qs('#listView');
      html2canvas(el).then(canvas => {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'species-list.png';
        a.click();
      }).catch(err => alert('이미지 저장 중 오류: ' + err));
    });

    // Add "한 눈에 보기" summary button next to the save image button
    (function(){
      const saveBtn = qs('#saveImageBtn');
      if (!saveBtn) return;
      // avoid duplicate
      if (qs('#summaryOverviewBtn')) return;
      const b = document.createElement('button');
      b.id = 'summaryOverviewBtn';
      b.textContent = '한 눈에 보기';
      b.style.marginLeft = '8px';
      b.addEventListener('click', () => {
        openSummaryWindow();
      });
      saveBtn.parentNode && saveBtn.parentNode.insertBefore(b, saveBtn.nextSibling);
      // Add "백업 보기" button for inspecting local backup JSON
      if (!qs('#viewBackupBtn')) {
        const vb = document.createElement('button');
        vb.id = 'viewBackupBtn';
        vb.textContent = '백업 보기';
        vb.style.marginLeft = '8px';
        vb.addEventListener('click', () => {
          showBackups();
        });
        saveBtn.parentNode && saveBtn.parentNode.insertBefore(vb, saveBtn.nextSibling);
      }
    })();

    qs('#saveBtn') && qs('#saveBtn').addEventListener('click', async () => {
      // collect memo and observedDate (year-month, optional -day)
      species.forEach(s => {
        const dateEl = qs(`#obs_date_${s.id}`);
        const chkEl = qs(`#obs_chk_${s.id}`);
        if (dateEl && dateEl.value) {
          s.observedDate = dateEl.value;
        } else {
          // parents with children won't have dateEl; ensure parent dates are cleared
          s.observedDate = '';
        }
        s.observedChecked = !!(chkEl && chkEl.checked);
        // ensure subspecies do not keep special notes
        if (s.isSubspecies) s.special = '';
      });
      species.forEach(s => {
        const memoEl = qs(`#memo_${s.id}`);
        if (memoEl) s.memo = memoEl.value;
      });
      // persist
      if (currentUser) {
        await saveSpeciesFor(currentUser, species);
        alert('저장되었습니다.');
      }
      // rebuild hierarchy and recompute observed flags before rendering list
      buildHierarchy(species);
      computeObservedFlags();
      renderList(qs('#filterSelect').value);
      showView('listView');
    });

    // Backup viewer: open a new window/tab showing latest backup and history
    function showBackups() {
      try {
        const latestRaw = localStorage.getItem('bird_backup_latest') || 'null';
        const historyRaw = localStorage.getItem('bird_backups') || 'null';
        const payload = {
          latest: latestRaw === 'null' ? null : JSON.parse(latestRaw),
          history: historyRaw === 'null' ? null : JSON.parse(historyRaw)
        };
        const w = window.open('', '_blank');
        if (!w) { alert('팝업이 차단되었습니다. 브라우저에서 팝업 허용 후 다시 시도하세요.'); return; }
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bird Backups</title></head><body><h2>Latest Backup</h2><pre id="latest"></pre><h2>Backup History (most recent last)</h2><pre id="history"></pre></body><script>const payload=${JSON.stringify(payload)};document.getElementById('latest').textContent=JSON.stringify(payload.latest,null,2);document.getElementById('history').textContent=JSON.stringify(payload.history,null,2);</script></html>`;
        w.document.open(); w.document.write(html); w.document.close();
        mediaLog('backup-view-opened', { latestExists: !!payload.latest, historyCount: Array.isArray(payload.history) ? payload.history.length : 0 });
      } catch (e) { console.warn('[BACKUP VIEW] failed', e); alert('백업 보기 중 오류가 발생했습니다. 콘솔을 확인하세요.'); }
    }

    qs('#backToListBtn') && qs('#backToListBtn').addEventListener('click', () => {
      renderList(qs('#filterSelect').value);
      showView('listView');
    });

    // Fixed bar buttons (duplicate buttons) should trigger the same actions
    qs('#saveBtnFixed') && qs('#saveBtnFixed').addEventListener('click', () => {
      const orig = qs('#saveBtn'); if (orig) orig.click();
    });
    qs('#backToListBtnFixed') && qs('#backToListBtnFixed').addEventListener('click', () => {
      const orig = qs('#backToListBtn'); if (orig) orig.click();
    });

    // Media modal close
    qs('#closeMediaModal') && qs('#closeMediaModal').addEventListener('click', closeMediaModal);
    // Close modal on backdrop click
    const modalEl = qs('#mediaModal');
    if (modalEl) modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeMediaModal(); });

    // Toggle button for list view: show dates vs show 'O'
    const toggleBtn = qs('#toggleDateBtn');
    function updateToggleButtonLabel() {
      if (!toggleBtn) return;
      toggleBtn.textContent = listShowDates ? 'O 보기' : '날짜 보기';
    }
    if (toggleBtn) {
      updateToggleButtonLabel();
      toggleBtn.addEventListener('click', () => {
        listShowDates = !listShowDates;
        updateToggleButtonLabel();
        renderList(qs('#filterSelect') ? qs('#filterSelect').value : 'all');
      });
    }

    // Excel import UI removed — no handler.
  }

  // Build and open a summary page in a new window showing recent observed birds
  function openSummaryWindow() {
    // Collect observed items: prefer those with observedDate, then checked ones
    const observedWithDate = species.filter(s => s.observedDate && String(s.observedDate).trim().length > 0)
      .map(s => ({ id: s.id, kor: s.kor, sci: s.sci, date: s.observedDate, media: s.media || [] }));
    const observedChecked = species.filter(s => (!s.observedDate || String(s.observedDate).trim().length===0) && s.observedChecked)
      .map(s => ({ id: s.id, kor: s.kor, sci: s.sci, date: '', media: s.media || [] }));
    // sort by date desc (ISO YYYY-MM-DD sorts lexicographically)
    observedWithDate.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
    const items = observedWithDate.concat(observedChecked);

    // map to feed entries with image src (prefer preview/data then url)
    const feed = items.map(it => {
      let img = '';
      if (Array.isArray(it.media) && it.media.length > 0) {
        const m = it.media[0];
        img = m && (m.preview || m.data || m.url) || '';
      }
      return { id: it.id, kor: it.kor, date: it.date, img };
    });

    const win = window.open('', '_blank');
    if (!win) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.'); return; }
    const title = '한 눈에 보기 — 최근 관찰한 새들';
    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f6f6f8;color:#111}
  .header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#fff;border-bottom:1px solid #e6e6e8}
  .container{padding:12px;display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px}
  .card{position:relative;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);cursor:pointer}
  .card img{display:block;width:100%;object-fit:cover;background:#ddd}
  .overlay{position:absolute;left:0;right:0;bottom:0;padding:8px 10px;background:linear-gradient(180deg,transparent,rgba(0,0,0,0.6));color:#fff}
  .name{font-weight:700;font-size:14px}
  .date{font-size:12px;opacity:0.9}
  .empty{padding:40px;text-align:center;color:#666}
  .controls{display:flex;gap:8px}
  button{padding:8px 10px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer}
  /* modal */
  .modal{position:fixed;left:0;top:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:9999}
  .modal .box{background:#000;border-radius:8px;max-width:95%;max-height:95%;overflow:hidden;display:flex;flex-direction:column}
  .modal img{max-width:100%;max-height:80vh;display:block}
  .modal .caption{color:#fff;padding:8px}
  /* cloud */
  .cloudWrap{position:relative;height:700px;background:linear-gradient(180deg,#fff,#fafafa);border-radius:8px;padding:12px;overflow:hidden}
  .cloudItem{position:absolute;white-space:nowrap;color:#222;opacity:0.95;user-select:none}
</style>
</head>
<body>
  <div class="header">
    <div><strong>${title}</strong></div>
    <div class="controls">
      <button id="showRecentBtn">가장 최근에 본 새</button>
      <button id="closeBtn">닫기</button>
    </div>
  </div>
  <div id="feedArea" style="padding:12px">
    <div id="feed" class="container"></div>
    <div id="cloud" class="cloudWrap" style="margin-top:12px"></div>
  </div>
  <div id="modal" class="modal"><div class="box"><img id="modalImg" src=""><div class="caption" id="modalCaption"></div></div></div>
  <script>
    const feedData = ${JSON.stringify(feed)};
    // split by date presence and media
    const dated = feedData.filter(f => f.date && String(f.date).trim().length>0);
    const undated = feedData.filter(f => !f.date || String(f.date).trim().length===0);
    // images feed keeps original ordering (recent first)
    const withImages = feedData.filter(f => f.img && String(f.img).trim().length>0);
    // cloud: items without images, split dated vs undated
    const cloudDatedNoImage = feedData.filter(f => (!f.img || String(f.img).trim().length===0) && f.date && String(f.date).trim().length>0);
    const cloudUndatedNoImage = feedData.filter(f => (!f.img || String(f.img).trim().length===0) && (!f.date || String(f.date).trim().length===0));
    // dedupe by species key (kor, sci, or id) so each species appears only once in the cloud
    function dedupeBySpeciesKey(arr) {
      const seen = new Set();
      const out = [];
      for (const a of arr) {
        if (!a) continue;
        const key = (a.kor || a.sci || a.id || '').toString().trim().toLowerCase();
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(a);
      }
      return out;
    }
    const cloudDatedNoImageUnique = dedupeBySpeciesKey(cloudDatedNoImage);
    const cloudUndatedNoImageUnique = dedupeBySpeciesKey(cloudUndatedNoImage);

    function clearChildren(el){ while(el && el.firstChild) el.removeChild(el.firstChild); }

    function renderList(list) {
      const container = document.getElementById('feed');
      clearChildren(container);
      if (!list || list.length === 0) { container.innerHTML = '<div class="empty">이미지 있는 관찰 항목이 없습니다.</div>'; return; }
      const maxH = 340; const minH = 120;
      const minW = 160; const maxW = 420;
      const len = list.length || 1;
      list.forEach((it, idx) => {
        const c = document.createElement('div'); c.className='card';
        const img = document.createElement('img');
        img.src = it.img || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="%23ddd"/></svg>';
        // scale height and width by recency: earlier index = more recent => larger
        const weight = (len - 1) - idx; // recent items have larger weight
        const h = Math.round(minH + (weight / Math.max(1, len - 1)) * (maxH - minH));
        const w = Math.round(minW + (weight / Math.max(1, len - 1)) * (maxW - minW));
        img.style.height = h + 'px';
        img.style.objectFit = 'cover';
        c.style.flex = '0 0 ' + w + 'px';
        c.appendChild(img);
        const o = document.createElement('div'); o.className='overlay';
        const n = document.createElement('div'); n.className='name'; n.textContent = it.kor || '';
        const d = document.createElement('div'); d.className='date'; d.textContent = it.date || '';
        o.appendChild(n); o.appendChild(d);
        c.appendChild(o);
        c.addEventListener('click', ()=> openModal(it));
        container.appendChild(c);
      });
    }

    function renderCloud(datedList, undatedList, retry=0) {
      const wrap = document.getElementById('cloud');
      clearChildren(wrap);
      if ((!datedList || datedList.length===0) && (!undatedList || undatedList.length===0)) { wrap.innerHTML = '<div class="empty">미디어 없는 관찰 항목이 없습니다.</div>'; return; }
      // We'll place dated items with collision avoidance; undated items fixed small size
      const placedRects = [];
      // normalize arguments: allow either (datedList, undatedList) or a single combined list
      const list = (Array.isArray(datedList) ? datedList : []).concat(Array.isArray(undatedList) ? undatedList : []);
      // helper to test overlap
      function overlaps(r1, r2, pad=6) {
        return !(r1.right + pad < r2.left - pad || r1.left - pad > r2.right + pad || r1.bottom + pad < r2.top - pad || r1.top - pad > r2.bottom + pad);
      }
      // Sort by recency (more recent first)
      const sorted = list.slice();
      // assume list is ordered by recency already; keep as-is
      // temporary measurer (create before checking wrap size so we can remove it on retry)
      const measurer = document.createElement('div');
      measurer.style.position = 'absolute'; measurer.style.visibility='hidden'; measurer.style.whiteSpace='nowrap';
      document.body.appendChild(measurer);
      const wrapRect = wrap.getBoundingClientRect();
      // If popup hasn't finished layout, its size may be zero — retry a few times before proceeding.
      if ((wrapRect.width < 20 || wrapRect.height < 20) && retry < 20) {
        setTimeout(()=> renderCloud(datedList, undatedList, retry+1), 100);
        measurer.remove();
        return;
      }
      for (let i = 0; i < sorted.length; i++) {
        const it = sorted[i];
        const span = document.createElement('div');
        span.className = 'cloudItem';
        const weight = Math.max(0, (sorted.length - 1) - i);
        let fs = 18 + Math.round((weight / Math.max(1, sorted.length - 1)) * 36); // desired font size 18..54
        span.textContent = it.kor || it.id || '';
        span.title = it.date || '';
        // measure and shrink if too wide
        const maxAllowedW = Math.max(60, wrapRect.width * 0.5);
        measurer.style.fontSize = fs + 'px';
        measurer.textContent = span.textContent;
        while ((measurer.offsetWidth + 8) > maxAllowedW && fs > 12) {
          fs -= 1; measurer.style.fontSize = fs + 'px';
        }
        span.style.fontSize = fs + 'px';
        const w = Math.min(wrapRect.width - 6, measurer.offsetWidth + 8);
        const h = Math.min(wrapRect.height - 6, measurer.offsetHeight + 6);
        // try finding a non-overlapping position
        let placed = false;
        const maxAttempts = 300;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // bias recent items to center
          const bias = 1 - (i / Math.max(1, sorted.length - 1)); // 1..0
          const jitterX = (Math.random() - 0.5) * (wrapRect.width * (0.6 * (1 - bias) + 0.1));
          const jitterY = (Math.random() - 0.5) * (wrapRect.height * (0.6 * (1 - bias) + 0.1));
          const cx = wrapRect.width * 0.5 + jitterX;
          const cy = wrapRect.height * (0.45) + jitterY;
          const left = Math.max(4, Math.min(wrapRect.width - w - 4, Math.round(cx - w / 2)));
          const top = Math.max(4, Math.min(wrapRect.height - h - 4, Math.round(cy - h / 2)));
          const rect = { left, top, right: left + w, bottom: top + h };
          let hit = false;
          for (const pr of placedRects) {
            if (overlaps(pr, rect, 6)) { hit = true; break; }
          }
          if (!hit) {
            // place here (use px coordinates to avoid percent/zero-size issues)
            span.style.left = left + 'px';
            span.style.top = top + 'px';
            // font size already set
            wrap.appendChild(span);
            placedRects.push(rect);
            placed = true;
            break;
          }
          // place undated items with fixed small size, avoid overlap by shifting if needed
          const undSize = 12;
          for (let j = 0; j < (undatedList || []).length; j++) {
            const it = undatedList[j];
            const span = document.createElement('div'); span.className='cloudItem'; span.textContent = it.kor || it.id || ''; span.title = it.date || '';
            span.style.fontSize = undSize + 'px';
            // try to place near bottom-left area with attempts
            const measurer2 = document.createElement('div'); measurer2.style.position='absolute'; measurer2.style.visibility='hidden'; measurer2.style.whiteSpace='nowrap'; measurer2.style.fontSize = undSize + 'px'; measurer2.textContent = span.textContent; document.body.appendChild(measurer2);
            const w2 = Math.min(wrapRect.width - 6, measurer2.offsetWidth + 8);
            const h2 = Math.min(wrapRect.height - 6, measurer2.offsetHeight + 6);
            document.body.removeChild(measurer2);
            let placed = false;
            for (let attempt=0; attempt<100; attempt++) {
              const left = Math.round(Math.random() * (wrapRect.width - w2 - 8) + 4);
              const top = Math.round(wrapRect.height * 0.6 + Math.random() * (wrapRect.height*0.35));
              const rect = { left, top, right: left + w2, bottom: top + h2 };
              let hit=false; for (const pr of placedRects) { if (overlaps(pr, rect, 4)) { hit=true; break; } }
              if (!hit) { span.style.left = left + 'px'; span.style.top = top + 'px'; wrap.appendChild(span); placedRects.push(rect); placed=true; break; }
            }
            if (!placed) { // fallback
              const left = Math.max(4, Math.min(wrapRect.width - w2 - 4, Math.round(Math.random() * (wrapRect.width - w2 - 8) + 4)));
              const top = Math.max(4, Math.min(wrapRect.height - h2 - 4, Math.round(Math.random() * (wrapRect.height - h2 - 8) + 4)));
              span.style.left = left + 'px'; span.style.top = top + 'px'; wrap.appendChild(span); placedRects.push({ left, top, right: left + w2, bottom: top + h2 });
            }
          }
        }
        if (!placed) {
          // fall back: place at random without checking
          const left = Math.max(4, Math.min(wrapRect.width - w - 4, Math.round(Math.random() * (wrapRect.width - w - 8) + 4)));
          const top = Math.max(4, Math.min(wrapRect.height - h - 4, Math.round(Math.random() * (wrapRect.height - h - 8) + 4)));
          span.style.left = left + 'px';
          span.style.top = top + 'px';
          wrap.appendChild(span);
          placedRects.push({ left, top, right: left + w, bottom: top + h });
        }
      }
      measurer.remove();
    }

    function openModal(item){
      const modal = document.getElementById('modal');
      const img = document.getElementById('modalImg');
      const cap = document.getElementById('modalCaption');
      img.src = item.img || '';
      cap.textContent = (item.kor ? item.kor + (item.date ? ' — ' + item.date : '') : (item.date || ''));
      modal.style.display = 'flex';
    }
    document.getElementById('modal').addEventListener('click', (e)=>{ if (e.target.id === 'modal' || e.target.id==='modalImg') document.getElementById('modal').style.display='none'; });

    document.getElementById('showRecentBtn').addEventListener('click', ()=>{ renderList(withImages); renderCloud(cloudDatedNoImageUnique, cloudUndatedNoImageUnique); });
    document.getElementById('closeBtn').addEventListener('click', ()=> window.close());
    // initial render
    renderList(withImages);
    renderCloud(cloudDatedNoImageUnique, cloudUndatedNoImageUnique);
  </script>
</body>
</html>
`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function showAppAfterLogin() {
    qs('#mainMenu').classList.remove('hidden');
    buildHierarchy(species);
    computeObservedFlags();
    renderList('all');
    showView('listView');
  }

  function init() {
    createFloatingControls();
    currentUser = getCurrentUser();
    if (currentUser) {
      (async () => {
        species = await loadSpeciesFor(currentUser);
        showAppAfterLogin();
      })();
    } else {
      showView('loginView');
    }
    setupEvents();
  }

  document.addEventListener('DOMContentLoaded', init);

})();

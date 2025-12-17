(() => {
  // --- Supabase 설정 ---
  // 아래 값을 프로젝트에서 받은 값으로 설정합니다.
  const SUPABASE_URL = 'https://cfwentohujfxavvgmnlx.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmd2VudG9odWpmeGF2dmdtbmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNTk4MDMsImV4cCI6MjA4MDkzNTgwM30.Gup2zHT1y0kFkC2JMmjUHuWckojLqX3rIWFET1bwQaE';
  const USE_SUPABASE = true; // Supabase 사용 여부 — 현재 로컬 테스트용으로 false로 설정
  let supabaseClient = null;

  if (USE_SUPABASE && typeof supabase !== 'undefined') {
    try { supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e) { console.warn('Supabase init failed', e); supabaseClient = null; }
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

  async function loadSpeciesFor(user) {
    // If Supabase is configured and a client exists, try loading from Supabase 'profiles' table (species JSON)
    if (supabaseClient && user) {
      try {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('species')
          .eq('user_id', user)
          .single();
        if (error && error.code !== 'PGRST116') {
          console.warn('Supabase load error', error);
        }
        if (data && data.species) return normalizeSpecies(data.species);
        // 없으면 기본값을 저장
        await supabaseClient.from('profiles').upsert({ user_id: user, species: DEFAULT_SPECIES });
        return normalizeSpecies(structuredClone(DEFAULT_SPECIES));
      } catch (e) { console.warn(e); }
    }
    // fallback: localStorage
    const key = userKey(user || 'guest');
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(DEFAULT_SPECIES));
      return normalizeSpecies(structuredClone(DEFAULT_SPECIES));
    }
    try { return normalizeSpecies(JSON.parse(raw)); } catch(e) { return normalizeSpecies(structuredClone(DEFAULT_SPECIES)); }
  }

  async function saveSpeciesFor(user, list) {
    if (supabaseClient && user) {
      try {
        // profiles 테이블에 species JSON 전체를 저장
        const { data, error } = await supabaseClient
          .from('profiles')
          .upsert({ user_id: user, species: list }, { returning: 'minimal' });
        if (error) { console.warn('Supabase save error', error); alert('저장 실패: ' + error.message); return; }
        return;
      } catch (e) { console.warn(e); }
    }
    // fallback to localStorage
    localStorage.setItem(userKey(user || 'guest'), JSON.stringify(list));
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
        inp && inp.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files);
          for (const f of files) {
            // If Supabase is configured, upload to storage and store public URL
            if (supabaseClient && currentUser) {
              try {
                const path = `user_${currentUser}/species_${s.id}/${Date.now()}_${f.name}`;
                // create a local preview immediately so user sees the uploaded file even if the storage URL is private
                const localPreview = await readFileAsDataURL(f);
                const { data, error } = await supabaseClient.storage.from('media').upload(path, f);
                if (error) { console.warn('upload error', error); }
                const { data: urlData } = supabaseClient.storage.from('media').getPublicUrl(path);
                const publicUrl = urlData && urlData.publicUrl ? urlData.publicUrl : '';
                    s.media = s.media || [];
                    // store url, local preview data and storage path for potential signed URL retrieval later
                    s.media.push({ name: f.name, type: f.type, url: publicUrl, data: localPreview, path, preview: localPreview });
                    // show immediate local preview
                    addMediaPreviewElement(preview, { name: f.name, type: f.type, data: localPreview });
              } catch (e) { console.warn(e); }
            } else {
              const data = await readFileAsDataURL(f);
                    s.media = s.media || [];
                    s.media.push({ name: f.name, type: f.type, data });
                    // append preview node with delete button (index is last)
                    const newIdx = s.media.length - 1;
                    preview.appendChild(createMediaPreviewNode(s.media[newIdx], s.id, newIdx));
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
    console.debug('[MEDIA PREVIEW] media:', media, 'resolvedSrcType:', typeof src);
    let finalSrc = src;
    try {
      if (src && typeof src !== 'string' && (src instanceof Blob || (src.constructor && src.constructor.name === 'File'))) {
        finalSrc = URL.createObjectURL(src);
        console.debug('[MEDIA PREVIEW] created objectURL for blob/file');
      }
    } catch (e) { console.debug('[MEDIA PREVIEW] objectURL failed', e); }
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
      // remove from array
      sp.media.splice(midx, 1);
      // attempt to delete from Supabase storage if path present
      if (supabaseClient && m.path) {
        try {
          const { data, error } = await supabaseClient.storage.from('media').remove([m.path]);
          if (error) console.debug('[MEDIA DELETE] supabase remove error', error);
          else console.debug('[MEDIA DELETE] removed from storage', data);
        } catch (err) { console.debug('[MEDIA DELETE] remove exception', err); }
      }
      // persist immediately
      try { if (currentUser) await saveSpeciesFor(currentUser, species); else localStorage.setItem(userKey('guest'), JSON.stringify(species)); } catch(e){console.debug('[MEDIA DELETE] save failed', e);} 
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
    console.debug('[OPEN MEDIA] id=', id, 'media=', s.media);
    body.innerHTML = '';
    if (!s.media || s.media.length === 0) {
      body.textContent = '미디어가 없습니다.';
    } else {
      for (const m of s.media) {
        const src = (m && (m.data || m.url)) || m;
        console.debug('[OPEN MEDIA ITEM]', m, 'resolvedSrcType=', typeof src);
        let finalSrc = src;
        try {
          if (src && typeof src !== 'string' && (src instanceof Blob || (src.constructor && src.constructor.name === 'File'))) {
            finalSrc = URL.createObjectURL(src);
            console.debug('[OPEN MEDIA] created objectURL for blob/file');
          }
        } catch (e) { console.debug('[OPEN MEDIA] objectURL failed', e); }
        // If this is a supabase-hosted URL but the bucket is private, try creating a signed URL if we saved the path
        if (typeof finalSrc === 'string' && finalSrc.startsWith('http') && supabaseClient && m.path) {
          try {
            const { data: signedData, error: signedErr } = await supabaseClient.storage.from('media').createSignedUrl(m.path, 60);
            if (signedErr) { console.debug('[OPEN MEDIA] createSignedUrl error', signedErr); }
            if (signedData && signedData.signedUrl) {
              finalSrc = signedData.signedUrl;
              console.debug('[OPEN MEDIA] using signed URL for private file');
            }
          } catch (e) { console.debug('[OPEN MEDIA] signed URL request failed', e); }
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
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email: id, password: pw });
          if (error) {
            alert('로그인 실패: ' + error.message);
            return;
          }
          const user = data.user;
          if (!user) { alert('로그인 실패: 사용자 없음'); return; }
          currentUser = user.id;
          setCurrentUser(currentUser);
          species = await loadSpeciesFor(currentUser);
          showAppAfterLogin();
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

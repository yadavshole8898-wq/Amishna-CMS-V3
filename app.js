
/* ============================================================
   GOOGLE SHEETS CLOUD SYNC
   ------------------------------------------------------------
   Set these two values after deploying the Google Apps Script
   backend supplied with this project. Leave API_URL blank to keep
   the original localStorage-only mode.
   ============================================================ */
const AMISHNA_CLOUD = {
  API_URL: '', // Example: https://script.google.com/macros/s/XXXXXXXX/exec
  API_KEY: ''  // Must match API_KEY in Google Apps Script
};
let cloudReady = false;
let cloudLoading = false;

function cloudEnabled(){ return !!(AMISHNA_CLOUD.API_URL && AMISHNA_CLOUD.API_KEY); }

async function cloudRequest(action, payload={}){
  if(!cloudEnabled()) return null;
  try{
    const res = await fetch(AMISHNA_CLOUD.API_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({apiKey:AMISHNA_CLOUD.API_KEY, action, ...payload})
    });
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'Cloud request failed');
    return data;
  }catch(err){
    console.warn('[Amishna Cloud]', action, err);
    return null;
  }
}

async function loadCloudDatabase(){
  if(!cloudEnabled() || cloudLoading) return;
  cloudLoading=true;
  const data=await cloudRequest('getAll');
  cloudLoading=false;
  if(!data) return;
  try{
    if(data.songs){ localStorage.setItem(SONG_DB_KEY, JSON.stringify(data.songs)); }
    if(data.projects){ localStorage.setItem(PROJECTS_KEY, JSON.stringify(data.projects)); }
    if(data.users){ localStorage.setItem(USERS_KEY, JSON.stringify(data.users)); }
    cloudReady=true;
    try{ renderDashboard(); }catch(e){}
    try{ renderMembers(); }catch(e){}
  }catch(err){ console.warn('[Amishna Cloud] cache update failed', err); }
}

function queueCloudSync(action, payload){
  if(!cloudEnabled()) return;
  clearTimeout(window._cloudSyncTimers && window._cloudSyncTimers[action]);
  window._cloudSyncTimers = window._cloudSyncTimers || {};
  window._cloudSyncTimers[action]=setTimeout(()=>cloudRequest(action,payload),350);
}

function cloudStatusText(){
  return cloudEnabled() ? (cloudReady ? 'Google Sheets connected' : 'Connecting to Google Sheets…') : 'Local storage mode';
}

/* ============================================================
   TEAM MANAGEMENT — USERS & SESSION
   Two roles only: 'admin' and 'editor'.
   Users are stored locally under USERS_KEY:
     { admin: {email,password}, editors: [{id,name,email,password}] }
   The active login is stored under SESSION_KEY.
   ============================================================ */
const USERS_KEY='amishnaUsers';
const SESSION_KEY='amishnaSession';
const PROJECT_STATUSES=['Draft','In Progress','Ready for Review'];

function loadUsers(){
  try{
    const u=JSON.parse(localStorage.getItem(USERS_KEY));
    if(u && u.admin && Array.isArray(u.editors)) return u;
  }catch(e){ /* fall through to defaults */ }
  const defaults={
    admin:{ email:'admin@amishna.com', password:'admin123' },
    editors:[
      { id:'ed_demo1', name:'Priya Nair', email:'priya@amishna.com', password:'editor123' }
    ]
  };
  saveUsers(defaults);
  return defaults;
}
function saveUsers(u){
  try{ localStorage.setItem(USERS_KEY, JSON.stringify(u)); }catch(e){ /* storage full or unavailable */ }
  queueCloudSync('saveUsers',{users:u});
}
function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY)); }catch(e){ return null; }
}
function setSession(s){ localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
function isAdmin(){ const s=getSession(); return !!(s && s.role==='admin'); }
function currentEditorId(){ const s=getSession(); return (s && s.role==='editor') ? s.id : null; }
function findEditorById(id){ return loadUsers().editors.find(e=>e.id===id) || null; }

/* ---------- Login card role switch ---------- */
window.loginRole='admin';
function setLoginRole(role){
  window.loginRole=role;
  document.getElementById('tabAdminBtn').classList.toggle('active', role==='admin');
  document.getElementById('tabEditorBtn').classList.toggle('active', role==='editor');
  document.getElementById('loginDemoHint').textContent = role==='admin'
    ? 'Demo admin: admin@amishna.com / admin123'
    : 'Demo editor: priya@amishna.com / editor123';
  document.getElementById('loginError').style.display='none';
}
function loginApp(){
  const email=(document.getElementById('loginEmail').value||'').trim().toLowerCase();
  const pass=document.getElementById('loginPassword').value||'';
  const users=loadUsers();
  const errEl=document.getElementById('loginError');

  if(window.loginRole==='admin'){
    if(email===users.admin.email.toLowerCase() && pass===users.admin.password){
      setSession({role:'admin', name:'Admin'});
      enterApp();
      return;
    }
  }else{
    const ed=users.editors.find(e=>e.email.toLowerCase()===email && e.password===pass);
    if(ed){
      setSession({role:'editor', id:ed.id, name:ed.name, email:ed.email});
      enterApp();
      return;
    }
  }
  errEl.textContent='Invalid '+(window.loginRole==='admin'?'Admin':'Editor')+' email or password.';
  errEl.style.display='block';
}
function enterApp(){
  document.getElementById('loginOverlay').style.display='none';
  document.getElementById('loginEmail').value='';
  document.getElementById('loginPassword').value='';
  showDashboard();
}
function hideAllScreens(){
  ['dashboardScreen','builderApp','membersScreen','settingsScreen'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
}
function logoutApp(){
  clearSession();
  currentProjectId=null;
  hideAllScreens();
  document.getElementById('loginOverlay').style.display='flex';
}
window.addEventListener('load', ()=>{
  loadUsers();
  const s=getSession();
  if(s){ document.getElementById('loginOverlay').style.display='none'; showDashboard(); }
});

/* ---------- Shared top nav (Projects / Members / Settings / Admin / Alerts / Log out) ---------- */
function renderTopNav(active){
  const s=getSession(); if(!s) return '';
  const adm=s.role==='admin';

  // Feather-style line icons (inherit currentColor / stroke)
  const ICONS={
    projects:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    members:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    editor:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
    logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
  };

  function navItem(o){
    const cls='nav-item'+(o.active?' active':'');
    const attrs=o.disabled ? ' disabled' : (o.fn ? ' onclick="'+o.fn+'"' : '');
    const title=o.title ? ' title="'+escapeAttr(o.title)+'"' : '';
    const dot=o.dot ? '<span class="dot"></span>' : '';
    return '<button type="button" class="'+cls+'"'+attrs+title+'>'+
      '<span class="nav-ico">'+ICONS[o.icon]+dot+'</span>'+
      '<span class="nav-lbl">'+o.label+'</span>'+
    '</button>';
  }

  let items='';
  items+=navItem({icon:'projects', label:'Projects', active:active==='projects', fn:'showDashboard()'});
  if(adm){
    items+=navItem({icon:'members',  label:'Members',  active:active==='members',  fn:'showMembers()'});
    items+=navItem({icon:'settings', label:'Settings', active:active==='settings', fn:'showSettings()'});
  }
  items+=navItem({icon:adm?'admin':'editor', label:adm?'Admin':'Editor', disabled:true, title:(s.name||s.email||'')});
  items+=navItem({icon:'bell', label:'Alerts', disabled:true, dot:true, title:'Notifications'});
  items+=navItem({icon:'logout', label:'Log out', fn:'logoutApp()'});

  return '<div class="bar dash-bar"><div class="bar-in">'+
    '<div class="brand"><div class="mark">Amishna Music CMS</div></div>'+
    '<nav class="nav-links">'+items+'</nav>'+
  '</div></div>';
}

/* ============================================================
   PROJECT STORAGE (dashboard)
   Each project record = { title, updatedAt, state, assignedEditorId, status }
   assignedEditorId / status are team-management metadata, kept separate
   from the cue-sheet `state` itself so the builder logic above never
   needs to know about roles.
   ============================================================ */
const PROJECTS_KEY='amishnaCueProjects';
let currentProjectId=null;

function loadProjectsIndex(){
  try{ return JSON.parse(localStorage.getItem(PROJECTS_KEY)||'{}'); }catch(e){ return {}; }
}
function saveProjectsIndex(idx){
  try{ localStorage.setItem(PROJECTS_KEY, JSON.stringify(idx)); }catch(e){ /* storage full or unavailable */ }
  queueCloudSync('saveProjects',{projects:idx});
}
function autosaveCurrentProject(){
  if(!currentProjectId) return;
  const idx=loadProjectsIndex();
  const prev=idx[currentProjectId]||{};
  idx[currentProjectId]={
    title: state.prod.title || 'Untitled project',
    updatedAt: Date.now(),
    state: state,
    assignedEditorId: prev.assignedEditorId || null,
    status: prev.status || 'Draft'
  };
  saveProjectsIndex(idx);
  const el=document.getElementById('b2Autosave'); const txt=document.getElementById('b2AutosaveText');
  if(el){ el.classList.remove('saving'); }
  if(txt){ txt.textContent='All changes saved'; }
}
function scheduleAutosave(){
  const el=document.getElementById('b2Autosave'); const txt=document.getElementById('b2AutosaveText');
  if(el){ el.classList.add('saving'); }
  if(txt){ txt.textContent='Saving…'; }
  clearTimeout(window._autosaveTimer);
  window._autosaveTimer=setTimeout(autosaveCurrentProject, 700);
}
document.addEventListener('input', e=>{
  const host=document.getElementById('builderApp');
  if(host && host.style.display!=='none' && host.contains(e.target)) scheduleAutosave();
});
document.addEventListener('change', e=>{
  const host=document.getElementById('builderApp');
  if(host && host.style.display!=='none' && host.contains(e.target)) scheduleAutosave();
});

/* ---------- Role-gated actions on projects ---------- */
function assignEditorToProject(id, editorId){
  if(!isAdmin()){ toast('Only Admins can assign editors.',true); return; }
  const idx=loadProjectsIndex();
  if(!idx[id]) return;
  idx[id].assignedEditorId = editorId || null;
  saveProjectsIndex(idx);
  renderDashboard();
  toast('Editor assignment updated.');
}
function updateProjectStatus(id, status){
  const idx=loadProjectsIndex();
  const rec=idx[id]; if(!rec) return;
  if(!isAdmin() && rec.assignedEditorId!==currentEditorId()){ toast('You can only update projects assigned to you.',true); renderDashboard(); return; }
  rec.status=status;
  saveProjectsIndex(idx);
  renderDashboard();
}
function deleteProject(id){
  if(!isAdmin()){ toast('Only Admins can delete projects.',true); return; }
  if(!confirm('Delete this project? This cannot be undone.')) return;
  const idx=loadProjectsIndex();
  delete idx[id];
  saveProjectsIndex(idx);
  if(currentProjectId===id) currentProjectId=null;
  renderDashboard();
  toast('Project deleted.');
}

/* ---------- Screen switching ---------- */
function applyRoleToBuilder(){
  const adm=isAdmin();
  const exportSection=document.getElementById('exportSection');
  if(exportSection) exportSection.style.display = adm ? '' : 'none';
  const navExportBtn=document.getElementById('navExportBtn');
  if(navExportBtn) navExportBtn.style.display = adm ? '' : 'none';
}
function showBuilder(){
  hideAllScreens();
  document.getElementById('builderApp').style.display='block';
  applyRoleToBuilder();
  const s=getSession();
  const av=document.getElementById('b2Avatar');
  if(av && s){
    av.textContent=(s.name||s.email||(isAdmin()?'A':'E')).trim().charAt(0).toUpperCase();
    av.title=(s.name||s.email||'')+' · '+(isAdmin()?'Admin':'Editor');
  }
  window.scrollTo(0,0);
}
function showDashboard(){
  autosaveCurrentProject();
  hideAllScreens();
  document.getElementById('dashboardScreen').style.display='block';
  renderDashboard();
  window.scrollTo(0,0);
}
function backToDashboard(){ showDashboard(); }
function showMembers(){
  if(!isAdmin()){ toast('Members is only available to Admins.',true); showDashboard(); return; }
  autosaveCurrentProject();
  hideAllScreens();
  document.getElementById('membersScreen').style.display='block';
  document.getElementById('membersNav').innerHTML=renderTopNav('members');
  renderMembers();
  window.scrollTo(0,0);
}
function showSettings(){
  if(!isAdmin()){ toast('Settings is only available to Admins.',true); showDashboard(); return; }
  autosaveCurrentProject();
  hideAllScreens();
  document.getElementById('settingsScreen').style.display='block';
  document.getElementById('settingsNav').innerHTML=renderTopNav('settings');
  window.scrollTo(0,0);
}

function startNewProject(){
  if(!isAdmin()){ toast('Only Admins can create new projects.',true); return; }
  state=blankState();
  currentProjectId='proj_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  refreshProdForm();
  renderEpisodes();
  autosaveCurrentProject();
  showBuilder();
}
function openProjectById(id){
  const idx=loadProjectsIndex();
  const rec=idx[id];
  if(!rec){ toast('That project could not be found.',true); return; }
  if(!isAdmin() && rec.assignedEditorId!==currentEditorId()){ toast('You do not have access to this project.',true); return; }
  const saved=rec.state;
  const fresh=blankState();
  state={
    prod:Object.assign(fresh.prod, saved.prod),
    episodes:(saved.episodes&&saved.episodes.length?saved.episodes:[blankEpisode()]).map(ep=>Object.assign(blankEpisode(), ep, {_uid:nextUid(),
      tracks:(ep.tracks&&ep.tracks.length?ep.tracks:[blankTrack()]).map(t=>Object.assign(blankTrack(), t, {_uid:nextUid(),
        contributors:(t.contributors&&t.contributors.length?t.contributors:[blankContrib()]).map(c=>Object.assign(blankContrib(),c))}))}))
  };
  currentProjectId=id;
  refreshProdForm();
  renderEpisodes();
  showBuilder();
}

/* ---------- Overview stat cards ---------- */
const STAT_ICONS={
  folder:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
  film:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  music:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  clock:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  check:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9"/></svg>'
};
function renderDashboardStats(list, adm){
  const inProgress=list.filter(p=>p.status==='In Progress').length;
  const ready=list.filter(p=>p.status==='Ready for Review').length;
  const draft=list.filter(p=>(p.status||'Draft')==='Draft').length;
  const episodeTotal=list.reduce((sum,p)=>sum+((p.state&&p.state.episodes)||[]).length,0);
  const songTotal=list.reduce((sum,p)=>sum+((p.state&&p.state.episodes)||[]).reduce((s2,ep)=>s2+((ep.tracks||[]).length),0),0);
  const cards = adm
    ? [ {label:'Total Projects', val:list.length, icon:'folder'},
        {label:'Episodes', val:episodeTotal, icon:'film'},
        {label:'Songs', val:songTotal, icon:'music'},
        {label:'Pending', val:draft+inProgress, icon:'clock'},
        {label:'Ready for Review', val:ready, icon:'check'} ]
    : [ {label:'My Projects', val:list.length, icon:'folder'},
        {label:'Episodes', val:episodeTotal, icon:'film'},
        {label:'Songs', val:songTotal, icon:'music'},
        {label:'In Progress', val:inProgress, icon:'clock'},
        {label:'Ready for Review', val:ready, icon:'check'} ];
  return cards.map(c=>
    '<div class="stat-card"><div class="stat-top"><div class="stat-icon">'+STAT_ICONS[c.icon]+'</div></div>'+
    '<div class="stat-val">'+c.val+'</div><div class="stat-label">'+escapeHtml(c.label)+'</div></div>'
  ).join('');
}

/* ---------- Project table row ---------- */
function projectStats(p){
  const st=p.state||{};
  const episodes=st.episodes||[];
  const epCount=episodes.length;
  const songCount=episodes.reduce((s,ep)=>s+((ep.tracks||[]).length),0);
  const targetEp=parseInt((st.prod&&st.prod.totalEpisodes)||'',10)||0;
  const pct = targetEp ? Math.min(100, Math.round((epCount/targetEp)*100)) : (epCount?100:0);
  return {epCount, songCount, targetEp, pct};
}
function posterInitials(title){
  const words=(title||'Untitled').trim().split(/\s+/).slice(0,2);
  return words.map(w=>w.charAt(0).toUpperCase()).join('')||'?';
}
function projectRow(p, adm, editorsById){
  const st=p.state||{prod:{}};
  const prod=st.prod||{};
  const {epCount, songCount, targetEp, pct}=projectStats(p);
  const progressText = targetEp ? (epCount+' / '+targetEp+' episodes') : (epCount+' episode'+(epCount===1?'':'s'));
  const status=p.status||'Draft';
  const statusClass = status==='Draft'?'st-draft':(status==='In Progress'?'st-progress':'st-ready');
  const dt=new Date(p.updatedAt||Date.now());
  const editorName = p.assignedEditorId && editorsById[p.assignedEditorId] ? editorsById[p.assignedEditorId].name : 'Unassigned';

  let assignHtml;
  if(adm){
    const opts=['<option value="">Unassigned</option>'].concat(
      Object.values(editorsById).map(e=>'<option value="'+escapeAttr(e.id)+'"'+(e.id===p.assignedEditorId?' selected':'')+'>'+escapeHtml(e.name)+'</option>')
    ).join('');
    assignHtml='<select class="pt-assign" onchange="assignEditorToProject(\''+p.id+'\', this.value)">'+opts+'</select>';
  }else{
    assignHtml='<span>'+escapeHtml(editorName)+'</span>';
  }

  const statusHtml='<select class="pt-status-select '+statusClass+'" onchange="updateProjectStatus(\''+p.id+'\', this.value)">'+
    PROJECT_STATUSES.map(s=>'<option value="'+s+'"'+(s===status?' selected':'')+'>'+s+'</option>').join('')+
  '</select>';

  const tr=document.createElement('tr');
  tr.innerHTML=
    '<td><div class="pt-name-cell">'+
      '<div class="pt-poster">'+escapeHtml(posterInitials(p.title))+'</div>'+
      '<div><div class="pt-name">'+escapeHtml(p.title||'Untitled project')+'</div>'+
      '<div class="pt-sub">'+escapeHtml(prod.language||'—')+'</div></div>'+
    '</div></td>'+
    '<td class="pt-muted">'+escapeHtml(prod.productionCompany||'—')+'</td>'+
    '<td class="pt-muted">'+escapeHtml(prod.programType||'—')+'</td>'+
    '<td>'+epCount+(targetEp?(' / '+targetEp):'')+'</td>'+
    '<td>'+songCount+'</td>'+
    '<td>'+assignHtml+'</td>'+
    '<td>'+statusHtml+'</td>'+
    '<td><div class="pt-progress"><div class="pt-progress-track"><div class="pt-progress-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="pt-progress-text">'+pct+'% · '+escapeHtml(progressText)+'</div></div></td>'+
    '<td class="pt-muted">'+escapeHtml(dt.toLocaleDateString())+'</td>'+
    '<td><div class="pt-actions">'+
      '<button type="button" class="pt-open" onclick="openProjectById(\''+p.id+'\')">Open →</button>'+
      (adm?'<button type="button" class="pt-del" title="Delete project" onclick="deleteProject(\''+p.id+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/><path d="M10 11v6M14 11v6"/></svg></button>':'')+
    '</div></td>';
  return tr;
}

/* ---------- Filters + pagination state ---------- */
window._dashPage=1;
window._dashPageSize=10;
function uniqueSorted(arr){ return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b))); }
function fillSelect(el, values, allLabel){
  const cur=el.value;
  el.innerHTML='<option value="">'+allLabel+'</option>'+values.map(v=>'<option value="'+escapeAttr(v)+'"'+(v===cur?' selected':'')+'>'+escapeHtml(v)+'</option>').join('');
  if(values.includes(cur)) el.value=cur;
}
function clearDashFilters(){
  ['dashSearch'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['dashFilterStatus','dashFilterEditor','dashFilterType','dashFilterHouse','dashFilterChannel','dashFilterYear'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  window._dashPage=1;
  renderDashboard();
}
function dashChangePage(delta){
  window._dashPage=Math.max(1, window._dashPage+delta);
  renderDashboard();
}
function dashChangePageSize(v){
  window._dashPageSize=parseInt(v,10)||10;
  window._dashPage=1;
  renderDashboard();
}

/* ---------- Sidebar: recent activity + status distribution ---------- */
function renderDashSidebar(list, adm){
  const actHost=document.getElementById('dashActivity');
  if(actHost){
    const recent=list.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,5);
    actHost.innerHTML = recent.length ? recent.map(p=>{
      const dt=new Date(p.updatedAt||Date.now());
      return '<div class="activity-item"><div class="activity-dot"></div><div class="activity-body">'+
        '<div class="activity-title">'+escapeHtml(p.title||'Untitled project')+'</div>'+
        '<div class="activity-meta">'+escapeHtml(p.status||'Draft')+' · updated '+escapeHtml(dt.toLocaleDateString())+'</div>'+
      '</div></div>';
    }).join('') : '<div class="side-empty">No recent activity yet.</div>';
  }
  const distHost=document.getElementById('dashDistribution');
  if(distHost){
    const total=list.length||1;
    const groups=[
      {label:'Draft', count:list.filter(p=>(p.status||'Draft')==='Draft').length, color:'#a9a29a'},
      {label:'In Progress', count:list.filter(p=>p.status==='In Progress').length, color:'var(--amber-2)'},
      {label:'Review', count:list.filter(p=>p.status==='Ready for Review').length, color:'var(--teal)'}
    ];
    distHost.innerHTML = list.length ? groups.map(g=>
      '<div class="dist-row"><span class="dist-label">'+g.label+'</span>'+
      '<span class="dist-track"><span class="dist-fill" style="width:'+Math.round((g.count/total)*100)+'%;background:'+g.color+'"></span></span>'+
      '<span class="dist-val">'+g.count+'</span></div>'
    ).join('') : '<div class="side-empty">No projects to chart yet.</div>';
  }
  const quickHost=document.querySelector('.quick-actions');
  if(quickHost){
    const btns=quickHost.querySelectorAll('button');
    if(btns[0]) btns[0].style.display = adm ? '' : 'none';
    if(btns[1]) btns[1].style.display = adm ? '' : 'none';
  }
}

function renderDashboard(){
  const s=getSession(); if(!s) return;
  const adm=s.role==='admin';
  document.getElementById('dashNav').innerHTML=renderTopNav('projects');
  document.getElementById('dashTitle').textContent = adm ? 'Projects' : 'My Projects';
  document.getElementById('dashSubtitle').textContent = adm
    ? 'Every serial across the team — create one, assign an editor, and track progress.'
    : 'Serials assigned to you. Pick one up where you left off.';
  document.getElementById('dashNewBtn').style.display = adm ? 'inline-flex' : 'none';

  const users=loadUsers();
  const editorsById={}; users.editors.forEach(e=>{ editorsById[e.id]=e; });

  const idx=loadProjectsIndex();
  let list=Object.keys(idx).map(id=>Object.assign({id}, idx[id]));
  if(!adm) list=list.filter(p=>p.assignedEditorId===s.id);

  document.getElementById('dashStats').innerHTML=renderDashboardStats(list, adm);
  renderDashSidebar(list, adm);

  // Populate filter option lists from real project data
  const statusSel=document.getElementById('dashFilterStatus');
  const editorSel=document.getElementById('dashFilterEditor');
  const typeSel=document.getElementById('dashFilterType');
  const houseSel=document.getElementById('dashFilterHouse');
  const channelSel=document.getElementById('dashFilterChannel');
  const yearSel=document.getElementById('dashFilterYear');
  if(statusSel) fillSelect(statusSel, PROJECT_STATUSES, 'All statuses');
  if(editorSel){
    if(editorSel.parentElement) editorSel.parentElement.style.display = adm ? '' : 'none';
    fillSelect(editorSel, Object.values(editorsById).map(e=>e.name), 'All editors');
  }
  if(typeSel) fillSelect(typeSel, uniqueSorted(list.map(p=>p.state&&p.state.prod&&p.state.prod.programType)), 'All types');
  if(houseSel) fillSelect(houseSel, uniqueSorted(list.map(p=>p.state&&p.state.prod&&p.state.prod.productionCompany)), 'All houses');
  if(channelSel) fillSelect(channelSel, uniqueSorted(list.map(p=>p.state&&p.state.prod&&p.state.prod.channel)), 'All channels');
  if(yearSel) fillSelect(yearSel, uniqueSorted(list.map(p=>p.state&&p.state.prod&&p.state.prod.productionYear)), 'All years');

  const host=document.getElementById('dashFolders');
  if(list.length===0){
    host.innerHTML='<div class="dash-empty">'+(adm?'No projects yet — start your first cue sheet.':'No projects have been assigned to you yet.')+'</div>';
    return;
  }

  const q=(document.getElementById('dashSearch').value||'').trim().toLowerCase();
  const fStatus=statusSel?statusSel.value:'';
  const fEditorName=(adm && editorSel)?editorSel.value:'';
  const fType=typeSel?typeSel.value:'';
  const fHouse=houseSel?houseSel.value:'';
  const fChannel=channelSel?channelSel.value:'';
  const fYear=yearSel?yearSel.value:'';

  let filtered=list.filter(p=>{
    const prod=(p.state&&p.state.prod)||{};
    const eName = p.assignedEditorId && editorsById[p.assignedEditorId] ? editorsById[p.assignedEditorId].name : '';
    if(q && !((p.title||'').toLowerCase().includes(q) || eName.toLowerCase().includes(q))) return false;
    if(fStatus && (p.status||'Draft')!==fStatus) return false;
    if(fEditorName && eName!==fEditorName) return false;
    if(fType && (prod.programType||'')!==fType) return false;
    if(fHouse && (prod.productionCompany||'')!==fHouse) return false;
    if(fChannel && (prod.channel||'')!==fChannel) return false;
    if(fYear && (prod.productionYear||'')!==fYear) return false;
    return true;
  });

  if(filtered.length===0){
    host.innerHTML='<div class="dash-empty">No projects match those filters.</div>';
    return;
  }
  filtered.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));

  // Pagination
  const pageSize=window._dashPageSize||10;
  const totalPages=Math.max(1, Math.ceil(filtered.length/pageSize));
  if(window._dashPage>totalPages) window._dashPage=totalPages;
  if(window._dashPage<1) window._dashPage=1;
  const startIdx=(window._dashPage-1)*pageSize;
  const pageItems=filtered.slice(startIdx, startIdx+pageSize);

  host.innerHTML='';
  const card=document.createElement('div'); card.className='table-card';
  const scroll=document.createElement('div'); scroll.className='table-scroll';
  const table=document.createElement('table'); table.className='proj-table';
  table.innerHTML='<thead><tr>'+
    '<th>Project</th><th>Production House</th><th>Type</th><th>Episodes</th><th>Songs</th>'+
    '<th>Editor</th><th>Status</th><th>Progress</th><th>Last Updated</th><th></th>'+
  '</tr></thead>';
  const tbody=document.createElement('tbody');
  pageItems.forEach(p=>tbody.appendChild(projectRow(p, adm, editorsById)));
  table.appendChild(tbody);
  scroll.appendChild(table);
  card.appendChild(scroll);

  const pag=document.createElement('div'); pag.className='pagination-bar';
  pag.innerHTML=
    '<div class="pg-left">Rows per page '+
      '<select onchange="dashChangePageSize(this.value)">'+
        [10,20,50].map(n=>'<option value="'+n+'"'+(n===pageSize?' selected':'')+'>'+n+'</option>').join('')+
      '</select>'+
      '<span>· '+filtered.length+' project'+(filtered.length===1?'':'s')+'</span>'+
    '</div>'+
    '<div class="pg-right">'+
      '<button type="button" class="pg-btn" '+(window._dashPage<=1?'disabled':'')+' onclick="dashChangePage(-1)">‹</button>'+
      '<span class="pg-page">Page '+window._dashPage+' of '+totalPages+'</span>'+
      '<button type="button" class="pg-btn" '+(window._dashPage>=totalPages?'disabled':'')+' onclick="dashChangePage(1)">›</button>'+
    '</div>';
  card.appendChild(pag);
  host.appendChild(card);
}

/* ============================================================
   MEMBERS PAGE — add / edit / remove editors (Admin only)
   ============================================================ */
function genEditorId(){ return 'ed_'+Date.now()+'_'+Math.random().toString(36).slice(2,7); }
function countProjectsForEditor(editorId){
  const idx=loadProjectsIndex();
  return Object.values(idx).filter(p=>p.assignedEditorId===editorId).length;
}
function addEditor(name, email, password){
  const users=loadUsers();
  if(users.editors.some(e=>e.email.toLowerCase()===email.toLowerCase())){ toast('An editor with that email already exists.',true); return false; }
  users.editors.push({id:genEditorId(), name, email, password});
  saveUsers(users);
  return true;
}
function updateEditor(id, name, email, password){
  const users=loadUsers();
  const ed=users.editors.find(e=>e.id===id);
  if(!ed){ toast('That editor could not be found.',true); return false; }
  if(users.editors.some(e=>e.id!==id && e.email.toLowerCase()===email.toLowerCase())){ toast('Another editor already uses that email.',true); return false; }
  ed.name=name; ed.email=email; if(password) ed.password=password;
  saveUsers(users);
  return true;
}
function removeEditor(id){
  if(!confirm('Remove this editor? Their assigned projects will become unassigned.')) return;
  const users=loadUsers();
  users.editors=users.editors.filter(e=>e.id!==id);
  saveUsers(users);
  const idx=loadProjectsIndex();
  Object.keys(idx).forEach(pid=>{ if(idx[pid].assignedEditorId===id) idx[pid].assignedEditorId=null; });
  saveProjectsIndex(idx);
  renderMembers();
  toast('Editor removed.');
}
function renderMembers(){
  const users=loadUsers();
  const host=document.getElementById('membersList');
  host.innerHTML='';
  if(users.editors.length===0){
    host.innerHTML='<div class="dash-empty">No editors yet — add your first team member.</div>';
    return;
  }
  const grid=document.createElement('div'); grid.className='members-grid';
  users.editors.forEach(ed=>{
    const count=countProjectsForEditor(ed.id);
    const card=document.createElement('div'); card.className='member-card';
    card.innerHTML=
      '<div class="mc-avatar">'+escapeHtml((ed.name||'?').slice(0,1).toUpperCase())+'</div>'+
      '<div class="mc-info">'+
        '<div class="mc-name">'+escapeHtml(ed.name)+'</div>'+
        '<div class="mc-email">'+escapeHtml(ed.email)+'</div>'+
        '<div class="mc-count">'+count+' project'+(count===1?'':'s')+' assigned</div>'+
      '</div>'+
      '<div class="mc-actions">'+
        '<button type="button" class="icon-btn" title="Edit" onclick="openEditorModal(\''+ed.id+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>'+
        '<button type="button" class="icon-btn" title="Remove" onclick="removeEditor(\''+ed.id+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/><path d="M10 11v6M14 11v6"/></svg></button>'+
      '</div>';
    grid.appendChild(card);
  });
  host.appendChild(grid);
}

/* ---------- Add / Edit Editor modal (shared by Members & Settings pages) ---------- */
let editingEditorId=null;
function openEditorModal(id){
  editingEditorId=id||null;
  document.getElementById('editorModalTitle').textContent = id ? 'Edit Editor' : 'Add Editor';
  const ed = id ? findEditorById(id) : null;
  document.getElementById('editorNameInput').value = ed ? ed.name : '';
  document.getElementById('editorEmailInput').value = ed ? ed.email : '';
  document.getElementById('editorPasswordInput').value='';
  document.getElementById('editorPasswordInput').placeholder = id ? 'Leave blank to keep current password' : 'Set a password';
  document.getElementById('editorModal').style.display='flex';
}
function closeEditorModal(){
  document.getElementById('editorModal').style.display='none';
  editingEditorId=null;
}
function submitEditorModal(){
  const name=(document.getElementById('editorNameInput').value||'').trim();
  const email=(document.getElementById('editorEmailInput').value||'').trim();
  const pass=document.getElementById('editorPasswordInput').value||'';
  if(!name||!email){ toast('Name and email are required.',true); return; }
  if(!editingEditorId && !pass){ toast('Please set a password for the new editor.',true); return; }
  const ok = editingEditorId ? updateEditor(editingEditorId, name, email, pass) : addEditor(name, email, pass);
  if(!ok) return;
  const wasEditing=!!editingEditorId;
  closeEditorModal();
  toast(wasEditing ? 'Editor updated.' : 'Editor added.');
  if(document.getElementById('membersScreen').style.display!=='none') renderMembers();
  if(document.getElementById('dashboardScreen').style.display!=='none') renderDashboard();
}

/* ============================================================
   SETTINGS PAGE — change Admin password
   ============================================================ */
function changeAdminPassword(ev){
  ev.preventDefault();
  const users=loadUsers();
  const cur=document.getElementById('curAdminPass').value;
  const n1=document.getElementById('newAdminPass').value;
  const n2=document.getElementById('newAdminPass2').value;
  if(cur!==users.admin.password){ toast('Current password is incorrect.',true); return false; }
  if(!n1||n1.length<4){ toast('New password must be at least 4 characters.',true); return false; }
  if(n1!==n2){ toast('New passwords do not match.',true); return false; }
  users.admin.password=n1;
  saveUsers(users);
  document.getElementById('curAdminPass').value='';
  document.getElementById('newAdminPass').value='';
  document.getElementById('newAdminPass2').value='';
  toast('Admin password updated.');
  return false;
}

/* ============================================================
   IMPORT — IPRS cue sheet (single-episode OR multi-episode
   workbook, any number of worksheets, any number of episodes
   per worksheet).

   Two source layouts are supported, auto-detected per worksheet:

   1) FLAT TABLE layout — one header row with column labels
      (Episode No., Episode Name, Track Name, Duration, ...)
      followed by one data row per track. This is the layout
      produced when many episodes are bulk-exported into a single
      continuous sheet — Episode No./Episode Name are frequently
      merged vertically down across every track row belonging to
      the same episode, so a blank cell inherits the previous
      non-blank value (merge-aware, with carry-forward).

   2) BLOCK layout — the original single-episode cue-sheet
      template (label + value pairs such as "EPISODE NO." | 25,
      then a track table below it) repeated one or more times
      down the same worksheet.

   Every unique Episode No. found (in either layout, across every
   worksheet in the file) becomes exactly one Episode, tracks are
   kept in file order, episode order is preserved, and blank rows
   are skipped. This is what makes multi-episode cue sheets import
   correctly instead of only the first one.
   ============================================================ */
function readMergedText(ws, addr){
  // Merge-aware cell read. ExcelJS only stores a value on the
  // top-left ("master") cell of a merged range — reading any other
  // cell inside that range normally returns blank. Episode No. and
  // Episode Name are frequently merged vertically down across every
  // track row of an episode in real IPRS workbooks, so we resolve
  // through cell.master instead of trusting cell.value directly.
  const cell=ws.getCell(addr);
  if(cell.isMerged && cell.master && cell.master!==cell){
    return cellText(cell.master.value).trim();
  }
  return cellText(cell.value).trim();
}
function mergeAwareCellText(cell){
  if(cell.isMerged && cell.master && cell.master!==cell){
    return cellText(cell.master.value).trim();
  }
  return cellText(cell.value).trim();
}
function findLabelValue(ws, rowNum, labelRegex, labelColMax){
  // Scans the first few columns of a row for a label matching
  // labelRegex (eg "EPISODE NO."), then returns the value found in
  // the next non-empty cell to the right. Merge-aware, and tolerant
  // of the label sitting a column or two off the standard template.
  // Returns null if the label itself isn't present in this row.
  labelColMax = labelColMax || 4;
  const row=ws.getRow(rowNum);
  for(let c=1;c<=labelColMax;c++){
    const labelTxt=mergeAwareCellText(row.getCell(c));
    if(labelRegex.test(labelTxt)){
      for(let vc=c+1; vc<=c+6; vc++){
        const vTxt=mergeAwareCellText(row.getCell(vc));
        if(vTxt) return vTxt;
      }
      return '';
    }
  }
  return null;
}

const ROLE_FROM_CODE={C:'Composer',A:'Author',E:'Publisher',AR:'Arranger'};

/* ---- FLAT TABLE detection + parsing --------------------------- */
function findFlatIprsHeaderRow(ws){
  // A flat-table header row has BOTH an "Episode No." column header
  // and a "Track Name / Song Title" column header sitting in the
  // SAME row. The block-style template never has both in one row
  // (its "EPISODE NO." label sits ~4 rows above the track-table
  // header), so this is a reliable, non-ambiguous signal.
  const maxScan=Math.min(Math.max(ws.rowCount||0,30),80);
  for(let r=1;r<=maxScan;r++){
    const row=ws.getRow(r);
    const numCols=Math.max(row.cellCount||0,20);
    let hasTrack=false, hasEpNo=false;
    for(let c=1;c<=numCols;c++){
      const txt=mergeAwareCellText(row.getCell(c)).toLowerCase();
      if(!txt) continue;
      if(/song\s*title|track\s*name/.test(txt)) hasTrack=true;
      if(/episode\s*(no\.?|number|#)\b/.test(txt)) hasEpNo=true;
    }
    if(hasTrack && hasEpNo) return r;
  }
  return null;
}
function buildFlatColumnMap(ws, headerRow){
  const row=ws.getRow(headerRow);
  const numCols=Math.max(row.cellCount||0,25);
  const map={};
  const assign=(key,regex,c)=>{ if(!map[key] && regex.test(mergeAwareCellText(row.getCell(c)).toLowerCase())) map[key]=c; };
  for(let c=1;c<=numCols;c++){
    assign('epNo', /episode\s*(no\.?|number|#)\b/, c);
    assign('epTitle', /episode\s*(title|name)/, c);
    assign('track', /song\s*title|track\s*name/, c);
    assign('usage', /characteristic/, c);
    assign('noOfUsage', /no\.?\s*of\s*usage/, c);
    assign('code', /song\s*code|internal\s*no/, c);
    assign('isrc', /isrc/, c);
    assign('duration', /duration/, c);
    assign('role', /role/, c);
    assign('contribName', /composer|author|publisher/, c);
    assign('society', /society/, c);
    assign('share', /share/, c);
    assign('ipi', /ipi/, c);
    assign('singer', /singer/, c);
    assign('airDate', /air\s*date|date\s*of.*aired/, c);
  }
  return map;
}
function parseFlatIprsSheet(ws, headerRow){
  const colMap=buildFlatColumnMap(ws, headerRow);
  if(!colMap.track) return []; // not actually a usable flat table

  const maxRow=Math.max(ws.rowCount||0, ws.actualRowCount||0, headerRow+10);
  const cellAt=(r,c)=> c ? mergeAwareCellText(ws.getRow(r).getCell(c)) : '';

  const episodesOut=[];
  const byKey=new Map();
  let carriedEpNo='', carriedEpTitle='';
  let curEpisode=null, curTrack=null, blankStreak=0;

  const startOrGetEpisode=(epNo, epTitle)=>{
    const key = epNo ? ('no:'+epNo) : (epTitle ? ('t:'+epTitle) : 'single');
    if(byKey.has(key)) return byKey.get(key);
    const ep=blankEpisode();
    ep.tracks=[]; // don't keep the default placeholder track
    ep.episodeNo=epNo||'';
    // Episode Name is only ever populated here because an explicit
    // "Episode Name/Title" column was detected in this file's header —
    // otherwise it stays blank, exactly like a brand-new episode.
    ep.episodeTitle = colMap.epTitle ? (epTitle||'') : '';
    episodesOut.push(ep);
    byKey.set(key, ep);
    return ep;
  };

  for(let r=headerRow+1; r<=maxRow && blankStreak<8; r++){
    const trackTxt = cellAt(r, colMap.track);
    const epNoRaw = cellAt(r, colMap.epNo);
    const epTitleRaw = cellAt(r, colMap.epTitle);
    const contribNameTxt = cellAt(r, colMap.contribName);
    const roleTxt = cellAt(r, colMap.role);
    const durationTxt = cellAt(r, colMap.duration);

    const rowIsBlank = !trackTxt && !epNoRaw && !epTitleRaw && !contribNameTxt && !roleTxt && !durationTxt;
    if(rowIsBlank){ blankStreak++; continue; } // ignore blank rows
    blankStreak=0;

    // Merged Episode No./Name cells only carry a value on their first
    // row — inherit the last non-blank value so every track still
    // lands under the correct episode.
    if(epNoRaw) carriedEpNo=epNoRaw;
    if(epTitleRaw) carriedEpTitle=epTitleRaw;

    if(epNoRaw || epTitleRaw || !curEpisode){
      curEpisode = startOrGetEpisode(carriedEpNo, carriedEpTitle);
    }

    if(trackTxt){
      curTrack=blankTrack();
      curTrack.name=trackTxt;
      curTrack.contributors=[];
      if(colMap.usage) curTrack.usageIPRS=cellAt(r,colMap.usage);
      if(colMap.noOfUsage) curTrack.noOfUsage=cellAt(r,colMap.noOfUsage);
      if(colMap.code) curTrack.codeIPRS=cellAt(r,colMap.code);
      if(colMap.isrc) curTrack.isrc=cellAt(r,colMap.isrc);
      if(colMap.duration) curTrack.duration=fmtDuration(ws.getRow(r).getCell(colMap.duration).value);
      if(colMap.singer) curTrack.singer=cellAt(r,colMap.singer);
      curEpisode.tracks.push(curTrack);
    }
    if(curTrack && (roleTxt || contribNameTxt)){
      curTrack.contributors.push({
        role: ROLE_FROM_CODE[roleTxt.toUpperCase()] || (ROLES.includes(roleTxt)?roleTxt:'Composer'),
        name: contribNameTxt,
        society: (colMap.society ? cellAt(r,colMap.society) : '') || 'IPRS',
        share: (colMap.share ? cellAt(r,colMap.share) : '').replace('%',''),
        ipiCae: colMap.ipi ? cellAt(r,colMap.ipi) : ''
      });
    }
  }

  episodesOut.forEach(ep=>{
    ep.tracks.forEach(t=>{ if(t.contributors.length===0) t.contributors.push(blankContrib()); });
  });
  return episodesOut.filter(ep=>ep.tracks.length>0);
}

/* ---- BLOCK layout parsing (original single-episode template, ---
   ---- possibly repeated several times down one worksheet) ------ */
function parseBlockIprsSheet(ws, flags){
  const maxRow=Math.max(ws.rowCount||0, ws.actualRowCount||0, 20);
  const headerRows=[];
  for(let rr=1; rr<=maxRow; rr++){
    if(findLabelValue(ws, rr, /episode\s*no/i)!==null) headerRows.push(rr);
  }
  if(headerRows.length===0){
    // No recognizable "EPISODE NO." label anywhere in this sheet
    // — fall back to treating the whole sheet as one block from
    // the top, matching the original single-episode template.
    headerRows.push(1);
  }else{
    flags.sawEpisodeHeader=true;
  }

  const out=[];
  let carriedEpisodeNo='', carriedEpisodeTitle='';

  headerRows.forEach((headerRow, hi)=>{
    const segEnd = hi+1<headerRows.length ? headerRows[hi+1] : maxRow+1;

    // Episode No. / Episode Name for this block. If either comes
    // back blank — the classic symptom of a vertically-merged
    // cell where ExcelJS only returns a value on the merge's
    // first row — inherit the last non-blank value seen so this
    // episode still groups correctly instead of importing blank.
    let epNo = findLabelValue(ws, headerRow, /episode\s*no/i, 4) || '';
    let epTitle = findLabelValue(ws, headerRow, /episode\s*(title|name)/i, 10) || '';
    if(!epNo) epNo = carriedEpisodeNo;
    if(!epTitle) epTitle = carriedEpisodeTitle;
    if(epNo) carriedEpisodeNo = epNo;
    if(epTitle) carriedEpisodeTitle = epTitle;

    const airDate = readMergedText(ws,'B'+Math.max(1,headerRow-3));
    const totalDur = fmtDuration(ws.getCell('H'+Math.max(1,headerRow-4)).value);

    // Locate this block's track-table header row ("SONG TITLE /
    // TRACK NAME…") so we know exactly where its track rows
    // start, even if this block isn't sitting at the standard
    // offset (eg a combined sheet where earlier episodes have
    // pushed everything further down the page).
    let trackHeaderRow=null;
    for(let rr=headerRow; rr<Math.min(segEnd, headerRow+10); rr++){
      if(findLabelValue(ws, rr, /song\s*title|track\s*name/i)!==null){ trackHeaderRow=rr; break; }
    }
    if(trackHeaderRow) flags.sawTrackHeader=true;
    const tracksStart = trackHeaderRow ? trackHeaderRow+1 : headerRow+5;

    const tracks=[];
    let curTrack=null;
    let blankStreak=0;
    for(let r=tracksStart; r<segEnd && blankStreak<4; r++){
      const nameCell=cellText(ws.getCell('A'+r).value).trim();
      const roleCell=cellText(ws.getCell('G'+r).value).trim();
      const contribName=cellText(ws.getCell('H'+r).value).trim();
      const rowIsEmpty = !nameCell && !roleCell && !contribName &&
        !cellText(ws.getCell('D'+r).value).trim() && !cellText(ws.getCell('E'+r).value).trim();
      if(rowIsEmpty){ blankStreak++; continue; }
      blankStreak=0;
      if(nameCell){
        curTrack=blankTrack();
        curTrack.name=nameCell;
        curTrack.usageIPRS=cellText(ws.getCell('B'+r).value).trim();
        curTrack.noOfUsage=cellText(ws.getCell('C'+r).value).trim();
        curTrack.codeIPRS=cellText(ws.getCell('D'+r).value).trim();
        curTrack.isrc=cellText(ws.getCell('E'+r).value).trim();
        curTrack.duration=fmtDuration(ws.getCell('F'+r).value);
        curTrack.singer=cellText(ws.getCell('L'+r).value).trim();
        curTrack.contributors=[];
        tracks.push(curTrack);
      }
      if(curTrack && (roleCell||contribName)){
        curTrack.contributors.push({
          role: ROLE_FROM_CODE[roleCell.toUpperCase()] || (ROLES.includes(roleCell)?roleCell:'Composer'),
          name: contribName,
          society: cellText(ws.getCell('I'+r).value).trim() || 'IPRS',
          share: cellText(ws.getCell('J'+r).value).trim().replace('%',''),
          ipiCae: cellText(ws.getCell('K'+r).value).trim()
        });
      }
    }
    tracks.forEach(t=>{ if(t.contributors.length===0) t.contributors.push(blankContrib()); });

    if(tracks.length===0) return; // nothing usable in this block — skip it rather than create an empty episode

    const ep=blankEpisode();
    ep.tracks=[];
    ep.episodeNo=epNo;
    ep.episodeTitle=epTitle;
    if(airDate) ep.airDate=airDate;
    if(totalDur) ep.totalDuration=totalDur;
    ep.tracks=tracks;
    out.push(ep);
  });

  return out;
}

async function onIprsImport(ev){
  const file=ev.target.files[0]; ev.target.value='';
  if(!file) return;
  try{
    const buf=await file.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    if(!wb.worksheets.length){ toast('Could not read that Excel file.',true); return; }

    const p=state.prod;
    const setIfPresent=(key,val)=>{ if(val) p[key]=val; };

    const parsedEpisodes=[];     // in original discovery order, across every worksheet
    const byEpisodeNo=new Map(); // episodeNo -> episode object, so the same episode number found in more than one place merges instead of duplicating
    const flags={sawEpisodeHeader:false, sawTrackHeader:false};

    const addParsedEpisode=(ep)=>{
      const key = ep.episodeNo ? ('no:'+ep.episodeNo) : null;
      if(key && byEpisodeNo.has(key)){
        const existing=byEpisodeNo.get(key);
        existing.tracks=existing.tracks.concat(ep.tracks); // preserve track order across merged blocks
        if(!existing.episodeTitle && ep.episodeTitle) existing.episodeTitle=ep.episodeTitle;
        if(!existing.airDate && ep.airDate) existing.airDate=ep.airDate;
        if(!existing.totalDuration && ep.totalDuration) existing.totalDuration=ep.totalDuration;
      }else{
        parsedEpisodes.push(ep);
        if(key) byEpisodeNo.set(key, ep);
      }
    };

    wb.worksheets.forEach(ws=>{
      // Production-level fields are read from every sheet, but
      // setIfPresent only ever fills a currently-blank value, so a
      // repeated header block later in the file can't clobber data
      // already picked up from an earlier one.
      setIfPresent('title', readMergedText(ws,'B3'));
      setIfPresent('channel', readMergedText(ws,'H3'));
      setIfPresent('programType', readMergedText(ws,'B4'));
      setIfPresent('director', readMergedText(ws,'H4'));
      setIfPresent('genre', readMergedText(ws,'B5'));
      setIfPresent('productionCompany', readMergedText(ws,'H5'));
      setIfPresent('language', readMergedText(ws,'B6'));
      setIfPresent('actors', readMergedText(ws,'H6'));
      setIfPresent('productionNo', readMergedText(ws,'B7'));
      setIfPresent('productionYear', readMergedText(ws,'B9'));
      setIfPresent('bgComposer', readMergedText(ws,'H9'));
      setIfPresent('producer', readMergedText(ws,'B10'));
      setIfPresent('submittedBy', readMergedText(ws,'H10'));
      setIfPresent('totalEpisodes', readMergedText(ws,'B12'));
      setIfPresent('seasonNo', readMergedText(ws,'H12'));

      // Every worksheet is tried against the flat-table layout first
      // (one header row, Episode No. carried down a column, 1000s of
      // track rows below it) since that's the layout a bulk multi-
      // episode cue sheet actually uses. Only if no flat header is
      // found do we fall back to the single-episode block template.
      const flatHeaderRow=findFlatIprsHeaderRow(ws);
      let sheetEpisodes;
      if(flatHeaderRow){
        flags.sawEpisodeHeader=true;
        sheetEpisodes=parseFlatIprsSheet(ws, flatHeaderRow);
        if(sheetEpisodes.length) flags.sawTrackHeader=true;
      }else{
        sheetEpisodes=parseBlockIprsSheet(ws, flags);
      }
      sheetEpisodes.forEach(addParsedEpisode);
    });

    if(parsedEpisodes.length===0){
      if(!flags.sawEpisodeHeader && !flags.sawTrackHeader){
        toast('That file doesn\'t look like an IPRS cue sheet — required columns (Episode No., Episode Title, Track Name) were not found.',true);
      }else{
        toast('No track rows were found in that IPRS file.',true);
      }
      return;
    }

    // Don't silently overwrite episodes that already exist in this
    // production — confirm first, and merge/update rather than
    // duplicate when an incoming episode number matches one on file.
    const existingByNo=new Map();
    state.episodes.forEach(ep=>{ if(ep.episodeNo) existingByNo.set(String(ep.episodeNo).trim(), ep); });
    const toUpdate=parsedEpisodes.filter(ep=>ep.episodeNo && existingByNo.has(String(ep.episodeNo).trim()));
    if(toUpdate.length){
      const list=toUpdate.map(ep=>'Episode '+ep.episodeNo).join(', ');
      if(!confirm('This will update '+toUpdate.length+' episode'+(toUpdate.length>1?'s':'')+' that already exist ('+list+') with the tracks from this file. Continue?')){
        return;
      }
    }

    const isPlaceholder = state.episodes.length===1 && !state.episodes[0].episodeTitle && !state.episodes[0].episodeNo && state.episodes[0].tracks.length===1 && !state.episodes[0].tracks[0].name;
    if(isPlaceholder) state.episodes=[];

    let updatedCount=0, newCount=0;
    parsedEpisodes.forEach(parsedEp=>{
      const match = parsedEp.episodeNo ? existingByNo.get(String(parsedEp.episodeNo).trim()) : null;
      if(match){
        match.episodeTitle = parsedEp.episodeTitle || match.episodeTitle;
        match.airDate = parsedEp.airDate || match.airDate;
        match.totalDuration = parsedEp.totalDuration || match.totalDuration;
        match.tracks = parsedEp.tracks;
        updatedCount++;
      }else{
        state.episodes.push(parsedEp);
        newCount++;
      }
    });

    refreshProdForm();
    renderEpisodes();
    autosaveCurrentProject();
    const parts=[];
    if(newCount) parts.push(newCount+' new episode'+(newCount>1?'s':''));
    if(updatedCount) parts.push(updatedCount+' existing episode'+(updatedCount>1?'s':'')+' updated');
    toast('Imported '+parts.join(', ')+' from "'+file.name+'".');
  }catch(err){
    console.error(err);
    toast('Something went wrong reading that IPRS file.',true);
  }
}

/* ============================================================
   MASTER SONG DATABASE + AUTO-SYNC
   ------------------------------------------------------------
   A track's details can be saved into a single master "Song
   Database". Saving a song automatically searches every episode
   and every track in the CURRENT project and copies the saved
   details onto any other track that matches — by ISRC first,
   falling back to a normalized title match — so the same song
   stays consistent everywhere it appears.

   STORAGE
   Today the master database lives in localStorage under
   SONG_DB_KEY, the same way the rest of this app stores data
   locally. Every read/write goes through getSongDatabase() /
   setSongDatabase() ONLY — no other function in this file touches
   localStorage for song data directly. That means swapping in a
   real cloud database (Supabase, Neon, Firebase, PostgreSQL, etc.)
   later only requires rewriting those two functions to call an
   API instead — the UI, matching logic, and sync logic never
   need to change.
   ============================================================ */
const SONG_DB_KEY='amishnaSongDatabase';

/**
 * Read the full master song database.
 * Shape: { [songKey]: SongRecord }  (songKey = ISRC when available,
 * otherwise the normalized title — see songDbKeyFor()).
 */
function getSongDatabase(){
  try{
    // Replace this with cloud database API later.
    // e.g. const res = await fetch('/api/songs'); return await res.json();
    const raw=localStorage.getItem(SONG_DB_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}

/** Persist the full master song database. */
function setSongDatabase(db){
  try{ localStorage.setItem(SONG_DB_KEY, JSON.stringify(db)); }catch(e){ /* storage full or unavailable */ }
  queueCloudSync('saveSongs',{songs:db});
}

/**
 * Normalize a song title for fuzzy matching:
 *  - lowercase
 *  - strip punctuation
 *  - drop common non-identifying words/phrases (title track,
 *    instrumental, version, reprise, theme)
 *  - collapse extra whitespace
 */
const SONG_TITLE_STOPWORDS=['title track','instrumental','version','reprise','theme'];
function normalizeSongTitle(title){
  if(!title) return '';
  let s=String(title).toLowerCase();
  s=s.replace(/[^\w\s]/g,' ');                 // remove punctuation
  SONG_TITLE_STOPWORDS.forEach(w=>{
    s=s.replace(new RegExp('\\b'+w.replace(/\s+/g,'\\s+')+'\\b','g'),' '); // remove filler words
  });
  s=s.replace(/\s+/g,' ').trim();               // remove extra spaces
  return s;
}

/** Find a track object (and its parent episode) anywhere in state.episodes by track._uid. */
function findTrackByUid(uid){
  for(const ep of state.episodes){
    const t=ep.tracks.find(tr=>tr._uid===uid);
    if(t) return {track:t, episode:ep};
  }
  return null;
}

/** Comma-separated names of contributors holding a given role. */
function contributorsByRole(contributors, role){
  return contributors.filter(c=>c.role===role && c.name).map(c=>c.name).join(', ');
}
/** Combined share total for a given role, as a string (e.g. "50"). */
function shareByRole(contributors, role){
  const total=contributors.filter(c=>c.role===role).reduce((s,c)=>s+shareNum(c.share),0);
  return total ? String(total) : '';
}
/** Unique, comma-separated IPI/CAE numbers across all contributors. */
function ipiNumbersFromContributors(contributors){
  const seen=[];
  contributors.forEach(c=>{ if(c.ipiCae && !seen.includes(c.ipiCae)) seen.push(c.ipiCae); });
  return seen.join(', ');
}
/** Most common society among a track's contributors. */
function primarySociety(contributors){
  const counts={};
  contributors.forEach(c=>{ if(c.society) counts[c.society]=(counts[c.society]||0)+1; });
  const keys=Object.keys(counts);
  if(keys.length===0) return '';
  return keys.sort((a,b)=>counts[b]-counts[a])[0];
}

/** Build a master Song Database record from a track's current field values. */
function buildSongRecordFromTrack(t){
  const contributors=t.contributors.map(c=>({...c})); // deep copy — record must not share references with the live track
  return {
    title:t.name||'',
    normalizedTitle:normalizeSongTitle(t.name),
    isrc:t.isrc||'',
    singer:t.singer||'',
    contributors,
    composer:contributorsByRole(contributors,'Composer'),
    author:contributorsByRole(contributors,'Author'),
    publisher:contributorsByRole(contributors,'Publisher'),
    shares:{
      composer:shareByRole(contributors,'Composer'),
      author:shareByRole(contributors,'Author'),
      publisher:shareByRole(contributors,'Publisher')
    },
    ipiNumbers:ipiNumbersFromContributors(contributors),
    society:primarySociety(contributors),
    codeIPRS:t.codeIPRS||'',
    codePRS:t.codePRS||'',
    codeASCAP:t.codeASCAP||'',
    updatedAt:Date.now()
  };
}

/** Database key for a song record — ISRC when present, otherwise normalized title. */
function songDbKeyFor(record){
  return record.isrc ? ('isrc:'+record.isrc.trim()) : ('title:'+record.normalizedTitle);
}

/** Does an existing track match a saved song record? ISRC first, normalized title fallback. */
function trackMatchesSongRecord(t, record){
  if(record.isrc && t.isrc && t.isrc.trim()===record.isrc.trim()) return true;
  if(!record.isrc || !t.isrc){
    const tNorm=normalizeSongTitle(t.name);
    if(tNorm && record.normalizedTitle && tNorm===record.normalizedTitle) return true;
  }
  return false;
}

/**
 * Copy a saved song record's shared fields onto every matching track
 * across every episode in the current project. Returns the number of
 * tracks updated. Does NOT re-render — callers refresh the UI after.
 */
function syncMatchingTracks(record){
  let updated=0;
  state.episodes.forEach(ep=>{
    ep.tracks.forEach(t=>{
      if(!trackMatchesSongRecord(t, record)) return;
      if(record.isrc) t.isrc=record.isrc;
      t.singer=record.singer;
      t.contributors=record.contributors.map(c=>({...c})); // fresh copies per track
      t.codeIPRS=record.codeIPRS;
      t.codePRS=record.codePRS;
      t.codeASCAP=record.codeASCAP;
      updated++;
    });
  });
  return updated;
}

/**
 * "Save to Song Database" button handler: save a track's current
 * details into the master Song Database, auto-sync every other
 * matching track in the project, then refresh the UI.
 */
function saveTrackToSongDatabase(trackUid){
  const found=findTrackByUid(trackUid);
  if(!found){ toast('Could not find that track.', true); return; }
  const t=found.track;
  if(!t.name || !t.name.trim()){ toast('Give the track a name before saving it to the Song Database.', true); return; }

  const record=buildSongRecordFromTrack(t);
  const db=getSongDatabase();
  db[songDbKeyFor(record)]=record;
  setSongDatabase(db);

  syncMatchingTracks(record);
  renderEpisodes();
  autosaveCurrentProject();
  toast('Song saved to database and synced to all matching tracks.');
}

/* ============================================================
   PANEL RESIZER — draggable divider between the center column
   (Episode Details / Tracks) and the right column (Track Details /
   Contributors). Desktop only (workspace collapses to a single
   column at <=1080px, matching the existing responsive layout).
   Width is stored in localStorage so it survives a refresh.
   ============================================================ */
const EP_PANEL_WIDTH_KEY='amishnaEpRightPanelWidth';
const EP_PANEL_MIN=320, EP_PANEL_MAX=600;
function isDesktopWorkspace(){ return window.innerWidth>1080; }
function applySavedPanelWidth(){
  const workspace=document.querySelector('#builderApp .workspace');
  if(!workspace) return;
  let saved=parseInt(localStorage.getItem(EP_PANEL_WIDTH_KEY),10);
  if(!saved || isNaN(saved)) return;
  saved=Math.max(EP_PANEL_MIN, Math.min(EP_PANEL_MAX, saved));
  workspace.style.setProperty('--ep-right-w', saved+'px');
}
function initPanelResizer(){
  const resizer=document.getElementById('epResizer');
  const workspace=document.querySelector('#builderApp .workspace');
  const rightPanel=document.querySelector('#builderApp .ep-right');
  if(!resizer || !workspace || !rightPanel) return;

  applySavedPanelWidth();

  let dragging=false, startX=0, startW=0;

  resizer.addEventListener('mousedown', function(e){
    if(!isDesktopWorkspace()) return;
    dragging=true;
    startX=e.clientX;
    startW=rightPanel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.classList.add('ep-resizing');
    e.preventDefault();
  });

  window.addEventListener('mousemove', function(e){
    if(!dragging) return;
    const delta=startX-e.clientX; // dragging the handle left grows the right panel
    let newW=startW+delta;
    newW=Math.max(EP_PANEL_MIN, Math.min(EP_PANEL_MAX, newW));
    workspace.style.setProperty('--ep-right-w', newW+'px');
  });

  function endDrag(){
    if(!dragging) return;
    dragging=false;
    resizer.classList.remove('dragging');
    document.body.classList.remove('ep-resizing');
    const rect=rightPanel.getBoundingClientRect();
    const finalW=Math.max(EP_PANEL_MIN, Math.min(EP_PANEL_MAX, Math.round(rect.width)));
    try{ localStorage.setItem(EP_PANEL_WIDTH_KEY, String(finalW)); }catch(e){ /* storage full or unavailable */ }
  }
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('blur', endDrag);

  window.addEventListener('resize', function(){
    if(!isDesktopWorkspace() && dragging) endDrag();
  });
}

/* ============================================================
   INIT
   ============================================================ */
buildProdForm();
renderEpisodes();
initPanelResizer();
// Pull the shared cloud copy after the local UI is ready.
loadCloudDatabase();

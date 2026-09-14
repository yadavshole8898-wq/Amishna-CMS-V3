
/* ============================================================
   DATA MODEL
   ============================================================ */
const ROLES = ['Composer','Author','Publisher','Arranger'];
const SOCIETIES = ['IPRS','PRS','ASCAP','BMI','SESAC','SACEM','GEMA','PPL','Non Society'];
const USAGE_IPRS = ['','BI','BV','FI','FV','OI','OV','CI','CV'];
const USAGE_PRS  = ['','V','B','F','T'];
const USAGE_ASCAP= ['','MT','ET','VI','VV','BI','BV','T'];

let uidCounter = 1;
function nextUid(){ return 'u'+(uidCounter++); }

function blankContrib(){ return {role:'Composer', name:'', society:'IPRS', share:'', ipiCae:''}; }

/* ============================================================
   SHARE DEFAULTS & VALIDATION
   Publisher present on a track -> Publisher 50%, Composer 25%, Author 25%
   (only fills blanks; never overwrites a share the user already set)
   ============================================================ */
function applyRoleShareDefaults(t){
  const hasPublisher = t.contributors.some(c=>c.role==='Publisher');
  if(!hasPublisher) return;
  t.contributors.forEach(c=>{
    if(c.share!==''&&c.share!=null) return;
    if(c.role==='Publisher') c.share='50';
    else if(c.role==='Composer') c.share='25';
    else if(c.role==='Author') c.share='25';
  });
}
function shareNum(s){
  if(s===''||s==null) return 0;
  const n=parseFloat(String(s).replace('%','').trim());
  return isNaN(n)?0:n;
}
function validateEpisodeShares(ep){
  const problems=[];
  ep.tracks.forEach((t,ti)=>{
    const named=t.contributors.filter(c=>c.name||c.role);
    if(named.length===0) return;
    const total=named.reduce((s,c)=>s+shareNum(c.share),0);
    if(Math.abs(total-100)>0.5){
      problems.push((t.name||('Track '+(ti+1)))+' — '+total+'%');
    }
  });
  return problems;
}
function validateSharesForExport(episodes){
  const all=[];
  episodes.forEach(ep=>{
    const p=validateEpisodeShares(ep);
    if(p.length){ all.push({ep, problems:p}); }
  });
  if(all.length){
    const first=all[0];
    const label=first.ep.episodeTitle||('Episode '+(first.ep.episodeNo||''));
    toast('Contributor shares must total 100% before export — check '+label+': '+first.problems[0]+'.', true);
    return false;
  }
  return true;
}
function blankTrack(){
  return {
    _uid:nextUid(),
    name:'', duration:'', isrc:'', singer:'', noOfUsage:'1',
    usageIPRS:'', usagePRS:'', usageASCAP:'',
    codeIPRS:'', codePRS:'', codeASCAP:'',
    contributors:[ blankContrib() ]
  };
}
function blankEpisode(){
  return {
    _uid:nextUid(),
    episodeNo:'', episodeTitle:'', airDate:'', totalDuration:'',
    tracks:[ blankTrack() ]
  };
}
function blankState(){
  return {
    prod:{
      title:'', altTitle:'',
      productionCompany:'', productionNo:'', filmItemNo:'NA', productionYear:'', country:'India',
      language:'', genre:'', programType:'', typeOfAV:'',
      director:'', producer:'', actors:'', channel:'',
      bgComposer:'', submittedBy:'', companyName:'AMISHNA MUSIC',
      seasonNo:'', totalEpisodes:'',
      ascapCompanyName:'NA', ascapAddress:'NA', ascapPhone:'NA', ascapContact:'', ascapNetwork:''
    },
    episodes:[ blankEpisode() ]
  };
}
let state = blankState();

/* ============================================================
   DURATION HELPERS
   ============================================================ */
function parseHMS(s){
  if(s===null||s===undefined||s==='') return 0;
  const parts=String(s).split(':').map(x=>parseInt(x,10));
  const clean=parts.map(x=>isNaN(x)?0:x);
  while(clean.length<3) clean.unshift(0);
  const [h,m,ss]=clean.slice(-3);
  return h*3600+m*60+ss;
}
function secondsToHMS(sec){
  sec=Math.max(0,Math.round(sec));
  const h=Math.floor(sec/3600); sec-=h*3600;
  const m=Math.floor(sec/60); const s=sec-m*60;
  const p=n=>String(n).padStart(2,'0');
  return p(h)+':'+p(m)+':'+p(s);
}
function computeMusicDuration(ep){
  const total=ep.tracks.reduce((sum,t)=>sum+parseHMS(t.duration),0);
  return secondsToHMS(total);
}
function refreshMusicDurationDisplay(ep){
  const el=document.querySelector('[data-music-duration="'+ep._uid+'"]');
  if(el) el.value = computeMusicDuration(ep);
}

/* ============================================================
   PRODUCTION FORM DEFINITION (series-level, constant across episodes)
   ============================================================ */
const PROD_FIELDS = [
  {sub:'Title'},
  {k:'title', l:'Title (serial / film / item)', req:true, span:2},
  {k:'altTitle', l:'Alternative title(s)'},
  {k:'seasonNo', l:'Season no.'},
  {k:'totalEpisodes', l:'Total no. of episodes'},
  {k:'programType', l:'Serial / program type', ph:'Daily Soaps, Web Series, Film…'},
  {k:'typeOfAV', l:'Type of AV', ph:'Episode, Film…'},

  {sub:'Production'},
  {k:'productionCompany', l:'Production company / banner', req:true, span:2},
  {k:'productionYear', l:'Production year'},
  {k:'producer', l:'Producer(s)', span:2},
  {k:'director', l:'Director', req:true},
  {k:'actors', l:'Principal actors / actresses', span:2},
  {k:'genre', l:'Genre / category'},
  {k:'language', l:'Language'},
  {k:'country', l:'Country of origin'},
  {k:'productionNo', l:'Production no.'},
  {k:'filmItemNo', l:'Film / item no.'},

  {sub:'Broadcast'},
  {k:'channel', l:'Channel / network', req:true},

  {sub:'Music & submission'},
  {k:'bgComposer', l:'Background music composer'},
  {k:'submittedBy', l:'Submitted by (name of C/A/E)'},
  {k:'companyName', l:'Your company (footer on PRS/ASCAP)'},

  {sub:'ASCAP contact block — optional (US sheet header)'},
  {k:'ascapCompanyName', l:'Company name'},
  {k:'ascapContact', l:'Contact', ph:'defaults to production company'},
  {k:'ascapAddress', l:'Address'},
  {k:'ascapPhone', l:'Phone'},
  {k:'ascapNetwork', l:'Network station', ph:'defaults to channel'},
];

function buildProdForm(){
  const host = document.getElementById('prodForm');
  host.innerHTML = '';
  PROD_FIELDS.forEach(f=>{
    if(f.sub!==undefined){
      const d=document.createElement('div'); d.className='subhead'; d.textContent=f.sub; host.appendChild(d); return;
    }
    const wrap=document.createElement('div');
    wrap.className='field'+(f.span===2?' span-2':'');
    const lab=document.createElement('label'); lab.className='lab';
    lab.innerHTML=f.l+(f.req?' <span class="req">*</span>':'');
    const inp=document.createElement('input');
    inp.type='text'; inp.value=state.prod[f.k]||''; if(f.ph) inp.placeholder=f.ph;
    inp.addEventListener('input', ()=>{ state.prod[f.k]=inp.value; });
    wrap.appendChild(lab); wrap.appendChild(inp); host.appendChild(wrap);
  });
}
function refreshProdForm(){ buildProdForm(); renderProdSummary(); }

/* ============================================================
   EPISODES + TRACKS RENDER
   ============================================================ */
function selectHTML(options, val){
  return options.map(o=>'<option value="'+escapeAttr(o)+'"'+(o===val?' selected':'')+'>'+(o===''?'—':escapeHtml(o))+'</option>').join('');
}

/* Tracks the currently-selected track index per episode (by episode _uid).
   Kept outside `state` on purpose — it's pure UI state and must never be
   written into saved projects / exports. */
let selectedTrackByEp = {};

let selectedEpisodeUid = null;

/* Derived (not stored) status used purely for the sidebar/table badges —
   business logic (validateEpisodeShares) is unchanged, this just reads it. */
function episodeStatus(ep){
  if(!ep.tracks.length || !ep.tracks.some(t=>t.name)) return {label:'Draft', cls:'st-draft', badge:'b-draft'};
  const problems = validateEpisodeShares(ep);
  if(problems.length) return {label:'In Progress', cls:'st-progress', badge:'b-progress'};
  return {label:'Ready', cls:'st-locked', badge:'b-locked'};
}
function trackStatus(t){
  if(!t.name) return {label:'Draft', badge:'b-draft'};
  const named=t.contributors.filter(c=>c.name||c.role);
  const total=named.reduce((s,c)=>s+shareNum(c.share),0);
  if(named.length && Math.abs(total-100)<0.5) return {label:'Complete', badge:'b-locked'};
  return {label:'In Progress', badge:'b-progress'};
}

/* Master render entry point — same name/signature as before, so every
   existing call site (import, project load, add/delete, etc.) keeps working
   unchanged; only what happens inside has been redesigned. */
function renderEpisodes(){
  populateExportRange();
  if(!selectedEpisodeUid || !state.episodes.find(e=>e._uid===selectedEpisodeUid)){
    selectedEpisodeUid = state.episodes.length ? state.episodes[0]._uid : null;
  }
  renderEpisodeSidebar();
  renderEpisodeWorkspace();
}

function renderEpisodeSidebar(){
  const host=document.getElementById('epSidebarList');
  const countRow=document.getElementById('epCountRow');
  if(!host) return;
  host.innerHTML='';
  if(state.episodes.length===0){
    host.innerHTML='<div class="empty-note2">No episodes yet.<br>Import a workbook or add one by hand.</div>';
    countRow.textContent='';
    return;
  }
  countRow.textContent=state.episodes.length+(state.episodes.length===1?' episode':' episodes');
  state.episodes.forEach((ep,idx)=>{
    const st=episodeStatus(ep);
    const row=document.createElement('div');
    row.className='ep-row'+(ep._uid===selectedEpisodeUid?' active':'');
    row.dataset.uid=ep._uid;
    row.innerHTML=
      '<div class="ep-row-no">'+escapeHtml(ep.episodeNo||String(idx+1))+'</div>'+
      '<div class="ep-row-mid">'+
        '<div class="ep-row-title">'+escapeHtml(ep.episodeTitle||'Untitled episode')+'</div>'+
        '<div class="ep-row-sub"><span class="status-dot '+st.cls+'"></span>'+ep.tracks.length+(ep.tracks.length===1?' track':' tracks')+' · '+st.label+'</div>'+
      '</div>'+
      '<button type="button" class="ep-row-del" title="Remove episode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
    row.addEventListener('click', e=>{
      if(e.target.closest('.ep-row-del')) return;
      selectEpisode(ep._uid);
    });
    row.querySelector('.ep-row-del').addEventListener('click', e=>{
      e.stopPropagation();
      const i=state.episodes.findIndex(x=>x._uid===ep._uid);
      state.episodes.splice(i,1);
      delete selectedTrackByEp[ep._uid];
      if(selectedEpisodeUid===ep._uid) selectedEpisodeUid=null;
      renderEpisodes();
    });
    host.appendChild(row);
  });
}

function selectEpisode(uid){
  selectedEpisodeUid=uid;
  document.querySelectorAll('#builderApp .ep-row').forEach(r=>r.classList.toggle('active', r.dataset.uid===uid));
  renderEpisodeWorkspace();
}

function filterEpisodeSidebar(){
  const q=(document.getElementById('epSearchInputSide')?.value||document.getElementById('epSearchInput')?.value||'').trim().toLowerCase();
  document.querySelectorAll('#builderApp .ep-row').forEach(row=>{
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function refreshEpSidebarRow(ep){
  const row=document.querySelector('#builderApp .ep-row[data-uid="'+ep._uid+'"]');
  if(!row) return;
  const st=episodeStatus(ep);
  const titleEl=row.querySelector('.ep-row-title'); if(titleEl) titleEl.textContent=ep.episodeTitle||'Untitled episode';
  const noEl=row.querySelector('.ep-row-no'); if(noEl) noEl.textContent=ep.episodeNo||'';
  const subEl=row.querySelector('.ep-row-sub');
  if(subEl) subEl.innerHTML='<span class="status-dot '+st.cls+'"></span>'+ep.tracks.length+(ep.tracks.length===1?' track':' tracks')+' · '+st.label;
}

function renderEpisodeWorkspace(){
  const ep = state.episodes.find(e=>e._uid===selectedEpisodeUid);
  const detailHost=document.getElementById('epDetailFields');
  const dlHost=document.getElementById('epDownloadActions');
  const tbody=document.getElementById('trackTableBody');

  if(!ep){
    detailHost.innerHTML='<div class="empty-note2">No episode selected — add one from the left sidebar.</div>';
    dlHost.innerHTML='';
    tbody.innerHTML='<tr><td colspan="7" class="empty-note2">No episode selected.</td></tr>';
    buildTrackDetailPanel(null, null);
    return;
  }

  detailHost.innerHTML='';
  detailHost.appendChild(epField('Episode Number', ep.episodeNo, v=>{ep.episodeNo=v; refreshEpSidebarRow(ep); populateExportRange();}));
  detailHost.appendChild(epField('Episode Name', ep.episodeTitle, v=>{ep.episodeTitle=v; refreshEpSidebarRow(ep);}));
  detailHost.appendChild(epField('Air Date', ep.airDate, v=>ep.airDate=v, 'e.g. 9 Mar 2023'));
  detailHost.appendChild(epField('Program Duration', ep.totalDuration, v=>ep.totalDuration=v, 'HH:MM:SS'));
  detailHost.appendChild(epField('Music Duration', computeMusicDuration(ep), null, null, true, ep._uid));

  dlHost.innerHTML='';
  [['IPRS', ()=>buildIPRSWorkbook(ep), ()=>iprsFilename(ep)],
   ['PRS',  ()=>buildPRSWorkbook(ep),  ()=>prsFilename(ep)],
   ['ASCAP',()=>buildASCAPWorkbook(ep),()=>ascapFilename(ep)]].forEach(([label, buildWb, fname])=>{
    const b=document.createElement('button'); b.type='button'; b.className='b2-btn-ghost-sm'; b.textContent=label;
    b.addEventListener('click', async ()=>{
      if(!validateSharesForExport([ep])) return;
      const wb=buildWb(); await downloadWorkbook(wb, fname());
      toast(label+' cue sheet downloaded.');
    });
    dlHost.appendChild(b);
  });

  renderTrackTable(ep);
}

function renderTrackTable(ep){
  const tbody=document.getElementById('trackTableBody');
  tbody.innerHTML='';
  if(ep.tracks.length===0){
    tbody.innerHTML='<tr><td colspan="7" class="empty-note2">No tracks yet — use “+ Add Track”.</td></tr>';
    buildTrackDetailPanel(ep,null,-1);
    return;
  }

  let selIdx=selectedTrackByEp[ep._uid];
  if(selIdx===undefined||selIdx<0||selIdx>=ep.tracks.length) selIdx=0;
  selectedTrackByEp[ep._uid]=selIdx;

  ep.tracks.forEach((t,i)=>{
    const st=trackStatus(t);
    const usage=t.usageIPRS||t.usagePRS||t.usageASCAP||'—';
    const tr=document.createElement('tr');
    tr.className='track-row-tbl'+(i===selIdx?' active':'');
    tr.dataset.idx=i;
    tr.innerHTML=
      '<td class="tk-no">'+(i+1)+'</td>'+
      '<td class="tk-name">'+escapeHtml(t.name||'Untitled track')+'</td>'+
      '<td class="tk-dur">'+escapeHtml(t.duration||'—')+'</td>'+
      '<td>'+escapeHtml(t.singer||'—')+'</td>'+
      '<td>'+escapeHtml(usage)+'</td>'+
      '<td><span class="badge2 '+st.badge+'">'+st.label+'</span></td>'+
      '<td><div class="row-actions"><button type="button" class="icon-btn2 tr-del" title="Remove track"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div></td>';
    tr.addEventListener('click', e=>{
      if(e.target.closest('.tr-del')) return;
      selectedTrackByEp[ep._uid]=i;
      document.querySelectorAll('#builderApp .track-row-tbl').forEach(r=>r.classList.toggle('active', +r.dataset.idx===i));
      buildTrackDetailPanel(ep, ep.tracks[i], i);
    });
    tr.querySelector('.tr-del').addEventListener('click', e=>{
      e.stopPropagation();
      ep.tracks.splice(i,1);
      if(ep.tracks.length===0) delete selectedTrackByEp[ep._uid];
      else if(selectedTrackByEp[ep._uid]>=ep.tracks.length) selectedTrackByEp[ep._uid]=ep.tracks.length-1;
      refreshEpSidebarRow(ep);
      renderTrackTable(ep);
    });
    tbody.appendChild(tr);
  });

  buildTrackDetailPanel(ep, ep.tracks[selIdx], selIdx);
}

function addTrackToSelected(){
  const ep=state.episodes.find(e=>e._uid===selectedEpisodeUid);
  if(!ep){ toast('Select or add an episode first.', true); return; }
  ep.tracks.push(blankTrack());
  selectedTrackByEp[ep._uid]=ep.tracks.length-1;
  refreshEpSidebarRow(ep);
  renderTrackTable(ep);
}

function epField(labelText, val, onChange, ph, readonly, musicUid){
  const w=document.createElement('div'); w.className='field';
  const l=document.createElement('label'); l.className='lab'; l.textContent=labelText;
  const i=document.createElement('input'); i.type='text'; i.value=val||''; if(ph) i.placeholder=ph;
  if(readonly){ i.readOnly=true; if(musicUid) i.setAttribute('data-music-duration', musicUid); }
  else { i.addEventListener('input', ()=>onChange(i.value)); }
  w.append(l,i); return w;
}

/* Right-hand panel: track detail form + contributors table for whichever
   track is selected in the center table. */
function buildTrackDetailPanel(ep, t, idx){
  const fieldsHost=document.getElementById('trackDetailFields');
  const contribHost=document.getElementById('contribTableHost');
  const addBtn=document.getElementById('addContribBtn');
  const badge=document.getElementById('totalShareBadge');
  const saveWrap=document.getElementById('saveSongWrap');
  if(!fieldsHost) return;
  fieldsHost.innerHTML=''; contribHost.innerHTML=''; saveWrap.innerHTML='';

  if(!ep || !t){
    fieldsHost.innerHTML='<div class="empty-note2" style="grid-column:1/-1;">Select a track to edit its details.</div>';
    addBtn.style.display='none'; badge.style.display='none';
    return;
  }
  addBtn.style.display=''; badge.style.display='';

  const refreshRowLabel=()=>{
    const row=document.querySelector('#builderApp .track-row-tbl[data-idx="'+idx+'"]');
    if(row){
      const n=row.querySelector('.tk-name'); if(n) n.textContent=t.name||'Untitled track';
      const d=row.querySelector('.tk-dur'); if(d) d.textContent=t.duration||'—';
    }
  };

  const span2=w=>{ w.style.gridColumn='1/-1'; return w; };
  fieldsHost.appendChild(span2(miniField('Track Name', t.name, v=>{t.name=v; refreshRowLabel(); refreshEpSidebarRow(ep); refreshTrackRowStatus(idx,t);})));
  fieldsHost.appendChild(miniField('Duration', t.duration, v=>{t.duration=v; refreshMusicDurationDisplay(ep); refreshRowLabel();}, 'text', 'HH:MM:SS'));
  fieldsHost.appendChild(miniField('Singer', t.singer, v=>{t.singer=v; refreshTrackRowSinger(idx,t);}));
  fieldsHost.appendChild(miniField('ISRC', t.isrc, v=>t.isrc=v));
  fieldsHost.appendChild(miniField('No. of Usage', t.noOfUsage, v=>t.noOfUsage=v));

  const sub=document.createElement('div'); sub.className='mini-subhead'; sub.style.gridColumn='1/-1'; sub.textContent='Usage & Identifiers';
  fieldsHost.appendChild(sub);
  fieldsHost.appendChild(miniSelect('Usage — IPRS', USAGE_IPRS, t.usageIPRS, v=>{t.usageIPRS=v; refreshTrackRowUsage(idx,t);}));
  fieldsHost.appendChild(miniSelect('Usage — PRS', USAGE_PRS, t.usagePRS, v=>{t.usagePRS=v; refreshTrackRowUsage(idx,t);}));
  fieldsHost.appendChild(miniSelect('Usage — ASCAP', USAGE_ASCAP, t.usageASCAP, v=>{t.usageASCAP=v; refreshTrackRowUsage(idx,t);}));
  fieldsHost.appendChild(miniField('Song code — IPRS', t.codeIPRS, v=>t.codeIPRS=v));
  fieldsHost.appendChild(miniField('Work number — PRS', t.codePRS, v=>t.codePRS=v));
  fieldsHost.appendChild(miniField('Work ID — ASCAP', t.codeASCAP, v=>t.codeASCAP=v));

  // Contributors
  const head=document.createElement('div'); head.className='contrib-row contrib-head';
  head.innerHTML='<div>Name</div><div>Role</div><div>Society</div><div>Share %</div><div>IPI/CAE</div><div></div>';
  contribHost.appendChild(head);

  const refreshTotal=()=>{
    const total=t.contributors.reduce((s,c)=>s+shareNum(c.share),0);
    const ok=Math.abs(total-100)<0.5;
    badge.classList.toggle('warn', !ok);
    badge.textContent='Total Share = '+(Math.round(total*100)/100)+'%';
    refreshEpSidebarRow(ep);
    refreshTrackRowStatus(idx,t);
  };

  t.contributors.forEach((c, ci)=>{
    const row=document.createElement('div'); row.className='contrib-row';
    const nInp=document.createElement('input'); nInp.value=c.name; nInp.placeholder='Name';
    nInp.addEventListener('input',()=>{ c.name=nInp.value; refreshTotal(); });
    const rSel=document.createElement('select'); rSel.innerHTML=selectHTML(ROLES,c.role);
    rSel.addEventListener('change',()=>{ c.role=rSel.value; applyRoleShareDefaults(t); buildTrackDetailPanel(ep,t,idx); });
    const sSel=document.createElement('select'); sSel.innerHTML=selectHTML(SOCIETIES,c.society);
    sSel.addEventListener('change',()=>c.society=sSel.value);
    const shInp=document.createElement('input'); shInp.value=c.share; shInp.placeholder='50';
    shInp.addEventListener('input',()=>{ c.share=shInp.value; refreshTotal(); });
    const ipInp=document.createElement('input'); ipInp.value=c.ipiCae; ipInp.placeholder='IPI / CAE';
    ipInp.addEventListener('input',()=>c.ipiCae=ipInp.value);
    const delBtn=document.createElement('button'); delBtn.type='button'; delBtn.className='icon-btn2'; delBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'; delBtn.title='Remove';
    delBtn.addEventListener('click',()=>{ t.contributors.splice(ci,1); if(t.contributors.length===0)t.contributors.push(blankContrib()); buildTrackDetailPanel(ep,t,idx); });

    const nW=document.createElement('div'); nW.appendChild(nInp);
    const rW=document.createElement('div'); rW.appendChild(rSel);
    const sW=document.createElement('div'); sW.appendChild(sSel);
    const shW=document.createElement('div'); shW.appendChild(shInp);
    const ipW=document.createElement('div'); ipW.appendChild(ipInp);
    const dW=document.createElement('div'); dW.appendChild(delBtn);
    row.append(nW,rW,sW,shW,ipW,dW);
    contribHost.appendChild(row);
  });
  refreshTotal();

  addBtn.onclick=()=>{ t.contributors.push(blankContrib()); buildTrackDetailPanel(ep,t,idx); };

  const saveBtn=document.createElement('button');
  saveBtn.type='button'; saveBtn.className='save-song-db-btn'; saveBtn.textContent='Save to Song Database';
  saveBtn.title='Save this song to the master Song Database and sync matching tracks';
  saveBtn.addEventListener('click', ()=>saveTrackToSongDatabase(t._uid));
  saveWrap.appendChild(saveBtn);
}

function refreshTrackRowStatus(idx, t){
  const row=document.querySelector('#builderApp .track-row-tbl[data-idx="'+idx+'"]');
  if(!row) return;
  const st=trackStatus(t);
  const cell=row.children[5];
  if(cell) cell.innerHTML='<span class="badge2 '+st.badge+'">'+st.label+'</span>';
}
function refreshTrackRowUsage(idx, t){
  const row=document.querySelector('#builderApp .track-row-tbl[data-idx="'+idx+'"]');
  if(!row) return;
  const cell=row.children[4];
  if(cell) cell.textContent=t.usageIPRS||t.usagePRS||t.usageASCAP||'—';
}
function refreshTrackRowSinger(idx, t){
  const row=document.querySelector('#builderApp .track-row-tbl[data-idx="'+idx+'"]');
  if(!row) return;
  const cell=row.children[3];
  if(cell) cell.textContent=t.singer||'—';
}

function miniField(labelText, val, onChange, type, ph){
  const w=document.createElement('div'); w.className='field';
  const l=document.createElement('label'); l.className='lab'; l.textContent=labelText;
  const i=document.createElement('input'); i.type=type||'text'; i.value=val||''; if(ph)i.placeholder=ph;
  i.addEventListener('input',()=>onChange(i.value));
  w.append(l,i); return w;
}
function miniSelect(labelText, options, val, onChange){
  const w=document.createElement('div'); w.className='field';
  const l=document.createElement('label'); l.className='lab'; l.textContent=labelText;
  const s=document.createElement('select'); s.innerHTML=selectHTML(options,val);
  s.addEventListener('change',()=>onChange(s.value));
  w.append(l,s); return w;
}

function addEpisode(){
  const ep=blankEpisode();
  state.episodes.push(ep);
  selectedEpisodeUid=ep._uid;
  renderEpisodes();
  document.querySelector('#builderApp .ep-row[data-uid="'+ep._uid+'"]')?.scrollIntoView({behavior:'smooth',block:'center'});
}

/* ============================================================
   PRODUCTION SUMMARY CARD + MODAL
   ============================================================ */
function renderProdSummary(){
  const titleEl=document.getElementById('prodSummaryTitle');
  if(!titleEl) return;
  const p=state.prod;
  titleEl.textContent = p.title || 'Untitled production';
  const crumb=document.getElementById('b2CrumbTitle'); if(crumb) crumb.textContent = p.title || 'Untitled production';

  document.getElementById('prodSummaryTags').innerHTML =
    (p.programType?'<span class="chip">'+escapeHtml(p.programType)+'</span>':'') +
    (p.seasonNo?'<span class="chip gold">Season '+escapeHtml(p.seasonNo)+'</span>':'');

  const rows=[
    ['Production Co.', p.productionCompany],
    ['Season', p.seasonNo],
    ['Total Episodes', p.totalEpisodes],
    ['Background Composer', p.bgComposer],
    ['Language', p.language],
    ['Type of AV', p.typeOfAV],
  ];
  document.getElementById('prodSummaryMeta').innerHTML = rows.map(([l,v])=>
    '<div class="m"><div class="l">'+l+'</div><div class="v">'+escapeHtml(v||'—')+'</div></div>'
  ).join('');

  const poster=document.getElementById('prodPosterMini');
  const initials=(p.title||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  poster.textContent=initials||'—';
}
function openProdDetailsModal(){ buildProdForm(); document.getElementById('prodDetailsModal').style.display='flex'; }
function closeProdDetailsModal(){ document.getElementById('prodDetailsModal').style.display='none'; renderProdSummary(); }

/* ============================================================
   PREVIEW CUE SHEET (read-only, non-destructive summary)
   ============================================================ */
function previewCueSheet(){
  const ep = state.episodes.find(e=>e._uid===selectedEpisodeUid) || state.episodes[0];
  const host=document.getElementById('previewBody');
  if(!ep){ host.innerHTML='<div class="empty-note2">No episode to preview yet.</div>'; }
  else{
    const rows=[
      ['Production', state.prod.title||'—'],
      ['Episode No.', ep.episodeNo||'—'],
      ['Air Date', ep.airDate||'—'],
      ['Programme Duration', ep.totalDuration||'—'],
      ['Music Duration', computeMusicDuration(ep)],
      ['Background Composer', state.prod.bgComposer||'—'],
    ];
    let html='<h1>'+escapeHtml(ep.episodeTitle||'Untitled episode')+'</h1>'+
      '<p class="pv-sub">'+escapeHtml(state.prod.title||'Untitled production')+' &middot; Cue Sheet Preview</p>'+
      '<div class="pv-meta">'+rows.map(([l,v])=>'<div><div class="l">'+l+'</div><div class="v">'+escapeHtml(v)+'</div></div>').join('')+'</div>'+
      '<table><thead><tr><th>#</th><th>Track</th><th>Duration</th><th>Singer(s)</th><th>Contributors</th></tr></thead><tbody>';
    ep.tracks.forEach((t,i)=>{
      const contribs=t.contributors.filter(c=>c.name).map(c=>c.name+' ('+c.role+', '+(c.share||'0')+'%)').join(', ')||'—';
      html+='<tr><td>'+(i+1)+'</td><td>'+escapeHtml(t.name||'Untitled track')+'</td><td>'+escapeHtml(t.duration||'—')+'</td><td>'+escapeHtml(t.singer||'—')+'</td><td>'+escapeHtml(contribs)+'</td></tr>';
    });
    html+='</tbody></table>';
    host.innerHTML=html;
  }
  document.getElementById('previewModal').style.display='flex';
}
function closePreviewModal(){ document.getElementById('previewModal').style.display='none'; }

/* ============================================================
   SAVE CHANGES (manual trigger on top of the existing autosave)
   ============================================================ */
function saveChangesNow(){
  autosaveCurrentProject();
  const el=document.getElementById('b2Autosave');
  const txt=document.getElementById('b2AutosaveText');
  if(el){ el.classList.remove('saving'); }
  if(txt){ txt.textContent='All changes saved'; }
  toast('All changes saved.');
}


/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m];});}
function escapeAttr(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m];});}
function toast(msg, isErr){
  const t=document.getElementById('toast'); t.textContent=msg; t.className='toast show'+(isErr?' err':'');
  clearTimeout(t._t); t._t=setTimeout(()=>t.className='toast'+(isErr?' err':''),3200);
}
function safeName(s){ return (s||'cue-sheet').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60)||'cue-sheet'; }

function fmtDuration(v){
  if(v===null||v===undefined||v==='') return '';
  if(typeof v==='string') return v.trim();
  if(v instanceof Date){
    const p=n=>String(n).padStart(2,'0');
    return p(v.getUTCHours())+':'+p(v.getUTCMinutes())+':'+p(v.getUTCSeconds());
  }
  if(typeof v==='number'){
    let tot=Math.round(v*24*3600);
    const h=Math.floor(tot/3600); tot-=h*3600;
    const m=Math.floor(tot/60); const s=tot-m*60;
    const p=n=>String(n).padStart(2,'0');
    return p(h)+':'+p(m)+':'+p(s);
  }
  if(typeof v==='object'){
    if(v.text!==undefined) return String(v.text).trim();
    if(v.result!==undefined) return fmtDuration(v.result);
    if(v.richText) return v.richText.map(r=>r.text).join('').trim();
    if(v.hyperlink&&v.text) return String(v.text).trim();
  }
  return String(v);
}
function cellText(v){
  if(v===null||v===undefined) return '';
  if(typeof v==='object'){
    if(v.text!==undefined) return String(v.text);
    if(v.result!==undefined) return String(v.result);
    if(v.richText) return v.richText.map(r=>r.text).join('');
    if(v.hyperlink&&v.text) return String(v.text);
  }
  return String(v);
}

/* ============================================================
   WORKBOOK IMPORT — every worksheet becomes one episode
   ============================================================ */
function fileInput(which){
  const ids={workfile:'fileWorkfile', episodeWorkfile:'fileEpisodeWorkfile', project:'fileProject', iprsImport:'fileIprsImport'};
  document.getElementById(ids[which]||'fileProject').click();
}

async function onWorkfile(ev){
  const file=ev.target.files[0]; ev.target.value='';
  if(!file) return;
  try{
    const buf=await file.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    if(!wb.worksheets.length){ toast('Could not read that workbook.',true); return; }

    const importedEpisodes=[];
    wb.worksheets.forEach(ws=>{
      const rows=[];
      ws.eachRow({includeEmpty:false},(row)=>{
        const nameRaw=cellText(row.getCell(1).value).trim();
        const durRaw=row.getCell(2).value;
        rows.push({nameRaw, durRaw});
      });
      if(rows.length && /^(track ?name|name|title|song ?title)$/i.test(rows[0].nameRaw)){
        rows.shift();
      }
      const tracks=[];
      rows.forEach(r=>{
        if(!r.nameRaw) return;
        const t=blankTrack();
        t.name=r.nameRaw;
        t.duration=fmtDuration(r.durRaw);
        tracks.push(t);
      });
      if(tracks.length===0) return; // skip sheets with no track rows

      const totalDurCell=ws.getCell('C2').value;
      const ep=blankEpisode();
      ep.tracks=tracks;
      ep.totalDuration=fmtDuration(totalDurCell);
      const numMatch=String(ws.name).match(/(\d+)/);
      ep.episodeNo = numMatch ? numMatch[1] : '';
      ep.episodeTitle = ''; // Episode Name must only ever contain data the user typed — never derived from the sheet name/number
      importedEpisodes.push(ep);
    });

    if(importedEpisodes.length===0){ toast('No episode sheets with track rows were found in that workbook.',true); return; }

    const isEmpty = state.episodes.length===0 || (state.episodes.length===1 && !state.episodes[0].episodeTitle && state.episodes[0].tracks.length===1 && !state.episodes[0].tracks[0].name);
    state.episodes = isEmpty ? importedEpisodes : state.episodes.concat(importedEpisodes);
    renderEpisodes();
    toast('Imported '+importedEpisodes.length+' episode'+(importedEpisodes.length>1?'s':'')+' from the workbook.');
  }catch(err){
    console.error(err);
    toast('Something went wrong reading the workbook.',true);
  }
}

/* ============================================================
   SINGLE-EPISODE EXCEL IMPORT — one file, one new episode,
   appended without touching any existing episodes
   ============================================================ */
async function onEpisodeWorkfile(ev){
  const file=ev.target.files[0]; ev.target.value='';
  if(!file) return;
  try{
    const buf=await file.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    if(!wb.worksheets.length){ toast('Could not read that Excel file.',true); return; }

    const ws=wb.worksheets[0];
    const rows=[];
    ws.eachRow({includeEmpty:false},(row)=>{
      const nameRaw=cellText(row.getCell(1).value).trim();
      const durRaw=row.getCell(2).value;
      rows.push({nameRaw, durRaw});
    });
    if(rows.length && /^(track ?name|name|title|song ?title)$/i.test(rows[0].nameRaw)){
      rows.shift();
    }
    const tracks=[];
    rows.forEach(r=>{
      if(!r.nameRaw) return;
      const t=blankTrack();
      t.name=r.nameRaw;
      t.duration=fmtDuration(r.durRaw);
      tracks.push(t);
    });
    if(tracks.length===0){ toast('No track rows were found in that Excel file.',true); return; }

    const totalDurCell=ws.getCell('C2').value;
    const ep=blankEpisode();
    ep.tracks=tracks;
    ep.totalDuration=fmtDuration(totalDurCell);
    const numMatch=String(ws.name).match(/(\d+)/);
    ep.episodeNo = numMatch ? numMatch[1] : String(state.episodes.length+1);
    ep.episodeTitle = ''; // Episode Name must only ever contain data the user typed — never derived from the sheet name/number

    const isEmpty = state.episodes.length===1 && !state.episodes[0].episodeTitle && !state.episodes[0].episodeNo && state.episodes[0].tracks.length===1 && !state.episodes[0].tracks[0].name;
    state.episodes = isEmpty ? [ep] : state.episodes.concat([ep]);
    renderEpisodes();
    toast('Episode created from "'+file.name+'" — other episodes were left untouched.');
  }catch(err){
    console.error(err);
    toast('Something went wrong reading that Excel file.',true);
  }
}

/* ============================================================
   SAVE / OPEN PROJECT
   ============================================================ */
function saveProject(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  triggerDownload(blob, safeName(state.prod.title)+'_project.json');
  toast('Project saved.');
}
async function onProject(ev){
  const file=ev.target.files[0]; ev.target.value='';
  if(!file) return;
  try{
    const txt=await file.text();
    const data=JSON.parse(txt);
    if(!data.prod||!Array.isArray(data.episodes)) throw new Error('bad file');
    const fresh=blankState();
    state={ prod:Object.assign(fresh.prod, data.prod),
            episodes:data.episodes.map(ep=>Object.assign(blankEpisode(), ep, {_uid:nextUid(),
              tracks:(ep.tracks&&ep.tracks.length?ep.tracks:[blankTrack()]).map(t=>Object.assign(blankTrack(), t, {_uid:nextUid(),
                contributors:(t.contributors&&t.contributors.length?t.contributors:[blankContrib()]).map(c=>Object.assign(blankContrib(),c))}))})) };
    refreshProdForm(); renderEpisodes();
    toast('Project opened.');
  }catch(err){ toast('That does not look like a saved project file.',true); }
}
function clearAll(){
  if(!confirm('Clear everything and start a new cue sheet?')) return;
  state=blankState(); refreshProdForm(); renderEpisodes(); toast('Cleared.');
}

function triggerDownload(blob, filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function downloadWorkbook(wb, filename){
  const buf=await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), filename);
}

/* ============================================================
   EXCEL STYLE HELPERS
   ============================================================ */
const GREEN='FF00FF00';
const thin ={style:'thin',  color:{argb:'FF000000'}};
const med  ={style:'medium',color:{argb:'FF000000'}};
const thick={style:'thick', color:{argb:'FF000000'}};
function colToNum(c){let n=0;for(const ch of c)n=n*26+(ch.charCodeAt(0)-64);return n;}
function numToCol(n){let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26;}return s;}
function eachInRange(range, cb){
  const parts=range.split(':'); const a=parts[0], b=parts[1];
  const am=a.match(/([A-Z]+)(\d+)/), bm=b.match(/([A-Z]+)(\d+)/);
  const c1=colToNum(am[1]),r1=+am[2],c2=colToNum(bm[1]),r2=+bm[2];
  for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)cb(numToCol(c)+r);
}
function boxRange(ws, range, border){
  border=border||thin;
  eachInRange(range, function(addr){ ws.getCell(addr).border={top:border,left:border,bottom:border,right:border}; });
}
function put(ws, addr, value, opt){
  opt=opt||{};
  const cell=ws.getCell(addr);
  if(value!==undefined && value!==null) cell.value=value;
  cell.font={ name:opt.font||'Arial', size:opt.size||11, bold:!!opt.bold, color:{argb:'FF000000'} };
  cell.alignment={ horizontal:opt.h||'left', vertical:opt.v||'middle', wrapText:opt.wrap!==false };
  if(opt.fill) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:opt.fill}};
  if(opt.border) cell.border={top:opt.border,left:opt.border,bottom:opt.border,right:opt.border};
  return cell;
}
function mergePut(ws, range, value, opt){
  ws.mergeCells(range);
  const master=range.split(':')[0];
  put(ws, master, value, opt);
  if(opt&&opt.box) boxRange(ws, range, opt.box);
  return ws.getCell(master);
}
function societyDisplay(s, forAscap){
  if(!s) return '';
  if(/^non society$/i.test(s)) return forAscap?'Non Society':'NS';
  return s;
}
function shareToDecimal(s){
  if(s===''||s==null) return '';
  let str=String(s).replace('%','').trim();
  let n=parseFloat(str);
  if(isNaN(n)) return s;
  return Math.round((n/100)*10000)/10000;
}
function fmtShare(s){
  if(s===''||s==null) return '';
  let str=String(s).trim();
  return str.includes('%')?str:str+'%';
}

function episodeLabel(ep, idx){
  return ep.episodeNo ? ('Ep'+ep.episodeNo) : ('Ep'+(idx+1));
}
function iprsFilename(ep){ const idx=state.episodes.indexOf(ep); return safeName(state.prod.title)+'_'+episodeLabel(ep,idx)+'_IPRS.xlsx'; }
function prsFilename(ep){ const idx=state.episodes.indexOf(ep); return safeName(state.prod.title)+'_'+episodeLabel(ep,idx)+'_PRS.xlsx'; }
function ascapFilename(ep){ const idx=state.episodes.indexOf(ep); return safeName(state.prod.title)+'_'+episodeLabel(ep,idx)+'_ASCAP.xlsx'; }

/* ============================================================
   BUILD — IPRS  (takes one episode, returns a workbook)
   ============================================================ */
function buildIPRSWorkbook(ep){
  const p=state.prod;
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Cue Sheet');
  const widths=[50.8,18.4,20.1,20.9,18.2,21.8,32.2,43,8.9,7.1,12,18.1,49.6];
  widths.forEach((w,i)=>ws.getColumn(i+1).width=w);
  const AN='Arial Narrow';

  ws.getRow(1).height=80;
  mergePut(ws,'A1:K1',
    'The Indian Performing Right Society Limited                                                                                                                                                                                                                                                         Regd. Office : 208, Golden Chambers, 2nd Floor, New Andheri Link Road, Andheri (W), Mumbai - 400 053. \nTel: IPRS Call Center Number: 8097539960 & Office No. (091 22) 2673 3748 / 49 / 50 / 6616. Email : cuesheets@iprsltd.com, documentation@iprsltd.com, documentationsupport@iprsltd.com. Visit us at : www.iprs.org \nCIN : U92140MH1969GAP014359',
    {font:AN,size:11,h:'center',v:'middle',wrap:true});
  mergePut(ws,'A2:K2','TV/WEB SERIES CUE SHEET',{font:AN,size:26,bold:true,h:'center'});

  const L={font:AN,size:11,bold:true,h:'left',v:'middle',border:thin};
  const V={font:AN,size:11,bold:true,h:'left',v:'middle',fill:GREEN};
  const rowsHdr=[
    ['SERIAL TITLE', p.title, 'CHANNEL NAME', p.channel],
    ['SERIAL TYPE [EG: DOCUMENTRY, SOAPS, WEB SERIES]', p.programType, 'DIRECTOR', p.director],
    ['GENRE / CATEGORY', p.genre, 'BANNER / PRODUCTION COMPANY', p.productionCompany],
    ['LANGUAGE', p.language, 'PRINCIPAL ACTORS / ACTRESS', p.actors],
    ['PRODUCTION NUMBER', p.productionNo, 'TOTAL EPISODE DURATION', fmtDuration(ep.totalDuration)],
    ['DATE OF EPISODE 1ST PERFORMED / AIRED', ep.airDate, 'TOTAL MUSICAL DURATION', computeMusicDuration(ep)],
    ['PRODUCTION YEAR', p.productionYear, 'BACKGROUND MUSIC COMPOSER', p.bgComposer],
    ['PRODUCER', p.producer, 'Submitted By (Name of C/A/E)', p.submittedBy],
    ['EPISODE NO.', ep.episodeNo, 'EPISODE TITLE', ep.episodeTitle],
    ['TOTAL NO. OF EPISODE', p.totalEpisodes, 'SEASON NO', p.seasonNo],
  ];
  let r=3;
  rowsHdr.forEach(function(row){
    put(ws,'A'+r,row[0],L);
    mergePut(ws,'B'+r+':E'+r,row[1],Object.assign({},V,{box:thin}));
    put(ws,'G'+r,row[2],L);
    mergePut(ws,'H'+r+':K'+r,row[3],Object.assign({},V,{box:thin}));
    r++;
  });

  r=13; mergePut(ws,'A13:K13','',{});
  mergePut(ws,'A14:F14','WORK DETAILS',{font:AN,size:11,bold:true,h:'center',box:med});
  mergePut(ws,'G14:M14','COMPOSER / AUTHOR / PUBLISHER / SINGER DETAILS',{font:AN,size:11,bold:true,h:'center',box:med});

  const H={font:AN,size:11,bold:true,h:'center',v:'middle',wrap:true,border:thin};
  const heads=['SONG TITLE / TRACK NAME','CHARACTERISTICS','NO. OF USAGE','Internal No/Song Code','ISRC','DURATION (HH:MM:SS)','ROLE(C / A / E)','NAMES OF COMPOSER / AUTHOR / PUBLISHER ','SOCIETY','SHARE','IPI NO.','SINGER','VALIDATION LINK (IF SONG CODE IS NOT AVAILABLE)'];
  heads.forEach(function(h,i){ put(ws, numToCol(i+1)+'15', h, H); });

  const roleCode={Composer:'C',Author:'A',Publisher:'E',Arranger:'AR'};
  let row=16;
  ep.tracks.forEach(function(t){
    const contribs = t.contributors.length?t.contributors:[blankContrib()];
    contribs.forEach(function(c, ci){
      const isFirst=ci===0;
      put(ws,'A'+row, isFirst? t.name : '', {font:AN,size:11,h:'left',v:'middle',fill:isFirst&&t.name?GREEN:undefined,border:thin});
      put(ws,'B'+row, isFirst? t.usageIPRS : '', {font:AN,size:11,h:'center',border:thin});
      put(ws,'C'+row, isFirst? (t.noOfUsage||'') : '', {font:AN,size:11,h:'center',border:thin});
      put(ws,'D'+row, isFirst? t.codeIPRS : '', {font:AN,size:11,h:'center',border:thin});
      put(ws,'E'+row, isFirst? t.isrc : '', {font:AN,size:11,h:'center',border:thin});
      put(ws,'F'+row, isFirst? fmtDuration(t.duration) : '', {font:AN,size:11,h:'center',border:thin});
      put(ws,'G'+row, roleCode[c.role]||c.role||'', {font:AN,size:11,h:'center',border:thin});
      put(ws,'H'+row, c.name||'', {font:AN,size:11,h:'left',border:thin});
      put(ws,'I'+row, societyDisplay(c.society,false), {font:AN,size:11,h:'center',border:thin});
      put(ws,'J'+row, c.share!==''&&c.share!=null ? (String(c.share).includes('%')?c.share:c.share+'%') : '', {font:AN,size:11,h:'center',border:thin});
      put(ws,'K'+row, c.ipiCae||'', {font:AN,size:11,h:'center',border:thin});
      put(ws,'L'+row, isFirst? (t.singer||'') : '', {font:AN,size:11,h:'left',border:thin});
      put(ws,'M'+row, '', {font:AN,size:11,h:'left',border:thin});
      row++;
    });
  });

  row+=1;
  const legB={font:AN,size:11,bold:true,h:'left'};
  put(ws,'A'+row,'Codes:',legB);
  put(ws,'B'+row,'BI -',legB); put(ws,'C'+row,'Background Intrumental',legB);
  put(ws,'D'+row,'OI - ',legB); put(ws,'E'+row,'Opening Instrumental',legB);
  put(ws,'F'+row,'ROLE (C/A/E)',legB); row++;
  put(ws,'B'+row,'BV -',legB); put(ws,'C'+row,'BackGround Vocal',legB);
  put(ws,'D'+row,'OV -',legB); put(ws,'E'+row,'Opening Vocal',legB);
  put(ws,'F'+row,'Composer',legB); row++;
  put(ws,'B'+row,'FI -',legB); put(ws,'C'+row,'Feature Instrumental',legB);
  put(ws,'D'+row,'CI -',legB); put(ws,'E'+row,'Closing Instrumental',legB);
  put(ws,'F'+row,'Author/Lyricist',legB); row++;
  put(ws,'B'+row,'FV -',legB); put(ws,'C'+row,'Feature Vocal',legB);
  put(ws,'D'+row,'CV -',legB); put(ws,'E'+row,'Closing Vocal',legB);
  put(ws,'F'+row,'Publisher',legB); row+=2;
  mergePut(ws,'A'+row+':F'+row,'Note: Cue Sheets should be submitted for each episode Seperately.',{font:AN,size:11,bold:true,h:'left'});

  return wb;
}

/* ============================================================
   BUILD — PRS
   ============================================================ */
function buildPRSWorkbook(ep){
  const p=state.prod;
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('PRS');
  const widths={A:6.8,B:12.6,C:9,D:8.6,E:16.2,F:12.9,G:13,H:9,I:11.8,J:11.6,K:9.5,L:11};
  Object.entries(widths).forEach(function(e){ ws.getColumn(e[0]).width=e[1]; });
  const F='Arial';

  mergePut(ws,'A1:L1','LICENSOR APPROVED MUSIC CUE SHEET',{font:F,size:14,bold:true,h:'center'});
  mergePut(ws,'A2:L2','Important Note',{font:F,size:11,bold:true,h:'left'});
  mergePut(ws,'A3:L3','The correct completion of this cue sheet is a strict condition of the granting of the broadcast licences by the various copyright owners and agencies. The shaded sections indicate essential items of information which must be supplied in all cases. The unshaded sections signify information which should be supplied if it is available.',{font:F,size:11,h:'left',wrap:true});
  ws.getRow(3).height=42;
  mergePut(ws,'A4:L4','Please turn to the reverse side of this form for explanatory notes, a key to the standard codes, and helpful telephone contacts should you require any further assistance.',{font:F,size:11,h:'left',wrap:true});
  mergePut(ws,'A5:L6','Production Details',{font:F,size:20,bold:true,h:'center'});

  const LB={font:F,size:11,bold:true,h:'center',v:'middle',wrap:true};
  const VB={font:F,size:11,h:'center',v:'middle',fill:GREEN,wrap:true};
  function prsLine(cells){
    cells.forEach(function(c){
      const range=c[0], val=c[1], isVal=c[2];
      mergePut(ws,range,val,Object.assign({},(isVal?VB:LB),{box:thin}));
    });
  }
  prsLine([
    ['A7:B7','Film/Series/Item Title'],['C7:E7',p.title,true],
    ['F7:F7','Production Co.'],['G7:H7',p.productionCompany,true],
    ['I7:I7','Country of Origin'],['J7:J7',p.country,true],
    ['K7:K7','Film Duration'],['L7:L7',fmtDuration(ep.totalDuration),true],
  ]);
  prsLine([
    ['A8:B8','Episode Title'],['C8:E8',ep.episodeTitle,true],
    ['F8:F8','Production No.'],['G8:H8',p.productionNo,true],
    ['I8:I8','Production Year'],['J8:J8',p.productionYear,true],
    ['K8:K8','Music Duration'],['L8:L8',computeMusicDuration(ep),true],
  ]);
  prsLine([
    ['A9:B9','Episode No.'],['C9:E9',ep.episodeNo,true],
    ['F9:F9','Director'],['G9:H9',p.director,true],
    ['I9:I9','First Tx Date'],['J9:K9',ep.airDate,true],['L9:L9','',true],
  ]);
  prsLine([
    ['A10:B10','Film/Item No.'],['C10:E10',p.filmItemNo,true],
    ['F10:F10','Principal Actors'],['G10:H10',p.actors,true],
    ['I10:I10','Type of AV'],['J10:K10',p.typeOfAV,true],['L10:L10','',true],
  ]);
  prsLine([
    ['A11:B11','Alternative Title(s)'],['C11:E11',p.altTitle,true],
    ['F11:F11','Channel'],['G11:L11',p.channel,true],
  ]);

  mergePut(ws,'A12:L13','Music Details',{font:F,size:20,bold:true,h:'center'});

  const H={font:F,size:11,bold:true,h:'center',v:'middle',wrap:true};
  mergePut(ws,'A14:A14','Seq',Object.assign({},H,{box:med}));
  mergePut(ws,'B14:C14','Title',Object.assign({},H,{box:med}));
  mergePut(ws,'D14:D14','Role',Object.assign({},H,{box:med}));
  mergePut(ws,'E14:F14','Interested Parties',Object.assign({},H,{box:med}));
  mergePut(ws,'G14:G14','CAE Number',Object.assign({},H,{box:med}));
  mergePut(ws,'H14:H14','Share %',Object.assign({},H,{box:med}));
  mergePut(ws,'I14:I14','Society',Object.assign({},H,{box:med}));
  mergePut(ws,'J14:J14','Usage',Object.assign({},H,{box:med}));
  mergePut(ws,'K14:K14','Duration',Object.assign({},H,{box:med}));
  mergePut(ws,'L14:L14','Work Number',Object.assign({},H,{box:med}));

  let row=15, seq=1;
  const cellN={font:F,size:11,h:'center',v:'middle',border:thin};
  ep.tracks.forEach(function(t){
    const contribs=t.contributors.length?t.contributors:[blankContrib()];
    contribs.forEach(function(c,ci){
      const isFirst=ci===0;
      put(ws,'A'+row, isFirst?seq:'', cellN);
      mergePut(ws,'B'+row+':C'+row, isFirst? t.name : '', {font:F,size:11,h:'center',v:'middle',wrap:true,fill:isFirst&&t.name?GREEN:undefined,box:thin});
      put(ws,'D'+row, c.role||'', {font:F,size:11,h:'center',v:'middle',border:thin});
      mergePut(ws,'E'+row+':F'+row, c.name||'', {font:F,size:11,h:'center',v:'middle',fill:GREEN,box:thin});
      put(ws,'G'+row, c.ipiCae||'', cellN);
      put(ws,'H'+row, shareToDecimal(c.share), {font:F,size:11,h:'center',v:'middle',fill:GREEN,border:thin});
      put(ws,'I'+row, societyDisplay(c.society,false), cellN);
      put(ws,'J'+row, isFirst? t.usagePRS : '', cellN);
      put(ws,'K'+row, isFirst? fmtDuration(t.duration) : '', cellN);
      put(ws,'L'+row, isFirst? t.codePRS : '', cellN);
      row++;
    });
    seq++;
  });

  row+=1;
  mergePut(ws,'A'+row+':D'+row, p.companyName||'', {font:F,size:20,bold:true,h:'left'});

  return wb;
}

/* ============================================================
   BUILD — ASCAP
   ============================================================ */
function buildASCAPWorkbook(ep){
  const p=state.prod;
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('ASCAP');
  const widths={A:5.8,B:27.9,C:5.6,D:9.8,E:43.9,F:43.5,G:18.1,H:8};
  Object.entries(widths).forEach(function(e){ ws.getColumn(e[0]).width=e[1]; });
  const F='Arial';

  ws.getRow(1).height=18;
  mergePut(ws,'A1:F1',(p.title||'')+' Cue Sheet ',{font:F,size:14,bold:true,h:'center',v:'bottom'});

  const info={font:F,size:10,bold:true,h:'left',v:'bottom',wrap:false};
  const epLabel = ep.episodeTitle || ep.episodeNo || 'NA';
  put(ws,'A3','Film Title: '+(p.title||''),info);
  put(ws,'E3','         Company Name:  '+(p.ascapCompanyName||'NA'),info);
  put(ws,'A4','Episode Title/Number: '+epLabel,info);
  put(ws,'E4','         Address: '+(p.ascapAddress||'NA'),info);
  put(ws,'A5','Estimated Airdate: '+(ep.airDate||''),info);
  put(ws,'E5','         Phone: '+(p.ascapPhone||'NA'),info);
  put(ws,'A6','Program Length: '+fmtDuration(ep.totalDuration),info);
  put(ws,'E6','         Contact: '+(p.ascapContact||p.productionCompany||''),info);
  put(ws,'A7','Program Type:  '+(p.programType||''),info);
  put(ws,'E7','         Network Station: '+(p.ascapNetwork||p.channel||''),info);

  ws.getRow(9).height=20;
  const H={font:F,size:11,bold:true,h:'center',v:'middle',border:med};
  const heads=['Cue #','Cue Title','Use*','Timing','Composer(s) Affiliation / %','Publisher(s) Affiliation / %','Work ID (ASCAP)'];
  heads.forEach(function(h,i){ put(ws, numToCol(i+1)+'9', h, Object.assign({},H)); });

  let row=10, cue=1;
  ep.tracks.forEach(function(t){
    const comp=t.contributors.filter(function(c){return c.role==='Composer'||c.role==='Author'||c.role==='Arranger';});
    const pub =t.contributors.filter(function(c){return c.role==='Publisher';});
    const compStr=comp.filter(function(c){return c.name;}).map(function(c){return c.name+' ('+societyDisplay(c.society,true)+') '+fmtShare(c.share);}).join('\n');
    const pubStr =pub.filter(function(c){return c.name;}).map(function(c){return c.name+' ('+societyDisplay(c.society,true)+') '+fmtShare(c.share);}).join('\n');
    const lines=Math.max(comp.length,pub.length,1);
    ws.getRow(row).height=Math.max(20, lines*15+6);
    const cN={font:F,size:11,h:'center',v:'middle',wrap:true,border:thin};
    put(ws,'A'+row, cue, cN);
    put(ws,'B'+row, t.name||'', cN);
    put(ws,'C'+row, t.usageASCAP||'', cN);
    put(ws,'D'+row, fmtDuration(t.duration), cN);
    put(ws,'E'+row, compStr, Object.assign({},cN,{h:'left'}));
    put(ws,'F'+row, pubStr, Object.assign({},cN,{h:'left'}));
    put(ws,'G'+row, t.codeASCAP||'', cN);
    row++; cue++;
  });

  row+=1;
  put(ws,'A'+row,'                *Use Codes: MT = Main Title      VI = Visual Instrumental    BV = Background Vocal',{font:F,size:10,h:'left'}); row++;
  put(ws,'B'+row,'                          VV = Visual Vocal  ET = End Title                   BI = Background Instrumental',{font:F,size:10,h:'left'}); row++;
  put(ws,'B'+row,'                            T = Theme',{font:F,size:10,h:'left'}); row+=2;
  mergePut(ws,'A'+row+':F'+row, p.companyName||'', {font:'Arial Narrow',size:15,bold:true,h:'left'});

  return wb;
}

/* ============================================================
   EXPORT RANGE — From/To episode selects
   ============================================================ */
function populateExportRange(){
  const fromSel=document.getElementById('exportFrom'), toSel=document.getElementById('exportTo');
  if(!fromSel||!toSel) return;
  const prevFrom=+fromSel.value||1, prevTo=+toSel.value||state.episodes.length;
  const n=state.episodes.length;
  function optionsHTML(){
    if(n===0) return '<option value="">—</option>';
    return state.episodes.map((ep,i)=>{
      const label='Episode '+(ep.episodeNo||(i+1))+(ep.episodeTitle?(' — '+ep.episodeTitle):'')+(i===n-1?' (Last)':'');
      return '<option value="'+(i+1)+'">'+escapeHtml(label)+'</option>';
    }).join('');
  }
  fromSel.innerHTML=optionsHTML();
  toSel.innerHTML=optionsHTML();
  if(n===0){ fromSel.disabled=toSel.disabled=true; return; }
  fromSel.disabled=toSel.disabled=false;
  fromSel.value=Math.min(Math.max(prevFrom,1),n);
  toSel.value=Math.min(Math.max(prevTo,1),n);
  if(+fromSel.value>+toSel.value){ fromSel.value='1'; toSel.value=String(n); }
}
function onExportRangeChange(which){
  const fromSel=document.getElementById('exportFrom'), toSel=document.getElementById('exportTo');
  let from=+fromSel.value, to=+toSel.value;
  if(from>to){
    if(which==='from') toSel.value=fromSel.value; else fromSel.value=toSel.value;
  }
}
function getExportRangeEpisodes(){
  const fromSel=document.getElementById('exportFrom'), toSel=document.getElementById('exportTo');
  const from=Math.max(1,+((fromSel&&fromSel.value)||1));
  const to=Math.min(state.episodes.length,+((toSel&&toSel.value)||state.episodes.length));
  if(from>to) return [];
  return state.episodes.slice(from-1, to);
}

/* ============================================================
   BULK EXPORT — zips the selected range of episodes' cue sheet(s)
   ============================================================ */
async function exportRange(kind){
  if(state.episodes.length===0){ toast('Add at least one episode first.',true); return; }
  const episodes=getExportRangeEpisodes();
  if(episodes.length===0){ toast('Pick a valid episode range first.',true); return; }
  if(!validateSharesForExport(episodes)) return;
  try{
    const zip=new JSZip();
    for(let i=0;i<episodes.length;i++){
      const ep=episodes[i];
      if(kind==='IPRS'||kind==='ALL'){
        const buf=await buildIPRSWorkbook(ep).xlsx.writeBuffer();
        zip.file(iprsFilename(ep), buf);
      }
      if(kind==='PRS'||kind==='ALL'){
        const buf=await buildPRSWorkbook(ep).xlsx.writeBuffer();
        zip.file(prsFilename(ep), buf);
      }
      if(kind==='ASCAP'||kind==='ALL'){
        const buf=await buildASCAPWorkbook(ep).xlsx.writeBuffer();
        zip.file(ascapFilename(ep), buf);
      }
    }
    const blob=await zip.generateAsync({type:'blob'});
    const fromSel=document.getElementById('exportFrom'), toSel=document.getElementById('exportTo');
    const rangeSuffix = '_ep'+(fromSel?fromSel.value:'1')+'-'+(toSel?toSel.value:episodes.length);
    const kindSuffix = kind==='ALL' ? '_all_societies' : ('_'+kind);
    triggerDownload(blob, safeName(state.prod.title)+rangeSuffix+kindSuffix+'.zip');
    toast('Zip ready — '+episodes.length+' episode'+(episodes.length>1?'s':'')+' processed.');
  }catch(err){
    console.error(err);
    toast('Something went wrong building the zip.',true);
  }
}

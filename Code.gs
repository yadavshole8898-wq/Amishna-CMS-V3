/**
 * Amishna Music CMS - Google Sheets backend
 *
 * 1. Create a Google Sheet.
 * 2. Extensions -> Apps Script.
 * 3. Paste this file into Code.gs.
 * 4. Change API_KEY to a private value.
 * 5. Deploy -> New deployment -> Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 6. Copy the /exec URL into AMISHNA_CLOUD.API_URL in app.js.
 *
 * This stores the CMS master data in one spreadsheet and keeps a
 * timestamped JSON backup in Google Drive when requested.
 */
const API_KEY = 'CHANGE_THIS_TO_A_LONG_RANDOM_KEY';
const SHEET_NAMES = {
  songs: 'Songs',
  projects: 'Projects',
  users: 'Users',
  backups: 'Backups'
};

function doGet(e){
  return json_({ok:true, service:'Amishna CMS Cloud', message:'POST API is ready'});
}

function doPost(e){
  try{
    const body = JSON.parse(e.postData.contents || '{}');
    if(body.apiKey !== API_KEY) return json_({ok:false,error:'Unauthorized'});
    const action = body.action;
    if(action === 'getAll') return json_({ok:true,...readAll_()});
    if(action === 'saveSongs'){ writeJsonMap_(SHEET_NAMES.songs, body.songs || {}); return json_({ok:true}); }
    if(action === 'saveProjects'){ writeJsonMap_(SHEET_NAMES.projects, body.projects || {}); return json_({ok:true}); }
    if(action === 'saveUsers'){ writeUsers_(body.users || {}); return json_({ok:true}); }
    if(action === 'backup') return json_({ok:true, fileUrl:backupToDrive_()});
    return json_({ok:false,error:'Unknown action'});
  }catch(err){
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function getSs_(){ return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheet_(name, headers){
  const ss=getSs_();
  let sh=ss.getSheetByName(name);
  if(!sh) sh=ss.insertSheet(name);
  if(sh.getLastRow()===0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  return sh;
}

function writeJsonMap_(name, map){
  const sh=ensureSheet_(name,['Key','JSON','Updated At']);
  if(sh.getLastRow()>1) sh.getRange(2,1,sh.getLastRow()-1,3).clearContent();
  const rows=Object.keys(map).map(k=>[k,JSON.stringify(map[k]),new Date()]);
  if(rows.length) sh.getRange(2,1,rows.length,3).setValues(rows);
}

function writeUsers_(users){
  const sh=ensureSheet_(SHEET_NAMES.users,['Key','JSON','Updated At']);
  if(sh.getLastRow()>1) sh.getRange(2,1,sh.getLastRow()-1,3).clearContent();
  sh.getRange(2,1,1,3).setValues([['users',JSON.stringify(users),new Date()]]);
}

function readJsonMap_(name){
  const ss=getSs_(); const sh=ss.getSheetByName(name); const out={};
  if(!sh || sh.getLastRow()<2) return out;
  const values=sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  values.forEach(r=>{ if(r[0] && r[1]){ try{out[String(r[0])]=JSON.parse(r[1]);}catch(_){} } });
  return out;
}

function readUsers_(){
  const ss=getSs_(); const sh=ss.getSheetByName(SHEET_NAMES.users);
  if(!sh || sh.getLastRow()<2) return null;
  const raw=sh.getRange(2,2).getValue();
  if(!raw) return null;
  try{return JSON.parse(raw);}catch(_){return null;}
}

function readAll_(){
  return {
    songs: readJsonMap_(SHEET_NAMES.songs),
    projects: readJsonMap_(SHEET_NAMES.projects),
    users: readUsers_()
  };
}

function backupToDrive_(){
  const data=readAll_();
  const name='Amishna CMS Backup '+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH-mm-ss')+'.json';
  const file=DriveApp.createFile(name,JSON.stringify(data,null,2),MimeType.PLAIN_TEXT);
  return file.getUrl();
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Guad app: rendering and actions. */
(function (global) {
"use strict";
var C=global.GuadCore,V=global.GuadViews,O=global.GuadOffice,byId=C.byId,pl=C.pl,now=C.now;
var root=document.getElementById("root");
var ui={setup:{role:"Admin",rad:150},pos:null,locating:false,locErr:"",sheet:null};
var cg={tab:"today",screen:null};
var sv={tab:"overview",homeId:null,sel:null};
function S(){return C.S()}

/* ---------- toast ---------- */
var toastT;function toast(m){if(!m)return;var t=document.getElementById("toast");t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true},2800)}

/* ---------- render ---------- */
function render(){
  var s=S(),m=C.me(),html;
  document.getElementById("toast").classList.toggle("cg",!!m&&!C.isOffice());
  if(!s.agency)html=V.setup(ui.setup);
  else if(!m)html=V.signin();
  else if(C.isOffice()){
    if(!sv.homeId||(sv.homeId!=="all"&&!C.home(sv.homeId)))sv.homeId=s.homes.length>1?"all":(s.homes[0]||{}).id||"all";
    html=O.render(sv)+(ui.sheet?V.sheet(ui.sheet,cg):"");
  } else {
    var map={person:V.person,compose:V.compose,review:V.review,mar:V.mar,health:V.health,incident:V.incident,done:V.done,summary:V.summary},body,hid=C.cgHome();
    if(cg.screen==="msgs"&&hid){C.markRead(hid);body=V.msgs(hid,"close",m.name)}
    else if(map[cg.screen])body=map[cg.screen](cg);
    else body=cg.tab==="notes"?V.cgNotes():cg.tab==="shifts"?V.cgShifts(ui):cg.tab==="me"?V.cgMe():V.cgToday(ui);
    html='<div class="app cgapp">'+V.cgSide(cg.screen,cg.tab)+'<div class="cg-main">'+body+(!cg.screen?V.dock(cg.tab):"")+'</div></div>'+V.sheet(ui.sheet,cg);
  }
  root.innerHTML=html;C.save();
}
function go(screen,extra){var t=cg.tab;cg=Object.assign({tab:t,screen:screen},extra||{});ui.sheet=null;render();global.scrollTo(0,0)}

/* ---------- readers ---------- */
function val(id){var el=document.getElementById(id);return el?el.value.trim():""}
function readReview(){var d=cg.draft;if(!d)return;root.querySelectorAll("[data-f]").forEach(function(el){d[el.getAttribute("data-f")]=el.value});root.querySelectorAll("[data-reason]").forEach(function(el){var r=byId(d.goals,el.getAttribute("data-reason"));if(r)r.reason=el.value})}
function readInc(){var f=cg.inc;root.querySelectorAll("[data-i]").forEach(function(el){f[el.getAttribute("data-i")]=el.value});var bx=root.querySelectorAll("[data-notify]");if(bx.length){f.notified=[];bx.forEach(function(el){if(el.checked)f.notified.push(el.getAttribute("data-notify"))})}}
function readLoc(prefix,target){target.lat=val(prefix+"-lat");target.lng=val(prefix+"-lng");target.rad=val(prefix+"-rad")}
function parseLoc(t){var lat=t.lat===""?null:Number(t.lat),lng=t.lng===""?null:Number(t.lng),rad=Number(t.rad)||150;
  if((lat==null)!==(lng==null))return {err:"Enter both latitude and longitude, or leave both empty."};
  if(lat!=null&&(isNaN(lat)||isNaN(lng)||Math.abs(lat)>90||Math.abs(lng)>180))return {err:"Those coordinates don't look right."};
  return {lat:lat,lng:lng,radius:Math.max(50,rad)}}

/* ---------- speech ---------- */
var rec=null;
var micStream=null,micChunks=[];
function preferredAudioType(){return ["audio/webm;codecs=opus","audio/webm","audio/mp4"].filter(function(t){return global.MediaRecorder&&MediaRecorder.isTypeSupported(t)})[0]||""}
async function startMic(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){cg.err="This browser cannot record audio. Type instead.";render();return}
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:true});
    micChunks=[];
    rec=new MediaRecorder(micStream,preferredAudioType()?{mimeType:preferredAudioType()}:undefined);
    rec.ondataavailable=function(e){if(e.data&&e.data.size)micChunks.push(e.data)};
    rec.onstop=transcribeMic;
    rec.start();cg.listening=true;cg.err="";render();
  }catch(x){micStream=null;cg.listening=false;cg.err="Microphone access was denied or is unavailable. Allow access, then try again.";render()}
}
function stopMic(){if(rec&&rec.state!=="inactive")rec.stop();else{cg.listening=false;render()}}
async function transcribeMic(){
  if(micStream)micStream.getTracks().forEach(function(t){t.stop()});
  micStream=null;cg.listening=false;cg.thinking=true;cg.err="";render();
  try{
    var type=(rec&&rec.mimeType)||"audio/webm",blob=new Blob(micChunks,{type:type}),bytes=await blob.arrayBuffer(),bin="";
    new Uint8Array(bytes).forEach(function(b){bin+=String.fromCharCode(b)});
    var r=await fetch("/api/transcribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({audio:btoa(bin),mimeType:type})});
    var data=await r.json();if(!r.ok)throw new Error(data.error||"transcription_failed");
    var el=document.getElementById("say"),text=data.text||"";if(el){el.value=(el.value?el.value+" ":"")+text;cg.text=el.value}
  }catch(x){cg.err="Transcription failed. Type instead or try recording again."}
  cg.thinking=false;render();
}

/* ---------- Lomi ---------- */
async function draft(){
  var c=C.client(cg.cid),ta=document.getElementById("say");cg.text=ta?ta.value.trim():"";
  if(cg.text.length<15){cg.err="Tell Lomi a little more first.";render();return}
  if(cg.listening)stopMic();cg.err="";cg.thinking=true;cg.started=cg.started||Date.now();render();
  var payload=cg.type==="behavior"?{person:c.name,behaviors:c.behaviors,text:cg.text}:{person:c.name,goals:c.goals.filter(function(g){return !g.stopped}).map(function(g){return {id:g.id,text:g.text}}),text:cg.text};
  var r=await global.Lomi.draft(cg.type==="behavior"?"behavior":"shift",payload);
  cg.thinking=false;cg.fromLomi=!r.fallback;cg.fallback=r.fallback;cg.draft=C.normalizeDraft(r.data,c,cg.type);cg.screen="review";render();global.scrollTo(0,0)}
async function summary(){
  var s=S(),hid=sv.homeId,o=O.stats(hid),inH=function(cid){var c=C.client(cid);return c&&(hid==="all"||c.homeId===hid)};
  sv.summary="Reading today's records…";render();
  var data={openShifts:o.openShifts,coverage:s.coverage.filter(function(c){return hid==="all"||c.homeId===hid}).slice(-10).map(function(c){return {day:C.dayLabel(c.day),shift:c.shift,status:c.status}}),
    notes:s.notes.filter(function(n){return n.day===C.dayKey(0)&&inH(n.clientId)}).map(function(n){return {person:C.client(n.clientId).first,type:n.type,status:n.status}}),
    incidents:s.incidents.filter(function(i){return i.status==="open"&&inH(i.clientId)}).map(function(i){return {person:C.client(i.clientId).first,type:i.type,severity:i.severity}}),
    meds:s.mar.filter(function(r){return r.day===C.dayKey(0)&&r.status!=="given"&&inH(r.clientId)}).map(function(r){return {person:C.client(r.clientId).first,status:r.status}}),dosesNotRecorded:o.medsOpen,
    healthAlerts:s.health.filter(function(x){return x.flags.length&&!x.ack&&inH(x.clientId)}).map(function(x){return {person:C.client(x.clientId).first,alert:x.flags[0]}}),missingNotes:o.missing};
  var r=await global.Lomi.summarize(data),out=r.text;
  if(!out){var p=[];if(o.openInc)p.push(pl(o.openInc,"incident")+" open.");if(o.hAlerts)p.push(pl(o.hAlerts,"health alert")+" to follow up.");if(o.medIssues)p.push(pl(o.medIssues,"dose")+" refused or held.");if(o.openShifts)p.push(pl(o.openShifts,"shift")+" still open.");if(o.missing.length)p.push("Notes still missing for "+o.missing.join(", ")+".");if(o.toReview)p.push(pl(o.toReview,"note")+" waiting for review.");out=p.length?p.join(" "):"Nothing needs follow-up right now."}
  sv.summary=out;render()}
function validateNote(){var d=cg.draft;
  if(cg.type==="behavior"){if(!d.behavior.trim()||!d.response.trim())return "Describe what happened and how staff responded before signing."}
  else{if(!d.activities.trim()&&!d.mood.trim())return "Add activities or mood before signing.";
    var miss=d.goals.filter(function(r){return !r.trials.length&&!r.na});if(miss.length)return "Record at least one attempt for each goal, or mark it not attempted. "+pl(miss.length,"goal")+" still empty.";
    if(d.goals.some(function(r){return r.na&&!r.reason.trim()}))return "Add a reason for each goal that wasn't attempted."}
  if((d.flags||[]).some(function(f){return !f.dismissed}))return "Fix or keep the wording Lomi flagged first.";
  if(d.incident&&d.incident.detected&&!d.incident.handled)return "Choose whether to file an incident report first.";return ""}

/* ---------- location ---------- */
function locate(){ui.locating=true;ui.locErr="";render();
  C.Geo.currentPosition().then(function(p){ui.pos=p;ui.locating=false;render()},function(msg){ui.pos=null;ui.locating=false;ui.locErr=msg;render()})}
function clockIn(hid){var m=C.me(),h=C.home(hid),d=null,inside=false;
  if(ui.pos&&h.lat!=null){d=C.Geo.distance(ui.pos.lat,ui.pos.lng,h.lat,h.lng);inside=d<=(h.radius||150)}
  var rec2={id:C.uid(),staffId:m.id,homeId:hid,inAt:now(),outAt:null,lat:ui.pos?ui.pos.lat:null,lng:ui.pos?ui.pos.lng:null,accuracy:ui.pos?ui.pos.accuracy:null,distance:d,verified:inside,manual:!inside};
  S().clocks.push(rec2);C.log("clock.in",{homeId:hid,staffId:m.id,verified:inside,distance:d});
  cg={tab:"today",screen:null};render();toast(inside?"Clocked in. Location verified at "+h.name+".":"Clocked in at "+h.name+". Your supervisor will see this was outside the check-in area.")}

/* ---------- events ---------- */
document.addEventListener("input",function(e){if(e.target.id==="say")cg.text=e.target.value});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&ui.sheet){ui.sheet=null;render()}if(e.key==="Enter"&&e.target.id==="mtext"){e.preventDefault();var b=document.querySelector('[data-a="send"]');b&&b.click()}});
document.addEventListener("change",function(e){
  if(e.target.id==="homesel"){sv.homeId=e.target.value;sv.sel=null;sv.person=null;sv.summary=null;render()}
  if(e.target.id==="tpl"&&e.target.value){document.getElementById("gtext").value=e.target.value.split("|")[1]}
});
document.addEventListener("click",function(e){
  var b=e.target.closest("[data-a]");if(!b)return;
  if(b.classList.contains("scrim")&&e.target!==b)return;
  var s=S(),a=b.getAttribute("data-a"),v=b.getAttribute("data-v"),cid=b.getAttribute("data-c"),nid=b.getAttribute("data-n"),m=C.me();
  switch(a){
  /* first run and sign-in */
  case"su-role":ui.setup.role=v;["agency","name","home","addr"].forEach(function(k){ui.setup[k]=val("su-"+k)});readLoc("su",ui.setup);render();return;
  case"useloc":{var pre=v,target=pre==="su"?ui.setup:sv.homeForm;if(pre==="su"){["agency","name","home","addr"].forEach(function(k){ui.setup[k]=val("su-"+k)})}else{target.name=val("hf-name");target.addr=val("hf-addr")}readLoc(pre,target);target.locMsg="Getting your location…";render();
    C.Geo.currentPosition().then(function(p){target.lat=p.lat.toFixed(6);target.lng=p.lng.toFixed(6);target.locMsg="Set to where you are now (accurate to about "+p.accuracy+" m). Do this while standing at the home.";render()},function(msg){target.locMsg=msg+" You can type the coordinates instead.";render()});return}
  case"su-create":{var st=ui.setup;["agency","name","home","addr"].forEach(function(k){st[k]=val("su-"+k)});readLoc("su",st);
    if(!st.agency||!st.name||!st.home){st.err="Add the agency name, your name and the first home's name.";render();return}
    var loc=parseLoc(st);if(loc.err){st.err=loc.err;render();return}
    var hid=C.uid(),sid=C.uid();
    s.agency={name:st.agency};s.homes.push({id:hid,name:st.home,address:st.addr,lat:loc.lat,lng:loc.lng,radius:loc.radius});
    s.staff.push({id:sid,name:st.name,ini:C.initials(st.name),role:st.role==="Supervisor"?"supervisor":"admin",medCert:false,homeIds:[hid]});
    s.session.userId=sid;sv={tab:"setup",homeId:hid};C.log("agency.created",{homeId:hid});render();toast("Agency created. Add your staff next.");return}
  case"signin":s.session.userId=nid;cg={tab:"today",screen:null};sv={tab:"overview",homeId:null};ui.pos=null;ui.locErr="";render();return;
  case"signout":stopMic();s.session.userId=null;ui.sheet=null;render();return;

  /* caregiver navigation */
  case"tab":stopMic();cg={tab:v,screen:null};render();global.scrollTo(0,0);return;
  case"close":stopMic();go(null);return;
  case"back2person":stopMic();go("person",{cid:cg.cid});return;
  case"msgs":if(C.isOffice()){sv.tab="msgs";render();return}if(!C.cgHome()){toast("Clock in to see your home's messages");return}go("msgs");return;
  case"send":{var txt=val("mtext"),hh=b.getAttribute("data-h");if(!txt)return;C.post(hh,m.name,txt);C.markRead(hh);render();var ni=document.getElementById("mtext");ni&&ni.focus();return}
  case"locate":locate();return;
  case"clockin":clockIn(nid);return;
  case"clockout":{var cl=C.activeClock(m.id);if(cl){cl.outAt=now();C.log("clock.out",{homeId:cl.homeId,staffId:m.id})}cg={tab:"today",screen:null};ui.pos=null;render();toast("Clocked out");return}
  case"pick":if(!C.cgHome()){toast("Clock in first");return}ui.sheet={kind:"pick",v:v};render();return;
  case"sheetclose":ui.sheet=null;render();return;
  case"person":go("person",{cid:cid});return;
  case"summary":if(C.isOffice()){summary();return}go("summary",{cid:cid});return;
  case"note":{var n=C.shiftNote(cid);
    if(n&&n.status==="returned"){go("review",{cid:cid,type:"shift",editing:n.id,comment:n.comment,draft:C.normalizeDraft({activities:n.s.activities,meals:n.s.meals,mood:n.s.mood,health:n.s.health,goals:JSON.parse(JSON.stringify(n.goals)).map(function(r){return {id:r.id,trials:r.trials,notAttempted:r.na,reason:r.reason}})},C.client(cid),"shift")});return}
    if(n){toast(C.client(cid).first+"'s note is already signed");ui.sheet=null;render();return}
    go("compose",{cid:cid,type:"shift",text:""});return}
  case"beh":go("compose",{cid:cid,type:"behavior",text:""});return;
  case"inc":go("incident",{cid:cid,step:1,back:null,inc:{type:"Fall",severity:"Low",time:"",where:"Bedroom",before:"",what:"",injured:"Not checked yet",injury:"",witnesses:"",action:"",medical:"None needed",notified:["Supervisor"]}});return;
  case"mar":go("mar",{cid:cid});return;
  case"health":go("health",{cid:cid,kind:"vitals"});return;
  case"attend":ui.sheet={kind:"attend"};cg.cid=cid;render();return;
  case"attendsave":{var svc=[];root.querySelectorAll("[data-svc]").forEach(function(el){if(el.checked)svc.push(el.getAttribute("data-svc"))});if(!svc.length){ui.sheet.err="Check at least one service.";render();return}
    var day=C.dayKey(0);s.attendance[day]=s.attendance[day]||{};s.attendance[day][cg.cid]={services:svc,by:m.name,byId:m.id,at:now()};C.log("attendance.recorded",{homeId:C.client(cg.cid).homeId,clientId:cg.cid,staffId:m.id});ui.sheet=null;render();toast("Attendance saved");return}

  /* notes */
  case"mic":if(cg.listening){stopMic();render()}else startMic();return;
  case"draft":draft();return;
  case"manual":cg.draft=C.normalizeDraft({},C.client(cg.cid),cg.type);cg.fromLomi=false;cg.fallback=false;cg.started=cg.started||Date.now();cg.screen="review";render();return;
  case"btype":readReview();cg.draft.behaviorType=v;render();return;
  case"addtrial":readReview();byId(cg.draft.goals,b.getAttribute("data-g")).trials.push(v);cg.err="";render();return;
  case"openpicker":readReview();cg.picker=b.getAttribute("data-g");render();return;
  case"closepicker":readReview();cg.picker=null;render();return;
  case"editfirst":{var ft=document.querySelector(".cv-text");ft&&ft.focus();return}
  case"rmtrial":readReview();byId(cg.draft.goals,b.getAttribute("data-g")).trials.splice(+b.getAttribute("data-i"),1);render();return;
  case"na":readReview();var r=byId(cg.draft.goals,b.getAttribute("data-g"));r.na=!r.na;render();return;
  case"fixflag":{readReview();var f=cg.draft.flags[+b.getAttribute("data-i")];f.dismissed=true;render();var fl=cg.type==="behavior"?["behavior","before","response","outcome"]:["mood","activities","meals","health"];
    for(var i=0;i<fl.length;i++){var el=document.getElementById("f-"+fl[i]);if(el){var p=el.value.toLowerCase().indexOf(f.phrase.toLowerCase());if(p>=0){el.focus();el.setSelectionRange(p,p+f.phrase.length);break}}}return}
  case"dropflag":readReview();cg.draft.flags[+b.getAttribute("data-i")].dismissed=true;render();return;
  case"noinc":readReview();cg.draft.incident.handled=true;render();return;
  case"fileinc":{readReview();cg.draft.incident.handled=true;var lo=(cg.draft.incident.summary||"").toLowerCase(),saved={screen:"review",draft:cg.draft,type:cg.type,fromLomi:cg.fromLomi,fallback:cg.fallback,editing:cg.editing,comment:cg.comment,text:cg.text,started:cg.started};
    go("incident",{cid:cg.cid,step:1,back:saved,inc:{type:/fell|fall|slip|trip/.test(lo)?"Fall":/seizure/.test(lo)?"Seizure":/med/.test(lo)?"Medication error":/left|ran/.test(lo)?"Left without staff":"Injury",severity:"Low",time:"",where:/bathroom/.test(lo)?"Bathroom":/kitchen/.test(lo)?"Kitchen":"Other",before:"",what:cg.draft.incident.summary||"",injured:"Not checked yet",injury:"",witnesses:"",action:"",medical:"None needed",notified:["Supervisor"]}});return}
  case"sign":{readReview();var er=validateNote();if(er){cg.err=er;render();var al=document.querySelector('[role="alert"]');al&&al.scrollIntoView({block:"center"});return}cg.err="";ui.sheet={kind:"sign"};render();return}
  case"signconfirm":{var at=document.getElementById("attest");if(!at||!at.checked){ui.sheet.err="Check the box to confirm the note is accurate.";render();return}
    var d=cg.draft,c3=C.client(cg.cid),sec=cg.type==="behavior"?{behaviorType:d.behaviorType,before:d.before,behavior:d.behavior,response:d.response,outcome:d.outcome,duration:d.duration}:{activities:d.activities,meals:d.meals,mood:d.mood,health:d.health};
    var mins=cg.started?Math.max(1,Math.round((Date.now()-cg.started)/60000)):null;
    if(cg.editing){var n2=byId(s.notes,cg.editing);n2.s=sec;n2.goals=d.goals;n2.status="submitted";n2.history.push({at:now(),who:m.name,what:"Amended and resubmitted"})}
    else s.notes.push({id:C.uid(),clientId:c3.id,day:C.dayKey(0),type:cg.type,author:m.name,authorId:m.id,status:"submitted",createdAt:now(),lomi:!!cg.fromLomi,s:sec,goals:cg.type==="behavior"?[]:d.goals,history:[{at:now(),who:m.name,what:cg.fromLomi?"Drafted with Lomi, reviewed and signed":"Written and signed"}],comment:""});
    C.log("note.signed",{homeId:c3.homeId,clientId:c3.id,staffId:m.id,noteType:cg.type,lomi:!!cg.fromLomi,minutes:mins,amended:!!cg.editing});
    go("done",{cid:c3.id,msg:cg.editing?"Note resubmitted":"Note signed"});return}

  /* incidents */
  case"incback":if(cg.step>1){readInc();cg.step--;cg.err="";render();return}if(cg.back){go("review",Object.assign({cid:cg.cid},cg.back));return}go("person",{cid:cg.cid});return;
  case"ipick":readInc();cg.inc[b.getAttribute("data-k")]=v;render();return;
  case"istep":{readInc();var to=+v,f2=cg.inc;if(to>cg.step){if(cg.step===1&&!f2.what.trim()){cg.err="Describe what happened.";render();return}if(cg.step===1&&!f2.time){cg.err="Add the time it happened.";render();return}if(cg.step===2&&f2.injured==="Yes"&&!f2.injury.trim()){cg.err="Describe the injury.";render();return}if(cg.step===2&&!f2.action.trim()){cg.err="Describe what you did.";render();return}}
    cg.step=to;cg.err="";render();global.scrollTo(0,0);return}
  case"subinc":{readInc();var cc=C.client(cg.cid),inc=Object.assign({id:C.uid(),clientId:cg.cid,author:m.name,authorId:m.id,createdAt:now(),status:"open",followup:""},JSON.parse(JSON.stringify(cg.inc)));s.incidents.push(inc);
    C.log("incident.reported",{homeId:cc.homeId,clientId:cc.id,staffId:m.id,incidentType:inc.type,severity:inc.severity});
    C.post(cc.homeId,"Lomi",m.name.split(" ")[0]+" reported an incident ("+inc.type.toLowerCase()+", "+inc.severity.toLowerCase()+" severity). A supervisor will follow up.");
    toast("Report submitted. Your supervisor was notified.");
    if(cg.back)go("review",Object.assign({cid:cg.cid},cg.back));else go("done",{cid:cg.cid,msg:"Report submitted",sub:"Your supervisor was notified."});return}

  /* medications */
  case"give":{var c4=C.client(cg.cid),md=byId(c4.meds,b.getAttribute("data-m"));s.mar.push({id:C.uid(),clientId:c4.id,medId:md.id,day:C.dayKey(0),status:"given",at:now(),by:m.name,byId:m.id,reason:""});C.log("med.given",{homeId:c4.homeId,clientId:c4.id,staffId:m.id});render();toast(md.name+" recorded as given");return}
  case"notgiven":ui.sheet={kind:"reason",mid:b.getAttribute("data-m"),v:v};render();return;
  case"reasonsave":{var why=val("why");if(!why){ui.sheet.err="Add what happened so your supervisor and nurse can follow up.";render();return}var c5=C.client(cg.cid);s.mar.push({id:C.uid(),clientId:c5.id,medId:ui.sheet.mid,day:C.dayKey(0),status:ui.sheet.v,at:now(),by:m.name,byId:m.id,reason:why});C.log("med."+ui.sheet.v,{homeId:c5.homeId,clientId:c5.id,staffId:m.id});ui.sheet=null;render();toast("Saved. Your supervisor was alerted.");return}
  case"prngive":ui.sheet={kind:"prn",mid:b.getAttribute("data-m")};render();return;
  case"prnsave":{var pw=val("prnwhy");if(!pw){ui.sheet.err="Add why it was needed.";render();return}var c6=C.client(cg.cid);s.mar.push({id:C.uid(),clientId:c6.id,medId:ui.sheet.mid,day:C.dayKey(0),prn:true,status:"given",at:now(),by:m.name,byId:m.id,reason:pw,effect:""});C.log("med.given",{homeId:c6.homeId,clientId:c6.id,staffId:m.id,prn:true});ui.sheet=null;render();toast("Recorded. Check back on how it worked.");return}
  case"prneffect":ui.sheet={kind:"effect",rid:nid};render();return;
  case"effect":byId(s.mar,ui.sheet.rid).effect=v;ui.sheet=null;render();toast("Effect recorded");return;

  /* health */
  case"hkind":cg.kind=v;cg.err="";render();return;
  case"hsave":{var data={};root.querySelectorAll("[data-h]").forEach(function(el){data[el.getAttribute("data-h")]=el.value.trim()});var k=cg.kind||"vitals",fl2=[];
    if(k==="vitals"){if(!data.sys&&!data.dia&&!data.pulse&&!data.temp&&!data.weight){cg.err="Enter at least one reading.";render();return}fl2=C.vitalFlags(data)}
    if(k==="seizure"){if(!data.start||!data.what){cg.err="Add when it started and what you saw.";render();return}fl2=["Seizure recorded. Notify the nurse per the seizure protocol."]}
    if(k==="illness"){if(!data.symptoms){cg.err="Describe the symptoms.";render();return}if(data.contagious==="Yes")fl2=["Possible contagious illness. Check infection control steps."]}
    if(k==="appointment"&&!data.provider){cg.err="Add who the visit was with.";render();return}
    var c7=C.client(cg.cid);s.health.push({id:C.uid(),clientId:c7.id,kind:k,data:data,at:now(),by:m.name,byId:m.id,flags:fl2});C.log("health."+k,{homeId:c7.homeId,clientId:c7.id,staffId:m.id,alert:fl2.length>0});cg.err="";render();toast(fl2.length?"Saved. Your supervisor was alerted.":"Saved");return}

  /* shifts and coverage */
  case"callout":ui.sheet={kind:"callout",h:b.getAttribute("data-h"),d:b.getAttribute("data-d"),k:b.getAttribute("data-k"),reason:""};render();return;
  case"coreason":ui.sheet.reason=v;ui.sheet.err="";render();return;
  case"calloutgo":{if(!ui.sheet.reason){ui.sheet.err="Choose a reason.";render();return}var x=ui.sheet;ui.sheet=null;C.startCoverage(x.h,x.d,x.k,m.id,x.reason,m.id);render();toast("Lomi is finding cover");return}
  case"acceptoffer":{var cv=byId(s.coverage,nid);if(cv&&C.acceptCoverage(cv,m.id)){render();toast("Shift added to your schedule")}return}
  case"declineoffer":{var cv2=byId(s.coverage,nid);if(cv2){C.declineCoverage(cv2,m.id);render()}return}

  /* office navigation */
  case"svtab":sv.tab=v;sv.sel=null;sv.person=null;sv.homeForm=null;sv.staffForm=null;render();global.scrollTo(0,0);return;
  case"sel":sv.sel=nid;render();return;
  case"goschedule":sv.tab="schedule";var gh=b.getAttribute("data-h");if(gh)sv.homeId=gh;render();return;
  case"gonote":sv.tab="notes";sv.sel=nid;render();return;
  case"goinc":sv.tab="incidents";sv.sel=nid;render();return;
  case"gomeds":sv.tab="meds";sv.sel=nid;render();return;
  case"gohealth":sv.tab="health";sv.sel=nid;render();return;
  case"ackclock":byId(s.clocks,nid).ack=true;render();toast("Marked as reviewed");return;
  case"week":sv.week=C.dayKey(+v,sv.week||C.weekStart());render();return;
  case"slot":ui.sheet={kind:"office",html:O.slotSheet(sv.homeId,b.getAttribute("data-d"),b.getAttribute("data-k"))};render();return;
  case"slotassign":{var who=val("slot-staff");if(!who){toast("Choose someone first");return}C.setSlot(sv.homeId,b.getAttribute("data-d"),b.getAttribute("data-k"),{staff:who,status:"filled"});C.log("shift.assigned",{homeId:sv.homeId,staffId:who});ui.sheet=null;render();toast("Shift assigned to "+C.firstName(who));return}
  case"slotopen":C.startCoverage(sv.homeId,b.getAttribute("data-d"),b.getAttribute("data-k"),null,"",m.id);ui.sheet=null;render();toast("Lomi offered the shift to eligible staff");return;
  case"slotclear":C.setSlot(sv.homeId,b.getAttribute("data-d"),b.getAttribute("data-k"),null);ui.sheet=null;render();return;

  /* office review */
  case"approve":{var n3=byId(s.notes,nid);n3.status="approved";n3.history.push({at:now(),who:m.name,what:"Approved"});C.log("note.approved",{homeId:C.client(n3.clientId).homeId,staffId:m.id});render();toast("Note approved");return}
  case"sendback":{var cm=val("svc");if(!cm){toast("Add a comment so they know what to fix");return}var n4=byId(s.notes,nid);n4.status="returned";n4.comment=cm;n4.history.push({at:now(),who:m.name,what:"Sent back: "+cm});C.log("note.returned",{homeId:C.client(n4.clientId).homeId,staffId:n4.authorId});render();toast("Sent back");return}
  case"notify":{var i3=byId(s.incidents,nid);if(i3.notified.indexOf(v)<0)i3.notified.push(v);render();return}
  case"increview":{var i2=byId(s.incidents,nid);i2.followup=val("svf");i2.status="reviewed";i2.reviewedBy=m.name;C.log("incident.reviewed",{homeId:C.client(i2.clientId).homeId,staffId:m.id});render();toast("Incident marked reviewed");return}
  case"ackmed":byId(s.mar,nid).ack=true;render();toast("Marked as followed up");return;
  case"ackh":byId(s.health,nid).ack=true;render();toast("Marked as followed up");return;

  /* people */
  case"openperson":sv.person=cid;sv.ptab="overview";render();global.scrollTo(0,0);return;
  case"closeperson":sv.person=null;render();return;
  case"ptab":sv.ptab=v;render();return;
  case"addperson":ui.sheet={kind:"office",html:'<h2 id="sh-t">Add a person</h2>'+O.personForm(sv.homeId!=="all"?{homeId:sv.homeId,health:{}}:null)+'<button type="button" class="btn full" data-a="saveperson">Add person</button><button type="button" class="btn sec full" data-a="sheetclose">Cancel</button>'};render();return;
  case"editperson":ui.sheet={kind:"office",html:'<h2 id="sh-t">Edit details</h2>'+O.personForm(C.client(cid))+'<button type="button" class="btn full" data-a="saveperson" data-c="'+cid+'">Save</button><button type="button" class="btn sec full" data-a="sheetclose">Cancel</button>'};render();return;
  case"saveperson":{var name=val("pf-name");if(!name){toast("Add the person's name");return}
    var rec3=cid?C.client(cid):{id:C.uid(),goals:[],meds:[],medHistory:[],caseNotes:[],health:{}};
    rec3.name=name;rec3.first=name.split(" ")[0];rec3.ini=C.initials(name);rec3.homeId=val("pf-home");rec3.info=val("pf-info");
    rec3.health={dob:val("pf-dob"),allergies:val("pf-allergies"),conditions:val("pf-conditions"),diet:val("pf-diet"),doctor:val("pf-doctor"),guardian:val("pf-guardian")};
    rec3.behaviors=val("pf-beh").split(",").map(function(x){return x.trim()}).filter(Boolean);
    if(!cid){s.clients.push(rec3);C.log("client.added",{homeId:rec3.homeId,clientId:rec3.id})}
    ui.sheet=null;sv.person=rec3.id;render();toast(cid?"Saved":name+" added");return}
  case"addgoal":{var gt=val("gtext");if(!gt){toast("Write the goal first");return}var tp=val("tpl");
    C.client(cid).goals.push({id:C.uid(),text:gt,area:tp?tp.split("|")[0]:"General",often:val("goften"),target:val("gtarget"),start:C.dt(now()),steps:val("gsteps").split("\n").map(function(x){return x.trim()}).filter(Boolean)});
    C.log("goal.added",{homeId:C.client(cid).homeId,clientId:cid});render();toast("Goal added. It now appears in shift notes.");return}
  case"stopgoal":{var gg=byId(C.client(cid).goals,nid);gg.stopped=C.dt(now());render();toast("Goal stopped");return}
  case"addmed":{var mn=val("md-name"),dose=val("md-dose"),kind=val("md-kind"),time=val("md-time"),prn=val("md-prn");
    if(!mn||!dose){toast("Add the medication name and dose");return}if(kind==="sched"&&!time){toast("Add the scheduled time");return}if(kind==="prn"&&!prn){toast("Add the as-needed instructions");return}
    var cl2=C.client(cid);cl2.meds.push({id:C.uid(),name:mn,dose:dose,route:val("md-route")||"By mouth",time:kind==="sched"?time:"",prn:kind==="prn"?prn:"",note:val("md-note"),since:C.dt(now())});
    cl2.medHistory.push({at:C.dt(now()),what:"Started "+mn+", "+dose+(kind==="prn"?" as needed":" at "+C.t12(time))+" (added by "+m.name+")"});render();toast("Medication added");return}
  case"stopmed":{var cl3=C.client(cid),mm=byId(cl3.meds,nid);mm.stopped=C.dt(now());cl3.medHistory.push({at:C.dt(now()),what:"Stopped "+mm.name+" (by "+m.name+")"});render();toast("Medication stopped");return}
  case"addcase":{var ct=val("cnote");if(!ct)return;C.client(cid).caseNotes.push({at:C.dt(now()),by:m.name,text:ct});render();toast("Case note saved");return}

  /* setup */
  case"edithome":{var hm=nid?C.home(nid):null;sv.homeForm=hm?{id:hm.id,name:hm.name,addr:hm.address,lat:hm.lat==null?"":String(hm.lat),lng:hm.lng==null?"":String(hm.lng),rad:hm.radius}:{rad:150};render();return}
  case"cancelhome":sv.homeForm=null;render();return;
  case"savehome":{var hf=sv.homeForm;hf.name=val("hf-name");hf.addr=val("hf-addr");readLoc("hf",hf);if(!hf.name){hf.err="Add the home's name.";render();return}var lc=parseLoc(hf);if(lc.err){hf.err=lc.err;render();return}
    if(hf.id){var hm2=C.home(hf.id);hm2.name=hf.name;hm2.address=hf.addr;hm2.lat=lc.lat;hm2.lng=lc.lng;hm2.radius=lc.radius}
    else{var nh={id:C.uid(),name:hf.name,address:hf.addr,lat:lc.lat,lng:lc.lng,radius:lc.radius};s.homes.push(nh);if(m.homeIds.indexOf(nh.id)<0)m.homeIds.push(nh.id);C.log("home.added",{homeId:nh.id})}
    sv.homeForm=null;render();toast("Home saved");return}
  case"editstaff":{var p=nid?C.staff(nid):null;sv.staffForm=p?{id:p.id,name:p.name,role:p.role.charAt(0).toUpperCase()+p.role.slice(1),medCert:p.medCert,homeIds:p.homeIds.slice()}:{role:"Caregiver",homeIds:sv.homeId&&sv.homeId!=="all"?[sv.homeId]:[]};render();return}
  case"sf-role":{var sf=sv.staffForm;sf.name=val("sf-name");sf.medCert=document.getElementById("sf-med").checked;sf.homeIds=[];root.querySelectorAll("[data-sfhome]").forEach(function(el){if(el.checked)sf.homeIds.push(el.getAttribute("data-sfhome"))});sf.role=v;render();return}
  case"cancelstaff":sv.staffForm=null;render();return;
  case"savestaff":{var sf2=sv.staffForm;sf2.name=val("sf-name");sf2.medCert=document.getElementById("sf-med").checked;sf2.homeIds=[];root.querySelectorAll("[data-sfhome]").forEach(function(el){if(el.checked)sf2.homeIds.push(el.getAttribute("data-sfhome"))});
    if(!sf2.name){sf2.err="Add their name.";render();return}if(!sf2.homeIds.length){sf2.err="Choose at least one home.";render();return}
    var role=sf2.role.toLowerCase();
    if(sf2.id){var p2=C.staff(sf2.id);if(p2.id===m.id&&role==="caregiver"&&!s.staff.some(function(x){return x.id!==m.id&&x.role!=="caregiver"})){sf2.err="Keep at least one supervisor or admin.";render();return}p2.name=sf2.name;p2.ini=C.initials(sf2.name);p2.role=role;p2.medCert=sf2.medCert;p2.homeIds=sf2.homeIds}
    else{s.staff.push({id:C.uid(),name:sf2.name,ini:C.initials(sf2.name),role:role,medCert:sf2.medCert,homeIds:sf2.homeIds});C.log("staff.added",{homeId:sf2.homeIds[0]})}
    sv.staffForm=null;render();toast("Staff saved");return}

  /* reports and AI */
  case"export":C.download("guad-"+v+"-"+C.dayKey(0)+".csv",C.csv(O.reportRows(v,sv.homeId)),toast);return;
  }
});
render();
})(window);

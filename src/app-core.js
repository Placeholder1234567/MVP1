/* Guad app: core state, helpers, scheduling and coverage. */
(function (global) {
"use strict";
var Store = global.GuadStore, Geo = global.GuadGeo;
var S = Store.load();
var LEVELS = global.Lomi.LEVELS;
var SHORT = {"Independent":"Independent","Verbal prompt":"Verbal","Gestural prompt":"Gestural","Model":"Model","Partial physical":"Partial physical","Full physical":"Full physical","Refused":"Refused"};
var SERVICES = ["In-home support","Day program","Community outing","Employment support","Absent: hospital","Absent: family visit"];
var TEMPLATES = {"Daily living":["Set the table","Make a simple meal","Do a load of laundry","Brush teeth on own","Make the bed"],"Community":["Pay for an item at a store","Ride the bus with support","Order food at a restaurant"],"Health":["Name each medication before taking it","Take a daily walk","Drink water with each meal"],"Social":["Greet housemates by name","Call a family member weekly"]};
var SHIFTS = [{k:"am",label:"Morning",time:"7am–3pm",start:"07:00",end:"15:00"},{k:"pm",label:"Evening",time:"3pm–11pm",start:"15:00",end:"23:00"},{k:"on",label:"Overnight",time:"11pm–7am",start:"23:00",end:"07:00"}];
var DAYN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var LIM = {tempHi:100.4,tempLo:95,pulseHi:100,pulseLo:50,sysHi:140,sysLo:90,diaHi:90,diaLo:60}; // TODO: make these per-person settings set by the agency nurse

/* ---------- small helpers ---------- */
function now(){return new Date().toISOString()}
function tm(i){try{return new Date(i).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}catch(e){return""}}
function dt(i){try{return new Date(i).toLocaleDateString([],{month:"short",day:"numeric"})}catch(e){return""}}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function uid(){return Store.uid()}
function t12(x){if(!x)return"";var p=x.split(":"),h=+p[0];return (h%12||12)+":"+p[1]+(h<12?"am":"pm")}
function pl(n,w){return n+" "+w+(n===1?"":"s")}
function byId(a,id){for(var i=0;i<(a||[]).length;i++)if(a[i].id===id)return a[i];return null}
function initials(n){return String(n||"").split(/\s+/).filter(Boolean).slice(0,2).map(function(w){return w[0].toUpperCase()}).join("")}
function dayKey(off,base){var d=base?new Date(base+"T12:00:00"):new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+(off||0));return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function dayLabel(k){var off=Math.round((new Date(k+"T12:00:00")-new Date(dayKey(0)+"T12:00:00"))/864e5),d=new Date(k+"T12:00:00");return off===0?"Today":off===1?"Tomorrow":off===-1?"Yesterday":DAYN[d.getDay()]+" "+d.getDate()}
function weekStart(k){var d=new Date((k||dayKey(0))+"T12:00:00");d.setDate(d.getDate()-d.getDay());return dayKey(0,d.toISOString().slice(0,10))}
function shiftDef(k){return SHIFTS.filter(function(s){return s.k===k})[0]}
function save(){Store.save(S)}
function log(type,data){return Store.log(S,type,data)}

/* ---------- lookups ---------- */
function me(){return byId(S.staff,S.session.userId)}
function isOffice(){var m=me();return !!m&&(m.role==="supervisor"||m.role==="admin")}
function home(id){return byId(S.homes,id)}
function client(id){return byId(S.clients,id)}
function staff(id){return byId(S.staff,id)}
function firstName(id){var p=staff(id);return p?p.name.split(" ")[0]:"Someone"}
function clientsIn(hid){return S.clients.filter(function(c){return hid==="all"||c.homeId===hid})}
function activeClock(sid){for(var i=S.clocks.length-1;i>=0;i--){var c=S.clocks[i];if(c.staffId===sid&&!c.outAt)return c}return null}
function cgHome(){var c=activeClock(S.session.userId);return c?c.homeId:null}
function isToday(iso){return iso&&iso.slice(0,10)===new Date().toISOString().slice(0,10)}
function shiftNote(cid){for(var i=S.notes.length-1;i>=0;i--){var n=S.notes[i];if(n.clientId===cid&&n.type==="shift"&&n.day===dayKey(0))return n}return null}
function scheduledMeds(c){return c.meds.filter(function(m){return !m.prn&&!m.stopped})}
function marFor(cid,mid){for(var i=S.mar.length-1;i>=0;i--){var r=S.mar[i];if(r.clientId===cid&&r.medId===mid&&!r.prn&&r.day===dayKey(0))return r}return null}
function medsDue(c){return scheduledMeds(c).filter(function(m){return !marFor(c.id,m.id)})}
function att(cid){return (S.attendance[dayKey(0)]||{})[cid]}
function score(tr){if(!tr||!tr.length)return"";var k=tr.filter(function(t){return t==="Independent"}).length;return k+" of "+tr.length+" independent"}
function slot(hid,day,k){var h=S.schedule[hid]||(S.schedule[hid]={});var d=h[day]||(h[day]={});return d[k]||null}
function setSlot(hid,day,k,v){var h=S.schedule[hid]||(S.schedule[hid]={});var d=h[day]||(h[day]={});if(v)d[k]=v;else delete d[k]}
function weeklyShifts(sid,anyDay){var ws=weekStart(anyDay),n=0;for(var i=0;i<7;i++){var d=dayKey(i,ws);Object.keys(S.schedule).forEach(function(hid){var day=(S.schedule[hid]||{})[d]||{};Object.keys(day).forEach(function(k){if(day[k].staff===sid)n++})})}return n}
function workingOn(sid,day){return Object.keys(S.schedule).some(function(hid){var d=(S.schedule[hid]||{})[day]||{};return Object.keys(d).some(function(k){return d[k].staff===sid})})}
function unreadFor(hid){var m=me();if(!m||!hid)return 0;var seen=(m.seen||{})[hid]||0;return S.msgs.filter(function(x){return x.homeId===hid}).length-seen}
function markRead(hid){var m=me();if(!m)return;m.seen=m.seen||{};m.seen[hid]=S.msgs.filter(function(x){return x.homeId===hid}).length}
function post(hid,from,text){S.msgs.push({id:uid(),homeId:hid,from:from,text:text,at:now()})}

/* ---------- Lomi coverage: offers a shift to every eligible person at once ---------- */
function eligibility(hid,day,k,exclude){
  var h=home(hid),needsMeds=k==="pm"&&clientsIn(hid).some(function(c){return scheduledMeds(c).length});
  return S.staff.filter(function(p){return p.role==="caregiver"||p.homeIds.indexOf(hid)>=0}).map(function(p){
    var why="";
    if(p.id===exclude)why="Called out";
    else if(p.homeIds.indexOf(hid)<0)why="Not trained at "+h.name;
    else if(workingOn(p.id,day))why="Already working that day";
    else if((weeklyShifts(p.id,day)+1)*8>40)why="Would go over 40 hours";
    else if(needsMeds&&!p.medCert)why="Not med-certified, and meds are due";
    return {id:p.id,ok:!why,why:why||"Trained at "+h.name+", under 40 hours"+(needsMeds?", med-certified":""),reply:why?"":"Offered"};
  });
}
function startCoverage(hid,day,k,calledOut,reason,by){
  var cur=slot(hid,day,k);
  setSlot(hid,day,k,{staff:null,status:"filling"});
  var cands=eligibility(hid,day,k,calledOut),ok=cands.filter(function(x){return x.ok});
  var cov={id:uid(),homeId:hid,day:day,shift:k,calledOut:calledOut||null,reason:reason||"",by:by,startedAt:now(),status:ok.length?"searching":"unfilled",cands:cands,
    steps:[{at:now(),text:calledOut?firstName(calledOut)+" called out"+(reason?": "+reason:""):"Open shift posted"},{at:now(),text:"Lomi checked "+pl(cands.length,"staff member")+" against the rules"},
           {at:now(),text:ok.length?"Offered to "+(ok.length===1?"1 eligible person":ok.length+" eligible people")+": "+ok.map(function(x){return firstName(x.id)}).join(", "):"No one is eligible. A supervisor needs to fill this shift."}]};
  // TODO (production): text and call each eligible person through your messaging provider, and accept replies by text.
  S.coverage.push(cov);
  log(calledOut?"shift.called_out":"shift.posted",{homeId:hid,day:day,shift:k,staffId:calledOut||null,coverageId:cov.id,eligible:ok.length});
  post(hid,"Lomi",(calledOut?firstName(calledOut)+" can't make "+dayLabel(day).toLowerCase()+"'s "+shiftDef(k).label.toLowerCase()+" shift. ":"An open "+shiftDef(k).label.toLowerCase()+" shift on "+dayLabel(day)+" was posted. ")+(ok.length?"I've offered it to "+pl(ok.length,"eligible staff member")+".":"No one is eligible, so a supervisor will fill it."));
  return cov;
}
function acceptCoverage(cov,sid){
  if(cov.status!=="searching")return false;
  var me2=byId(cov.cands,sid);if(!me2||!me2.ok)return false;
  me2.reply="Accepted";cov.cands.forEach(function(x){if(x.reply==="Offered")x.reply="Offer closed"});
  cov.steps.push({at:now(),text:firstName(sid)+" accepted"});cov.steps.push({at:now(),text:"Schedule updated and team notified"});
  cov.status="filled";cov.filledBy=sid;cov.filledAt=now();
  setSlot(cov.homeId,cov.day,cov.shift,{staff:sid,status:"filled",viaLomi:true});
  log("shift.filled",{homeId:cov.homeId,coverageId:cov.id,staffId:sid,minutes:Math.max(0,Math.round((new Date(cov.filledAt)-new Date(cov.startedAt))/60000)),viaLomi:true});
  post(cov.homeId,"Lomi",dayLabel(cov.day)+"'s "+shiftDef(cov.shift).label.toLowerCase()+" shift is covered by "+firstName(sid)+".");
  return true;
}
function declineCoverage(cov,sid){var x=byId(cov.cands,sid);if(x&&x.reply==="Offered"){x.reply="Declined";cov.steps.push({at:now(),text:firstName(sid)+" declined"});log("shift.offer_declined",{homeId:cov.homeId,coverageId:cov.id,staffId:sid});
  if(!cov.cands.some(function(c){return c.reply==="Offered"})){cov.status="unfilled";cov.steps.push({at:now(),text:"Everyone eligible declined. A supervisor needs to fill this shift."})}}}
function offersFor(sid){return S.coverage.filter(function(c){var x=byId(c.cands,sid);return c.status==="searching"&&x&&x.ok&&x.reply==="Offered"})}
function notifRules(sev,type){
  var r=[{who:"Supervisor",when:"Right away"},{who:"Family or guardian",when:"Within 24 hours"}];
  if(["Seizure","Medication error","Injury","Fall"].indexOf(type)>=0)r.push({who:"Nurse",when:"Within 2 hours"});
  if(sev==="High"||type==="Left without staff")r.push({who:"State reporting system",when:"Check your state's deadline"});
  return r; // TODO: replace with your state's actual reporting rules and deadlines
}
function vitalFlags(d){var f=[],n=function(x){return x===""||x==null?null:Number(x)},t=n(d.temp),p=n(d.pulse),s=n(d.sys),di=n(d.dia);
  if(t!=null&&(t>=LIM.tempHi||t<LIM.tempLo))f.push("Temperature "+t+"°F is outside the limit");
  if(p!=null&&(p>LIM.pulseHi||p<LIM.pulseLo))f.push("Pulse "+p+" bpm is outside the limit");
  if((s!=null&&(s>=LIM.sysHi||s<LIM.sysLo))||(di!=null&&(di>=LIM.diaHi||di<LIM.diaLo)))f.push("Blood pressure "+(s||"?")+"/"+(di||"?")+" is outside the limit");return f}
function normalizeDraft(d,c,type){
  d=d||{};d.flags=Array.isArray(d.flags)?d.flags.filter(function(f){return f&&f.phrase}):[];d.incident=d.incident||{detected:false,summary:""};
  if(type!=="behavior"){["activities","meals","mood","health"].forEach(function(k){if(typeof d[k]!=="string")d[k]=""});
    var gs=Array.isArray(d.goals)?d.goals:[];
    d.goals=c.goals.filter(function(g){return !g.stopped}).map(function(g){var r=byId(gs,g.id)||{};return {id:g.id,trials:(Array.isArray(r.trials)?r.trials:[]).filter(function(t){return LEVELS.indexOf(t)>=0}),na:!!(r.notAttempted||r.na),reason:r.reason||""}});
  }else{["before","behavior","response","outcome","duration"].forEach(function(k){if(typeof d[k]!=="string")d[k]=""});
    if(c.behaviors.concat(["Other"]).indexOf(d.behaviorType)<0)d.behaviorType=c.behaviors[0]||"Other"}
  return d;
}

/* ---------- downloads ---------- */
function csv(rows){return rows.map(function(r){return r.map(function(x){x=String(x==null?"":x);return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}).join(",")}).join("\n")}
function download(name,text,done){
  if(global.claude&&global.claude.use){global.claude.use("downloads").then(function(dl){if(!dl){done("Downloads aren't available here");return}dl.save({filename:name,data:text}).then(function(){done("Report saved")}).catch(function(){done("")})});return}
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/csv"}));a.download=name;document.body.appendChild(a);a.click();a.remove();done("Report downloaded");
}

global.GuadCore={S:function(){return S},setS:function(x){S=x},LEVELS:LEVELS,SHORT:SHORT,SERVICES:SERVICES,TEMPLATES:TEMPLATES,SHIFTS:SHIFTS,
  now:now,tm:tm,dt:dt,esc:esc,uid:uid,t12:t12,pl:pl,byId:byId,initials:initials,dayKey:dayKey,dayLabel:dayLabel,weekStart:weekStart,shiftDef:shiftDef,save:save,log:log,
  me:me,isOffice:isOffice,home:home,client:client,staff:staff,firstName:firstName,clientsIn:clientsIn,activeClock:activeClock,cgHome:cgHome,isToday:isToday,shiftNote:shiftNote,
  scheduledMeds:scheduledMeds,marFor:marFor,medsDue:medsDue,att:att,score:score,slot:slot,setSlot:setSlot,weeklyShifts:weeklyShifts,unreadFor:unreadFor,markRead:markRead,post:post,
  eligibility:eligibility,startCoverage:startCoverage,acceptCoverage:acceptCoverage,declineCoverage:declineCoverage,offersFor:offersFor,notifRules:notifRules,vitalFlags:vitalFlags,
  normalizeDraft:normalizeDraft,csv:csv,download:download,Geo:Geo};
})(window);

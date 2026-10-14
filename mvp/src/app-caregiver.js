/* Guad app: setup, sign-in and caregiver screens. */
(function (global) {
"use strict";
var C=global.GuadCore,esc=C.esc,tm=C.tm,dt=C.dt,pl=C.pl,byId=C.byId,t12=C.t12;
var V=global.GuadViews={};
var I={back:'<path d="M15 5l-7 7 7 7"/>',chev:'<path d="M9 6l6 6-6 6"/>',
 today:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
 people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.8 3.1 2.6 3.5 5.2"/>',
 note:'<path d="M7 3h7l5 5v13H7z"/><path d="M10 13h6M10 17h4"/>',shifts:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 me:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',pill:'<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M9.5 8.5l5 7"/>',
 heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',alert:'<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
 wave:'<path d="M3 12h3l3-6 4 12 3-6h5"/>',check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
 chat:'<path d="M4 5h16v11H9l-5 4z"/>',pin:'<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
 cal:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 9h18"/>',chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
 file:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',overview:'<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
 send:'<path d="M4 12l16-8-6 16-3-7z"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'};
function svg(p,s){return '<svg width="'+(s||22)+'" height="'+(s||22)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'}
function lemon(s){return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 30 30" aria-hidden="true"><ellipse cx="15" cy="15.5" rx="11" ry="8.5" fill="#FFD66B" stroke="#1C1B4B" stroke-width="1.3" transform="rotate(-30 15 15.5)"/><path d="M22 7.6l2.6-2.4" stroke="#1C1B4B" stroke-width="1.5" stroke-linecap="round"/><path d="M11 16.2q4 2.6 8 0" fill="none" stroke="#1C1B4B" stroke-width="1.1" stroke-linecap="round"/></svg>'}
function pill(k,t){return '<span class="pill '+k+'">'+esc(t)+'</span>'}
// Held is a clinical decision, refused is the person's choice: they must look different (amber vs red).
function marPill(r){return r.status==="given"?pill("ok","Given"):r.status==="held"?pill("warn","Held"):pill("bad","Refused")}
function timesLabel(m){return C.medTimes(m).map(t12).join(", ")}
function choice(attr,opts,val){return '<div class="choice" role="group">'+opts.map(function(o){return '<button type="button" '+attr+' data-v="'+esc(o)+'" aria-pressed="'+(o===val)+'">'+esc(o)+'</button>'}).join("")+'</div>'}
function errLine(e){return e?'<div class="callout bad s14" role="alert">'+svg(I.alert,20)+'<div class="body">'+esc(e)+'</div></div>':''}
function appbar(title,sub,back){return '<header class="appbar"><button type="button" class="iconbtn" aria-label="Back" data-a="'+(back||"close")+'">'+svg(I.back)+'</button><div class="title"><b>'+esc(title)+'</b>'+(sub?'<span>'+esc(sub)+'</span>':'')+'</div></header>'}
function field(id,label,attrs,val){return '<div class="field"><label for="'+id+'">'+label+'</label><input class="input" id="'+id+'" '+(attrs||'')+' value="'+esc(val||"")+'"></div>'}
V.svg=svg;V.I=I;V.lemon=lemon;V.pill=pill;V.marPill=marPill;V.timesLabel=timesLabel;V.choice=choice;V.errLine=errLine;V.appbar=appbar;V.field=field;

/* ---------- first run ---------- */
V.setup=function(st){
  return '<main class="center-page"><div class="setup card">'+lemon(56)+'<h1 class="serif" style="font-size:32px">Set up Guad</h1><p class="muted">Create your agency and its first home. You can add more homes, staff and the people you support next.</p>'+
   '<div class="fieldset">'+field("su-agency","Agency name",'autocomplete="organization"',st.agency)+field("su-name","Your name",'autocomplete="name"',st.name)+
   '<div class="field"><span class="lbl">Your role</span>'+choice('data-a="su-role"',["Admin","Supervisor"],st.role||"Admin")+'</div>'+
   '<hr class="sep"><b>First home</b>'+field("su-home","Home name",'placeholder="For example: Oak Street"',st.home)+field("su-addr","Address",'autocomplete="street-address"',st.addr)+
   locFields("su",st)+'</div>'+errLine(st.err)+'<button type="button" class="btn full" data-a="su-create">Create agency</button>'+
   '<p class="s13 faint">This version stores data in this browser only. Don\'t enter real client information until Guad runs on a secure, HIPAA-ready backend.</p></div></main>';
};
function locFields(prefix,st){
  return '<div class="field"><span class="lbl">Check-in location</span><p class="s13 muted" style="margin:-2px 0 4px">Caregivers within the radius are verified at this home when they clock in.</p>'+
   '<div class="grid2">'+field(prefix+"-lat","Latitude",'inputmode="decimal"',st.lat)+field(prefix+"-lng","Longitude",'inputmode="decimal"',st.lng)+'</div>'+
   '<div class="grid2" style="align-items:end">'+field(prefix+"-rad","Radius (meters)",'type="number" min="50" step="10"',st.rad||150)+'<button type="button" class="btn sec sm" data-a="useloc" data-v="'+prefix+'">'+svg(I.pin,18)+'Use my location</button></div>'+
   (st.locMsg?'<p class="s13 muted">'+esc(st.locMsg)+'</p>':'')+'</div>';
}
V.locFields=locFields;
V.signin=function(){var S=C.S();
  return '<main class="center-page"><div class="setup card"><h1 class="serif" style="font-size:30px">Who\'s using Guad?</h1><p class="muted s14">Development sign-in. Replace this with real accounts before going live.</p><div class="list card">'+
   S.staff.map(function(p){return '<button type="button" class="row" data-a="signin" data-n="'+p.id+'"><span class="avatar">'+esc(p.ini)+'</span><span class="grow"><b>'+esc(p.name)+'</b><span>'+esc(p.role.charAt(0).toUpperCase()+p.role.slice(1))+(p.homeIds.length?" · "+p.homeIds.map(function(h){return (C.home(h)||{}).name}).join(", "):"")+'</span></span><span class="chev">'+svg(I.chev,18)+'</span></button>'}).join("")+'</div></div></main>';
};

/* ---------- caregiver: home bar, tabs ---------- */
function homeBar(title){var hid=C.cgHome(),u=C.unreadFor(hid),m=C.me();
  return '<header class="appbar homebar"><span class="wordmark'+(title?"":" brand")+'">'+esc(title||"Guad")+'</span><span class="hb-actions">'+(hid?'<button type="button" class="iconbtn hdrbtn" aria-label="Team messages'+(u>0?", "+u+" new":"")+'" data-a="msgs">'+svg(I.chat)+(u>0?'<span class="dot" style="top:8px;left:26px"></span>':'')+'</button>':'')+'<span class="avatar sm">'+esc(m.ini)+'</span></span></header>'}
function greeting(){var h=new Date().getHours();return h<12?"Good morning":h<17?"Good afternoon":"Good evening"}
function myShiftToday(hid){var m=C.me(),d=C.dayKey(0),out=null;C.SHIFTS.forEach(function(s){var sl=C.slot(hid,d,s.k);if(sl&&sl.staff===m.id)out=s});return out}
V.cgToday=function(ui){var S=C.S(),m=C.me(),hid=C.cgHome();
  var h=homeBar()+'<div class="screen home"><div class="greet"><h1 class="serif">'+greeting()+', '+esc(m.name.split(" ")[0])+'</h1>';
  if(!hid){
    h+='<p class="muted" style="margin-top:4px;font-size:15px">Clock in to see today\'s people and tasks.</p></div>';
    if(!m.homeIds.length)return h+'<div class="cv-card">You haven\'t been added to a home yet. Ask your supervisor to add you.</div></div>';
    return h+clockInCard(ui)+'</div>';
  }
  var hm=C.home(hid),sh=myShiftToday(hid);
  h+='<p class="muted" style="margin-top:4px;font-size:15px">'+esc(hm.name)+(sh?" · Shift "+sh.time.replace("–"," to "):" · No shift scheduled for you today")+'</p></div>';
  var cl=C.clientsIn(hid);
  if(!cl.length)return h+'<div class="cv-card">No one has been added to '+esc(hm.name)+' yet. Your supervisor adds people in Guad\'s People section.</div></div>';
  var nd=cl.filter(function(c){var n=C.shiftNote(c.id);return n&&n.status!=="returned"}).length;
  h+='<div class="cv-card" style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;justify-content:space-between;font-size:15px"><b>Notes this shift</b><span class="muted">'+nd+' of '+cl.length+' done</span></div><div class="cv-bar"><i style="width:'+Math.round(nd/cl.length*100)+'%"></i></div></div>';
  C.offersFor(m.id).slice(0,1).forEach(function(o){h+=offerCard(o)});
  h+='<div class="cv-list">';
  cl.slice().sort(function(a,b){var x=C.shiftNote(a.id),y=C.shiftNote(b.id);return ((x&&x.status!=="returned")?1:0)-((y&&y.status!=="returned")?1:0)}).forEach(function(c){
    var n=C.shiftNote(c.id),md=C.medsDue(c).length,sub,chip,goals=c.goals.filter(function(g){return !g.stopped}).length;
    if(n&&n.status==="returned"){sub="Sent back: "+n.comment;chip='<span class="cv-chip bad">Fix</span>'}
    else if(n){sub="Shift note signed at "+tm(n.createdAt);chip='<svg width="26" height="26" viewBox="0 0 26 26" role="img" aria-label="Done"><circle cx="13" cy="13" r="13" fill="var(--blue)"/><path d="M8 13.5l3.4 3.4L18.5 9.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
    else{sub="Shift note"+(goals?" · "+pl(goals,"goal")+" to record":"");chip='<span class="cv-chip">To do</span>'}
    if(md)sub+=" · "+pl(md,"med")+" due";
    h+='<button type="button" class="cv-row" data-a="person" data-c="'+c.id+'"><span class="avatar">'+esc(c.ini)+'</span><span class="grow"><b>'+esc(c.name)+'</b><span>'+esc(sub)+'</span></span>'+chip+'</button>'});
  return h+'</div></div>';
};
function clockInCard(ui){var S=C.S(),m=C.me(),homes=m.homeIds.map(C.home).filter(Boolean),ranked=C.Geo.rankHomes(homes,ui.pos),best=ranked[0]&&ranked[0].inside?ranked[0]:null;
  var h='<div class="cv-card" style="display:flex;flex-direction:column;gap:14px"><div style="display:flex;gap:12px;align-items:center"><span class="avatar sq">'+svg(I.pin)+'</span><div><b>Where are you working?</b><p class="s14 muted">'+(ui.locating?"Checking your location…":ui.pos?"Location found (accurate to about "+ui.pos.accuracy+" m).":ui.locErr?esc(ui.locErr)+" You can still choose your home.":"Guad uses your location to confirm you\'re at the home.")+'</p></div></div>';
  if(!ui.pos&&!ui.locating&&!ui.locErr)h+='<button type="button" class="btn full" data-a="locate">'+svg(I.pin,20)+'Find my location</button>';
  if(best)h+='<div class="callout info"><div class="body"><span>You\'re at <b>'+esc(best.home.name)+'</b>.</span><button type="button" class="btn" data-a="clockin" data-n="'+best.home.id+'">Clock in at '+esc(best.home.name)+'</button></div></div>';
  var others=ranked.filter(function(r){return r!==best});
  if(others.length)h+='<div class="list card">'+others.map(function(r){return '<div class="row"><span class="grow"><b>'+esc(r.home.name)+'</b><span>'+esc([r.home.address,r.distance!=null?C.Geo.formatDistance(r.distance):""].filter(Boolean).join(" · "))+'</span></span><button type="button" class="btn sec sm" data-a="clockin" data-n="'+r.home.id+'">Clock in</button></div>'}).join("")+'</div>';
  if(ui.pos&&!best)h+='<p class="s13 muted">You don\'t appear to be at any of your homes. If you clock in anyway, your supervisor will see it was outside the check-in area.</p>';
  return h+'</div>';
}
function offerCard(o){return '<div class="callout warn">'+lemon(26)+'<div class="body"><span><b>Can you pick up a shift?</b> '+esc((C.home(o.homeId)||{}).name+", "+C.dayLabel(o.day)+", "+C.shiftDef(o.shift).label.toLowerCase()+" ("+C.shiftDef(o.shift).time+")")+'</span><div class="acts"><button type="button" class="btn sm" data-a="acceptoffer" data-n="'+o.id+'">I\'ll take it</button><button type="button" class="textbtn" data-a="declineoffer" data-n="'+o.id+'">Not this time</button></div></div></div>'}
V.cgNotes=function(){var S=C.S(),m=C.me(),ev=[],day=C.dayKey(0);
  S.notes.filter(function(n){return n.authorId===m.id&&n.day===day}).forEach(function(n){ev.push({at:n.createdAt,c:n.clientId,t:n.type==="behavior"?"Behavior note":"Shift note",s:n.status==="approved"?pill("ok","Approved"):n.status==="returned"?pill("bad","Sent back"):pill("info","Submitted")})});
  S.mar.filter(function(r){return r.byId===m.id&&r.day===day}).forEach(function(r){var md=byId(C.client(r.clientId).meds,r.medId);ev.push({at:r.at,c:r.clientId,t:md.name+(r.prn?" (as needed)":r.slot?" ("+t12(r.slot)+" dose)":""),s:marPill(r)})});
  S.health.filter(function(x){return x.byId===m.id&&C.isToday(x.at)}).forEach(function(x){ev.push({at:x.at,c:x.clientId,t:hKind(x.kind),s:x.flags.length?pill("bad","Alert"):pill("ok","Saved")})});
  S.incidents.filter(function(i){return i.authorId===m.id&&C.isToday(i.createdAt)}).forEach(function(i){ev.push({at:i.createdAt,c:i.clientId,t:"Incident: "+i.type,s:i.status==="open"?pill("bad","Open"):pill("ok","Reviewed")})});
  var A=S.attendance[day]||{};Object.keys(A).forEach(function(cid){if(A[cid].byId===m.id)ev.push({at:A[cid].at,c:cid,t:"Attendance: "+A[cid].services.join(", "),s:pill("ok","Saved")})});
  ev.sort(function(a,b){return a.at<b.at?1:-1});
  var h=homeBar("Notes")+'<div class="screen home"><p class="muted s14" style="margin-top:-6px">Everything you recorded today</p>';
  if(!ev.length)return h+'<div class="card empty">Nothing yet. Your notes, medications, health entries and reports will show up here.</div></div>';
  return h+'<div class="list card">'+ev.map(function(e){var c=C.client(e.c);return '<div class="row"><span class="avatar sm">'+esc(c.ini)+'</span><span class="grow"><b>'+esc(e.t)+'</b><span>'+esc(c.name)+' · '+tm(e.at)+'</span></span>'+e.s+'</div>'}).join("")+'</div></div>';
};
V.cgShifts=function(ui){var S=C.S(),m=C.me(),cl=C.activeClock(m.id);
  var h=homeBar("Shifts")+'<div class="screen home"><div class="cv-card" style="display:flex;gap:14px;align-items:center"><span class="avatar sq">'+svg(I.pin)+'</span><div style="flex:1"><b>'+(cl?"Clocked in at "+tm(cl.inAt):"Not clocked in")+'</b><p class="s14 muted">'+(cl?esc(C.home(cl.homeId).name)+" · "+(cl.verified?"location verified":cl.manual?"entered without a location match":"location not checked"):"Clock in from the Today tab")+'</p></div>'+(cl?'<button type="button" class="btn sec sm" data-a="clockout">Clock out</button>':'')+'</div>';
  var offers=C.offersFor(m.id);
  if(offers.length)h+='<div class="section-h"><h2>Shifts offered to you</h2></div>'+offers.map(offerCard).join("");
  var mine=[];for(var o=0;o<7;o++){var d=C.dayKey(o);Object.keys(S.schedule).forEach(function(hid){C.SHIFTS.forEach(function(s){var sl=C.slot(hid,d,s.k);if(sl&&sl.staff===m.id)mine.push({hid:hid,d:d,k:s.k})})})}
  h+='<div class="section-h"><h2>Your schedule</h2><span>Next 7 days</span></div>';
  if(!mine.length)h+='<div class="card empty">No shifts scheduled. Your supervisor adds shifts in the Schedule section.</div>';
  else h+='<div class="list card">'+mine.map(function(x){var sd=C.shiftDef(x.k);return '<div class="row"><span class="avatar sq">'+svg(I.cal)+'</span><span class="grow"><b>'+esc(C.dayLabel(x.d)+", "+sd.label)+'</b><span>'+esc(sd.time+" · "+C.home(x.hid).name)+'</span></span><button type="button" class="btn sec sm" data-a="callout" data-h="'+x.hid+'" data-d="'+x.d+'" data-k="'+x.k+'">Can\'t make it</button></div>'}).join("")+'</div>';
  var mc=S.coverage.filter(function(c){return c.calledOut===m.id}).slice(-1)[0];
  if(mc)h+='<div class="callout info">'+lemon(26)+'<div class="body"><span><b>'+(mc.status==="filled"?"Your shift is covered":mc.status==="unfilled"?"Your supervisor is finding cover":"Lomi is finding cover")+'</b> '+esc(C.dayLabel(mc.day)+"'s "+C.shiftDef(mc.shift).label.toLowerCase()+" shift")+(mc.status==="filled"?" will be worked by "+esc(C.firstName(mc.filledBy))+".":". You don't need to call anyone.")+'</span></div></div>';
  return h+'</div>';
};
V.cgMe=function(){var m=C.me(),cl=C.activeClock(m.id);
  return homeBar("Me")+'<div class="screen home"><div class="cv-card" style="display:flex;gap:14px;align-items:center"><span class="avatar" style="width:56px;height:56px;font-size:18px">'+esc(m.ini)+'</span><div><b style="font-size:18px">'+esc(m.name)+'</b><p class="muted s14">Direct support professional</p></div></div>'+
   '<div class="list card"><div class="row"><span class="grow"><b>Homes</b><span>'+esc(m.homeIds.map(function(h){return C.home(h).name}).join(", ")||"None yet")+'</span></span></div><div class="row"><span class="grow"><b>Shifts this week</b><span>'+pl(C.weeklyShifts(m.id),"shift")+'</span></span></div><div class="row"><span class="grow"><b>Medication certified</b><span>'+(m.medCert?"Yes":"No")+'</span></span></div></div>'+
   (cl?'<button type="button" class="btn sec full" data-a="clockout">Clock out</button>':'')+'<button type="button" class="btn sec full" data-a="signout">Switch user</button></div>';
};
V.dock=function(tab){var m=C.me();function it(k,ico,l,dot){return '<button type="button" data-a="tab" data-v="'+k+'"'+(tab===k?' aria-current="page"':'')+'>'+svg(I[ico])+l+(dot?'<span class="dot"></span>':'')+'</button>'}
  return '<div class="dock"><div class="talkwrap"><button type="button" class="talk" data-a="pick" data-v="lomi">'+lemon(30)+'Talk to Lomi</button></div><nav class="tabs4" aria-label="Main">'+it("today","today","Today")+it("notes","note","Notes")+it("shifts","shifts","Shifts",C.offersFor(m.id).length)+it("me","me","Me")+'</nav></div>'};
V.cgSide=function(screen,tab){var m=C.me(),hid=C.cgHome(),cl=C.activeClock(m.id),off=C.offersFor(m.id).length,u=C.unreadFor(hid);
  function it(k,ico,l,extra,cur){return '<button type="button" data-a="'+(k==="msgs"?"msgs":"tab")+'" data-v="'+k+'"'+(cur?' aria-current="page"':'')+'>'+svg(I[ico],20)+l+(extra||'')+'</button>'}
  return '<aside class="cg-side" aria-label="Main"><span class="wordmark">Guad</span><button type="button" class="talk" data-a="pick" data-v="lomi">'+lemon(28)+'Talk to Lomi</button><nav class="cg-nav">'+
   it("today","today","Today","",(!screen||screen!=="msgs")&&tab==="today")+it("notes","note","Notes","",!screen&&tab==="notes")+it("shifts","shifts","Shifts",off?'<span class="count">'+off+'</span>':'',!screen&&tab==="shifts")+(hid?it("msgs","chat","Messages",u>0?'<span class="count">'+u+'</span>':'',screen==="msgs"):'')+it("me","me","Me","",!screen&&tab==="me")+
   '</nav><div class="cg-me"><span class="avatar sm">'+esc(m.ini)+'</span><div><b class="s14">'+esc(m.name)+'</b><p class="s13 muted">'+(cl?"At "+esc(C.home(cl.homeId).name)+" since "+tm(cl.inAt):"Not clocked in")+'</p></div></div></aside>'};

/* ---------- caregiver: person and records ---------- */
function hKind(k){return {vitals:"Vitals",seizure:"Seizure",appointment:"Visit",illness:"Illness"}[k]}
function hSummary(x){var d=x.data;
  if(x.kind==="vitals")return [d.sys&&d.dia?"BP "+d.sys+"/"+d.dia:"",d.pulse?"Pulse "+d.pulse:"",d.temp?d.temp+"°F":"",d.weight?d.weight+" lb":""].filter(Boolean).join(" · ");
  if(x.kind==="seizure")return [d.duration,d.what].filter(Boolean).join(" · ");
  if(x.kind==="illness")return [d.symptoms,d.contagious==="Yes"?"May be contagious":""].filter(Boolean).join(" · ");
  return [d.provider,d.reason].filter(Boolean).join(" · ")}
V.hKind=hKind;V.hSummary=hSummary;
V.person=function(g){var c=C.client(g.cid),n=C.shiftNote(c.id),md=C.medsDue(c).length,a=C.att(c.id),sm=C.doseSlots(c),goals=c.goals.filter(function(x){return !x.stopped}).length;
  function r(a2,ico,t,s,p){return '<button type="button" class="row" data-a="'+a2+'" data-c="'+c.id+'"><span class="avatar sq">'+svg(I[ico])+'</span><span class="grow"><b>'+t+'</b><span>'+s+'</span></span>'+(p||'<span class="chev">'+svg(I.chev,18)+'</span>')+'</button>'}
  var h=appbar(c.name,C.home(c.homeId).name,"close")+'<div class="screen">'+(c.info?'<div class="cv-card s14 muted">'+esc(c.info)+'</div>':'');
  h+='<div class="section-h"><h2>Today</h2></div><div class="list card">';
  h+=r("note","note","Shift note",!n?(goals?"Includes "+pl(goals,"goal"):"Today's note"):n.status==="returned"?"Sent back by your supervisor":"Signed at "+tm(n.createdAt),!n?pill("due","To do"):n.status==="returned"?pill("bad","Fix"):pill("ok","Done"));
  h+=r("mar","pill","Medications",sm.length?pl(sm.length,"scheduled dose"):"No scheduled doses",sm.length?(md?pill("due",md+" due"):pill("ok","Done")):"");
  h+=r("attend","today","Attendance",a?esc(a.services.join(", ")):"Which services did "+esc(c.first)+" get today?",a?pill("ok","Saved"):pill("due","To do"));
  h+='</div><div class="section-h"><h2>Record</h2></div><div class="list card">'+r("health","heart","Health","Vitals, seizures, illness, visits");
  if(c.behaviors.length)h+=r("beh","wave","Behavior note","Plan: "+esc(c.behaviors.join(", ")));
  h+=r("inc","alert","Report an incident","Falls, injuries, medication errors and more")+'</div><div class="section-h"><h2>About '+esc(c.first)+'</h2></div><div class="list card">'+r("summary","file","Health summary","Allergies, conditions, doctor, guardian")+'</div></div>';
  return h};
V.summary=function(g){var S=C.S(),c=C.client(g.cid),H=c.health||{};
  var rows=[["Allergies",H.allergies],["Conditions",H.conditions],["Diet",H.diet],["Doctor",H.doctor],["Guardian or contact",H.guardian],["Date of birth",H.dob]].filter(function(x){return x[1]});
  var h=appbar("Health summary",c.name,"back2person")+'<div class="screen">'+(rows.length?'<div class="card">'+rows.map(function(x){return '<div class="kv"><span class="lbl">'+x[0]+'</span><span>'+esc(x[1])+'</span></div>'}).join("")+'</div>':'<div class="card empty">No health details added yet.</div>');
  var meds=c.meds.filter(function(m){return !m.stopped});
  h+='<div class="section-h"><h2>Current medications</h2></div>'+(meds.length?'<div class="list card">'+meds.map(function(m){return '<div class="row"><span class="grow"><b>'+esc(m.name)+'</b><span>'+esc(m.dose+" · "+(m.prn?m.prn:timesLabel(m)))+'</span></span></div>'}).join("")+'</div>':'<div class="card empty">None listed.</div>');
  var last=S.health.filter(function(x){return x.clientId===c.id&&x.kind==="vitals"}).slice(-1)[0];
  if(last)h+='<div class="section-h"><h2>Latest vitals</h2></div><div class="cv-card s14">'+esc(hSummary(last))+' · '+dt(last.at)+' '+tm(last.at)+'</div>';
  return h+'</div>'};
V.compose=function(g){var c=C.client(g.cid),beh=g.type==="behavior";
  var h=appbar(c.name,(beh?"Behavior note":"Shift note")+" · "+C.home(c.homeId).name,"back2person")+'<div class="screen flow" style="align-items:center;gap:20px">';
  if(g.thinking)return h+'<div class="orb"><div class="ring1"></div><div class="ring2"></div>'+lemon(104)+'</div><div style="text-align:center"><div class="serif" style="font-size:26px">Lomi is writing your note</div><span class="dots" aria-hidden="true" style="margin-top:10px"><i></i><i></i><i></i></span></div></div>';
  h+='<div class="cv-try"><span class="muted">Try covering:</span>'+(beh?["Before","What happened","Your response","How it ended"]:["Meals","Mood","Goals","Anything unusual"]).map(function(x){return '<span class="cv-tag">'+esc(x)+'</span>'}).join("")+'</div>';
  h+='<div class="orb'+(g.listening?" live":"")+'"><div class="ring1"></div><div class="ring2"></div>'+lemon(104)+'</div><div style="text-align:center;display:flex;flex-direction:column;gap:4px"><span class="serif" style="font-size:26px">'+(g.listening?"Lomi is listening":"Tell Lomi "+(beh?"what happened":"about the shift"))+'</span><span class="muted" style="font-size:15px">'+(g.listening?"Speak naturally":"Tap Speak, or type below")+'</span></div>';
  if(g.listening)h+='<div class="wave" aria-hidden="true">'+[14,28,38,22,32,16,26,36,18,10].map(function(x){return '<span style="height:'+x+'px"></span>'}).join("")+'</div>';
  h+='<div class="cv-card" style="align-self:stretch;display:flex;flex-direction:column;gap:8px"><label for="say" class="cv-lbl">Live transcript</label><textarea id="say" class="say-plain" placeholder="Talk the way you would to a coworker at shift change…">'+esc(g.text||"")+'</textarea></div>';
  h+='<button type="button" class="textbtn" data-a="manual">Write it myself instead</button>'+errLine(g.err);
  var canMic=!!(global.MediaRecorder&&global.navigator&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
  return h+'</div><div class="actionbar">'+(canMic?'<button type="button" class="btn sec" data-a="mic">'+(g.listening?"Pause":"Speak")+'</button>':'')+'<button type="button" class="btn" data-a="draft">Done, write my note</button></div>'};
function flagCall(f,i){return '<div class="cv-flag"><div style="display:flex;gap:8px;align-items:flex-start"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A4510" stroke-width="2.2" stroke-linecap="round" style="flex:none;margin-top:2px" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg><span>'+esc(f.tip||("“"+f.phrase+"” is vague. Describe what you saw."))+'</span></div><div style="display:flex;gap:8px;align-items:center"><button type="button" class="cv-pillbtn warn" data-a="fixflag" data-i="'+i+'">Fix it</button><button type="button" class="textbtn" data-a="dropflag" data-i="'+i+'">Keep as is</button></div></div>'}
function goalBlock(g,go,r){var open=g.picker===go.id||(!r.trials.length&&!r.na);
  var check='<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" style="flex:none;margin-top:3px"><circle cx="10" cy="10" r="10" fill="var(--sky)"/><path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if(!open&&!r.na)return '<div class="cv-goal"><div style="display:flex;gap:8px;align-items:flex-start;flex:1">'+check+'<span>'+esc(go.text)+': '+esc(r.trials.map(function(t){return C.SHORT[t]}).join(", ").toLowerCase())+' <span class="muted s13">('+C.score(r.trials)+')</span></span></div><button type="button" class="textbtn" data-a="openpicker" data-g="'+go.id+'">Edit</button></div>';
  if(r.na)return '<div class="cv-goal"><div style="display:flex;flex-direction:column;gap:8px;flex:1"><b class="s14">'+esc(go.text)+': not attempted</b><input class="input" aria-label="Reason" data-reason="'+go.id+'" value="'+esc(r.reason)+'" placeholder="Why? For example: out at a family visit"><button type="button" class="textbtn" style="align-self:flex-start" data-a="na" data-g="'+go.id+'">Record attempts instead</button></div></div>';
  return '<div class="cv-goal"><div style="display:flex;flex-direction:column;gap:8px;flex:1"><b class="s14">'+esc(go.text)+'</b>'+(r.trials.length?'<div class="trials">'+r.trials.map(function(t,i){return '<span class="trial'+(t==="Independent"?" ind":t==="Refused"?" ref":"")+'">'+(i+1)+'. '+esc(C.SHORT[t])+'<button type="button" aria-label="Remove attempt '+(i+1)+'" data-a="rmtrial" data-g="'+go.id+'" data-i="'+i+'">×</button></span>'}).join("")+'</div>':'')+
   '<span class="s13 muted">Tap the prompt level for '+(r.trials.length?"another":"each")+' attempt</span><div class="levels">'+C.LEVELS.map(function(l){return '<button type="button" data-a="addtrial" data-g="'+go.id+'" data-v="'+l+'">'+C.SHORT[l]+'</button>'}).join("")+'</div><div style="display:flex;gap:14px">'+(r.trials.length?'<button type="button" class="textbtn" data-a="closepicker">Done</button>':'')+'<button type="button" class="textbtn" data-a="na" data-g="'+go.id+'">Not attempted</button></div></div></div>'}
V.review=function(g){var c=C.client(g.cid),d=g.draft,beh=g.type==="behavior";
  var h=appbar(g.editing?"Fix your note":g.fromLomi?"Review Lomi's draft":"Write your note",c.name+" · "+(beh?"Behavior note":"Shift note")+" · "+dt(C.now()),"back2person")+'<div class="screen flow" style="gap:12px">';
  if(g.fromLomi)h+='<div>'+pill("due","Drafted with Lomi")+'</div>';
  if(g.editing&&g.comment)h+='<div class="cv-flag" style="background:var(--bad-bg);border-color:color-mix(in srgb,var(--bad) 30%,transparent)"><span><b>Supervisor:</b> '+esc(g.comment)+'</span></div>';
  if(g.fallback)h+='<div class="cv-flag"><span>Lomi wasn\'t available, so this draft was sorted by simple rules. Check each section carefully.</span></div>';
  h+='<div class="cv-card cv-note">';
  if(beh)h+='<div><div class="cv-lbl">Behavior</div>'+choice('data-a="btype"',c.behaviors.concat(["Other"]),d.behaviorType)+'</div>';
  (beh?[["before","What happened right before"],["behavior","What "+c.first+" did"],["response","How staff responded"],["outcome","How it ended"],["duration","How long it lasted"]]:[["activities","Activities"],["meals","Meals"],["mood","Mood"],["health","Health and safety"]]).forEach(function(x){
    var flagged=(d.flags||[]).some(function(f){return !f.dismissed&&d[x[0]]&&d[x[0]].toLowerCase().indexOf(f.phrase.toLowerCase())>=0});
    h+='<div><label class="cv-lbl" for="f-'+x[0]+'">'+x[1]+'</label><textarea id="f-'+x[0]+'" data-f="'+x[0]+'" rows="1" class="cv-text'+(flagged?" flagged":"")+'" placeholder="Nothing to note">'+esc(d[x[0]])+'</textarea></div>'});
  var goals=c.goals.filter(function(x){return !x.stopped});
  if(!beh&&goals.length)h+='<div><div class="cv-lbl">Goals</div><div style="display:flex;flex-direction:column;gap:6px">'+goals.map(function(go){return goalBlock(g,go,byId(d.goals,go.id))}).join("")+'</div></div>';
  h+='</div>';
  (d.flags||[]).forEach(function(f,i){if(!f.dismissed)h+=flagCall(f,i)});
  if(d.incident&&d.incident.detected&&!d.incident.handled)h+='<div class="cv-inc"><span><b>You mentioned: '+esc(d.incident.summary)+'</b> File an incident report? Your supervisor will be notified.</span><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="cv-pillbtn blue" data-a="fileinc">File report</button><button type="button" class="cv-pillbtn" data-a="noinc">Not an incident</button></div></div>';
  return h+errLine(g.err)+'</div><div class="actionbar" style="flex-direction:column;gap:10px"><p class="s13 muted" style="text-align:center;margin:0">You review and sign every note. Lomi never submits for you.</p><div style="display:flex;gap:10px"><button type="button" class="btn sec" data-a="editfirst">Edit</button><button type="button" class="btn" style="flex:1" data-a="sign">'+(g.editing?"Sign and resubmit":"Sign and submit")+'</button></div></div>'};
V.mar=function(g){var S=C.S(),c=C.client(g.cid),h=appbar("Medications",c.name,"back2person")+'<div class="screen">',sm=C.doseSlots(c),prn=c.meds.filter(function(m){return m.prn&&!m.stopped});
  if(!sm.length&&!prn.length)return h+'<div class="card empty">No medications listed for '+esc(c.first)+'.</div></div>';
  h+='<div class="callout warn s14">'+svg(I.info,20)+'<div class="body">Check the right person, medication, dose, time and route against the label before giving.</div></div>';
  if(sm.length)h+='<div class="section-h"><h2>Scheduled today</h2></div>';
  // One card per dose slot, so a twice-daily medication is recorded twice.
  sm.forEach(function(d){var m=d.m,r=C.marFor(c.id,m.id,d.slot);
    h+='<div class="cv-card" style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><b style="font-size:17px">'+esc(m.name)+'</b><p class="s14 muted">'+esc(m.dose+" · "+m.route+" · "+t12(d.slot)+(m.note?" · "+m.note:""))+'</p></div>'+(r?marPill(r):pill("due","Due"))+'</div>';
    h+=r?'<p class="s14 muted">'+(r.status==="given"?"Given":"Recorded")+' at '+tm(r.at)+' by '+esc(r.by)+(r.reason?' · '+esc(r.reason):'')+'</p>':'<button type="button" class="btn full" data-a="give" data-m="'+m.id+'" data-s="'+d.slot+'">'+svg(I.check,20)+'Mark as given</button><div class="grid2"><button type="button" class="btn sec sm" data-a="notgiven" data-m="'+m.id+'" data-s="'+d.slot+'" data-v="refused">Refused</button><button type="button" class="btn sec sm" data-a="notgiven" data-m="'+m.id+'" data-s="'+d.slot+'" data-v="held">Held</button></div>';
    h+='</div>'});
  if(prn.length){h+='<div class="section-h"><h2>As needed</h2></div>';prn.forEach(function(m){var last=S.mar.filter(function(r){return r.prn&&r.medId===m.id&&r.clientId===c.id&&r.day===C.dayKey(0)}).slice(-1)[0];
    h+='<div class="cv-card" style="display:flex;flex-direction:column;gap:12px"><div><b style="font-size:17px">'+esc(m.name)+'</b><p class="s14 muted">'+esc(m.dose+" · "+m.prn)+'</p></div>'+(last?'<p class="s14">Given at '+tm(last.at)+' for: '+esc(last.reason)+(last.effect?'<br><span class="muted">Effect: '+esc(last.effect)+'</span>':'')+'</p>'+(last.effect?'':'<button type="button" class="btn sec sm" style="align-self:flex-start" data-a="prneffect" data-n="'+last.id+'">Record whether it helped</button>'):'')+'<button type="button" class="btn sec full" data-a="prngive" data-m="'+m.id+'">Give as needed</button></div>'})}
  return h+'</div>'};
V.health=function(g){var S=C.S(),c=C.client(g.cid),k=g.kind||"vitals";
  function f(id,l,attrs,unit){return '<div class="field"><label for="h-'+id+'">'+l+'</label>'+(unit?'<div class="unit">':'')+'<input class="input" id="h-'+id+'" data-h="'+id+'" '+attrs+'>'+(unit?'<em>'+unit+'</em></div>':'')+'</div>'}
  function ta(id,l,ph){return '<div class="field"><label for="h-'+id+'">'+l+'</label><textarea class="input" id="h-'+id+'" data-h="'+id+'" placeholder="'+ph+'"></textarea></div>'}
  var h=appbar("Health",c.name,"back2person")+'<div class="screen flow"><div class="seg" role="group" aria-label="What are you recording?">'+[["vitals","Vitals"],["seizure","Seizure"],["illness","Illness"],["appointment","Visit"]].map(function(t){return '<button type="button" data-a="hkind" data-v="'+t[0]+'" aria-pressed="'+(k===t[0])+'">'+t[1]+'</button>'}).join("")+'</div><div class="cv-card fieldset">';
  if(k==="vitals")h+='<div class="grid2">'+f("sys","Blood pressure, top",'type="number" inputmode="numeric"',"mmHg")+f("dia","Blood pressure, bottom",'type="number" inputmode="numeric"',"mmHg")+f("pulse","Pulse",'type="number" inputmode="numeric"',"bpm")+f("temp","Temperature",'type="number" step="0.1" inputmode="decimal"',"°F")+'</div>'+f("weight","Weight",'type="number" step="0.1" inputmode="decimal"',"lb");
  if(k==="seizure")h+='<div class="grid2">'+f("start","Started at",'type="time"')+f("duration","Lasted",'type="text" placeholder="About 2 minutes"')+'</div>'+ta("what","What you saw","Describe exactly what you observed")+ta("after","Afterwards","How they were after")+ta("action","What you did","Steps you took from the seizure protocol");
  if(k==="illness")h+=ta("symptoms","Symptoms","What you noticed")+f("began","Started",'type="text" placeholder="This morning"')+'<div class="field"><label for="h-contagious">Might it spread to others?</label><select class="input" id="h-contagious" data-h="contagious"><option>Not sure</option><option>Yes</option><option>No</option></select></div>'+ta("action","What you did","Who you told and what you did");
  if(k==="appointment")h+=f("date","Date",'type="date"')+f("provider","With",'type="text"')+f("reason","Reason",'type="text"')+ta("outcome","Outcome and follow-up","What the provider said and any next steps");
  h+='</div>'+errLine(g.err);
  var past=S.health.filter(function(x){return x.clientId===c.id}).slice(-3).reverse();
  if(past.length)h+='<div class="section-h"><h2>Recent</h2></div><div class="list card">'+past.map(function(x){return '<div class="row"><span class="grow"><b>'+esc(hKind(x.kind)+" · "+dt(x.at)+" "+tm(x.at))+'</b><span>'+esc(hSummary(x))+'</span></span>'+(x.flags.length?pill("bad","Alert"):'')+'</div>'}).join("")+'</div>';
  return h+'</div><div class="actionbar"><button type="button" class="btn" data-a="hsave">Save '+hKind(k).toLowerCase()+'</button></div>'};
V.incident=function(g){var c=C.client(g.cid),f=g.inc,st=g.step||1;
  var h=appbar("Incident report",c.name+" · Step "+st+" of 3","incback")+'<div class="screen flow"><div class="cv-bar" aria-hidden="true"><i style="width:'+(st/3*100)+'%"></i></div><div class="cv-card fieldset">';
  if(st===1)h+='<div class="field"><span class="lbl">What kind of incident?</span>'+choice('data-a="ipick" data-k="type"',["Fall","Injury","Seizure","Medication error","Left without staff","Behavior with harm","Property damage","Other"],f.type)+'</div><div class="grid2"><div class="field"><label for="i-time">Time</label><input class="input" type="time" id="i-time" data-i="time" value="'+esc(f.time)+'"></div><div class="field"><label for="i-where">Where</label><select class="input" id="i-where" data-i="where">'+["Bedroom","Bathroom","Kitchen","Living room","Outside","Community","Vehicle","Other"].map(function(x){return '<option'+(x===f.where?" selected":"")+'>'+x+'</option>'}).join("")+'</select></div></div><div class="field"><label for="i-what">What happened</label><textarea class="input" id="i-what" data-i="what" placeholder="Describe only what you saw or heard">'+esc(f.what)+'</textarea></div><div class="field"><label for="i-before">What happened right before</label><textarea class="input" id="i-before" data-i="before" style="min-height:70px">'+esc(f.before)+'</textarea></div>';
  else if(st===2)h+='<div class="field"><span class="lbl">Any injury?</span>'+choice('data-a="ipick" data-k="injured"',["No injury seen","Yes","Not checked yet"],f.injured)+'</div>'+(f.injured==="Yes"?'<div class="field"><label for="i-injury">Describe the injury</label><textarea class="input" id="i-injury" data-i="injury" placeholder="Where on the body, size, color, any bleeding">'+esc(f.injury)+'</textarea></div>':'')+'<div class="field"><label for="i-action">What you did</label><textarea class="input" id="i-action" data-i="action">'+esc(f.action)+'</textarea></div><div class="field"><span class="lbl">Medical follow-up</span>'+choice('data-a="ipick" data-k="medical"',["None needed","Nurse to check","Doctor visit","Emergency care"],f.medical)+'</div><div class="field"><label for="i-wit">Witnesses</label><input class="input" id="i-wit" data-i="witnesses" value="'+esc(f.witnesses)+'"></div>';
  else h+='<div class="field"><span class="lbl">How serious was it?</span>'+choice('data-a="ipick" data-k="severity"',["Low","Medium","High"],f.severity)+'</div><div class="field"><span class="lbl">Who needs to be told</span><p class="s13 muted" style="margin-top:-2px">Check anyone you\'ve already told.</p><div style="display:flex;flex-direction:column;gap:8px">'+C.notifRules(f.severity,f.type).map(function(x){return '<label class="check"><input type="checkbox" data-notify="'+x.who+'"'+(f.notified.indexOf(x.who)>=0?" checked":"")+'><span style="flex:1">'+x.who+'</span><span class="s13 muted">'+x.when+'</span></label>'}).join("")+'</div></div>';
  return h+'</div>'+errLine(g.err)+'</div><div class="actionbar">'+(st>1?'<button type="button" class="btn sec" data-a="istep" data-v="'+(st-1)+'">Back</button>':'')+(st<3?'<button type="button" class="btn" data-a="istep" data-v="'+(st+1)+'">Next</button>':'<button type="button" class="btn" data-a="subinc">Submit report</button>')+'</div>'};
V.msgs=function(hid,back,mine){var S=C.S(),hm=C.home(hid),list=S.msgs.filter(function(m){return m.homeId===hid});
  return (back?appbar(hm.name+" team","Staff, supervisors and Lomi",back):'')+'<div class="msgs">'+(list.length?list.map(function(m){var me=m.from===mine,lo=m.from==="Lomi";return '<div class="msg '+(me?"me":lo?"lomi":"them")+'"><div class="who">'+esc(m.from)+' · '+dt(m.at)+' '+tm(m.at)+'</div>'+esc(m.text)+'</div>'}).join(""):'<p class="muted s14" style="text-align:center">No messages yet.</p>')+'</div><div class="composer"'+(back?' style="position:sticky;bottom:0"':'')+'><label class="sr" for="mtext">Message</label><input class="input" id="mtext" placeholder="Message the '+esc(hm.name)+' team"><button type="button" class="btn sm" data-a="send" data-h="'+hid+'" aria-label="Send">'+svg(I.send,18)+'</button></div>'};
V.done=function(g){var c=C.client(g.cid);return '<header class="appbar"></header><div class="screen"><div class="lomi-stage" style="padding-top:50px"><div class="done-mark"><span style="color:var(--ok)">'+svg(I.check,36)+'</span></div><h1 class="serif" style="font-size:30px">'+esc(g.msg)+'</h1><p class="muted">'+esc(g.sub||"Your supervisor can see it now.")+'</p></div><button type="button" class="btn full" data-a="close">Back to today</button>'+(c?'<button type="button" class="btn sec full" data-a="person" data-c="'+c.id+'">More for '+esc(c.first)+'</button>':'')+'</div>'};
V.sheet=function(sh,g){if(!sh)return"";var h='<div class="scrim" data-a="sheetclose"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t"><div class="grab"></div>',e=sh.err?'<p class="s14" style="color:var(--bad)" role="alert">'+esc(sh.err)+'</p>':'';
  if(sh.kind==="pick"){var list=C.clientsIn(C.cgHome()).filter(function(c){return sh.v!=="behavior"||c.behaviors.length});
    h+='<h2 id="sh-t">'+(sh.v==="lomi"?"Who is this note about?":sh.v==="behavior"?"Behavior note for…":"Incident involving…")+'</h2>'+(list.length?'<div class="list card">'+list.map(function(c){return '<button type="button" class="row" data-a="'+(sh.v==="behavior"?"beh":sh.v==="incident"?"inc":"note")+'" data-c="'+c.id+'"><span class="avatar">'+esc(c.ini)+'</span><span class="grow"><b>'+esc(c.name)+'</b></span><span class="chev">'+svg(I.chev,18)+'</span></button>'}).join("")+'</div>':'<p class="muted">No one has been added to this home yet.</p>')}
  if(sh.kind==="sign")h+='<h2 id="sh-t">Sign this note?</h2><p class="muted s14" style="margin-top:-6px">Once signed, it goes to your supervisor. Later changes are saved as amendments.</p><label class="check"><input type="checkbox" id="attest"> I confirm this note is accurate and based on what I saw during my shift.</label>'+e+'<button type="button" class="btn full" data-a="signconfirm">Sign as '+esc(C.me().name)+'</button><button type="button" class="btn sec full" data-a="sheetclose">Keep editing</button>';
  if(sh.kind==="reason"){var m=byId(C.client(g.cid).meds,sh.mid);h+='<h2 id="sh-t">'+(sh.v==="refused"?"Refused":"Held")+': '+esc(m.name+(sh.slot?" ("+t12(sh.slot)+" dose)":""))+'</h2><div class="field"><label for="why">'+(sh.v==="refused"?"What happened when you offered it?":"Why was it held?")+'</label><textarea class="input" id="why"></textarea></div>'+e+'<p class="s13 faint">Your supervisor will be alerted.</p><button type="button" class="btn full" data-a="reasonsave">Save</button><button type="button" class="btn sec full" data-a="sheetclose">Cancel</button>'}
  if(sh.kind==="prn"){var m2=byId(C.client(g.cid).meds,sh.mid);h+='<h2 id="sh-t">Give '+esc(m2.name)+'</h2><p class="s14 muted" style="margin-top:-6px">'+esc(m2.prn)+'</p><div class="field"><label for="prnwhy">Why is it needed?</label><textarea class="input" id="prnwhy"></textarea></div>'+e+'<button type="button" class="btn full" data-a="prnsave">Record as given</button><button type="button" class="btn sec full" data-a="sheetclose">Cancel</button>'}
  if(sh.kind==="effect")h+='<h2 id="sh-t">Did it help?</h2>'+choice('data-a="effect"',["Symptoms went away","Helped some","No change","Got worse"],"")+'<button type="button" class="btn sec full" data-a="sheetclose">Cancel</button>';
  if(sh.kind==="attend"){var c=C.client(g.cid),cur=(C.att(c.id)||{services:[]}).services;h+='<h2 id="sh-t">'+esc(c.first)+'\'s services today</h2><div style="display:flex;flex-direction:column;gap:8px">'+C.SERVICES.map(function(s){return '<label class="check"><input type="checkbox" data-svc="'+esc(s)+'"'+(cur.indexOf(s)>=0?" checked":"")+'>'+esc(s)+'</label>'}).join("")+'</div>'+e+'<button type="button" class="btn full" data-a="attendsave">Save attendance</button>'}
  if(sh.kind==="callout")h+='<h2 id="sh-t">Can\'t make '+esc(C.dayLabel(sh.d).toLowerCase())+'\'s shift?</h2><p class="s14 muted" style="margin-top:-6px">Lomi will offer it to eligible coworkers right away.</p>'+choice('data-a="coreason"',["Sick","Family emergency","Transportation","Other"],sh.reason||"")+e+'<button type="button" class="btn full" data-a="calloutgo">Let Lomi find cover</button><button type="button" class="btn sec full" data-a="sheetclose">Keep my shift</button>';
  if(sh.html)h+=sh.html;
  return h+'</div></div>'};
})(window);

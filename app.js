"use strict";
/* Jimny maršruta lapa — atsevišķa lietotne (PWA). Dati glabājas telefonā (IndexedDB). */
const MON_NOM=["janvāris","februāris","marts","aprīlis","maijs","jūnijs","jūlijs","augusts","septembris","oktobris","novembris","decembris"];
const MON_ACC=["janvāri","februāri","martu","aprīli","maiju","jūniju","jūliju","augustu","septembri","oktobri","novembri","decembri"];
const MON_LOC=["janvārī","februārī","martā","aprīlī","maijā","jūnijā","jūlijā","augustā","septembrī","oktobrī","novembrī","decembrī"];
const WD=["Sv","P","O","T","C","Pk","S"];
const VEH=new Set(["IN_PASSENGER_VEHICLE","IN_VEHICLE","IN_CAR","DRIVING","DRIVE"]);
const DEF={uznemums:"SIA Lauku mērnieks",auto:"Suzuki Jimny, NM-9109",norma:7.9,majas:{lat:null,lon:null},darbs:{lat:null,lon:null},sakuma:{menesis:"",l:null,eur:null}};
const S={settings:{...DEF},days:{},fuels:{},months:{},month:null,loaded:false};

const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const hm=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const lvDate=s=>`${s.slice(8,10)}.${s.slice(5,7)}.${s.slice(0,4)}.`;
const num=v=>{if(v===null||v===undefined||v==="")return null;const n=parseFloat(String(v).replace(/\s/g,"").replace(",","."));return isFinite(n)?n:null};
const r2=n=>Math.round(n*100)/100;
const fmt=(n,d=0)=>n===null||n===undefined||!isFinite(n)?"—":n.toLocaleString("lv-LV",{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function toast(t){const e=$("toast");e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,3500)}
function banner(html,bad){const b=$("banner");if(!html){b.hidden=true;return}b.className="banner"+(bad?" bad":"");b.innerHTML=html;b.hidden=false}

/* ---------- vide: instalēta lietotne / pārlūks / iebūvēts pārlūks ---------- */
const ENV={standalone:matchMedia("(display-mode: standalone)").matches||navigator.standalone===true,
  webview:/; wv\)|FBAN|FBAV|Instagram|GSA\//.test(navigator.userAgent),
  browser:(()=>{const u=navigator.userAgent;return /SamsungBrowser/.test(u)?"Samsung Internet":/Firefox/.test(u)?"Firefox":/EdgA?\//.test(u)?"Edge":/OPR|Opera/.test(u)?"Opera":/; wv\)/.test(u)?"iebūvēts pārlūks (WebView)":/Chrome/.test(u)?"Chrome":"cits"})()};

/* ---------- IndexedDB ---------- */
const DB={
  db:null,
  open(){return new Promise((res,rej)=>{const r=indexedDB.open("jimny",1);r.onupgradeneeded=()=>{const d=r.result;for(const s of ["kv","days","fuels","photos"])if(!d.objectStoreNames.contains(s))d.createObjectStore(s)};r.onsuccess=()=>{DB.db=r.result;res()};r.onerror=()=>rej(r.error)})},
  tx(store,mode,fn){return new Promise((res,rej)=>{const t=DB.db.transaction(store,mode);const s=t.objectStore(store);const out=fn(s);t.oncomplete=()=>res(out&&out.result!==undefined?out.result:undefined);t.onerror=()=>rej(t.error)})},
  get(store,key){return DB.tx(store,"readonly",s=>s.get(key))},
  put(store,key,val){return DB.tx(store,"readwrite",s=>s.put(val,key))},
  del(store,key){return DB.tx(store,"readwrite",s=>s.delete(key))},
  all(store){return new Promise((res,rej)=>{const t=DB.db.transaction(store,"readonly");const s=t.objectStore(store);const out={};const c=s.openCursor();c.onsuccess=()=>{const cur=c.result;if(cur){out[cur.key]=cur.value;cur.continue()}else res(out)};c.onerror=()=>rej(c.error)})}
};
async function saveDay(date,patch){S.days[date]={...(S.days[date]||{}),...patch,datums:date};render();try{await DB.put("days",date,S.days[date])}catch(e){toast("Neizdevās saglabāt.")}}
async function saveFuel(id,rec){S.fuels[id]=rec;render();try{await DB.put("fuels",id,rec)}catch(e){toast("Neizdevās saglabāt.")}}
async function delFuel(id){delete S.fuels[id];render();await DB.del("fuels",id).catch(()=>{})}
async function delDayPart(date,part){const d={...(S.days[date]||{})};delete d[part];
  if(!d.sakums&&!d.beigas){delete S.days[date];render();await DB.del("days",date).catch(()=>{});return}S.days[date]=d;render();await DB.put("days",date,d).catch(()=>{})}
async function saveMonths(){await DB.put("kv","months",S.months).catch(()=>{})}

/* ---------- geo ---------- */
function hav(a,b){const R=6371,t=Math.PI/180;const dl=(b[0]-a[0])*t,dn=(b[1]-a[1])*t;const h=Math.sin(dl/2)**2+Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function placeName(p){if(!p)return {n:"?",ok:false};let best=null,bs=1e9;for(const g of GAZ){const s=hav(p,[g[1],g[2]])/g[3];if(s<bs){bs=s;best=g}}const d=hav(p,[best[1],best[2]]);return {n:best[0],ok:d<=12}}
function parseLL(s){if(!s)return null;if(typeof s==="object"){if(s.latLng)return parseLL(s.latLng);if("latitudeE7"in s)return [s.latitudeE7/1e7,s.longitudeE7/1e7];return null}const m=String(s).match(/-?\d+(?:\.\d+)?/g);return m&&m.length>=2?[+m[0],+m[1]]:null}

/* ---------- ievades formas ---------- */
function openSheet(html){$("panel").innerHTML=html;$("sheet").hidden=false;const f=$("panel").querySelector("input[autofocus]");if(f)setTimeout(()=>f.focus(),50)}
function closeSheet(){$("sheet").hidden=true;$("panel").innerHTML=""}
$("sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closeSheet()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("sheet").hidden)closeSheet()});
function lastKm(){let best=null;for(const x of Object.values(S.days))for(const p of ["sakums","beigas"])if(x[p]&&x[p].km)best=Math.max(best||0,x[p].km);return best}
function isLastWorkday(d){const x=new Date(d+"T12:00");const m=x.getMonth();const n=new Date(x);do{n.setDate(n.getDate()+1)}while(n.getDay()===0||n.getDay()===6);return n.getMonth()!==m}
const kmField=(v,label,auto)=>`<div class="field wide"><label for="fKm">${label}</label><input id="fKm" inputmode="numeric" pattern="[0-9]*" value="${v??""}"${auto?" autofocus":""} style="font-family:var(--display);font-size:28px;font-weight:600"></div>`;
function startForm(date){const now=new Date();date=date||iso(now);const d=S.days[date]||{};const lk=lastKm();
  openSheet(`<h3>Darba dienas sākums</h3><div class="fgrid"><div class="field"><label for="fDate">Datums</label><input id="fDate" type="date" value="${date}"></div><div class="field"><label for="fTime">Laiks</label><input id="fTime" type="time" value="${d.sakums?.laiks||hm(now)}"></div>${kmField(d.sakums?.km??lk,"Odometrs, km",true)}</div><p class="note" style="margin:0">${lk?`Pēdējais zināmais rādījums: ${fmt(lk)} km.`:""}</p><div class="row"><button class="btn slim primary" id="fSave" type="button">Saglabāt</button><button class="btn slim" id="fCancel" type="button">Atcelt</button></div>`);
  const inp=$("fKm");inp.select&&setTimeout(()=>inp.select(),60);
  $("fCancel").onclick=closeSheet;
  $("fSave").onclick=async()=>{const km=num($("fKm").value);if(!km)return toast("Ievadi odometra rādījumu.");
    const prev=Object.entries(S.days).filter(([k])=>k<$("fDate").value).map(([,x])=>x.beigas?.km||x.sakums?.km||0);const pm=prev.length?Math.max(...prev):0;
    if(pm&&km<pm&&!$("fSave").dataset.c){$("fSave").dataset.c=1;$("fSave").textContent="Mazāk nekā iepriekš — saglabāt tik un tā?";return}
    await saveDay($("fDate").value,{sakums:{laiks:$("fTime").value,km:Math.round(km)}});closeSheet();toast("Diena sākta")}}
function endForm(){const now=new Date(),t=iso(now),d=S.days[t]||{};const last=isLastWorkday(t);
  openSheet(`<h3>Beigt darba dienu</h3><div class="fgrid"><div class="field"><label for="fTime">Laiks</label><input id="fTime" type="time" value="${hm(now)}"></div><div class="field"></div>${kmField(d.beigas?.km,last?"Odometrs, km — mēneša pēdējā darba diena":"Odometrs, km (nav obligāti)",last)}</div><p class="note" style="margin:0">${last?"Šī ir mēneša pēdējā darba diena — ieraksti odometru, lai mēneša atskaite būtu pilna.":"Parasti km nav jāievada: dienas beigas ņem no nākamā rīta rādījuma."}</p><div class="row"><button class="btn slim primary" id="fSave" type="button">Noslēgt dienu</button><button class="btn slim" id="fCancel" type="button">Atcelt</button></div>`);
  $("fCancel").onclick=closeSheet;
  $("fSave").onclick=async()=>{const km=num($("fKm").value);if(last&&!km&&!$("fSave").dataset.c){$("fSave").dataset.c=1;$("fSave").textContent="Noslēgt bez km?";return}
    if(km&&d.sakums&&km<d.sakums.km)return toast("Beigu km nevar būt mazāki par sākuma km.");
    const b={laiks:$("fTime").value};if(km)b.km=Math.round(km);await saveDay(t,{beigas:b});closeSheet();toast("Darba diena noslēgta")}}
function fuelSheet(){const now=new Date();
  openSheet(`<h3>Uzpilde</h3><div class="fgrid"><div class="field"><label for="uDate">Datums</label><input id="uDate" type="date" value="${iso(now)}"></div><div class="field"><label for="uTime">Laiks</label><input id="uTime" type="time" value="${hm(now)}"></div><div class="field"><label for="uL">Litri</label><input id="uL" inputmode="decimal" autofocus style="font-family:var(--display);font-size:24px;font-weight:600"></div><div class="field"><label for="uE">Summa, €</label><input id="uE" inputmode="decimal" style="font-family:var(--display);font-size:24px;font-weight:600"></div><div class="field wide"><label for="uSt">Stacija (nav obligāti)</label><input id="uSt" list="stations"><datalist id="stations"><option>Circle K</option><option>Neste</option><option>Virši</option><option>Viada</option></datalist></div></div><div class="row"><button class="btn slim primary" id="uSave" type="button">Saglabāt</button><button class="btn slim" id="uCancel" type="button">Atcelt</button></div>`);
  $("uCancel").onclick=closeSheet;
  $("uSave").onclick=async()=>{const l=num($("uL").value),e=num($("uE").value);if(!l)return toast("Ievadi litrus.");if(e===null&&!$("uSave").dataset.c){$("uSave").dataset.c=1;$("uSave").textContent="Saglabāt bez summas?";return}
    await saveFuel($("uDate").value+"_"+uid(),{datums:$("uDate").value,laiks:$("uTime").value||"12:00",litri:r2(l),eur:e===null?null:r2(e),stacija:$("uSt").value.trim()});closeSheet();toast("Uzpilde saglabāta")}}

/* ---------- timeline ---------- */
function minus(t,min){const [h,mm]=t.split(":").map(Number);const x=Math.max(0,h*60+mm-min);return pad(Math.floor(x/60))+":"+pad(x%60)}
async function loadTimeline(file){
  toast("Lasu Timeline failu…");
  let data;try{data=JSON.parse(await file.text())}catch(e){return toast("Fails nav derīgs Timeline JSON.")}
  const segs=data.semanticSegments;if(!Array.isArray(segs))return toast("Gaidīju Google Maps Timeline eksportu no Android telefona.");
  const trips=[];
  for(const g of segs){const a=g.activity;if(!a||!g.startTime||!g.startTime.startsWith(S.month))continue;if(!VEH.has(a.topCandidate?.type))continue;
    trips.push({d:g.startTime.slice(0,10),s:g.startTime.slice(11,16),e:(g.endTime||"").slice(11,16),km:(a.distanceMeters||0)/1000,a:parseLL(a.start),b:parseLL(a.end)})}
  trips.sort((p,q)=>(p.d+p.s).localeCompare(q.d+q.s));
  const H=[num(S.settings.majas?.lat),num(S.settings.majas?.lon)];const atHome=t=>H[0]&&t.b&&hav(t.b,H)<=0.3;
  let n=0;
  for(const [date,day] of Object.entries(S.days)){
    if(!date.startsWith(S.month)||!day.sakums)continue;
    const from=day.sakums.laiks||"00:00";let to=day.beigas?.laiks,auto=null;
    if(!to){const dt=trips.filter(t=>t.d===date&&t.s>=minus(from,10));
      const back=dt.find(t=>t.s>="15:00"&&atHome(t))||[...dt].reverse().find(t=>t.e<="20:00"&&atHome(t));
      to=back?back.e:"18:00";auto={laiks:to,avots:back?"Timeline: atgriešanās mājās":"pieņemts 18:00"}}
    const tt=trips.filter(t=>t.d===date&&t.s>=minus(from,10)&&t.s<=to);
    const patch={};if(auto)patch.beigas_auto=auto;
    if(tt.length){const names=[];let sure=true;for(const p of [tt[0].a,...tt.map(t=>t.b)]){const r=placeName(p);sure=sure&&r.ok;if(names[names.length-1]!==r.n)names.push(r.n)}
      Object.assign(patch,{marsruts_auto:names.length===1?names[0]:names.join("-"),tl_km:r2(tt.reduce((s,t)=>s+t.km,0)),tl_drosi:sure});n++}
    if(Object.keys(patch).length)await saveDay(date,patch)}
  toast(n?`Maršruti salikti ${n} dienām`:"Šim mēnesim Timeline failā braucienu darba laikā neatradu.");
}

/* ---------- month ---------- */
const nextDay=(d,n)=>{const x=new Date(d+"T12:00");x.setDate(x.getDate()+n);return iso(x)};
const prevMonth=m=>{const [y,mm]=m.split("-").map(Number);return mm===1?`${y-1}-12`:`${y}-${pad(mm-1)}`};
function opening(month){const prev=S.months[prevMonth(month)];if(prev&&prev.beigu_l!=null)return {l:prev.beigu_l,eur:prev.beigu_eur};
  const so=S.settings.sakuma||{};if(so.menesis===month&&so.l!=null)return {l:num(so.l),eur:num(so.eur)??0};return {l:null,eur:null}}
function compute(month){
  const dates=Object.keys(S.days).filter(d=>d.startsWith(month)).sort();const allDates=Object.keys(S.days).sort();
  const norm=num(S.settings.norma)||7.9;const rows=[],issues=[];const today=iso(new Date());let noRoute=0;
  for(const d of dates){const day=S.days[d];if(!day.sakums&&!day.beigas)continue;
    let D=day.sakums?.km??null,E=day.beigas?.km??null,flag=false;
    const past=month<today.slice(0,7);
    if(past&&!day.beigas&&!day.beigas_auto&&d<today)issues.push(`${lvDate(d)}: diena nav noslēgta — ielādē Timeline failu, un beigas noteiks pēc atgriešanās mājās.`);
    const nx=allDates.find(x=>x>d&&S.days[x].sakums);const nextStart=nx?S.days[nx].sakums.km:null;
    if(D==null){issues.push(`${lvDate(d)}: nav dienas sākuma odometra.`);continue}
    if(E==null){
      if(nextStart!=null&&nextStart>=D&&nx<=nextDay(d,4)){E=nextStart;
        if(day.tl_km){const exp=day.tl_km*1.06,diff=E-D;if(diff-exp>Math.max(15,0.2*exp)){issues.push(`${lvDate(d)}: līdz ${lvDate(nx)} rītam +${fmt(diff)} km, bet darba laikā Timeline rāda ~${fmt(exp)} km. Iespējams, ~${fmt(diff-exp)} km nobraukti ar Jimny ārpus darba — ja tā, ievadi dienas beigu km ar roku.`);flag=true}}}
      else if(day.tl_km){E=Math.round(D+day.tl_km*1.06);issues.push(`${lvDate(d)}: vēl nav nākamā rīta odometra — beigas aprēķinātas no Timeline (${fmt(E)} km).`);flag=true}
      else{if(isLastWorkday(d)&&d<=today)issues.push(`${lvDate(d)}: mēneša pēdējā darba diena bez beigu km — ievadi to (Šodien → Beigt dienu vai ieraksts tabulā).`);else if(past)issues.push(`${lvDate(d)}: nav beigu km — ievadi tos tabulā vai nākamās dienas sākuma rādījumu.`);E=D;flag=past||isLastWorkday(d)}}
    else if(nextStart!=null&&nextStart-E>2)issues.push(`Starp ${lvDate(d)} vakaru (${fmt(E)}) un ${lvDate(nx)} rītu (${fmt(nextStart)}) nobraukti ${fmt(nextStart-E)} km ārpus darba dienas — atskaitē nav iekļauti.`);
    if(E<D){issues.push(`${lvDate(d)}: beigu km mazāki par sākuma km.`);flag=true}
    const route=(day.marsruts||day.marsruts_auto||"").trim();
    if(!route){if(month<iso(new Date()).slice(0,7))issues.push(`${lvDate(d)}: nav maršruta — ielādē Timeline failu vai ieraksti to tabulā.`);else noRoute++;flag=month<iso(new Date()).slice(0,7)}
    else if(day.tl_drosi===false&&!day.marsruts)issues.push(`${lvDate(d)}: kāda pietura ir tālu no zināmām apdzīvotām vietām — pārbaudi maršrutu.`);
    rows.push({d,route,D,E,km:Math.max(0,E-D),fuel:[],flag,norm})}
  const fuels=Object.entries(S.fuels).filter(([,f])=>f.datums&&f.datums.startsWith(month)).sort((a,b)=>(a[1].datums+a[1].laiks).localeCompare(b[1].datums+b[1].laiks));
  for(const [,f] of fuels)if(f.eur==null)issues.push(`Uzpildei ${lvDate(f.datums)} (${fmt(f.litri,2)} l) nav summas eiro — ievadi to, citādi Excel summa būs nepilna.`);
  for(const [id,f] of fuels){let r=rows.find(x=>x.d===f.datums);if(!r){r=[...rows].reverse().find(x=>x.d<=f.datums)||rows[0];if(r)issues.push(`Uzpilde ${lvDate(f.datums)} (${fmt(f.litri,2)} l) dienā bez darba dienas ieraksta — pievienota ${lvDate(r.d)}.`)}if(r)r.fuel.push({...f,id})}
  if(noRoute)issues.push(`Maršruti ${noRoute} dienām tiks salikti mēneša beigās, kad ielādēsi Google Timeline failu.`);
  const op=opening(month);if(op.l==null&&rows.length)issues.unshift("Nav zināms degvielas atlikums mēneša sākumā — ievadi to iestatījumos.");
  let bal=op.l??0,buyL=0,buyE=0,use=0,km=0;
  for(const r of rows){r.buy=r2(r.fuel.reduce((s,f)=>s+f.litri,0));r.use=r2(r.km*r.norm/100);bal=r2(bal-r.use+r.buy);r.bal=bal;buyL+=r.buy;buyE+=r.fuel.reduce((s,f)=>s+(f.eur||0),0);use+=r.use;km+=r.km}
  buyL=r2(buyL);buyE=r2(buyE);use=r2(use);
  const endL=r2((op.l??0)+buyL-use);const endE=buyL>0?r2(endL*buyE/buyL):(op.l?r2(endL*(op.eur||0)/op.l):0);const useE=r2((op.eur||0)+buyE-endE);
  return {rows,issues,op,buyL,buyE,use,useE,endL,endE,km,fuels};
}

/* ---------- Excel modulis: vietējais fails, rezervē CDN ---------- */
let excelP=null;
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>{s.remove();rej(new Error(src))};document.head.appendChild(s)})}
function ensureExcel(){if(typeof ExcelJS!=="undefined")return Promise.resolve();
  if(!excelP)excelP=loadScript("exceljs.min.js").catch(()=>loadScript("https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"))
    .then(()=>{if(typeof ExcelJS==="undefined")throw new Error("nav")}).catch(e=>{excelP=null;throw e});
  return excelP}

/* ---------- Excel ---------- */
async function buildXlsx(month){
  const c=compute(month);const [y,m]=month.split("-").map(Number);const last=new Date(y,m,0).getDate();
  const wb=new ExcelJS.Workbook();wb.calcProperties.fullCalcOnLoad=true;
  const ws=wb.addWorksheet(`${MON_NOM[m-1][0].toUpperCase()+MON_NOM[m-1].slice(1)} ${y}`,{pageSetup:{orientation:"landscape",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:.2,right:.2,top:.2,bottom:.2,header:.1,footer:.1}}});
  const W={A:3,B:10.86,C:37.43,D:11.29,E:10.71,F:9.71,G:8.57,H:9.86,I:8.57,J:9.57};for(const [k,v] of Object.entries(W))ws.getColumn(k).width=v;
  const TNR=(sz,b,i)=>({name:"Times New Roman",size:sz,bold:!!b,italic:!!i});const thin={style:"thin"};const box={top:thin,left:thin,bottom:thin,right:thin};const ctr={horizontal:"center",vertical:"middle",wrapText:true};
  ws.getRow(2).height=15.75;ws.getRow(3).height=9;ws.getRow(4).height=23.25;ws.getRow(5).height=38.25;ws.getRow(6).height=8.25;
  const b2=ws.getCell("B2");b2.value=S.settings.uznemums||DEF.uznemums;b2.font=TNR(12,1,1);
  ws.mergeCells("B4:J4");const b4=ws.getCell("B4");b4.value=`Maršruta lapa un degvielas atskaite par ${MON_ACC[m-1]} ${y}.g. ${S.settings.auto||DEF.auto}`;b4.font=TNR(18,1,1);b4.alignment={horizontal:"center",vertical:"middle"};
  const H=["Datums","Maršruts","Spidometrs dienas sākumā","Spidometrs dienas beigās","Nobrauktie kilometri","Degvielas patēriņš 1/100km ","Degvielas iepirkums (litri)","Degvielas patēriņš (litri)","Atlikums dienas beigās"];
  "BCDEFGHIJ".split("").forEach((col,i)=>{ws.mergeCells(`${col}5:${col}6`);const cl=ws.getCell(`${col}5`);cl.value=H[i];cl.font=TNR(10);cl.alignment=ctr;cl.border=box});
  const d0=7,n=c.rows.length,s=d0+n+3,lastRow=d0+n-1;
  c.rows.forEach((r,i)=>{const R=d0+i;ws.getRow(R).height=Math.max(17.25,13.5*Math.max(1,Math.ceil(r.route.length/45))+4);
    const set=(col,v,o={})=>{const cl=ws.getCell(col+R);cl.value=v;cl.font=TNR(10,o.b);cl.alignment=ctr;cl.border=box;if(o.nf)cl.numFmt=o.nf};
    set("B",lvDate(r.d));set("C",r.route);set("D",r.D,{b:i===0});set("E",r.E,{b:1});set("F",{formula:`E${R}-D${R}`,result:r.km});set("G",r.norm);
    set("H",r.fuel.length?(r.fuel.length===1?r.fuel[0].litri:{formula:r.fuel.map(f=>f.litri).join("+"),result:r.buy}):null,{b:1,nf:"0.00"});
    set("I",{formula:`ROUND(F${R}*G${R}/100,2)`,result:r.use},{b:1,nf:"0.00"});
    set("J",{formula:i===0?`D${s}-I${R}+H${R}`:`J${R-1}-I${R}+H${R}`,result:r.bal},{nf:"0.00"})});
  "BCDEFGHIJ".split("").forEach(col=>{const cl=ws.getCell(col+(d0+n));cl.border=box;cl.font=TNR(10)});
  const h=s-1;ws.getCell("D"+h).value="Litros ";ws.getCell("E"+h).value="Summā ";["D","E"].forEach(k=>{ws.getCell(k+h).font=TNR(11);ws.getCell(k+h).alignment={horizontal:"center"}});
  const lab=["Degvielas atlikums uz mēneša sākumu","Iepirktā degviela","Patērētā degviela","Degvielas atlikums uz mēneša beigām"];
  const peach={type:"pattern",pattern:"solid",fgColor:{argb:"FFFBE5D6"}},green={type:"pattern",pattern:"solid",fgColor:{argb:"FFE2EFDA"}};
  lab.forEach((t,i)=>{const R=s+i;const C=ws.getCell("C"+R);C.value=t;C.font=TNR(10,i===0||i===3);C.alignment={horizontal:"right",vertical:"middle",wrapText:true};C.border=box;
    ["D","E"].forEach(k=>{const cl=ws.getCell(k+R);cl.font=TNR(10,i===0);cl.alignment=ctr;cl.border=box;cl.numFmt="0.00"})});
  ws.getCell("D"+s).value=c.op.l;ws.getCell("E"+s).value=c.op.eur??0;ws.getCell("D"+s).fill=peach;
  ws.getCell("D"+(s+1)).value={formula:`SUM(H${d0}:H${d0+n})`,result:c.buyL};
  ws.getCell("E"+(s+1)).value=c.fuels.length?{formula:c.fuels.map(([,f])=>(f.eur||0).toFixed(2)).join("+"),result:c.buyE}:0;
  ws.getCell("D"+(s+2)).value={formula:`SUM(I${d0}:I${d0+n})`,result:c.use};
  ws.getCell("E"+(s+2)).value={formula:`E${s}+E${s+1}-E${s+3}`,result:c.useE};
  ws.getCell("D"+(s+3)).value={formula:`J${lastRow}`,result:c.endL};ws.getCell("D"+(s+3)).fill=green;
  ws.getCell("E"+(s+3)).value={formula:`IF(D${s+1}>0,ROUND(D${s+3}*E${s+1}/D${s+1},2),IF(D${s}>0,ROUND(D${s+3}*E${s}/D${s},2),0))`,result:c.endE};
  ws.mergeCells(`I${s+2}:K${s+2}`);const dt=ws.getCell("I"+(s+2));dt.value=`Datums ${pad(last)}.${pad(m)}.${y}.`;dt.font=TNR(12,0,1);dt.alignment={horizontal:"left",vertical:"middle"};
  ws.pageSetup.printArea=`A1:K${s+3}`;
  return {blob:new Blob([await wb.xlsx.writeBuffer()],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),name:`DEGVIELAS_atskaite_${pad(m)}_${y}_Jymni.xlsx`,c};
}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
async function shareOrDownload(blob,name,title){const file=new File([blob],name,{type:blob.type});
  openSheet(`<h3>${esc(title)}</h3><p class="note" style="margin:0">${esc(name)}</p><div class="row"><button class="btn slim primary" id="xDl" type="button">Saglabāt telefonā</button>${navigator.canShare&&navigator.canShare({files:[file]})?'<button class="btn slim" id="xSh" type="button">Kopīgot (e-pasts, Drive…)</button>':""}<button class="btn slim" id="xCl" type="button">Aizvērt</button></div>`);
  $("xDl").onclick=()=>{downloadBlob(blob,name);toast("Saglabāts mapē Lejupielādes")};
  if($("xSh"))$("xSh").onclick=async()=>{try{await navigator.share({files:[file],title:name})}catch(e){}};
  $("xCl").onclick=closeSheet}
async function exportXlsx(){
  try{await ensureExcel()}catch(e){return toast("Neizdevās ielādēt Excel moduli — pārbaudi, vai GitHub ir fails exceljs.min.js, vai pieslēdz internetu.")}
  const c0=compute(S.month);if(!c0.rows.length)return toast("Šim mēnesim nav ierakstu.");
  if(c0.op.l==null)return toast("Vispirms iestatījumos ievadi atlikumu mēneša sākumā.");
  const {blob,name,c}=await buildXlsx(S.month);
  S.months[S.month]={beigu_l:c.endL,beigu_eur:c.endE,izveidots:new Date().toISOString()};await saveMonths();
  shareOrDownload(blob,name,"Excel atskaite gatava");render()}

/* ---------- gada pārskats ---------- */
function yearData(y){const out=[];for(let m=1;m<=12;m++){const mk=`${y}-${pad(m)}`;const c=compute(mk);const days=c.rows.length;
  out.push({m,mk,days,km:c.km,buyL:c.buyL,buyE:c.buyE,use:c.use,useE:c.op.l==null?null:c.useE,avg:days?c.km/days:null,per100:c.km&&c.op.l!=null?c.useE/c.km*100:null})}return out}
function renderYear(){if(!S.year)S.year=new Date().getFullYear();$("yTitle").textContent=S.year+". gads";const Y=yearData(S.year);
  const tk=Y.reduce((s,x)=>s+x.km,0),td=Y.reduce((s,x)=>s+x.days,0),te=Y.reduce((s,x)=>s+x.buyE,0);
  $("yKm").textContent=fmt(tk);$("yDays").textContent=fmt(td);$("yEur").textContent=fmt(te,2);$("yAvg").textContent=td?fmt(tk/td):"—";
  const mx=Math.max(1,...Y.map(x=>x.km));const W=380,Hh=140,bw=W/12;const cs=getComputedStyle(document.documentElement);
  let svg=`<svg viewBox="0 0 ${W} ${Hh+26}" width="100%" role="img" aria-label="Nobraukums pa mēnešiem" style="display:block">`;
  for(const g of [0.5,1]){const yy=Hh-g*Hh*0.9;svg+=`<line x1="0" x2="${W}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/><text x="2" y="${yy-3}" font-size="10" fill="var(--muted)">${fmt(mx*g)}</text>`}
  Y.forEach((x,i)=>{const h=x.km/mx*Hh*0.9;const X=i*bw+bw*0.18;svg+=`<rect x="${X}" y="${Hh-h}" width="${bw*0.64}" height="${Math.max(h,0)}" rx="3" fill="${x.mk===S.month?"var(--needle)":"var(--ink)"}" opacity="${x.km?1:0.15}"><title>${MON_NOM[i]}: ${fmt(x.km)} km</title></rect>`;
    if(x.km)svg+=`<text x="${X+bw*0.32}" y="${Hh-h-4}" font-size="10" text-anchor="middle" fill="var(--ink)">${fmt(x.km)}</text>`;
    svg+=`<text x="${X+bw*0.32}" y="${Hh+16}" font-size="11" text-anchor="middle" fill="var(--muted)">${MON_NOM[i].slice(0,3)}</text>`});
  $("yChart").innerHTML=svg+"</svg>";
  $("yBody").innerHTML=Y.filter(x=>x.days||x.buyL).map(x=>`<tr><td><a href="#menesis" data-m="${x.mk}" style="color:inherit">${MON_NOM[x.m-1]}</a></td><td>${x.days}</td><td>${fmt(x.km)}</td><td>${x.avg==null?"—":fmt(x.avg)}</td><td>${fmt(x.buyL,2)}</td><td>${fmt(x.buyE,2)}</td><td>${fmt(x.use,2)}</td><td>${x.per100==null?"—":fmt(x.per100,2)}</td></tr>`).join("")||`<tr><td colspan="8"><span class="empty">Šajā gadā vēl nav ierakstu.</span></td></tr>`;
  $("yBody").querySelectorAll("a[data-m]").forEach(a=>a.onclick=()=>{S.month=a.dataset.m})}
async function exportYear(){try{await ensureExcel()}catch(e){return toast("Neizdevās ielādēt Excel moduli — pieslēdz internetu un mēģini vēlreiz.")}const y=S.year;const Y=yearData(y);
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet(`Pārskats ${y}`);const TNR=(b)=>({name:"Times New Roman",size:11,bold:!!b});const thin={style:"thin"};const box={top:thin,left:thin,bottom:thin,right:thin};
  ws.getCell("B2").value=S.settings.uznemums;ws.getCell("B2").font={name:"Times New Roman",size:12,bold:true,italic:true};
  ws.getCell("B4").value=`Jimny nobraukuma un degvielas pārskats ${y}.g. ${S.settings.auto}`;ws.getCell("B4").font={name:"Times New Roman",size:16,bold:true,italic:true};
  const H=["Mēnesis","Darba dienas","Nobraukts, km","Vidēji km dienā","Iepirkts, l","Iepirkts, €","Patērēts, l","Patērēts, €","€ uz 100 km"];
  const widths=[14,10,12,12,11,11,11,11,11];H.forEach((h,i)=>{const c=ws.getCell(6,2+i);c.value=h;c.font=TNR(1);c.alignment={horizontal:"center",vertical:"middle",wrapText:true};c.border=box;ws.getColumn(2+i).width=widths[i]});ws.getRow(6).height=32;ws.getColumn(1).width=3;
  Y.forEach((x,i)=>{const R=7+i;const v=[MON_NOM[i][0].toUpperCase()+MON_NOM[i].slice(1),x.days,x.km,{formula:`IF(C${R}>0,D${R}/C${R},0)`},x.buyL,x.buyE,x.use,x.useE??0,{formula:`IF(D${R}>0,I${R}/D${R}*100,0)`}];
    v.forEach((val,k)=>{const c=ws.getCell(R,2+k);c.value=val;c.font=TNR(0);c.border=box;c.alignment={horizontal:k?"right":"left"};if(k>=3)c.numFmt="0.00"})});
  const T=19;ws.getCell(T,2).value="Kopā";["C","D","F","G","H","I"].forEach(col=>ws.getCell(`${col}${T}`).value={formula:`SUM(${col}7:${col}18)`});ws.getCell(`E${T}`).value={formula:`IF(C${T}>0,D${T}/C${T},0)`};ws.getCell(`J${T}`).value={formula:`IF(D${T}>0,I${T}/D${T}*100,0)`};
  for(let k=2;k<=10;k++){const c=ws.getCell(T,k);c.font=TNR(1);c.border=box;if(k>=5)c.numFmt="0.00"}
  wb.calcProperties.fullCalcOnLoad=true;const blob=new Blob([await wb.xlsx.writeBuffer()],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  shareOrDownload(blob,`Jimny_parskats_${y}.xlsx`,"Gada pārskats gatavs")}

/* ---------- backup ---------- */
async function backup(){const data={versija:1,izveidots:new Date().toISOString(),iestatijumi:S.settings,dienas:S.days,uzpildes:S.fuels,menesi:S.months};
  shareOrDownload(new Blob([JSON.stringify(data,null,1)],{type:"application/json"}),`jimny_kopija_${iso(new Date())}.json`,"Rezerves kopija");
  await DB.put("kv","lastBackup",new Date().toISOString()).catch(()=>{})}
async function restore(file){let d;try{d=JSON.parse(await file.text())}catch(e){return toast("Fails nav derīga kopija.")}
  if(!d||!d.dienas)return toast("Fails nav šīs lietotnes kopija.");
  for(const [k,v] of Object.entries(d.dienas)){S.days[k]={...(S.days[k]||{}),...v};await DB.put("days",k,S.days[k])}
  for(const [k,v] of Object.entries(d.uzpildes||{})){S.fuels[k]=v;await DB.put("fuels",k,v)}
  S.months={...S.months,...(d.menesi||{})};await saveMonths();
  if(d.iestatijumi){S.settings={...DEF,...d.iestatijumi};await DB.put("kv","settings",S.settings)}
  render();toast(`Atjaunoti ${Object.keys(d.dienas).length} dienu ieraksti`)}

/* ---------- render ---------- */
function render(){
  const route=(location.hash||"#sodien").slice(1);const v=["sodien","menesis","parskats","iestatijumi"].includes(route)?route:"sodien";
  for(const k of ["sodien","menesis","parskats","iestatijumi"]){$("v-"+k).hidden=k!==v;if(k===v)$("nav-"+k).setAttribute("aria-current","page");else $("nav-"+k).removeAttribute("aria-current")}
  if(v==="sodien")renderToday();if(v==="menesis")renderMonth();if(v==="iestatijumi")renderSettings();if(v==="parskats")renderYear();
  monthEndBanner();
}
function monthEndBanner(){if(!S.loaded)return;const now=new Date();const cur=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;const pm=prevMonth(cur);
  const has=Object.keys(S.days).some(d=>d.startsWith(pm));
  if(has&&!S.months[pm]){const m=+pm.slice(5)-1;banner(`<b>${MON_NOM[m][0].toUpperCase()+MON_NOM[m].slice(1)} ir beidzies.</b> Eksportē Google Timeline, tad sadaļā <a href="#menesis" id="goPrev">Mēnesis</a> ielādē to un izveido Excel.`);const g=$("goPrev");if(g)g.onclick=()=>{S.month=pm}}
  else if(ENV.webview)banner(`<b>Lietotne atvērta citas lietotnes iekšējā pārlūkā</b> (piem. Gmail vai Claude). Šeit dati tiek dzēsti. Atver to no ikonas <b>Jimny</b> sākuma ekrānā vai Chrome pārlūkā.`,true);
  else if(!ENV.standalone)banner(`<b>Lietotne atvērta kā tīmekļa lapa.</b> Lai dati droši saglabātos, instalē to (Chrome ⋮ → Instalēt lietotni) un turpmāk atver tikai no ikonas <b>Jimny</b>.`);
  else banner("")}
function renderToday(){
  const now=new Date(),t=iso(now),d=S.days[t]||{};
  $("lcdDate").textContent=`${WD[now.getDay()]} ${lvDate(t)}`;$("lcdClock").textContent=hm(now);
  $("lcdStart").textContent=d.sakums?fmt(d.sakums.km):"—";$("lcdStartT").textContent=d.sakums?d.sakums.laiks:" ";
  $("lcdEnd").textContent=d.beigas?(d.beigas.km?fmt(d.beigas.km):d.beigas.laiks):"—";$("lcdEndT").textContent=d.beigas?(d.beigas.km?d.beigas.laiks:"km no rīta bildes"):" ";
  $("lcdKm").textContent=d.sakums&&d.beigas?.km?fmt(d.beigas.km-d.sakums.km):"—";
  $("btnEndSub").textContent=d.beigas?"noslēgta "+d.beigas.laiks:isLastWorkday(t)?"+ mēneša beigu km":"viens spiediens";
  $("btnStart").querySelector("small").textContent=d.sakums?"labot km":"ievadi km";
  const st=$("lcdState");st.className="state"+(d.sakums&&!d.beigas?" on":"");st.textContent=!d.sakums?"Darba diena nav sākta":!d.beigas?(now.getHours()>=19?"Nav noslēgta — noslēgsies automātiski":"Darba diena notiek"):"Darba diena pabeigta";
  const start=new Date(now);start.setDate(now.getDate()-6);const from=iso(start);const ev=[];
  for(const [dd,x] of Object.entries(S.days))if(dd>=from){const wd=WD[new Date(dd+"T12:00").getDay()]+" "+lvDate(dd);
    if(x.sakums)ev.push({k:dd+x.sakums.laiks,t:x.sakums.laiks,title:`Sākums · ${fmt(x.sakums.km)} km`,sub:wd,del:()=>delDayPart(dd,"sakums"),edit:()=>startForm(dd)});
    if(x.beigas)ev.push({k:dd+x.beigas.laiks,t:x.beigas.laiks,title:x.beigas.km?`Beigas · ${fmt(x.beigas.km)} km`:"Darba diena noslēgta",sub:(x.sakums&&x.beigas.km?`nobraukti ${fmt(x.beigas.km-x.sakums.km)} km · `:"")+wd,del:()=>delDayPart(dd,"beigas")})}
  for(const [id,f] of Object.entries(S.fuels))if(f.datums>=from)ev.push({k:f.datums+f.laiks,t:f.laiks,title:`Uzpilde · ${fmt(f.litri,2)} l · ${fmt(f.eur,2)} €`,sub:(f.stacija?f.stacija+" · ":"")+lvDate(f.datums),del:()=>delFuel(id)});
  ev.sort((a,b)=>b.k.localeCompare(a.k));
  const L=$("weekList");L.innerHTML="";
  if(!ev.length){L.innerHTML=`<div class="empty">Vēl nav ierakstu. No rīta spied “Sākt dienu” un ievadi odometra km.</div>`;return}
  for(const e of ev){const el=document.createElement("div");el.className="item";el.innerHTML=`<div class="t">${esc(e.t)}</div><div class="m"><div>${esc(e.title)}</div><div>${esc(e.sub)}</div></div><div class="row" style="gap:0">${e.edit?'<button class="link ed" type="button">Labot</button>':""}<button class="link dl" type="button">Dzēst</button></div>`;
    if(e.edit)el.querySelector(".ed").onclick=e.edit;
    const b=el.querySelector(".dl");b.onclick=()=>{if(b.dataset.c){e.del();toast("Izdzēsts")}else{b.dataset.c=1;b.textContent="Tiešām?";setTimeout(()=>{b.textContent="Dzēst";delete b.dataset.c},3000)}};L.appendChild(el)}
}
function renderMonth(){
  if(!S.month){const n=new Date();S.month=`${n.getFullYear()}-${pad(n.getMonth()+1)}`}
  const [y,m]=S.month.split("-").map(Number);$("mTitle").textContent=`${MON_NOM[m-1]} ${y}`;
  const c=compute(S.month);
  $("kKm").textContent=fmt(c.km);$("kBuy").textContent=fmt(c.buyL,2);$("kUse").textContent=fmt(c.use,2);$("kLeft").textContent=c.op.l==null?"?":fmt(c.endL,2);
  const B=$("mBody");B.innerHTML="";
  if(!c.rows.length)B.innerHTML=`<tr><td colspan="8" class="route"><span class="empty">${MON_LOC[m-1][0].toUpperCase()+MON_LOC[m-1].slice(1)} vēl nav darba dienu ierakstu.</span></td></tr>`;
  for(const r of c.rows){const tr=document.createElement("tr");if(r.flag)tr.className="flag";
    tr.innerHTML=`<td>${WD[new Date(r.d+"T12:00").getDay()]} ${r.d.slice(8,10)}.${r.d.slice(5,7)}.</td><td class="route"><input aria-label="Maršruts ${lvDate(r.d)}" value="${esc(r.route)}" placeholder="ielādē Timeline vai ieraksti"></td><td>${fmt(r.D)}</td><td><input class="kmIn" aria-label="Beigu km ${lvDate(r.d)}" inputmode="numeric" value="${S.days[r.d].beigas?.km??""}" placeholder="${fmt(r.E)}" style="width:80px;text-align:right;font:inherit;border:1px solid transparent;background:transparent;color:inherit;border-radius:6px;padding:3px 4px"></td><td>${fmt(r.km)}</td><td>${r.buy?fmt(r.buy,2):""}</td><td>${fmt(r.use,2)}</td><td>${c.op.l==null?"—":fmt(r.bal,2)}</td>`;
    const inp=tr.querySelector("td.route input");inp.onchange=()=>saveDay(r.d,{marsruts:inp.value.trim()});
    const ki=tr.querySelector(".kmIn");ki.onchange=()=>{const v=num(ki.value);const b={...(S.days[r.d].beigas||{laiks:"18:00"})};if(v)b.km=Math.round(v);else delete b.km;saveDay(r.d,{beigas:b})};B.appendChild(tr)}
  $("issuesCard").hidden=!c.issues.length;$("issues").innerHTML=c.issues.map(i=>`<li>${esc(i)}</li>`).join("");
}
async function renderSettings(){const s=S.settings;const put=(id,v)=>{const e=$(id);if(document.activeElement!==e)e.value=v??""};
  put("sComp",s.uznemums);put("sCar",s.auto);put("sNorm",s.norma);put("sHomeLat",s.majas?.lat);put("sHomeLon",s.majas?.lon);put("sWorkLat",s.darbs?.lat);put("sWorkLon",s.darbs?.lon);put("sOpenM",s.sakuma?.menesis);put("sOpenL",s.sakuma?.l);put("sOpenE",s.sakuma?.eur);
  try{const lb=await DB.get("kv","lastBackup");const est=navigator.storage?.estimate?await navigator.storage.estimate():null;const pers=navigator.storage?.persisted?await navigator.storage.persisted():null;
    const since=S.created?`${lvDate(S.created.slice(0,10))} ${S.created.slice(11,16)}`:"—";
    $("storeInfo").innerHTML=`Dati šajā telefonā glabājas kopš: <b>${since}</b><br>Ieraksti: ${Object.keys(S.days).length} dienas, ${Object.keys(S.fuels).length} uzpildes<br>Atvērta: ${ENV.standalone?"kā instalēta lietotne ✓":"pārlūkā (nav instalēta)"} · ${ENV.browser}<br>Pastāvīga glabāšana: ${pers===true?"jā ✓":pers===false?"nē — telefons var dzēst datus":"nav zināms"}<br>Pēdējā kopija: ${lb?lvDate(lb.slice(0,10)):"vēl nav"}${est?` · aizņemts ${fmt(est.usage/1048576,1)} MB`:""}`}catch(e){}}
$("setForm").addEventListener("submit",async e=>{e.preventDefault();
  S.settings={...DEF,uznemums:$("sComp").value.trim(),auto:$("sCar").value.trim(),norma:num($("sNorm").value)??7.9,majas:{lat:num($("sHomeLat").value),lon:num($("sHomeLon").value)},darbs:{lat:num($("sWorkLat").value),lon:num($("sWorkLon").value)},sakuma:{menesis:$("sOpenM").value,l:num($("sOpenL").value),eur:num($("sOpenE").value)}};
  try{await DB.put("kv","settings",S.settings);$("setMsg").textContent="Saglabāts."}catch(err){$("setMsg").textContent="Neizdevās saglabāt."}render()});

/* ---------- wiring ---------- */
$("btnStart").onclick=()=>startForm();
$("btnFuel").onclick=fuelSheet;
$("btnEnd").onclick=()=>{const t=iso(new Date());if(!(S.days[t]||{}).sakums)return toast("Šodien darba diena nav sākta.");
  if(isLastWorkday(t))return endForm();
  saveDay(t,{beigas:{...((S.days[t]||{}).beigas||{}),laiks:hm(new Date())}});toast("Darba diena noslēgta "+hm(new Date()))};
$("btnEnd").addEventListener("contextmenu",e=>{e.preventDefault();endForm()});
$("inTl").onchange=e=>{const f=e.target.files[0];e.target.value="";f&&loadTimeline(f)};
$("btnXlsx").onclick=exportXlsx;
$("btnBackup").onclick=backup;
$("btnYear").onclick=exportYear;
$("yPrev").onclick=()=>{S.year--;renderYear()};$("yNext").onclick=()=>{S.year++;renderYear()};
$("inRestore").onchange=e=>{const f=e.target.files[0];e.target.value="";f&&restore(f)};
const shiftM=k=>{let [y,m]=S.month.split("-").map(Number);m+=k;if(m<1){m=12;y--}if(m>12){m=1;y++}S.month=`${y}-${pad(m)}`;renderMonth()};
$("mPrev").onclick=()=>shiftM(-1);$("mNext").onclick=()=>shiftM(1);
window.addEventListener("hashchange",()=>{closeSheet();render()});
setInterval(()=>{if(!$("v-sodien").hidden)renderToday()},30000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)render()});

let deferredInstall=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("btnInstall").classList.add("show")});
$("btnInstall").onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice.catch(()=>{});deferredInstall=null;$("btnInstall").classList.remove("show")};
window.addEventListener("appinstalled",()=>{$("btnInstall").classList.remove("show");toast("Lietotne instalēta")});

(async()=>{
  try{await DB.open();
    S.settings={...DEF,...((await DB.get("kv","settings"))||{})};S.months=(await DB.get("kv","months"))||{};
    S.days=await DB.all("days");S.fuels=await DB.all("fuels");
    S.created=await DB.get("kv","created");if(!S.created){S.created=new Date().toISOString();await DB.put("kv","created",S.created)}}
  catch(e){banner("Šajā pārlūkā nevar saglabāt datus (privātais režīms?). Atver lietotni parastā Chrome logā.",true)}
  S.loaded=true;render();
  if(!num(S.settings.majas?.lat))toast("Iestatījumos ievadi mājas koordinātas — pēc tām lietotne nosaka, kad diena beigusies.");
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
})();

/* Maunon ruokinta – jaettu laskentalogiikka.
 * Käytössä sekä selaimessa (window.MaunoLogic) että Node-muistutusskriptissä (require).
 * Kaikki funktiot ovat puhtaita: ne saavat tilan `st` ({cfg, base, rawBase, feeds, rawlog, items})
 * ja ajanhetken `now` parametreina. Päivän raja lasketaan ajoympäristön paikallisessa ajassa
 * (muistutusskripti ajetaan TZ=Europe/Helsinki).
 */
(function (root) {
  'use strict';
  const DAY = 864e5, HOUR = 36e5;
  const DEF_TIMES = {1:['08:00'],2:['07:30','17:00'],3:['07:00','12:30','17:30'],4:['07:00','11:00','15:00','19:00']};
  const SLOT_NAMES = {1:[['🍽️','Ruoka']],2:[['🌅','Aamuruoka'],['🌙','Iltaruoka']],3:[['🌅','Aamuruoka'],['☀️','Päiväruoka'],['🌙','Iltaruoka']],
    4:[['🌅','Aamuruoka'],['☀️','Lounas'],['🍎','Välipala'],['🌙','Iltaruoka']]};
  const DEF = {dogName:'', photo:'', theme:null, breed:'', age:'aikuinen', weightKg:null, foodName:'', bagKg:12,
    meals:2, mealTimes:['07:30','17:00'], plan:[], pullaG:50, gPerDl:40, canG:400, dailyG:null, dailyUnit:'g', thawH:12, alertDays:7, setupDone:false};
  const PLAN0 = {type:'kuiva', g:90, n:2, unit:'g', dl:2, wunit:'g', wg:100, cans:1};

  const dayStart = t => { const d = new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
  const cfgOf = st => ({...DEF, ...((st && st.cfg) || {})});

  /* ---------- ateriasuunnitelma ---------- */
  const planOf = (c,i) => ({...PLAN0, ...((c.plan||[])[i]||{})});
  const slotGOf = (c,p) => p.type==='raaka' ? p.n*(c.pullaG||50) : p.type==='markä' ? (p.wunit==='prk' ? Math.round(p.cans*(c.canG||400)) : p.wg) : p.unit==='dl' ? Math.round(p.dl*(c.gPerDl||40)) : p.g;
  function slotsOf(c){ const n=Math.max(1,Math.min(4,c.meals|0)), t=c.mealTimes||[];
    return SLOT_NAMES[n].map(([ic,name],i)=>{ const p=planOf(c,i); return {ic,name,time:t[i]||DEF_TIMES[n][i],p,g:slotGOf(c,p)}; }); }
  const hasRawC = c => slotsOf(c).some(s=>s.p.type==='raaka');
  const hasKibC = c => slotsOf(c).some(s=>s.p.type==='kuiva');
  const rawPerDayC = c => slotsOf(c).filter(s=>s.p.type==='raaka').reduce((a,s)=>a+s.p.n,0);
  const kibPerDayC = c => slotsOf(c).filter(s=>s.p.type==='kuiva').reduce((a,s)=>a+s.g,0);
  const dailyOf = c => c.dailyG || slotsOf(c).reduce((a,s)=>a+s.g,0);

  /* ---------- laskenta ---------- */
  const isTreat = f => f.type==='herkku';
  const isKib = f => !f.raw && !f.wet && !isTreat(f);
  const todayFeeds = (st,now) => { const t0=dayStart(now); return (st.feeds||[]).filter(f=>f.t>=t0 && !isTreat(f)); };
  const foodToday = (st,now) => todayFeeds(st,now).reduce((a,f)=>a+f.g,0);
  function stockG(st){ const b=st.base; if(!b) return null; return b.g - (st.feeds||[]).filter(f=>isKib(f) && f.t>b.t).reduce((a,f)=>a+f.g,0); }
  function kibRate(st,now){ const t0=dayStart(now), foods=(st.feeds||[]).filter(isKib), fb=kibPerDayC(cfgOf(st))||100; if(!foods.length) return fb;
    const start=Math.max(dayStart(Math.min(...foods.map(f=>f.t))), t0-14*DAY), days=Math.round((t0-start)/DAY);
    if(days<3) return fb; const v=foods.filter(f=>f.t>=start&&f.t<t0).reduce((a,f)=>a+f.g,0)/days; return v>0?v:fb; }
  function rawState(st,now){ const b=st.rawBase; if(!b) return null; const th=(cfgOf(st).thawH||12)*HOUR;
    let fz=b.freezer, fr=b.fridge; const pend=[];
    for(const e of (st.rawlog||[])){ if(e.t<=b.t) continue; if(e.kind==='add') fz+=e.n; if(e.kind==='thaw'){ fz-=e.n; fr+=e.n; if(e.t+th>now) pend.push(e); } }
    for(const f of (st.feeds||[])) if(f.raw && f.t>b.t) fr-=f.raw;
    fz=Math.max(0,fz); fr=Math.max(0,fr);
    const thawing=Math.min(fr, pend.reduce((a,e)=>a+e.n,0)), ready=fr-thawing, nextReady=pend.length?Math.min(...pend.map(e=>e.t))+th:null;
    return {fz,fr,ready,thawing,nextReady}; }
  /** Montako lihapullaa pitää vielä ottaa sulamaan, jotta loppupäivä + huominen riittävät. */
  function rawNeed(st,now){ const rs=rawState(st,now); if(!rs) return null; const c=cfgOf(st), tf=todayFeeds(st,now);
    const leftToday = slotsOf(c).reduce((a,s,i)=>a + (s.p.type==='raaka' && !tf.find(f=>f.slot===i) ? s.p.n : 0),0);
    return Math.max(0, leftToday + rawPerDayC(c) - rs.fr); }

  /* ---------- muistutukset (GitHub Actions -lähettäjä) ---------- */
  const pad = n => String(n).padStart(2,'0');
  const ymd = t => { const d=new Date(t); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const fmtN = n => String(Math.round(n*100)/100).replace('.',',');
  /** Palauttaa lähetettävät muistutukset [{key,title,body}]. `key` on päiväkohtainen → ei tuplaviestejä. */
  function reminders(st, now, opts){
    const o = {thawFrom:17, thawTo:21, lateMin:60, lateMaxH:6, quietFrom:22, dailyFrom:10, ...(opts||{})};
    const c=cfgOf(st); if(!c.setupDone) return [];
    const out=[], h=new Date(now).getHours(), day=ymd(now), title=`${c.dogName||'Koira'} 🐾`;
    if(hasRawC(c) && h>=o.thawFrom && h<o.thawTo){ const need=rawNeed(st,now);
      if(need>0) out.push({key:`thaw-${day}`, title, body:`🧊 Ota ${need} ${need===1?'lihapulla':'lihapullaa'} sulamaan huomiseksi`}); }
    if(h<o.quietFrom){ const tf=todayFeeds(st,now);
      slotsOf(c).forEach((s,i)=>{ if(tf.find(f=>f.slot===i)) return;
        const [hh,mm]=String(s.time).split(':').map(Number), d=new Date(now); d.setHours(hh,mm,0,0); const due=d.getTime();
        if(now>due+o.lateMin*6e4 && now<due+o.lateMaxH*HOUR) out.push({key:`late-${day}-${i}`, title, body:`🍽️ ${s.name} on kirjaamatta`}); }); }
    if(h>=o.dailyFrom && h<o.quietFrom){ const lines=[];
      if(hasKibC(c)){ const s=stockG(st); if(s!=null){ const days=Math.floor(Math.max(0,s)/kibRate(st,now)); if(days<c.alertDays) lines.push(`🥣 Kuivaruoka riittää n. ${days} pv`); } }
      if(hasRawC(c)){ const rs=rawState(st,now); if(rs){ const days=Math.floor((rs.fz+rs.fr)/Math.max(1,rawPerDayC(c))); if(days<c.alertDays) lines.push(`❄️ Pakastimen lihapullat riittävät n. ${days} pv`); } }
      for(const it of (st.items||[])) if(it.low>0 && it.qty<=it.low) lines.push(`${it.icon||'📦'} ${it.name} vähissä: ${fmtN(it.qty)} ${it.unit}`);
      if(lines.length) out.push({key:`daily-${day}`, title:'📦 Varastot vähissä', body:lines.join('\n')}); }
    return out; }

  const api = {DAY,HOUR,DEF_TIMES,SLOT_NAMES,DEF,PLAN0,dayStart,cfgOf,planOf,slotGOf,slotsOf,hasRawC,hasKibC,rawPerDayC,kibPerDayC,dailyOf,
    isTreat,isKib,todayFeeds,foodToday,stockG,kibRate,rawState,rawNeed,reminders,ymd};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MaunoLogic = api;
})(typeof self !== 'undefined' ? self : this);

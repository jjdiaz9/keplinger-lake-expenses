"use strict";
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
let pass=0, fail=0;
const ok=(n,c,d)=>{ c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  FAIL "+n+(d?"  -> "+d:""))); };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),JSON.stringify(a)+" != "+JSON.stringify(b));
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
process.on("unhandledRejection", e=>console.log("  !! unhandled: "+(e&&(e.stack||e.message))));

const HTML = fs.readFileSync(require("path").join(__dirname,"expense-manager.html"),"utf8");
const LS="household-expense-manager-v1";
const CFG="household-expense-manager-ynab-v1";
const TOK="household-expense-manager-ynab-tok";

/* A ledger shaped like the real one: a statement, a card-linked child,
   a linked row, an unlinked row, and a month filled forward by repeat. */
const ledger = () => ({
  version:1, app:"household-expense-manager", title:"Keplinger Lake Expenses",
  people:[{id:"javier",name:"Javier",color:"#2E6E8E"},{id:"david",name:"David",color:"#A4562E"}],
  lastYear:"2026", sync:{rev:3},
  years:{ "2026": { categories:[
    { id:"electric", name:"Electric", dueDay:"", kind:"normal", onCard:null, split:{mode:"even"},
      amounts:{1:180,2:175.5,3:175.5}, projected:{3:true}, ynabCategoryId:"y-elec" },
    { id:"internet", name:"Internet", dueDay:"", kind:"normal", onCard:null, split:{mode:"even"},
      amounts:{1:89.99} },
    { id:"groceries", name:"Groceries", dueDay:"", kind:"normal", onCard:"visa", split:{mode:"even"},
      amounts:{1:640} },
    { id:"visa", name:"Prime Visa", dueDay:"", kind:"statement", onCard:null, split:{mode:"even"},
      amounts:{1:1200} }
  ], splits:[] } }
});

function boot({url="https://jjdiaz9.github.io/keplinger-lake-expenses/", data=ledger(), cfg, session, hash, routes={}}={}){
  const errs=[], calls=[], nav=[];
  const vc=new VirtualConsole();
  vc.on("jsdomError",e=>{ if(/navigation/i.test(e.message)) nav.push("nav"); else errs.push(e.message); });
  vc.on("error",()=>{}); vc.on("warn",()=>{});
  const dom=new JSDOM(HTML,{url,runScripts:"dangerously",virtualConsole:vc,pretendToBeVisual:true,
    beforeParse(w){
      w.fetch=async(u)=>{ calls.push(String(u));
        const p=String(u).replace("https://api.ynab.com/v1","");
        const r=routes[p];
        if(!r) return {ok:false,status:404,json:async()=>({error:{id:"404.1"}})};
        return {ok:r.status<300,status:r.status,json:async()=>r.body};
      };
      w.addEventListener("error",e=>errs.push(String(e.error&&e.error.stack||e.message)));
      if(data) w.localStorage.setItem(LS,JSON.stringify(data));
      if(cfg)  w.localStorage.setItem(CFG,JSON.stringify(cfg));
      if(session) for(const [k,v] of Object.entries(session)) w.sessionStorage.setItem(k,v);
      if(hash){ try{ w.history.replaceState(null,"",url+hash); }catch(e){} }
    }});
  return {w:dom.window,d:dom.window.document,errs,calls,nav};
}
const live = () => ({ [TOK]: JSON.stringify({accessToken:"tk",expiresAt:Date.now()+7000000}) });
const connected = { clientId:"cid", planId:"p1", planName:"Keplinger Lake",
                    knowledge:null, cats:{}, actuals:{}, tolerance:1, lastSync:null };
const goToYnab = d => [...d.querySelectorAll("#viewTabs button")].find(b=>b.dataset.view==="ynab").click();
const btn = (d,re) => [...d.querySelectorAll("button")].find(b=>re.test(b.textContent));

(async () => {

console.log("\nExisting app still works");
{
  const {d,errs}=boot(); await tick();
  ok("app boots with no errors", errs.length===0, errs.join(" | "));
  ok("ledger renders by default", !!d.querySelector(".ledger, table"));
  eq("four view tabs now", [...d.querySelectorAll("#viewTabs button")].map(b=>b.dataset.view),
     ["ledger","splits","summary","ynab"]);
  ok("existing sync button intact", !!d.getElementById("btnSync"));
  ok("settings button intact", !!d.getElementById("btnSettings"));
  [...d.querySelectorAll("#viewTabs button")].find(b=>b.dataset.view==="splits").click();
  ok("splits view still renders", d.querySelector("#main").textContent.length>0);
  [...d.querySelectorAll("#viewTabs button")].find(b=>b.dataset.view==="summary").click();
  ok("summary view still renders", d.querySelector("#main").textContent.length>0);
}

console.log("\nSetup");
{
  const {d}=boot(); await tick(); goToYnab(d);
  const t=d.querySelector("#main").textContent;
  ok("YNAB tab renders setup", /Create an OAuth application/.test(t));
  ok("says read-only", /nothing here can change your budget/i.test(t));
  eq("shows the exact redirect uri", d.querySelector(".ynab-uri").textContent,
     "https://jjdiaz9.github.io/keplinger-lake-expenses/");
  ok("warns off the client secret", /Client Secret is not needed/.test(t));
}

console.log("\nAuth return");
{
  const {w,d}=boot({ cfg:{...connected, planId:"", planName:""},
    session:{"ynab-oauth-state":"st1"},
    hash:"#access_token=tk&expires_in=7200&state=st1",
    routes:{ "/plans":{status:200,body:{data:{plans:[{id:"p1",name:"Keplinger Lake"},{id:"p2",name:"Other"}]}}} }});
  await tick();
  ok("lands on the YNAB view", d.querySelector(".ynab")!==null);
  ok("token in sessionStorage", !!w.sessionStorage.getItem(TOK));
  ok("token gone from the URL", w.location.href.indexOf("access_token")===-1, w.location.href);
  ok("token never in localStorage", JSON.stringify(w.localStorage).indexOf("tk")===-1);
  await tick();
  const picks=[...d.querySelectorAll(".ynab-pick")].map(b=>b.textContent);
  eq("plan picker lists plans", picks, ["Keplinger Lake","Other"]);
  d.querySelectorAll(".ynab-pick")[0].click(); await tick();
  eq("plan stored", JSON.parse(w.localStorage.getItem(CFG)).planId, "p1");
}
{
  const {w,d}=boot({ cfg:{...connected,planId:"",planName:""}, session:{"ynab-oauth-state":"real"},
    hash:"#access_token=evil&expires_in=7200&state=forged" });
  await tick();
  ok("forged state rejected", w.sessionStorage.getItem(TOK)===null);
  ok("rejection explained", /could not be verified/.test(d.querySelector("#main").textContent));
}

console.log("\nCategory sync");
{
  const {w,d}=boot({ cfg:connected, session:live(), routes:{
    "/plans/p1/categories":{status:200,body:{data:{category_groups:[
      {id:"g",name:"Lake",categories:[
        {id:"y-elec",name:"Electric & Gas",hidden:false,deleted:false,internal:false},
        {id:"y-net",name:"Internet",hidden:false,deleted:false,internal:false},
        {id:"y-dock",name:"Dock repair",hidden:false,deleted:false,internal:false}]},
      {id:"gi",name:"Internal Master Category",internal:true,categories:[
        {id:"y-rta",name:"Inflow: Ready to Assign",internal:true}]}
    ],server_knowledge:77}}}}});
  await tick(); goToYnab(d);
  btn(d,/Pull categories/).click(); await tick(80);

  const t=d.querySelector("#main").textContent;
  ok("rename surfaced", /Electric → Electric & Gas/.test(t));
  ok("name match suggested", /Not linked yet/.test(t));
  ok("new category offered", /Dock repair/.test(t));
  ok("YNAB internal category never offered", !/Ready to Assign/.test(t));
  ok("statement row not in a bucket", !/Prime Visa/.test(t.split("no YNAB match")[0]));
  eq("server_knowledge stored", JSON.parse(w.localStorage.getItem(CFG)).knowledge, 77);

  const boxes=[...d.querySelectorAll(".ynab-item input")];
  eq("one checkbox per change", boxes.length, 3);
  boxes[0].click();                       // rename only
  btn(d,/Apply selected/).click(); await tick(500);

  const after=JSON.parse(w.localStorage.getItem(LS)).years["2026"].categories;
  eq("rename applied", after.find(c=>c.id==="electric").name, "Electric & Gas");
  eq("amounts survived the rename", after.find(c=>c.id==="electric").amounts, {1:180,2:175.5,3:175.5});
  eq("projected flags survived", after.find(c=>c.id==="electric").projected, {3:true});
  eq("unticked link not applied", after.find(c=>c.id==="internet").ynabCategoryId, undefined);
  ok("unticked add not applied", !after.some(c=>c.name==="Dock repair"));
  eq("statement untouched", after.find(c=>c.id==="visa").name, "Prime Visa");
  eq("row count unchanged", after.length, 4);
  ok("no page reload — view redrew in place", !!d.querySelector(".ynab"));
  ok("diff refreshed after apply", !/Electric → Electric & Gas/.test(d.querySelector("#main").textContent));
}
{
  // adding a category must produce a row the ledger can actually render
  const {w,d,errs}=boot({ cfg:connected, session:live(), routes:{
    "/plans/p1/categories":{status:200,body:{data:{category_groups:[
      {id:"g",name:"Lake",categories:[{id:"y-dock",name:"Dock repair",hidden:false,deleted:false,internal:false}]}],
      server_knowledge:1}}}}});
  await tick(); goToYnab(d);
  btn(d,/Pull categories/).click(); await tick(80);
  d.querySelectorAll(".ynab-item input")[0].click();
  btn(d,/Apply selected/).click(); await tick(500);
  [...d.querySelectorAll("#viewTabs button")].find(b=>b.dataset.view==="ledger").click();
  await tick();
  ok("new row renders in the ledger without errors", errs.length===0, errs.join(" | "));
  ok("new row visible in the ledger", /Dock repair/.test(d.querySelector("#main").textContent));
}

console.log("\nTemplate groups");
{
  /* A budget started from YNAB's template has its Bills/Needs/Wants groups
     flagged internal, though the categories inside them are the user's own.
     Those must still come through; only YNAB's own categories are dropped. */
  const {w,d}=boot({ cfg:connected, session:live(), routes:{
    "/plans/p1/categories":{status:200,body:{data:{category_groups:[
      {id:"gb",name:"Bills",internal:true,categories:[
        {id:"y-elec",name:"Electric",hidden:false,deleted:false,internal:false},
        {id:"y-tax",name:"Taxes",hidden:false,deleted:false,internal:false}]},
      {id:"gcc",name:"Credit Card Payments",internal:true,categories:[
        {id:"y-visa",name:"Prime Visa - 2836",hidden:false,deleted:false,internal:false}]},
      {id:"gi",name:"Internal Master Category",internal:true,categories:[
        {id:"y-rta",name:"Inflow: Ready to Assign",internal:true}]}
    ],server_knowledge:5}}}}});
  await tick(); goToYnab(d);
  btn(d,/Pull categories/).click(); await tick(80);
  const t=d.querySelector("#main").textContent;
  ok("user category in an internal template group is kept", /Taxes/.test(t));
  ok("credit card payment category excluded", !/2836/.test(t));
  ok("YNAB internal category still excluded", !/Ready to Assign/.test(t));
  const cats=JSON.parse(w.localStorage.getItem(CFG)).cats;
  eq("only real categories cached", Object.keys(cats).sort(), ["y-elec","y-tax"]);
}

console.log("\nDelta");
{
  const {d,calls}=boot({ cfg:{...connected,knowledge:77}, session:live(), routes:{
    "/plans/p1/categories?last_knowledge_of_server=77":{status:200,
      body:{data:{category_groups:[],server_knowledge:77}}}}});
  await tick(); goToYnab(d);
  ok("offers a delta check on later runs", !!btn(d,/Check for changes/));
  btn(d,/Check for changes/).click(); await tick(80);
  ok("delta parameter sent", calls.some(c=>/last_knowledge_of_server=77/.test(c)), calls.join(" "));
  ok("clean result stated plainly", /Everything matches/.test(d.querySelector("#main").textContent));
}

console.log("\nPlanned vs actual");
{
  const routes={};
  const acts={1:-201.12,2:-160.00,3:-150.00};
  for(let m=1;m<=12;m++)
    routes["/plans/p1/months/2026-"+String(m).padStart(2,"0")+"-01"]={status:200,body:{data:{month:{
      categories:[{id:"y-elec",name:"Electric",activity_currency:acts[m]||0}]}}}};
  const {w,d}=boot({ cfg:connected, session:live(), routes});
  await tick(); goToYnab(d);
  btn(d,/Planned vs actual/).click(); await tick();
  btn(d,/Pull 2026 spending/).click(); await tick(400);

  ok("variance table rendered", !!d.querySelector(".ynab-tbl"));
  const row=[...d.querySelectorAll(".ynab-tbl tbody tr")].find(r=>/Electric/.test(r.textContent));
  const cells=[...row.querySelectorAll("td")];
  eq("january over", cells[1].textContent, "+21.12");
  eq("february under", cells[2].textContent, "−15.50");
  ok("march is a projected month, styled apart", /proj/.test(cells[3].className), cells[3].className);
  ok("march tooltip says projected", /projected/.test(cells[3].title), cells[3].title);
  eq("year total excludes the projected month", cells[13].textContent, "+5.62");
  ok("total tooltip explains the exclusion", /1 projected months? left out/.test(cells[13].title), cells[13].title);
  ok("footnote explains grey months", /projections, not plans/.test(d.querySelector(".ynab-key").textContent));
  ok("statement excluded", !/Prime Visa/.test(d.querySelector(".ynab-tbl").textContent));
  ok("unlinked row excluded", !/Internet/.test(d.querySelector(".ynab-tbl").textContent));
  const cached=Object.keys(JSON.parse(w.localStorage.getItem(CFG)).actuals);
  eq("stops at the current month", cached.length, new Date().getMonth()+1);
}

console.log("\nFailures");
for(const [code,id,expect,noReconnect] of [
  [401,"401",/expired or was revoked/,false],
  [429,"429",/200 requests an hour/,true],
  [404,"404.2",/No plan with that id/,true],
  [503,"503",/unavailable or the request timed out/,true]]){
  const {d}=boot({ cfg:connected, session:live(),
    routes:{ "/plans/p1/categories":{status:code,body:{error:{id}}} }});
  await tick(); goToYnab(d);
  btn(d,/Pull categories/).click(); await tick(80);
  const t=d.querySelector("#main").textContent;
  ok(id+" gets its own message", expect.test(t), t.slice(0,160));
  if(noReconnect) ok(id+" does not offer a reconnect", !/Connect again/.test(t));
  else ok(id+" offers a reconnect", /Connect again/.test(t));
}
{
  const routes={};
  for(let m=1;m<=12;m++)
    routes["/plans/p1/months/2026-"+String(m).padStart(2,"0")+"-01"]= m<=3
      ? {status:200,body:{data:{month:{categories:[{id:"y-elec",activity_currency:-10}]}}}}
      : {status:429,body:{error:{id:"429"}}};
  const {w,d}=boot({ cfg:connected, session:live(), routes});
  await tick(); goToYnab(d);
  btn(d,/Planned vs actual/).click(); await tick();
  btn(d,/Pull 2026 spending/).click(); await tick(400);
  const t=d.querySelector("#main").textContent;
  ok("partial pull names the limit", /200 requests an hour/.test(t));
  ok("partial pull says what was kept", /3 months already read were saved/.test(t), t.slice(0,220));
  eq("kept months persisted", Object.keys(JSON.parse(w.localStorage.getItem(CFG)).actuals).sort(),
     ["2026-01","2026-02","2026-03"]);
}

console.log("\nExport safety");
{
  const {w,d}=boot({ cfg:connected, session:live() });
  await tick();
  const exported=w.localStorage.getItem(LS);
  ok("ledger carries no token", exported.indexOf("tk")===-1);
  ok("ledger carries no plan id", exported.indexOf("p1")===-1);
  ok("ledger carries no client id", exported.indexOf("cid")===-1);
}

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
})();

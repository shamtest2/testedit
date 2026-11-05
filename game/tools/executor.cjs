// TerraForm Executor v4
// Paste DeepSeek answers into a web page. Backups, syntax check, import check, live jobs, restore points,
// copy buttons everywhere, one-click error reports.
const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),cp=require('child_process');
const ROOT=process.cwd(),STATE=path.join(ROOT,'.executor'),BK=path.join(STATE,'backups'),PORT=process.env.EXEC_PORT||3002,BOOT=Date.now();
fs.mkdirSync(BK,{recursive:true});
const LOG=[];function log(s){const l=new Date().toISOString().slice(11,19)+' '+s;LOG.push(l);if(LOG.length>300)LOG.shift();console.log(l);}
process.on('uncaughtException',e=>log('UNCAUGHT '+(e&&e.stack||e)));process.on('unhandledRejection',e=>log('UNHANDLED '+(e&&e.stack||e)));
try{const g=path.join(ROOT,'.gitignore'),t=fs.existsSync(g)?fs.readFileSync(g,'utf8'):'';if(!/^\.executor\/?$/m.test(t))fs.appendFileSync(g,(t&&!t.endsWith('\n')?'\n':'')+'.executor/\n.executor.log\n.vite.log\n.preview.log\n');}catch(e){}

function rel(p){return path.relative(ROOT,p).split(path.sep).join('/');}
function safe(p){
  const r=path.resolve(ROOT,p),q=rel(r);
  if(!q||q.startsWith('..')||path.isAbsolute(q)||/^(\.git|\.executor|node_modules)(\/|$)/.test(q))throw new Error('Blocked path: '+p);
  return r;
}
const GENV=Object.assign({},process.env,{GIT_TERMINAL_PROMPT:'0'});
function run(cmd,args,t){return new Promise(res=>{cp.execFile(cmd,args,{cwd:ROOT,timeout:t||120000,maxBuffer:16e6,env:GENV},(err,so,se)=>res({ok:!err,out:(so||'')+(se||'')}));});}
const TEXT=/\.(js|cjs|mjs|json|html|css|md|txt|glsl|vert|frag|svg|xml|yml|yaml)$/i;
function walk(dir,out){
  for(const n of fs.readdirSync(dir)){
    if(['node_modules','.git','.executor','dist'].includes(n))continue;
    const f=path.join(dir,n),s=fs.statSync(f);
    if(s.isDirectory())walk(f,out);else out.push({path:rel(f),size:s.size,mtime:s.mtimeMs,text:TEXT.test(n)});
  }
  return out;
}
function listFiles(){
  const out=[];
  for(const f of ['index.html','package.json','vite.config.js']){const p=path.join(ROOT,f);if(fs.existsSync(p)){const s=fs.statSync(p);out.push({path:f,size:s.size,mtime:s.mtimeMs,text:true});}}
  const src=path.join(ROOT,'src');if(fs.existsSync(src))walk(src,out);
  return out.sort((a,b)=>a.path.localeCompare(b.path));
}
function dirSize(d){let s=0,n=0;for(const x of fs.readdirSync(d)){const f=path.join(d,x),st=fs.statSync(f);if(st.isDirectory()){const r=dirSize(f);s+=r.s;n+=r.n;}else{s+=st.size;n++;}}return{s,n};}

// ---------- live jobs (build, save, check, changes, install) ----------
const jobs=new Map();let jobSeq=0;
function newJob(){const j={id:'j'+(++jobSeq),log:[],done:false,ok:null,started:Date.now(),ended:0,kids:[],cancelled:false,
  say(s){String(s).split(/\r|\n/).map(x=>x.trimEnd()).filter(Boolean).forEach(l=>{const p=(l.match(/^([A-Za-z ]+):\s+\d+%/)||[])[1],q=j.log.length-1;if(p&&q>=0&&j.log[q].startsWith(p+':'))j.log[q]=l;else if(j.log[q]!==l)j.log.push(l);if(j.log.length>400)j.log.shift();});}};jobs.set(j.id,j);return j;}
function live(j,cmd,args,ms){return new Promise(res=>{
  const k=cp.spawn(cmd,args,{cwd:ROOT,env:GENV,detached:true});let out='',dead=false,buf='';
  const kill=()=>{try{process.kill(-k.pid,'SIGKILL');}catch(e){try{k.kill('SIGKILL');}catch(e2){}}};j.kids.push({kill});
  const t=setTimeout(()=>{dead=true;kill();j.say('TIMEOUT: stopped after '+Math.round(ms/1000)+' seconds.');},ms);
  const hb=setInterval(()=>j.say('...still working ('+Math.round((Date.now()-j.started)/1000)+' s)'),8000);
  const on=d=>{const s=d.toString();out+=s;buf+=s;const parts=buf.split(/\r|\n/);buf=parts.pop();j.say(parts.join('\n'));};k.stdout.on('data',on);k.stderr.on('data',on);
  const end=ok=>{clearTimeout(t);clearInterval(hb);if(buf){j.say(buf);buf='';}res({ok:ok&&!dead&&!j.cancelled,out});};
  k.on('error',e=>{j.say('Could not start '+cmd+': '+e.message);end(false);});k.on('close',c=>end(c===0));});}
function jobView(j){return{id:j.id,log:j.log,done:j.done,ok:j.ok,elapsed:Math.round(((j.done?j.ended:Date.now())-j.started)/1000)};}

async function jobBuild(j){
  j.say('Building the game. Usually 10 to 60 seconds.');
  const r=await live(j,'npm',['run','build'],240000);
  if(!r.ok){if(!j.cancelled)j.say('BUILD FAILED. Send the red text above to Claude.');j.ok=false;return;}
  const dist=path.join(ROOT,'dist');
  if(fs.existsSync(dist)){const z=dirSize(dist),mb=z.s/1048576;j.say('BUILD OK. Size: '+mb.toFixed(2)+' MB in '+z.n+' files.');j.say('CrazyGames: 50 MB limit '+(mb<=50?'OK':'TOO BIG')+', 20 MB for mobile homepage '+(mb<=20?'OK':'TOO BIG')+', 1500 files '+(z.n<=1500?'OK':'TOO MANY')+'.');}
  j.ok=true;
}
async function jobSave(j,msg){
  j.say('STEP 1 of 3: collecting your changes...');
  let r=await live(j,'git',['add','-A'],90000);if(!r.ok){j.ok=false;return;}
  const c=await run('git',['diff','--cached','--name-only'],20000),n=c.out.split('\n').filter(Boolean);
  j.say(n.length+' changed file(s) to save.');
  if(n.length>800){j.say('STOP: '+n.length+' files is too many. Something huge (like node_modules) is included. Nothing was saved.');await run('git',['reset','-q'],20000);j.ok=false;return;}
  j.say('STEP 2 of 3: making the snapshot (commit)...');
  r=await live(j,'git',['commit','-m',msg||('Backup '+new Date().toISOString().slice(0,16).replace('T',' '))],60000);
  if(!r.ok&&!/nothing to commit/i.test(r.out)){j.ok=false;return;}
  j.say('STEP 3 of 3: uploading to GitHub. Usually 5 to 60 seconds.');
  r=await live(j,'git',['push','--progress'],240000);
  if(!r.ok&&/no upstream|set-upstream/i.test(r.out)){j.say('Setting up the GitHub link, trying again...');r=await live(j,'git',['push','-u','origin','HEAD','--progress'],240000);}
  if(!r.ok){j.say('PUSH FAILED. Send the text above to Claude. Your work is still safe on this computer.');j.ok=false;return;}
  j.say('DONE: saved to GitHub in '+Math.round((Date.now()-j.started)/1000)+' seconds.');j.ok=true;
}
async function jobChanges(j){
  j.say('Looking for what changed since your last GitHub save...');
  const s=await run('git',['status','--short'],30000);
  if(!s.ok){j.say('Git is not working here. Details:');j.say(s.out);j.ok=false;return;}
  if(!s.out.trim()){j.say('Nothing changed. Everything is already saved.');j.ok=true;return;}
  j.say('Changed files (M = changed, A = new, D = deleted, ?? = new and not tracked yet):');j.say(s.out);
  const d=await run('git',['diff','--stat','HEAD'],30000);if(d.ok&&d.out.trim()){j.say('Size of the changes:');j.say(d.out);}
  j.say('DONE.');j.ok=true;
}
async function jobInstall(j){
  j.say('Installing packages (npm install). Can take 1 to 3 minutes.');
  const r=await live(j,'npm',['install'],600000);
  if(!r.ok){if(!j.cancelled)j.say('INSTALL FAILED. Send the text above to Claude.');j.ok=false;return;}
  j.say('DONE: packages installed.');j.ok=true;
}
// exports of a JS source text
function exportsOf(t){
  const names=new Set();let def=/export\s+default\b/.test(t);
  let m,re=/export\s+(?:async\s+)?(?:class|function\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/g;while((m=re.exec(t)))names.add(m[1]);
  re=/export\s*\{([^}]*)\}/g;while((m=re.exec(t)))m[1].split(',').forEach(p=>{const x=p.trim().split(/\s+as\s+/).pop().trim();if(x==='default')def=true;else if(x)names.add(x);});
  return{names,def};
}
async function jobCheck(j){
  const files=listFiles().filter(f=>/^src\/.*\.js$/.test(f.path)||f.path==='vite.config.js');
  j.say('Checking '+files.length+' files for syntax errors and broken imports...');
  let problems=0;
  for(const f of files){
    const full=path.join(ROOT,f.path),text=fs.readFileSync(full,'utf8');
    const e=await syntax(full,text);if(e){problems++;j.say('SYNTAX ERROR in '+e);continue;}
    const re=/import\s+([^'";]*?)\s+from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;let m;
    while((m=re.exec(text))){
      const spec=m[2]||m[3]||m[4],clause=(m[1]||'').trim(),base=path.resolve(path.dirname(full),spec);
      const target=[base,base+'.js',path.join(base,'index.js')].find(x=>fs.existsSync(x)&&fs.statSync(x).isFile());
      if(!target){problems++;j.say('BROKEN IMPORT: '+f.path+' imports "'+spec+'" but that file does not exist.');continue;}
      if(!/\.js$/.test(target)||!clause)continue;
      const ex=exportsOf(fs.readFileSync(target,'utf8')),tn=rel(target);
      const dm=clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/),nm=clause.match(/\{([^}]*)\}/);
      if(dm&&!ex.def){problems++;j.say('WRONG IMPORT: '+f.path+' uses "import '+dm[1]+' from" but '+tn+' has no "export default". It exports: '+([...ex.names].join(', ')||'nothing')+'. Fix: use import { '+dm[1]+' } from ...');}
      if(nm)nm[1].split(',').map(p=>p.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean).forEach(n=>{if(!ex.names.has(n)){problems++;j.say('WRONG IMPORT: '+f.path+' imports { '+n+' } from '+tn+' but that file does not export it. '+(ex.def?'It has "export default" so use: import '+n+' from ...':'It exports: '+([...ex.names].join(', ')||'nothing')));}});
    }
  }
  if(problems){j.say('RESULT: '+problems+' problem(s) found. Send this text to Claude.');j.ok=false;}else{j.say('RESULT: all '+files.length+' files OK. No syntax errors, no broken imports.');j.ok=true;}
}

// ---------- parsing ----------
function parse(text){
  text=text.replace(/\r\n/g,'\n');
  const heads=(text.match(/^@@@ (FILE|EDIT) .+ @@@[ \t]*$/gm)||[]).length;
  const ops=[],re=/^@@@ (FILE|EDIT) (.+?) @@@[ \t]*\n([\s\S]*?)\n@@@ END @@@[ \t]*$/gm;let m;
  while((m=re.exec(text))){
    const o={kind:m[1],path:m[2].trim(),body:m[3]};
    if(o.kind==='EDIT'){
      o.pairs=[];const pr=/--- FIND ---\n([\s\S]*?)\n--- REPLACE ---(?:\n([\s\S]*?))?(?=\n--- FIND ---\n|$)/g;let k;
      while((k=pr.exec(o.body)))o.pairs.push({find:k[1],replace:k[2]||''});
      if(!o.pairs.length)throw new Error('EDIT block for '+o.path+' has no FIND/REPLACE pairs');
    }
    ops.push(o);
  }
  if(ops.length!==heads)throw new Error('Incomplete answer: found '+heads+' block start(s) but only '+ops.length+' with an END line. DeepSeek probably stopped early. Ask it to "continue", or resend that block.');
  return ops;
}
const lines=s=>s===null?0:s.split('\n').length;
function plan(ops,force){
  const cur=new Map(),log=[],get=f=>cur.has(f)?cur.get(f):(fs.existsSync(f)?fs.readFileSync(f,'utf8'):null);
  for(const o of ops){
    const full=safe(o.path),old=get(full);
    if(o.kind==='FILE'){
      const nw=o.body+'\n';
      if(old!==null&&!force&&old.length>2000&&nw.length<old.length*0.5)throw new Error(o.path+' would shrink from '+old.length+' to '+nw.length+' characters. Looks cut off. Tick "allow big shrink" only if that is intended.');
      log.push((old===null?'CREATE    ':'OVERWRITE ')+o.path+'  ('+(old===null?'':lines(old)+' -> ')+lines(nw)+' lines)');cur.set(full,nw);
    }else{
      if(old===null)throw new Error('Cannot edit, file not found: '+o.path);
      let c=old;
      o.pairs.forEach((p,i)=>{
        const n=c.split(p.find).length-1;
        if(n!==1)throw new Error('EDIT '+(i+1)+' in '+o.path+': the FIND text was found '+n+' times (must be exactly 1). First line: '+p.find.split('\n')[0].slice(0,80));
        c=c.replace(p.find,()=>p.replace);
      });
      log.push('EDIT      '+o.path+'  ('+o.pairs.length+' change'+(o.pairs.length>1?'s':'')+', '+lines(old)+' -> '+lines(c)+' lines)');cur.set(full,c);
    }
  }
  return {cur,log};
}
async function syntax(full,content){
  const ext=path.extname(full);
  if(ext==='.json'){try{JSON.parse(content);return null;}catch(e){return rel(full)+': '+e.message;}}
  if(!['.js','.mjs','.cjs'].includes(ext))return null;
  const tmp=path.join(os.tmpdir(),'chk_'+Date.now()+Math.random().toString(36).slice(2)+(ext==='.cjs'?'.cjs':'.mjs'));
  fs.writeFileSync(tmp,content);const r=await run('node',['--check',tmp],20000);fs.unlinkSync(tmp);
  return r.ok?null:rel(full)+':\n'+r.out.split(tmp).join(path.basename(full)).split('\n').slice(0,8).join('\n');
}

// ---------- snapshots: apply / undo / restore ----------
function snapshot(absFiles,label){
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+Math.random().toString(36).slice(2,5),dir=path.join(BK,id),man={id,time:Date.now(),label:label||'',files:[],undone:false};
  fs.mkdirSync(dir,{recursive:true});
  for(const f of absFiles){const ex=fs.existsSync(f);man.files.push({path:rel(f),existed:ex});if(ex){const d=path.join(dir,'files',rel(f));fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(f,d);}}
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(man));return id;
}
function restore(dir,man){
  const out=[];
  for(const f of man.files){
    const full=safe(f.path);
    if(f.existed){fs.mkdirSync(path.dirname(full),{recursive:true});fs.copyFileSync(path.join(BK,dir,'files',f.path),full);out.push('RESTORED '+f.path);}
    else if(fs.existsSync(full)){fs.unlinkSync(full);out.push('REMOVED  '+f.path);}
  }
  return out;
}
function manifests(){
  const out=[];for(const d of fs.readdirSync(BK).sort().reverse()){const mp=path.join(BK,d,'manifest.json');if(fs.existsSync(mp)){try{out.push(JSON.parse(fs.readFileSync(mp,'utf8')));}catch(e){}}}return out;
}
async function apply(text,dry,force){
  const ops=parse(text);
  if(!ops.length)throw new Error('No blocks found. Expected: @@@ FILE path @@@ ... @@@ END @@@');
  const {cur,log}=plan(ops,force);
  const errs=[];
  for(const [f,c] of cur){const e=await syntax(f,c);if(e)errs.push(e);}
  if(errs.length)return{ok:false,log:['REFUSED: the new code has syntax errors. Nothing was changed.'].concat(errs)};
  if(dry)return{ok:true,log:['PREVIEW OK (nothing written yet). Syntax check passed. Click Apply to write these changes:'].concat(log)};
  const id=snapshot([...cur.keys()],'apply');
  for(const [f,c] of cur){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,c,'utf8');}
  log0('APPLIED '+id+' ('+cur.size+' files)');
  const self=[...cur.keys()].some(f=>/^tools\/executor/.test(rel(f)));
  const next=self?['RESTART NEEDED: you changed the Executor itself. Run the start command from tab 5. Help, then reload this page.']:['NEXT: reload the game tab and test it. If it works, click "Save to GitHub". If not, click "Undo last apply".'];
  return{ok:true,log:['APPLIED. Backup id: '+id].concat(log,['Syntax check passed.'],next)};
}
function log0(s){log(s);}
function undo(){
  for(const man of manifests()){
    if(man.undone)continue;
    const out=restore(man.id,man);man.undone=true;fs.writeFileSync(path.join(BK,man.id,'manifest.json'),JSON.stringify(man));
    log('UNDO '+man.id);return{ok:true,log:['UNDID backup '+man.id].concat(out)};
  }
  return{ok:false,log:['Nothing to undo.']};
}
function restoreTo(id){
  const mp=path.join(BK,String(id).replace(/[^\w.-]/g,''),'manifest.json');
  if(!fs.existsSync(mp))return{ok:false,log:['Restore point not found: '+id]};
  const man=JSON.parse(fs.readFileSync(mp,'utf8'));
  const safety=snapshot(man.files.map(f=>safe(f.path)),'before-restore');
  const out=restore(man.id,man);log('RESTORE '+id);
  return{ok:true,log:['Went back to the state from BEFORE apply '+id,'A safety copy of what you had was saved as '+safety+' (restore that to come back).'].concat(out)};
}

// ---------- status ----------
const GROUPS=[
 ['Core game',[['Game loop','src/main.js'],['City and world','src/core/World.js'],['JCB and physics','src/vehicle/Vehicle.js'],['Cameras','src/core/CameraManager.js'],['Old audio','src/audio/AudioManager.js'],['QA tool','src/core/QAManager.js']]],
 ['Built earlier',[['Scoop/dump effects','src/gameplay/JobEffects.js'],['Guide arrow and tutorial','src/gameplay/Guidance.js'],['Job timer logic','src/gameplay/JobManager.js'],['3-second dig animation','src/vehicle/DigAnimator.js'],['Solid traffic','src/core/TrafficPhysics.js'],['New HUD','src/ui/GameUI.js'],['Music and ambience','src/audio/Music.js'],['Sounds (SoundFX)','src/audio/SoundFX.js'],['Sounds (Sfx2)','src/audio/Sfx2.js'],['Dig sounds','src/audio/DigSound.js']]],
 ['Planned (5 prompts)',[['CrazyGames SDK, ads, save, loading','src/core/Portal.js'],['Mobile controls','src/ui/MobileControls.js'],['5 levels and menu','src/gameplay/LevelSystem.js'],['Obstacle course','src/gameplay/SkillCourse.js'],['Signs, props, speed feel','src/core/WorldPolish.js']]]
];
async function status(){
  const files=listFiles(),texts={};
  for(const f of files)if(/\.(js|html)$/.test(f.path))texts[f.path]=fs.readFileSync(path.join(ROOT,f.path),'utf8');
  let done=0,total=0;
  const groups=GROUPS.map(([g,items])=>({group:g,items:items.map(([label,file])=>{
    let p=file;if(!files.find(x=>x.path===p)){const alt=files.find(x=>path.basename(x.path)===path.basename(file));p=alt?alt.path:null;}
    const base=path.basename(file,'.js');let conn=false;
    if(p){conn=p==='src/main.js'||Object.keys(texts).some(k=>k!==p&&new RegExp("[/']"+base+"(\\.js)?['\"]").test(texts[k]));}
    total++;if(p&&conn)done++;
    return{label,file:p||file,exists:!!p,connected:conn};
  })}));
  const git={};
  const b=await run('git',['rev-parse','--abbrev-ref','HEAD'],8000);git.branch=b.ok?b.out.trim():'(no git)';
  const s=await run('git',['status','--porcelain'],8000);git.uncommitted=s.ok?s.out.split('\n').filter(Boolean).length:null;
  const u=await run('git',['rev-list','--count','@{u}..HEAD'],8000);git.unpushed=u.ok?parseInt(u.out):null;
  const lg=await run('git',['log','-1','--format=%cr: %s'],8000);git.last=lg.ok?lg.out.trim():'';
  const history=manifests().slice(0,15).map(m=>({id:m.id,label:m.label||'',time:m.time,files:m.files.map(f=>f.path),undone:m.undone}));
  return{groups,done,total,git,history};
}

// ---------- web page ----------
const PAGE=String.raw`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Executor</title>
<style>
body{margin:0;font:14px system-ui;background:#0f172a;color:#e5e7eb;padding-bottom:80px}#app{max-width:1000px;margin:auto;padding:16px}
h1{font-size:18px;margin:0 0 10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}h3{margin:16px 0 6px;font-size:15px}
nav{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
button{background:#1e293b;color:#e5e7eb;border:1px solid #334155;border-radius:8px;padding:9px 14px;cursor:pointer;font:inherit}
button:hover{background:#334155}button.on,button.pri{background:#d97706;border-color:#d97706;color:#fff}button:disabled{opacity:.5}
button.cp{font-size:12px;padding:5px 10px;margin:8px 0 4px}
textarea{width:100%;height:260px;box-sizing:border-box;background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:10px;font:12px ui-monospace,monospace}
pre{background:#020617;border:1px solid #334155;border-radius:8px;padding:10px;white-space:pre-wrap;max-height:380px;overflow:auto;font:12px ui-monospace,monospace;margin:0 0 6px}
section{display:none}section.on{display:block}.row{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap;align-items:center}
.it{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #1e293b;flex-wrap:wrap}.ok{color:#4ade80}.warn{color:#fbbf24}.bad{color:#f87171}
.bar{height:10px;background:#1e293b;border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:#d97706}
.chip{background:#0f2a1d;border-color:#166534}.badge{padding:4px 10px;border-radius:20px;background:#1e293b;font-weight:700}.sp{animation:bl 1s infinite}@keyframes bl{50%{opacity:.35}}
.dot{display:inline-block;width:11px;height:11px;border-radius:50%;background:#64748b;margin-right:6px}.dot.good{background:#4ade80}.dot.bad{background:#f87171}small{color:#94a3b8}
input[type=text]{background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:9px;flex:1;min-width:160px}
#fbar{position:fixed;left:0;right:0;bottom:0;background:#0b1220;border-top:1px solid #334155;padding:8px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;z-index:9}
li{margin:6px 0}
</style><div id=app><h1>TerraForm Executor <span id=conn><i id=dot class=dot></i><small id=dt>checking...</small></span></h1>
<nav><button data-t=apply class=on>1. Apply</button><button data-t=run>2. Check, Build, Save</button><button data-t=files>3. Files</button><button data-t=status>4. Status</button><button data-t=help>5. Help</button></nav>

<section id=apply class=on>
<p><b>Step 1:</b> paste the answer from DeepSeek. <b>Step 2:</b> click Preview. <b>Step 3:</b> click Apply. <b>Step 4:</b> test the game, then Save to GitHub.</p>
<textarea id=inp placeholder="@@@ FILE src/example.js @@@"></textarea>
<div class=row><label><input type=checkbox id=force> allow a file to shrink a lot</label><label><input type=checkbox id=auto checked> run Check automatically after Apply</label></div>
<div class=row><button id=pst>Paste from clipboard</button><button id=prev>Preview</button><button id=go class=pri>Apply</button><button id=undo>Undo last apply</button><button id=rules>Copy rules for DeepSeek</button><button id=clr>Clear</button></div>
<h3>Result</h3><pre id=out class="out diagout">Ready.</pre>
<h3>Quick actions</h3>
<div class="row jobbtns"></div>
<div class=row><button data-diag=ping>Test connection</button><button data-diag=log>Show server log</button></div>
<div class=jobpanel></div>
</section>

<section id=run>
<h3>Check, build, save</h3>
<div class="row jobbtns"></div>
<h3>Save a backup to GitHub with a label (one click, no typing)</h3>
<div class=row><button class=chip data-job=save data-m="Backup before changes">Before changes</button><button class=chip data-job=save data-m="Backup: game works">Game works</button><button class=chip data-job=save data-m="Backup after fix">After a fix</button><button class=chip data-job=save data-m="">Just save</button></div>
<div class=jobpanel></div>
</section>

<section id=files>
<div class=row><input type=text id=ff placeholder="Filter files (type part of a name)"></div>
<div class=row><button id=cs class=pri>Copy selected files (content)</button><button id=cn>Copy file list (names)</button><button id=sa>Select all shown</button><button id=sn>Select none</button></div>
<p><small>Tick the files DeepSeek needs to see, then click Copy selected. Each file also has its own Copy name and Copy content buttons.</small></p><div id=fl></div></section>

<section id=status><div class=row><button id=rs>Refresh</button><button data-copy="#st">Copy status</button></div><div id=st>Loading...</div></section>

<section id=help>
<h3>Start command (paste in the Terminal tab in Codespaces)</h3>
<pre id=cmd class=out data-label="Copy the start command">cd "$(git rev-parse --show-toplevel)"; pkill -f executor.cjs; nohup node tools/executor.cjs &gt; .executor.log 2&gt;&amp;1 &amp; sleep 2; cat .executor.log</pre>
<ul>
<li>After you replace the Executor file, run the start command again, then reload this page.</li>
<li>Then open the <b>Ports</b> tab in Codespaces and open port <b>3002</b> (the globe icon).</li>
<li>Red dot at the top = the Executor is not running. Run the start command.</li>
<li>Something failed? Click <b>Copy error report</b> at the bottom, then paste it to DeepSeek or Claude. <b>Copy error + related files</b> also adds the content of the files named in the error.</li>
</ul>
<h3>Self-test</h3>
<div class=row><button data-diag=ping>Test connection</button><button data-diag=log>Show server log</button></div>
<pre class="out diagout">Not run yet.</pre>
</section></div>

<div id=fbar><button id=cer class=pri>Copy error report</button><button id=cef>Copy error + related files</button></div>

<script>
const $=s=>document.querySelector(s);
const RULES=["Reply ONLY with blocks in this exact format. No explanations.","","To CREATE or fully REPLACE a file (give the COMPLETE file, never abbreviate):","@@@ FILE path/to/file.js @@@","(complete file)","@@@ END @@@","","To make a SMALL change (FIND text must be copied exactly from my file and appear exactly once):","@@@ EDIT path/to/file.js @@@","--- FIND ---","(exact old text)","--- REPLACE ---","(new text)","@@@ END @@@","","Rules: never write '...' or 'rest of code'. Several blocks are allowed. If you run out of space, stop after a finished block and write CONTINUE."].join("\n");
const BTNS='<button class=pri data-job=check>Check project</button><button class=pri data-job=build>Build check</button><button class=pri data-job=save data-m="">Save to GitHub</button><button data-job=changes>What changed?</button><button data-job=install>Install packages</button>';
const PANEL='<div class=row><span class="badge jb">Idle</span><b class=jt></b><button class=jc data-act=cancel style="display:none">Cancel</button></div><pre class="out joout">Nothing running yet. Click a button above. Live steps and a seconds counter show here.</pre>';
document.querySelectorAll(".jobbtns").forEach(e=>e.innerHTML=BTNS);
document.querySelectorAll(".jobpanel").forEach(e=>e.innerHTML=PANEL);
document.querySelectorAll("pre.out").forEach(p=>{const b=document.createElement("button");b.className="cp";b.textContent=p.dataset.label||"Copy this output";b.onclick=async()=>flash(b,await copy(p.innerText));p.parentNode.insertBefore(b,p);});

async function copy(t){try{await navigator.clipboard.writeText(t);return true;}catch(e){try{const a=document.createElement("textarea");a.value=t;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();const ok=document.execCommand("copy");a.remove();return ok;}catch(e2){return false;}}}
function flash(b,ok){const o=b.dataset.o||b.textContent;b.dataset.o=o;b.textContent=ok===false?"Blocked: select the text and press Ctrl+C":"Copied";setTimeout(()=>{b.textContent=o;},1800);}
async function api(p,b,ms){const c=new AbortController(),tm=setTimeout(()=>c.abort(),ms||25000);try{const r=await fetch(p,b===undefined?{signal:c.signal}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),signal:c.signal});return await r.json();}catch(e){const m=e.name==="AbortError"?"No answer from the Executor after "+Math.round((ms||25000)/1000)+" seconds. Look at the dot at the top. If it is red, run the start command (tab 5. Help).":"Cannot reach the Executor: "+e.message;return{ok:false,error:m,log:["ERROR: "+m]};}finally{clearTimeout(tm);}}
function show(el,j,t0){let t=(j.log||[j.error||"error"]).join("\n");if(t0)t+="\n("+((Date.now()-t0)/1000).toFixed(1)+" s)";el.textContent=t;el.style.borderColor=j.ok===false||j.error?"#f87171":"#4ade80";}
function up(s){return s<90?Math.round(s)+" s":Math.round(s/60)+" min";}
async function beat(){const t=Date.now(),c=new AbortController();setTimeout(()=>c.abort(),2500);try{const r=await fetch("/health",{signal:c.signal}),j=await r.json();$("#dot").className="dot good";$("#dt").textContent="Connected, "+(Date.now()-t)+" ms, running "+up(j.uptime);}catch(e){$("#dot").className="dot bad";$("#dt").textContent="NOT RESPONDING. Run the start command (tab 5. Help).";}}
setInterval(beat,3000);beat();

async function pack(paths){let o="";for(const p of paths){const r=await api("/api/file",{path:p},10000);if(typeof r.content!=="string")continue;o+="@@@ FILE "+p+" @@@\n"+r.content.replace(/\n$/,"")+"\n@@@ END @@@\n\n";}return o.trim();}
async function report(withFiles){
  const r=await api("/api/report",{},8000),jo=document.querySelector(".joout");
  let t="=== RESULT ===\n"+$("#out").innerText+"\n\n=== LAST JOB ===\n"+(jo?jo.innerText:"")+"\n\n=== UNSAVED CHANGES (git) ===\n"+(r.git||"(none)")+"\n\n=== SERVER LOG ===\n"+(r.lines||[]).join("\n")+"\n\n(node "+(r.node||"?")+")";
  if(withFiles){
    const m=t.match(/(?:src\/[\w\/.\-]+\.(?:js|json|html|css)|vite\.config\.js|index\.html|package\.json)/g)||[];
    const found=[...new Set(m)].slice(0,8),packed=found.length?await pack(found):"";
    t=RULES+"\n\nPlease fix the problem described below.\n\n"+t+(packed?"\n\n=== RELATED FILES (current content) ===\n\n"+packed:"");
  }
  return t;
}
async function bigCopy(b,files){b.dataset.o=b.dataset.o||b.textContent;b.textContent="Working...";flash(b,await copy(await report(files)));}
$("#cer").onclick=()=>bigCopy($("#cer"),false);$("#cef").onclick=()=>bigCopy($("#cef"),true);

document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button").forEach(x=>x.classList.remove("on"));b.classList.add("on");document.querySelectorAll("section").forEach(s=>s.classList.remove("on"));$("#"+b.dataset.t).classList.add("on");if(b.dataset.t=="status")loadStatus();if(b.dataset.t=="files")loadFiles();});

async function failNote(o){const ok=await copy(await report(false));o.textContent+="\n\n"+(ok?"The error report was copied automatically. Paste it to DeepSeek or Claude.":"Click Copy error report at the bottom, then paste it to DeepSeek or Claude.");}
const runApply=async dry=>{const t0=Date.now(),o=$("#out");o.textContent=dry?"Checking your paste...":"Applying...";o.style.borderColor="#fbbf24";const j=await api("/api/apply",{text:$("#inp").value,dry,force:$("#force").checked});show(o,j,t0);if(j.ok===false||j.error){await failNote(o);}else if(!dry&&$("#auto").checked)startJob("check");};
$("#pst").onclick=async()=>{try{$("#inp").value=await navigator.clipboard.readText();$("#out").textContent="Pasted "+$("#inp").value.length+" characters. Now click Preview.";}catch(e){$("#out").textContent="The browser blocked it. Click inside the big box and press Ctrl+V instead.";}};
$("#prev").onclick=()=>runApply(true);$("#go").onclick=()=>runApply(false);$("#clr").onclick=()=>{$("#inp").value="";};
$("#undo").onclick=async()=>show($("#out"),await api("/api/undo",{}));
$("#rules").onclick=async()=>{const ok=await copy(RULES);$("#out").textContent=ok?"Rules copied. Paste them at the start of your DeepSeek message.":"The browser blocked copying. Try again.";};

async function restoreSnap(id){if(!confirm("Go back to the state from before this apply?"))return;const j=await api("/api/restore",{id});alert(j.log.join("\n"));loadStatus();}
async function loadStatus(){
  $("#st").textContent="Loading...";const s=await api("/api/status",{});if(!s.groups){$("#st").textContent=(s.log||["error"]).join("\n");return;}
  const pct=Math.round(100*s.done/s.total);let h='<p><b>'+s.done+' of '+s.total+' features built and connected ('+pct+'%)</b></p><div class=bar><i style="width:'+pct+'%"></i></div>';
  s.groups.forEach(g=>{h+='<h3>'+g.group+'</h3>';g.items.forEach(i=>{const c=!i.exists?'bad':i.connected?'ok':'warn';const t=!i.exists?'NOT BUILT':i.connected?'CONNECTED':'BUILT, NOT CONNECTED';h+='<div class=it><span>'+i.label+' <small>'+i.file+'</small></span><b class='+c+'>'+t+'</b></div>';});});
  const g=s.git;h+='<h3>GitHub safety</h3><div class=it><span>Branch</span><b>'+g.branch+'</b></div><div class=it><span>Last save</span><b>'+(g.last||"none")+'</b></div><div class=it><span>Changes not saved yet</span><b class='+(g.uncommitted?'warn':'ok')+'>'+g.uncommitted+'</b></div><div class=it><span>Saved here but not uploaded</span><b class='+(g.unpushed?'warn':'ok')+'>'+(g.unpushed===null?'unknown':g.unpushed)+'</b></div>';
  h+='<h3>Restore points (every Apply makes one)</h3>';
  h+=s.history.map(x=>'<div class=it><span>'+new Date(x.time).toLocaleString()+' <small>'+x.files.slice(0,3).join(", ")+(x.files.length>3?" +"+(x.files.length-3)+" more":"")+(x.undone?" - undone":"")+'</small></span><button data-restore="'+x.id+'">Go back to before this</button></div>').join('')||'<div class=it>None yet</div>';
  $("#st").innerHTML=h;}
$("#rs").onclick=loadStatus;

let FILES=[];
function shown(){const q=$("#ff").value.toLowerCase();return FILES.filter(x=>x.path.toLowerCase().includes(q));}
function drawFiles(){const box=$("#fl");box.innerHTML="";shown().forEach(x=>{
  const d=document.createElement("div");d.className="it";const l=document.createElement("label");
  if(x.text){const cb=document.createElement("input");cb.type="checkbox";cb.dataset.p=x.path;l.appendChild(cb);}
  l.appendChild(document.createTextNode(" "+x.path+" "));const sm=document.createElement("small");sm.textContent=(x.size/1024).toFixed(1)+" KB"+(x.text?"":" (not text, cannot copy)");l.appendChild(sm);d.appendChild(l);
  const r=document.createElement("span");
  const bn=document.createElement("button");bn.textContent="Copy name";bn.className="cp";bn.onclick=async()=>flash(bn,await copy(x.path));r.appendChild(bn);
  if(x.text){const bc=document.createElement("button");bc.textContent="Copy content";bc.className="cp";bc.onclick=async()=>{bc.dataset.o=bc.dataset.o||bc.textContent;bc.textContent="Working...";flash(bc,await copy(await pack([x.path])));};r.appendChild(bc);}
  d.appendChild(r);box.appendChild(d);});}
async function loadFiles(){const f=await api("/api/files",{});FILES=f.files||[];drawFiles();}
$("#ff").oninput=drawFiles;
$("#sa").onclick=()=>document.querySelectorAll("#fl input").forEach(c=>c.checked=true);
$("#sn").onclick=()=>document.querySelectorAll("#fl input").forEach(c=>c.checked=false);
$("#cn").onclick=async()=>flash($("#cn"),await copy(shown().map(x=>x.path+"  ("+(x.size/1024).toFixed(1)+" KB)").join("\n")));
$("#cs").onclick=async()=>{const p=[...document.querySelectorAll("#fl input:checked")].map(x=>x.dataset.p);if(!p.length){alert("Tick at least one file first.");return;}
  const kb=FILES.filter(x=>p.includes(x.path)).reduce((a,x)=>a+x.size,0)/1024;if(kb>400&&!confirm("These files are "+Math.round(kb)+" KB in total. That is a lot for DeepSeek. Copy anyway?"))return;
  const b=$("#cs");b.dataset.o=b.dataset.o||b.textContent;b.textContent="Working...";const ok=await copy(await pack(p));b.textContent="Copied "+p.length+" file(s)";if(!ok)b.textContent="Blocked: try fewer files";setTimeout(()=>b.textContent=b.dataset.o,2200);};

let curJob=null;
function jobUI(j){const lab=j.done?(j.ok?"DONE":"FAILED"):"WORKING...";
  document.querySelectorAll(".jb").forEach(e=>{e.textContent=lab;e.className="badge jb "+(j.done?(j.ok?"ok":"bad"):"warn sp");});
  document.querySelectorAll(".jt").forEach(e=>e.textContent=j.elapsed+" s");
  const col=j.done?(j.ok?"#4ade80":"#f87171"):"#fbbf24";
  document.querySelectorAll(".joout").forEach(p=>{p.textContent=j.log.join("\n");p.style.borderColor=col;p.scrollTop=1e9;});
  document.querySelectorAll(".jc").forEach(e=>e.style.display=j.done?"none":"");}
function setJob(t){document.querySelectorAll(".joout").forEach(p=>p.textContent=t);}
async function watch(id){
  curJob=id;let miss=0;
  for(;;){
    const j=await api("/api/job",{id},6000);
    if(j.error){if(++miss>5){document.querySelectorAll(".joout").forEach(p=>p.textContent+="\nThe Executor stopped or restarted. Run the start command (tab 5. Help).");return;}await new Promise(r=>setTimeout(r,1000));continue;}
    miss=0;if(j.none)return;jobUI(j);
    if(j.done){if(!j.ok){const ok=await copy(await report(false));document.querySelectorAll(".joout").forEach(p=>p.textContent+="\n\n"+(ok?"The error report was copied automatically. Paste it to DeepSeek or Claude.":"Click Copy error report at the bottom, then paste it to DeepSeek or Claude."));}return;}
    await new Promise(r=>setTimeout(r,600));
  }
}
async function startJob(kind,msg){setJob("Starting...");const r=await api("/api/start",{kind,msg:msg||""},8000);if(r.error){setJob(r.error);return;}if(r.busy)setJob("Another job is already running. Showing it here.");watch(r.id);}
async function diag(b){const o=b.closest("section").querySelector(".diagout");
  if(b.dataset.diag==="ping"){o.textContent="Sending a 200 KB test message...";const t0=Date.now(),r=await api("/api/ping",{data:"x".repeat(200000)},10000);o.textContent=r.ok?"OK. The Executor received "+r.bytes+" bytes in "+(Date.now()-t0)+" ms. Connection is fine.":(r.log||[r.error]).join("\n");}
  else{const r=await api("/api/log",{});o.textContent=(r.lines||r.log||[]).join("\n")||"(empty)";o.scrollTop=1e9;}}
document.addEventListener("click",async e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.job)startJob(b.dataset.job,b.dataset.m);
  else if(b.dataset.copy){flash(b,await copy($(b.dataset.copy).innerText));}
  else if(b.dataset.act==="cancel")api("/api/cancel",{id:curJob});
  else if(b.dataset.diag)diag(b);
  else if(b.dataset.restore)restoreSnap(b.dataset.restore);
});
api("/api/job",{id:"last"},4000).then(j=>{if(j&&!j.none&&!j.error&&!j.done)watch(j.id);});
</script>`;

function body(req){return new Promise(r=>{let b='',n=0;req.on('data',c=>{n+=c.length;b+=c;if(n>3e7)req.destroy();});req.on('end',()=>{try{r({o:JSON.parse(b||'{}'),n});}catch(e){r({o:{},n});}});});}
const server=http.createServer(async(req,res)=>{
  const send=(o,c)=>{res.writeHead(c||200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o));};
  try{
    if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(PAGE);}
    if(req.method==='GET'&&req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
    if(req.method==='GET'&&req.url==='/health')return send({status:'ok',uptime:(Date.now()-BOOT)/1000,root:ROOT});
    if(req.method!=='POST')return send({error:'not found'},404);
    const {o:b,n}=await body(req);const t0=Date.now();
    let out;
    if(req.url==='/api/apply')out=await apply(b.text||'',!!b.dry,!!b.force);
    else if(req.url==='/api/undo')out=undo();
    else if(req.url==='/api/restore')out=restoreTo(b.id);
    else if(req.url==='/api/status')out=await status();
    else if(req.url==='/api/files')out={files:listFiles()};
    else if(req.url==='/api/file')out={content:fs.readFileSync(safe(b.path),'utf8')};
    else if(req.url==='/api/ping')out={ok:true,bytes:n};
    else if(req.url==='/api/log')out={lines:LOG.slice(-80)};
    else if(req.url==='/api/report'){const g=await run('git',['status','--short'],8000);out={lines:LOG.slice(-60),git:g.ok?g.out.trim():'(git not available)',node:process.version,root:ROOT};}
    else if(req.url==='/api/start'){
      const busy=[...jobs.values()].find(o=>!o.done);
      if(busy)out={id:busy.id,busy:true};
      else{
        const K={check:jobCheck,build:jobBuild,changes:jobChanges,install:jobInstall,save:jj=>jobSave(jj,b.msg)};
        if(!K[b.kind])out={error:'Unknown job: '+b.kind};
        else{const j=newJob(),fn=K[b.kind](j);
          fn.catch(e=>{j.say('ERROR: '+e.message);j.ok=false;}).finally(()=>{if(!j.done){j.done=true;j.ended=Date.now();}if(j.ok===null)j.ok=false;log('JOB '+b.kind+' '+(j.ok?'ok':'failed'));});out={id:j.id};}
      }
    }
    else if(req.url==='/api/job'){const j=b.id==='last'?[...jobs.values()].pop():jobs.get(b.id);out=j?jobView(j):{none:true};}
    else if(req.url==='/api/cancel'){const j=jobs.get(b.id);if(j&&!j.done){j.cancelled=true;j.say('CANCELLED by you.');j.kids.forEach(k=>k.kill());j.ok=false;j.done=true;j.ended=Date.now();}out={ok:true};}
    else return send({error:'not found'},404);
    if(req.url!=='/api/job'&&req.url!=='/api/log'&&req.url!=='/api/report')log(req.url+' '+(Date.now()-t0)+'ms');
    send(out);
  }catch(e){log('ERROR '+req.url+' '+e.message);send({ok:false,error:e.message,log:['ERROR: '+e.message]},200);}
});
server.on('error',e=>{if(e.code==='EADDRINUSE'){console.log('Port '+PORT+' is already in use. The Executor is probably already running. Open the page, or stop the old one first.');process.exit(3);}throw e;});

// command line fallback: node tools/executor.cjs apply answer.txt [--dry]
if(process.argv[2]==='apply'&&process.argv[3]){
  apply(fs.readFileSync(process.argv[3],'utf8'),process.argv.includes('--dry'),process.argv.includes('--force')).then(r=>{console.log(r.log.join('\n'));process.exit(r.ok?0:1);}).catch(e=>{console.log('ERROR: '+e.message);process.exit(1);});
}else server.listen(PORT,'0.0.0.0',()=>log('Executor v4 running on http://localhost:'+PORT+'  (project: '+ROOT+')'));

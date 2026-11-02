#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'../..');
const ctx=vm.createContext({window:{}});let checks=0;
for(const file of ['data/source-index.js','data/source-code.js','data/licenses.js','content/hardware.js','content/software.js','content/concepts.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const {GSOURCE:I,GCODE:code,GHARDWARE:H,GSOFTWARE:S,GCONCEPTS:C}=ctx.window,repos=new Map(I.repos.map(r=>[r.id,r])),files=new Map(I.files.map(f=>[f[0]+':'+f[1],f]));
const allCh=[...H.chapters,...S.chapters,...C.chapters],allRefs=[],ids=new Set();
function ok(test,message){assert(test,message);checks++;}
const seenLinks=new Set();
for(const ch of allCh){ok(!ids.has(ch.id),'unique chapter '+ch.id);ids.add(ch.id);for(const s of ch.sections){const id=ch.id+'/'+s.id;ok(!ids.has(id),'unique section '+id);ids.add(id);ok(s.html.length>200,'substantive lesson '+id);allRefs.push(...s.refs);for(const m of s.html.matchAll(/(?:href|src)=["']([^"']+)["']/g))seenLinks.add(m[1]);}}
H.modules.forEach(m=>allRefs.push(...m.refs));H.flows.forEach(f=>f.steps.forEach(s=>{ok(H.modules.some(m=>m.id===s.module),'flow module exists');allRefs.push(...s.refs);}));S.quizzes.forEach(q=>{ok(q.answer>=0&&q.answer<q.options.length,'valid correct option');allRefs.push(...q.refs);});C.concepts.forEach(c=>allRefs.push(...c.refs));
ok(new Set(S.quizzes.map(q=>q.answer)).size>1,'correct answers distributed');S.journeys.forEach(j=>j.steps.forEach(id=>ok(allCh.some(c=>c.id===id),'journey chapter exists '+id)));
for(const ref of allRefs){const id=(ref.repo||'gemmini')+':'+ref.path;ok(files.has(id),'reference in source index '+id);ok(id in code,'reference available offline '+id);ok(ref.line>0&&ref.line<=code[id].split(/\r?\n/).length,'source line valid '+id+':'+ref.line);}
for(const [id,text] of Object.entries(code)){const row=files.get(id);ok(!!row,'embedded file indexed '+id);ok(crypto.createHash('sha256').update(text).digest('hex')===row[4],'embedded bytes match original SHA256 '+id);}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g))seenLinks.add(m[1]);
for(const link of seenLinks){if(/^(?:https?:|#|mailto:|data:)/.test(link))continue;const target=path.resolve(root,decodeURIComponent(link.split('#')[0]));ok(target.startsWith(root+path.sep),'local link stays in site '+link);if(link!=='verification.json')ok(fs.existsSync(target),'local file exists '+link);}
for(const file of ['app.js','models.js',...['hardware','software','concepts'].map(x=>'content/'+x+'.js')]){cp.execFileSync(process.execPath,['--check',path.join(root,file)]);checks++;}
for(const repo of I.repos.filter(r=>['gemmini','tests','libgemmini','chipyard','rocc'].includes(r.id))){cp.execFileSync('git',['-C',path.join(workspace,'gemmini',repo.path),'diff','--quiet','--ignore-submodules=all','HEAD']);checks++;}
const report={passed:true,checks,chapters:allCh.length,lessons:allCh.reduce((n,ch)=>n+ch.sections.length,0),concepts:C.concepts.length,quizzes:S.quizzes.length,source_references:allRefs.length,repositories:I.repos.length,indexed_files:I.files.length,embedded_files:Object.keys(code).length,local_resource_links:seenLinks.size,upstream_worktrees_clean:true,scope:'Static integrity, reference ranges, embedded SHA256, schema and JS syntax. Not a proof of prose accuracy or full RTL correctness.'};
fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

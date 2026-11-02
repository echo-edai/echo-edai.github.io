#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const M=require('../models.js');let checks=0,seed=0x6e707531;
const check=(condition,message)=>{assert(condition,message);checks++;};
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
for(let n=2;n<=5;n++)for(let test=0;test<80;test++){
 const A=Array.from({length:n},()=>Array.from({length:n},()=>random()%256-128));
 const B=Array.from({length:n},()=>Array.from({length:n},()=>random()%256-128));
 // Independent triple-loop reference, rather than reuse the model helper.
 const expected=Array.from({length:n},()=>Array(n).fill(0));
 for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<n;k++)expected[i][j]+=A[i][k]*B[k][j];
 for(const mode of ['os','ws']){
  let count=0;const terms=Array.from({length:n},()=>Array(n).fill(0));
  for(let t=-1;t<=3*n-3;t++){
   const state=M.systolic(n,mode,t,A,B);count+=state.events.length;
   for(const e of state.events){const i=mode==='os'?e.r:e.i;terms[i][e.c]+=e.a*e.b;check(e.sum===e.before+e.a*e.b,'MAC recurrence');}
   for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(state.C[i][j]!==null)check(state.C[i][j]===expected[i][j],'completed output matches independent reference');
  }
  check(count===n**3,'exactly one MAC per mathematical term');check(JSON.stringify(terms)===JSON.stringify(expected),'all scheduled terms counted once');
  check(JSON.stringify(M.systolic(n,mode,3*n-3,A,B).C)===JSON.stringify(expected),'all outputs finish');
 }
}
const scheduler=[];
for(const conflict of [false,true])for(const serial of [false,true]){
 let state=M.schedulerInit(conflict),steps=0;
 while(!state.cmds.every(c=>c.state==='done')){
  const old=state;state=M.schedulerStep(state,serial);steps++;check(steps<100,'scheduler makes progress');
  const running=state.cmds.filter(c=>c.state==='running');check(new Set(running.map(c=>c.kind)).size===running.length,'one in-flight operation per controller');
  if(serial)check(running.length<=1,'serial scenario has no overlap');
  state.cmds.forEach((c,i)=>{if(c.start===state.time)for(let j=0;j<i;j++)if(M.hazards(state.cmds[j],c).length)check(state.cmds[j].state==='done','no premature issue before conflict completion');if(c.state==='done')check(c.end-c.start===c.duration,'duration preserved');});
  check(old.cmds!==state.cmds,'state step does not mutate predecessor');
 }
 scheduler.push({conflict,serial,finish:state.time});
}
check(scheduler[0].finish<scheduler[1].finish,'double-buffered overlap reduces ideal scenario duration');
for(const acc of [false,true])for(let row=0;row<(acc?1024:16384);row++){
 const a=M.localAddress(row,acc,acc,acc);check(a.bank*a.perBank+a.bankRow===row,'local row reconstructs from bank / row');check(a.bank<(acc?2:4),'bank in range');check((a.address>>>31)===(acc?1:0),'memory metadata bit');
}
assert.throws(()=>M.localAddress(16384),RangeError);checks++;
for(let a=0;a<16;a++)for(let b=0;b<16;b++){
 const route=M.xyRoute(a,b);check(route[0]===a&&route.at(-1)===b,'route endpoints');check(route.length-1===Math.abs(a%4-b%4)+Math.abs((a>>2)-(b>>2)),'Manhattan shortest path');let turned=false;
 for(let i=1;i<route.length;i++){const dx=route[i]%4-route[i-1]%4,dy=(route[i]>>2)-(route[i-1]>>2);check(Math.abs(dx)+Math.abs(dy)===1,'adjacent router hop');if(dy)turned=true;if(turned)check(!dx,'no X hop after Y turn');}
}
// Explore all reachable abstract directory states with both cores and all events.
const key=s=>JSON.stringify({stable:s.stable,sharers:s.sharers,owner:s.owner,pending:s.pending});
const queue=[M.directoryInit()],seen=new Set(queue.map(key));let transitions=0;
while(queue.length){const s=queue.shift();for(const event of ['read','write','ack','data'])for(const core of (event==='data'?[0]:[0,1])){
 const n=M.directoryEvent(s,event,core);transitions++;
 check(['U','S','M'].includes(n.stable),'legal stable state');check(new Set(n.sharers).size===n.sharers.length,'no duplicate sharer');
 check(n.stable!=='M'||(n.owner!==null&&n.sharers.length===0),'exclusive owner metadata');check(n.stable!=='S'||n.owner===null,'shared state has no exclusive owner');
 if(s.pending&&n.pending===null)check((event==='data'||event==='ack'),'only response can finish an outstanding transaction');
 if(s.pending&&['read','write'].includes(event))check(key(s)===key(n),'new request is backpressured while busy');
 if(n.pending){check(n.pending.acks.every(x=>x===0||x===1),'ack set contains valid targets');check(new Set(n.pending.acks).size===n.pending.acks.length,'ack set has no duplicate');}
 const k=key(n);if(!seen.has(k)){seen.add(k);queue.push(n);}check(seen.size<1000,'bounded abstract state space');
}}
let d=M.directoryInit();d=M.directoryEvent(d,'write',0);d=M.directoryEvent(d,'data');d=M.directoryEvent(d,'write',1);
d=M.directoryEvent(d,'ack',1);check(d.pending.acks.includes(0),'wrong client ACK cannot release owner');d=M.directoryEvent(d,'ack',0);check(d.pending!==null,'all ACKs without data cannot grant');d=M.directoryEvent(d,'data');check(d.stable==='M'&&d.owner===1,'grant after both conditions');
const c=M.capacity();check(c.spBankRows===4096&&c.accBankRows===512&&c.macs===256,'default capacity matches fixed configuration');
const report={passed:true,checks,seed:'0x6e707531',matrix_cases:640,directory_states:seen.size,directory_transitions:transitions,scheduler,scope:'Independent teaching models only; not Gemmini RTL or browser/RTL equivalence.',limitations:['No exact Gemmini timings, resources, double buffering or all protocol states.','Directory assumes responses belong to current transaction; no IDs or probe handshake.']};
fs.writeFileSync(path.join(__dirname,'../research/model-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

// Seeded differential checks: browser transition models vs teaching RTL.
// This is bounded testing, not formal equivalence and not upstream RTL testing.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const M=require('../logic-models.js'),web=path.resolve(__dirname,'..');
let seed=0x4e505531;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
let f=M.fifoInitial(),s=M.scoreboardInitial(),d=M.directoryInitial();
const phase={IDLE:0,PROBE:1,WAIT_ACK:2,RESP:3},perm={I:0,S:1,M:2};
const lines=[];const cycles=300;
for(let cycle=0;cycle<cycles;cycle++){
  const reset=cycle%71===0;
  const fi={reset,valid:!!(random()%3),ready:!!(random()%2),data:random()&255};
  const si={reset,valid:!!(random()%2),resource:!!(random()%3),source:random()&255,destination:1<<(random()%8),wb:random()&255,rollback:random()%7===0?random()&255:0};
  const di={reset,reqValid:!!(random()%2),core:random()%2,write:!!(random()%2),probeReady:!!(random()%2),ackValid:!!(random()%2),ackCore:random()%2,respReady:!!(random()%2)};
  f=M.fifoStep(f,fi).state;s=M.scoreboardStep(s,si).state;d=M.directoryStep(d,di).state;
  lines.push(`@(negedge clk);reset=${+reset};fv=${+fi.valid};fr=${+fi.ready};fd=8'd${fi.data};sv=${+si.valid};sr=${+si.resource};ss=8'd${si.source};sd=8'd${si.destination};sw=8'd${si.wb};sk=8'd${si.rollback};qv=${+di.reqValid};qc=${di.core};qw=${+di.write};pr=${+di.probeReady};av=${+di.ackValid};ac=${di.ackCore};rr=${+di.respReady};@(posedge clk);#1;`);
  lines.push(`if(fcount!==3'd${f.queue.length} || busy!==8'd${s.busy} || phase!==2'd${phase[d.phase]} || perm!==2'd${perm[d.permission]} || sh!==2'd${d.sharers} || own!==1'b${d.owner}) $fatal(1,"state mismatch cycle ${cycle}");`);
  if(f.queue.length&&!reset)lines.push(`if(!fo_valid || fo_data!==8'd${f.queue[0]})$fatal(1,"FIFO data/order mismatch cycle ${cycle}");`);
}
const template=fs.readFileSync(path.join(web,'rtl/tb_learning.sv'),'utf8');
const start=template.indexOf('    initial begin\n        repeat(2)'),end=template.indexOf('    initial begin #20000;',start);
if(start<0||end<0)throw new Error('Teaching testbench structure changed; update crosscheck extraction.');
const testbench=template.slice(0,start)+'    initial begin\n'+lines.join('\n')+`\n$display("PASS: ${cycles} seeded cycles x 3 teaching modules agree with browser models");$finish;end\n`+template.slice(end);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'naplespu-crosscheck-'));
try{
  const tb=path.join(tmp,'tb_cross.sv'),out=path.join(tmp,'cross.vvp');fs.writeFileSync(tb,testbench);
  cp.execFileSync('iverilog',['-g2012','-s','tb_learning','-o',out,...['learn_fifo.sv','learn_scoreboard.sv','learn_directory.sv'].map(f=>path.join(web,'rtl',f)),tb],{encoding:'utf8'});
  const stdout=cp.execFileSync('vvp',[out],{encoding:'utf8',timeout:15000});
  const report={status:'pass',checked_at_utc:new Date().toISOString(),seed:'0x4e505531',cycles,modules:3,scope:'Bounded state/data differential checks of only the three minimal teaching RTL modules and browser models; no upstream NaplesPU testing or formal equivalence proof.',stdout:stdout.trim()};
  fs.mkdirSync(path.join(web,'research'),{recursive:true});fs.writeFileSync(path.join(web,'research/learning-model-crosscheck.json'),JSON.stringify(report,null,2)+'\n');console.log(stdout.trim());
}finally{fs.rmSync(tmp,{recursive:true,force:true});}

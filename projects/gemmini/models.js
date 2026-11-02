/* Independent teaching algorithms. These are not Gemmini RTL simulation. */
(function(root){
  'use strict';
  function matrices(n){return {A:Array.from({length:n},(_,r)=>Array.from({length:n},(_,k)=>(r*3+k*2)%7-3)),B:Array.from({length:n},(_,k)=>Array.from({length:n},(_,c)=>(k+c*2+1)%5-2))};}
  function multiply(A,B){return A.map(row=>B[0].map((_,c)=>row.reduce((s,a,k)=>s+a*B[k][c],0)));}
  function systolic(n,mode,t,A,B){
    const C=Array.from({length:n},()=>Array(n).fill(null)),cells=[],events=[];
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){
      if(mode==='os'){
        const k=t-r-c, count=Math.min(n,Math.max(0,k+1));
        const sum=A[r].slice(0,count).reduce((s,a,q)=>s+a*B[q][c],0);
        const event=k>=0&&k<n?{r,c,k,a:A[r][k],b:B[k][c],sum,before:sum-A[r][k]*B[k][c]}:null;
        cells.push({r,c,value:sum,hot:!!event,done:count===n,event});
        if(event)events.push(event);
        if(count===n)C[r][c]=sum;
      }else{
        const i=t-r-c,hot=i>=0&&i<n;
        const sum=hot?A[i].slice(0,r+1).reduce((s,a,k)=>s+a*B[k][c],0):null;
        const event=hot?{r,c,i,k:r,a:A[i][r],b:B[r][c],sum,before:sum-A[i][r]*B[r][c]}:null;
        cells.push({r,c,value:B[r][c],hot,done:false,event});
        if(event)events.push(event);
      }
    }
    if(mode==='ws')for(let i=0;i<n;i++)for(let c=0;c<n;c++)if(t>=i+n-1+c)C[i][c]=A[i].reduce((s,a,k)=>s+a*B[k][c],0);
    return {C,cells,events,last:3*n-3,cycles:3*n-2};
  }
  const intersects=(a,b)=>a.some(x=>b.includes(x));
  function hazards(older,younger){const h=[];if(intersects(older.w,younger.r))h.push('RAW');if(intersects(older.r,younger.w))h.push('WAR');if(intersects(older.w,younger.w))h.push('WAW');return h;}
  function commands(conflict=false){return [
    {id:'L0',kind:'LD',r:[],w:['sp0'],label:'A₀ → sp[0]',duration:3},
    {id:'L1',kind:'LD',r:[],w:['sp16'],label:'B → sp[16]',duration:3},
    {id:'E0',kind:'EX',r:['sp0','sp16'],w:['acc0'],label:'C₀ ← A₀ × B',duration:5},
    {id:'S0',kind:'ST',r:['acc0'],w:[],label:'acc[0] → DRAM',duration:3},
    {id:'L2',kind:'LD',r:[],w:[conflict?'sp0':'sp32'],label:conflict?'A₁ → sp[0]':'A₁ → sp[32]',duration:3},
    {id:'E1',kind:'EX',r:[conflict?'sp0':'sp32','sp16'],w:[conflict?'acc0':'acc16'],label:'C₁ ← A₁ × B',duration:5},
    {id:'S1',kind:'ST',r:[conflict?'acc0':'acc16'],w:[],label:'C₁ → DRAM',duration:3}
  ].map(x=>({...x,state:'waiting',remaining:0,start:null,end:null}));}
  function schedulerInit(conflict=false){return {time:-1,cmds:commands(conflict),log:[]};}
  function schedulerStep(state,serial=false){
    const next={time:state.time+1,cmds:state.cmds.map(c=>({...c})),log:[]};
    for(const c of next.cmds)if(c.state==='running'&&--c.remaining===0){c.state='done';c.end=next.time;next.log.push(`${c.id} 完成，释放依赖`);}
    const busy=new Set(next.cmds.filter(c=>c.state==='running').map(c=>c.kind));
    for(let i=0;i<next.cmds.length;i++){
      const c=next.cmds[i];if(c.state!=='waiting'||busy.has(c.kind))continue;
      if(serial&&next.cmds.some(x=>x.state==='running'))continue;
      const deps=next.cmds.slice(0,i).filter(p=>p.state!=='done'&&(serial||hazards(p,c).length));
      if(deps.length)continue;
      c.state='running';c.remaining=c.duration;c.start=next.time;busy.add(c.kind);next.log.push(`${c.id} 发射到 ${c.kind}`);
    }
    return next;
  }
  function dependencies(cmds,i){return cmds.slice(0,i).filter(p=>p.state!=='done').map(p=>({id:p.id,h:hazards(p,cmds[i])})).filter(x=>x.h.length);}
  function capacity(n=16,spKiB=256,accKiB=64,banks=4){
    const spRowBytes=n,accRowBytes=n*4;
    return {n,spKiB,accKiB,banks,macs:n*n,spRowBytes,accRowBytes,spRows:spKiB*1024/spRowBytes,accRows:accKiB*1024/accRowBytes,spBankRows:spKiB*1024/spRowBytes/banks,accBankRows:accKiB*1024/accRowBytes/2};
  }
  function localAddress(row,acc=false,accumulate=false,full=false){
    const limit=acc?1024:16384,perBank=acc?512:4096;
    if(!Number.isInteger(row)||row<0||row>=limit)throw new RangeError('row outside default capacity');
    const address=((acc?0x80000000:0)+(accumulate?0x40000000:0)+(full?0x20000000:0)+row)>>>0;
    return {address,hex:'0x'+address.toString(16).padStart(8,'0'),bank:Math.floor(row/perBank),bankRow:row%perBank,perBank};
  }
  function xyRoute(start,end){const nodes=[start];let x=start%4,y=Math.floor(start/4);const ex=end%4,ey=Math.floor(end/4);while(x!==ex){x+=Math.sign(ex-x);nodes.push(y*4+x);}while(y!==ey){y+=Math.sign(ey-y);nodes.push(y*4+x);}return nodes;}
  function directoryInit(){return {stable:'U',sharers:[],owner:null,pending:null,log:['初态 U：无缓存副本。数据内容未建模。']};}
  function directoryEvent(s,event,core=0){
    const n=JSON.parse(JSON.stringify(s));n.log=[];
    if(event==='reset')return directoryInit();
    if(event==='read'||event==='write'){
      if(n.pending){n.log.push('背压：前一个事务尚未完成，不接受新请求。');return n;}
      if((n.stable==='M'&&n.owner===core)||(event==='read'&&n.stable==='S'&&n.sharers.includes(core))){n.log.push(`Core ${core} 权限命中，无目录转换。`);return n;}
      let acks=[],needsData=true;
      if(event==='read'&&n.stable==='M')acks=[n.owner];
      if(event==='write'&&n.stable==='S'){acks=n.sharers.filter(x=>x!==core);needsData=!n.sharers.includes(core);}
      if(event==='write'&&n.stable==='M')acks=[n.owner];
      n.pending={event,core,acks,dataReady:!needsData,oldOwner:n.owner};
      n.log.push(`${event==='read'?'GetS':'GetM'}(Core ${core})：锁定单行事务；待 ACK=[${acks}]；${needsData?'等待数据响应':'已有数据'}。`);
    }else if(event==='data'){
      if(!n.pending){n.log.push('没有事务，数据响应被忽略。');return n;}
      n.pending.dataReady=true;n.log.push('数据已到达；继续检查失效 / 降级确认。');
    }else if(event==='ack'){
      if(!n.pending||!n.pending.acks.includes(core)){n.log.push(`ACK ${core} 不属于当前等待集合，不计数。`);return n;}
      n.pending.acks=n.pending.acks.filter(x=>x!==core);n.log.push(`Core ${core} 确认；移出等待集合。`);
    }
    if(n.pending&&n.pending.dataReady&&n.pending.acks.length===0){
      const p=n.pending;
      if(p.event==='write'){n.stable='M';n.owner=p.core;n.sharers=[];}
      else{n.stable='S';n.sharers=[...new Set([...n.sharers,...(p.oldOwner===null?[]:[p.oldOwner]),p.core])];n.owner=null;}
      n.pending=null;n.log.push(`条件满足，授予${p.event==='write'?'独占写':'共享读'}权限。`);
    }
    return n;
  }
  const api={matrices,multiply,systolic,hazards,schedulerInit,schedulerStep,dependencies,capacity,localAddress,xyRoute,directoryInit,directoryEvent};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GMODELS=api;
})(typeof window!=='undefined'?window:globalThis);

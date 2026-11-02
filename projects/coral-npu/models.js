/* Small teaching models. They are not a Coral NPU simulator. */
(function(root){
  'use strict';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Math.floor(Number(n)||0)));
  function vectorPlan({vlen=128,sew=32,lmul=1,vl=4,mask=[]}={}){
    const vlmax=Math.floor(vlen/sew*lmul),length=clamp(vl,0,vlmax);
    return {vlen,sew,lmul,vl:length,vlmax,registers:lmul,lanes:Array.from({length:vlmax},(_,i)=>{
      const active=i<length&&mask[i]!==false,a=i+1,b=i*2+1;
      return {i,a,b,active,tail:i>=length,masked:mask[i]===false,result:active?a+b:null};
    })};
  }
  function bankPlan(addresses,banks=4,wordBytes=4,pending=null){
    const left=pending===null?addresses.map((_,i)=>i):pending.slice(),occupied=new Set(),grants=[],wait=[];
    for(const i of left){const bank=Math.floor(addresses[i]/wordBytes)%banks;if(!occupied.has(bank)){occupied.add(bank);grants.push({id:i,bank,address:addresses[i]});}else wait.push(i);}
    return {banks,wordBytes,grants,pending:wait,mapping:addresses.map(a=>Math.floor(a/wordBytes)%banks),conflicts:left.length-grants.length};
  }
  function tilePlan({m=40,n=64,k=128,tm=16,tn=16,tk=16,bytes=1,tcmKB=32,doubleBuffer=true}={}){
    const rows=Math.ceil(m/tm),cols=Math.ceil(n/tn),depth=Math.ceil(k/tk);
    const operandBytes=(tm*tk+tk*tn)*bytes*(doubleBuffer?2:1),accumulatorBytes=tm*tn*4;
    const footprint=operandBytes+accumulatorBytes;
    return {m,n,k,tm,tn,tk,rows,cols,depth,operandBytes,accumulatorBytes,footprint,capacity:tcmKB*1024,fits:footprint<=tcmKB*1024,steps:rows*cols*depth,operations:2*m*n*k,logicalUtilization:m*n/(rows*tm*cols*tn)};
  }
  function xyRoute(source=0,destination=15,size=4){
    let x=source%size,y=Math.floor(source/size);const dx=destination%size,dy=Math.floor(destination/size),path=[source];
    while(x!==dx){x+=x<dx?1:-1;path.push(y*size+x);}
    while(y!==dy){y+=y<dy?1:-1;path.push(y*size+x);}
    return path;
  }
  function addressRegion(address,highmem=false){
    const regions=highmem?[{name:'ITCM',start:0,size:1048576},{name:'DTCM',start:1048576,size:1048576},{name:'CSR',start:2097152,size:4096}]:[{name:'ITCM',start:0,size:8192},{name:'DTCM',start:65536,size:32768},{name:'CSR',start:196608,size:4096}];
    const selected=regions.find(r=>address>=r.start&&address<r.start+r.size);
    return {address,regions,selected:selected?.name||'External / 未命中本地窗口',offset:selected?address-selected.start:null};
  }
  const api={vectorPlan,bankPlan,tilePlan,xyRoute,addressRegion,clamp};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CORAL_MODELS=api;
})(typeof window==='undefined'?{}:window);

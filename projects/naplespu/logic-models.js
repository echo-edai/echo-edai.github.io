/* Deterministic transition models for web/rtl teaching prototypes only. */
(function(root){
  'use strict';
  const fifoInitial=()=>({queue:[],cycle:0});
  function fifoStep(state,input){
    if(input.reset)return {state:fifoInitial(),event:'reset：计数与指针回到空队列'};
    const queue=state.queue.slice(),inReady=queue.length<4,outValid=queue.length>0;
    const push=!!input.valid&&inReady,pop=!!input.ready&&outValid,head=outValid?queue[0]:null;
    if(pop)queue.shift();if(push)queue.push(Number(input.data)&255);
    const event=`push=${+push}, pop=${+pop}${pop?'，消费 '+head:''}${push?'，写入 '+(Number(input.data)&255):''}${input.valid&&!inReady?'；旧状态 full，拒绝写入':''}${input.ready&&!outValid?'；旧状态 empty，无数据可读':''}`;
    return {state:{queue,cycle:state.cycle+1},event,signals:{inReady,outValid,push,pop,head}};
  }
  const scoreboardInitial=()=>({busy:0,cycle:0});
  function scoreboardStep(state,input){
    if(input.reset)return {state:scoreboardInitial(),event:'reset：busy 清零'};
    const source=input.source&255,destination=input.destination&255,clear=((input.wb||0)|(input.rollback||0))&255;
    const raw=!!(state.busy&source),waw=!!(state.busy&destination),ready=!!input.resource&&!raw&&!waw;
    const accepted=!!input.valid&&ready,set=accepted?destination:0,busy=((state.busy&~clear)|set)&255;
    const event=`RAW=${+raw}, WAW=${+waw}, issue_fire=${+accepted}；clear=0x${clear.toString(16).padStart(2,'0')}，set=0x${set.toString(16).padStart(2,'0')} → busy=0x${busy.toString(16).padStart(2,'0')}`;
    return {state:{busy,cycle:state.cycle+1},event,signals:{raw,waw,ready,accepted,clear,set}};
  }
  const directoryInitial=()=>({permission:'I',sharers:0,owner:0,phase:'IDLE',pendingCore:0,pendingWrite:false,target:0,cycle:0});
  function directorySignals(state,input={}){
    return {reqReady:state.phase==='IDLE',probeValid:state.phase==='PROBE',probeCore:state.target,probeDowngrade:!state.pendingWrite,
      ackReady:state.phase==='WAIT_ACK'&&Number(input.ackCore||0)===state.target,respValid:state.phase==='RESP',respCore:state.pendingCore,respModified:state.permission==='M'};
  }
  function directoryStep(state,input){
    if(input.reset)return {state:directoryInitial(),event:'reset：权限 I，sharers=00，返回 IDLE'};
    const next={...state,cycle:state.cycle+1},signals=directorySignals(state,input);let event='保持：当前没有可接受的握手';
    if(state.phase==='IDLE'&&input.reqValid){
      const core=Number(input.core)&1,one=1<<core,others=state.sharers&~one;
      next.pendingCore=core;next.pendingWrite=!!input.write;
      if((input.write&&others)||(!input.write&&state.permission==='M'&&state.owner!==core)){
        next.target=1-core;next.phase='PROBE';event=`接受 C${core} ${input.write?'写':'读'}请求；锁存身份，向 C${next.target} ${input.write?'发失效':'发降级'}探针，尚不授予新权限`;
      }else{
        if(input.write){next.permission='M';next.owner=core;next.sharers=one;}
        else if(state.permission!=='M'){next.permission='S';next.sharers=state.sharers|one;}
        next.phase='RESP';event=`接受 C${core} ${input.write?'写':'读'}请求，无远端权限需回收，准备响应`;
      }
    }else if(state.phase==='PROBE'&&input.probeReady){next.phase='WAIT_ACK';event=`C${state.target} 接收探针；等待它完成并确认`;
    }else if(state.phase==='WAIT_ACK'&&input.ackValid){
      if(signals.ackReady){
        if(state.pendingWrite){next.permission='M';next.owner=state.pendingCore;next.sharers=1<<state.pendingCore;}
        else{next.permission='S';next.sharers=state.sharers|(1<<state.pendingCore);}
        next.phase='RESP';event=`接受目标 C${state.target} 的 ACK，更新权限元数据并向 C${state.pendingCore} 准备响应`;
      }else event=`C${input.ackCore} 不是当前目标 C${state.target}：ack_ready=0，不消费这条 ACK`;
    }else if(state.phase==='RESP'&&input.respReady){next.phase='IDLE';event=`C${state.pendingCore} 接收响应，当前事务完成，可接受下一个请求`;
    }else if(input.reqValid&&!signals.reqReady)event='req_ready=0：当前事务尚未收尾，第二个请求没有被接受';
    return {state:next,event,signals};
  }
  const api={fifoInitial,fifoStep,scoreboardInitial,scoreboardStep,directoryInitial,directorySignals,directoryStep};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NPU_LOGIC=api;
})(typeof window==='undefined'?{}:window);

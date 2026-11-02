/* NaplesPU learning atlas. Local, buildless, source-linked and dependency-free. */
(() => {
  'use strict';
  const H=window.NPU_HARDWARE||{chapters:[],modules:[],pipeline:[],coherence:[]};
  const S=window.NPU_SOFTWARE||{chapters:[],glossary:[],quizzes:[],journeys:[]};
  const R=window.NPU_RESEARCH||{tools:[]};
  const deep=[window.NPU_DEEP_CORE,window.NPU_DEEP_NOC,window.NPU_DEEP_MEMORY].filter(Boolean);
  const concepts=deep.flatMap(d=>d.concepts||[]);
  const workshops=deep.flatMap(d=>d.workshops||(d.workshop?[d.workshop]:[]));
  const quizzes=[...S.quizzes,...deep.flatMap(d=>d.quizzes||[])];
  const LOGIC=window.NPU_LOGIC;
  const INDEX=window.NPU_SOURCE_INDEX||{files:[],groups:[],repositories:[],total:0};
  const upstreamCode=window.NPU_SOURCE_CODE||{};
  const CODE={...upstreamCode,...(window.NPU_TEACHING_RTL||{})};
  const chapters=[...H.chapters,...S.chapters,...deep.flatMap(d=>d.chapters||[])];
  const files=INDEX.files;
  const publication=window.NPU_PUBLICATION;
  const publishedSources=new Set(publication?.localSources||[]);
  const fileMap=new Map(files.map(f=>[f.p,f]));
  const moduleMap=new Map(H.modules.map(m=>[m.id,m]));
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const inline=v=>esc(v).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\n/g,'<br>');
  const size=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
  const sourceRef=(path,line=1,label)=>`<button class="source-ref" data-source="${esc(path)}" data-line="${Number(line)||1}">${esc(label||path.split('/').pop())}<span>:${Number(line)||1}</span></button>`;
  const refs=arr=>(arr||[]).map(s=>sourceRef(s.path||s.file,s.line,s.label)).join('');
  function stored(key,fallback){try{return JSON.parse(localStorage.getItem('npu-atlas:'+key))??fallback;}catch{return fallback;}}
  function save(key,value){try{localStorage.setItem('npu-atlas:'+key,JSON.stringify(value));}catch{toast('浏览器未允许本地保存；可使用导出功能。');}}
  const state={read:new Set(stored('read',[])),answers:stored('answers',{}),notes:stored('notes',''),sourceGroup:'all',sourcePage:0,sourceMatches:files,map:'mesh',tile:0,module:'core',flowStep:0,flowTimer:null,lab:'mask',mask:Array(16).fill(true),waiting:new Set([2,5]),issuedThread:-1,threadHistory:[],coherenceStep:0};
  Object.assign(state,{build:0,buildStep:0,conceptFilter:'all',logic:'fifo',fifo:LOGIC.fifoInitial(),scoreboard:LOGIC.scoreboardInitial(),directory:LOGIC.directoryInitial(),logicHistory:{fifo:[],scoreboard:[],directory:[]}});
  let toastTimer;
  function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2500);}
  function downloadText(name,text,type='text/markdown;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function scrollTo(id){if(id.startsWith('concept-')){state.conceptFilter='all';$('#concept-query').value='';renderConcepts();const card=document.getElementById(id);if(card)card.open=true;}document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('#sidebar').classList.remove('open');}

  function renderJourneys(){
    $('#journey-cards').innerHTML=S.journeys.map((j,i)=>`<article class="journey-card"><div class="eyebrow">LEARNING PATH / 0${i+1}</div><h3>${esc(j.title.replace(/^路线\s+[A-Z]\s*·\s*/,''))}</h3><p>${esc(j.audience)}</p><ol>${j.steps.map(s=>`<li><a href="#${esc(s.chapter)}">${esc(s.title)}</a></li>`).join('')}</ol><a class="text-button" href="#${esc(j.steps[0]?.chapter||'course')}">沿这条路线开始 ↗</a></article>`).join('');
  }

  function renderCourse(){
    $('#chapter-count').textContent=`${chapters.length} CHAPTERS`;
    $('#course-description').textContent=`${chapters.length} 章 · ${chapters.reduce((n,c)=>n+c.sections.length,0)} 个知识小节 · 每条关键解释回到具体实现。`;
    $('#chapter-nav').innerHTML=chapters.map((c,i)=>`<a class="chapter-nav-item${state.read.has(c.id)?' completed':''}" href="#${esc(c.id)}" data-chapter-nav="${esc(c.id)}"><b>${state.read.has(c.id)?'✓':String(i+1).padStart(2,'0')}</b>${esc(c.title)}</a>`).join('')+`<a href="#glossary">↳ 概念词典</a><a href="#checkpoint">↳ 理解自测</a><a href="#methods">↳ 方法与来源</a>`;
    $('#chapters').innerHTML=chapters.map((c,i)=>`<article class="chapter" id="${esc(c.id)}"><header class="chapter-header"><span class="chapter-number">${String(i+1).padStart(2,'0')}</span><div class="chapter-heading-text"><div class="eyebrow">${esc(c.eyebrow||'SOURCE DEEP DIVE')}</div><h2>${esc(c.title)}</h2><p class="chapter-summary">${inline(c.summary)}</p></div><button class="read-toggle${state.read.has(c.id)?' completed':''}" data-read="${esc(c.id)}">${state.read.has(c.id)?'✓ 已读':'○ 标记已读'}</button></header><div class="chapter-body">${c.sections.map(section=>`<section class="knowledge-section"><h3>${esc(section.title)}</h3>${(section.paragraphs||[]).map(p=>`<p>${inline(p)}</p>`).join('')}${section.bullets?.length?`<ul>${section.bullets.map(p=>`<li>${inline(p)}</li>`).join('')}</ul>`:''}${section.table?`<div class="table-wrap"><table><thead><tr>${section.table.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row=>`<tr>${row.map(cell=>`<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}${section.code?`<pre><code>${esc(section.code.text)}</code></pre>`:''}${section.note?`<div class="knowledge-note ${esc(section.note.type)}"><b>${{fact:'源码事实',inference:'静态推导',limit:'验证边界'}[section.note.type]||'说明'}</b>${inline(section.note.text)}</div>`:''}${section.sources?.length?`<div class="sources-line">${refs(section.sources)}</div>`:''}</section>`).join('')}</div><div class="chapter-end"><span>读完后尝试：用自己的话解释一个输入、一个状态和一个完成条件。</span><button class="read-toggle${state.read.has(c.id)?' completed':''}" data-read="${esc(c.id)}">${state.read.has(c.id)?'✓ 已读':'○ 标记已读'}</button></div></article>`).join('');
    updateProgress();
  }
  function updateProgress(){
    const count=chapters.filter(c=>state.read.has(c.id)).length,pct=chapters.length?Math.round(count/chapters.length*100):0;
    $('#progress-value').textContent=pct+'%';$('#progress-bar').style.width=pct+'%';$('#progress-detail').textContent=`${count} / ${chapters.length} 章已读 · 浏览器本地保存`;
    $$('[data-read]').forEach(b=>{const done=state.read.has(b.dataset.read);b.classList.toggle('completed',done);b.textContent=done?'✓ 已读':'○ 标记已读';});
    $$('[data-chapter-nav]').forEach((a,i)=>{const done=state.read.has(a.dataset.chapterNav);a.classList.toggle('completed',done);a.querySelector('b').textContent=done?'✓':String(i+1).padStart(2,'0');});
  }

  function renderMap(){
    const canvas=$('#architecture-canvas');
    $$('[data-map]').forEach(b=>b.setAttribute('aria-selected',b.dataset.map===state.map));
    if(state.map==='mesh'){
      canvas.innerHTML=`<div class="mesh-grid">${Array.from({length:16},(_,i)=>{const type=i<8?'core':i<14?'dir':i===14?'host':'mem';return `<button class="tile ${type}${state.tile===i?' selected':''}" data-tile="${i}" aria-label="Tile ${i} ${type}"><b>${String(i).padStart(2,'0')} · ${i<8?'NPU':i<14?'DIR':i===14?'HOST':'MEM'}</b><small>${i<8?'core · L1 · directory':i<14?'directory · 无计算核':i===14?'item I/O · directory':'memory I/O · directory'}</small><small>NI ⇄ R · (${i%4},${Math.floor(i/4)})</small></button>`;}).join('')}</div><div class="mesh-caption">ID = y × 4 + x · X → / Y ↓ · 相邻双向链路</div>`;
      renderTileDetail();
    }else if(state.map==='tile'){
      canvas.innerHTML=`<div class="tile-structure"><div class="module-grid">${moduleButton('core','计算核心','16 lanes · 8 threads','wide')}${moduleButton('l1-wrapper','l1d_cache 包装','core_interface + CC')}${moduleButton('directory','目录 / L2','home 事务与共享记录')}${moduleButton('sync','服务 / 同步','boot · barrier · I/O')}</div><div class="module-connect">↕ coherence request / response / forwarded / service ↕</div><div class="module-grid">${moduleButton('network-interface','Network Interface','packet ⇄ flit','wide')}${moduleButton('router','Router · LOCAL','4 个邻居端口 + LOCAL','wide')}</div><div class="mesh-caption">取指请求 TC → 目录；回填经 CC stage1 分派 → TC，不访问数据 L1 阵列</div></div>`;
      renderModuleDetail(state.module==='core'?'tile':state.module);
    }else{
      canvas.innerHTML=`<div class="tile-structure"><div class="core-front">${moduleButton('fetch','Fetch','线程 PC / I-cache')}${moduleButton('decode','Decode','内部指令结构')}${moduleButton('instruction-buffer','IB','线程 FIFO')}${moduleButton('scheduler','Scheduler','依赖 / 资源')}${moduleButton('operand-fetch','Operand','SRF / VRF')}</div><div class="module-connect">前端从左到右 →　operand_fetch 按 pipe_sel 分派 ↓</div><div class="module-grid">${moduleButton('integer','INT','整数 / 特定跳转结果')}${moduleButton('floating','FP','可选浮点管线')}${moduleButton('lsu','LSU','共享内存 / I/O')}${moduleButton('scratchpad','SPM','独立 banked memory')}${moduleButton('branch','Branch Control','重定向信息')}${moduleButton('barrier','Barrier','ACCOUNT / RELEASE')}</div><div class="module-connect">INT / FP / LSU / SPM → Writeback　｜　Branch / LSU / SPM → Rollback</div><div class="module-grid">${moduleButton('writeback','Writeback','结果 → 寄存器 / scoreboard')}${moduleButton('rollback','Rollback','PC 恢复 / flush')}${moduleButton('thread-control','Thread Control','取指资格 / miss 唤醒')}</div><div class="mesh-caption">反馈返回到前端 / 调度器，不把这些模块当成统一串行流水级</div></div>`;
      renderModuleDetail(state.module);
    }
    if(state.map!=='mesh')canvas.insertAdjacentHTML('beforeend',`<details class="module-catalog"><summary>浏览全部 ${H.modules.length} 个关键模块</summary><div>${H.modules.map(m=>`<button class="group-button" data-module="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div></details>`);
  }
  function moduleButton(id,label,sub,extra=''){return `<button class="module-node ${extra}${state.module===id?' selected':''}" data-module="${id}"><b>${esc(label)}</b><small>${esc(sub)}</small></button>`;}
  function renderTileDetail(){
    const id=state.tile,type=id<8?'npu':id<14?'directory':id===14?'host':'memory';
    const defs={npu:{title:'NPU 计算 tile',file:'tile_npu.sv',line:268,text:'计算核心、数据 L1 包装、目录控制器、NI 与 router 汇集在同一 tile。执行应用，也承载本地目录与通信服务。',items:['16 lanes × 32 bit 向量数据','默认 8 个线程，私有 PC / 寄存器上下文','目录与计算核心是不同模块'],mod:'tile'},directory:{title:'无计算核的目录 tile',file:'tile_none.sv',line:184,text:'没有 npu_core，仍然有 directory_controller、network_interface_core 和 router。它依然可以成为某个地址的 home。',items:['不是空白网络位置','路由器继续转发邻居流量','目录服务与是否存在计算核无关'],mod:'directory'},host:{title:'Host 接口 tile',file:'tile_h2c.sv',line:62,text:'外部 item 接口通过 host 服务消息接入系统。此处还有目录、NI、路由器以及 I/O 处理。',items:['默认位置 ID 14','32-bit item 数据接口','控制流是网络服务的一部分'],mod:'host'},memory:{title:'Memory 接口 tile',file:'tile_mc.sv',line:144,text:'npu2memory 将网络侧存储消息连接到系统外部块存储接口。这里仍有目录与网络转发功能。',items:['默认位置 ID 15','32-bit 地址 / 512-bit 块数据','64-bit dirty mask，不是 64-bit 数据总线'],mod:'memory'}};
    const d=defs[type];
    $('#architecture-detail').innerHTML=`<span class="detail-id">TILE ${String(id).padStart(2,'0')} / (${id%4},${Math.floor(id/4)})</span><h3>${d.title}</h3><p>${d.text}</p><ul>${d.items.map(x=>`<li>${x}</li>`).join('')}</ul>${sourceRef('source/hardware/src/mc/tile/'+d.file,d.line)}<p><button class="text-button" data-map-switch="tile">继续看计算 tile 内部 →</button></p><p class="small-muted">默认实例类型来自 npu_noc 的 generate 分支；这里没有修改 RTL 配置。</p>`;
  }
  function renderModuleDetail(id){
    const aliases={'l1-wrapper':'cache-controller','sync':'sync-master','host':'system','memory':'system'};
    const mod=moduleMap.get(id)||moduleMap.get(aliases[id])||moduleMap.get('core');
    if(!mod)return;
    $('#architecture-detail').innerHTML=`<span class="detail-id">MODULE / ${esc(mod.group.toUpperCase())}</span><h3>${esc(mod.name)}</h3><p>${esc(mod.summary)}</p><p><b>输入 / 观察入口</b><br>${mod.inputs.map(x=>`<code>${esc(x)}</code>`).join(' ')}</p><p><b>输出 / 完成证据</b><br>${mod.outputs.map(x=>`<code>${esc(x)}</code>`).join(' ')}</p>${sourceRef(mod.file,mod.line)}<p>${mod.related.filter(id=>moduleMap.has(id)).map(id=>`<button class="text-button" data-module="${esc(id)}">${esc(moduleMap.get(id).name)} ↗</button>`).join('<br>')}</p>`;
  }

  const scenarioExplanations={
    vector:['选择一个已启用、可取指的线程；使用该线程自己的 PC。','opcode、源/目的编号、立即数等展开成内部结构。','该线程 FIFO 保存待发射指令，并不是整个核只有一个指令流。','源/目的 busy 位与后端可用性满足后，该线程的一条指令获得发射。','读取线程私有向量寄存器。标量操作数可广播；lane mask 随指令传递。','本例进入 int_pipe 的 SIMD 运算。lane 数表示同条指令的数据并行。','结果按 mask/byte enable 更新目标；wb_result 反馈调度器释放依赖。'],
    load:['取指阶段本身也可能 miss；取指请求与数据 load 需要分别追踪。','识别 load 的寄存器、类型与 pipe_sel；此时尚不意味着数据已取得。','load 等待所在 FIFO 的发射机会；LSU 压力也会回压。','基址/目标寄存器依赖及写回/访存资源共同影响 can_issue。','读取基址/偏移、形成有效地址；coherency / I/O 区域选择影响后续路径。','LSU 命中可本地继续；未命中经 CC/NI/home 协调，等待并唤醒。不是每次 load 都访问外部内存。','load 数据完成写回后才解除目标寄存器依赖；等待期间其他就绪线程可被选择。'],
    branch:['每线程 PC 支持随后按线程恢复；别把全部线程画成一个 PC。','分支类型、条件源和地址相关字段被译码。','仍保留每线程的有序队列，rollback 可取消该线程旧路径。','分支相关操作数和控制依赖需要满足，不能任意跨依赖发射。','从寄存器读取分支条件和目标相关操作数。','branch_control 产生重定向信息，rollback_handler 汇合分支及访存/SPM恢复来源。','本例关注恢复反馈，并非 branch 算术结果走普通写回；fetch PC、FIFO 与busy位需一致清理。'],
    scratchpad:['同样从线程 PC 与 I-cache 开始。','识别 scratchpad 地址空间对应的指令选择。','在自己的指令 FIFO 中等待发射。','spm_can_issue 与寄存器依赖影响是否发射；bank 冲突是需处理的资源问题。','读操作数、有效地址和向量 mask。','进入核内 scratchpad_memory_pipe 的独立 banked memory；SPM 不在 D-cache 之后。','SPM 返回结果参与写回仲裁，保持线程、目的和mask身份。']
  };
  function renderFlow(){
    const steps=H.pipeline,step=steps[state.flowStep];if(!step)return;
    $('#flow-diagram').innerHTML=steps.map((s,i)=>`<button class="flow-step${i===state.flowStep?' active':i<state.flowStep?' past':''}" data-flow-step="${i}" aria-label="步骤 ${i+1} ${esc(s.name)}"><small>${String(i+1).padStart(2,'0')}</small><b>${esc(s.name)}</b></button>`).join('');
    const scenario=$('#instruction-scenario').value;
    $('#flow-detail').innerHTML=`<div class="eyebrow">MODULE ${state.flowStep+1} / ${steps.length}</div><h3>${esc(step.name)}</h3><p>${esc(scenarioExplanations[scenario]?.[state.flowStep]||step.description)}</p><p class="signal-list">${step.signals.map(esc).join(' · ')}</p><p><b>观察阻塞 / 恢复：</b>${esc(step.hazard)}</p>${sourceRef(step.file,step.line)}`;
    $('#flow-prev').disabled=state.flowStep===0;$('#flow-next').disabled=state.flowStep===steps.length-1;
  }
  function stopFlow(){clearInterval(state.flowTimer);state.flowTimer=null;$('#flow-play').textContent='自动推演 ▷';}
  function advanceFlow(delta){stopFlow();state.flowStep=Math.max(0,Math.min(H.pipeline.length-1,state.flowStep+delta));renderFlow();}

  const coreDefs='source/hardware/src/include/npu_defines.sv',userDefs='source/hardware/src/include/npu_user_defines.sv';
  function renderLab(){
    $$('[data-lab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.lab===state.lab));
    const box=$('#lab-content');
    if(state.lab==='mask'){
      const bits=state.mask.reduce((m,x,i)=>m+(x?2**i:0),0),active=state.mask.filter(Boolean).length;
      box.innerHTML=`<div class="lab-head"><div><div class="eyebrow">EXPERIMENT A / SIMD MASK</div><h3>一条向量加法，16 个数据位置。</h3><p>示意操作：<code>vDest = vInput + 3</code>。输入 lane i 的值为 i；原目标值设为 −1。点选 lane 切换掩码，禁用位置保留原目标。</p></div>${sourceRef('source/hardware/src/core/operand_fetch.sv',49)}</div><div class="lab-controls"><button class="button compact secondary" data-mask-preset="all">全部开启</button><button class="button compact secondary" data-mask-preset="even">偶数 lane</button><button class="button compact secondary" data-mask-preset="none">全部关闭</button><span class="small-muted">bit i ↔ lane i · 左到右 lane0→15</span></div><div class="lane-grid">${state.mask.map((on,i)=>`<button class="lane-button${on?'':' disabled-lane'}" data-lane="${i}" aria-pressed="${on}"><small>LANE ${String(i).padStart(2,'0')} · ${on?'ON':'OFF'}</small><b>${on?i+3:'−1'}</b><span>${on?`${i} + 3`:'保留原值'}</span></button>`).join('')}</div><div class="lab-output">mask = <strong>0x${bits.toString(16).padStart(4,'0').toUpperCase()}</strong> · ${active} / 16 lane 参与。本例展示语义更新，不模拟字节掩码、异常或周期。<br><b>想一想：</b>所有 lane 关闭时，该硬件线程是否就不存在了？去读寄存器与线程使能的不同控制路径。</div>`;
    }else if(state.lab==='threads'){
      box.innerHTML=`<div class="lab-head"><div><div class="eyebrow">EXPERIMENT B / READINESS</div><h3>一个线程在等，其他线程能做什么？</h3><p>点选线程切换“就绪 / 等待”，然后推进一次选择。演示仅用就绪位做轮询；真实 scheduler 还检查 RAW/WAW、写回资源、FP/SPM、barrier 与 rollback。</p></div>${sourceRef('source/hardware/src/core/instruction_scheduler.sv',149)}</div><div class="thread-grid">${Array.from({length:8},(_,i)=>`<button class="thread-button${state.waiting.has(i)?' waiting':''}${state.issuedThread===i?' selected':''}" data-thread="${i}" aria-pressed="${!state.waiting.has(i)}"><b>T${i}${state.issuedThread===i?' ← 本次选择':''}</b><small>${state.waiting.has(i)?'WAIT / 不可选':'READY / 可选'}</small></button>`).join('')}</div><div class="lab-controls"><button class="button compact primary" id="thread-step">推进一次就绪选择 →</button><button class="button compact secondary" id="thread-reset">恢复默认</button></div><div class="lab-output">已选序列：<strong>${state.threadHistory.length?state.threadHistory.map(x=>`T${x}`).join(' → '):'尚未推进'}</strong><br>隐藏延迟依赖于可执行的其他工作；“8 个线程”不代表每周期发射 8 条指令。取指轮询和指令发射轮询也不是同一仲裁点。</div>`;
    }else if(state.lab==='network'){
      box.innerHTML=`<div class="lab-head"><div><div class="eyebrow">EXPERIMENT C / XY-DOR</div><h3>地址先决定 home，路由再决定下一跳。</h3><p>默认 4×4 网格；ID 低位是 x，高位是 y。先沿 X，再沿 Y。home 由地址最高 4 位产生，64-byte line offset 并不决定 home。</p></div>${sourceRef('source/hardware/src/mc/cache_controller/cache_controller_stage4.sv',92)}</div><div class="lab-controls"><label>起点 <select id="route-start">${Array.from({length:16},(_,i)=>`<option value="${i}"${i===0?' selected':''}>Tile ${i}</option>`).join('')}</select></label><label>消息终点 <select id="route-end">${Array.from({length:16},(_,i)=>`<option value="${i}"${i===10?' selected':''}>Tile ${i}</option>`).join('')}</select></label><label>32-bit 地址 <input id="home-address" value="0xA0000040" spellcheck="false" style="width:130px;border:1px solid #d9e2d0;padding:4px 7px;font:11px var(--mono)"></label><button class="button compact secondary" id="route-to-home">将终点设为此 home →</button></div><div class="network-lab-grid"><div id="route-mesh" class="route-mesh"></div><div class="network-readout" id="route-readout"></div></div><div class="lab-output">消息终点和地址可独立选择；按钮可将几何路由终点与计算出的 home 对齐。只计算路径与位段，不模拟队列、VC 竞争或周期。<b>64 bit 是 payload，不是完整 flit 的总宽。</b>${refs(H.network?.sources)}</div>`;
      updateRoute();
    }else if(state.lab==='coherence'){
      const event=H.coherence[state.coherenceStep];
      box.innerHTML=`<div class="lab-head"><div><div class="eyebrow">EXPERIMENT D / COHERENCE EVENTS</div><h3>共享读取之后，写入为什么需要额外消息？</h3><p>同一缓存行：A 读、B 读、A 再写。以 MSI 风格的稳定权限帮助理解，真实协议包含更多瞬态和条件；这里使用源码消息名称做事件推演。</p></div>${sourceRef('source/hardware/src/mc/cache_controller/cc_protocol_rom.sv',37)}</div><div class="config-metrics"><div><small>CORE A / 缓存权限示意</small><b>${state.coherenceStep<3?'I':state.coherenceStep===3?'S':state.coherenceStep<6?'S / 等待修改权限':'M'}</b></div><div><small>CORE B / 缓存权限示意</small><b>${state.coherenceStep<3?'I':state.coherenceStep<5?'S':'I'}</b></div><div><small>HOME DIRECTORY</small><span>记录 / 协调 owner 与 sharers</span></div><div><small>MEMORY TILE</small><span>按协议需要提供数据或接收写回</span></div></div><div class="flow-diagram">${H.coherence.map((e,i)=>`<button class="flow-step${state.coherenceStep===i?' active':''}" data-coherence="${i}"><small>EVENT ${i+1}</small><b>${esc(e.title)}</b></button>`).join('')}</div><h4>${esc(event.title)}</h4><p style="font-size:12px;color:var(--muted)">${esc(event.description)}</p><div>${event.modules.map(id=>moduleMap.get(id)).filter(Boolean).map(m=>sourceRef(m.file,m.line,m.name)).join('')}</div><div class="lab-controls"><button class="button compact secondary" id="coherence-prev"${state.coherenceStep===0?' disabled':''}>← 上一步</button><button class="button compact primary" id="coherence-next"${state.coherenceStep===H.coherence.length-1?' disabled':''}>下一事件 →</button></div><div class="lab-output">${esc(event.caveat)}<br>上方权限不是当前 RTL 状态编码或逐周期波形。注意目录查找、数据返回与失效确认可以具有不同到达顺序。</div>`;
    }else{
      box.innerHTML=`<div class="lab-head"><div><div class="eyebrow">EXPERIMENT E / CONFIGURATION ARITHMETIC</div><h3>把规模、上下文数量和缓存容量分开计算。</h3><p>方形 NoC 与线程数仅做参数推演。调大后的连接、地址位段、barrier、启动栈和软件宏仍需重新验证。</p></div>${sourceRef(userDefs,68)}</div><div class="config-grid"><div><div class="config-control"><label>方形 Mesh 边长 <select id="config-side"><option value="2">2 × 2</option><option value="4" selected>4 × 4（默认）</option><option value="8">8 × 8</option></select></label></div><div class="config-control"><label>NPU 计算 tile <b id="config-core-value">8</b></label><input id="config-cores" type="range" min="1" max="14" value="8"></div><div class="config-control"><label>每核硬件线程 <select id="config-threads">${[1,2,4,8,16].map(n=>`<option value="${n}"${n===8?' selected':''}>${n}${n===8?'（默认）':''}</option>`).join('')}</select></label></div><div class="config-control"><label>L1 sets <select id="config-sets">${[16,32,64,128].map(n=>`<option value="${n}"${n===32?' selected':''}>${n}</option>`).join('')}</select></label></div><p class="small-muted">line = 64 B · ways = 4 · lane = 16（固定基线）<br>保留末尾两个位置作为 Host / Memory。</p></div><div class="config-metrics" id="config-readout"></div></div><div class="lab-output">计算的是逻辑上下文和数据阵列容量，<b>不等于 IPC、FLOPS、实际 SRAM 占用或性能预测</b>。THREAD_NUMB 的变更还要核对编译宏、链接脚本与启动/同步配置。</div>`;
      updateConfig();
    }
  }
  function updateRoute(){
    const start=+$('#route-start').value,end=+$('#route-end').value;let x=start%4,y=Math.floor(start/4);const ex=end%4,ey=Math.floor(end/4),path=[start];
    while(x!==ex){x+=Math.sign(ex-x);path.push(y*4+x);}while(y!==ey){y+=Math.sign(ey-y);path.push(y*4+x);}
    $('#route-mesh').innerHTML=Array.from({length:16},(_,i)=>`<div class="route-node${path.includes(i)?' on-route':''}${i===start||i===end?' endpoint':''}">${i}<small style="display:block;font-size:8px">(${i%4},${Math.floor(i/4)})</small></div>`).join('');
    const raw=$('#home-address').value.trim(),valid=/^(?:0x)?[0-9a-f]{1,8}$/i.test(raw),addr=valid?parseInt(raw.replace(/^0x/i,''),16)>>>0:null,home=valid?addr>>>28:null;
    $('#route-readout').innerHTML=`<h4>XY 路径</h4>${path.map(i=>`<span class="route-chip">${i}</span>`).join(' → ')}<p>${path.length-1} 条几何链路；同一 tile 的 LOCAL 交付不增加 mesh hop。</p><h4>Home directory</h4><p>${valid?`<code>address[31:28] = 0x${home.toString(16).toUpperCase()}</code><br>Home：<b>Tile ${home}</b>（${home<8?'NPU + 目录':home<14?'无核目录':home===14?'Host + 目录':'Memory + 目录'}）<br>cache line offset：<code>0x${(addr&63).toString(16).padStart(2,'0')}</code>`:'请输入 1–8 位十六进制地址，例如 0xA0000040。'}</p>${sourceRef('source/hardware/src/mc/network_interface/routing_xy.sv',51)}`;
  }
  function updateConfig(){const side=+$('#config-side').value,cores=$('#config-cores');cores.max=side*side-2;if(+cores.value>+cores.max)cores.value=cores.max;const n=+cores.value,t=+$('#config-threads').value,sets=+$('#config-sets').value;$('#config-core-value').textContent=n;$('#config-readout').innerHTML=`<div><small>网络位置 / 无核目录位置</small><b>${side*side} / ${side*side-n-2}</b></div><div><small>计算核硬件线程上下文</small><b>${n*t}</b></div><div><small>一条向量指令的数据宽</small><b>512 bit</b></div><div><small>每 L1 数据阵列</small><b>${sets*4*64/1024} KiB</b></div><div><small>每核 VRF 逻辑数据量</small><b>${t*64*512/8/1024} KiB</b></div><div><small>Home 地址高位数</small><b>${Math.log2(side*side)} bit</b></div>`;}

  const readable=value=>Array.isArray(value)?value.join('；'):value||'';
  function renderBuild(){
    $('#build-tabs').innerHTML=workshops.map((w,i)=>`<button role="tab" aria-selected="${state.build===i}" data-build="${i}">${esc(({core:'自己写一个 core',noc:'自己写一个 NoC',cache:'自己写一个缓存',directory:'自己写一个目录'})[w.id]||w.title)}</button>`).join('');
    const workshop=workshops[state.build];if(!workshop){$('#build-detail').innerHTML='<p>实现课程正在载入。</p>';return;}
    const steps=workshop.steps||[],step=steps[state.buildStep]||steps[0];
    $('#build-steps').innerHTML=steps.map((s,i)=>`<button data-build-step="${i}" class="build-step${i===state.buildStep?' selected':''}"${i===state.buildStep?' aria-current="step"':''}><span>${String(i+1).padStart(2,'0')}</span><b>${esc(s.title)}</b></button>`).join('');
    $('#build-detail').innerHTML=`<div class="eyebrow">${esc(workshop.subtitle||'SMALLEST VERIFIABLE DESIGN')}</div><h3>${esc(step.title)}</h3><p class="build-prerequisites"><b>先备：</b>${esc((workshop.prerequisites||[]).join(' · '))}</p>${[['本步目标',step.goal],['如何组织逻辑',step.design],['需要保存的状态',step.state],['自己动手写',step.exercise]].filter(([,v])=>v).map(([label,value])=>`<div class="design-row"><h4>${label}</h4><p>${inline(readable(value))}</p></div>`).join('')}<div class="build-checks"><h4>写完后，检查这些证据</h4><ul>${(step.checks||[]).map(x=>`<li>${inline(x)}</li>`).join('')}</ul></div><div class="sources-line">${refs(step.sources)}</div><div class="build-step-pagination"><button class="button compact secondary" data-build-move="-1"${state.buildStep===0?' disabled':''}>← 上一步</button><span>${state.buildStep+1} / ${steps.length}</span><button class="button compact primary" data-build-move="1"${state.buildStep===steps.length-1?' disabled':''}>下一步 →</button></div>`;
  }
  function renderConcepts(){
    const q=$('#concept-query').value.trim().toLowerCase(),selected=concepts.filter(c=>(state.conceptFilter==='all'||c.category===state.conceptFilter)&&[c.term,c.english,c.definition,c.why,c.implementation,...(c.designSteps||[]),...(c.pitfalls||[])].join(' ').toLowerCase().includes(q));
    $$('[data-concept-filter]').forEach(b=>b.setAttribute('aria-selected',b.dataset.conceptFilter===state.conceptFilter));
    $('#concept-count').textContent=`${selected.length} / ${concepts.length} 个实现概念 · 展开可看“为什么、代码怎么做、自己怎么写、容易错在哪里”。`;
    $('#concept-grid').innerHTML=selected.length?selected.map(c=>`<details class="concept-card" id="concept-${esc(c.id)}"><summary><span class="concept-category">${{rtl:'RTL 基础',core:'NPU CORE',noc:'NoC',cache:'缓存',directory:'目录一致性'}[c.category]||esc(c.category)}</span><h3>${esc(c.term)}</h3><small>${esc(c.english)}</small><p>${inline(c.definition)}</p><span class="concept-expand">展开实现细节 ＋</span></summary><div class="concept-body"><h4>为什么需要它</h4><p>${inline(c.why)}</p><h4>NaplesPU 的代码怎样做</h4><p>${inline(c.implementation)}</p><div class="sources-line">${refs(c.sources)}</div><h4>如果自己从零写</h4><ol>${(c.designSteps||[]).map(x=>`<li>${inline(x)}</li>`).join('')}</ol><div class="concept-invariants"><h4>应始终成立的不变量</h4><ul>${(c.invariants||[]).map(x=>`<li>${inline(x)}</li>`).join('')}</ul></div><h4>常见错误</h4><ul>${(c.pitfalls||[]).map(x=>`<li>${inline(x)}</li>`).join('')}</ul></div></details>`).join(''):'<div class="empty-results">没有匹配概念。可以搜索中文职责、英文缩写或信号名称。</div>';
  }
  const logicInputs={fifo:{valid:true,ready:false,data:10},scoreboard:{source:1,destination:3,wb:3,resource:true,overlap:false}};
  function logicHistory(){const rows=state.logicHistory[state.logic];return `<div class="logic-trace"><h4>边沿事件记录 <span>最新 ${Math.min(rows.length,10)} 条</span></h4>${rows.length?`<ol>${rows.slice(-10).map(r=>`<li><span>t${r.cycle}</span>${esc(r.event)}</li>`).join('')}</ol>`:'<p>尚未推进。日志记录旧状态计算出的 fire，以及该边沿产生的更新。</p>'}</div>`;}
  function renderLogic(){
    $$('[data-logic]').forEach(b=>b.setAttribute('aria-selected',b.dataset.logic===state.logic));
    const box=$('#logic-content');
    if(state.logic==='fifo'){
      const s=state.fifo,i=logicInputs.fifo;
      box.innerHTML=`<div class="logic-heading"><div><div class="eyebrow">MINIMAL RTL 01 / FIFO</div><h3>valid 是请求，fire 才是被接收的事件。</h3><p>4项深度、8-bit 数据。按队头到队尾显示逻辑内容，下面的顺序不是 RAM 物理地址。当前信号由当前 count 计算，时钟边沿才改变计数与指针。</p></div>${sourceRef('web/rtl/learn_fifo.sv',1)}</div><div class="logic-signals"><span>cycle <b>${s.cycle}</b></span><span>count <b>${s.queue.length}/4</b></span><span>in_ready <b>${+(s.queue.length<4)}</b></span><span>out_valid <b>${+(s.queue.length>0)}</b></span><span>out_data <b>${s.queue.length?s.queue[0]:'无效'}</b></span></div><div class="fifo-slots">${Array.from({length:4},(_,j)=>`<div class="fifo-slot${j<s.queue.length?' occupied':''}"><small>${j===0?'HEAD / 队头':'QUEUE '+j}</small><b>${s.queue[j]??'—'}</b></div>`).join('')}</div><div class="lab-controls"><label><input id="fifo-valid" type="checkbox"${i.valid?' checked':''}> in_valid</label><label><input id="fifo-ready" type="checkbox"${i.ready?' checked':''}> out_ready</label><label>in_data <input id="fifo-data" type="number" min="0" max="255" value="${i.data}"></label><button class="button compact primary" data-logic-action="fifo-clock">推进时钟边沿 →</button><button class="button compact secondary" data-logic-action="fifo-fill">从空队列填入4项</button><button class="text-button" data-logic-action="reset">重置实验</button></div><div class="lab-output"><code>push = in_valid &amp;&amp; in_ready</code>；<code>pop = out_valid &amp;&amp; out_ready</code>。本原型采取保守策略：旧状态已满时，即使这一拍 pop，也不同时接收 push。真实 NaplesPU FIFO 使用 enqueue/dequeue 契约，由上游避免 full/empty 违规。</div>${logicHistory()}`;
    }else if(state.logic==='scoreboard'){
      const s=state.scoreboard,i=logicInputs.scoreboard,options=selected=>Array.from({length:8},(_,n)=>`<option value="${n}"${selected===n?' selected':''}>r${n}</option>`).join('');
      box.innerHTML=`<div class="logic-heading"><div><div class="eyebrow">MINIMAL RTL 02 / SCOREBOARD</div><h3>busy 位记录在途目的寄存器。</h3><p>一个上下文、8个教学寄存器。检查 RAW/WAW 与一个资源可用位；不含旁路、重命名、多线程和完整回退身份。</p></div>${sourceRef('web/rtl/learn_scoreboard.sv',1)}</div><div class="busy-grid">${Array.from({length:8},(_,r)=>`<div class="busy-register${s.busy&(1<<r)?' occupied':''}"><small>r${r}</small><b>${s.busy&(1<<r)?'BUSY':'FREE'}</b></div>`).join('')}</div><div class="lab-controls"><label>源寄存器 <select id="sb-source">${options(i.source)}</select></label><label>目的寄存器 <select id="sb-destination">${options(i.destination)}</select></label><label><input id="sb-resource" type="checkbox"${i.resource?' checked':''}> 后端资源可用</label><label><input id="sb-overlap" type="checkbox"${i.overlap?' checked':''}> 同边沿清除目的位</label></div><div class="lab-controls"><button class="button compact primary" data-logic-action="sb-issue">尝试发射 →</button><label>完成寄存器 <select id="sb-wb">${options(i.wb)}</select></label><button class="button compact secondary" data-logic-action="sb-wb">写回清除 →</button><button class="button compact secondary" data-logic-action="sb-rollback">教学回退：清除全部 busy</button><button class="text-button" data-logic-action="reset">重置实验</button></div><div class="lab-output"><code>next = (busy &amp; ~clear) | set</code>：同边沿 clear/set 同位时 set 优先。依赖检查读取旧 busy，没有 WB 旁路；旧 busy 阻塞的发射不会因为同拍清除就被提前接受。NaplesPU 用线程与 scalar/vector 位进一步扩展这一思想。</div>${logicHistory()}`;
    }else{
      const s=state.directory,signals=LOGIC.directorySignals(s);
      box.innerHTML=`<div class="logic-heading"><div><div class="eyebrow">MINIMAL RTL 03 / PERMISSION CONTROLLER</div><h3>“发出失效”与“拿到写权限”之间，必须有等待。</h3><p>两核、一行、单事务的权限控制器。没有地址、数据、L2 或真实 NoC；探针 ACK 在本原型中抽象“所需数据与权限处理已完成”，不能直接替代完整一致性协议。</p></div>${sourceRef('web/rtl/learn_directory.sv',1)}</div><div class="directory-fsm">${['IDLE','PROBE','WAIT_ACK','RESP'].map(phase=>`<span class="${s.phase===phase?'current':''}">${phase}</span>`).join('<i>→</i>')}</div><div class="logic-signals"><span>cycle <b>${s.cycle}</b></span><span>permission <b>${s.permission}</b></span><span>sharers <b>${s.sharers.toString(2).padStart(2,'0')}</b></span><span>owner <b>${s.permission==='M'?'C'+s.owner:'无 M owner'}</b></span><span>req_ready <b>${+signals.reqReady}</b></span><span>resp_valid <b>${+signals.respValid}</b></span></div><div class="directory-participants">${[0,1].map(core=>`<article><h4>C${core}</h4><p>${s.sharers&(1<<core)?s.permission==='M'&&s.owner===core?'登记为 M owner':'登记为可读共享者':'没有登记的副本'}</p><div><button class="button compact secondary" data-dir-request="${core}" data-write="0">C${core} 读</button><button class="button compact primary" data-dir-request="${core}" data-write="1">C${core} 写</button></div></article>`).join('')}</div><div class="directory-pending"><b>锁存事务：</b>${s.phase==='IDLE'?'无在途请求':`C${s.pendingCore} ${s.pendingWrite?'写 / 需要修改权限':'读 / 需要读权限'}`}<br><b>探针：</b>${signals.probeValid?`valid=1 → C${s.target}，${s.pendingWrite?'失效':'降级'}，等待接收`:s.phase==='WAIT_ACK'?`已被 C${s.target} 接收，等待其 ACK`:'当前没有待发送探针'}<br><b>响应：</b>${signals.respValid?`valid=1 → C${s.pendingCore}，权限 ${s.permission}，等待接收`:'尚未形成可接收响应'}</div><div class="lab-controls"><button class="button compact secondary" data-logic-action="dir-probe"${s.phase!=='PROBE'?' disabled':''}>目标接收探针 →</button><button class="button compact secondary" data-dir-ack="0"${s.phase!=='WAIT_ACK'?' disabled':''}>C0 发 ACK →</button><button class="button compact secondary" data-dir-ack="1"${s.phase!=='WAIT_ACK'?' disabled':''}>C1 发 ACK →</button><button class="button compact primary" data-logic-action="dir-response"${s.phase!=='RESP'?' disabled':''}>请求方接收响应 →</button></div><div class="lab-controls"><button class="button compact secondary" data-logic-action="dir-shared">从复位建立 C0/C1 共享</button><button class="button compact secondary" data-logic-action="dir-idle">只推进一拍，无握手</button><button class="text-button" data-logic-action="reset">重置实验</button></div><div class="lab-output">尝试：建立共享 → C0写 → 接收探针 → 错误C0 ACK → 正确C1 ACK → 接收响应。观察错误 ACK 不消除等待、busy 时第二个请求不覆盖锁存事务。真实目录还需要数据来源、ACK集合/计数、每行冲突与并发事务槽。</div>${logicHistory()}`;
    }
  }
  function applyLogic(input){const kind=state.logic,result=LOGIC[kind+'Step'](state[kind],input);state[kind]=result.state;state.logicHistory[kind].push({cycle:result.state.cycle,event:result.event});state.logicHistory[kind]=state.logicHistory[kind].slice(-30);}
  function logicAction(action){
    if(action==='reset'){state[state.logic]=LOGIC[state.logic+'Initial']();state.logicHistory[state.logic]=[];renderLogic();return;}
    if(action==='fifo-clock')applyLogic(logicInputs.fifo);
    if(action==='fifo-fill'){state.fifo=LOGIC.fifoInitial();state.logicHistory.fifo=[];for(const data of [10,20,30,40])applyLogic({valid:true,ready:false,data});}
    const i=logicInputs.scoreboard;
    if(action==='sb-issue')applyLogic({valid:true,resource:i.resource,source:1<<i.source,destination:1<<i.destination,wb:i.overlap?1<<i.destination:0});
    if(action==='sb-wb')applyLogic({valid:false,resource:true,source:0,destination:0,wb:1<<i.wb});
    if(action==='sb-rollback')applyLogic({valid:false,resource:true,source:0,destination:0,rollback:255});
    if(action==='dir-probe')applyLogic({probeReady:true});
    if(action==='dir-response')applyLogic({respReady:true});
    if(action==='dir-idle')applyLogic({});
    if(action==='dir-shared'){state.directory=LOGIC.directoryInitial();state.logicHistory.directory=[];for(const input of [{reqValid:true,core:0},{respReady:true},{reqValid:true,core:1},{respReady:true}])applyLogic(input);}
    renderLogic();
  }

  const PAGE_SIZE=70;
  function renderSourceGroups(){
    $('#source-groups').innerHTML=[{id:'all',label:'全部'},...INDEX.groups].map(g=>`<button class="group-button${state.sourceGroup===g.id?' selected':''}" data-source-group="${esc(g.id)}">${esc(g.label)}</button>`).join('');
  }
  function filterSources(reset=true){
    if(reset)state.sourcePage=0;
    const q=$('#source-query').value.trim().toLowerCase(),tokens=q.split(/\s+/).filter(Boolean),repo=$('#source-repo').value,embedded=$('#source-embedded').checked;
    state.sourceMatches=files.filter(f=>(repo==='all'||f.r===repo)&&(state.sourceGroup==='all'||f.g===state.sourceGroup)&&(!embedded||f.e)&&tokens.every(t=>f.p.toLowerCase().includes(t)));
    renderSourceRows();
  }
  function renderSourceRows(){
    const match=state.sourceMatches,pages=Math.max(1,Math.ceil(match.length/PAGE_SIZE));state.sourcePage=Math.min(state.sourcePage,pages-1);const start=state.sourcePage*PAGE_SIZE;
    $('#source-count').textContent=`${match.length.toLocaleString()} / ${INDEX.total.toLocaleString()} 个文件`;
    $('#source-results').innerHTML=match.length?match.slice(start,start+PAGE_SIZE).map(f=>`<button class="source-row" data-source="${esc(f.p)}" data-line="1"><span class="file-icon">${f.m==='120000'?'↗':/\.(sv|v|vhdl|vhd)$/i.test(f.p)?'RTL':/\.(c|cpp|h|cc)$/i.test(f.p)?'C':/\.td$/i.test(f.p)?'TD':'⌘'}</span><span class="file-path">${esc(f.p.replace(/^source\//,''))}<small>${esc(INDEX.groups.find(g=>g.id===f.g)?.label||f.g)} · ${f.r==='hardware'?'硬件仓库':'工具链仓库'}</small></span>${f.e?'<span class="file-tag">离线可读</span>':''}<span class="file-size">${size(f.b)}</span></button>`).join(''):'<div class="empty-results">没有匹配文件。试试模块名、文件扩展名或更短的路径。</div>';
    $('#source-page').textContent=`${state.sourcePage+1} / ${pages} 页`;$('#source-prev').disabled=state.sourcePage===0;$('#source-next').disabled=state.sourcePage>=pages-1;
  }

  let currentCode={path:'',text:'',lines:[],line:1,start:0},lastFocus=null;
  function sourceURL(path,meta,repo){
    if(path.startsWith('web/'))return path.slice(4);
    if(!publication)return '../'+path;
    if(publishedSources.has(path))return path;
    if(meta&&repo)return `https://raw.githubusercontent.com/${new URL(repo.url).pathname.slice(1)}/${repo.snapshot_commit}/${meta.u.split('/').map(encodeURIComponent).join('/')}`;
    return null;
  }
  async function openCode(path,line=1){
    lastFocus=document.activeElement;$('#code-overlay').hidden=false;document.body.style.overflow='hidden';$('#code-title').textContent=path;$('#code-body').innerHTML='<div style="padding:25px">正在读取源码…</div>';$('#code-notice').innerHTML='';
    const meta=fileMap.get(path),repo=INDEX.repositories.find(r=>r.id===meta?.r);$('#code-meta').textContent=meta?`${meta.r==='hardware'?'硬件':'工具链'} · ${size(meta.b)} · ${meta.m==='120000'?'上游符号链接':'原始文件'} · ${repo?.snapshot_commit?.slice(0,8)||''}`:path.startsWith('web/rtl/')?'独立编写的最小教学原型 · 不属于 NaplesPU 上游快照':'项目资料 / 本地文件';
    $('#code-overlay .code-header .eyebrow').textContent=path.startsWith('web/rtl/')?'TEACHING RTL / 最小可运行原型':'SOURCE / 原始实现';
    const rawURL=sourceURL(path,meta,repo);$('#code-raw').hidden=!rawURL;if(rawURL)$('#code-raw').href=rawURL;
    $('#code-raw').textContent=publication&&!publishedSources.has(path)&&!path.startsWith('web/')?'固定上游原文件 ↗':'本地原文件 ↗';
    $('#code-upstream').hidden=!meta;
    if(meta)$('#code-upstream').href=`${repo.url}/blob/${repo.snapshot_commit}/${meta.u.split('/').map(encodeURIComponent).join('/')}#L${Math.max(1,line)}`;
    let text=CODE[path];
    if(publication&&text===undefined&&!publishedSources.has(path))$('#code-notice').innerHTML='<div class="code-notice">此文件不在公开站的核心副本中；正在按需读取固定提交的上游文本。网络不可用时，可使用 GitHub 原文链接。</div>';
    if(text===undefined){
      if(location.protocol==='file:'){$('#code-notice').innerHTML='<div class="code-notice">此文件不在核心离线内嵌集合中。运行 <code>python3 web/serve.py</code> 后可读取全部本地文本；也可用上方“本地原文件”或 GitHub 查看。</div>';text='此文件未内嵌。核心 RTL、后端与应用示例可直接离线阅读。';}
      else try{if(!rawURL)throw new Error('此文件没有可用的公开地址');const response=await fetch(rawURL);if(!response.ok)throw new Error(`HTTP ${response.status}`);const bytes=await response.arrayBuffer();if(bytes.byteLength>5*1024*1024)throw new Error('文件超过 5 MB，请打开原文件');const data=new Uint8Array(bytes);if(data.slice(0,8192).includes(0))throw new Error('二进制文件，请打开原文件');text=new TextDecoder('utf-8',{fatal:true}).decode(data);if(publication&&!publishedSources.has(path)&&$('#code-title').textContent===path)$('#code-notice').innerHTML='<div class="code-notice">已读取固定提交的上游文本；此文件不在公开站的核心副本中。</div>';}catch(error){text='无法在文本查看器读取此文件。';$('#code-notice').innerHTML=`<div class="code-notice">${esc(error.message)}。请打开上方原文件链接${publication?'，或使用完整本地收录版本':'，或使用本地服务器'}。</div>`;}
    }
    if($('#code-title').textContent!==path)return;
    currentCode={path,text,lines:text.split('\n'),line:Math.max(1,Number(line)||1),start:0};currentCode.line=Math.min(currentCode.line,currentCode.lines.length);currentCode.start=Math.max(0,currentCode.line-25);$('#code-line').max=currentCode.lines.length;$('#code-line').value=currentCode.line;renderCode();$('.close-code').focus();
  }
  function highlightLine(text){
    const token=/(\/\/.*$|\/\*.*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:module|endmodule|input|output|logic|wire|reg|assign|always_ff|always_comb|always|begin|end|if|else|case|endcase|generate|endgenerate|parameter|localparam|typedef|struct|enum|function|endfunction|for|return|class|public|private|const|void|int|float|uint32_t|namespace|include|define|static|switch|break|bool|auto)\b|\b(?:0x[0-9a-fA-F]+|\d+)\b)/g;
    let out='',last=0,match;while((match=token.exec(text))){out+=esc(text.slice(last,match.index));const v=match[0],type=v.startsWith('//')||v.startsWith('/*')?'comment':v.startsWith('"')||v.startsWith("'")?'string':/^\d/.test(v)?'number':'keyword';out+=`<span class="${type}">${esc(v)}</span>`;last=match.index+v.length;}return out+esc(text.slice(last));
  }
  function renderCode(){
    const {lines,line}=currentCode;currentCode.start=Math.min(Math.max(0,currentCode.start),Math.max(0,lines.length-1));const start=currentCode.start,end=Math.min(lines.length,start+180);
    $('#code-body').innerHTML=lines.slice(start,end).map((text,i)=>`<div class="code-line${start+i+1===line?' highlight':''}" id="source-line-${start+i+1}"><span class="line-number">${start+i+1}</span><span class="line-text">${highlightLine(text)}</span></div>`).join('');
    $('#code-range').textContent=`${start+1}–${end} / ${lines.length} 行`;$('#code-prev').disabled=start===0;$('#code-next').disabled=end>=lines.length;
    $('#code-body').scrollTop=0;setTimeout(()=>{const row=document.getElementById('source-line-'+line);if(row)$('#code-body').scrollTop=Math.max(0,row.offsetTop-$('#code-body').offsetTop-100);},0);
  }
  function closeOverlay(id){$(id).hidden=true;if(!$$('.overlay').some(e=>!e.hidden)){document.body.style.overflow='';lastFocus?.focus?.();}}

  function renderGlossary(){
    const q=$('#glossary-query').value.trim().toLowerCase(),rows=S.glossary.filter(t=>(t.term+' '+t.english+' '+t.definition).toLowerCase().includes(q));
    $('#glossary-list').innerHTML=rows.length?rows.map(t=>`<article class="term"><h3>${esc(t.term)}</h3><small>${esc(t.english)}</small><p>${inline(t.definition)}</p><a href="#${esc(t.where)}">回到相关章节 →</a>${t.source?`<div>${refs([t.source])}</div>`:''}</article>`).join(''):'<div class="empty-results">没有找到这个术语。</div>';
  }
  function renderQuizzes(){
    $('#quizzes').innerHTML=quizzes.map((q,i)=>{const selected=state.answers[q.id];return `<article class="quiz" id="quiz-${q.id}"><div class="quiz-label">CHECKPOINT ${String(i+1).padStart(2,'0')} · <a href="#${esc(q.chapter)}">对应章节 ↗</a></div><h3>${esc(q.question)}</h3><div class="quiz-options">${q.options.map((o,j)=>`<button data-quiz="${esc(q.id)}" data-answer="${j}"${selected!==undefined?' aria-pressed="'+(selected===j)+'"':''} class="${selected!==undefined&&j===q.answer?'correct':selected===j?'wrong':''}">${String.fromCharCode(65+j)}. ${esc(o)}</button>`).join('')}</div><p class="quiz-explanation">${selected===undefined?'':`${selected===q.answer?'✓ 理解正确。':'再看一次机制。'} ${esc(q.explanation)}`}</p></article>`;}).join('');
    const answered=quizzes.filter(q=>state.answers[q.id]!==undefined),correct=answered.filter(q=>state.answers[q.id]===q.answer);$('#quiz-score').textContent=answered.length?`已答 ${answered.length} / ${quizzes.length} 题 · 当前正确 ${correct.length} 题。可重新选择并回读源码。`:'选出答案，查看解释，再回源码验证。';
  }
  function renderResearch(){
    $('#research-content').innerHTML=`<p class="small-muted">官方来源核查日期 ${esc(R.checkedAt)} · ${esc(R.scope||'')} <a href="research/learning-tools.md">完整调研与固定提交 ↗</a></p><div class="research-grid">${R.tools.map(t=>`<article class="research-card"><small>${esc(t.license)} · 查询到的提交 ${esc(t.commitDate?.slice(0,10)||'')} · ${esc(t.lastCommit?.slice(0,8)||'')}</small><h3><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.name)} ↗</a></h3><p>${esc(t.description)}</p><p>${esc(t.fit)}</p><p class="adopted"><b>本网站实际采用：</b>${esc(t.adopted)}</p><details><summary style="font-size:10px;color:var(--muted);cursor:pointer">适用边界与原始证据</summary><p>${esc(t.limitation)}</p>${(t.sources||[]).map(s=>`<a style="font-size:9px;margin-right:9px" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join('')}</details></article>`).join('')}</div>`;
  }
  function renderFigures(){
    const figures=[{file:'system-architecture.png',title:'01 / 默认多核系统与 tile 角色',description:'4×4 Mesh、四种 tile、目录 / 计算分工与消息虚拟通道。图内英文标签对应本地 RTL，放大后可对照模块与源码。'},{file:'core-dataflow.png',title:'02 / 核内指令、数据与恢复路径',description:'前端顺序、并行后端、结果写回、访存、barrier 与 rollback。数据流箭头不代表统一流水级，也不代表固定周期。'}];
    $('#figure-gallery').innerHTML=figures.map(f=>`<figure class="technical-figure"><a href="assets/${f.file}" target="_blank" rel="noopener" aria-label="放大${esc(f.title)}"><img src="assets/${f.file}" alt="${esc(f.title)}" loading="lazy"></a><figcaption><div><h3>${esc(f.title)}</h3><p>${esc(f.description)}</p></div><div><a class="text-button" href="assets/${f.file}" target="_blank" rel="noopener">查看原图 ↗</a><br><a class="text-button" href="research/diagram-prompts.md">完整提示词 ↗</a><br><a class="text-button" href="research/diagram-audit.md">核验记录 ↗</a></div></figcaption></figure>`).join('');
  }

  function commandSearch(){
    const q=$('#command-query').value.trim().toLowerCase(),rows=[];
    if(!q){rows.push(...chapters.slice(0,7).map(c=>({type:'章节',label:c.title,target:c.id})),{type:'导航',label:'全量源码浏览器',target:'source'},{type:'导航',label:'SIMD、线程与 NoC 实验',target:'laboratory'});}
    else{
      rows.push(...chapters.filter(c=>(c.title+' '+c.summary).toLowerCase().includes(q)).slice(0,6).map(c=>({type:'章节',label:c.title,target:c.id})));
      rows.push(...H.modules.filter(m=>(m.name+' '+m.summary).toLowerCase().includes(q)).slice(0,5).map(m=>({type:'模块',label:m.name+' · '+m.summary,path:m.file,line:m.line})));
      rows.push(...S.glossary.filter(t=>(t.term+' '+t.english).toLowerCase().includes(q)).slice(0,4).map(t=>({type:'术语',label:t.term+' / '+t.english,target:t.where})));
      rows.push(...concepts.filter(c=>(c.term+' '+c.english+' '+c.definition).toLowerCase().includes(q)).slice(0,5).map(c=>({type:'概念',label:c.term+' · '+c.definition,target:'concept-'+c.id})));
      for(const f of files){if(f.p.toLowerCase().includes(q)){rows.push({type:'源码',label:f.p,path:f.p,line:1});if(rows.length>=30)break;}}
    }
    $('#command-results').innerHTML=rows.length?rows.map(row=>`<button class="command-result" ${row.path?`data-source="${esc(row.path)}" data-line="${row.line}"`:`data-scroll="${esc(row.target)}"`}><span>${esc(row.type)}</span><b>${esc(row.label)}</b></button>`).join(''):'<div class="empty-results">没有匹配结果。可以搜索文件名、模块名、ISA 或缓存。</div>';
  }
  function openCommand(){lastFocus=document.activeElement;$('#command-overlay').hidden=false;document.body.style.overflow='hidden';commandSearch();$('#command-query').focus();}

  document.addEventListener('click',event=>{
    const source=event.target.closest('[data-source]');if(source){if(!$('#command-overlay').hidden)closeOverlay('#command-overlay');openCode(source.dataset.source,+source.dataset.line||1);return;}
    const read=event.target.closest('[data-read]');if(read){const id=read.dataset.read;state.read.has(id)?state.read.delete(id):state.read.add(id);save('read',[...state.read]);updateProgress();return;}
    const tile=event.target.closest('[data-tile]');if(tile){state.tile=+tile.dataset.tile;renderMap();return;}
    const map=event.target.closest('[data-map]');if(map){state.map=map.dataset.map;state.module='core';renderMap();return;}
    const mapSwitch=event.target.closest('[data-map-switch]');if(mapSwitch){state.map=mapSwitch.dataset.mapSwitch;renderMap();return;}
    const mod=event.target.closest('[data-module]');if(mod){state.module=mod.dataset.module;renderModuleDetail(state.module);$$('.module-node').forEach(b=>b.classList.toggle('selected',b.dataset.module===state.module));return;}
    const flow=event.target.closest('[data-flow-step]');if(flow){stopFlow();state.flowStep=+flow.dataset.flowStep;renderFlow();return;}
    const lab=event.target.closest('[data-lab]');if(lab){state.lab=lab.dataset.lab;renderLab();return;}
    const build=event.target.closest('[data-build]');if(build){state.build=+build.dataset.build;state.buildStep=0;renderBuild();return;}
    const buildStep=event.target.closest('[data-build-step]');if(buildStep){state.buildStep=+buildStep.dataset.buildStep;renderBuild();return;}
    const buildMove=event.target.closest('[data-build-move]');if(buildMove){state.buildStep+=+buildMove.dataset.buildMove;renderBuild();return;}
    const conceptFilter=event.target.closest('[data-concept-filter]');if(conceptFilter){state.conceptFilter=conceptFilter.dataset.conceptFilter;renderConcepts();return;}
    const logic=event.target.closest('[data-logic]');if(logic){state.logic=logic.dataset.logic;renderLogic();return;}
    const action=event.target.closest('[data-logic-action]');if(action){logicAction(action.dataset.logicAction);return;}
    const request=event.target.closest('[data-dir-request]');if(request){applyLogic({reqValid:true,core:+request.dataset.dirRequest,write:request.dataset.write==='1'});renderLogic();return;}
    const ack=event.target.closest('[data-dir-ack]');if(ack){applyLogic({ackValid:true,ackCore:+ack.dataset.dirAck});renderLogic();return;}
    const lane=event.target.closest('[data-lane]');if(lane){state.mask[+lane.dataset.lane]=!state.mask[+lane.dataset.lane];renderLab();return;}
    const preset=event.target.closest('[data-mask-preset]');if(preset){state.mask=Array.from({length:16},(_,i)=>preset.dataset.maskPreset==='all'||preset.dataset.maskPreset==='even'&&i%2===0);renderLab();return;}
    const thread=event.target.closest('[data-thread]');if(thread){const id=+thread.dataset.thread;state.waiting.has(id)?state.waiting.delete(id):state.waiting.add(id);renderLab();return;}
    if(event.target.closest('#thread-step')){let next=-1;for(let i=1;i<=8;i++){const t=(state.issuedThread+i)%8;if(!state.waiting.has(t)){next=t;break;}}if(next<0){toast('没有就绪线程；点击一个等待线程使其就绪。');return;}state.issuedThread=next;state.threadHistory.push(next);state.threadHistory=state.threadHistory.slice(-16);renderLab();return;}
    if(event.target.closest('#thread-reset')){state.waiting=new Set([2,5]);state.issuedThread=-1;state.threadHistory=[];renderLab();return;}
    if(event.target.closest('#route-to-home')){const raw=$('#home-address').value.trim();if(!/^(?:0x)?[0-9a-f]{1,8}$/i.test(raw)){toast('请先输入有效的 32-bit 十六进制地址。');return;}$('#route-end').value=String((parseInt(raw.replace(/^0x/i,''),16)>>>0)>>>28);updateRoute();return;}
    const coh=event.target.closest('[data-coherence]');if(coh){state.coherenceStep=+coh.dataset.coherence;renderLab();return;}
    if(event.target.closest('#coherence-prev')){state.coherenceStep=Math.max(0,state.coherenceStep-1);renderLab();return;}
    if(event.target.closest('#coherence-next')){state.coherenceStep=Math.min(H.coherence.length-1,state.coherenceStep+1);renderLab();return;}
    const group=event.target.closest('[data-source-group]');if(group){state.sourceGroup=group.dataset.sourceGroup;renderSourceGroups();filterSources();return;}
    const quiz=event.target.closest('[data-quiz]');if(quiz){state.answers[quiz.dataset.quiz]=+quiz.dataset.answer;save('answers',state.answers);const y=window.scrollY;renderQuizzes();window.scrollTo(0,y);return;}
    if(event.target.closest('[data-command]')){openCommand();return;}
    const scroll=event.target.closest('[data-scroll]');if(scroll){closeOverlay('#command-overlay');scrollTo(scroll.dataset.scroll);return;}
    if(event.target.closest('.close-code')){closeOverlay('#code-overlay');return;}
    if(event.target.classList.contains('overlay')){closeOverlay('#'+event.target.id);return;}
    const a=event.target.closest('a[href^="#"]');if(a)$('#sidebar').classList.remove('open');
  });
  $('#flow-prev').onclick=()=>advanceFlow(-1);$('#flow-next').onclick=()=>advanceFlow(1);$('#flow-reset').onclick=()=>{stopFlow();state.flowStep=0;renderFlow();};
  $('#flow-play').onclick=()=>{if(state.flowTimer){stopFlow();return;}if(state.flowStep===H.pipeline.length-1)state.flowStep=0;renderFlow();$('#flow-play').textContent='暂停 Ⅱ';state.flowTimer=setInterval(()=>{if(state.flowStep>=H.pipeline.length-1){stopFlow();return;}state.flowStep++;renderFlow();},1800);};
  $('#instruction-scenario').onchange=()=>{stopFlow();state.flowStep=0;renderFlow();};
  let sourceDebounce;$('#source-query').addEventListener('input',()=>{clearTimeout(sourceDebounce);sourceDebounce=setTimeout(()=>filterSources(),150);});$('#source-repo').onchange=()=>filterSources();$('#source-embedded').onchange=()=>filterSources();$('#source-prev').onclick=()=>{state.sourcePage--;renderSourceRows();scrollTo('source');};$('#source-next').onclick=()=>{state.sourcePage++;renderSourceRows();scrollTo('source');};
  $('#lab-content').addEventListener('input',event=>{if(['route-start','route-end','home-address'].includes(event.target.id))updateRoute();if(event.target.id.startsWith('config-'))updateConfig();});$('#lab-content').addEventListener('change',event=>{if(['route-start','route-end','home-address'].includes(event.target.id))updateRoute();if(event.target.id.startsWith('config-'))updateConfig();});
  $('#glossary-query').oninput=renderGlossary;$('#command-query').oninput=commandSearch;$('#command-close').onclick=()=>closeOverlay('#command-overlay');
  $('#concept-query').oninput=renderConcepts;
  $('#logic-content').addEventListener('input',event=>{const el=event.target,i=logicInputs;if(el.id==='fifo-valid')i.fifo.valid=el.checked;if(el.id==='fifo-ready')i.fifo.ready=el.checked;if(el.id==='fifo-data')i.fifo.data=Math.max(0,Math.min(255,Number(el.value)||0));if(el.id==='sb-source')i.scoreboard.source=+el.value;if(el.id==='sb-destination')i.scoreboard.destination=+el.value;if(el.id==='sb-wb')i.scoreboard.wb=+el.value;if(el.id==='sb-resource')i.scoreboard.resource=el.checked;if(el.id==='sb-overlap')i.scoreboard.overlap=el.checked;});
  $('#code-go').onclick=()=>{currentCode.line=Math.max(1,Math.min(currentCode.lines.length,+$('#code-line').value||1));currentCode.start=Math.max(0,currentCode.line-25);renderCode();};$('#code-line').addEventListener('keydown',e=>{if(e.key==='Enter')$('#code-go').click();});$('#code-prev').onclick=()=>{currentCode.start=Math.max(0,currentCode.start-180);renderCode();};$('#code-next').onclick=()=>{currentCode.start+=180;renderCode();};$('#code-copy').onclick=async()=>{try{await navigator.clipboard.writeText(currentCode.text);toast('已复制该文件完整文本。');}catch{toast('当前浏览器未开放剪贴板权限；可打开原文件复制。');}};
  $('#notes-open').onclick=()=>{lastFocus=document.activeElement;$('#notes-overlay').hidden=false;document.body.style.overflow='hidden';$('#notes-text').value=state.notes;$('#notes-text').focus();};$('#notes-close').onclick=()=>closeOverlay('#notes-overlay');$('#notes-text').oninput=()=>{state.notes=$('#notes-text').value;save('notes',state.notes);$('#notes-status').textContent='已自动保存 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});};$('#notes-export').onclick=()=>downloadText('NaplesPU-学习笔记.md','# NaplesPU 学习笔记\n\n'+state.notes);
  $('#export-progress').onclick=()=>downloadText('NaplesPU-学习记录.json',JSON.stringify({exportedAt:new Date().toISOString(),readChapters:[...state.read],quizzes:state.answers,notes:state.notes},null,2),'application/json');
  $('#quiz-reset').onclick=()=>{state.answers={};save('answers',state.answers);renderQuizzes();toast('已开始新一轮自测。');};
  $('#mobile-menu').onclick=()=>$('#sidebar').classList.toggle('open');$('#focus-toggle').onclick=()=>document.body.classList.toggle('focus-mode');
  document.addEventListener('keydown',event=>{if(event.target.getAttribute('role')==='tab'&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){const parent=event.target.parentElement,tabs=[...parent.querySelectorAll('[role="tab"]')],index=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;event.preventDefault();tabs[next].click();parent.querySelectorAll('[role="tab"]')[next]?.focus();}});
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommand();}if(e.key==='Escape'){for(const id of ['#code-overlay','#command-overlay','#notes-overlay'])if(!$(id).hidden)closeOverlay(id);$('#sidebar').classList.remove('open');}if(e.key==='Tab'){const active=$$('.overlay').find(e=>!e.hidden);if(active){const focusable=[...active.querySelectorAll('button:not(:disabled),a[href],input,textarea,[tabindex="0"]')].filter(el=>!el.hidden&&el.getClientRects().length);if(focusable.length){const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopFlow();});
  renderJourneys();renderCourse();renderMap();renderFlow();renderLab();renderBuild();renderConcepts();renderLogic();renderSourceGroups();filterSources();renderGlossary();renderQuizzes();renderResearch();renderFigures();$('#embedded-count').textContent=Object.keys(upstreamCode).length;
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){$$('nav a.active').forEach(a=>a.classList.remove('active'));$$(`nav a[href="#${entry.target.id}"]`).forEach(a=>a.classList.add('active'));}},{rootMargin:'-15% 0px -70% 0px',threshold:0});$$('main>section[id],.chapter[id]').forEach(s=>observer.observe(s));}
  window.NPU_ATLAS={openCode,chapters:chapters.length,sourceCount:files.length,embeddedCount:Object.keys(upstreamCode).length,concepts:concepts.length,workshops:workshops.length};
  if(!chapters.length)toast('课程数据尚未载入，请确认 content 目录完整。');
})();

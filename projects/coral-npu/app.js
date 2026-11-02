(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const h=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const prose=v=>String(v||'').split(/\n\s*\n/).map(p=>'<p>'+h(p)+'</p>').join('');
  const asText=v=>typeof v==='string'?v:Array.isArray(v)?v.map(asText).join('；'):v&&typeof v==='object'?Object.values(v).map(asText).join('；'):String(v||'');
  const M=window.CORAL_MODELS,L=window.NPU_LOGIC;
  let INDEX={files:[],commitMap:{},repoUrls:{},stats:{}},HW={},SW={},chapters=[],glossary=[],quizzes=[],currentQuiz=0;
  let activeArchitecture='system',activeModule='core',traceStep=0,currentFile=null,codeStart=1,filePage=0,folderPath='',folderRepo='';
  const sourceCache=new Map(),fileByKey=new Map(),stateKey='coral-field-guide-v1';
  let saved={done:[],notes:''};try{saved={...saved,...JSON.parse(localStorage.getItem(stateKey)||'{}')};}catch(e){}
  const persist=()=>{try{localStorage.setItem(stateKey,JSON.stringify(saved));}catch(e){toast('浏览器未允许保存，仍可导出笔记。');}};
  function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2800);}
  function sourceRef(source,label){
    if(!source)return '';if(Array.isArray(source))return source.map(s=>sourceRef(s)).join('');
    if(typeof source==='string')source={path:source};
    const repo=source.repo||'hardware',path=source.path||source.file||'';
    if(!path)return '';
    return '<button class="source-ref" data-source="'+h(path)+'" data-repo="'+h(repo)+'" data-line="'+h(source.line||1)+'" title="打开固定版本源码">'+h(label||path.split('/').slice(-2).join('/')+':'+(source.line||1))+' ↗</button>';
  }
  const scalar='hdl/chisel/src/coralnpu/scalar/',core='hdl/chisel/src/coralnpu/',zvt='hdl/verilog/rvv/design/Zvt/';
  const modules={
    host:{label:'外部 Host',sub:'系统控制与数据装载',body:'Host 通过系统总线装载程序和张量、配置控制状态，并观察完成或故障。Host 不等同于 Coral 的标量前端。',points:['明确 Host 与设备地址空间。','先确认 wrapper、控制寄存器和启动协议。'],path:'doc/integration_guide.md'},
    axi:{label:'CoreAxi wrapper',sub:'AXI / TCM / CSR',body:'AXI wrapper 将 Core 的指令、数据访问与外部访问连接到本地存储及系统接口。具体实例路径与独立 BankedDtcm 组件应分别阅读。',points:['AXI 的读写通道独立握手。','TCM/CSR 访问与外部主端口有不同职责。'],path:core+'CoreAxi.scala'},
    fabric:{label:'本地 Fabric',sub:'地址译码与固定优先级仲裁',body:'这里是本地地址空间的连接与仲裁。它不是多跳 Mesh NoC，也不自动维护缓存行的一致性权限。',points:['谁发请求、谁被授权、响应如何返回？','被拒绝的请求是否保持稳定并能重试？'],path:core+'Fabric.scala'},
    itcm:{label:'ITCM',sub:'指令紧耦合存储',body:'为程序取指提供显式的低延迟存储窗口。容量和映射属于所选配置，不应直接套用某个产品宣传参数。',points:['程序体积需要匹配 ITCM。','确认指令装载、复位和启动顺序。'],path:core+'TCM.scala'},
    dtcm:{label:'DTCM',sub:'数据紧耦合存储',body:'保存目标程序所需的数据与中间张量。它有明确地址窗口；其访问、Bank 和端口结构由实际 wrapper 与存储实现决定。',points:['TCM 不是自动填充、替换的通用 Cache。','本地容量会影响编译器分块。'],path:core+'TCM.scala'},
    external:{label:'外部 AXI',sub:'系统侧存储与外设',body:'本地窗口之外的访问需要按照目标 wrapper 的地址译码和总线协议处理。接口存在不等于任意内存访问都具有相同延迟、顺序或吞吐。',points:['明确地址译码与错误响应。','不能把总线存在当成 DMA 或一致性保证。'],path:core+'DBus2Axi.scala'},
    core:{label:'Coral Core',sub:'标量 + 可选 RVV / VME',body:'Core 将标量前端与可选向量后端连接起来。VME 需要 RVV；具体构建目标可能只启用部分执行单元。',points:['从 Core 的实例关系追踪功能开关。','不要把 CoreMini、RVV、VME 合为一个默认目标。'],path:core+'Core.scala'},
    fetch:{label:'取指前端',sub:'Uncached fetch / buffers',body:'从指令接口获取程序并整理请求与返回。取指缓冲和返回重排处理不等于指令 Cache。',points:['跟踪 PC、请求、返回和异常。','确认跳转恢复时哪些状态需要清除。'],path:scalar+'UncachedFetch.scala'},
    decode:{label:'译码与分派',sub:'Decode / DispatchV2',body:'译码把指令变成控制含义；分派同时检查依赖、资源和多指令组合约束。DispatchV2 定义在 Decode.scala。',points:['找到每类指令的 ready / fire。','确认多发射限制与同周期相关性。'],path:scalar+'Decode.scala'},
    regfile:{label:'寄存器与 busy',sub:'RAW / WAW / writeback',body:'寄存器文件与 busy 信息帮助阻止读未完成结果或覆盖待写目的。它与重命名、旁路、异常恢复是不同机制。',points:['追踪 busy 置位和清除的时钟条件。','真实寄存器数量与教学8位模型不同。'],path:scalar+'Regfile.scala'},
    scalar:{label:'标量执行',sub:'ALU / BRU / MLU / DVU',body:'标量执行负责地址、循环、控制与通用计算。不同功能单元的延迟和完成路径并不相同。',points:['单周期 ALU 与多周期单元怎样共存？','结构冲突如何反馈到分派？'],path:scalar+'SCore.scala'},
    float:{label:'浮点执行',sub:'FP32 / BF16 配置相关',body:'浮点单元和相关精度功能由配置控制。需要同时理解数值语义、流水线完成、目标特征和软件生成的指令。',points:['吞吐与延迟不是同一个数。','核对所选算术实现与舍入行为。'],path:core+'float/FloatCore.scala'},
    lsu:{label:'Load / Store',sub:'请求、对齐、响应与阻塞',body:'LSU 处理指令的存储访问。response snooping 让一次 row 响应满足同一 LSU 内多个合适的等待 cell；strict 与写访问限制复用，它不维护多 cache 的 owner/sharers。',points:['核对地址、访问宽度与跨边界情况。','请求被接受和返回完成是两个时刻。'],path:scalar+'Lsu.scala'},
    retirement:{label:'退休与完成跟踪',sub:'Completed ≠ Retired',body:'顶层 RetirementBuffer 用于完成、故障及按序退休跟踪。不能照搬通用乱序 CPU“所有写回都等到退休才提交”的模型；RVV 后端还有独立 ROB 路径。',points:['先阅读 Completed 与 Retired 的定义。','分清顶层跟踪和 RVV 内部 ROB。'],path:core+'RetirementBuffer.scala'},
    rvv:{label:'RVV 后端',sub:'向量译码、寄存器与执行',body:'标准向量指令在后端被译码和执行。VLEN、SEW、LMUL、vl 与掩码共同决定逻辑向量含义，不能把逻辑元素数当作物理每拍执行数。',points:['从 Chisel wrapper 跟到 SV 后端。','分别阅读 VRF、执行单元和 ROB。'],path:core+'rvv/RvvCore.scala'},
    vrf:{label:'向量寄存器',sub:'分组、掩码与写回',body:'向量寄存器保存执行操作数及结果。寄存器分组由 LMUL 等配置影响，写回还需要处理掩码、尾元素和类型。',points:['区分 VLEN 与实际 vl。','检查宽化运算如何改变寄存器分组。'],path:'hdl/verilog/rvv/design/rvv_backend_vrf.sv'},
    matrix:{label:'Zvt 矩阵单元',sub:'可选 VME / tile state',body:'矩阵指令把局部寄存器中的操作数组织为矩阵运算，并保持 Tile 累加状态。它是可选配置，实际 ISA 与补丁版本需要一起确认。',points:['从 zvt.sv 进入控制、PE 和 Tile 状态。','检查 BF16/INT8/FP32 的数值与掩码。'],path:zvt+'zvt.sv'},
    matrixctrl:{label:'矩阵控制',sub:'配置、指令与握手',body:'矩阵控制逻辑解释指令和配置，产生运算及 Tile 访问控制。先列出控制信号的生效条件，再追踪数据。',points:['配置什么时候被采样？','一条操作何时接受、何时完成？'],path:zvt+'zvt_ctrl.sv'},
    pe:{label:'PE 阵列',sub:'乘法、归约与数值通路',body:'由 PE 块及不同数值类型的乘加路径组成。阵列的逻辑组织、浮点对齐归约与累加接口需要逐层阅读，不能仅凭二维图推定数据流。',points:['追踪一个操作数到最终累加。','检查有符号数、舍入和控制对齐。'],path:zvt+'zvt_pe_array.sv'},
    tile:{label:'MT / Tile 状态',sub:'subtile / byte enables',body:'Tile 状态以 subtile 和 byte enable 等形式更新，并有 FPGA 相关实现。掩码错误会在部分写入时破坏旧值。',points:['被屏蔽的字节由谁保留？','多写入者的端口与冲突怎样定义？'],path:zvt+'zvt_mt.sv'},
    accumulator:{label:'PE 内部累加',sub:'PE adder → MT 状态',body:'当前 Zvt 路径把 MT 内容送入 PE block 的 adder，再将结果写回 MT。编译器需明确初始化和累加顺序；仓库中的 zvt_acc.sv 不能仅凭文件名认定已接入当前实例链。',points:['第一次累加与后续累加有什么不同？','切换 Tile 前如何确认旧操作完成？'],path:zvt+'zvt_pe_block.sv',line:254}
  };
  const maps={
    system:{nodes:[['host',25,25,160,65],['axi',260,25,190,65],['core',25,165,160,75],['fabric',255,155,200,75],['itcm',60,300,155,65],['dtcm',270,300,155,65],['external',480,300,175,65]],wires:[[185,57,260,57],[355,90,355,155],[185,202,255,192],[305,230,140,300],[365,230,350,300],[455,193,565,300]],labels:[[25,125,'SYSTEM HOST / IP 边界'],[260,265,'本地存储 / 系统出口']]},
    core:{nodes:[['fetch',20,30,170,65],['decode',250,30,190,65],['regfile',490,30,180,65],['scalar',20,180,175,65],['float',250,180,185,65],['rvv',490,180,180,65],['lsu',140,325,180,65],['retirement',400,325,235,65]],wires:[[190,62,250,62],[440,62,490,62],[300,95,105,180],[345,95,345,180],[395,95,575,180],[105,245,225,325],[575,245,520,325],[530,245,280,325],[270,325,555,245],[345,245,450,325]],labels:[[20,140,'多发射约束 / 相关性 / 资源'],[20,290,'共享 LSU：向量元素 / 索引 / mask 请求及返回']]},
    matrix:{nodes:[['rvv',20,25,190,65],['matrixctrl',270,25,190,65],['vrf',500,25,195,65],['tile',25,190,195,75],['pe',270,190,190,75],['accumulator',500,190,195,75],['lsu',265,345,200,65]],wires:[[210,58,270,58],[595,90,400,190],[365,90,365,190],[220,228,270,228],[460,228,500,228],[595,265,595,292,120,292,120,265],[120,265,320,345],[310,345,80,265]],labels:[[25,135,'RVV 命令 / VRF 操作数 / Zvt 控制'],[25,315,'MT 保存累加状态；LSU 负责 Tile load / store']]}
  };
  function symbolSource(mod){const f=INDEX.files.find(f=>f.repo==='hardware'&&f.path===mod.path);const name=mod.path.split('/').pop().split('.')[0];const s=f?.symbols?.find(s=>s.name===name)||f?.symbols?.find(s=>s.kind==='class'||s.kind==='module');return {repo:'hardware',path:mod.path,line:mod.line||s?.line||1};}
  function renderArchitecture(){
    const map=maps[activeArchitecture];if(!map.nodes.some(n=>n[0]===activeModule))activeModule=map.nodes[0][0];
    let svg='<svg viewBox="0 0 720 445" role="img" aria-label="点击模块探索 '+activeArchitecture+' 架构"><defs><marker id="arch-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7" fill="#78927e"/></marker></defs>';
    if(activeArchitecture==='matrix')svg+='<rect x="255" y="170" width="455" height="110" rx="8" fill="none" stroke="#b09b80" stroke-dasharray="4 4"/><text class="diagram-label" x="270" y="160">PE Array / Block 内部职责</text>';
    map.wires.forEach((w,i)=>{svg+='<path class="arch-wire '+(i>1?'data':'')+'" marker-end="url(#arch-arrow)" d="M'+w[0]+' '+w[1]+' L'+w.slice(2).reduce((parts,v,j,a)=>{if(j%2===0)parts.push(v+' '+a[j+1]);return parts;},[]).join(' L')+'"/>';});
    map.nodes.forEach(n=>{const [id,x,y,w,ht]=n,mod=modules[id];svg+='<g class="diagram-node '+(id===activeModule?'active':'')+'" data-module="'+id+'" tabindex="0" role="button" aria-label="'+h(mod.label)+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+ht+'" rx="3"/><text x="'+(x+13)+'" y="'+(y+27)+'">'+h(mod.label)+'</text><text class="node-sub" x="'+(x+13)+'" y="'+(y+46)+'">'+h(mod.sub)+'</text></g>';});
    map.labels.forEach(n=>svg+='<text class="diagram-label" x="'+n[0]+'" y="'+n[1]+'">'+h(n[2])+'</text>');
    svg+='</svg>';$('#architecture-map').innerHTML=svg;
    $('#architecture-map').classList.toggle('flow-off',!$('#flow-toggle').checked);
    const mod=modules[activeModule];$('#module-detail').innerHTML='<span class="module-id">MODULE / '+h(activeModule.toUpperCase())+'</span><h3>'+h(mod.label)+'</h3><p>'+h(mod.body)+'</p><ul>'+mod.points.map(p=>'<li>'+h(p)+'</li>').join('')+'</ul>'+sourceRef(symbolSource(mod),'打开实现入口')+'<p class="muted">此图按职责组织；精确实例关系以当前构建目标和语法/展开记录为准。</p>';
  }
  const trace=[
    ['算子与目标','从一个 Matmul 的形状、类型、目标特征开始。确认是在 Host、RVV 还是 Zvt 路径。',{repo:'compiler',path:'docs/design/matrix_codegen.md',line:1}],
    ['分块与内存','计算 DTCM 和寄存器级 Tile；容量、静态形状和尾块条件会影响生成路径。',{repo:'compiler',path:'docs/design/tiling_levels_explained.md',line:1}],
    ['目标指令','IREE/LLVM 生成标量、RVV、Zvt 指令，连同 ABI、链接地址和运行后端一起匹配版本。',{repo:'compiler',path:'README.md',line:1}],
    ['取指与分派','Core 取指、译码并检查依赖和资源，再把工作送往对应执行路径。',{path:scalar+'Decode.scala',line:397}],
    ['操作数与执行','向量寄存器及 Tile 状态为矩阵单元提供操作数，控制、乘加和掩码必须保持对齐。',{path:zvt+'zvt.sv',line:1}],
    ['写回与完成','结果写回、内存响应和退休有各自的完成条件，不要把它们合并成一个脉冲。',{path:core+'RetirementBuffer.scala',line:1}],
    ['结果与验证','运行时等待后端完成并回收结果；同时核对数值、地址、指令与周期观测的含义。',{repo:'compiler',path:'README.md',line:1}]
  ];
  function renderTrace(){$('#execution-trace').innerHTML=trace.map((t,i)=>'<button class="trace-step '+(i===traceStep?'active':'')+'" data-trace="'+i+'"><span>0'+(i+1)+'</span>'+h(t[0])+'</button>').join('');$('#trace-position').textContent=(traceStep+1)+' / '+trace.length;$('#trace-detail').innerHTML='<p><b>'+h(trace[traceStep][0])+'</b> — '+h(trace[traceStep][1])+'</p>'+sourceRef(trace[traceStep][2]);}
  function updateProgress(){const completed=chapters.filter(c=>saved.done.includes(c.id)).length;$('#progress-count').textContent=completed+' / '+chapters.length;$('#study-progress').max=chapters.length||1;$('#study-progress').value=completed;$$('.done-button').forEach(b=>{const done=saved.done.includes(b.dataset.done);b.classList.toggle('complete',done);b.textContent=done?'✓ 已读，可再次复习':'标记这一章已读 ○';});}
  function renderChapters(){
    const group=$('#course-filter .active')?.dataset.course||'all',q=$('#course-search').value.trim().toLowerCase();
    const list=chapters.filter(c=>(group==='all'||c.group===group)&&(!q||asText(c).toLowerCase().includes(q)));
    $('#course-index').innerHTML=list.map(c=>'<a href="#chapter-'+h(c.id)+'" data-chapter="'+h(c.id)+'">'+h(String(c.order).padStart(2,'0')+' '+c.title)+'</a>').join('');
    $('#chapters').innerHTML=list.map(c=>{
      const sections=(c.sections||[]).map(s=>{
        let body='<section class="chapter-section"><h4>'+h(s.title||'机制解析')+'</h4>'+prose(s.body);
        if(s.bullets?.length)body+='<ul>'+s.bullets.map(x=>'<li>'+h(asText(x))+'</li>').join('')+'</ul>';
        if(s.code)body+='<pre><code>'+h(s.code)+'</code></pre><p class="code-caption">'+h(s.codeLabel||s.codeType||(s.codeOrigin==='upstream'?'固定提交的原始源码摘录；点击行号核对上下文。':'结合章节说明阅读；教学示意不能直接替换上游实现。'))+'</p>'+(s.codeSource?sourceRef(s.codeSource,'摘录原文 L'+s.codeSource.line+'–'+s.codeSource.endLine):'');
        if(s.source)body+=sourceRef(s.source);if(s.sources)body+=sourceRef(s.sources);
        if(s.implementation)body+='<div class="lesson-note"><strong>自己写时，怎样落地</strong>'+prose(asText(s.implementation))+'</div>';
        if(s.pitfalls)body+='<div class="lesson-note warn"><strong>容易写错的地方</strong>'+prose(asText(s.pitfalls))+'</div>';
        if(s.exercise)body+='<div class="lesson-exercise"><strong>带着问题回到代码</strong>'+h(asText(s.exercise))+'</div>';
        return body+'</section>';
      }).join('');
      const extension=/noc|coher|directory|extension/i.test(c.id)||/扩展/.test(c.title);
      return '<details class="chapter" id="chapter-'+h(c.id)+'" data-group="'+c.group+'"><summary><span class="chapter-number">'+String(c.order).padStart(2,'0')+'</span><div><h3>'+h(c.title)+'</h3><p>'+h(c.summary)+'</p></div><span class="chapter-plus">＋</span></summary><div class="chapter-body"><div class="chapter-actions"><span class="badge '+(extension?'extension':'fact')+'">'+(extension?'教学与系统扩展':c.group==='hardware'?'硬件源码课程':'软件栈源码课程')+'</span><button class="done-button" data-done="'+h(c.id)+'">标记已读</button></div>'+sections+'</div></details>';
    }).join('')||'<p class="loading">没有找到匹配章节，试试更短的关键词。</p>';updateProgress();
  }
  function openChapter(id){const c=chapters.find(c=>c.id===id);if(!c)return;const existing=$('#chapter-'+CSS.escape(id));if(!existing){$('#course-search').value='';$$('#course-filter button').forEach(b=>b.classList.toggle('active',b.dataset.course==='all'));renderChapters();}const node=$('#chapter-'+CSS.escape(id));node.open=true;node.scrollIntoView({behavior:'auto',block:'start'});}
  function upstream(repo,path,line=1){const direct=fileByKey.get(repo+':'+path)?.sourceUrl;if(direct)return direct+'#L'+line;const urls={hardware:'https://github.com/google-coral/coralnpu',compiler:'https://github.com/google-coral/coralnpu-compiler',mpact:'https://github.com/google-coral/coralnpu-mpact','mpact-riscv':'https://github.com/google/mpact-riscv','mpact-sim':'https://github.com/google/mpact-sim'};const pins={mpact:'704b28ce126debd2d951f9c3b36704080d75dc60','mpact-riscv':'19f9b3c0c8670d8425ca237c28d2d6bf1079cfff','mpact-sim':'11dfe5a8e841358b41e012bab1fc2fe18a229728'};return (INDEX.repoUrls?.[repo]||urls[repo]||urls.hardware)+'/blob/'+(INDEX.commitMap?.[repo]||pins[repo]||INDEX.commit||'main')+'/'+path.split('/').map(encodeURIComponent).join('/')+'#L'+line;}
  async function getSource(file){const key=file.repo+':'+file.path;if(sourceCache.has(key))return sourceCache.get(key);if(!file.contentPath)throw new Error('此文件仅保留索引与固定提交链接，未在公开页面内嵌完整内容。');const response=await fetch(file.contentPath);if(!response.ok)throw new Error('源码响应 '+response.status);const text=await response.text();sourceCache.set(key,text);return text;}
  function highlighted(text){const tokens=/(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'[^']*'|\b(?:module|endmodule|class|object|trait|val|var|def|if|else|when|otherwise|switch|case|input|output|logic|wire|reg|always_ff|always_comb|assign|begin|end|parameter|localparam|function|endfunction|import|package|return|for|while|struct|enum|const|void|int|bool|static|auto|template|namespace|public|private|class)\b|\b\d+(?:'\w+)?\b)/g;let out='',last=0,match;while((match=tokens.exec(text))!==null){out+=h(text.slice(last,match.index));const value=match[0],type=value.startsWith('//')||value.startsWith('#')?'comment':value.startsWith('"')||value.startsWith("'")?'string':/^\d/.test(value)?'number':'keyword';out+='<span class="tok-'+type+'">'+h(value)+'</span>';last=match.index+value.length;}return out+h(text.slice(last));}
  async function showCode(target,file,line=1,windowStart=null){
    const token=String(Date.now())+Math.random();target.dataset.token=token;target.innerHTML='<p class="loading">读取 '+h(file.path)+'…</p>';
    try{const text=await getSource(file);if(target.dataset.token!==token)return;const lines=text.split('\n'),start=windowStart===null?Math.max(1,line-22):Math.max(1,windowStart),end=Math.min(lines.length,start+159);
      target.innerHTML=lines.slice(start-1,end).map((v,i)=>'<div class="code-line '+(i+start===line?'highlight':'')+'" data-code-line="'+(i+start)+'"><span class="line-number">'+(i+start)+'</span><span class="line-text">'+highlighted(v)+'</span></div>').join('');
      target.scrollTop=0;if(target.id==='code-view'){codeStart=start;$('#code-range').textContent=start+'–'+end+' / '+lines.length;$('#line-jump').max=lines.length;$('#code-prev').disabled=start===1;$('#code-next').disabled=end===lines.length;}
    }catch(e){if(target.dataset.token!==token)return;target.innerHTML='<p class="loading">'+h(e.message)+'<br><a href="'+h(upstream(file.repo,file.path,line))+'" target="_blank" rel="noopener noreferrer" style="color:#d5e89d">查看固定提交的官方源文件 ↗</a></p>';}
  }
  function selectFile(file,line=1){currentFile=file;codeStart=Math.max(1,line-22);$('#code-title').innerHTML='<span>'+h(file.repo+' / '+file.path)+'</span><a href="'+h(upstream(file.repo,file.path,line))+'" target="_blank" rel="noopener noreferrer">官方原文 ↗</a>';$('#code-symbols').innerHTML=(file.symbols||[]).slice(0,100).map(s=>'<button data-symbol-line="'+s.line+'">'+h(s.name)+':'+s.line+'</button>').join('');$('#line-jump').value=line;showCode($('#code-view'),file,line,codeStart);renderFileStructure(file);$$('.file-row').forEach(b=>b.classList.toggle('active',b.dataset.file===file.repo+':'+file.path));}
  function openSource(repo,path,line=1){const file=fileByKey.get(repo+':'+path)||{repo,path};$('#dialog-source-title').textContent=repo+' / '+path;$('#dialog-code-meta').innerHTML='<span>固定提交 · L'+line+' · 点击原文可阅读完整文件</span><a href="'+h(upstream(repo,path,line))+'" target="_blank" rel="noopener noreferrer">GitHub ↗</a>';$('#source-dialog').showModal();showCode($('#dialog-code'),file,line);}
  function fileButton(file){return '<button class="file-row '+(currentFile?.repo===file.repo&&currentFile?.path===file.path?'active':'')+'" data-file="'+h(file.repo+':'+file.path)+'"><span>'+h(file.path.split('/').pop())+'</span><small>'+h(file.path)+' · '+h(file.language)+(file.contentPath?'':' · 上游原文')+'</small></button>';}
  function renderFiles(){
    const repo=$('#repo-filter').value,q=$('#source-search').value.toLowerCase().trim();
    const folder=(r,p,label,count)=>'<button class="folder-row" data-folder-path="'+h(p)+'" data-folder-repo="'+h(r)+'"><span>▸ '+h(label)+'</span><small>'+h(count==null?'':count+' files')+'</small></button>';
    let files=INDEX.files.filter(f=>(repo==='all'||f.repo===repo)&&(!q||(f.path+' '+(f.symbols||[]).map(s=>s.name).join(' ')).toLowerCase().includes(q))),prefix='';
    $('#source-count').textContent=files.length.toLocaleString()+' files';
    if(!q){
      const r=repo==='all'?folderRepo:repo;
      if(!r){$('#source-tree').innerHTML=[...new Set(files.map(f=>f.repo))].map(r=>folder(r,'',r,files.filter(f=>f.repo===r).length)).join('');$('#file-page').textContent='仓库根目录';$('#file-prev').disabled=true;$('#file-next').disabled=true;return;}
      const p=folderPath?folderPath+'/':'';files=files.filter(f=>f.repo===r&&f.path.startsWith(p));
      prefix='<div class="folder-breadcrumb"><button data-folder-path="" data-folder-repo="'+h(repo==='all'?'':r)+'">'+h(repo==='all'?'全部仓库':r)+'</button><span>/ '+h(folderPath||'根目录')+'</span></div>';
      if(folderPath)prefix+=folder(r,folderPath.split('/').slice(0,-1).join('/'),'.. 上一级');
      const dirs=new Map();files.forEach(f=>{const rest=f.path.slice(p.length);if(rest.includes('/')){const name=rest.split('/')[0];dirs.set(name,(dirs.get(name)||0)+1);}});
      prefix+=[...dirs].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,count])=>folder(r,p+name,name+'/',count)).join('');
      files=files.filter(f=>!f.path.slice(p.length).includes('/'));
    }
    const pages=Math.max(1,Math.ceil(files.length/60));filePage=Math.min(filePage,pages-1);
    $('#source-tree').innerHTML=prefix+files.slice(filePage*60,filePage*60+60).map(fileButton).join('')||'<p class="loading">没有匹配文件。</p>';$('#file-page').textContent=(filePage+1)+' / '+pages;$('#file-prev').disabled=filePage===0;$('#file-next').disabled=filePage===pages-1;
  }
  function renderFileStructure(file){
    const symbols=file.symbols||[],out=(INDEX.edges||[]).filter(e=>e.repo===file.repo&&e.sourcePath===file.path),ids=new Set(symbols.map(s=>s.id)),incoming=(INDEX.edges||[]).filter(e=>ids.has(e.toId));
    const edges=(items,inward)=>items.slice(0,60).map(e=>'<li><div><b>'+h(inward?e.from:e.to)+'</b> <small>'+h(e.instance||e.type)+' · '+h(e.resolution||'语法引用')+'</small></div>'+sourceRef({repo:e.repo,path:e.sourcePath,line:e.line},'引用处 L'+e.line)+(inward?'':(e.targetCandidates||[]).slice(0,3).map(t=>sourceRef({repo:e.repo,path:t.path,line:t.line},'定义 '+e.to)).join(''))+'</li>').join('');
    const ports=symbols.flatMap(s=>(s.ports||[]).map(p=>({...p,parent:s.name}))),params=symbols.flatMap(s=>(s.parameters||[]).map(p=>({...p,parent:s.name})));
    $('#source-structure').innerHTML='<div class="structure-heading"><strong>从语法树读结构</strong><span>'+h(file.parseMethod||'元数据')+' · '+h(file.parseStatus||'按需阅读')+'</span></div><div class="structure-grid"><details><summary>已提取接口 / 参数 <b>'+ports.length+' / '+params.length+'</b></summary>'+(ports.length||params.length?'<ul>'+[...ports,...params].slice(0,100).map(p=>'<li><small>'+h(p.parent)+' · '+h(p.direction||'parameter')+'</small><code>'+h(p.declaration||p.name)+'</code>'+sourceRef({repo:file.repo,path:file.path,line:p.line||1},'L'+(p.line||1))+'</li>').join('')+'</ul>':'<p>本文件没有已提取的端口或参数；继续查看源码及其 Bundle / 接口类型定义。</p>')+'</details><details><summary>向下追踪引用 <b>'+out.length+'</b></summary><ul>'+edges(out,false)+'</ul>'+(out.length?'':'<p>没有提取到实例或资源引用。</p>')+'</details><details><summary>谁引用这里 <b>'+incoming.length+'</b></summary><ul>'+edges(incoming,true)+'</ul>'+(incoming.length?'':'<p>没有唯一解析到此处的引用；外部、宏和重名目标可能未解析。</p>')+'</details></div><p class="structure-boundary">嵌套 Bundle 和类型仍需展开核对。语法关系含条件分支、BlackBox 资源与未解析目标，不能当作配置的完整网表。每组最多展示 60 条关系、100 条接口/参数。</p>';
  }
  function renderGlossary(){const q=$('#glossary-search').value.toLowerCase().trim(),list=glossary.filter(g=>(g.term+' '+g.zh+' '+g.definition).toLowerCase().includes(q));$('#glossary').innerHTML=list.map(g=>'<details><summary><strong>'+h(g.term)+'</strong><span>'+h(g.zh||'')+'</span></summary><p>'+h(g.definition)+'</p>'+(g.analogy?'<p>帮助理解：'+h(g.analogy)+'</p>':'')+sourceRef(g.source)+'</details>').join('')||'<p class="muted">换一个关键词试试。</p>';}
  function renderQuiz(){const q=quizzes[currentQuiz%quizzes.length];if(!q)return;$('#quiz-content').innerHTML='<h3>'+h(q.question)+'</h3>'+q.options.map((o,i)=>'<button class="quiz-option" data-answer="'+i+'">'+h(o)+'</button>').join('')+'<div class="quiz-explanation" id="quiz-explanation" hidden></div>';$('#quiz-progress').textContent=(currentQuiz+1)+' / '+quizzes.length+' · 选择后查看解释';}
  function renderSearch(){const q=$('#global-search').value.trim().toLowerCase();if(!q){$('#search-results').innerHTML='<p class="loading">输入概念、源码文件或模块名。</p>';return;}const result=[];chapters.forEach(c=>{if(asText(c).toLowerCase().includes(q))result.push({type:'课程',title:c.title,description:c.summary,chapter:c.id});});glossary.forEach(g=>{if((g.term+' '+g.zh+' '+g.definition).toLowerCase().includes(q))result.push({type:'概念',title:g.term+' / '+(g.zh||''),description:g.definition,glossary:g.term});});INDEX.files.forEach(f=>{if((f.path+' '+(f.symbols||[]).map(s=>s.name).join(' ')).toLowerCase().includes(q))result.push({type:'源码',title:f.path,description:f.repo+' · '+f.language,file:f.repo+':'+f.path});});$('#search-results').innerHTML=result.slice(0,22).map(r=>'<button class="search-result" '+(r.chapter?'data-search-chapter="'+h(r.chapter)+'"':r.file?'data-search-file="'+h(r.file)+'"':'data-search-glossary="'+h(r.glossary)+'"')+'><span>'+r.type+'</span><strong>'+h(r.title)+'</strong><p>'+h(r.description).slice(0,160)+'</p></button>').join('')||'<p class="loading">没有找到这个关键词。</p>';}
  const labState={scoreboard:L.scoreboardInitial(),fifo:L.fifoInitial(),directory:L.directoryInitial(),bankPending:null,bankCycle:0,matrixStep:0,nocStep:0,vectorMask:[],log:[]};
  let activeLab='scoreboard';
  const options=(count,selected=0)=>Array.from({length:count},(_,i)=>'<option value="'+i+'" '+(i===selected?'selected':'')+'>'+i+'</option>').join('');
  const control=(label,id,value,min=0,max=7)=>'<label class="control"><span>'+label+'</span><input id="'+id+'" type="number" min="'+min+'" max="'+max+'" value="'+value+'"></label>';
  const checkbox=(label,id,checked=false)=>'<label class="control inline"><input type="checkbox" id="'+id+'" '+(checked?'checked':'')+'> '+label+'</label>';
  const metric=(value,label)=>'<div><strong>'+h(value)+'</strong><span>'+h(label)+'</span></div>';
  const labIntro=(title,description,extension=false)=>'<div class="lab-intro"><div><span class="badge '+(extension?'extension':'model')+'">'+(extension?'系统扩展 / 非当前 Coral 模块':'缩小机制的教学模型')+'</span><h3>'+h(title)+'</h3><p>'+h(description)+'</p></div></div>';
  const eventBox=(text,warning=false)=>'<div id="lab-event" class="lab-event '+(warning?'warning':'')+'">'+h(text)+'</div><div id="lab-log" class="lab-log"></div>';
  function logEvent(text){const event=$('#lab-event');if(event)event.textContent=text;labState.log.unshift(text);labState.log=labState.log.slice(0,12);if($('#lab-log'))$('#lab-log').innerHTML=labState.log.map((v,i)=>'<p>'+h(String(labState.log.length-i).padStart(2,'0')+' / '+v)+'</p>').join('');}
  function labShell(intro,controls,output){$('#lab-stage').innerHTML=intro+'<div class="lab-layout"><div class="lab-controls">'+controls+'</div><div class="lab-output">'+output+'</div></div>';labState.log=[];}
  function renderLab(){
    if(activeLab==='scoreboard'){
      labShell(labIntro('结果还没回来，这条指令能发射吗？','8个抽象寄存器的 busy 位模型。读未完成的结果是 RAW，覆盖待写目的为 WAW；r0–r7 是抽象位，r0 不是 RISC-V x0。hazard 只看旧 busy，不实现同拍写回旁路和真实四槽位规则。'),
        control('源寄存器 A','sb-a',1)+control('源寄存器 B','sb-b',2)+control('目的寄存器','sb-d',3)+control('本拍写回清除寄存器（-1=无）','sb-wb',-1,-1,7)+checkbox('指令 valid','sb-valid',true)+checkbox('执行资源 ready','sb-ready',true)+'<div class="lab-buttons"><button data-lab-action="sb-step" class="accent">推进一个时钟边沿 →</button><button data-lab-action="sb-reset">复位</button><button data-lab-action="sb-dependency">制造 RAW</button></div>',
        '<p class="mono muted">BUSY REGISTER MAP / 8-bit teaching state</p><div id="sb-registers" class="register-grid"></div><div id="sb-metrics" class="lab-metrics"></div>'+sourceRef({path:scalar+'Regfile.scala',line:95},'对照 Coral Regfile')+eventBox('先发射 r3 ← r1 + r2，再把源寄存器改为 r3，观察阻塞。'));
      renderScoreboard();
    }else if(activeLab==='vector'){
      labShell(labIntro('向量不是“同时有多少个物理 ALU”。','改变 SEW、LMUL、vl 和掩码，观察逻辑寄存器分组。— 表示未写入；模型不保存旧 vd 值，真实尾部/掩码策略由指令和 vtype 决定。'),
        '<label class="control"><span>元素位宽 SEW</span><select id="vec-sew"><option>8</option><option>16</option><option selected>32</option></select></label><label class="control"><span>寄存器分组 LMUL</span><select id="vec-lmul"><option selected>1</option><option>2</option><option>4</option></select></label>'+control('实际向量长度 vl','vec-vl',4,0,64)+'<div class="lab-buttons"><button data-lab-action="vec-all">全部掩码启用</button><button data-lab-action="vec-alternate">隔位屏蔽</button></div><p class="muted">点击右侧元素可切换掩码。A[i]=i+1，B[i]=2i+1。</p>',
        '<div id="vec-metrics" class="lab-metrics"></div><div id="vector-lanes" class="lane-grid"></div>'+sourceRef({path:'examples/rvv_add_intrinsic.cc',line:30})+eventBox('VLMAX = LMUL × VLEN / SEW；逻辑元素数不等于每拍吞吐。'));
      renderVector();
    }else if(activeLab==='bank'){
      labShell(labIntro('多个请求，为什么会挤在一个 Bank？','按 word 地址取模的教学存储模型，每个 Bank 每拍授权一个请求，低编号优先。它用于理解 Bank conflict。BankedDtcm 默认按连续地址区间选 bank，与本模型的 word-interleaving 不同；CoreAxi 也需单独追踪。'),
        '<label class="control"><span>Bank 数</span><select id="bank-count"><option selected>4</option><option>8</option></select></label>'+[0,4,8,12].map((v,i)=>control('请求 '+i+' 的 byte 地址','bank-a'+i,v,0,1024)).join('')+'<div class="lab-buttons"><button data-lab-action="bank-step" class="accent">仲裁一拍 →</button><button data-lab-action="bank-conflict">同 Bank</button><button data-lab-action="bank-spread">分散访问</button><button data-lab-action="bank-reset">重新请求</button></div>',
        '<p class="mono muted">bank = floor(byte_address / 4) mod BANKS</p><div id="bank-requests" class="request-row"></div><div id="bank-output" class="bank-row"></div><div id="bank-metrics" class="lab-metrics"></div>'+sourceRef({path:core+'BankedDtcm.scala',line:79})+sourceRef({path:core+'Fabric.scala',line:22})+eventBox('先比较 0/4/8/12 与 0/16/32/48 的 Bank 映射。'));
      renderBank(false);
    }else if(activeLab==='fifo'){
      labShell(labIntro('有数据还不够，双方必须同时握手。','与下载练习包中的4项8bit FIFO 对应。使用旧状态决定 push/pop，full 时即使同拍 pop 也不接受 push；这是一种明确的接口选择。'),
        checkbox('输入 in_valid','fifo-valid',true)+checkbox('下游 out_ready','fifo-ready',false)+control('输入数据（8bit）','fifo-data',17,0,255)+'<div class="lab-buttons"><button data-lab-action="fifo-step" class="accent">推进一个时钟边沿 →</button><button data-lab-action="fifo-reset">复位</button></div><p class="muted">fire = valid && ready。无握手时，生产者应维持待发送数据和 valid。</p>',
        '<div id="fifo-metrics" class="lab-metrics"></div><div id="fifo-queue" class="fifo-queue"></div><a class="source-ref" href="rtl/learn_fifo.sv" target="_blank">独立教学 RTL / learn_fifo.sv ↗</a>'+eventBox('先让下游停止，填满队列；再打开 out_ready，观察数据顺序。'));
      renderFIFO();
    }else if(activeLab==='matrix'){
      labShell(labIntro('矩阵很大，片上空间很小。','一个显式 A/B/C Tile 容量算例。展示分块、K方向累加和边缘填充；未建模 IREE 的全部活跃值、对齐、调度、寄存器压力或实际周期。'),
        control('矩阵 M','tile-m',40,1,128)+control('矩阵 N','tile-n',64,1,128)+control('归约 K','tile-k',128,1,256)+'<label class="control"><span>逻辑输出 Tile</span><select id="tile-shape"><option value="16,16">16 × 16</option><option value="16,32">16 × 32</option><option value="32,32">32 × 32</option></select></label><label class="control"><span>输入类型</span><select id="tile-bytes"><option value="1">INT8 / 1 byte</option><option value="2">BF16 / 2 bytes</option><option value="4">FP32 / 4 bytes</option></select></label>'+control('DTCM 预算 KiB','tile-capacity',32,1,1024)+checkbox('A/B 双缓冲','tile-double',true)+'<div class="lab-buttons"><button data-lab-action="tile-step" class="accent">下一块累加 →</button><button data-lab-action="tile-reset">从头开始</button></div>',
        '<div id="tile-metrics" class="lab-metrics"></div><div id="tile-capacity-bar" class="capacity-bar"><span></span></div><div id="tile-grid" class="matrix-grid"></div>'+sourceRef({repo:'compiler',path:'docs/design/matrix_codegen.md',line:1})+eventBox('每个输出 Tile 沿 K 方向多次累加，K块长度在此固定为16。'));
      renderTile();
    }else if(activeLab==='address'){
      labShell(labIntro('一条地址，究竟落在哪个窗口？','依据 Parameters.scala 的 default/highmem 映射展示地址命中。实际构建可能覆写区域和容量；这不是自动探测当前 FPGA 的地址空间。'),
        '<label class="control"><span>配置模板</span><select id="address-mode"><option value="default">default：8 KiB / 32 KiB</option><option value="highmem">highmem：1 MiB / 1 MiB</option></select></label><label class="control"><span>byte 地址（十六进制）</span><input id="address-value" value="0x00010010" spellcheck="false"></label><div class="lab-buttons"><button data-lab-action="address-start">DTCM 起点</button><button data-lab-action="address-end">DTCM 末尾 + 1</button></div>',
        '<div id="address-regions" class="address-regions"></div><div id="address-metrics" class="lab-metrics"></div>'+sourceRef({path:core+'Parameters.scala',line:42})+eventBox('边界采用 start ≤ address < start + size。最后一个 byte 与末尾 +1 会命中不同区域。'));
      renderAddress();
    }else if(activeLab==='noc'){
      labShell(labIntro('为多个 Core 设计消息网络。','4×4 Mesh 的 XY 路由教学扩展。当前 Coral 本地 Fabric 不是这个网络。每一步只表示一次路由选择，不是有完整缓冲和链路时序的 NoC 仿真。',true),
        '<label class="control"><span>源节点</span><select id="noc-source">'+options(16,0)+'</select></label><label class="control"><span>目的节点</span><select id="noc-dest">'+options(16,15)+'</select></label>'+checkbox('下一跳暂时背压','noc-block',false)+'<div class="lab-buttons"><button data-lab-action="noc-step" class="accent">前进一步 →</button><button data-lab-action="noc-reset">重新注入</button></div><p class="muted">先沿 X，再沿 Y。真实设计还需 FIFO、仲裁、流控、死锁和饥饿验证。</p>',
        '<div id="noc-grid" class="noc-grid"></div><div id="noc-metrics" class="lab-metrics"></div><p class="badge extension">EXTENSION / 不属于当前 Coral IP</p>'+eventBox('路径上每个路由器必须明确：请求去哪里、能不能走、不能走时保留什么状态。'));
      renderNOC();
    }else if(activeLab==='directory'){
      labShell(labIntro('一个写权限，为什么需要等 ACK？','两核单行目录教学原型，与下载包 RTL 对应。这里仅维护权限元数据，无地址、行数据、真实网络、多事务槽或完整 MESI 实现。',true),
        '<label class="control"><span>请求 Core</span><select id="dir-core"><option value="0">C0</option><option value="1">C1</option></select></label><label class="control"><span>请求类型</span><select id="dir-type"><option value="read">读共享</option><option value="write">写独占</option></select></label>'+checkbox('req_valid','dir-req',true)+checkbox('probe_ready','dir-probe',true)+checkbox('ack_valid','dir-ack',false)+'<label class="control"><span>ACK 来自</span><select id="dir-ack-core"><option value="0">C0</option><option value="1">C1</option></select></label>'+checkbox('resp_ready','dir-resp',true)+'<div class="lab-buttons"><button data-lab-action="dir-step" class="accent">推进时钟边沿 →</button><button data-lab-action="dir-demo">C0→C1 权限示例</button><button data-lab-action="dir-reset">复位</button></div>',
        '<div id="directory-state" class="directory-state"></div><div id="directory-phases" class="state-flow"></div><div id="dir-metrics" class="lab-metrics"></div><a class="source-ref" href="rtl/learn_directory.sv" target="_blank">独立目录教学 RTL ↗</a><p class="badge extension">EXTENSION / Coral 不因此具有 directory_controller</p>'+eventBox('先 C0 写，再让 C1 请求读；目录必须收回旧权限，才能发出新的授权响应。'));
      renderDirectory();
    }
  }
  function renderScoreboard(){const s=labState.scoreboard;$('#sb-registers').innerHTML=Array.from({length:8},(_,i)=>'<div class="register-cell '+(s.busy&(1<<i)?'busy':'')+'">r'+i+'<small>'+(s.busy&(1<<i)?'BUSY':'READY')+'</small></div>').join('');$('#sb-metrics').innerHTML=metric(s.cycle,'教学时钟边沿')+metric(s.busy.toString(2).padStart(8,'0'),'busy[7:0]');}
  function renderVector(){const sew=Number($('#vec-sew').value),lmul=Number($('#vec-lmul').value),max=128/sew*lmul;$('#vec-vl').max=max;$('#vec-vl').value=Math.min(Number($('#vec-vl').value),max);const p=M.vectorPlan({sew,lmul,vl:Number($('#vec-vl').value),mask:labState.vectorMask});$('#vec-metrics').innerHTML=metric(128,'VLEN / bit')+metric(p.vlmax,'VLMAX / 元素')+metric(p.vl,'vl / 活跃范围')+metric(lmul,'逻辑寄存器分组');$('#vector-lanes').innerHTML=p.lanes.map(l=>'<button class="lane '+(l.tail?'tail':l.active?'':'off')+'" data-mask="'+l.i+'">'+(l.result===null?'—':l.result)+'<small>i'+l.i+' '+(l.tail?'TAIL':l.masked?'MASKED':'ACTIVE')+'</small></button>').join('');}
  function bankInputs(){return [0,1,2,3].map(i=>M.clamp($('#bank-a'+i).value,0,1024));}
  function renderBank(step){const addresses=bankInputs(),banks=Number($('#bank-count').value),p=M.bankPlan(addresses,banks,4,labState.bankPending);if(step){labState.bankPending=p.pending;labState.bankCycle++;logEvent('第 '+labState.bankCycle+' 拍授权 '+(p.grants.map(g=>'R'+g.id+'→B'+g.bank).join('、')||'无')+'；剩余 '+p.pending.length+' 项。');}$('#bank-requests').innerHTML=addresses.map((a,i)=>'<span class="request '+(step&&p.grants.some(g=>g.id===i)?'granted':'')+'">R'+i+': '+a+' → B'+p.mapping[i]+'</span>').join('');$('#bank-output').style.gridTemplateColumns='repeat('+Math.min(banks,4)+',1fr)';$('#bank-output').innerHTML=Array.from({length:banks},(_,i)=>{const count=(labState.bankPending===null?addresses.map((_,j)=>j):labState.bankPending).filter(j=>p.mapping[j]===i).length;return '<div class="bank '+(count>1?'conflict':'')+'"><strong>BANK '+i+'</strong><p>'+p.grants.filter(g=>g.bank===i).map(g=>'R'+g.id).join(' ')+'</p><small>待处理 '+count+'</small></div>';}).join('');$('#bank-metrics').innerHTML=metric(labState.bankCycle,'已仲裁拍数')+metric(p.grants.length,'该拍可授权数')+metric(p.conflicts,'该拍冲突数');}
  function renderFIFO(){const s=labState.fifo;$('#fifo-queue').innerHTML=Array.from({length:4},(_,i)=>'<div class="fifo-slot '+(i<s.queue.length?'filled':'')+'">'+(i<s.queue.length?s.queue[i]:'·')+'</div>').join('');$('#fifo-metrics').innerHTML=metric(s.queue.length,'count / 4')+metric(s.queue.length<4?1:0,'in_ready')+metric(s.queue.length>0?1:0,'out_valid')+metric(s.cycle,'教学边沿');}
  function getTile(){const [tm,tn]=$('#tile-shape').value.split(',').map(Number);return M.tilePlan({m:M.clamp($('#tile-m').value,1,128),n:M.clamp($('#tile-n').value,1,128),k:M.clamp($('#tile-k').value,1,256),tm,tn,tk:16,bytes:Number($('#tile-bytes').value),tcmKB:M.clamp($('#tile-capacity').value,1,1024),doubleBuffer:$('#tile-double').checked});}
  function renderTile(){const p=getTile();labState.matrixStep=Math.min(labState.matrixStep,p.steps);const step=labState.matrixStep,current=Math.min(Math.floor(step/p.depth),p.rows*p.cols-1);$('#tile-metrics').innerHTML=metric((p.footprint/1024).toFixed(2)+'K','示例局部占用 / byte')+metric(p.rows+'×'+p.cols,'输出 Tile 网格')+metric(p.depth,'每块 K 归约步数')+metric((p.logicalUtilization*100).toFixed(1)+'%','边缘有效元素比例');$('#tile-capacity-bar').classList.toggle('over',!p.fits);$('#tile-capacity-bar span').style.width=Math.min(100,p.footprint/p.capacity*100)+'%';$('#tile-grid').style.gridTemplateColumns='repeat('+p.cols+',1fr)';$('#tile-grid').innerHTML=Array.from({length:p.rows*p.cols},(_,i)=>'<span class="matrix-tile '+(step>=p.steps||i<current?'done':i===current?'current':'')+'">'+Math.floor(i/p.cols)+','+(i%p.cols)+'</span>').join('');$('#lab-event').classList.toggle('warning',!p.fits);$('#lab-event').textContent=!p.fits?'示例局部 Tile 已超过预算。真实编译器还需要考虑更多活跃值与对齐，不能据此认定它一定能放下。':step>=p.steps?'所有示例分块累计完成；这是逻辑步骤数，不能当作 RTL 周期数。':'逻辑步骤 '+step+' / '+p.steps+'：输出 Tile ('+Math.floor(current/p.cols)+','+(current%p.cols)+')，K 归约块 '+(step%p.depth+1)+' / '+p.depth+'。';}
  function renderAddress(){const raw=$('#address-value').value.trim(),address=/^(?:0x)?[0-9a-f]+$/i.test(raw)?parseInt(raw.replace(/^0x/i,''),16):NaN;if(!Number.isFinite(address)||address>0xffffffff){$('#lab-event').textContent='请输入32位范围内的十六进制 byte 地址。';return;}const p=M.addressRegion(address,$('#address-mode').value==='highmem'),hex=n=>'0x'+n.toString(16).padStart(8,'0');$('#address-regions').innerHTML=p.regions.map(r=>'<div class="address-region '+(r.name===p.selected?'active':'')+'"><b>'+r.name+'</b><span>'+hex(r.start)+' – '+hex(r.start+r.size-1)+'</span><span>'+r.size/1024+' KiB</span></div>').join('');$('#address-metrics').innerHTML=metric(p.selected,'地址命中')+(p.offset!==null?metric(hex(p.offset),'窗口内偏移'):'');$('#lab-event').textContent=hex(address)+' → '+p.selected+'。未命中本地窗口时，后续行为要查看实际 wrapper 的外部访问与错误处理。';}
  function renderNOC(){const source=Number($('#noc-source').value),dest=Number($('#noc-dest').value),path=M.xyRoute(source,dest),step=Math.min(labState.nocStep,path.length-1);labState.nocStep=step;$('#noc-grid').innerHTML=Array.from({length:16},(_,i)=>'<div class="router '+(path.includes(i)?'on-path ':'')+(path[step]===i?'token':'')+'">'+(i%4)+','+Math.floor(i/4)+'</div>').join('');$('#noc-metrics').innerHTML=metric(path.length-1,'最短逻辑跳数')+metric(step,'已前进跳数')+metric(path[step],'当前节点');}
  function renderDirectory(){const s=labState.directory;$('#directory-state').innerHTML='<div class="cache-node"><small>CLIENT C0</small><strong>'+((s.sharers&1)?(s.permission==='M'&&s.owner===0?'M':'S'):'I')+'</strong></div><div class="directory-node"><small>DIRECTORY</small><strong>'+s.permission+'</strong><small>sharers='+s.sharers.toString(2).padStart(2,'0')+' · owner=C'+s.owner+'</small></div><div class="cache-node"><small>CLIENT C1</small><strong>'+((s.sharers&2)?(s.permission==='M'&&s.owner===1?'M':'S'):'I')+'</strong></div>';$('#directory-phases').innerHTML=['IDLE','PROBE','WAIT_ACK','RESP'].map(p=>'<span class="'+(p===s.phase?'active':'')+'">'+p+'</span>').join('');const sig=L.directorySignals(s,{ackCore:Number($('#dir-ack-core').value)});$('#dir-metrics').innerHTML=metric(s.cycle,'教学边沿')+metric(+sig.reqReady,'req_ready')+metric(+sig.probeValid,'probe_valid')+metric(+sig.respValid,'resp_valid');}
  function labAction(action){
    if(action==='sb-step'){const a=M.clamp($('#sb-a').value,0,7),b=M.clamp($('#sb-b').value,0,7),d=M.clamp($('#sb-d').value,0,7),wb=Number($('#sb-wb').value),r=L.scoreboardStep(labState.scoreboard,{source:(1<<a)|(1<<b),destination:1<<d,wb:wb>=0?1<<wb:0,valid:$('#sb-valid').checked,resource:$('#sb-ready').checked});labState.scoreboard=r.state;renderScoreboard();logEvent(r.event);}
    if(action==='sb-reset'){labState.scoreboard=L.scoreboardInitial();renderScoreboard();logEvent('复位：busy 全清零。');}
    if(action==='sb-dependency'){labState.scoreboard={busy:1<<3,cycle:0};$('#sb-a').value=3;$('#sb-b').value=2;$('#sb-d').value=4;$('#sb-wb').value=-1;renderScoreboard();logEvent('r3 有未完成写入，下一条读取 r3 的指令发生 RAW。');}
    if(action==='vec-all'||action==='vec-alternate'){labState.vectorMask=Array.from({length:64},(_,i)=>action==='vec-all'||i%2===0);renderVector();}
    if(action==='bank-step')renderBank(true);
    if(['bank-reset','bank-conflict','bank-spread'].includes(action)){if(action!=='bank-reset')[0,1,2,3].forEach(i=>$('#bank-a'+i).value=action==='bank-conflict'?i*Number($('#bank-count').value)*4:i*4);labState.bankPending=null;labState.bankCycle=0;renderBank(false);logEvent('新一轮请求已装载。');}
    if(action==='fifo-step'){const r=L.fifoStep(labState.fifo,{valid:$('#fifo-valid').checked,ready:$('#fifo-ready').checked,data:Number($('#fifo-data').value)});labState.fifo=r.state;renderFIFO();logEvent(r.event);}
    if(action==='fifo-reset'){labState.fifo=L.fifoInitial();renderFIFO();logEvent('复位：队列为空。');}
    if(action==='tile-step'){const p=getTile();if(p.fits)labState.matrixStep=Math.min(labState.matrixStep+1,p.steps);renderTile();}
    if(action==='tile-reset'){labState.matrixStep=0;renderTile();}
    if(action==='address-start'||action==='address-end'){const high=$('#address-mode').value==='highmem';$('#address-value').value='0x'+((high?1048576:65536)+(action==='address-end'?(high?1048576:32768):0)).toString(16);renderAddress();}
    if(action==='noc-step'){if($('#noc-block').checked){logEvent('下一跳 ready=0，保留当前位置，不丢失待发送消息。');}else{const path=M.xyRoute(Number($('#noc-source').value),Number($('#noc-dest').value));labState.nocStep=Math.min(labState.nocStep+1,path.length-1);renderNOC();logEvent(labState.nocStep===path.length-1?'到达目的节点；真实网络还需要交付与流控协议。':'按 XY 规则选择下一跳。');}}
    if(action==='noc-reset'){labState.nocStep=0;renderNOC();logEvent('重新从源节点注入。');}
    if(action==='dir-step'){const r=L.directoryStep(labState.directory,{reqValid:$('#dir-req').checked,core:Number($('#dir-core').value),write:$('#dir-type').value==='write',probeReady:$('#dir-probe').checked,ackValid:$('#dir-ack').checked,ackCore:Number($('#dir-ack-core').value),respReady:$('#dir-resp').checked});labState.directory=r.state;renderDirectory();logEvent(r.event);}
    if(action==='dir-reset'){labState.directory=L.directoryInitial();renderDirectory();logEvent('复位：无缓存行持有者，目录 IDLE。');}
    if(action==='dir-demo'){labState.directory={...L.directoryInitial(),permission:'M',owner:0,sharers:1};$('#dir-core').value=1;$('#dir-type').value='read';$('#dir-req').checked=true;$('#dir-ack-core').value=0;$('#dir-ack').checked=false;renderDirectory();logEvent('起点：C0 持有 M；C1 想读。依次观察 PROBE、WAIT_ACK、RESP；未收到 C0 ACK 前不应授予新权限。');}
  }
  function renderEvidence(){
    const fallback=[{title:'本地 Fabric 不等于 Mesh NoC',body:'地址译码和仲裁是当前本地互连的阅读重点；本手册的 XY Mesh 是扩展教学。',source:{path:core+'Fabric.scala',line:22}},{title:'TCM 不等于带目录 Cache',body:'紧耦合存储有明确映射，不能据此推断存在缓存行替换、MESI 或 directory_controller。',source:{path:core+'TCM.scala',line:1}},{title:'LSU 的 snooping 要按语境理解',body:'一次 row 响应可满足同一 LSU 内多个允许复用的等待 cell；这不是多核缓存权限协议。',source:{path:scalar+'Lsu.scala',line:1}}];
    const audit=Array.isArray(HW.audit)&&HW.audit.length?HW.audit:fallback;
    $('#architecture-audit').innerHTML=audit.map(r=>'<article class="audit-row"><h4>'+h(r.title||r.concept||r.topic||r.claim||'源码核查')+'</h4><div>'+prose(asText(r.body||r.explanation||r.finding||r.verdict||r.status||r.detail||r.evidence))+(r.source?sourceRef(r.source):r.sources?sourceRef(r.sources):'')+'</div></article>').join('');
    const stats=INDEX.stats||{};$('#analysis-stats').innerHTML=h((stats.files||INDEX.files.length).toLocaleString()+' 个文件元数据 · '+(stats.exportedFiles||INDEX.files.filter(f=>f.contentPath).length).toLocaleString()+' 个本地文本')+'<br>'+h((stats.symbols||INDEX.symbols?.length||0).toLocaleString()+' 个符号 · '+(stats.edges||INDEX.edges?.length||0).toLocaleString()+' 条语法关系')+'<br>'+h((stats.filesWithPrimarySyntaxDiagnostics||0)+' 个文件保留语法诊断 · '+(stats.parserFailures||0)+' 个解析器失败记录');
    $('#parser-summary').textContent='源码索引来自实际 pyslang / tree-sitter / Python AST 分析；包括未导出的大型模型测试元数据。语法引用不是全芯片实际连线，诊断和小范围 Verilator 展开见方法记录。';
    const commits=INDEX.commitMap||{};$('#version-panel').innerHTML='<b>SNAPSHOT / 版本与补丁共同定义实验</b><br>'+Object.entries(commits).map(([repo,commit])=>h(repo+' / '+commit)).join('<br>')+'<br>编译器固定硬件：782675ac1af7cefd7612c5bdae5445796b62a7f6<br>编译器集成的 LLVM / MPACT patch 集合也属于版本契约。网页未运行全芯片构建、模型性能复现或 FPGA 上板。';
  }
  function bind(){
    $('#nav-toggle').onclick=()=>{const open=document.body.classList.toggle('nav-open');$('#nav-toggle').setAttribute('aria-expanded',String(open));};
    $$('#section-nav a').forEach(a=>a.onclick=()=>{document.body.classList.remove('nav-open');$('#nav-toggle').setAttribute('aria-expanded','false');});
    $('#search-open').onclick=()=>{$('#search-dialog').showModal();$('#global-search').focus();renderSearch();};$('#global-search').oninput=renderSearch;
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if($('#search-dialog').open)$('#search-dialog').close();else{$('#search-dialog').showModal();$('#global-search').focus();renderSearch();}}if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-module]')){e.preventDefault();activeModule=e.target.dataset.module;renderArchitecture();}});
    $('#flow-toggle').onchange=renderArchitecture;
    $('#trace-next').onclick=()=>{traceStep=(traceStep+1)%trace.length;renderTrace();};$('#trace-prev').onclick=()=>{traceStep=(traceStep+trace.length-1)%trace.length;renderTrace();};
    $('#course-search').oninput=renderChapters;$('#expand-chapters').onclick=()=>{const open=$$('.chapter').some(c=>!c.open);$$('.chapter').forEach(c=>c.open=open);$('#expand-chapters').textContent=open?'收起全部章节 −':'展开全部章节 ＋';};
    $('#source-search').oninput=()=>{filePage=0;renderFiles();};$('#repo-filter').onchange=()=>{filePage=0;folderPath='';folderRepo='';renderFiles();};$('#source-reset').onclick=()=>{$('#source-search').value='';filePage=0;folderPath='';folderRepo='';renderFiles();};$('#file-prev').onclick=()=>{filePage=Math.max(0,filePage-1);renderFiles();};$('#file-next').onclick=()=>{filePage++;renderFiles();};
    $('#code-prev').onclick=()=>{if(currentFile)showCode($('#code-view'),currentFile,codeStart,Math.max(1,codeStart-160));};$('#code-next').onclick=()=>{if(currentFile)showCode($('#code-view'),currentFile,codeStart+160,codeStart+160);};$('#line-jump').onchange=()=>{if(currentFile)showCode($('#code-view'),currentFile,Math.max(1,Number($('#line-jump').value)||1));};
    $('#glossary-search').oninput=renderGlossary;$('#quiz-next').onclick=()=>{currentQuiz=(currentQuiz+1)%quizzes.length;renderQuiz();};
    $('#study-notes').value=saved.notes;$('#study-notes').oninput=()=>{saved.notes=$('#study-notes').value;persist();};
    $('#export-notes').onclick=()=>{const done=chapters.filter(c=>saved.done.includes(c.id)).map(c=>'- '+c.title).join('\n');const text='# Coral NPU 学习记录\n\n硬件版本：'+(INDEX.commitMap.hardware||'')+'\n\n## 已读章节\n'+done+'\n\n## 我的笔记\n'+saved.notes+'\n';const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));a.download='coral-npu-learning-notes.md';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('已导出学习笔记。');};
    $('#print-page').onclick=()=>{$$('.chapter').forEach(c=>c.open=true);window.print();};
    document.addEventListener('click',e=>{
      const b=e.target.closest('button,[data-chapter],.diagram-node');if(!b)return;
      if(b.dataset.source){openSource(b.dataset.repo||'hardware',b.dataset.source,Number(b.dataset.line)||1);return;}
      if(b.dataset.module){activeModule=b.dataset.module;renderArchitecture();}
      if(b.dataset.arch){activeArchitecture=b.dataset.arch;$$('#arch-tabs button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b));});renderArchitecture();}
      if(b.dataset.trace){traceStep=Number(b.dataset.trace);renderTrace();}
      if(b.dataset.course){$$('#course-filter button').forEach(x=>x.classList.toggle('active',x===b));renderChapters();}
      if(b.dataset.chapter){e.preventDefault();openChapter(b.dataset.chapter);}
      if(b.dataset.done){saved.done=saved.done.includes(b.dataset.done)?saved.done.filter(id=>id!==b.dataset.done):saved.done.concat(b.dataset.done);persist();updateProgress();}
      if(b.dataset.folderPath!==undefined){folderPath=b.dataset.folderPath;folderRepo=b.dataset.folderRepo;filePage=0;renderFiles();}
      if(b.dataset.browse){$('#repo-filter').value=b.dataset.browseRepo;folderRepo=b.dataset.browseRepo;folderPath=b.dataset.browse;$('#source-search').value='';filePage=0;renderFiles();$('#source-tree').scrollIntoView({behavior:'auto',block:'center'});}
      if(b.dataset.file){const file=fileByKey.get(b.dataset.file);if(file)selectFile(file);}
      if(b.dataset.symbolLine&&currentFile)showCode($('#code-view'),currentFile,Number(b.dataset.symbolLine));
      if(b.dataset.lab){activeLab=b.dataset.lab;$$('#lab-tabs button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b));});renderLab();}
      if(b.dataset.labAction)labAction(b.dataset.labAction);
      if(b.dataset.mask!==undefined){const i=Number(b.dataset.mask);labState.vectorMask[i]=labState.vectorMask[i]===false;renderVector();}
      if(b.dataset.answer!==undefined){const q=quizzes[currentQuiz],answer=Number(q.answer??q.correct),choice=Number(b.dataset.answer);$$('.quiz-option').forEach((o,i)=>{o.disabled=true;o.classList.toggle('correct',i===answer);o.classList.toggle('wrong',i===choice&&choice!==answer);});$('#quiz-explanation').hidden=false;$('#quiz-explanation').innerHTML='<b>'+(choice===answer?'判断正确。':'再检查一下你的模型。')+'</b> '+h(q.explanation);}
      if(b.dataset.searchChapter){$('#search-dialog').close();openChapter(b.dataset.searchChapter);}
      if(b.dataset.searchFile){$('#search-dialog').close();const f=fileByKey.get(b.dataset.searchFile);if(f)openSource(f.repo,f.path,f.symbols?.[0]?.line||1);}
      if(b.dataset.searchGlossary){$('#search-dialog').close();$('#glossary-search').value=b.dataset.searchGlossary;renderGlossary();$('#knowledge').scrollIntoView({behavior:'auto'});$('#glossary details')?.setAttribute('open','');}
      if(b.dataset.route){const routes={beginner:['建立边界：阅读 Core、TCM 与 Fabric 概览。','操作握手、地址、向量实验，先说明每种状态。','沿一条 Matmul 路径看软件、指令和矩阵单元。','阅读硬件课程的标量、存储和矩阵章节。','修改最小 FIFO 并运行教学测试，写下新契约。'],rtl:['先定位构建目标和 Parameters 覆盖。','从 CoreAxi → Core → scalar / RVV / Zvt 建立实例地图。','解释每个 ready / valid / completion 的作用。','检查分派依赖、存储返回、掩码与 Tile 写入。','自己实现并验证一个最小模块，再接入更大的系统。'],compiler:['从手写 RVV 加法或 AOT Matmul 建立数值参考。','追踪 Host / RVV / Zvt 的选择和回退条件。','理解 DTCM 与寄存器分块、尾块和累加。','查看 ABI、ELF、运行时与模拟器版本及 patch。','比较 IR、汇编、参考数值和 RTL 观测的不同职责。']};$('#route-detail').hidden=false;$('#route-detail').innerHTML='<h4>'+h({beginner:'先获得可以操作的直觉',rtl:'沿接口与状态读 RTL',compiler:'从模型映射到执行契约'}[b.dataset.route])+'</h4><ol>'+routes[b.dataset.route].map(x=>'<li>'+h(x)+'</li>').join('')+'</ol><a class="text-link" href="#curriculum">进入对应课程 ↓</a>';}
    });
    const updateLabInput=e=>{const id=e.target.id;if(id.startsWith('vec-'))renderVector();if(id.startsWith('bank-')){labState.bankPending=null;labState.bankCycle=0;renderBank(false);}if(id.startsWith('tile-')){labState.matrixStep=0;renderTile();}if(id.startsWith('address-'))renderAddress();if(id.startsWith('noc-')){if(id!=='noc-block')labState.nocStep=0;renderNOC();}if(id==='dir-ack-core')renderDirectory();};
    $('#lab-stage').addEventListener('change',e=>{if(e.target.matches('select,input[type=checkbox]'))updateLabInput(e);});
    $('#lab-stage').addEventListener('input',e=>{if(e.target.matches('input[type=number],input[type=text],input:not([type])'))updateLabInput(e);});
    const onScroll=()=>{const full=document.documentElement.scrollHeight-innerHeight;$('#reading-line').style.width=(full>0?scrollY/full*100:0)+'%';};addEventListener('scroll',onScroll,{passive:true});
    const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){$$('#section-nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+entry.target.id));}});},{rootMargin:'-15% 0px -65% 0px'});$$('main>.section').forEach(s=>observer.observe(s));
    ['source-dialog','search-dialog'].forEach(id=>$('#'+id).addEventListener('click',e=>{if(e.target===$('#'+id)){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}}));
  }
  const extraGlossary=[
    {term:'NPU Core',zh:'神经处理计算核',definition:'执行目标程序并协调标量控制、数据访问及可选向量/矩阵单元的处理器核。Coral 的 Core 连接 SCore 与可选 RvvCore；CoreAxi 等 wrapper 再处理存储和系统接口。',source:{path:core+'Core.scala',line:30}},
    {term:'Decode / Dispatch',zh:'译码与分派',definition:'译码解释指令位域与功能；分派在依赖和资源允许时接受并发送操作。指令识别正确，不代表同一拍一定能够发射。',source:{path:scalar+'Decode.scala',line:397}},
    {term:'Scoreboard',zh:'依赖记分牌',definition:'按寄存器记录未完成目的写入，阻止过早读或覆盖。Coral 在 Regfile 中维护 busy 并区分寄存状态与去除本拍清除的组合视图；不是独立 Scoreboard.scala。',source:{path:scalar+'Regfile.scala',line:95}},
    {term:'Bypass / Forwarding',zh:'结果旁路',definition:'在寄存器正式更新或被普通读口观察前，把满足时序条件的结果直接送到消费者。必须定义匹配、优先级、有效性与异常取消，不能只删除 busy 检查。',source:{path:scalar+'Regfile.scala',line:109}},
    {term:'Retirement',zh:'按序退休',definition:'确认指令可从按程序顺序的跟踪状态中移出。Coral 顶层明确区分 Completed 与 Retired：Completed 时架构副作用已发生，因此不能把顶层退休直接等同于通用乱序核的首次提交。',source:{path:core+'RetirementBuffer.scala',line:58}},
    {term:'ROB',zh:'重排序缓冲',definition:'跟踪在飞指令并按定义的顺序处理完成、异常与退休。RVV 后端的 ROB、顶层 RetirementBuffer 和取指返回重排承担不同职责，必须按各自接口理解。'},
    {term:'RS / Reservation Station',zh:'保留站',definition:'为等待资源或操作数的操作保留状态，决定何时送往执行单元。深度、选择策略、操作数捕获、取消和背压共同决定行为。'},
    {term:'VRF',zh:'向量寄存器文件',definition:'存储向量操作数、结果和掩码。当前后端经 rvv_backend_vrf 连接实际寄存器阵列；部分写回需要正确合并 byte enables，避免破坏未写元素。',source:{path:'hdl/verilog/rvv/design/rvv_backend_vrf.sv',line:61}},
    {term:'LSU',zh:'加载存储单元',definition:'把指令访问变成带地址、大小、掩码与事务身份的存储请求，处理对齐、阻塞、返回和结果分发。接受请求与返回完成是两个时刻。',source:{path:scalar+'Lsu.scala',line:1171}},
    {term:'Bank',zh:'存储分体',definition:'将存储划成可独立访问的资源。Bank conflict 取决于地址到 bank 的译码及端口数量；连续区间划分和按 word 交织会产生不同冲突模式。',source:{path:core+'BankedDtcm.scala',line:79}},
    {term:'SRAM',zh:'静态随机存取存储器',definition:'常用于寄存器阵列或片上存储的实体实现。容量之外还要定义读延迟、读写端口、同址行为、字节使能、复位与工艺/FPGA映射。'},
    {term:'Byte enable / Strobe',zh:'逐字节写使能',definition:'用位掩码选择本次真正修改的字节，其余字节按接口约定保留。类型转换、尾部元素和 subtile 部分写入都依赖正确的掩码与地址对齐。',source:{path:zvt+'zvt_mt.sv',line:1}},
    {term:'AXI',zh:'分通道总线协议',definition:'读地址/读数据与写地址/写数据/写响应使用独立通道。每个通道的握手、事务 ID、突发和错误响应需要遵守契约；存在 AXI 端口不自动表示具有一致性。',source:{path:core+'CoreAxi.scala',line:1}},
    {term:'TL-UL',zh:'TileLink Uncached Lightweight',definition:'用于请求与响应交互的轻量协议。source 等事务身份必须跟随请求保存并正确返回；它与多核缓存一致性协议的权限管理不是同一个层次。'},
    {term:'Arbitration',zh:'仲裁',definition:'多个请求竞争同一资源时选择获授权者。固定优先简单，但可能饥饿；轮转需记住上次授权。只有实际完成传输的请求才应改变相关状态。',source:{path:core+'Fabric.scala',line:22}},
    {term:'Cache coherence',zh:'缓存一致性',definition:'当同一地址可能有多个缓存副本时，协调可读/可写权限与副本变化。协议须同时处理权限、数据和在飞消息；TCM 或软件缓存的存在不表示已实现硬件一致性。'},
    {term:'Memory consistency',zh:'内存一致性模型',definition:'规定不同处理器可观察到的内存操作顺序。它与单条缓存行副本如何协调的 coherence 不同；还需要指令、屏障和系统接口共同实现。'},
    {term:'Owner / Sharers',zh:'所有者与共享者集合',definition:'目录对一条缓存行维护的权限元数据：谁承担最新数据责任，哪些客户端持有共享副本。尚未收齐失效或降级确认时，需要瞬态保存未完成事务。'},
    {term:'Flit',zh:'流控传输单位',definition:'网络流控和链路传送的基本单位；一个 packet 可以拆成多个 flit。头部路由、尾部释放资源、背压和包间交错规则必须明确。本页 NoC 不模拟这些全部细节。'},
    {term:'Virtual channel',zh:'虚拟通道',definition:'在同一物理链路上分离队列和资源依赖的逻辑通道，常用于控制阻塞或打破依赖环。增加 VC 数并不会自动证明网络或协议无死锁。'},
    {term:'CDC',zh:'跨时钟域',definition:'在不同采样时钟间传递状态或数据。单比特同步器、脉冲握手和异步 FIFO 用于不同契约，不能把多位总线逐位同步就当作一致的数据传输。'},
    {term:'Latency / Throughput',zh:'延迟与吞吐',definition:'延迟是一次操作从接受到结果可用的间隔；吞吐是单位时间可接受或完成多少操作。流水线可同时有长延迟和高吞吐；逻辑 Tile 步数不能直接换成真实周期。'},
    {term:'NoC',zh:'片上网络',definition:'连接多个计算或存储节点的消息网络，涉及拓扑、路由、仲裁、流控和死锁；本手册Mesh是系统扩展，不是当前Coral本地Fabric。'},
    {term:'Directory controller',zh:'目录控制器',definition:'记录缓存行owner/sharers和权限，协调探针与确认后再授权的控制器。本页提供独立教学原型，不能据此推断Coral已有此模块。'},
    {term:'Ready / Valid',zh:'握手',definition:'当同一拍valid与ready同时为真时完成传输。背压时必须按契约保留待发送数据，避免丢失或重复。'},
    {term:'Backpressure',zh:'背压',definition:'下游暂时不能接收数据，将等待沿连接反馈给上游。需要明确缓存容量和稳定性约束。'},
    {term:'RAW / WAW',zh:'数据相关',definition:'RAW是读取尚未完成的旧值风险；WAW是后来的目的写入覆盖早先待写状态风险。busy位、旁路、重命名解决的范围不同。'},
    {term:'TCM',zh:'紧耦合存储',definition:'由明确地址窗口访问、通常显式管理的片上存储。它不自动意味着存在Cache的tag、替换或多核一致性。'},
    {term:'Fabric arbiter',zh:'本地互连仲裁',definition:'在多个请求者之间选择获授权者，路由地址和返回。固定优先级可能导致持续低优先级请求饥饿。'},
    {term:'Transient state',zh:'瞬态',definition:'操作发起后到完成前必须保留的中间状态。例如目录已发出失效探针但还没收齐ACK时，不能立即授予新写权限。'},
    {term:'Elaboration',zh:'硬件展开',definition:'结合具体参数、generate和实例关系得到实际硬件层次。语法AST和全库引用图不等于特定配置已经成功展开。'}
  ];
  const extraQuizzes=[
    {question:'看到 FabricArbiter，能否直接认为 Coral 有一个 Mesh NoC？',options:['能，任何互连都是Mesh','不能，需要看拓扑、路由、消息与流控实现','只要有AXI就能'],answer:1,explanation:'本地地址译码与仲裁和多跳分组网络具有不同的状态与接口。本页NoC实验是扩展教学。'},
    {question:'参数基类中 enableVme=false，是否说明整个仓库没有矩阵单元？',options:['是，所有目标都关闭','不是，具体构建目标可以覆写功能开关','矩阵单元只存在于插画'],answer:1,explanation:'默认值、生成目标和实际实例是三个需要一起核对的层次；源码中存在Zvt实现。'},
    {question:'读到 LSU 的 response snooping，首先应做什么？',options:['直接画上MESI目录','确认它观察的是响应、写回还是多核缓存权限','认为外部CPU已经硬件一致'],answer:1,explanation:'同一个词在不同上下文含义不同，必须追踪被监测的实际信号和状态。'},
    {question:'一条写权限请求为什么不能在发出失效探针后立刻完成？',options:['发出探针就代表远端完成','通常还需等待正确事务和目标的确认','目录不需要记录任何历史'],answer:1,explanation:'发送、接收、执行、确认是不同事件。教学目录用WAIT_ACK保存这个未完成阶段。'}
  ];
  async function init(){
    bind();renderArchitecture();renderTrace();renderLab();
    try{const [hardware,software,index]=await Promise.all(['content/hardware.json','content/software.json','data/source-index.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error(url+' HTTP '+r.status);return r.json();}));HW=hardware;SW=software;INDEX=index;INDEX.files.forEach(f=>fileByKey.set(f.repo+':'+f.path,f));chapters=[...(HW.chapters||[]).map(c=>({...c,group:'hardware'})),...(SW.chapters||[]).map(c=>({...c,group:'software'}))].map((c,i)=>({...c,title:c.title.replace(/^\d+\s*[·.]\s*/,''),order:i+1}));glossary=[...extraGlossary,...(HW.glossary||[]),...(SW.glossary||[])].filter((g,i,a)=>a.findIndex(x=>x.term.toLowerCase()===g.term.toLowerCase())===i);quizzes=[...extraQuizzes,...(SW.quizzes||[])];
      $('#metric-chapters').textContent=chapters.length;$('#metric-files').textContent=INDEX.files.length.toLocaleString();$('#metric-commit').textContent=(INDEX.commitMap?.hardware||INDEX.commit||'').slice(0,8);
      $('#configuration-facts').innerHTML=['功能开关：RVV / VME / Float','基类总线宽度与目标覆盖分别核查','默认 ITCM 8 KiB / DTCM 32 KiB','TCM 地址和链接脚本必须匹配'].map(x=>'<span>'+h(x)+'</span>').join('');
      renderArchitecture();renderChapters();renderFiles();renderGlossary();renderQuiz();renderEvidence();
      const preferred=INDEX.files.find(f=>f.repo==='hardware'&&f.path===core+'Core.scala');if(preferred)selectFile(preferred,30);
      $('#implementation-labs').innerHTML=(SW.labs||[]).slice(0,8).map(l=>'<article><span class="badge model">待执行 / 未虚构实验结果</span><h4>'+h(l.title)+'</h4><p>'+h(l.goal)+'</p><ol>'+(l.steps||[]).map(s=>'<li>'+h(asText(s))+'</li>').join('')+'</ol><div class="lesson-note"><strong>应观察的证据</strong>'+h(asText(l.expected))+'</div></article>').join('');
      if(location.hash.startsWith('#chapter-'))openChapter(decodeURIComponent(location.hash.slice(9)));
      window.CORAL_APP_DEBUG={index:INDEX,chapters,glossary,quizzes,labState,get activeLab(){return activeLab;},get currentFile(){return currentFile;}};
    }catch(e){$('#chapters').innerHTML='<p class="loading">课程数据未能载入：'+h(e.message)+'。请通过本地HTTP服务器打开，或访问构建后的公开页面。<br>运行：python3 -m http.server 8766 --directory web</p>';console.error(e);toast('数据载入失败，请查看页面说明。');}
  }
  init();
})();

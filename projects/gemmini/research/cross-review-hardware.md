# 硬件与教学算法交叉审阅

日期：2026-11-02。审阅者：硬件课程 subagent。对象为根代理编写的 `models.js`、`app.js`，另抽查 `content/software.js`、`content/concepts.js`。本审阅不修改这些文件；下面的行号对应首次审阅版本，后续修订可能移动行号。

## 结论

OS/WS 理想脉动算法、默认存储地址编码、容量公式、调度模型与 XY 空间路径未发现数值错误。调度器明确列出简化条件，没有将任意教学延迟冒充 RTL 周期。主要需要修正的是交互架构图中的直接连线：部分箭头绕过真实 ExecuteController，另有 StoreController 指向读 DMA 的 XactTracker，容易造成模块端口的误解。

## 架构关系建议

1. **app.js:37，system 的 Scratchpad→MeshWithDelays 和 Mesh→Accumulator。** 当前图会让人以为两者具有直接连接。真实顶层中 SRAM/Accumulator 接到 ExecuteController（Controller.scala:361–368）；MeshWithDelays 在 ExecuteController.scala:186 实例化，结果由 ExecuteController.scala:907–953 解码地址、mask 后写入本地存储。建议显示 Scratchpad↔EX、EX↔MeshWithDelays、MeshWithDelays↔Mesh、EX→Accumulator，并标注“概念数据路径，非完整端口”。不要把计算阵列直接画成 Accumulator 写端口的主控。

2. **app.js:38，control 的 StoreController→XactTracker。** XactTracker 实例属于 StreamReader（DMA.scala:74），它通过 source ID 保存读事务元数据。StoreController 有自己的 DMACommandTracker（StoreController.scala:157），与 LoadController 使用同类命令追踪结构。建议 StoreController→DMACommandTracker；XactTracker 放在读 DMA 路径。若合并为一个教学节点，应注明该节点代表 LD/ST 各自的实例，不能暗示共享一张表。

3. **app.js:39，array 图混合包含关系和数据流。** Mesh→Tile→PE 是结构包含，不是发命令的控制边；Transposer 也在 MeshWithDelays 内（MeshWithDelays.scala:155），并非一个固定外置前级。建议用独立的虚线/“contains”标签表示包含，和控制/完成反馈区别；或给 MeshWithDelays 画容器，内含 Transposer 与 Mesh。Scratchpad 数据经 EX 进入阵列前端，结果经 EX 写回。

4. **app.js:37–39，缺少反馈与反向数据时应明确范围。** 当前 system 图主要单向；实际 mvout 需要本地存储→DMA，命令完成也回到 RS。如果不打算展示所有方向，图例应明确“选定职责关系，非完整接线”，不能让单箭头被解释成接口仅支持单向数据。

5. **index.html:44 与 concepts.js:633 的链接口径。** 源码浏览器 GitHub 链接固定提交，但扩展阅读仍有 inclusive-cache `main` 链接。建议把“所有 GitHub 链接固定”限于“源码浏览器链接”，扩展阅读明确是官方当前文档/分支。这是来源口径修正，不是架构错误。

## 教学模型审核

| 对象 | 结果 | 保留边界 |
| --- | --- | --- |
| models.js:6–25 OS | PE(r,c) 在 t=r+c+k 累加；终态等于独立三重循环 GEMM | C 完成值在格内；没有实现真实 OS 排空 |
| models.js:16–24 WS | PE(k,c) 驻留 B[k,c]；i=t-k-c，部分和沿 k 向下，底行产生完整 C | 权重预装载不计入，未实现 c1/c2/propagate |
| app.js:67，3N−2 | 对 K=N、单位链路延迟的理想计算窗口成立 | 不应解释成任意 GEMM 或真实 Gemmini 总延迟；现有简化说明已经包含排空、接口停顿等排除项 |
| models.js:39–50 调度 | 4种场景均结束，所有抽象存储 hazard 前驱先完成 | 同类一次一命令、固定教学延迟；不是实际 RS 策略。app.js:72 已明确 |
| models.js:57–61 本地地址 | 默认 SP 16384行/4 bank×4096；ACC 1024行/2 bank×512；bit31/30/29编码正确 | norm_cmd=0，默认配置；没有 sub-bank、仲裁与写回流水 |
| models.js:53–55 容量 | INT8 SP、INT32 ACC 与固定 ACC banks=2 的计算正确 | 当前 sliders 没有改变输入类型或 ACC bank数，文案一致 |
| models.js:63 XY | 16×16源/目的组合全为最短曼哈顿路径，先X后Y | 只算空间路径，不模拟拥塞、VC、credit或延迟 |
| models.js:64–90 目录 | 静态审阅等待ACK集合和数据齐备条件正确；重复/无关ACK不清等待位 | 没有probe发送阶段、grant背压和数据内容；app.js:86 已注明不与RTL逐拍等价 |

软件课程与概念课程抽查没有发现与硬件基线冲突的明显技术结论。特别核对了：NULL在不同参数位置具有不同语义、硬件 LOOP_WS 与 OS低层调用不同、默认bank来自高位而非逐行交叉、INT20阵列输出与INT32 ACC不是同一精度、cache coherence与fence/完成三者不同。

## 实际运行的确定性核验

在工作区根目录执行下列命令。初次无固定种子的随机检查也通过；以下为随后实际重跑的固定种子版本。参考 GEMM 使用独立三重循环，另外检查每个事件与相邻格前一拍的操作数/部分和一致，避免只对最终闭式求和。

```sh
node - <<'JS'
const assert=require('node:assert/strict');
const M=require('./web/gemmini/models.js');
let seed=0x47454d4d, cases=0;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%31-15;};
function gold(A,B){
  const n=A.length,C=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<n;k++)C[i][j]+=A[i][k]*B[k][j];
  return C;
}
for(let n=2;n<=8;n++)for(let sample=0;sample<100;sample++){
  const A=Array.from({length:n},()=>Array.from({length:n},rnd));
  const B=Array.from({length:n},()=>Array.from({length:n},rnd));
  const expected=gold(A,B);
  for(const mode of ['os','ws']){
    const ticks=Array.from({length:3*n-2},(_,t)=>M.systolic(n,mode,t,A,B));
    assert.deepEqual(ticks.at(-1).C,expected);
    assert.equal(ticks.flatMap(x=>x.events).length,n**3);
    for(let t=0;t<ticks.length;t++)for(const e of ticks[t].events){
      if(mode==='os'){
        assert.equal(e.k,t-e.r-e.c);
        if(e.c>0)assert.equal(ticks[t-1].events.find(p=>p.r===e.r&&p.c===e.c-1&&p.k===e.k).a,e.a);
        if(e.r>0)assert.equal(ticks[t-1].events.find(p=>p.r===e.r-1&&p.c===e.c&&p.k===e.k).b,e.b);
      }else{
        assert.equal(e.i,t-e.r-e.c);
        if(e.r>0)assert.equal(ticks[t-1].events.find(p=>p.r===e.r-1&&p.c===e.c&&p.i===e.i).sum,e.before);
        else assert.equal(e.before,0);
        if(e.c>0)assert.equal(ticks[t-1].events.find(p=>p.r===e.r&&p.c===e.c-1&&p.i===e.i).a,e.a);
      }
    }
    cases++;
  }
}
for(let row=0;row<16384;row++){
  const a=M.localAddress(row);
  assert.equal(a.address,row);assert.equal(a.bank,Math.floor(row/4096));assert.equal(a.bankRow,row%4096);
}
for(let row=0;row<1024;row++)for(const ac of [false,true])for(const full of [false,true]){
  const a=M.localAddress(row,true,ac,full);
  assert.equal(a.address,(0x80000000+(ac?0x40000000:0)+(full?0x20000000:0)+row)>>>0);
  assert.equal(a.bank,Math.floor(row/512));assert.equal(a.bankRow,row%512);
}
for(const conflict of [false,true])for(const serial of [false,true]){
  let s=M.schedulerInit(conflict),count=0;
  while(s.cmds.some(c=>c.state!=='done')&&count++<100)s=M.schedulerStep(s,serial);
  assert.ok(count<100);
  for(let i=0;i<s.cmds.length;i++)for(let j=0;j<i;j++)
    if(M.hazards(s.cmds[j],s.cmds[i]).length)assert.ok(s.cmds[j].end<=s.cmds[i].start);
  console.log('schedule conflict='+conflict+' serial='+serial+' finish='+s.time);
}
for(let start=0;start<16;start++)for(let end=0;end<16;end++){
  const r=M.xyRoute(start,end);
  assert.equal(r.length-1,Math.abs(start%4-end%4)+Math.abs(Math.floor(start/4)-Math.floor(end/4)));
  assert.equal(r[0],start);assert.equal(r.at(-1),end);
}
console.log('PASS: '+cases+' seeded systolic mode/matrix cases; event count and neighbor propagation; 20480 address/flag cases; 4 schedules; 256 XY routes.');
JS
```

实际输出：

```text
schedule conflict=false serial=false finish=19
schedule conflict=false serial=true finish=25
schedule conflict=true serial=false finish=22
schedule conflict=true serial=true finish=25
PASS: 1400 seeded systolic mode/matrix cases; event count and neighbor propagation; 20480 address/flag cases; 4 schedules; 256 XY routes.
```

这些测试只验证教学算法和上述有限输入域，不代表完整 Gemmini RTL 功能、性能、一致性协议或综合验证。

# openTPU 内容交叉审阅

日期：2026-11-02（Asia/Shanghai）。审阅者：独立硬件课程子代理。上游固定提交：`91df41092f612361c5bc22f83b31d23382ffabb0`。

本次只写本审阅记录，没有直接修改其他代理负责的 `software.js` 或 `microarch.js`。下列问题已消息报告主代理，由主代理统一合并修正。

## 检查范围

- `content/software.js`：8 章、43 节、术语、问答与学习路线。
- `content/microarch.js`：8 章、43 节与概念库；同时读取四个 `rtl/learn_*.sv`、testbench、README、已有运行报告。
- `assets/one-slice.png`：通过 `view_image` 实际查看整图文字、箭头、功能聚合和参数。
- 机械核查：software 204 个源码引用、microarch 72 个源码引用均有实际文件且行号有效；正文相对链接均存在。
- 静态核对重点：Tensor/QTensor/Tile/Stationary、dot 降低、bank-aware 输出 stride、qranges、weakref 分配、all_gather/all_reduce、attention depth=3、K/VT/VS 布局、WAITC、target 配置、微架构教学 RTL 的接口和限制。
- 没有重复执行已完成的 RTL 仿真。检查报告里的 FIFO 522 cycles/194 accepted、XY 256 pairs/640 hops、scoreboard 10 项、directory 18 项与 testbench 逻辑相符；这些不是完整 openTPU 验证。

## 需要修正或限定的内容

### 1. Replay 术语的“最后才接受下一 chunk”不符合实际流水（应修正）

位置：审阅时 `content/software.js:1489` 的 `Replay.build`。

原文：“缓存chunk直至所有行组完成，最后才接受下一chunk。”

实际实现：`rtl/mxu/otpu_mxu.sv:34-39` 缓存整条 streamed row，group0 消费其全部 chunks 时不释放，后续 ACT group 重读同一 FIFO 条目，最后一组才释放。issuer/command queue 仍能提前读取后续 chunks，并与较老命令计算和 drain 重叠（`:41-44`）。这不是逐 chunk 完成所有 groups 后才接受下一 chunk 的串行算法。

建议替换为：

> 缓存整条 streamed row；各 ACT 行组重读相同 FIFO 条目，最后一组才释放。整行需满足 FIFO DEPTH 约束，issuer 仍可在允许的容量内预取。

术语定义和 implementation 也宜注明“weight FIFO 的有意计算复用”，与 TMEM 丢读 replay 区分。

### 2. collective 的 grant=AND 要注明具体顶层（范围应限定）

位置：审阅时 `content/microarch.js:10`，`collective 为什么不是一个 Mesh NoC？`。

直接连接的 `otpu_top` 使用 `coll_gnt=&coll_gl`。但真实 board 在 S>1 的跨 SLR 路径通过 `otpu_coll_hub` / `otpu_coll_port`：`rtl/shell/otpu_board.sv:15-20`；hub 的 `u_gnt=!rd_wait&&room` 来自本地状态和 credits（`rtl/top/otpu_coll.sv:277-285`、`:338`），不是当前周期组合连接所有 slice 的 TMEM grants。

建议写成：

> 在仿真顶层的直接连接中，collective grant 是所有 slice grants 的 AND；跨 SLR 的多 slice board 用 hub/ports、队列和 credits 解耦远端 grant，并在所有目标写排空后 ACK。

这不改变“collective 不是 mesh”的结论，但可避免把为切断长控制链而新增的结构完全省掉。

### 3. range scoreboard 应标基础模式，当前 m4 用 WAITC（范围应限定）

位置：审阅时 `content/microarch.js:28`、概念库 `Scoreboard` 项（`:81`）。

这些说明对 WAITC=0 的范围调度路径成立，源码依据也正确；但默认 m4 的 `targets/ypcb-00338.toml:29` 为 `SEQ_WC=true`，在 sequencer 映射成 WAITC。WAITC 用软件 wait entries 和 VPU mask 替代每次硬件范围比较（`rtl/seq/otpu_seq.sv:399`、`:561`）。

建议正文加一句：

> 以下先解释 WAITC=0 的基础范围 scoreboard；当前 m4 使用软件生成 wait entries 的 WAITC 路径，地址 footprint 仍用于软件保守依赖分析和验证。

软件章节已经正确介绍 WAITC，并明确区别 `docs/scoreboard.md` 的工作负载模型，未发现需要改写其主论述。

### 4. TMEM 复制段应点明当前 m4 的 IMPL3（建议补充）

位置：审阅时 `content/microarch.js:9`、`:33`。

复制读口与广播写解释正确，对 IMPL0 很有教学价值。但是读者可能从开头概述误以为当前默认板卡仍是 IMPL0，而减少复制、replay、pumping 都只存在实验分支。

当前 target 明确 `TMEM_IMPL=3`、NSB=2、RPL/TDP/GST=true、PMP=1（`targets/ypcb-00338.toml:39-45`）。建议在对比段补这一事实，同时保留源码某些参数仍有 EXPERIMENTAL 注释的历史信息。

## 插图审阅与使用边界

实际查看的图片：`assets/one-slice.png`。关键参数 D128/MCOLS4/ACT_ROWS16/LANES8 与固定 m4 target 一致；IMEM→sequencer、五类命令接口、显式 TMEM 和 external collective 有助建立全局直觉。图内也标有 source-guided abstraction / not physical floorplan，以及 S=1 board can be BAR-only。

需要在图旁明确的局限：

1. ACT RAM 画在 MXU 大框内是**功能聚合**。真实 RTL 中 `otpu_slice` 分别实例化 `u_act`、`u_mxu`、`u_quant`，ACT RAM 不是 `otpu_mxu` 的 literal child instance（`rtl/top/otpu_slice.sv:445`、`:511`、`:529`）。
2. QUANT 框的 “write ACT RAM” 表达输出方向，但图里没有将这一端画线到左侧 ACT RAM。这是省略连接，不是内部独立存储。
3. QUANT 下方双向绿色箭头不能按每个方向解释为真实写口：QACT/QST 从 TMEM 读取，量化输出去 ACT RAM 或 DRAM；没有普通 quantizer 回写 TMEM 的结果端口（`rtl/vpu/otpu_quant.sv:135` 起的端口）。
4. MXU→TMEM 箭头简化了 output 路径，省略 ACC/ASCALE 对旧 TMEM 的读取；DRAM→MXU 的 weights 线省略 A-port scales；QST 的 SW→DRAM 路径也未画全。
5. 图中的 BAR+GATHER 表示可用 collective 功能集合，不是默认 YPCB m4 的完整构建：Vivado flow 默认 `COLL_GATHER=0`，S=1 板卡只构建 BAR（`boards/ypcb-00338/vivado/create_project.tcl:48`）。

建议图注（可直接采用）：

> 这是单 slice 的功能数据流聚合图，箭头不列出完整端口或周期。ACT RAM 在 RTL 中与 MXU、QUANT 同属 slice 的独立实例；图中的 QUANT“write ACT RAM”连接省略。QUANT 只从 TMEM 读取，输出去 ACT RAM（QACT）或 DRAM（QST），下方双箭头不表示它回写 TMEM。MXU 的 ACC/ASCALE 读回、A-port scales 与 QST 的 SW 写口也未画全。当前 YPCB m4 默认 BAR-only；GATHER 属于启用该功能的仿真/多 slice 构建。查看可交互实例树和源码以核对真实层级与接口。

若保留该图，图注必须与图片同时可见或可直接展开；不能仅把边界藏进研究文件。精确源码连接应继续使用代码原生交互图。

## 其他核查通过的结论

- `dot(a,w)` 的矩阵方向为 a[M,K]×w[N,K]ᵀ，streamed w 必须是 QTensor；源码有类型、K、rowmax、acc_scale 与 PAIR 约束。
- 新建二维 dot 输出在多行、偶数 N 时用奇数 row stride，并预留 RMAX spare；与真实 TMEM bank mapping 对应。
- Stationary 的 owners 和 qranges 解释准确，未把 Python 对象存活误当成硬件完成。
- `all_reduce` 当前确实为 all_gather 后的 VOP 累加；S=1 两者直接返回输入。
- attention `_attend_heads` 默认 depth=3；V scale 进入 P 的量化，VT 可为 UNIT stream；online softmax 公式与 `_finish` 对应。
- microarch 明确四个 RTL 为本站原创且未接入上游；XY 只有路由函数，无完整 router；busy-mask scoreboard 无一般 WAR 跟踪；directory 无数据、行地址、eviction 或事务 ID。
- directory 的 probe ACK 语义明确为处理及数据交接完成，rsp_valid 保持到接受；两客户端单行限制与源文件一致。
- cache coherence、memory consistency、软件同步分开讲解；没有把 KV cache、TMEM 副本或集中 collective 冒充 MESI 系统。

## 外部主来源检查

通过 web 工具实际打开以下官方资料，页面可访问且支持教学的有限用途：

- [FlooNoC Routing Algorithms](https://pulp-platform.github.io/FlooNoC/floonoc/route_algos/)：维序/XY 路由与确定性假设。该项目示例的 Y 方向约定与本站练习不同，课程已说明练习采用自己的坐标和端口编码。
- [gem5 MSI Directory implementation](https://www.gem5.org/documentation/learning_gem5/part3/directory/)：目录的 stable/transient states、sharers/owner 和消息分类。它是模拟器/SLICC 教程，课程未声称可直接综合为 RTL。
- [gem5 MSI cache state-machine source](https://gem5.googlesource.com/public/gem5/+/refs/heads/stable/src/learning_gem5/part3/MSI-cache.sm)：作为观察 cache 瞬态的外部源码入口。

## 审阅版本

审阅开始时 SHA-256（主代理修正后预计会变化）：

- software.js：`a5a089d7ef8a76faacd2196cbb9274e5dcad49d804b6f595b2dfcd9a647186e0`
- microarch.js：`1cf674e12521b10d39ee3c89cc64334744a0721cf7ff6702dd691a3c963d15f8`
- one-slice.png：`86590b7e05718965e87a7a0dd885eaa221c58e8542f5bf5045368ee054c0c0b7`

文件和行号机械有效不等于自然语言结论已证明；上面的独立比对只覆盖所列重点与当前固定版本。


## 主代理整合后的修正

Replay 词条与正文已按整row FIFO/replay/issuer预取修正；扩展课补充直连 collective AND 与真实 hub/port 的范围、m4 WAITC 路径及当前 TMEM_IMPL=3 选择。架构图已用 image_gen 把 QUANT 双向箭头修为 TMEM→QUANT 单向；矩阵图改为更宽整数和描述。剩余简化在图注中说明。

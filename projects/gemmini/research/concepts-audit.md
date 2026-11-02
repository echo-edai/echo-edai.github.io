# 微架构课程与教学 RTL 审阅记录

日期：2026-11-02（Asia/Shanghai）

## 已完成

`content/concepts.js` 提供6章、24节、40个可展开概念，共134处结构化本地源码引用。引用使用仓库相对路径与1-based行号；已经用脚本检查所有文件存在、行号没有越界。正文由静态源码阅读、官方平台文档和原创教学推演组成，不把所有推演写成已运行的Gemmini行为。

章节覆盖：

1. 硬件/软件/SoC边界、Chisel展开、状态与时钟、ready/valid、FIFO/弹性缓冲。
2. MAC有符号位宽、WS/OS、双缓冲、skew与标签对齐、最小矩阵核实施路线。
3. Scratchpad与Cache、LocalAddr、Bank/端口/仲裁、Accumulator读改写、DMA分块与事务ID。
4. 区域RAW/WAR/WAW、allocate/issue/complete、TLB/PTW/异常、CPU与DMA可见性。
5. systolic Mesh与packet NoC的区别、router阶段、VC/credit/死锁、多加速器集成。
6. 缓存权限、Cache控制器、目录阵列/MSHR、瞬态/ACK集合、从零编写与验证。

## 事实边界与专项纠正

- Gemmini主仓库的`Mesh.scala`是固定方向的脉动计算数据通路。沿行传播A、沿列传播其他数据/控制；它没有packet router的目的地址、RC/VA/SA或VC机制。
- Gemmini本地SP/ACC不是host缓存的自动一致副本。DMA采用Get/Put一类TileLink操作；是否经过系统coherent point取决于SoC连接与配置，不能从TileLink名称直接推出coherence保证。
- Gemmini主仓库没有`directory_controller`。目录课程明确归属host SoC/扩展设计，不虚构对应Gemmini模块。
- 不能只给出LD/EX/ST相同起始地址的hazard示例。RS对本地地址区域做overlap，区分SP/ACC与garbage，并有环绕表示。
- RS不只是“完成时解除所有依赖”：同队列顺序约束可在issue时解除，LD/ST配置命令可`complete_on_issue`。正文特别补充383、451—475行规则；跨引擎数据完成仍需匹配其生命周期。
- `LocalAddr.sp_bank()`使用配置决定的行号位段；没有照搬其他GPU常见的字级低位bank interleaving。
- `SyncReadMem`有读延迟；响应槽需在接收读时预留。
- Accumulator读改写具有在途hazard，源码保留小矩阵时序TODO；没有声称所有参数组合已验证。
- ready/valid课程明确这是常用保持契约，不把Chisel Decoupled类型本身误称为Irrevocable保证。
- TLB flush、cache数据维护、内存顺序屏障是不同职责。CPU↔DMA同步需遵循具体平台/OS，正文未开出万能fence“修复”。
- RAW中文标题为“写后读”；WAR表示读者尚未结束时后写可能覆盖其数据。

## 本地来源

Gemmini固定提交：`8c3f9923a44a2fe2c7930587be297d6d4f8c09ca`。

关键文件与位置：

- `PE.scala:14,58,70,89,102,118,141`：泛型MAC、双寄存器、OS/WS以及无效时保持。
- `Mesh.scala:39,48,76,90,99,117`：展开、数据/control/valid/id流水、底边输出。
- `Scratchpad.scala:100,113,116,119,163,172,176,567`：SRAM、响应队列、单端口写优先与bank路由。
- `LocalAddr.scala:21,33,41`：本地空间与操作元数据、bank/row、地址比较。
- `AccumulatorMem.scala:99,111,113,127`：RMW流水、延迟约束及边界TODO。
- `DMA.scala:130,143,168,206,233,249,292`：TLClient、尺寸选择、Get、TLB与返回source。
- `FrontendTLB.scala:46,52,60,62,92,107,117`：Rocket TLB、sfence、PTW、异常、共享仲裁和最近翻译过滤。
- `ReservationStation.scala:68,112,329,360,383,434,451,491`：区域重叠、deps、发射/完成规则。
- `Controller.scala:174,181,346,379,425,438,443`：host PTW、控制器握手、仲裁与busy。

Chipyard固定提交：`e02074414158c85059c1dcb231ff2f8941254b9a`。

- `docs/Customization/Memory-Hierarchy.rst:44,49,62,80`：crossbar/NoC、L2、broadcast hub与coherence agent。
- `docs/Customization/DMA-Devices.rst:6`：DMA master和coherent memory system例子。
- `docs/Customization/RoCC-Accelerators.rst:6,42,59`：RoCC、不同TL节点和L1接口。
- `docs/Customization/NoC-SoCs.rst:6,20`：Constellation替换SoC互联。
- `docs/Generators/Constellation.rst:6`、`Rocket-Chip-Generators.rst:10`：NoC生成器和可选InclusiveCache。

## 在线官方扩展来源

以下已浏览，用于核对扩展机制；它们不是已下载Gemmini硬件的实例清单。

- [Constellation官方概览](https://constellation.readthedocs.io/en/latest/)：packet-switched/wormhole、virtual networks、credit、routing verifier。
- [官方Router说明](https://constellation.readthedocs.io/en/latest/Configuration/Routers.html)：RC/VA/SA/ST、credit、组合阶段配置。课程只简述其结构，具体实现以对应版本为准。
- [SiFive规范入口](https://www.sifive.com/documentation)：当前TileLink规范入口；本课程不声称本地旧版规范等于当前最新版。
- [inclusive-cache Directory.scala](https://github.com/chipsalliance/rocket-chip-inclusive-cache/blob/main/design/craft/inclusivecache/src/Directory.scala)：浏览到的main包含dirty/state/clients/tag、目录SRAM与读写/旁路逻辑。
- [inclusive-cache MSHR.scala](https://github.com/chipsalliance/rocket-chip-inclusive-cache/blob/main/design/craft/inclusivecache/src/MSHR.scala)：浏览到的main包含request/meta状态、probe/grant/release等等待位与调度。它说明“目录阵列”与“完整事务控制”常分离。
- [Rocket DCache固定平台依赖链接](https://github.com/chipsalliance/rocket-chip/blob/c7aabd2823d3d001a7a9e8a982bb65d6cb7c9bdf/src/main/scala/rocket/DCache.scala)：作为进一步阅读入口；另外核对了线上master中的probe/release/metadata管线，不把master行号挂到固定版本。
- [RISC-V ISA官方仓库](https://github.com/riscv/riscv-isa-manual)：翻译/顺序职责的规范入口。

Chipyard引用的inclusive-cache固定依赖为`8e157c808c8ba019b6fdb42232c4e6ac6b11b439`，本次尝试直接读取该提交raw文件未成功。正文外部Directory/MSHR链接因此明确是在线main扩展阅读，未伪装成已验证本地固定版本。

## 独立教学 RTL 的运行证据

`rtl/run.py`使用Icarus Verilog 13.0，仅编译这三个自编模块与testbench：

- `learn_elastic.sv`：一格弹性缓冲，有组合ready回传，不是完整注册ready skid buffer。
- `learn_pe.sv`：INT8/INT32简化WS/OS单PE，显式符号扩展与模溢出，不实现上游双缓冲/阵列。
- `learn_directory.sv`：两个客户端、一条隐含行、单事务、U/S/M权限控制，probe先接受才承认ACK，响应反压保持。

运行命令：`python3 web/gemmini/rtl/run.py`。

结果：**1508项检查通过**；500周期FIFO随机scoreboard，OS/WS各100组有符号数据，加上符号/溢出边界与目录定向场景。确切哈希、工具版本与覆盖见`rtl/verification.json`。

教学目录没有地址、数据、dirty转发、transaction ID、epoch与真实网络。旧事务迟到ACK超出接口契约；加入真实协议必须有身份匹配。有限仿真不证明全协议一致性、死锁自由或完整Gemmini性能。没有执行上游Gemmini构建、仿真、综合或时序分析。

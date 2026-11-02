# Coral NPU 硬件源码审计记录

审计对象：`CoralNPU/hardware/coralnpu`，提交 `f79522157fc0f1d7311f44e209fc36c9c8b7a039`，提交日期 2026-10-30，标题 `[mpact] Validate RVV load/store legality`。这是本地下载快照的静态研读，不声称已验证为上游此刻最新 HEAD。

产物：`web/coralnpu/content/hardware.json`。共 12 章，涵盖配置与生成、标量取指、dispatch/scoreboard、执行与退休、RVV 接口与后端、Zvt、LSU、TCM/bank、AXI/TL-UL fabric、DMA/debug，以及明确标为教学扩展的 NoC/目录实现路线。

上游工作树在本次审计结束时 `git status --short` 为空。本任务没有修改上游 RTL、文档、构建配置或软件。只核查源文件与生成 JSON 的引用，不运行全量 RTL 仿真、形式验证、综合或 PPA 测量。JSON 中的验证段落是建议步骤，不是已通过结果。

## 源码事实与容易误读的边界

| 主题 | 核查结果 | 主要证据，行号为本提交 |
| --- | --- | --- |
| Core 组成 | SCore 恒实例化，RvvCore 由 enableRvv 控制 | `hdl/chisel/src/coralnpu/Core.scala:53` |
| VME 依赖 | enableVme 必须同时 enableRvv | `hdl/chisel/src/coralnpu/Core.scala:133` |
| 参数与目标 | Parameters 基础 fetch/LSU 为 256 bit；CoreMiniAxi 等 BUILD 目标显式覆盖 128 bit | `hdl/chisel/src/coralnpu/Parameters.scala:155`、`:165`；`hdl/chisel/src/coralnpu/BUILD:595` |
| 发射宽度 | instructionLanes=4，前缀按序发射，不能让较后槽位越过未发射槽位 | `Parameters.scala:77`；`scalar/Decode.scala:721`、`:1022` |
| Dispatch 定义 | DispatchV2 在 Decode.scala 内，不存在本教程声称的独立 DispatchV2.scala | `scalar/Decode.scala:397` |
| Scoreboard | 实际 busy 状态在 Regfile 内，普通更新先 clear 再 set，x0 保持 0 | `scalar/Regfile.scala:95`、`:118` |
| 顶层退休语义 | Completed 表示架构副作用已发生；Retired 才按序移出 | `RetirementBuffer.scala:58–66` |
| RVV 内部退休 | RVV 有独立 ROB/retire/VRF 路径，不能与顶层 RetirementBuffer 混淆 | `hdl/verilog/rvv/design/rvv_backend.sv:1214`、`:1252`、`:1309` |
| Fabric 仲裁 | FabricArbiter 优先索引更早的有效来源；不是 round-robin | `hdl/chisel/src/coralnpu/Fabric.scala:22–35` |
| CoreAxi TCM | 直接使用 TCM128/SRAM/FabricArbiter；此处不实例化 BankedDtcm | `CoreAxi.scala:151–165`、`:209–224` |
| BankedDtcm | 独立 TL-UL 多 bank 组件，默认 emitter 以连续地址区间选 bank，并非 word-interleaving | `BankedDtcm.scala:79–95` |
| Router | common.Router 是 1→N 解复用器，TlulLocalXbar 是 host×bank 的本地 crossbar | `hdl/chisel/src/common/Router.scala:20–39`；`bus/TlulLocalXbar.scala:38–53` |
| LSU snooping | 同 row 返回数据复用到可接受 cell；不是多 cache 一致性嗅探 | `scalar/Lsu.scala:1171–1181` |
| LSU invalidate | 与 vector mask 的 cell 状态推进相关，不是 cache-line invalidation 消息 | `scalar/Lsu.scala:506` |
| Zvt | tile/subtile 存储、控制与 PE 通路；不凭品牌套入某代 TPU 的 systolic 数据流 | `hdl/verilog/rvv/design/Zvt/zvt.sv` |
| Tile 写口 | 只有有效 writeEn 贡献组合汇总，避免无效端口默认索引覆盖有效写 | `Zvt/zvt_mt.sv:55–68` |
| DMA | 独立外设；fill→单 transpose buffer→drain，源码注释说明 pass 串行化 | `hdl/chisel/src/dma/DmaCore.scala:34–73` |

## NoC、缓存一致性与目录的审计范围

对以下范围执行不区分大小写的关键字搜索：`hdl/chisel/src/coralnpu`、`hdl/chisel/src/bus`、`hdl/chisel/src/common`、`hdl/chisel/src/dma`、`hdl/verilog/rvv/design`、`doc`。检索表达式包括 `directory_controller`、`cache.coher`、`coherence`、独立词 `mesh` 与 `NoC`；该次搜索无匹配。另查 `snoop`、`invalidate` 后阅读了真实上下文，结论为 LSU 内部响应复用与 vector-mask 相关状态处理。

结论限定为“在本次核查的 Coral 核与附属本地存储/总线实现中未找到 coherent mesh NoC 或维护 owner/sharers 的目录控制器”。它不排除外部 SoC wrapper、未来提交或其他系统集成添加相关组件。JSON 最后一章将 NoC/DirectoryController 明确标为新设计教学建议，没有伪造现有 Coral 源文件路径。

## 引用与代码摘录验证

所有 `source.path` 与 `codeSource.path` 均相对 `CoralNPU/hardware/coralnpu`，已经脚本核查文件存在且 1-based 行号不越界。所有 `code` 都是原文件连续行直接提取，`codeOrigin` 为 `upstream`；`codeSource` 精确指向摘录范围，`source` 可指向更宽的阅读范围。没有把教学伪代码冒充上游 RTL。

后续若更新上游提交，需重新生成并核查行号，不能只替换 commit 字符串。源码内容、模块连接与默认参数都可能随版本变化。

## 阅读与验证方法

建议以两条指令链贯穿源码：`add→依赖add→store` 和 `向量load→运算→store`。每个阶段记录 accepted/fire、tag/txid、数据所在寄存器/队列、完成与资源释放事件。再加 tile load/compute/store、DMA abort、flush 与迟到响应。

必要检查包括 ready 低时 payload 稳定、txid 唯一、响应只消费一次、无旧 epoch 结果写入、mask/tail 不误写、请求与完成计数守恒。波形按上游 `AGENTS.md` 使用 `utils/fst_query` 直接查询 FST，不转换 VCD。

# openTPU 硬件教学内容审阅

- 审阅日期：2026-11-02（Asia/Shanghai）。
- 上游：<https://github.com/FeSens/openTPU>。
- 固定源码：`91df41092f612361c5bc22f83b31d23382ffabb0`。
- 内容：`../content/hardware.js`，12 章、55 节、26 个教学模块节点、4 条运行旅程。
- 角色：通过子代理独立阅读 RTL、ISA 文档和 target 编写，再由主代理集成网页。未修改上游源码。

## 阅读和表达约定

所有 `path` 相对于工作区 `openTPU/hardware/openTPU/`。每节 `refs` 直接指向固定快照中的文件和行；公开网页应转换为该提交的 GitHub blob 链接。课程正文为原创中文说明与练习设计，不是整段转载上游。

人工 `modules` 图是教学分层，含 host、ISA package、loader、epilogue 等概念节点。它不声称每一个节点都是独立 Verilog module，也不声称 `children` 是完整 elaborated instance graph。网页提供的实际 Verilator 实例层次应单独展示，注明顶层、参数与 technology。

## 关键事实和容易混淆的地方

| 结论 | 固定源码依据 | 课程处理 |
| --- | --- | --- |
| `otpu_top` 是仿真顶层，每个 slice 有私有 DRAM | `rtl/top/otpu_top.sv:1`、`:65` | 不把仿真默认值当板卡参数 |
| `otpu_slice` 集成五类命令单元，允许并发 | `rtl/top/otpu_slice.sv:1`、`:247`、`:500` | 分开解释 command dispatch、start、cycle advance、done |
| IMEM 每指令 256 bits；`IMEM_WORDS` 是 32-bit words | `rtl/seq/otpu_seq.sv:79`、`:389`，`rtl/shell/otpu_ctrl.sv:67` | 32768 words = 4096 条指令，不能说成 32768 条 |
| TMEM 是 word-addressed FP32 scratchpad | `rtl/mem/otpu_tmem.sv:1`，`docs/isa.md:19` | TMEM +1 与 DRAM +4 明确区分 |
| ACT 是量化驻留矩阵与 scale records | `rtl/mem/otpu_actram.sv:1` | 不把 scale RAM 漏出容量计算 |
| 基础 sequencer 比较三空间半开区间 RAW/WAR/WAW | `rtl/seq/otpu_seq.sv:107`、`:236`、`:531` | 只读/只读及不同空间不会冲突；保守范围会降低并发 |
| 选择最老 ready 使用年龄矩阵，不按 slot 数字 | `rtl/seq/otpu_seq.sv:368`、`:741` | 解释 slot 复用和 youngest/oldest 的区别 |
| 基础调度可让独立年轻命令提前 start | `rtl/seq/otpu_seq.sv:1`、`:741` | ISA 顺序语义不等于整机串行执行 |
| MXU 预取 start 与计算 release 是两次许可 | `rtl/seq/otpu_seq.sv:14`、`:815` | MM 预取不要求 ACT producer 已完成，实际消费要求完整依赖满足 |
| 当前 m4 `SEQ_WC=true` | `targets/ypcb-00338.toml:29` | 不能只教范围 scoreboard 而忽略正在使用的 WAITC |
| WAITC 软件生成 counts 与 VPU mask，loader 还装 sidecar | `rtl/seq/otpu_seq.sv:399`，`rtl/top/otpu_slice.sv:340`，`docs/isa.md:503` | 镜像/硬件模式必须匹配；wrong entry 是 wrong program |
| WAITC entry 64 bits；7×4-bit 字段，其中 k3=0；VPU mask=31 bits | `docs/isa.md:512`，`rtl/seq/otpu_seq.sv:403` | 解释保留位与实际 RAM 打包宽度 59 bits |
| WAITC 下 DMA/MXU/Q/COLL 严格按程序序 start，VPU 可最老 ready | `rtl/seq/otpu_seq.sv:776`，`docs/isa.md:517` | completion in start-order 与 completion in program-order 分开 |
| 当前 m4 的 TMEM 是 IMPL3 单拷贝，而非旧读口复制默认 | `targets/ypcb-00338.toml:39` | IMPL0/1 作为对比和设计路线讲解 |
| m4 使用 NSB2、RPL、TDP、GST、2× pumping | `targets/ypcb-00338.toml:41` | 不能将 PMP2 的仿真模型当真实 2× BRAM 实现 |
| IMPL0 的副本由所有写同时更新，不是 coherent cache | `rtl/mem/otpu_tmem.sv:6` | 明确没有 tag/replacement/sharer/owner 语义 |
| bank=word address mod LANES，连续端口可用 rotator | `rtl/mem/otpu_tmem.sv:1`、`:24` | 教非对齐连续读取与 stride bank conflict |
| IMPL3 的丢读 replay 需要数据保持与前进性 | `rtl/mem/otpu_tmem.sv:371`、`:519`、`:671` | 不把 replay 当“再读一次就总是正确” |
| DMA request 接受时预留 read-response slot | `rtl/dma/otpu_dma.sv:7` | 解释无回包背压与 credits，区别当前 valid occupancy |
| DMA B port 优先于 MXU；QST scalar writes 分 SW 口 | `rtl/top/otpu_slice.sv:1`、`:938` | 避免画成所有流共享一个无仲裁 bus |
| ST/QST 完成还要等 writes accepted，slice 的寄存请求也算未完成 | `rtl/top/otpu_slice.sv:911`，`rtl/dma/otpu_dma.sv:38` | 输出最后一拍不等于主机可读结果 |
| MXU 是 streamed W[N,K] 与 stationary A[M,K]，结果 A×Wᵀ | `rtl/mxu/otpu_mxu.sv:1`，`docs/isa.md:179` | 明确矩阵方向，不照搬其他 TPU 的布局 |
| systolic 是 DSP cascade 链、列间 skew/deskew | `rtl/mxu/otpu_mxu.sv:17` | 不强行画成 Gemmini 方形 2D 阵列 |
| 累加为 48-bit 整数精确路径，最终 FP32 epilogue | `rtl/mxu/otpu_mxu.sv:4`、`:22` | scale 与 rounding 顺序属于 ISA 数值契约 |
| 4-bit PAIR 仅在 2M≤MCOLS 等条件下适用 | `rtl/mxu/otpu_mxu.sv:10`、`:155` | 不声称所有 4-bit 自动翻倍 |
| ACT_ROWS>MCOLS 的 replay 复用 weight FIFO | `rtl/mxu/otpu_mxu.sv:34`、`:148` | 与 TMEM 的冲突 replay 明确区分 |
| QACT 是两遍算法，可用 XD buffer 省第二次 TMEM 读 | `rtl/vpu/otpu_quant.sv:1`、`:21` | 不假设每周期恒定有量化输出 |
| ACT 写需多级登记，done/release 保证依赖读安全 | `rtl/mem/otpu_actram.sv:13` | 保留写落地与消费时刻的区别 |
| VPU 归约顺序固定，不能任意重排 fp32 加法 | `rtl/vpu/otpu_vpu.sv:25`，`rtl/vpu/otpu_fp.sv:1` | RNE/FTZ 与位参考对应，不以 numpy 近似替代 |
| SE 与 VOP 共享 VPU 资源，stream 要等 VOP 排空 | `rtl/vpu/otpu_vpu.sv:60`，`rtl/dma/otpu_dma.sv:17` | 不画成始终并发的第三计算核 |
| A-port 有 scale beat/run 复用；主机写需显式 flush | `rtl/mem/otpu_native_dram.sv:49`、`:83` | 可称局部缓存/预取功能，不延伸成多核 coherent hierarchy |
| QST partial RMW 需要排除同 beat 的其他写 | `rtl/mem/otpu_native_dram.sv:62` | 解释 lost update 与 host ordering 合约 |
| channel bridge 双 native port 读回包可乱序，slot 恢复顺序 | `rtl/shell/otpu_mem_ch.sv:17`，`rtl/shell/otpu_afifo.sv:10` | 与 CPU ROB 类比仅用于顺序恢复思想 |
| CDC 单步 Gray count 不能直接每拍加二 | `rtl/shell/otpu_mem_ch.sv:50` | 独立 per-port 计数过域再求和 |
| collective 是中心 BAR/GATHER，不是 XY mesh | `rtl/top/otpu_coll.sv:1`，`rtl/shell/otpu_board.sv:15` | NoC 作为新增接口/路由/flow-control 的扩展任务 |
| YPCB build flow 自 r2 默认 COLL_GATHER=0 | `boards/ypcb-00338/vivado/create_project.tcl:48` | 默认板卡仅 BAR；仿真默认开 GATHER；多 slice 需完整 GATHER |
| hub ACK 要等目标 port 写排空，延迟 req 防重入 | `rtl/top/otpu_coll.sv:277`、`:325` | 读/写流水、credits、drained 分开演示 |
| 生产层级没有目录式 coherent caches 和 directory_controller | top/slice/board 的实例连线；`rg` 检索 `directory_controller`、`module.*(cache|noc|router)`、`MESI/MOESI` 无相关命中 | 不从 NaplesPU 移植结构；扩展需要单独设计与测试 |

## 实际静态检查

本子代理执行：

1. `node --check web/opentpu/content/hardware.js`：通过。
2. 读取数据中的章节 refs、模块 refs、旅程 refs：220 个文件/行位置全部存在且落在文件有效行内。
3. 对照当前固定 target、RTL 的 generate/parameter 分支、ISA 文档核查上述事实。
4. 容量检查：m4 ACT data=16×128×128=262144 bytes，scale=16×128×8=16384 bytes，总逻辑数据=272 KiB；TMEM 256 KiB，IMEM 原指令空间 128 KiB（另有 WAITC sidecar）。这些不是物理面积或实测带宽。

主代理另外实际运行了 Repomix 和 Verilator，并提供以下记录：

- Repomix 1.18.1：71 个选定文件、581386 tokens，打包位于 `repomix-context.md`。它是上下文聚合，不是自动证明架构。
- Verilator 5.048 `--json-only`：仿真默认配置 118 个专化 module / 883 个 cells；m4 参数配置 129 / 1569。m4 运行仍采用 `otpu_top`、AXI0 行为 DRAM 与 generic technology，未包含完整板级 shell，不能当作板卡 FPGA elaboration 或 resource report。
- 上述两套分别产生 51 / 54 条 width warnings，未把有 warning 的 elaboration 宣称成 clean lint。
- 独立结果由主代理保存到 `../data/design.json` 及分析记录；若主代理后续修订统计，以保存的原始结果和运行参数为准。

## 限制与进一步验证

- 本次子代理完成的是静态 RTL 阅读、教学内容和可追踪引用，没有独立运行上游整机模型、Verilator 仿真、FPGA 综合、布线、上板或形式验证。
- 教学步骤与“自己实现”段落是设计建议；不是已加入上游的 feature，也不代表完整生产 RTL 可以由短小示例直接替代。
- 两个不同意义的 replay、基础 scoreboard 与 WAITC、仿真默认与 target、BAR-only 与完整 GATHER 是最需要保持的展示边界。
- 上游注释含历史架构和 timing/性能测量记录。课程仅把它们当可追踪设计背景，不将历史测量标为此次复现。
- NoC、目录一致性、cache line owner/sharer、MESI 状态机需要在独立扩展教学中标明。没有目录模块的项目，不能通过搜索词或图片补出一个“已有实现”。

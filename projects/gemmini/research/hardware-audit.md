# Gemmini 硬件课程审阅记录

基线：`ucb-bar/gemmini`，提交 `8c3f9923a44a2fe2c7930587be297d6d4f8c09ca`。本审阅只读本地固定源码，没有修改上游、没有运行完整构建或仿真。

## 交付

`content/hardware.js` 定义 `window.GHARDWARE`：10 章、40 节，25 个可交互模块节点、3 条可逐步追踪的数据流。267 处源码引用均使用主仓库相对路径及 1-based 行号。

节点 ID 与页面主图约定兼容：`host`、`controller`、`loop`、`rs`、`load`、`execute`、`store`、`dma`、`tlb`、`scratchpad`、`accumulator`、`mesh-delay`、`mesh`、`tile`、`pe`、`transpose`、`counters`。额外节点：config、loopconv、spbank、scale、xact、tracker、im2col、tilelink。

## 重点核对的事实

| 易误读项 | 固定源码证据 | 本课程的处理 |
| --- | --- | --- |
| 活动命令入口 | Controller.scala:236、251、262；旧 Tiler 部分在块注释内 | 当前 raw_cmd_q → 可选 LoopConv → LoopMatmul → RS；没有把旧 CmdFSM/Tiler 当当前实例 |
| RS 与控制器队列 | Configs.scala:55、61 | RS LD/ST/EX=8/4/16；controller queue LD/ST/EX=8/2/8，明确分开 |
| 三种整数宽度 | Configs.scala:23–30；PE.scala:58–71 | 输入/权重8bit、阵列输出20bit、Accumulator32bit；PE 内驻留类型依配置变化 |
| SRAM 容量换算 | GemminiConfigs.scala:105–113 | 默认 Scratchpad 每bank4096行×16byte，Accumulator每bank512行×64byte |
| Mesh 不等于 packet NoC | Mesh.scala:39、50、60；Tile.scala:42 | 固定方向数据/控制传播，不声称存在包路由、VC或内部directory |
| OS/WS 的端口语义 | PE.scala:102、118；MeshWithDelays.scala:199 | OS取out_c，WS取out_b，说明相同端口名在不同模式数学意义变化 |
| PE 并非完全无状态 | PE.scala:70–71、142 | 旧注释不覆盖实际c1/c2寄存器；Tile间另有流水 |
| 转置与软件标志 | MeshWithDelays.scala:151–173 | 由dataflow和标志共同选择A/B/D，不一概等同于“transpose=true即经过转置器” |
| 依赖范围与完成 | ReservationStation.scala:69、89、314、438、463、491 | RAW/WAR/WAW、issue/complete、same-type顺序与跨类依赖分别解释 |
| DMA三级身份 | LoadController.scala:94；DMA.scala:206；XactTracker.scala:56 | RoCC/RS命令、DMA命令、TileLink事务/beat不混同 |
| TLB依赖主机 | FrontendTLB.scala:46、60、89、118；Controller.scala:174 | 设备虚拟地址翻译经TLB/PTW，页表与一致性归系统环境 |
| LoopMatmul并发 | LoopMatmul.scala:912、984、1000、1006、1286 | 两个loop状态、子状态机进度、RS反馈分别讨论；LOOP_WS解码不推断为通用OS循环接口 |
| 主机缓存/一致性 | Controller.scala:23、89；DMA.scala:130 | 只解释接入边界；未声称Gemmini内有directory controller或scratchpad自动一致 |

## 检查及限制

- `node --check content/hardware.js` 通过。
- 枚举267个引用，所有文件存在且行号位于当前固定文件范围内。
- 引用可定位和语法正确不等于自然语言已获形式证明；主要数据流、数值和模块实例经过人工读码核对。
- 从零实现步骤是教学建议，不是上游现成实现或完成过的性能实验。
- 峰值只在满利用率与给定MAC口径条件下讨论；没有声称TOPS、面积、频率或任何实测加速比。
- 完整主机一致性需继续读匹配平台的缓存/总线/目录实现。当前资料库有部分额外平台依赖未下载；课程不填补不存在的源码证据。

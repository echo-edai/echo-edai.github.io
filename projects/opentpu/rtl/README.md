# 从微架构概念到 RTL：四个独立小练习

这里是为学习站原创的教学代码，**不属于 openTPU 上游，也没有连接到 openTPU**。代码采用 MIT 许可，见 [LICENSE](LICENSE)。openTPU 原始源码仍遵循其上游许可。

这四个模块刻意限制规模，以便读者逐行写出状态更新：同步 FIFO、XY 下一跳函数、寄存器 busy-mask scoreboard、两客户端单行权限目录。它们不能直接替换上游模块，也不构成完整 NPU、NoC router 或一致性 cache 系统。

## 运行

需要 Python 3、Icarus Verilog（`iverilog`）和 VVP（`vvp`）。在本站目录执行：

```sh
python3 rtl/run.py
```

脚本只编译/运行本目录五个 SystemVerilog 文件。编译中间产物放在系统临时目录，结束时自动清理；报告写到 `../research/rtl-validation.json`。不下载依赖，不执行上游构建。

也可在本目录手工执行：

```sh
iverilog -g2012 -Wall -s tb_learning -o teaching.vvp learn_elastic.sv learn_xy_route.sv learn_scoreboard.sv learn_directory.sv tb_learning.sv
vvp teaching.vvp
```

本次 Icarus Verilog 13.0 检查结果：

```text
FIFO_PASS cycles=522 accepted=194 retired=194
XY_PASS pairs=256 hops=640
SCOREBOARD_PASS directed=10
DIRECTORY_PASS directed=18
ALL_PASS
```

这些是具体仿真轨迹的检查结果，没有执行综合、静态时序、CDC 分析或形式证明，没有运行完整 openTPU。

## 通用时序约定

- 状态寄存器在 `clk` 上升沿更新，`rst` 是高有效同步复位。
- `valid && ready` 在同一上升沿为真才表示一次接受。
- testbench 在下降沿准备输入，跨上升沿后检查更新后的状态。
- FIFO 数据槽不复位；占用数为 0 时输出数据无效，不得消费。
- reset 会丢弃练习中的在途工作。把这种复位语义用于真实系统前，必须另外处理外部在途读写与客户端状态。

## 1. `learn_elastic.sv`：两项同步 FIFO

| 端口 | 方向 | 含义 |
| --- | --- | --- |
| `in_valid`, `in_data[W-1:0]` | 输入 | 上游当前持有的一项 |
| `in_ready` | 输出 | 占用小于 2 且不在复位中 |
| `out_valid`, `out_data[W-1:0]` | 输出 | 队首项是否有效及其数据 |
| `out_ready` | 输入 | 下游本拍可接收 |
| `occupancy[1:0]` | 输出 | 更新后的占用，取值 0、1、2 |

状态只有两项存储、头尾各 1 bit、占用数 2 bit。`put = in_valid && in_ready`；`pop = out_valid && out_ready`。占用数的变化量是 put 减 pop，同时发生时头尾都推进但占用不变。

为保持契约简单，**没有空旁路，也没有满时同拍替换**。FIFO 满时即使下游正在 pop，上游本拍也不会被接受；下一拍才重新 ready。这会产生可解释的保守气泡。

不变量：占用不超出范围；输出按输入被接受的次序排列；`out_valid && !out_ready` 时队首保持。测试用独立两元素参考队列检查每个周期的 ready/valid/count/data，不只检查最终值。

修改练习：支持参数化深度；允许满时同拍交换；加输出寄存。每项修改先说明哪些时序/吞吐性质改变，再改测试模型。

## 2. `learn_xy_route.sv`：二维下一跳函数

| 端口 | 含义 |
| --- | --- |
| `cx`, `cy` | 当前节点坐标 |
| `dx`, `dy` | 目的节点坐标 |
| `port[2:0]` | 0 LOCAL / 1 EAST / 2 WEST / 3 SOUTH / 4 NORTH |

默认坐标宽度 `CW=2`，Y 向南递增；先走 X，再走 Y。相同坐标返回 LOCAL。该模块是组合逻辑。

测试遍历 4×4 的全部 256 个源/目的组合，逐跳检查不会越界、X 未完成时不改变 Y、每跳 Manhattan 距离减一、至多六跳到达目的。所有路径合计 640 跳。

**它不是 router**：没有 FIFO、链路、路由仲裁、crossbar、credit、packet 头尾或 VC，因此既不验证吞吐，也不证明完整网络/协议无死锁。

修改练习：将坐标扩到 3 bit；检测非法坐标；给五个输入各加 FIFO、为五个输出分别仲裁。处理任意阻塞时先检查不丢不重，再分析公平和死锁。

## 3. `learn_scoreboard.sv`：寄存器 busy mask

| 端口 | 方向 | 含义 |
| --- | --- | --- |
| `issue_valid` | 输入 | 候选指令存在 |
| `reads[N-1:0]`, `writes[N-1:0]` | 输入 | 候选指令的源、目的寄存器掩码 |
| `complete[N-1:0]` | 输入 | 当前边沿完成的生产者目的掩码 |
| `issue_ready` | 输出 | `busy & (reads | writes)` 为零且非复位 |
| `busy[N-1:0]` | 输出 | 仍由在途生产者预留的寄存器 |

发射时预留 writes，complete 清除对应 busy。完成对发射**下一拍**可见，未做同拍旁路。若本拍一个旧 producer 完成，依赖它的候选仍在本拍被阻塞。

前提：源操作数在发射时读走；每个目的只允许一个 writer；complete 来自对应在途生产者并只报告一次。该练习只展示 RAW/WAW，不保存读者生命周期，**不处理一般 WAR**。没有 producer tag、重命名、异常或取消。

这也**不是 openTPU 的 scoreboard**：上游处理的是命令在 DRAM/TMEM/ACT 中的范围与多单元窗口依赖，见 `rtl/seq/otpu_seq.sv`。

修改练习：给每次 issue 分配 producer tag；完成必须同时匹配 busy 与 tag；增加正在读取的长时延单元，理解为什么这时需要读者跟踪与 WAR 检查。

## 4. `learn_directory.sv`：两客户端、单行、控制平面目录

这里的单行是隐式地址，不存在数据阵列。客户端编号为 0、1。

| 信号 | 含义 |
| --- | --- |
| `req_valid`, `req_ready` | 新请求接受握手 |
| `req_client` | 请求者编号 |
| `req_getm` | 0 GETS 读权限；1 GETM 写权限 |
| `probe_valid[1:0]` | 各目标仍需处理的探针掩码，保持到对应 ACK |
| `probe_to_shared` | GETS 导致旧 M owner 降级；GETM 则要求失效 |
| `ack[1:0]` | 目标**已完成**对应探针与必要数据交接，不只是接收探针 |
| `rsp_valid`, `rsp_ready` | 授权响应握手，valid 持有到接受 |
| `rsp_client`, `rsp_modified` | 响应身份与是否授予 M 权限 |
| `state[1:0]` | 0 U 无缓存副本；1 S 共享；2 M 单 owner 可写 |
| `sharers[1:0]`, `owner` | 稳定状态的共享者与 owner；owner 只在 M 有意义 |
| `busy` | 等待目标完成的瞬态 |

### 稳定转移

| 原状态 | 事件 | 动作与最终状态 |
| --- | --- | --- |
| U | GETS | 建立请求者为共享者，S |
| U | GETM | 请求者为 owner，M |
| S | GETS | 增加请求者为共享者，S |
| S | GETM | 失效其他共享者，等 ACK 后 M |
| M | owner GETS/GETM | 仍为原 owner 的 M |
| M | 另一客户端 GETS | 原 owner 降级并完成数据交接后，二者 S |
| M | 另一客户端 GETM | 原 owner 失效并完成数据交接后，新 owner 的 M |

接到需要探针的请求时，保存 `pending`、`target_state`、`target_sharers`、`target_owner` 与请求者。`remaining = pending & ~ack`；仅当 remaining 为零才更新稳定 metadata 并生成响应。等待期间稳定字段仍保持旧值，**不可按普通稳定状态继续接受请求**。`busy` 或 `rsp_valid` 为真时 `req_ready=0`；响应接受当拍也不做新请求替换。

用 ACK mask 而不是裸计数，可忽略没有在等待的 bit；但该练习**没有事务 ID 或行地址**。可靠传输/客户端必须确保 ACK 对应当前 probe，不能把任意旧 ACK 交过来。ACK 还隐含最新数据已经妥善转移，数据值并未在本练习中验证。

### 未实现项

- Cache 数据、tag、dirty、load/store、eviction、PutS/PutM。
- 多行、多事务、TBE/MSHR、旧响应识别、探针重试和错误。
- 消息 packet、NoC、credit 或真实异步接口。
- 缓存客户端完整状态机、内存顺序、fence、原子操作。
- 数据最新值、完整协议活性或故障恢复证明。

复位取消整个教学系统的状态。真实系统不能仅复位目录却保留客户端的可写缓存副本；需要系统级复位/清空协议。

### 建议下一步

先加入两个客户端的 cache state 与一个整数 data，测试“核 0 写、核 1 读”；再增加延迟、并发写和 evict；最后引入多行地址与事务身份。在无数据原型上做控制测试，不能代替完整一致性数据正确性。

## 测试范围与复查

`tb_learning.sv` 对 FIFO 做定向边界与确定种子 LFSR 背压；对 XY 做合法坐标穷举；对 scoreboard 检查 RAW/WAW、独立指令、完成与 valid；对目录检查主要稳定转移、ACK 延迟、无关 ACK、响应保持、无探针的单 owner/单 sharer 情形，以及在途和输出保持时的复位。

`research/rtl-validation.json` 记录命令、仿真器版本、stdout 与每个被编译文件的 SHA-256。它验证这些练习的特定轨迹，不为上游 openTPU 或其他参数配置背书。

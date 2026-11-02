# 八种交互实验的模型审读

核查对象：`models.js`、`logic-models.js` 和 `app.js`。这是浏览器教学模型与接口文案的独立复核，不是 Coral RTL 或 RISC-V ISA 符合性测试。

## 已运行的验证

```sh
node web/coralnpu/tools/test_coral_models.cjs
node web/coralnpu/tools/test_learning_models.cjs
```

本轮新增模型测试 **20 项通过，0 失败，0 跳过**；已有状态模型测试 **23 个检查通过**。没有运行真实 Coral 指令、全核 RTL、板卡或性能测试。Node 执行用时只反映测试进程，不是硬件延迟。

新增测试覆盖：

- Vector：SEW=8/16/32、LMUL=1/2/4 的全部合法整数 `vl`，VLMAX、mask/tail 分区、零长度、容量裁剪、输入数组不被改写。
- Bank：不同 bank 并行、同 bank 排队、word 内 byte 地址、重试次序、闭合请求批次不丢失不重复、每 bank 每拍至多授权一个请求。
- Tile：基础占用、精确容量边界、A/B 双缓冲而非 C 双缓冲、K 增大不改变固定局部 Tile 容量、独立枚举输出边缘有效元素。
- Address：所有窗口的首/末 byte 与半开边界、default 空隙、highmem 相邻区域、RV32 地址上界，并从上游源码读取模板交叉核对。
- XY：全部 256 个 4×4 源/目的组合，端点、曼哈顿长度、相邻跳、无重复节点以及 X 后才 Y 的路由顺序。

## 八种实验各自表达什么

| 实验 | 有效教学范围 | 必须保留的限制 |
| --- | --- | --- |
| Scoreboard | 8 个抽象寄存器，旧 busy 状态检查 RAW/WAW，握手后占用，clear 后 set 优先 | 不是 Coral 的 32 个标量寄存器、4 槽位前缀派发、旁路或 flush 模型；教学 r0 也不是 RISC-V x0 |
| Vector | VLMAX、逻辑分组、给定实际 vl、mask/tail 与简单加法 | 不表示物理 lane 数或执行周期；不保存旧 vd，不实现完整尾/掩码策略及指令数值语义 |
| Bank | word-interleaving、每 bank 每拍一个请求、固定请求顺序 | 与上游 BankedDtcm 默认连续区间译码不同；不模拟 TL-UL、真实 SRAM 端口、合并访问或突发事务 |
| FIFO | 4 项 8-bit 队列，旧状态决定 ready/valid，full 同拍 pop 不接新 push | 这是下载教学 RTL 的保守接口策略，不声称所有 Queue 都必须这样实现 |
| Matrix | A/B 局部 Tile 与 4-byte accumulator 的容量算例、M/N 边缘、K 逻辑步骤 | 不是编译器真实内存分配、Zvt 指令调度或周期仿真；有效元素比例只计输出 M/N，不含 K 尾块 |
| Address | 固定 default 与 1MiB/1MiB highmem 模板的地址窗口命中 | 不自动发现硬件配置；不模拟访问主体、权限、取指与数据端口差异或外部错误返回 |
| NoC | 单个 token 的确定性 XY 路径及手动停留 | 教学扩展；没有完整输入 FIFO、flit、链路时序、仲裁、虚通道或协议死锁模型 |
| Directory | 两核单行权限元数据、探针、目标 ACK 与响应背压 | 教学扩展；没有缓存行数据、地址、多行并发、owner 写回、替换或完整 MESI 协议 |

Scoreboard 模型用旧 busy 判断本拍能否发射，因此同拍写回不会立即解除本拍 RAW 阻塞；Coral `Regfile.scala` 还输出 `scoreboard.comb = scoreboard & ~scoreboard_clr` 并有旁路。这是抽象策略的差异，不能从教学模型推断真实核必然多等一拍。

目录模型收到错误目标 ACK 时不消耗它；probe 未被接受时保持 PROBE；等待 ACK 和响应期间阻止覆盖当前请求。模型仍只证明这份有限状态教学实现的行为，不能据此证明完整缓存一致性。

## 地址模板与真实代码的对应

核对基线为主硬件提交 `f79522157fc0f1d7311f44e209fc36c9c8b7a039`。

`Parameters.scala` 的 `MemoryRegions.default`：

| 区域 | 起点 | 大小 | 半开结束地址 |
| --- | --- | --- | --- |
| ITCM | `0x00000000` | 8 KiB | `0x00002000` |
| DTCM | `0x00010000` | 32 KiB | `0x00018000` |
| CSR | `0x00030000` | 4 KiB | `0x00031000` |

`MemoryRegions.highmem` 的基址固定为 `0x00000000`、`0x00100000`、`0x00200000`，容量由参数传入。网页选用 `itcmSizeKBytesHighmem=1024` 与 `dtcmSizeKBytesHighmem=1024`，所以 highmem 中 ITCM 末尾+1会命中 DTCM，DTCM 末尾+1会命中 CSR；不能一概当成 external。

`MemoryRegion.contains` 使用 `start <= address < start+size`，与模型一致。`CoreAxi.scala` 取 `memoryRegions=p.m`，因此实际构建可以传不同映射。其取指路径仅对 ITCM 做本地 fast path，非 ITCM 可经 IBus2Axi；AXI slave 访问本地资源又通过 FabricMux。窗口命中不能自动证明某类请求能经某条端口成功访问。

## Bank 实验与 BankedDtcm 的关键差异

网页公式是 `floor(byte_address/4) % banks`。上游 `BankedDtcm.scala` emitter 则用 `bankSizeBytes=dtcmSize/numBanks`，再取 offset 的高位选择连续区间，并给每 bank 分配 `dtcmBase+i*bankSizeBytes`。

以默认 32 KiB DTCM、8 banks 为例，每 bank 4 KiB。`0x10000/0x10004/0x10008/0x1000c` 在网页模型分到 B0/B1/B2/B3，在上游默认 emitter 全部属于 B0。这一差异已写成测试，避免将来把教学公式误当成上游架构事实。CoreAxi 当前也没有直接实例化这个独立 BankedDtcm 组件。

## 发现并交给前端作者处理的问题

1. **矩阵实验的重复 DOM id。** 审读时容量输入和进度条都叫 `tile-capacity`；`renderTile` 的 `#tile-capacity span` 找不到 span，会在打开该实验时抛错。建议进度条改为独立的 `tile-capacity-bar`，输入保留原 id，并修改对应样式选择器。该问题是静态 UI 审读发现，纯函数模型测试不会覆盖 DOM。
2. **未激活向量值的措辞。** 审读时写“演示保持未激活元素”，但 `vectorPlan` 对 inactive 元素只返回 `result:null`，没有保存旧 vd。建议说明“— 表示本次不写入；模型不保存旧 vd”，避免把空占位误解成已验证的 undisturbed 数据保留。
3. **整数输入域。** 有效测试域是合法整数。`vectorPlan({vl:1.5})` 当时返回 `vl=1.5`，但按索引判断会产生 2 个活跃元素；M/N/K 的 number 输入也未拒绝小数。建议入口统一取整或显示校验错误。浏览器 number 的默认 step 本身不会阻止 change handler 读取无效小数。

以上是发现时的状态，已分别通知前端作者；若前端随后修正，应以当前文件和浏览器验证为准。本轮独立代理只新增测试和本审计文档，未修改前端文件。

复核更新：前端作者随后将进度条改为独立 `tile-capacity-bar`，修正了未激活向量的文案，并在共享 `clamp` 中取整，M/N/K 与预算输入也经过该归一化。新增小数 vl 回归测试通过。这里确认的是代码与纯函数结果；DOM 交互的最终验证由浏览器检查完成。

## 不能从这些测试推出的结论

测试通过只说明此处声明的有限模型合同成立。它不证明所有输入有效、不证明原始 RTL 已展开或运行，也不证明缓存一致性、数值位精确、NoC 无死锁或端到端性能。对于未映射的非法参数，模型依赖调用方保证合法；网页应在入口维护同一输入合同。

# openTPU 软件与模型课程核对记录

范围：`content/software.js`；依据为本地固定快照 `91df41092f612361c5bc22f83b31d23382ffabb0` 的源码与仓库文档。核对日期：2026-11-02。所有课程源码路径相对 `openTPU/hardware/openTPU/`。

## 已完成内容

- 8 章、43 小节：软件地图、布局、编译器、ISA/依赖、数值、attention/MLP、runtime/板卡、自己实现与验证路线。
- 40 个术语，每个包含定义、当前实现、自己实现的入口及源码引用。
- 20 道带解释的选择题，3 条软件学习路线。
- 206 处源码引用；逐一检查文件存在与行号范围，0 项失败。Node.js 语法检查通过。

## 重要事实与版本差异

1. **矩阵乘法方向**：`language.py:108`、`compiler.py:1878`、`compiler.py:1928` 明确 `a[M,K] @ w[N,K].T`；结果是 `[M,N]`。
2. **对象的地址单位**：`compiler.py:236` 的 Tensor base 是字节、stride 是元素；QTensor rs/srs 是字节（`:265`）；TMEM/Tile 为 32-bit word。课程没有把三种 stride 混用。
3. **旧文档的“stationary至多8行”已不代表当前限制**：`docs/compiler.md:41` 保留旧表述；当前 `targets/ypcb-00338.toml:18` 是 ACT_ROWS=16，MCOLS=4（`:16`）；`compiler.py:680` 的 Stationary 按 chunks 管理，`compiler.py:1928` 按 chunks 产生 MM。`rowmax` 与 `acc_scale` 在 `compiler.py:1900` 仍有更严格的 M<=MCOLS 等检查。课程区分这些限制。
4. **Attention已从文档的双缓冲示例演进**：`docs/compiler.md:99` 的两块循环可作例子；当前 `kernels/attention.py:206` 的 `_attend_heads` 默认 depth=3，并可跨 head 提前发射。课程以当前代码为准，未将旧示例当作全部实现。
5. **顺序语义不等于完全串行硬件**：`docs/isa.md:25` 描述功能参考的顺序完成；`waits.py:4` 明确等待项、MM流式开始/释放两个等待点及VPU生产者mask。课程未从参考模拟器推断RTL周期。
6. **WAITC不是硬件缓存一致性**：`waits.py:26` 做访问footprint与寄存器区间的保守依赖分析；`docs/scoreboard.md` 的工作负载分析模型与此也不同。
7. **配置有多个入口**：`isasim.Config`（`:18`）是小测试默认；`target.config`（`:224`）保留目标能力；`isasim.board_config`（`:51`）支持环境覆盖且部分能力默认关闭；真实板卡能力由 `host/board.py:1300` 的 device_config 读取。课程不会把“Config默认”“设计点”“板卡m4”“m8 variant”混写。
8. **当前MX格式不等于旧survey格式**：`docs/quant.md:41`、`quant.py:510` 为当前打包与量化；按元素位数不能推断整个镜像占用恰好减半。
9. **FP32契约有所取舍**：`docs/isa.md:57` 定义 RNE、FTZ、近似复合函数及特殊值；不是完整IEEE754实现。
10. **KV cache不是CPU缓存**：`runtime.py:54` 是模型历史状态；程序和量化缓存也可能只是主机复用文件。课程不虚构coherent L1/L2或directory_controller模块。
11. **指令容量单位**：`isa.py:67` 每指令8个32-bit word；板卡 IMEM_WORDS=32768，容量为4096条指令。
12. **输出padding**：`compiler.py:1883` 的奇数stride用于bank分散；物理占用与逻辑shape分开说明。

## 实际执行的最小软件检查

环境有 NumPy，默认 Python 没有 pytest；没有安装新依赖，未运行或声称运行完整 pytest 套件。

以 `PYTHONDONTWRITEBYTECODE=1` 和本地源码 PYTHONPATH 执行小型检查，未修改上游源码，也未构建RTL：

- **Kernel end-to-end smoke**：`@ol.jit` kernel 使用 load → dot → store。Config(S=1,D=32,DRAM_BYTES=65536,TMEM_WORDS=4096)，a 为3×64的 {-1,0,1} 序列，w为5×64的 {-2,-1,0,1,2} 序列。编译得到 `LD, QACT, MM, ST, HALT`，输出shape=3×5；与独立FP64 `a @ w.T` 的最大绝对误差 **0.015748031437397003**，通过预先设定的0.03阈值。误差来自量化；此检查不表示任意输入精度已验证。
- **ISA编码往返**：一条带寄存器、UNIT、ACC的MM，经encode→decode→encode后8个word完全一致。
- **两slice collective**：各slice以V_FILL生成2×3的常量1或2，GATHER后两个slice都逐位得到2×6的 `[1,1,1,2,2,2]` 两行。

这三个定向检查支持课程示例链路，不构成完整模型质量评估、RTL一致性验证、吞吐测量或板卡实测。

## 仍需区分的边界

- 课程的“自己实现”部分是逐步建议，不能当作上游已实现或已测试的功能。
- 原仓库性能数字与设计提案仅作为阅读入口；课程没有复述为本次实测结论。
- 引用有效性检查只验证文件与行号，不自动证明自然语言正确；上述关键语义另外读过对应代码。
- 本次使用固定快照，没有更新源码或查询新commit，便于与网页其他章节保持一致。

## 交叉审阅修正：Replay 的资源生命周期

硬件代理指出原术语建议“缓存一个chunk直至所有行组完成，最后才接收下一个chunk”会误导为逐chunk停等协议。已依据 `rtl/mxu/otpu_mxu.sv:34–44` 核实并改正：保留的是整条 streamed row 的FIFO条目，group 0读但不释放，后续ACT行组重读同一组，最后group释放；issuer可在FIFO容量允许时预取后续chunk或另一命令。`:148–154` 的容量检查区分int8块数与4-bit两个块/chunk的打包，不能粗略把所有格式都写作 KB<=DEPTH。课程布局章节和Replay术语已同步更新，并新增RTL引用。

## 浏览器数值模型独立审阅

审阅 `models.js` 的 roundEven、quantize、matmul：

- roundEven 对正负半整数遵循 ties-to-even；没有发现有限小数范围内的舍入规则错误。
- quantize 是整个输入数组共用一个 absmax scale 的对称整数教学量化，并非openTPU当前MX的Sa/da子块数值，也不包含Float32 FTZ或逐次FP32舍入。输入应限定为非空有限数值数组，range应为正整数。
- matmul 计算 A @ W.T，terms可展示前K项部分和；JavaScript Number是binary64，未模拟MX整数偏移窗口、48-bit整数累加或设备FP32 epilogue。需限定非空矩形、共同K、0<=terms<=K。
- 当前这些函数没有做通用输入校验；若UI接受任意文本，不应让空数组、NaN、Infinity、不等长行或range=0进入模型。已向主代理报告，未修改其模型文件。

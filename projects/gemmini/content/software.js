/* Chinese source-reading lessons. Upstream snapshots remain unchanged. */
window.GSOFTWARE = (() => {
  const r = (repo, path, line, label) => ({repo, path, line, label});
  const t = (line, label, path = 'include/gemmini.h') => path.startsWith('rocc-software/')
    ? r('rocc', path.slice('rocc-software/'.length), line, label) : r('tests', path, line, label);
  const h = (path, line, label) => r('gemmini', 'src/main/scala/gemmini/' + path, line, label);
  const section = (id, title, html, refs) => ({id, title, html, refs});
  const chapters = [
    {
      id:'sw-contract', kicker:'SOFTWARE / 01', title:'软件与电路，怎样约定同一件事？',
      summary:'先区分编译时结构、运行时配置、两套地址空间，再追一条命令。',
      sections:[
        section('sw-generated','生成的头文件是软硬件契约',
          `<p>Gemmini 的 C 库不是把任意大小的矩阵交给一个通用黑盒。<code>gemmini_params.h</code> 把阵列维度、存储行数、数据类型与 opcode 写成编译期常量。当前收录头文件的 <code>DIM=16</code>、<code>elem_t=int8_t</code>、<code>acc_t=int32_t</code> 与默认硬件相对应；<code>full_t=int64_t</code> 是参考计算使用的更宽类型，不等于硬件累加器宽度。</p><p>生成器在 <code>Controller.scala</code> 构造时写出 <code>config.generateHeader()</code>。因此改 C 中的 DIM 只会改变软件分块与地址计算，不能让电路凭空增加 PE。真正改阵列，需要修改配置、重新展开生成硬件、更新头文件，并重新编译测试和匹配的功能模型。保存生成参数和提交号，才能复现实验。</p><p><b>自己实现：</b>将一份机器可读配置作为唯一输入，同时产生 RTL 参数与 C 头；在启动时提供能力寄存器或版本号，让驱动拒绝不匹配的二进制。该能力寄存器是建议设计，不是这里声称已有的 Gemmini 接口。</p>`,
          [h('Controller.scala',29,'生成参数头'),h('GemminiConfigs.scala',337,'opcode、维度与行数输出'),t(7,'当前软件参数','include/gemmini_params.h')]),
        section('sw-addresses','主存字节地址，与本地行地址',
          `<p><code>gemmini_mvin(A, 0)</code> 中，A 是主机可寻址的内存指针，0 是 Gemmini 本地 SRAM 的行地址。它们没有相同单位。默认一条 scratchpad 行装 16 个 INT8，16 字节；一条完整 accumulator 行装 16 个 INT32，64 字节。矩阵块占 DIM 行，所以第二个 16×16 块的本地地址通常加 16，而不是加 256。</p><p>主存行间跨度由 load/store 配置给出，单位是字节。C 高层接口的矩阵 stride 常先按元素计数，再在底层换成字节，阅读每层时都要写清单位。本地地址还含 <code>is_acc_addr</code>、<code>accumulate</code>、<code>read_full_acc_row</code> 等控制位，不是一个完全平坦的数组下标。</p><p><b>练习：</b>在纸上安排 A、B、C 各占多少行，逐个检查是否重叠；再把主存 stride 从 DIM 改成 DIM+3，说明搬运后的 SRAM 布局为何仍可紧密排列。实现驱动时用不同类型包装字节地址、本地行地址和元素 stride，能减少单位混用。</p>`,
          [t(33,'模板明确写出 row-addressed','bareMetalC/template.c'),t(209,'mvin 编码'),h('LocalAddr.scala',21,'地址元数据与 bank/row 解码')]),
        section('sw-encoding','宏如何变成 RoCC 命令',
          `<p><code>gemmini.h</code> 定义不同 funct：配置、搬入、搬出、预装载和计算。<code>gemmini_extended_mvin</code> 把主存指针放进 rs1，将 rows、cols 与本地地址打包进 rs2，再调用 <code>ROCC_INSTRUCTION_0_R_R</code>。最后 xcustom 宏通过内联汇编 <code>.insn r</code> 发出自定义指令。这里是主核读取源寄存器、向协处理器提交命令，不是 C 函数逐项执行矩阵乘法。</p><p>高层有多个参数，不代表指令拥有同样多的通用寄存器操作数；参数被压缩在位域中，或由多条配置指令先写入内部状态。读命令定义时同时看软件移位表达式与硬件 Bundle 解码，核对位宽、有符号性和保留位。</p><p><b>自己实现：</b>先画一张编码表，为每个字段规定单位、合法范围和重置值；写纯函数 encoder/decoder 做往返检查，再连接命令 FIFO。不要先堆宏，最后才猜硬件应该怎样解释。</p>`,
          [t(31,'funct 常量'),t(209,'mvin 的 rs1/rs2'),t(147,'原始 .insn 内联汇编','rocc-software/src/xcustom.h')]),
        section('sw-smallest','先读最小搬运，再读完整 matmul',
          `<p>第一条阅读路线应当是 <code>mvin_mvout</code>：初始化一块主存、设 stride、搬入、搬出、同步、逐元素比较。这样可以先排除地址和 DMA 错误，再引入乘法。第二站读 <code>template.c</code> 的单位矩阵乘法；第三站读 <code>matmul.c</code> 的 OS/WS、累加和转置组合。</p><p>当前 <code>template.c</code> 声明了局部 <code>In</code> 数组，却没有在搬入前填写它。它展示的是调用骨架。自己复制时应先用确定的整数填充输入，例如 i-j，并计算明确的参考结果，不能把未初始化值当成有效正确性用例。</p><p><b>阅读记录：</b>每条宏记四项：读哪块数据、写哪块数据、什么事件表示已提交、什么事件表示已完成。对于异步加速器，最后两项往往不同。为错误注入预留开关：错误 stride、遗漏同步、重复本地地址，各应该触发可解释的失败。</p>`,
          [t(24,'模板输入声明与搬运','bareMetalC/template.c'),t(47,'单位矩阵调用顺序','bareMetalC/template.c'),t(423,'组合测试入口','bareMetalC/matmul.c')])
      ]
    },
    {
      id:'sw-trace', kicker:'SOFTWARE / 02', title:'一次矩阵乘法，从 C 走到阵列',
      summary:'沿 C=D+A×B 分清预装载、计算、累加与输出转换，建立真正可调试的因果链。',
      sections:[
        section('sw-os','OS 路线：让部分和留在 PE',
          `<p>先看 <code>matmul.c::test_os</code>。程序把 A、B、D 分配到互不重叠的本地行区间，再依次 mvin；配置 <code>OUTPUT_STATIONARY</code> 后，preload 指定初始 D 与结果目的地，compute 把 A、B 送入计算路径。OS 的核心直觉是 PE 跨多个 k 步保存输出部分和，减少部分和在阵列内外往返。</p><p>测试还覆盖 preload_zeros、compute_preloaded 和 compute_accumulated。名字中的“preloaded”不能脱离数据流解释：OS 中预装的是输出初值，WS 中预装的通常是权重。阅读时必须同时跟踪指令的两个本地地址和 dataflow 配置，不能把一张固定的示意图套到所有模式。</p><p><b>自己推演：</b>用 2×2 的小矩阵手算每个 C[i,j] 的 k=0、k=1 部分和；再在真实 <code>PE.scala</code> 中找哪个寄存器在 OS 保存该值。网页中的缩小阵列只解释数学流动，实际延迟与握手由 Chisel 展开后的 RTL 决定。</p>`,
          [t(137,'OS 数据布局','bareMetalC/matmul.c'),t(154,'OS preload/compute','bareMetalC/matmul.c'),h('PE.scala',70,'驻留寄存器与 OS/WS 分支')]),
        section('sw-ws','WS 路线：权重驻留，部分和走向累加器',
          `<p><code>test_ws</code> 将数据流配置为 WS，并在 store 配置中指定激活和缩放。preload 的第一个地址指向 B，随后 compute 使用 A 和 D。权重驻留使同一权重能被连续输入复用，而不同 K 分块得到的输出可以继续累加到较宽的 accumulator SRAM。</p><p>观察代码如何设置 <code>C_addrs</code> 及其 accumulate 位，再看 mvout 时清除该位。这说明本地地址既携带位置也携带访问语义。相同的低位行号，配上不同高位标志，可以表示覆盖写、累加写或不同读取宽度；不能只比较 C 整数的全部位就判断“地址不同”。</p><p><b>自己实现：</b>先只支持一个固定数据流，确认 PE 内保存值、输入节拍和结果排空。支持 OS+WS 会增加控制多路选择、预装载语义、验证组合与时序压力；功能开关不是只加一位状态寄存器。</p>`,
          [t(345,'accumulate 地址标志','bareMetalC/matmul.c'),t(363,'WS 配置、预装载与计算','bareMetalC/matmul.c'),h('LocalAddr.scala',41,'同一逻辑地址的比较')]),
        section('sw-precision','宽累加完成后，何时缩回 INT8？',
          `<p>INT8×INT8 的乘积不能一直用 INT8 保存。一次 dot product 的 K 个乘积之和再加 bias，动态范围会进一步增大。默认硬件给 accumulator 32 bit，但参考计算使用 <code>full_t</code> 来避免过早丢失精度。最终输出到 elem_t 时再依据缩放、舍入、饱和、激活等规则转换。</p><p>当前参数头的 <code>ACC_SCALE</code> 执行浮点缩放、round-to-nearest-even 和 INT8 上下界裁剪；这是一份用于 C 参考行为的宏，电路如何实现要继续看硬件的缩放路径。<code>full_C</code> 决定输出是否保留较宽结果，<code>low_D</code> 决定 D 按哪种元素宽度读取；它们会改变字节偏移与合法组合。</p><p><b>练习：</b>构造一个累加结果 200 的输出，比较直接 int8 强制转换与饱和到 127 的不同。再加入 scale=0.5、负数和正好落在 .5 的情况。只验证随机小数值，很容易漏掉舍入与饱和边界。</p>`,
          [t(17,'elem/acc/full 三种类型','include/gemmini_params.h'),t(52,'舍入与饱和参考宏','include/gemmini_params.h'),t(1208,'full_C/low_D 组合限制')]),
        section('sw-transpose','数学上合法，不保证当前 API 实现全部组合',
          `<p>矩阵转置可以改变软件的地址步进，也可能需要硬件转置器调整进入脉动阵列的流序。它不是“交换两个 shape”就一定完成。低层 <code>test_os</code> 跳过只转置 B 的情况；高层 tiled API 对 OS 的转置组合限制还更严格，WS 也拒绝同时转置 A 和 B。</p><p>因此要分别标注数学运算、硬件能力、低层指令支持、高层库实现四个层次。某个下层模块存在 transposer，不表示任意上层接口都能调用任意转置。当前 C 库的显式检查比一段笼统 README 更能说明某个调用是否被实现。</p><p><b>自己实现：</b>先写布局转换的参考函数，再验证每个输入块地址和有效 rows/cols；测试非方阵、非 DIM 倍数、不同 stride。遇到不支持的组合应明确报错或走 CPU fallback，并在性能统计中记录 fallback 比例。</p>`,
          [t(45,'低层 OS 支持判断','bareMetalC/matmul.c'),t(1201,'高层 tiled 转置约束'),t(837,'转置后的主存偏移')]),
        section('sw-async','提交顺序、依赖顺序与完成顺序',
          `<p>C 程序连续发出 mvin、compute、mvout，并不表示每发一条都等前一条做完。Gemmini 将命令送入队列，ReservationStation 依据本地地址范围与资源依赖限制重排，再交给 load、execute、store 控制器。无关的搬运和计算有机会重叠；有关的数据必须等待生产者完成。</p><p><code>matmul.c</code> 在搬出请求之后调用 fence，再由主核读 C 比较结果。主核读结果之前必须建立完成与可见性关系。若在每个小块之后都人为等待，可能保留正确性却失去预取和重叠；若完全不等待，又会出现主核读旧值。</p><p><b>自己推演：</b>画一张命令依赖 DAG：LD A→EX→ST C，LD B→EX；再添加下一块 A2。指出哪些边是数据依赖、哪些是有限 SRAM/队列带来的结构限制。把这张 DAG 与 RS 的命令完成回报一起看，比按 C 行号猜时钟更可靠。</p>`,
          [t(177,'mvout 后同步','bareMetalC/matmul.c'),h('Controller.scala',346,'三类命令发射'),h('Controller.scala',443,'busy 的组成')])
      ]
    },
    {
      id:'sw-tiling', kicker:'SOFTWARE / 03', title:'分块不是细节，它决定数据复用',
      summary:'从 SRAM 行预算读自动 tiler，再区分主机循环与硬件 loop 展开器。',
      sections:[
        section('sw-tile-budget','先算容量，再谈最优分块',
          `<p>库用 tile_I、tile_J、tile_K 表示每个大块包含多少个 DIM×DIM 子块。它们不是矩阵元素数量。A 要 I×K 个子块，B 要 K×J 个子块，所以 scratchpad 行数是 <code>(I*K+K*J)*DIM</code>；C 占 accumulator 行数 <code>I*J*DIM</code>。这是读代码时最应该先复算的一对公式。</p><p>例如 DIM=16，I=2、J=3、K=4，需要 320 条 scratchpad 行和 96 条 accumulator 行。默认 INT8 scratchpad 数据量为 5120 字节，INT32 accumulator 数据量为 6144 字节。它们只是这些张量的数据量，没有计算 SRAM 宏布局、ECC、仲裁器或物理面积。</p><p><b>自己实现：</b>把候选 tile 的合法性写成可复用函数，检查行预算、单次传输限制、padding 和地址不重叠。自动选择首先要保证合法，其次才比较流量和预计时延；容量刚好塞满并不一定获得最高性能。</p>`,
          [t(1246,'scratchpad 行预算'),t(1251,'accumulator 行预算'),t(1286,'WS 双缓冲使用一半容量')]),
        section('sw-padding','尾块不整齐，谁负责补零和限界？',
          `<p><code>tiled_matmul_outer</code> 先把 I/J/K 元素维度向上补到 DIM 的倍数，再计算大块次数、最后一块的子块数及 padding_I/J/K。每次 inner 调用传入当前块的实际边界，硬件根据它避免将尾部垃圾视作有效输入或越界写出。</p><p>比如 M=17、N=19、K=21，在 DIM=16 时三个方向都需要两个子块，但边界块的有效行列远小于 16。只用 16×16 整齐矩阵验证，会让 stride、mask 和尾块错误长期潜伏。padding 不是把用户主存数组偷偷扩大；实现必须依据有效范围生成合法的 DMA 访问。</p><p><b>练习：</b>手写“元素坐标→大块坐标→子块内坐标”的映射，用 17×19×21 验证每个输出仅被写一次，并为 A/B 主存区域放置 guard bytes 检查越界。计算利用率时区分有效 MAC 和 padding 导致的内部空工作。</p>`,
          [t(729,'补齐和迭代次数'),t(739,'最后块与 padding'),t(829,'每块有效范围')]),
        section('sw-auto','auto 是启发式，不是全局性能证明',
          `<p><code>tiled_matmul_auto</code> 根据存储行数为 tile 选初值。WS 路线预留双缓冲，把可用 scratchpad 与 accumulator 行预算减半；随后尝试增加 J、I、K，直到形状或容量约束阻止增长。LAYERNORM/SOFTMAX 有专门分支，不能直接套普通 matmul 的 tile 规律。</p><p>这套策略编码了复用与容量的经验，不包含芯片上所有 bank 冲突、页表 miss、总线竞争、主核发射或 SRAM 时序细节。函数名含 auto 只能说明不用手填 tile，不表示它已经为你的形状、配置与系统负载找到最优。</p><p><b>自己做实验：</b>固定矩阵形状和硬件，仅扫描合法 tile 三元组，记录周期、RDMA/WDMA 字节、结果校验和。再与 auto 基线比较，并解释差异来自复用还是并发。没有真实 RTL/周期模型运行时，这仍是实验计划，不能在网页上把估算写成测量。</p>`,
          [t(1257,'auto tiler 入口'),t(1275,'双缓冲预算'),t(1294,'初始化和增长循环')]),
        section('sw-loop','主核的外层循环，与硬件的微命令展开',
          `<p>C 库的外层循环计算主存块地址、当前边界、bias 和最后输出；WS inner 最终发出一组 LOOP_WS 配置命令及一条 run。硬件 <code>LoopMatmul</code> 再把该描述展开成装载、预装载、计算、写出等更细命令。软件和硬件都存在 loop，但承担的粒度不同。</p><p>硬件展开器观察 load/execute/store 完成进度与队列利用率，抑制过量命令；它不是将整个三重循环在一个周期组合展开。读它应寻找循环计数器、请求寄存器、出队 fire、overloaded 和 completed，而不是只搜索某个 C 函数名。</p><p><b>自己实现：</b>先写仅发一条 LD/EX/ST 的 FSM，再加入 i/j/k 计数器，最后加入两个上下文和双缓冲。每一步保证背压时计数器与命令 bits 不提前改变；只有 accepted/fire 事件能推进发射状态，完成事件则推进依赖状态。</p>`,
          [t(708,'WS inner 发出 loop 描述'),t(366,'LOOP_WS 配置编码'),h('LoopMatmul.scala',981,'原命令与展开命令选择'),h('LoopMatmul.scala',997,'占用和完成进度反馈')]),
        section('sw-reuse','NULL 有时是复用标志，不能统一理解为零矩阵',
          `<p>外层 tiler 对 WS 检查 <code>a_reuse</code> 和 <code>b_reuse</code>；满足条件时，后续某些块的 A 或 B 指针被设为 NULL，避免再次从主存装载已有数据。与此同时 D==NULL 可能代表无 bias，某次 out==NULL 可能代表该 K 分块尚不应写出。相同 C 值在不同参数位置有不同协议含义。</p><p>这也是阅读优化库不能只凭函数签名的原因：软件约定会一路传入 LoopMatmul。要沿特定调用路径确认 NULL 被解释成跳过装载、零 bias，还是禁用输出，不能简单说“地址零会自动补零”。功能模型也区分可 zeroable 的 D 和必须有效的 A/B。</p><p><b>自己设计 API：</b>尽量使用显式枚举或 flags 表达 reuse、no_bias、defer_store，把真实地址与控制状态分开。若为了编码紧凑保留哨兵，文档和测试必须覆盖每种参数位置的含义。</p>`,
          [t(807,'复用条件'),t(818,'bias 和最后 K 分块输出'),t(843,'跳过重复装载'),r('libgemmini','gemmini.cc',84,'模型的可补零参数检查')])
      ]
    },
    {
      id:'sw-network', kicker:'SOFTWARE / 04', title:'神经网络怎样落到这些原语？',
      summary:'量化、张量布局、卷积与框架 provider 都有独立约束；支持 ONNX 不等于支持任意模型。',
      sections:[
        section('sw-quantization','量化是一份数值契约',
          `<p>一种常见量化关系是 <code>x_real ≈ s_x*(q_x-z_x)</code>。若零点均为零，整数矩阵乘加后可用 <code>s_A*s_B/s_C</code> 把结果转换到输出量化域。非零 zero-point 会产生额外修正项，不能直接把 int8 数据扔给纯乘加后期待数学自动成立。</p><p>当前 ONNX systolic 的 INT8 QLinearMatMul 路径明确要求 A、B、Y 的 zero-point 都为 0，并要求 scale 是标量或单元素向量；它计算 real_multiplier，再交给 SystolicMultiply。因此此路径没有声称支持任意非对称或逐通道量化。</p><p><b>自己实现：</b>先写高精度量化参考：零点扣除、宽乘加、bias 尺度、舍入、饱和与激活的顺序逐项确定。测试正负边界和多层累积误差，再决定硬件提供什么转换原语。数值一致性是架构接口的一部分，不只是精度统计。</p>`,
          [r('onnx','onnxruntime/core/providers/systolic/math/quantize_linear_matmul.cc',42,'zero-point 与 scale 检查'),r('onnx','onnxruntime/core/providers/systolic/math/quantize_linear_matmul.cc',80,'输出 scale 合成'),t(68,'C 侧饱和缩放参考','include/gemmini_params.h')]),
        section('sw-convolution','卷积降低成复用问题，而非只换公式',
          `<p>卷积每个输出位置、每个输出通道，都对输入通道与 kernel 空间做归约。可把输出位置合成 GEMM 的 I，输出通道作 J，kernel 面积×输入通道作 K。但显式 im2col 会复制输入、增加内存流量；Gemmini 库还提供专用卷积 tiler 和 LOOP_CONV_WS 描述，在硬件中组织滑窗、边界、stride、padding、pooling 等。</p><p>读卷积应先固定一种布局，并写出输入坐标、权重坐标和输出坐标的仿射关系，再看每个转换开关。默认路径、depthwise、首层优化和 dilation 都可能不同。不能因工程有一个 LoopConv 文件，就假设每一种算子布局都共享完全一样的执行路径。</p><p><b>自己实现：</b>第一版用小图像显式 im2col 接已验证 GEMM，作为 oracle；第二版减少中间复制；第三版才融合 pooling 或激活。比较时同时报告内存占用与字节流量，防止把转换开销从计时区间移走后得出误导结论。</p>`,
          [t(384,'LOOP_CONV_WS 的参数编码'),t(1374,'卷积分块函数'),t(13,'卷积参数结构','include/gemmini_nn.h'),h('LoopConv.scala',13,'卷积展开边界结构')]),
        section('sw-provider','ONNX provider 怎样接入算子',
          `<p>ONNX Runtime 的 execution provider 注册可承接的 kernel、类型与 opset；图划分根据 capability 将节点交给 provider，再由对应 kernel 读取 tensor、shape 和量化参数。当前仓库用 <code>SYSTOLIC_INT8</code> / <code>SYSTOLIC_FP32</code> 条件编译控制不同 kernel 注册，还注册了部分融合规则。</p><p>所以“模型能被 ONNX 表示”“provider 注册了这个算子”“当前硬件配置支持该数据类型”“所有节点都由加速器执行”是四个不同问题。CPU fallback 可以让端到端程序运行，但也可能成为总时间主因；只报告一个 GEMM 的峰值不能代表模型速度。</p><p><b>源码路线：</b>先读 systolic_execution_provider 的注册表，再读 quantize_linear_matmul::Compute，跟进 SystolicMultiply 和 C 库。为自己的 backend 先支持一两个稳定算子；明确 shape、dtype、量化和布局约束，保留可诊断的 unsupported 信息。</p>`,
          [r('onnx','onnxruntime/core/providers/systolic/systolic_execution_provider.cc',26,'按类型与 opset 注册'),r('onnx','onnxruntime/core/providers/systolic/systolic_execution_provider.cc',111,'capability 和融合规则'),r('onnx','onnxruntime/core/providers/systolic/math/quantize_linear_matmul.cc',29,'QLinearMatMul 入口')]),
        section('sw-end-to-end','先验证一层，再组合完整网络',
          `<p><code>gemmini_nn.h</code> 的封装可在同一层调用后生成 CPU gold 并逐项比较。ResNet50 示例在层级上选择 WS、OS 或 CPU，组织卷积、matmul 与残差等操作。这使调试能从“最终分类不对”缩小到“第一处偏离参考的张量”。</p><p>真实网络性能还受到中间张量搬运、非矩阵算子、布局转换、主核调度和模型大小影响。算子融合可以减少往返，但同时扩大数值与控制验证范围。IGELU、SOFTMAX、LAYERNORM 等分支也具有特定整数量化与存储限制，不要因为名字相同就默认与任意框架浮点算子逐位一致。</p><p><b>自己的验收：</b>逐层存输出摘要，保存输入、scale 与配置，定位首次误差；记录加速算子覆盖率、fallback 时间、DMA 字节与端到端延迟。页面描述的是可执行的学习路线，本次没有编译运行该神经网络或测得其性能。</p>`,
          [t(90,'逐层 CPU 对照','include/gemmini_nn.h'),t(24,'网络执行模式选择','imagenet/resnet50.c'),t(1214,'归一化相关容量限制')])
      ]
    },
    {
      id:'sw-verification', kicker:'SOFTWARE / 05', title:'把“看懂”变成可复查的实验',
      summary:'先选对二进制与模拟器，再做数值、边界、并发和性能的分层验证。',
      sections:[
        section('sw-build','baremetal、pk 和 Linux 不是三个文件后缀而已',
          `<p>测试工程为不同运行环境生成不同目标。baremetal 通常没有完整系统调用与虚拟内存环境；pk 提供简化的代理内核环境，但堆空间受限；Linux 需要相应用户态与系统镜像。一个二进制在某个环境失败，可能是启动、内存或系统调用问题，而不是矩阵计算错误。</p><p><code>build.sh</code> 使用 autoconf/configure，并依据 Linux 交叉编译器是否存在决定是否只构建 baremetal。Makefile 列出具体测试与头文件依赖；部分 RUNNER 路线还主动过滤不支持或耗时很长的测试。因此“make 通过”不能推断全部算子、全部环境已执行。</p><p><b>实验清单：</b>提交号、配置类、生成参数头 hash、工具链、目标格式、runner 与实际命令都要保存。先跑一条输入固定的搬运测试，再跑小 GEMM，最后扩大形状；不要把全 Chipyard 依赖下载与已经完成可构建环境混为一谈。</p>`,
          [t(3,'构建目标和 runner 过滤','bareMetalC/Makefile'),t(17,'按工具链选择构建范围','build.sh'),r('gemmini','README.md',61,'运行环境与限制')]),
        section('sw-spike','Spike 回答功能问题，不能回答周期问题',
          `<p><code>libgemmini</code> 是 Spike 的 Gemmini 指令扩展。它根据 funct 读取主核寄存器，更新软件表示的矩阵与存储状态。适合先验证编码、地址、结果与指令序列，不需要逐拍模拟每一个 PE、SRAM bank 或 TileLink 事务。</p><p>当前模型的 <code>counter_increment_random()</code> 对内部计数器加随机值，明确只是 dummy counter 行为。即使你的程序能读出一个“counter”，也不能把它当作硬件瓶颈证据。官方 README 同样说明 Spike 不能提供准确性能或 profiling。</p><p><b>自己选择工具：</b>数学参考检查算术；ISA 模型检查命令语义；RTL 仿真检查时序、背压与资源竞争；综合与布局才能讨论面积、时序和功耗。不同层面的通过互相提供线索，但不互相替代。本网站的 JS 交互也属于缩小的教学模型。</p>`,
          [r('libgemmini','gemmini.cc',1935,'自定义指令入口'),r('libgemmini','gemmini.cc',1924,'dummy 随机计数器'),r('gemmini','README.md',84,'官方功能模拟边界')]),
        section('sw-test-matrix','构造会失败的测试，才能找到真实边界',
          `<p>正确性测试至少覆盖：1×1、DIM-1、DIM、DIM+1、非方阵；全零、单位矩阵、最大正负数、可触发饱和的 K；有/无 bias、重复 bias、合法转置、stride 大于有效列数；scratchpad/acc 地址边界；OS/WS；连续命令与资源背压。现有测试名本身就是一份可用的维度清单。</p><p><code>gemmini_testutils.h</code> 的参考 matmul 用更宽的 full_t，随后单独转换输出。构建自己的 oracle 时必须复现舍入和饱和顺序，而不是使用普通 float GEMM 后随意取整。并发测试还要检查完成标识与不相干操作不会互相污染。</p><p><b>自己实现：</b>先做短小的定向用例，把失败定位到明确契约，再加入固定随机种子的 shape/data 扫描。为越界写设置 guard，为每条命令分配调试 ID；RTL 断言守住背压稳定性、地址合法性和事务数守恒。测试清单不代表本次已运行这些上游测试。</p>`,
          [t(3,'现有测试类别','bareMetalC/Makefile'),t(30,'宽参考 matmul','include/gemmini_testutils.h'),t(118,'gold 的累加与后处理','bareMetalC/matmul.c')]),
        section('sw-performance','从理论下界，到可以解释的实测',
          `<p>默认 DIM×DIM 个 PE 每周期理想完成 DIM² 次 MAC，这是阵列工作阶段的峰值；有效 GEMM 有 M×N×K 次 MAC。两者相除只能给理想计算周期下界，尚未计入填充、排空、命令发射、搬运、TLB miss、bank 冲突与主存竞争。MAC 按一次乘加计数；若与按乘法+加法两项 operation 的 TOPS 比较，必须说明口径。</p><p><code>tiled_matmul_ws_perf.c</code> 在同步前后读 cycle，并配置 RDMA_BYTES_REC、WDMA_BYTES_SENT。正确解读要求使用真实周期模型或硬件，而非 Spike dummy counters；还要说明计时是否包含数据准备和输出检查。源码里的 utilization 是一种估算定义，不是所有时间槽 PE 有效占用的直接逐拍测量。</p><p><b>诊断顺序：</b>先验证结果；再看实际字节是否接近预期复用；看 ld/ex/st 重叠与等待原因；最后只改一个参数比较。阵列变大、bank 变多或 DMA 变宽都有系统约束，不能凭参数乘积承诺加速比。</p>`,
          [t(75,'计时和 DMA 字节计数','bareMetalC/tiled_matmul_ws_perf.c'),t(100,'ideal/utilization 的定义','bareMetalC/tiled_matmul_ws_perf.c'),h('Controller.scala',450,'三类控制器活动组合计数')])
      ]
    },
    {
      id:'sw-own-driver', kicker:'SOFTWARE / 06', title:'如果自己写一套驱动与编程模型',
      summary:'从一条可验证命令开始，逐步加入地址转换、同步、分块与框架集成。',
      sections:[
        section('sw-own-contract','第一版只需要四个操作，但要把完成定义写清',
          `<p>建议最小 ABI 包含 config、load、compute、store，并定义 busy/完成与错误状态。最初只支持固定尺寸、物理地址、单命令在途和一种数据流。CPU 准备输入、提交、等待、验证的闭环稳定后，再加入队列和并发。这个设计顺序是教学建议，不是对 Gemmini 全部现有接口的缩写。</p><p>每个操作写清读写范围、stride 单位、数据类型、对齐、所有权和何时允许复用 buffer。异步 API 返回“已接受”时，不能让调用者误以为结果可读；若支持多个在途请求，需要 tag 或明确的全局完成屏障。</p><p><b>实现步骤：</b>写编码/解码单元检查→实现一条行复制→加固定 GEMM→加宽累加/缩放→加尾块→加双缓冲。每次扩展都保持旧测试通过，并让错误可观测。不要同时修改数值格式、传输协议与并发，否则失败难以归因。</p>`,
          [t(205,'低层编码适配边界'),t(249,'preload/compute 的操作粒度'),h('Controller.scala',443,'现有 busy 组合')]),
        section('sw-barriers','三种顺序：编译器、CPU、系统可见性',
          `<p>编译器可能在 C 层重新安排普通内存访问；CPU/设备可能在架构允许范围内并行执行；缓存与 DMA 又决定不同观察者实际看见哪份数据。这三层需要分别建立契约。<code>volatile</code> 内联汇编不自动等价于通用编译器内存屏障，ISA fence 也不能凭空给一个非一致性外设加入缓存探针能力。</p><p>当前 <code>gemmini_fence()</code> 的源码是 <code>asm volatile("fence")</code>，该宏本身没有显式 <code>"memory"</code> clobber；xcustom 命令宏同样仅列寄存器操作数。这里据实描述现有代码，不能据宏名断言它在任意优化器、主核或外设连接上提供同样保证。实际完成还与 RoCC busy、主核 fence 行为和系统集成有关。</p><p><b>自己移植：</b>按编译器内联汇编规则声明真实内存副作用，按目标 ISA/平台定义提交和完成屏障，并使用 OS DMA API 或平台规定的缓存维护。检查优化后反汇编，构造 CPU 写→设备读和设备写→CPU 读的压力测试。编译器规则可对照 <a href="https://gcc.gnu.org/onlinedocs/gcc/Extended-Asm.html" target="_blank" rel="noopener">GCC Extended Asm 的 memory clobber 文档</a>；不要复制一个宏就认为所有移植问题已解决。</p>`,
          [t(309,'fence 宏的确切定义'),t(147,'自定义指令内联汇编约束','rocc-software/src/xcustom.h'),h('Controller.scala',443,'设备活动状态')]),
        section('sw-virtual','TLB flush 不是清空数据缓存',
          `<p><code>gemmini_flush</code> 是一个专用命令，处理 Gemmini 地址翻译异常/重试相关状态；它不是一条“把所有数据写回 DRAM”的命令。测试中 Linux 路径常使用 <code>mlockall</code>，目的是减少页面被换出带来的问题；锁住页面也不等价于给设备授权所有物理内存，或者自动完成缓存一致性。</p><p>Gemmini 控制器连接 FrontendTLB 与主核 PTW，并传播 flush_skip/flush_retry。阅读虚拟内存应追踪 VA、页内偏移、翻译权限、TLB 命中/未命中、PTW 请求与异常重试。页地址转换与本地 SRAM 行地址是不同问题，不能在同一张图中画成一个“地址缓存”。</p><p><b>自己实现：</b>第一版可由可信测试环境提供物理连续 buffer；进入多进程 OS 后，需要清晰的地址域/权限/生命周期，考虑进程切换与在途事务。不要把裸机功能原型直接当作安全的多租户驱动。上述是实现要求的教学范围，本网页不生成内核驱动。</p>`,
          [t(305,'专用 flush 编码'),t(424,'mlockall 和初始化','bareMetalC/matmul.c'),h('Controller.scala',174,'FrontendTLB 与 PTW'),h('Controller.scala',488,'flush skip/retry')]),
        section('sw-independent','从零实现的分阶段验收',
          `<p><b>阶段 A：数学正确。</b>用小整数、宽参考和显式舍入验证 MAC/累加器。<b>阶段 B：数据正确。</b>验证 load/store 的行/字节单位、stride、边界与响应身份。<b>阶段 C：并发正确。</b>加一个命令 FIFO、背压和完成回报，再加本地范围依赖，检查 RAW/WAR/WAW 与资源占用。</p><p><b>阶段 D：软件可用。</b>提供类型清楚的 API、能力信息、同步和错误报告，自动生成硬件对应参数。<b>阶段 E：性能可解释。</b>加入事件计数、合法 tile 搜索与数据流比较。<b>阶段 F：系统可用。</b>最后集成虚拟内存、系统互连、缓存一致性和框架算子。后一阶段不能替代前面的正确性。</p><p>沿每个阶段保存一份最小用例、波形中的完成条件和一个必须成立的不变量。读懂开源项目的目标不只是能复述模块名，而是能解释：一条错误结果在何处首次违反契约，为什么你的修改不会破坏背压、依赖和内存可见性。</p>`,
          [h('ReservationStation.scala',68,'本地地址范围与重叠检查'),h('DMA.scala',19,'传输地址、长度与事务ID'),t(1246,'分块合法性预算'),t(117,'逐层结果检查','include/gemmini_nn.h')])
      ]
    }
  ];
  const quizzes = [
    {question:'将 gemmini_params.h 的 DIM 从 16 手改为 32，会怎样？',options:['只改变软件的分块/地址假设，硬件需要重新生成才会改变','电路自动变成 32×32','只会改变显示名称'],answer:0,explanation:'DIM 由配置生成，软件和电路必须匹配；C 宏不会改变已经生成的硬件。',refs:[h('Controller.scala',29,'头文件生成'),t(8,'DIM','include/gemmini_params.h')]},
    {question:'默认 scratchpad 地址加 1，表示什么？',options:['前进一条本地行，含 DIM 个 elem_t','前进一字节','前进一个 DIM×DIM 矩阵块'],answer:0,explanation:'本地 scratchpad 是 row-addressed；一个方阵块占 DIM 行。',refs:[t(33,'地址单位','bareMetalC/template.c')]},
    {question:'mvin 的第一个地址与第二个地址如何区分？',options:['主存指针与本地行地址','两者都是主存字节地址','两者都是虚拟页号'],answer:0,explanation:'宏将 dram_addr 放入 rs1，把本地地址与 rows/cols 一同打包进 rs2。',refs:[t(209,'mvin 编码')]},
    {question:'OS 中 PE 倾向于保留什么？',options:['输出部分和','任意路由 packet','主核页表'],answer:0,explanation:'Output stationary 的复用对象是输出部分和，WS 的驻留对象则是权重。',refs:[t(38,'OS 测试','bareMetalC/matmul.c'),h('PE.scala',102,'OS PE 状态更新')]},
    {question:'当前软件 full_t 是 int64_t，说明硬件 accumulator 一定是64 bit吗？',options:['不说明，它是参考计算类型；默认 acc_t 为 int32_t','是，所有累加路径都64 bit','说明 Gemmini 只支持 FP64'],answer:0,explanation:'参考计算、阵列输出和 accumulator SRAM 类型是独立层次。',refs:[t(17,'软件数值类型','include/gemmini_params.h')]},
    {question:'INT8 输出的饱和与 C 语言强制转换是否相同？',options:['通常不同；饱和裁剪到范围边界','总是相同','只对0不同'],answer:0,explanation:'ACC_SCALE 宏包含舍入与 INT8 上下限裁剪，不能用任意窄类型转换替代。',refs:[t(68,'ACC_SCALE','include/gemmini_params.h')]},
    {question:'两个不同 K 分块计算同一个 C，为什么不能每块直接覆盖？',options:['它们贡献同一输出的部分和，需要累加','K 方向永远没有依赖','覆盖会自动触发主存累加'],answer:0,explanation:'C(i,j) 对整个 K 归约。后续 K 分块必须保留此前结果，最后一块才输出。',refs:[t(818,'分块 bias 与输出逻辑')]},
    {question:'DIM=16，tile_I=2、tile_J=3、tile_K=4 时需要多少 scratchpad 行？',options:['320','96','5120'],answer:0,explanation:'(I*K+K*J)*DIM=(8+12)*16=320 行。5120 是默认 INT8 情况的字节数。',refs:[t(1246,'scratchpad 预算')]},
    {question:'同一配置下，上题的 accumulator 行数是多少？',options:['96','320','6144'],answer:0,explanation:'I*J*DIM=2*3*16=96 行。默认每行16×4字节，总6144字节。',refs:[t(1251,'accumulator 预算')]},
    {question:'tiled_matmul_auto 的 auto 保证了什么？',options:['自动依据启发式选择合法分块；不保证全局性能最优','任何系统上都是最优 tile','已经实测全部 shape'],answer:0,explanation:'代码按容量与形状增长 tile，没有建模全部物理与系统瓶颈。',refs:[t(1308,'tile 增长循环')]},
    {question:'WS 双缓冲为什么只按一半容量选择一个工作块？',options:['另一半供重叠装载/执行的另一组数据使用','硬件另一半永久损坏','INT8 数据每个占两字节'],answer:0,explanation:'这是该库 double_buffered 路线的分区预算，不是 SRAM 总容量减少。',refs:[t(1286,'双缓冲行预算')]},
    {question:'LOOP_WS 指令是否直接包含所有乘法的组合电路？',options:['否，它配置硬件迭代器以逐步发出微命令','是，一条指令只用一个周期','它只会在 CPU 上执行三重循环'],answer:0,explanation:'LoopMatmul 保持状态，依据队列占用与完成进度逐步展开。',refs:[h('LoopMatmul.scala',981,'硬件展开路径')]},
    {question:'后续分块的 A 指针为 NULL，一定代表全零输入吗？',options:['不一定，该调用路径可用它表示复用已载入数据','一定是零矩阵','表示禁用整个阵列'],answer:0,explanation:'NULL 在 A/B、D、out 不同位置有不同协议含义，必须沿具体调用路径解释。',refs:[t(843,'A/B 复用哨兵')]},
    {question:'当前 ONNX systolic INT8 QLinearMatMul 支持任意 zero-point 吗？',options:['不支持，代码要求 A/B/Y zero-point 均为0','支持任意逐通道 zero-point','仅输入A需要非零'],answer:0,explanation:'提供器显式检查三个 zero-point 和标量 scale，不应把通用 ONNX 表达能力当成该 kernel 的实现能力。',refs:[r('onnx','onnxruntime/core/providers/systolic/math/quantize_linear_matmul.cc',42,'量化约束')]},
    {question:'Spike 上读出的 Gemmini dummy counter 能用于判断 DMA 瓶颈吗？',options:['不能；此模型通过随机数更新这些计数','能，只需增加迭代次数','能，但只测NoC'],answer:0,explanation:'libgemmini 中 counter_increment_random 明确实现随机增量，周期/性能必须换正确层次的模型。',refs:[r('libgemmini','gemmini.cc',1924,'随机计数')]},
    {question:'一组整齐的16×16用例全过，下一步最有价值的测试是什么？',options:['非DIM倍数、不同stride、边界、饱和与并发条件','只把相同矩阵重复一千次','只看代码行数'],answer:0,explanation:'整齐块难以暴露尾块 mask、越界、偏移和数据范围问题。',refs:[t(729,'尾块逻辑'),t(3,'现有测试维度','bareMetalC/Makefile')]},
    {question:'gemmini_flush 与清理 CPU 数据缓存有什么关系？',options:['它是 Gemmini TLB/翻译异常相关命令，不能当作通用缓存写回','它自动清空全部CPU缓存','它自动关闭主核页表'],answer:0,explanation:'Controller 中它连接 flush_skip/flush_retry；数据一致性属于系统内存集成问题。',refs:[h('Controller.scala',488,'flush 的实际处理')]},
    {question:'看到 asm volatile("fence")，能推断通用编译器屏障与任意DMA一致性都已解决吗？',options:['不能，需要分别核对编译器约束、主核完成规则与平台一致性','能，volatile 等于全部顺序保证','只要缓存足够大就可以'],answer:0,explanation:'当前宏无显式memory clobber；ISA顺序、编译器副作用声明和缓存可见性属于不同契约。',refs:[t(309,'fence定义'),t(147,'内联汇编操作数','rocc-software/src/xcustom.h')]},
    {question:'默认16×16阵列的256 MAC/周期意味着任意GEMM都达到峰值吗？',options:['不意味着；填充、搬运、依赖、bank与系统竞争都会降低有效吞吐','意味着，大小完全无关','只在Spike上意味着'],answer:0,explanation:'理想计算下界不包含全部开销，实际周期需测量并说明统计范围。',refs:[t(100,'理想周期估算','bareMetalC/tiled_matmul_ws_perf.c')]},
    {question:'复制 template.c 编写确定性测试前，应注意什么？',options:['先初始化 In 并生成明确参考结果','不需要初始化任何输入','删除所有fence'],answer:0,explanation:'当前模板声明 In 后直接搬入，只能作为调用骨架，不能依赖未初始化的局部数组内容。',refs:[t(25,'输入声明','bareMetalC/template.c'),t(42,'直接mvin','bareMetalC/template.c')]}
  ];
  // Deterministic rotation keeps answer positions varied while retaining the
  // original explanations. Renderers should use answer, never assume index 0.
  quizzes.forEach((q, index) => {
    const shift = index % q.options.length;
    q.options = q.options.map((_, pos, all) => all[(pos - shift + all.length) % all.length]);
    q.answer = shift;
  });
  const journeys = [
    {title:'从一段 C 开始',description:'适合熟悉软件、刚接触加速器接口的学习者。',steps:['sw-contract','sw-trace','sw-tiling','sw-verification','sw-own-driver']},
    {title:'从一个 GEMM 开始',description:'手算部分和、画命令依赖，再追阵列和存储的协作。',steps:['sw-trace','sw-tiling','sw-network','sw-verification']},
    {title:'从零实现最小加速器',description:'先守住数据和握手契约，再增加并发、系统与框架。',steps:['sw-contract','sw-own-driver','sw-tiling','sw-verification','sw-network']}
  ];
  return {chapters, quizzes, journeys};
})();

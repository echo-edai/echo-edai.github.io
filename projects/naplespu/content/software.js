/* Source-grounded course material. All paths are relative to the project root. */
window.NPU_SOFTWARE = (() => {
  const TC = 'source/software/toolchain/';
  const BE = TC + 'compiler/lib/Target/NaplesPU/';
  const CL = TC + 'compiler/tools/clang/';
  const EX = 'source/software/examples/kernels/';
  const HW = 'source/hardware/';
  const src = (path, line, label) => ({ path, line, label });
  const chapters = [
    {
      id: 'sw-isa', title: '读懂软件与硬件的契约：ISA、寄存器和 ABI', eyebrow: 'SOFTWARE 01 · THE CONTRACT',
      summary: 'ISA 规定机器可以做什么；ABI 规定编译后的函数怎样彼此合作。先区分这两个契约，后端文件、寄存器端口和启动代码才会连起来。',
      sections: [
        {
          title: '32 位指令如何同时描述标量和向量',
          paragraphs: [
            'NaplesPU 的一条机器指令是 32 bit，TableGen 基类 InstNaplesPU 的 Size 为 4。指令宽度与向量宽度是两个独立概念：一条 32-bit 指令可以要求硬件对一个 512-bit 向量执行操作，因为指令编码的是寄存器编号与操作语义，并不把所有操作数放在指令里。',
            '以 R 格式为例，最高两位标识这一格式，接下来是 6-bit opcode，目的寄存器和两个源寄存器各用 6 bit 编号。低位还包括 l、三个 fmt 位与 m 位；格式类的注释把 l 描述为 64 位模式、fmt 描述为各操作数寄存器的种类、m 描述为是否带掩码。这些字段说明一种编码可以在标量、向量和混合操作数之间复用。',
            '读 RTL 的 decode 时，应逐项核对“哪一段比特产生哪个控制字段”；读编译器时，则反过来核对“一个选中的机器指令怎样填进同一段比特”。这比只记住 add、load、barrier 等助记符更接近软硬件共同工作的原因。'
          ],
          table: { headers: ['R 格式字段', '位置', '应理解的含义'], rows: [
            ['format', '[31:30] = 00', '选择 R 类编码解释'], ['opcode', '[29:24]', '具体算术/逻辑操作'],
            ['dst / src0 / src1', '[23:18] / [17:12] / [11:6]', '寄存器索引，每个 6 bit'],
            ['l / fmt / m', '低位字段', '宽度、操作数种类和掩码控制；具体有效性须看该指令定义']
          ] },
          note: { type: 'limit', text: '编码中预留或命名了某种模式，不足以证明默认 C 语言接口、调用约定与 RTL 已完整支持该模式。64 位扩展尤其需要逐层核对。' },
          sources: [src(BE + 'NaplesPUInstrFormats.td', 664, '32-bit 指令基类'), src(BE + 'NaplesPUInstrFormats.td', 682, 'R 格式字段'), src(HW + 'src/core/decode.sv', 1, 'RTL 译码入口')]
        },
        {
          title: '64 个标量名额，64 个向量寄存器',
          paragraphs: [
            '后端把标量编号 0–57 定义为通用寄存器 S0–S57；58–63 依次是 tr、rm、fp、sp、ra、pc。也就是说，这里是 58 个普通标量名额与 6 个特殊名额。向量侧 V0–V63 共 64 个寄存器，VR512W 类包含 v16i32、v16f32 以及部分更窄元素的向量类型。',
            '一个 vec16i32 包含 16 个 32-bit 元素，总计 64 byte。后端寄存器定义中的“512”与硬件 HW_LANE=16、REGISTER_SIZE=32 相吻合。硬件线程拥有自己的架构上下文；向量的 lane 则共享一条向量操作所表达的控制语义。把一个 lane 直接叫作一个完整 CPU 线程，会误读调度与分支。',
            'getReservedRegs 将 tr、rm、fp、sp、ra、pc 标为保留寄存器，普通寄存器分配不会把它们当作任意临时值使用。查看后端实际保留集合，也能避免被旧注释或旧版 ISA 页面中的数量描述误导。'
          ],
          sources: [src(BE + 'NaplesPURegisterInfo.td', 47, '标量与向量寄存器定义'), src(BE + 'NaplesPURegisterInfo.cpp', 52, '保留寄存器集合'), src(HW + 'src/include/npu_defines.sv', 39, 'lane、寄存器与特殊编号')]
        },
        {
          title: '掩码是架构状态，不能只当成 C 的 if',
          paragraphs: [
            'rm 是掩码寄存器。启动代码把它设置为 0xFFFF，允许 16 个 lane 全部参与。C 前端提供读取、写入 mask 的 builtin，同时还有向量比较生成标量 mask 的入口。对带掩码的向量操作，某些 lane 可以不更新结果；这与一个标量条件分支选择整个线程的 PC 路径不同。',
            '理解一个掩码片段时要回答三个问题：旧 mask 保存在哪里，当前 mask 对哪些机器指令生效，执行完后如何恢复。只看 C 表达式的书写先后并不足够，编译器还可能改变不带有足够依赖约束的计算顺序；因此反汇编是检查低层控制意图的关键材料。',
            '下面是概念性写法，用于说明保存/收窄/恢复的顺序；它不是对该仓库所有优化级别的正确性承诺。实际程序仍须检查 intrinsic 的副作用建模、生成的汇编和 RTL 的 m 字段语义。'
          ],
          code: { language: 'c', text: 'int saved = __builtin_npu_read_mask_reg();\n/* predicate 是根据数据条件生成的 16-bit lane mask */\n__builtin_npu_write_mask_reg(saved & predicate);\n/* 此处执行需要受 mask 约束的向量工作 */\n__builtin_npu_write_mask_reg(saved);' },
          sources: [src(TC + 'libs/startup/src/crt0.s', 45, '启动时启用所有 lane'), src(CL + 'include/clang/Basic/BuiltinsNaplesPU.def', 17, 'mask builtin 声明'), src(TC + 'compiler/include/llvm/IR/IntrinsicsNaplesPU.td', 72, 'mask intrinsic 定义')]
        },
        {
          title: 'ABI 决定参数、返回值与调用后谁负责保留数据',
          paragraphs: [
            'CallingConv.td 将 i1/i8/i16 参数提升到 i32；非可变参数中的 i32/f32 优先进入 S0–S7。v16i32/v16f32 参数使用 V0–V7。寄存器位置用完后，标量按 4-byte 大小与对齐放到栈上，向量按 64-byte 大小与对齐放到栈上。',
            '返回值的规则单独定义，并不是照搬参数规则。被调用者保存集合包含 S50–S57、mask、frame pointer、return address，以及 V56–V63。函数可以临时使用这些寄存器，但若确实改动，必须通过序言/尾声等机制让调用者在返回后看到约定要求保留的值。',
            'FrameLowering 把栈帧尺寸按栈对齐向上取整，源码注释明确关联到 64-byte 对齐和向量块访问。于是，一个局部向量、一个跨函数存活的向量值和一个调用约定会共同决定访存：理解 ABI，才能解释程序里没有显式数组访问却出现的 spill/reload。'
          ],
          sources: [src(BE + 'NaplesPUCallingConv.td', 14, '参数和返回规则'), src(BE + 'NaplesPUCallingConv.td', 54, 'callee-saved 集合'), src(BE + 'NaplesPUFrameLowering.cpp', 46, '栈帧和向量对齐')]
        },
        {
          title: '数据类型支持以当前 target 定义为准',
          paragraphs: [
            'Clang 的 NaplesPU target 明确设置小端、32-bit int、32-bit 指针；double 与 long double 在这个头文件里也设置为 32-bit IEEE single。后端数据布局字符串为 e-m:e-p:32:32。不能把通用桌面 C 平台上 double 通常为 64 bit 的经验直接套过来。',
            '当前 libc/stdint.h 的 vec16i32、vec16f32 等 typedef 是有效定义，而 vec8i64、vec8f64 等一组 typedef 被注释。CallingConv.td 也有多处 64 位规则被注释。尽管 builtin 数据库和 RTL 类型中可见 64 位扩展的痕迹，教学上应把“发现接口/编码痕迹”和“可完整编译运行的默认功能”分开。'
          ],
          note: { type: 'fact', text: '源码事实：当前 target 的 DoubleWidth=32；这不是对 NaplesPU 所有分支或未来版本的概括。' },
          sources: [src(CL + 'lib/Basic/Targets/NaplesPU.h', 29, 'C target 类型宽度'), src(BE + 'NaplesPUTargetMachine.cpp', 54, 'LLVM 数据布局'), src(TC + 'libs/libc/include/stdint.h', 3, '向量 typedef 与被注释的 64 位类型')]
        }
      ]
    },
    {
      id: 'sw-compiler', title: '从一行 C 到硬件可读的内存镜像', eyebrow: 'SOFTWARE 02 · COMPILER WALKTHROUGH',
      summary: '完整链路是前端语义、LLVM IR、目标降低、指令选择、机器码、链接和镜像打包。每一站解决的问题不同，定位错误时必须先判断错误属于哪一站。',
      sections: [
        {
          title: '先把编译流水线的产物对上文件',
          paragraphs: [
            '示例 Makefile 引入安装目录中的 NaplesPU.mk。后者定义 --target=naplespu、-DNPU_ACCELERATOR、头文件位置和工具路径；对于 .cpp，规则先用 -S -emit-llvm 输出 .ll，再编译 .o。示例最终调用 ld.lld，带上启动代码、运行库和链接脚本，生成 .elf，然后调用 elf2hex 与 llvm-objdump。',
            '这个过程中，.ll 用来观察语言语义怎样进入 IR，.objdump 用来观察最终指令，.hex 才是仿真/内存初始化相关的镜像。它们不能互相替代：一个合法 IR 不保证已正确选择目标指令；一个可反汇编 ELF 不保证加载地址与硬件启动协议匹配。'
          ],
          table: { headers: ['阶段', '输入 → 输出', '本项目阅读位置'], rows: [
            ['前端', 'C/C++/OpenCL C → LLVM IR', 'Clang target、builtin 数据库和 CGBuiltin.cpp'],
            ['目标代码生成', 'IR / SelectionDAG → 机器指令', 'NaplesPUISelLowering.cpp、InstrInfo.td、ISelDAGToDAG.cpp'],
            ['MC / 汇编', '指令 / 符号 → 对象文件', 'AsmParser、MCTargetDesc、InstPrinter'],
            ['链接', '.o + libraries + script → ELF', 'LLD ELF/Arch/NaplesPU.cpp 与 misc/linkerscripts'],
            ['镜像与检查', 'ELF → HEX / disassembly', 'elf2hex 与 llvm-objdump']
          ] },
          sources: [src(EX + 'mmsc/Makefile', 8, '示例链接与镜像命令'), src(TC + 'misc/NaplesPU.mk', 5, '工具链命令和编译规则'), src(TC + 'misc/NaplesPU.mk', 30, 'IR 与目标对象输出')]
        },
        {
          title: '用 barrier 追踪 builtin → intrinsic → 指令',
          paragraphs: [
            '源码中的 __builtin_npu_barrier 不是普通库函数。Clang 的 builtin 数据库让前端识别它的签名，CGBuiltin.cpp 把它选择为 Intrinsic::npu_barrier；IntrinsicsNaplesPU.td 规定其 IR 参数是两个 i32、无返回值；NaplesPUInstrInfo.td 则给出 intrinsic 到 barrier 汇编形式的匹配。',
            '这条竖向路径非常适合学习定制指令：从 C 调用的类型检查，一直看到目标模式，再跳到硬件的同步操作码与处理模块。它也解释了为何单改 builtin 声明不足以“新增一条硬件指令”：声明只解决了最上面一层。',
            'flush 有相似的链路，但含义不同：它关联缓存行的数据回写/可见性，而 barrier 关联参与者的同步。示例往往同时出现二者，不代表二者可以相互替代。'
          ],
          sources: [src(CL + 'lib/CodeGen/CGBuiltin.cpp', 12500, 'barrier 与 flush 的前端生成'), src(TC + 'compiler/include/llvm/IR/IntrinsicsNaplesPU.td', 421, 'IR intrinsic 签名'), src(BE + 'NaplesPUInstrInfo.td', 721, 'barrier 指令匹配'), src(HW + 'src/include/npu_defines.sv', 235, '硬件同步/flush 操作码')]
        },
        {
          title: 'Legal、Custom、Expand 决定表达式如何落地',
          paragraphs: [
            'NaplesPUISelLowering.cpp 为不同 IR/SelectionDAG 操作和类型声明处理方式。Legal 允许直接走目标支持路径；Custom 调用目标专用降低逻辑；Expand 请求把一个操作拆成更基础的操作。这里能看到向量比较、select、标量到向量、shuffle、整数除法以及部分 64 位计算的不同处理策略。',
            '因此，C 中一次除法未必对应硬件的一条原生除法，C 中一次向量选择也未必只是“打开一个 mux”。要从类型、合法化动作和最终匹配三处共同判断。源文件中留有扩展尝试和被注释的分支，不能只通过搜索到一个操作名就判断支持程度。',
            'TargetMachine 注册 SelectionDAG 指令选择 pass；ISelDAGToDAG::Select 最后调用 TableGen 生成的 SelectCode。TableGen 负责大量声明式模式匹配，而 C++ 负责更复杂的变换和目标特殊情况。读后端时，来回切换这两种表达方式是正常的。'
          ],
          sources: [src(BE + 'NaplesPUISelLowering.cpp', 155, 'Expand/Custom 示例'), src(BE + 'NaplesPUISelLowering.cpp', 221, '64 位与向量操作的处理'), src(BE + 'NaplesPUTargetMachine.cpp', 72, '注册 SelectionDAG 选择'), src(BE + 'NaplesPUISelDAGToDAG.cpp', 110, '调用 SelectCode')]
        },
        {
          title: '寄存器索引解决不了符号地址：链接器的任务',
          paragraphs: [
            '编译一个源文件时，其他文件中的函数和全局变量地址往往还不知道。对象文件必须保存符号与重定位需求，链接器在布局确定后填入最终地址或偏移。NaplesPU 的 LLD 实现包括绝对 32-bit、branch、PC-relative memory/LEA、绝对地址高/低片段等重定位处理。',
            'relocateOne 不只是复制一个地址：它检查某些值能否装进规定宽度，然后按编码字段的位置将比特写回指令。比如 branch 处理检查 18-bit 有符号范围，而部分 memory/LEA 处理检查 9-bit 范围。机器码字段、编译器发出的重定位类型和链接器处理必须相互一致。',
            '如果新增一种寻址方式，除了 LSU/译码和 TableGen，还可能需要调整 MC code emitter、ELF 重定位枚举、LLD 范围检查与反汇编。一个“地址太远”的错误可能发生在链接阶段，不能直接归因于执行单元。'
          ],
          sources: [src(TC + 'compiler/tools/lld/ELF/Arch/NaplesPU.cpp', 37, '按位填入重定位值'), src(TC + 'compiler/tools/lld/ELF/Arch/NaplesPU.cpp', 59, '重定位种类与范围检查')]
        },
        {
          title: 'elf2hex 打包的是可加载段，不是把文件转成十六进制文本',
          paragraphs: [
            'elf2hex 检查 ELF magic、EM_NPU 目标标识和 program header。它遍历 PT_LOAD 段，根据虚拟地址与内存大小计算镜像空间，把文件中的段内容放到相应偏移。分配用 calloc，段内未由文件提供的部分保持零初始化；末尾镜像还按 64-byte cache line 向上对齐，并对额外尾部填入 0xFF。',
            '它有 -b 基址参数；基址高于某个需要加载的段时会报错。读加载失败时，要同时查看链接脚本的地址、ELF 段信息、镜像基址与 testbench 的加载方式。程序的“文件偏移”和“运行地址”不是同一个数。',
            '源文件顶部旧注释说会覆盖首字为跳转；但当前相关跳转写入代码位于注释块中。阅读这类历史工程时，真正执行的语句优先于概述注释。'
          ],
          sources: [src(TC + 'compiler/tools/elf2hex/elf2hex.cpp', 40, 'ELF 与目标检查'), src(TC + 'compiler/tools/elf2hex/elf2hex.cpp', 69, 'PT_LOAD、镜像大小和尾部对齐'), src(TC + 'compiler/tools/elf2hex/elf2hex.cpp', 114, '已注释的首字跳转逻辑')]
        }
      ]
    },
    {
      id: 'sw-runtime', title: 'main 之前与 return 之后：运行库、启动和内存布局', eyebrow: 'SOFTWARE 03 · BOOT TO MAIN',
      summary: '一个裸机 manycore 程序没有操作系统替你准备全部环境。启动汇编、链接脚本、控制寄存器和 testbench 共同定义了“程序开始”和“程序结束”。',
      sections: [
        {
          title: '库不是一个目录，而是几类不同职责',
          paragraphs: [
            'libs/libc 提供目标端的标准 C 头文件与实现；libcompiler 包含代码生成所需的辅助例程；startup 保存 crt0.s 与 vectors.s；isr 处理中断服务。misc 则保存编译 Makefile 片段与不同目标的链接脚本。区分这几层，能迅速判断一个未定义符号该从用户代码、基础库、启动文件还是链接规则中寻找。',
            '用户内核中的 main 只定义了应用逻辑。链接时还需要入口、异常/中断向量、调用约定兼容的库和有效的数据地址。把一个 .cpp 独立编译成 .o，并不意味着形成了可启动的 NaplesPU 应用。'
          ],
          sources: [src(TC + 'misc/NaplesPU.mk', 15, '启动对象与库链接位置'), src(EX + 'mmsc/Makefile', 12, '示例加入 crt0 与 vectors'), src(TC + 'libs/startup/src/vectors.s', 1, '中断向量汇编')]
        },
        {
          title: '启动首先建立架构状态，再进入应用',
          paragraphs: [
            'crt0.s 的 _start 先把线程状态设为 Booting，再把 rm 设置为全 lane 使能。它读取 tile ID 与 thread ID，并引用链接器提供的 stacks_dim、threads_per_core、stacks_base。随后，thread 0 与其他线程在初始化路径上分流：tile 0 / thread 0 执行全局构造器循环；各 tile 的 thread 0 负责 scratchpad 数据预装路径。',
            '进入 main 之前，代码从控制寄存器 12、13 取得 argc、argv，并把线程状态设为 Running。这个 argc/argv 的来源来自硬件/host 启动协议，而不是桌面操作系统的进程加载器。',
            '这是一条需要按真实汇编核对的启动路径。源文件确实计算了形如 stacks_base + ((tileID × threads_per_core) + threadID + 1) × stacks_dim 的候选栈顶到 s0，但后面的 sp/fp 加载仍引用 stacks_base。它是静态阅读时应追踪的疑点：要进一步结合 LEA 重定位语义、实际镜像与多线程运行结果确认，不能仅凭注释宣布每个线程栈已经正确分开。'
          ],
          note: { type: 'inference', text: '栈顶计算结果与随后 sp/fp 赋值不一致是可定位的静态观察。本网页没有运行目标程序，也不把这一观察直接当作已复现的运行缺陷。' },
          sources: [src(TC + 'libs/startup/src/crt0.s', 40, '启动状态与 mask'), src(TC + 'libs/startup/src/crt0.s', 48, '线程栈相关初始化'), src(TC + 'libs/startup/src/crt0.s', 75, '构造器与线程分流'), src(TC + 'libs/startup/src/crt0.s', 141, '设置 argc/argv 并调用 main')]
        },
        {
          title: 'scratchpad 的初值为何仍与 ELF 有关',
          paragraphs: [
            'libc 头文件将 __scratchpad 定义成 scratchpad 属性。链接脚本把名为 scratchpad 的输入 section 收集到独立输出 section，并放在 64-byte 对齐位置。启动路径读取 __scratchpad_data_start 和 __scratchpad_data_end，用普通内存 load 配合 scratchpad store，把预置数据搬到 scratchpad 地址空间。',
            '源码先按 64-byte 向量块复制，剩余部分再按 4 byte 和 byte 处理。由此可以建立三个层次的地址概念：ELF/主存中的初始数据位置、程序使用的 scratchpad 地址，以及硬件 LSU 实际选择的存储接口。它们相关，但不能全部叫作同一个“内存地址”。',
            'scratchpad 是软件可显式安排的数据空间，不等同于“保证会命中的 cache”。是否需要线程间同步，取决于谁负责初始化、谁开始消费以及内核如何组织；不能因为它在核内，就忽略数据生产/消费顺序。'
          ],
          sources: [src(TC + 'libs/libc/include/stdint.h', 3, '__scratchpad 属性宏'), src(TC + 'misc/linkerscripts/default.ld', 21, 'scratchpad section'), src(TC + 'libs/startup/src/crt0.s', 94, 'scratchpad 预装路径')]
        },
        {
          title: '链接脚本同时约束软件地址和硬件环境',
          paragraphs: [
            'default.ld 定义 stacks_dim=16K、stacks_base=0x80000、threads_per_core=8，随后布局向量、启动代码、普通代码、数据、scratchpad 与 bss。它把向量输出 section 的起始位置设置为 0x380，并将普通数据布局移动到 0x00800000。了解这些值，有助于解释地址日志和 dump。',
            '这里特别容易发生“只改一个参数”的错误。硬件 THREAD_NUMB、内核编译时 THREAD_NUMB、链接脚本 threads_per_core 和启动时的线程使能 mask 分属不同文件；它们不是自动由浏览器或同一个配置文件同步生成的。网页的配置探索表达关系，不会重写这些上游文件。',
            '仓库还提供其他目标的链接脚本。选择默认脚本、Nexys4DDR 或其他 host 环境时，需要核对实际板级映射与加载器约定，不能把某个脚本中的固定地址当作架构永远不变的物理事实。'
          ],
          sources: [src(TC + 'misc/linkerscripts/default.ld', 1, '栈与 section 布局'), src(TC + 'misc/NaplesPU.mk', 20, '默认链接脚本选择'), src(EX + 'mmsc/Makefile', 3, '示例软件的核/线程宏'), src(HW + 'src/include/npu_user_defines.sv', 68, '硬件线程配置')]
        },
        {
          title: 'return 不是退出进程：结果如何送回测试环境',
          paragraphs: [
            'mmsc 示例把输出数组地址作为 main 的返回值，并把结果元素数写入控制寄存器 12。启动代码在 main 返回后，把返回值写入控制寄存器 13；随后触发完成通知相关的存储/flush，把状态设置为 End，再进入自跳转循环。',
            'tb_npu.sv 读取 argv_register 与 argc_register 来报告输出位置和大小。它们在这个环境里兼作 co-simulation 元数据通道。阅读 printf 缺失的裸机程序时，如果只等串口或标准输出，可能会错过工程真正使用的结果回传机制。'
          ],
          sources: [src(EX + 'mmsc/mmsc.cpp', 34, '结果 flush、元素数和地址返回'), src(TC + 'libs/startup/src/crt0.s', 150, '返回后的状态与通知'), src(HW + 'src/tb/tb_npu.sv', 346, 'testbench 读取结果元数据')]
        }
      ]
    },
    {
      id: 'sw-kernels', title: '把算法映射到 tile、线程与向量 lane', eyebrow: 'SOFTWARE 04 · PARALLEL MAPPING',
      summary: '三层并行需要三次不同的分工。示例展示的是具体索引与同步约定，不是自动把任何 C 循环变成高吞吐 GPU 程序。',
      sections: [
        {
          title: '先读最短的矩阵乘法，再读向量卷积',
          paragraphs: [
            'mmsc 在目标分支中读取控制寄存器 0 与 2，分别当作 CORE_ID 与 THREAD_ID；在主机参考分支中，则由外层循环依次模拟每个 core/thread 的工作。相同的 matrix_mult 接收 core_id、thread_id 参数，因此可以在不运行 RTL 的情况下先手动核对分工是否覆盖全部输出。',
            '它的起始行是 core_id × N / CORE_NUMB + thread_id，结束行是 N / CORE_NUMB × (core_id + 1)，步长为 THREAD_NUMB。以 N=16、CORE_NUMB=2、THREAD_NUMB=4 为例，core 0 的 thread 0 负责行 0、4，thread 1 负责 1、5；core 1 的 thread 0 则从 8 开始。这个分工依赖 N 与核数等配置的整除关系，不能不经检查就外推到任意规模。',
            '按输出行分配工作还带来一个重要性质：在预期配置下，不同参与者对不同输出行累加，减少了对同一个输出元素竞争写入的需要。是否存在共享初始化、相邻缓存行和可见性问题，则仍要继续检查。'
          ],
          code: { language: 'cpp', text: 'int start_loop = (core_id * N / CORE_NUMB) + thread_id;\nint end_loop = N / CORE_NUMB * (core_id + 1);\nfor (int i = start_loop; i < end_loop; i += THREAD_NUMB) {\n  for (int j = 0; j < N; j++)\n    for (int k = 0; k < N; k++)\n      mult[i][j] += a[i][k] * b[k][j];\n}' },
          sources: [src(EX + 'mmsc/mmsc.cpp', 5, '目标端 ID 读取'), src(EX + 'mmsc/mmsc.cpp', 47, '主机端枚举核与线程'), src(EX + 'mmsc/mmsc.cpp', 68, '实际索引分工')]
        },
        {
          title: '向量化改变数据布局，不只是多写一个类型名',
          paragraphs: [
            'conv_layer_mvect_mt 的目标路径使用 vec16i32 数组，核心更新把 shifted_row 向量乘以一个标量卷积系数，再累加到输出向量。shuffle 改变向量内部元素的位置，接着补入相邻输入中的元素。于是一个向量寄存器中的 lane 对应相邻数据位置，而线程/tile 负责更大的行块分工。',
            '这份例子适合观察数据重用：卷积窗口每向右移动一列，需要哪些值保留，哪些值从相邻块补入？shuffle 将部分“再加载一个窗口”的动作改成寄存器内重排，但同时增加了边界条件、补值和最终输出重排。向量化的收益与正确性都来自这套布局，而不来自 vec16i32 这个单词本身。',
            '源码还区分主机标量参考路径与目标向量路径。比较时，应检查两边产生的逻辑输出位置是否一致，避免把输出布局转换本身误判成算法计算。'
          ],
          sources: [src(EX + 'conv_layer_mvect_mt/conv_layer_mvect_mt.cpp', 13, '目标向量与主机标量输出布局'), src(EX + 'conv_layer_mvect_mt/conv_layer_mvect_mt.cpp', 88, '向量卷积与 shuffle'), src(EX + 'conv_layer_mvect_mt/conv_layer_mvect_mt.cpp', 34, '输出整理和结果回传')]
        },
        {
          title: 'barrier 数的是参与者，mask 决定谁实际在运行',
          paragraphs: [
            'mmsc 在计算结束后调用 barrier(42, CORE_NUMB × THREAD_NUMB − 1)，由一个指定的 core/thread 负责 flush 和写结果元数据，然后再通过另一 barrier 汇合。barriertest 则使用 THREAD_NUMB−1，展示核内参与者数量的另一种用法。',
            '参与者数量是内核作者写入的协议数据；硬件实际启用了哪些 core/thread 则由启动掩码与仿真参数决定。如果内核等待的数量比真实参与者多，某些参与者永远不会到达；如果少了，又可能过早继续。这里最先核对的是集合是否一致，而不是猜测 barrier 模块内部运行慢。',
            '同样，16-bit lane mask 与线程 mask 属于不同层次。关闭向量中的一个 lane，并不等于让一个硬件线程不参加 barrier；反过来，停用一个硬件线程也不能通过改变某个向量数据元素来替代。'
          ],
          note: { type: 'limit', text: '网页中的同步动画用于理解事件顺序；它没有模拟消息仲裁、时钟周期、异常或所有协议状态。' },
          sources: [src(EX + 'mmsc/mmsc.cpp', 32, '跨 core/thread 的同步点'), src(EX + 'barriertest/barriertest.cpp', 18, '核内参与者参数'), src(HW + 'src/tb/tb_npu.sv', 38, '实际线程使能 mask')]
        },
        {
          title: 'barrier 与 flush 各解决什么问题',
          paragraphs: [
            'barrier 保证参与者到达某个同步点；flush 请求处理某一缓存行，让需要被 host/结果读取路径观察的数据离开仍滞留的缓存状态。示例在所有生产者完成后，由 core 0 / thread 0 以 64-byte 间隔 flush 输出，再发布输出长度。这是一段“先完成计算，再准备外部观察”的顺序。',
            'mmsc 的 C 数组有 aligned(64)，flush 循环步长是 64 / sizeof(int)。这同时连接了 C 对齐属性、元素大小和硬件缓存行宽。把循环步长直接写成元素个数 64，会遗漏行；逐元素 flush 虽可能重复同一行，也不能仅凭重复次数推导性能。',
            '缓存一致性、显式 flush 和主机接口是否 coherent 是不同问题。即使计算核之间通过目录协议保持一致，也不代表一个外部读取接口必然自动观察所有未写回的脏数据。具体规则必须沿实际 host/内存路径核对。'
          ],
          sources: [src(EX + 'mmsc/mmsc.cpp', 14, '结果数组缓存行对齐'), src(EX + 'mmsc/mmsc.cpp', 34, '按缓存行 flush 与结果发布'), src(HW + 'src/include/npu_defines.sv', 47, '向量与缓存行宽度')]
        },
        {
          title: '一个不安装工具的索引推演练习',
          paragraphs: [
            '拿一张 16×16 输出矩阵，先只按 core_id 给行着色，再按 thread_id 给各核内部的行分色。检查每一行恰好属于一个参与者；然后改变核数或线程数，查找有无空洞、重复和零工作线程。这个练习检验的是示例的索引分工，而不是硬件执行速度。',
            '接着标出每 64 byte 的缓存行边界，判断不同线程最后写入的区域是否共享同一行，再沿 barrier 与 flush 画出可见性时间线。最终把一个写 C 的问题转换成“谁写哪一地址、何时发布、谁读取”的硬件问题。',
            '最后再去看 vec16i32 卷积：把每个向量画成 16 个格子，手工执行一次 shuffle，再填入补入元素。这比直接阅读所有卷积循环更容易发现 lane 索引、行块索引和边界条件各自负责什么。'
          ],
          sources: [src(EX + 'mmsc/mmsc.cpp', 68, '索引练习依据'), src(EX + 'conv_layer_mvect_mt/conv_layer_mvect_mt.cpp', 99, 'shuffle 练习依据')]
        }
      ]
    },
    {
      id: 'sw-debug', title: '验证与调试：让每一层都给出证据', eyebrow: 'SOFTWARE 05 · EVIDENCE FIRST',
      summary: '完整理解一个处理器，既要会追踪正常路径，也要知道如何缩小错误范围。这里给出从参考结果到 RTL 信号的分层核查路线。',
      sections: [
        {
          title: '现有测试脚本实际验证哪一种等价',
          paragraphs: [
            'tools/test.sh 列出 15 个内核，先构建目标端程序，再用主机编译器构建参考程序；之后调用选定仿真器，并通过 memcheck.py 比较结果。它是应用输出层面的 co-simulation/结果比较，不是对每条指令、所有时序、所有协议交错的形式化证明。',
            '脚本会把 CORE_NUMB 与 THREAD_NUMB 注入构建，并依赖安装路径和外部仿真工具。源码中还明确留下注释：lud_float 有舍入误差，输出会与预期不同。浮点比较的容忍规则和误差来源，必须先理解，再决定一个结果差异是否表示硬件错误。',
            '本网页展示源码与概念实验；它不会后台执行 test.sh，也没有把归档时的哈希校验冒充成仿真通过。'
          ],
          sources: [src(HW + 'tools/test.sh', 164, '内核集合与浮点误差注释'), src(HW + 'tools/test.sh', 238, '目标与主机程序构建'), src(HW + 'tools/test.sh', 287, '结果比较入口')]
        },
        {
          title: '结果错了，先找到第一处错误的产物',
          paragraphs: [
            '第一层看应用：索引分工、初始化、barrier 参与者、输出长度与地址。第二层看 IR：预期的向量、builtin 与地址空间是否还存在。第三层看反汇编：目标寄存器、mask、访存宽度、调用序言和重定位结果是否符合预期。第四层才进入 RTL，观察某个已确认的机器操作在硬件中怎样被处理。',
            '这样分层的好处是，能够把“前端把 double 当 32 bit”与“FPU 对 64-bit 算错”区分开，把“加载了错误地址的镜像”与“cache 返回错误”区分开。不同层的问题可能产生相同的最终坏数字，但最早出错的产物会不同。'
          ],
          table: { headers: ['观察到的现象', '优先检查', '为何'], rows: [
            ['根本没进入 main', '入口/链接布局、HEX 基址、启动控制', '应用逻辑可能尚未执行'],
            ['只有部分行错误或没写', 'core/thread 索引、参与者 mask、配置一致性', '常见于工作分配与启动集合不匹配'],
            ['内部算对，外部读旧值', '输出 flush、发布顺序、host 读取路径', '同步完成不自动等于外部可见'],
            ['特定 builtin 无法编译', 'builtin → intrinsic → pattern 的完整链路', '源层识别不等于后端可生成'],
            ['浮点小幅差异', '类型宽度、精度、舍入与比较规则', '不要先假定逐位结果应该相同']
          ] },
          sources: [src(TC + 'misc/NaplesPU.mk', 30, 'IR 产物入口'), src(EX + 'mmsc/Makefile', 18, '反汇编产物入口'), src(TC + 'compiler/tools/elf2hex/elf2hex.cpp', 28, '镜像基址'), src(CL + 'lib/Basic/Targets/NaplesPU.h', 39, '浮点类型宽度')]
        },
        {
          title: '把一条机器指令的因果链写成检查表',
          paragraphs: [
            '选择一条简单的向量加法，记录它的 PC、线程号、源/目的寄存器和 mask。进入译码后，检查寄存器种类、操作码、执行管线选择；进入调度后，检查源是否就绪、目的是否被占用和结构资源是否可用；到回写时，再检查线程号、目的和有效 lane。',
            '这份记录应关注“同一个操作的身份如何穿过模块”：thread_id、目的寄存器和控制位如果错配，即使算术电路本身正确也会写错架构状态。遇到 rollback 时，还要分清哪些占用/写回应该撤销，不能只沿正常的正向箭头看一次。',
            '对 load 再加一层：有效地址怎样拆成 line/lane/byte，miss 如何记录与返回，返回数据对应哪一线程和哪一次请求。网页的执行流程演示为这些检查提供阅读顺序，真实周期和并发细节应通过仿真日志或波形验证。'
          ],
          sources: [src(HW + 'src/core/instruction_scheduler.sv', 37, 'scoreboard 与冒险跟踪说明'), src(HW + 'src/core/instruction_scheduler.sv', 143, 'RAW/WAW 检查'), src(HW + 'src/core/writeback.sv', 1, '写回模块'), src(HW + 'src/core/load_store_unit.sv', 1, '访存路径入口')]
        },
        {
          title: '区分四类结论，避免把教学图当运行事实',
          paragraphs: [
            '第一类是直接源码事实，例如某个宏的值、某个端口的存在和某一段比特编码。第二类是静态推导，例如由 16×32 bit 得到向量 64 byte，由缓存 sets/ways/line 计算数据容量。第三类是概念模型，例如浏览器中按步骤播放一次 cache miss。第四类是运行证据，例如某次特定参数下的仿真波形和比较结果。',
            '前两类有很强的解释力，却不能代替第四类。反过来，一次内核测试通过也不能证明所有线程交错和协议瞬态正确。学习时，为每个判断追问“它依据的是哪一种证据”，就能知道什么时候应该继续阅读，什么时候应该设计实验。'
          ],
          note: { type: 'limit', text: '本网站没有测得 IPC、频率、带宽、面积或功耗。交互控件的数字只表达明确写出的结构/容量公式，不是性能预测。' },
          sources: [src(HW + 'src/include/npu_defines.sv', 39, '直接参数与类型关系'), src(HW + 'tools/test.sh', 215, '实际应用测试入口')]
        }
      ]
    },
    {
      id: 'sw-extension', title: '如何扩展一条指令：从需求走通整个垂直切片', eyebrow: 'SOFTWARE 06 · EXTENDING THE MACHINE',
      summary: '“加一个 opcode”只是中间的一步。真正可用的扩展必须让语言语义、编码、硬件副作用、工具输出和验证用例都一致。',
      sections: [
        {
          title: '先写语义，不急着改文件',
          paragraphs: [
            '假设你希望新增一个向量操作。首先规定每个输入/输出的类型、lane 数、溢出/舍入行为、mask 对未使能 lane 的影响、是否访存、是否可能 trap，以及线程和控制寄存器的副作用。然后确定它是一个全新指令，还是现有指令组合可以实现的伪操作。',
            '如果语义涉及访存，还要规定对齐、地址空间、缓存/一致性和失败时的恢复规则；如果涉及同步，就要规定参与者和进展条件。一个名字相同而副作用定义不同的操作，可能在编译优化后与硬件行为分离。'
          ],
          bullets: ['写出最小标量/向量输入与期望输出。', '明确 mask、线程上下文和异常语义。', '决定原生指令、伪指令或运行库实现。', '先列出边界条件，再分配编码字段。'],
          sources: [src(BE + 'NaplesPUInstrFormats.td', 664, '编码与操作数描述框架'), src(TC + 'compiler/include/llvm/IR/IntrinsicsNaplesPU.td', 421, '有副作用操作的 IR 入口示例')]
        },
        {
          title: '前端与 IR：让源语言表达同一件事',
          paragraphs: [
            '如果使用 builtin，需要在 BuiltinsNaplesPU.def 声明签名，按既有机制在 Clang 代码生成中选中 LLVM intrinsic，并在 IntrinsicsNaplesPU.td 描述 IR 层的输入/输出与行为属性。使用普通算术表达式时，则可能通过已有 IR 操作和 TableGen pattern 完成，无需另造 builtin。',
            '类型和副作用是这一层的核心。若一个读控制寄存器的操作被错误地当成永远可折叠的纯函数，或一个写内存/同步操作缺失了必要依赖，优化器可能合法地进行与你的硬件意图不一致的移动与消除。不要只检查“IR 中出现了一个函数名”。'
          ],
          sources: [src(CL + 'include/clang/Basic/BuiltinsNaplesPU.def', 17, '声明式 builtin 数据库'), src(CL + 'lib/CodeGen/CGBuiltin.cpp', 12482, 'builtin 到 intrinsic 的桥'), src(TC + 'compiler/include/llvm/IR/IntrinsicsNaplesPU.td', 72, 'IR 语义声明位置')]
        },
        {
          title: '后端与 MC：选中、编码、打印、解析、反汇编',
          paragraphs: [
            '后端需要把合法化后的计算选择成机器指令，指定操作数寄存器类、隐式读写、模式匹配和机器编码。复杂类型或操作还可能要求 ISelLowering 的 Custom 路径。新增指令如果只是“能输出汇编字符串”，仍不代表对象文件的 bit pattern 已正确。',
            '随后核对 MCCodeEmitter、AsmParser、InstPrinter 与 Disassembler。理想的最小闭环是：汇编一条指令→得到预期编码→反汇编回等价的指令。若含符号地址，再增加重定位/链接检查。伪指令则必须明确在什么阶段被展开。',
            '此工程利用 TableGen 生成一部分编码/匹配代码，并在 C++ 中处理目标特例，所以检索某个生成类名时，未必会在仓库看到最终生成的 .inc 文件；其来源可能是 .td 输入。'
          ],
          sources: [src(BE + 'NaplesPUInstrInfo.td', 721, '完整 intrinsic 指令匹配示例'), src(BE + 'NaplesPUISelDAGToDAG.cpp', 110, '生成式选择器入口'), src(BE + 'MCTargetDesc/NaplesPUMCCodeEmitter.cpp', 1, '机器码发射'), src(BE + 'Disassembler/NaplesPUDisassembler.cpp', 1, '反汇编入口')]
        },
        {
          title: 'RTL：让指令参与现有调度与恢复机制',
          paragraphs: [
            'RTL 修改应覆盖编码定义、decode 控制字段、源/目的依赖、执行单元、有效信号和写回选择。如果是多周期结果，还要确保 thread_id、目的寄存器和 mask 在等待期间没有丢失，并接入结构冒险、队列满和 rollback 规则。',
            '新增操作不能绕过现有 scoreboard 就随意写寄存器；也不能只在功能单元输出正确值，却把一个错误线程号送到写回。对于 store、flush、barrier 等无普通寄存器结果的操作，仍可能存在架构副作用和完成条件。',
            '新增访存或一致性消息则进一步牵涉 cache controller、directory、network interface 和协议 ROM。此时扩展已经超出“在 ALU 多加一个 case”，应把消息生命周期与瞬态状态作为单独设计对象。'
          ],
          sources: [src(HW + 'src/include/npu_defines.sv', 1, '架构定义与操作码'), src(HW + 'src/core/decode.sv', 1, '译码'), src(HW + 'src/core/instruction_scheduler.sv', 143, '寄存器冒险'), src(HW + 'src/core/writeback.sv', 1, '写回整合')]
        },
        {
          title: '先验证垂直切片，再扩大组合',
          paragraphs: [
            '最小验证分成几层：前端接受/拒绝正确的类型；IR 保留预期语义；目标选择得到预期机器操作；汇编/反汇编编码互相对应；单指令 testbench 覆盖边界；带依赖链的程序覆盖 scoreboard 与写回；最后再放进多线程、miss、rollback 和多核环境。',
            '一个好的反例用例会故意让新指令的目的寄存器成为下一条指令的源、让多个线程同时使用它、让 mask 关闭部分 lane，并让执行单元处于忙碌或返回中。这些用例检验的是集成，而不仅是算术公式。',
            '课程中的扩展路径是阅读与设计清单；本网站不会替你修改上游 ISA，也不会把概念扩展写成已在当前版本实现的功能。'
          ],
          sources: [src(HW + 'src/tb/tb_npu.sv', 1, '系统 testbench'), src(HW + 'tools/test.sh', 164, '应用级回归集合'), src(BE + 'CMakeLists.txt', 1, '后端构建组织')]
        }
      ]
    },
    {
      id: 'sw-repro', title: '源码地图、历史版本与可重复学习', eyebrow: 'SOFTWARE 07 · REPRODUCIBILITY',
      summary: '这个项目同时有论文式架构叙述、旧 Wiki、默认分支与开发分支。建立清晰的版本坐标，是深入阅读而不被历史痕迹误导的基础。',
      sections: [
        {
          title: '为什么软件树远比自定义后端大',
          paragraphs: [
            '软件目录保留的是整个 LLVM 工具链工程，包含通用优化库、其他目标后端、Clang、LLD、大量回归测试和文档，而不是只摘录一个 NaplesPU 子目录。因此 54,755 个工具链文件不等于 54,755 个文件都需要先读。',
            '第一圈只读 Target/NaplesPU、Clang target/builtin、LLD NaplesPU、elf2hex、libs、misc 和一个示例。第二圈沿函数调用进入通用 SelectionDAG、寄存器分配和 MC 接口。第三圈才研究通用 LLVM 基础设施。这样既不丢失完整源码，又能沿可解释的依赖逐步扩展。',
            '源码浏览器中的路径是本地重新组织后的路径。硬件原有 software 目录已经归入 source/software/examples；兼容符号链接保留了硬件脚本需要的相对位置。找文件时先分清“原始仓库位置”和“当前展示位置”。'
          ],
          sources: [src('source/manifest.json', 1, '完整来源与路径映射'), src(TC + 'compiler/lib/Target/NaplesPU/CMakeLists.txt', 1, 'NaplesPU 后端构建入口'), src('source/README.md', 1, '收录布局和版本说明')]
        },
        {
          title: '三个版本坐标必须同时记住',
          paragraphs: [
            '本地硬件默认 master 展开提交是 02a73a6d94d649f368aecbbc2448f287ea8c8e97；其 toolchain gitlink 固定在 d2ebbc3a6de62848d397728bbcba6527b6773f30。本地展开的软件 master 则是 0dc20431b12eccc5e73ad39e004f7dc735762ffa，包含之后的运行库构建、链接脚本与 elf2hex 等变更。',
            '硬件 next 分支头 244d81a805752c054d611107c993d73795a113e2 包含浮点实现和仿真脚本调整，以及 vector_test 示例。它保存在硬件 bundle 中，没有替换当前展开的 master。把某篇 Wiki 或 next 的 FPU 模块名直接用来解释 master，会形成不存在的混合版本。',
            'Wiki Toolchain 页写基础 LLVM 7.0，而当前 compiler/CMakeLists.txt 声明 9.0.0。这一差异是记录下来的版本事实；网页引用某个代码路径时，优先解释当前保存的实际语句。'
          ],
          note: { type: 'fact', text: '归档日期是 2026-11-02；硬件/工具链主分支提交的日期分别在 2019/2020 年。抓取日期不是源码最近更新日期。' },
          sources: [src('source/manifest.json', 1, '提交、gitlink 与分支记录'), src(TC + 'compiler/CMakeLists.txt', 14, '当前 LLVM 版本声明'), src(HW + '.gitmodules', 1, '官方工具链子模块 URL')]
        },
        {
          title: '离线恢复原有布局，避免在学习目录上做破坏性切换',
          paragraphs: [
            '两个 upstream.bundle 保存了下载到的分支引用和可达提交历史。为了复现硬件原固定版本，可以把 bundle 克隆到一个尚不存在的新目录，再将工具链切换到 d2ebbc3。下面的命令在项目根目录执行，只创建新的工作目录，不改变当前归档。',
            '恢复后仍需要单独确认历史构建依赖和外部仿真软件。setup.sh 使用 CMake/Ninja，默认安装到 /usr/local/llvm-npu，并调用 sudo。本网站不会自动执行这些操作；对构建脚本的阅读和一次真实构建成功是两种证据。'
          ],
          code: { language: 'bash', text: 'git clone source/hardware/upstream.bundle /tmp/naplespu-study\ngit clone source/software/upstream.bundle /tmp/naplespu-study/toolchain\ngit -C /tmp/naplespu-study/toolchain checkout d2ebbc3a6de62848d397728bbcba6527b6773f30\n# 如需阅读 next，在独立硬件副本中切换到：\n# 244d81a805752c054d611107c993d73795a113e2' },
          sources: [src('source/README.md', 1, '离线恢复说明'), src(TC + 'setup.sh', 119, 'CMake 安装目录'), src(TC + 'setup.sh', 141, '安装与库构建动作')]
        },
        {
          title: '一张长期阅读卡片应该记录什么',
          paragraphs: [
            '读完一个模块，写下它的职责、输入/输出、内部状态、背压条件、完成条件、reset 行为、与线程/事务身份相关的字段，再标出上游与下游。对组合逻辑和时序逻辑分开描述；对“队列满了如何处理”和“请求被撤销后如何收尾”留出专门位置。',
            '读完一个后端文件，则记录它处理的 IR/机器表示、依赖的 TableGen 规则、生成或消费的隐式状态、以及可以观察的产物。最后选一个最小例子贯穿这张卡片，避免把职责总结写成只罗列文件名。',
            '能独立回答“某个 C 操作怎样到达某个 RTL 状态更新”和“改动此处会影响哪些契约”，比背熟所有文件名更接近深入理解。源码导航、术语、测验和概念实验的作用，都是帮助你反复建立这种因果联系。'
          ],
          bullets: ['模块卡：身份、状态、握手、完成、撤销、复位。', '编译器卡：输入表示、输出表示、类型/副作用、可观察产物。', '实验卡：假设、固定版本、输入、预期、观察和未覆盖范围。'],
          sources: [src(HW + 'src/core/instruction_scheduler.sv', 45, '模块端口与状态阅读范例'), src(BE + 'NaplesPUISelDAGToDAG.cpp', 110, '编译 pass 阅读范例')]
        }
      ]
    }
  ];
  const glossary = [
    ['ISA','Instruction Set Architecture','软件可见的指令、寄存器、编码与行为契约；它不规定某条指令必须在几个周期内完成。','sw-isa',BE+'NaplesPUInstrFormats.td',664],
    ['ABI','Application Binary Interface','函数传参、返回、寄存器保存、数据布局和栈等二进制级约定。','sw-isa',BE+'NaplesPUCallingConv.td',14],
    ['SIMD lane','Single Instruction Multiple Data lane','一条向量操作中的一个数据通道；它不等同于拥有独立 PC 的硬件线程。','sw-kernels',HW+'src/include/npu_defines.sv',39],
    ['vec16i32','16 × 32-bit integer vector','Clang ext_vector_type(16) 的 int 向量类型，总数据量为 512 bit。','sw-isa',TC+'libs/libc/include/stdint.h',9],
    ['掩码寄存器','Mask register / rm','保存向量 lane 的参与/更新控制状态；启动代码初始设置为全 lane 使能。','sw-isa',TC+'libs/startup/src/crt0.s',45],
    ['调用者/被调用者保存','Caller-saved / callee-saved','约定跨函数调用哪些寄存器值由谁负责保留。','sw-isa',BE+'NaplesPUCallingConv.td',54],
    ['spill / reload','Register spilling / reloading','寄存器压力或调用约定使值暂存到栈，再从栈恢复的代码生成行为。','sw-isa',BE+'NaplesPUFrameLowering.cpp',46],
    ['LLVM IR','Intermediate Representation','前端之后、目标机器码之前的类型化中间表示，用于优化与后续代码生成。','sw-compiler',TC+'misc/NaplesPU.mk',32],
    ['builtin','Compiler builtin','由前端特别识别的源语言入口，不一定是可链接的普通库函数。','sw-compiler',CL+'include/clang/Basic/BuiltinsNaplesPU.def',17],
    ['intrinsic','LLVM intrinsic','IR 中携带特定语义的内建操作，用于连接前端表达与后端实现。','sw-compiler',TC+'compiler/include/llvm/IR/IntrinsicsNaplesPU.td',421],
    ['TableGen','LLVM TableGen','用于声明寄存器、指令编码和匹配等信息并生成 C++ 支持代码的工具。','sw-compiler',BE+'NaplesPUInstrInfo.td',721],
    ['SelectionDAG','Selection Directed Acyclic Graph','LLVM 代码生成中使用的计算与依赖表示；本项目在此路径完成目标指令选择。','sw-compiler',BE+'NaplesPUTargetMachine.cpp',72],
    ['Custom lowering','Target-specific lowering','把某些操作交给目标专用逻辑转换的后端处理方式。','sw-compiler',BE+'NaplesPUISelLowering.cpp',164],
    ['Expand','Operation expansion','把目标不能直接处理的操作拆成更基础操作的合法化策略。','sw-compiler',BE+'NaplesPUISelLowering.cpp',221],
    ['MC 层','Machine Code layer','处理汇编、编码、对象文件、符号和反汇编等机器级表示的 LLVM 基础设施。','sw-extension',BE+'MCTargetDesc/NaplesPUMCCodeEmitter.cpp',1],
    ['重定位','Relocation','对象文件保留的地址修补需求；链接器布局确定后按目标字段填入值。','sw-compiler',TC+'compiler/tools/lld/ELF/Arch/NaplesPU.cpp',59],
    ['ELF','Executable and Linkable Format','承载代码、数据、符号和加载段信息的对象/可执行文件格式。','sw-compiler',TC+'compiler/tools/elf2hex/elf2hex.cpp',40],
    ['PT_LOAD','Loadable program segment','ELF 中要求加载进运行地址空间的 program segment；elf2hex 据此构造镜像。','sw-compiler',TC+'compiler/tools/elf2hex/elf2hex.cpp',71],
    ['elf2hex','ELF-to-memory-image tool','检查 NaplesPU ELF，并按照段地址生成适合内存初始化的镜像。','sw-compiler',TC+'compiler/tools/elf2hex/elf2hex.cpp',31],
    ['crt0','C runtime startup','在 main 前建立运行环境，并在 main 返回后执行平台相关结束流程的启动代码。','sw-runtime',TC+'libs/startup/src/crt0.s',40],
    ['链接脚本','Linker script','指定 section 布局、地址与供启动代码使用的符号的规则。','sw-runtime',TC+'misc/linkerscripts/default.ld',1],
    ['scratchpad','Software-managed scratchpad memory','程序显式安排的数据空间，具有专门属性、启动预装和硬件访问路径。','sw-runtime',TC+'libs/startup/src/crt0.s',94],
    ['barrier','Barrier synchronization','等待约定参与者到达同步点的操作；参与者数量必须与实际启动集合匹配。','sw-kernels',EX+'mmsc/mmsc.cpp',32],
    ['flush','Cache-line flush','对指定地址所在缓存行进行相关写回/可见性处理的操作，作用不同于 barrier。','sw-kernels',EX+'mmsc/mmsc.cpp',35],
    ['cache line','Cache line','缓存与一致性处理的数据块单位；此版本宽度与 16×32-bit 向量相同，为 64 byte。','sw-kernels',HW+'src/include/npu_defines.sv',47],
    ['shuffle','Vector shuffle','按索引重排向量元素的操作，卷积示例用它移动窗口并补入边缘值。','sw-kernels',EX+'conv_layer_mvect_mt/conv_layer_mvect_mt.cpp',103],
    ['scoreboard','Register dependency scoreboard','按线程记录寄存器占用/依赖，参与 RAW/WAW 和发射条件判断。','sw-debug',HW+'src/core/instruction_scheduler.sv',37],
    ['RAW / WAW','Read After Write / Write After Write','前者表示读到尚未就绪的目的，后者表示对同一目的的写入冲突。','sw-debug',HW+'src/core/instruction_scheduler.sv',143],
    ['rollback','Pipeline recovery / rollback','在规定事件下恢复执行与撤销相关在途状态的机制，应与占用和回写共同阅读。','sw-debug',HW+'src/core/rollback_handler.sv',1],
    ['co-simulation','Reference-result co-simulation','本项目脚本通过主机参考输出与 NPU 仿真结果比较来验证内核的输出行为。','sw-debug',HW+'tools/test.sh',238],
    ['Git gitlink','Pinned submodule commit','上层仓库对另一个仓库固定的提交引用；与那个仓库当前 master 可以不同。','sw-repro','source/manifest.json',1],
    ['Git bundle','Offline Git bundle','保存 Git 对象和引用的离线归档，可恢复历史和分支；不同于仅复制工作树文件。','sw-repro','source/README.md',1]
  ].map(([term,english,definition,where,path,line])=>({term,english,definition,where,source:{path,line}}));
  const quizzes = [
    {id:'q-isa-width',chapter:'sw-isa',question:'一条 32-bit 指令能否对 512-bit 向量做运算？',options:['可以，指令编码操作和寄存器编号，数据位于向量寄存器','不可以，机器指令必须容纳所有操作数','只能重复发射 16 条完全独立的标量指令'],answer:0,explanation:'InstNaplesPU 的指令大小是4 byte，而 HW_LANE×REGISTER_SIZE=512 bit。指令宽与数据通路宽是不同维度。'},
    {id:'q-reserved',chapter:'sw-isa',question:'当前后端把哪些标量编号定义为普通通用寄存器？',options:['S0–S63 全部','S0–S57；58–63 为特殊寄存器','只有 S0–S7'],answer:1,explanation:'NaplesPURegisterInfo.td 定义 S0–S57，并把58–63分别定义为 tr、rm、fp、sp、ra、pc。S0–S7是部分参数寄存器，不是全部通用寄存器。'},
    {id:'q-double',chapter:'sw-isa',question:'当前展开版本 Clang target 的 double 宽度是什么？',options:['一定64 bit，因为标准C平台都是这样','32 bit；必须按当前 target 定义理解','浏览器CPU决定它的宽度'],answer:1,explanation:'Targets/NaplesPU.h 设置 DoubleWidth=32，DoubleFormat=IEEEsingle。不能用桌面平台经验代替目标定义。'},
    {id:'q-abi-vector',chapter:'sw-isa',question:'当前调用约定中放到栈上的 v16i32 参数按什么大小/对齐安排？',options:['4 byte / 4 byte','16 byte / 16 byte','64 byte / 64 byte'],answer:2,explanation:'CallingConv.td 的 CCAssignToStack<64,64> 对应 v16i32/v16f32，与512-bit向量大小一致。'},
    {id:'q-builtin',chapter:'sw-compiler',question:'只在 BuiltinsNaplesPU.def 添加一个新名字，是否已完成硬件指令扩展？',options:['是，编译器会自动制造RTL','否，还需要语义、IR、后端、编码、RTL与验证的整合','是，只要名称以 __builtin_npu_ 开头'],answer:1,explanation:'builtin 数据库只让前端识别接口。barrier 的现有路径还经过 CGBuiltin、IntrinsicsNaplesPU.td、目标指令匹配和RTL。'},
    {id:'q-hex',chapter:'sw-compiler',question:'elf2hex 构造运行镜像最关键的 ELF 信息是什么？',options:['源文件的注释','PT_LOAD 段的地址、文件内容大小和内存大小','只需要把整个ELF逐字节打印成十六进制'],answer:1,explanation:'工具遍历可加载段，把段内容放到虚拟地址对应的镜像偏移，并处理内存大小、基址和64-byte对齐。'},
    {id:'q-return',chapter:'sw-runtime',question:'mmsc 的 main 返回一个输出数组地址，testbench 如何取得它？',options:['由操作系统读取进程退出码','启动代码把返回值写入控制寄存器13，testbench读取相关寄存器','浏览器通过localStorage读取'],answer:1,explanation:'crt0.s 在 main 返回后写控制寄存器13；mmsc写寄存器12记录元素数。tb_npu读取argv/argc寄存器作为结果元数据。'},
    {id:'q-stack',chapter:'sw-runtime',question:'只把硬件 THREAD_NUMB 从8改为4，是否可认定所有软件配置自动匹配？',options:['可以，所有配置由硬件宏自动生成','不可以，还需核对编译宏、链接脚本、启动mask和同步参与者','可以，只影响页面显示'],answer:1,explanation:'THREAD_NUMB 编译宏、default.ld 的 threads_per_core、testbench线程mask和barrier参数来自不同位置。'},
    {id:'q-rows',chapter:'sw-kernels',question:'mmsc 在 N=16、2核、每核4线程时，core0/thread1负责哪些行？',options:['1和5','1和9','所有奇数行'],answer:0,explanation:'start=0×16/2+1=1，end=8，步长4，所以是1、5。'},
    {id:'q-lane-thread',chapter:'sw-kernels',question:'关闭一个向量 lane 是否等于停用一个硬件线程？',options:['是，lane与线程是一一对应的同一概念','否，lane mask与硬件线程使能属于不同层次','仅在barrier时二者必然相同'],answer:1,explanation:'lane参与一条向量操作的数据并行；硬件线程有独立架构上下文和调度身份，barrier的参与者也不是简单的lane数。'},
    {id:'q-flush',chapter:'sw-kernels',question:'为什么 mmsc 在 barrier 后还显式 flush 输出？',options:['barrier负责同步到达，flush负责相关缓存行的写回/外部可见性','barrier与flush完全相同，只是重复调用','flush只会改变C数组的长度'],answer:0,explanation:'示例由一个指定参与者按缓存行处理输出，再发布结果元数据。同步与外部读取路径可见性是不同问题。'},
    {id:'q-proof',chapter:'sw-debug',question:'一个内核的主机参考输出与NPU仿真输出一致，能证明什么？',options:['所有输入、线程交错与一致性协议都正确','这次测试配置与输入下的已比较输出一致','已经测得峰值IPC'],answer:1,explanation:'结果比较是有价值的应用级证据，但覆盖范围由输入、配置、比较规则和运行条件决定。'},
    {id:'q-dependencies',chapter:'sw-extension',question:'为新操作增加一个多周期执行单元后，还要特别验证什么？',options:['只检查算术公式','线程号、目的寄存器、mask、资源占用、写回和rollback的对应关系','只检查模块名字是否足够短'],answer:1,explanation:'功能单元值正确不等于架构状态更新正确。长延迟操作必须在等待和恢复期间维持身份与依赖信息。'},
    {id:'q-toolchain-pin',chapter:'sw-repro',question:'硬件master固定的工具链提交与当前展开的软件master是什么关系？',options:['必然相同，子模块永远跟随最新master','不同：硬件固定d2ebbc3，当前软件展开0dc20431','只有Wiki决定实际提交'],answer:1,explanation:'gitlink固定的是具体提交。软件仓库后续提交不会自动改写硬件仓库已经保存的gitlink。'},
    {id:'q-version-evidence',chapter:'sw-repro',question:'Wiki写LLVM7.0，而当前CMake声明9.0.0，阅读当前源码应如何处理？',options:['无条件把当前代码称为LLVM7','记录版本差异，当前实现细节以保存的源码为依据','删除不一致的官方资料'],answer:1,explanation:'保留历史材料并标明差异，比混合不同版本更能支持复现和准确理解。'}
  ];
  const journeys = [
    {
      id:'journey-first-kernel',title:'路线 A · 从一个内核看懂整个闭环',audience:'熟悉 C/C++，刚接触处理器 RTL',
      steps:[
        {title:'分清 core 与 thread 的工作',description:'手动列出 mmsc 在2核×4线程时每个参与者负责的输出行。',chapter:'sw-kernels',file:EX+'mmsc/mmsc.cpp',line:68},
        {title:'沿 Makefile 找每个产物',description:'识别 .ll、.o、.elf、.hex 和 .objdump 各回答什么问题。',chapter:'sw-compiler',file:EX+'mmsc/Makefile',line:8},
        {title:'在 main 前后停下来',description:'追踪 mask、初始化、控制寄存器和输出地址如何连接testbench。',chapter:'sw-runtime',file:TC+'libs/startup/src/crt0.s',line:40},
        {title:'选择一条指令进入RTL',description:'记录线程身份、源/目的和mask，沿译码、调度、执行、回写阅读。',chapter:'sw-debug',file:HW+'src/core/instruction_scheduler.sv',line:37},
        {title:'解释结果为什么可被外部读到',description:'区分barrier与flush，并找出输出长度/地址的传递。',chapter:'sw-kernels',file:EX+'mmsc/mmsc.cpp',line:32}
      ]
    },
    {
      id:'journey-compiler',title:'路线 B · 从编译器入口深入自定义 ISA',audience:'熟悉编译原理或希望扩展指令',
      steps:[
        {title:'写下目标的数据契约',description:'核对指针、double、向量与保留寄存器，避免沿用主机平台假设。',chapter:'sw-isa',file:CL+'lib/Basic/Targets/NaplesPU.h',line:29},
        {title:'追踪barrier的竖向路径',description:'从builtin到intrinsic，再到目标指令pattern。',chapter:'sw-compiler',file:CL+'lib/CodeGen/CGBuiltin.cpp',line:12500},
        {title:'理解选择器的两种表达',description:'结合TableGen模式与C++ lowering，判断Legal/Custom/Expand。',chapter:'sw-compiler',file:BE+'NaplesPUISelLowering.cpp',line:155},
        {title:'追一处地址重定位',description:'核对符号、指令字段宽度与LLD的范围检查。',chapter:'sw-compiler',file:TC+'compiler/tools/lld/ELF/Arch/NaplesPU.cpp',line:59},
        {title:'设计一个最小扩展切片',description:'先写语义与边界，再列前端、MC、RTL和验证所需改动。',chapter:'sw-extension',file:BE+'NaplesPUInstrFormats.td',line:664}
      ]
    },
    {
      id:'journey-debug',title:'路线 C · 带着证据阅读与排错',audience:'准备运行历史工程或定位一个异常结果',
      steps:[
        {title:'固定硬件与工具链坐标',description:'核对master、next、gitlink和当前软件快照，不混用不同版本解释。',chapter:'sw-repro',file:'source/manifest.json',line:1},
        {title:'先观察测试的覆盖范围',description:'读取内核集合、浮点误差说明、构建参数与比较工具。',chapter:'sw-debug',file:HW+'tools/test.sh',line:164},
        {title:'先排除布局与启动不匹配',description:'比较链接脚本、HEX基址与启动代码，再判断是否已进入main。',chapter:'sw-runtime',file:TC+'misc/linkerscripts/default.ld',line:1},
        {title:'找最早出错的产物',description:'把应用、IR、反汇编、镜像和RTL观察分层记录。',chapter:'sw-debug',file:TC+'misc/NaplesPU.mk',line:30},
        {title:'为模块写一张阅读卡',description:'记录身份字段、状态、背压、完成、撤销与reset，不只记录文件名。',chapter:'sw-repro',file:HW+'src/core/instruction_scheduler.sv',line:45}
      ]
    }
  ];
  return { chapters, glossary, quizzes, journeys };
})();

/* RTL checkpoints added after cross-review of the hardware course and labs. */
window.NPU_SOFTWARE.quizzes.unshift(
  {id:'q-hw-tile',chapter:'hw-map',question:'默认 ID 8–13 的 tile_none 是否完全不参与系统？',options:['是，空位置不会处理任何消息','否，没有计算核，但仍有目录、NI 和 router','它们只存放软件线程的 PC'],answer:1,explanation:'tile_none 实例化 network_interface_core、directory_controller 和 router。计算功能与目录/网络服务是不同责任。'},
  {id:'q-hw-issue',chapter:'hw-scheduling',question:'一个向量源寄存器仍处于 busy 状态时，这条指令应该怎样处理？',options:['只要 FIFO 非空就立刻发射','等待依赖和资源条件满足，其他就绪线程仍可能获选','把所有其他线程同时停用'],answer:1,explanation:'instruction_scheduler 用源/目的位图与每线程 scoreboard 检查 RAW/WAW，还结合资源可用性形成 can_issue。'},
  {id:'q-hw-busy-name',chapter:'hw-scheduling',question:'当前源码 scoreboard_empty = |scoreboard 为 1，直接意味着什么？',options:['所有寄存器均不忙','至少一个 busy 位为 1，必须结合消费者解释','整个 NoC 的队列已清空'],answer:1,explanation:'归约 OR 的语义由表达式决定。barrier 相关消费者使用反值判断排空；不能从变量名字反推逻辑极性。'},
  {id:'q-hw-refill',chapter:'hw-pipeline',question:'默认 NPU tile 的取指 miss 请求与回填应该怎样追踪？',options:['请求 TC→目录；返回 NI→CC stage1 分派→TC→I-cache','请求与返回都经过数据 L1 阵列','operand_fetch 直接向 DRAM 读取每条指令'],answer:0,explanation:'tile_npu 把 tc_instr_request 接到目录；回填在 cache_controller_stage1 按 ICACHE requestor 分派。经过 L1 wrapper 的分派逻辑不等于访问 D-cache 数据阵列。'},
  {id:'q-hw-spm',chapter:'hw-memory',question:'scratchpad_memory_pipe 与共享内存 LSU 的关系是什么？',options:['SPM 是 L1 miss 之后的下一层缓存','SPM 是核内独立 banked memory 路径，具有自己的资源与冲突处理','SPM 与每个向量 lane 都是同一个寄存器'],answer:1,explanation:'顶层从 operand_fetch 分出 SPM 和 LSU；SPM 返回也参与 writeback，但它不位于数据 L1 的下游。'},
  {id:'q-hw-home',chapter:'hw-network',question:'默认 4×4 NoC 中，地址 0xA0000040 对应哪个 home directory？',options:['Tile 0，由行内偏移决定','Tile 10，由地址最高 4 位决定','Tile 15，所有目录都在内存 tile'],answer:1,explanation:'cache_controller_stage4 取地址最高 clog2(TILE_COUNT) 位。16 个 tile 需要 4 位；0xA 对应十进制 10。'},
  {id:'q-hw-payload',chapter:'hw-network',question:'NoC 的 64-bit payload 是否等于完整 flit 的总宽？',options:['是，所有 header 都包含在这64 bit里','否，flit 还包含 header 等字段','它表示有64个独立计算核'],answer:1,explanation:'npu_network_defines 将 payload 与 header 结构分开。缓存行、payload 与 flit 总宽也是不同层次的数据单位。'},
  {id:'q-hw-ownership',chapter:'hw-coherence',question:'A 和 B 共享可读同一行时，A 请求写权限为什么不能直接忽略 B？',options:['因为目录必须协调失效与所需确认，维护修改权限的约束','因为所有写操作都禁止缓存','因为 barrier 会自动把 B 的缓存从芯片上删除'],answer:0,explanation:'GETM/INV/DATA/ACK 等事务协作实现权限转换。真实协议还需处理瞬态、owner、sharer 和并发消息，不能仅看三个稳定字母。'},
  {id:'q-hw-rollback',chapter:'hw-pipeline',question:'一次恢复为什么要同时关注 PC、线程 FIFO 和 scoreboard？',options:['只改 PC，所有在途身份会自动消失','旧路径指令与占用状态必须一致处理，避免错误写回或永久依赖','恢复只改变最终输出数组大小'],answer:1,explanation:'rollback_handler 的 PC、有效位和清理位图被不同消费者使用。恢复是一组跨模块契约，而不是只改一根地址线。'},
  {id:'q-hw-latency',chapter:'hw-pipeline',question:'将 Fetch→Decode→IB→Scheduler→Operand→执行→WB 画出来，能否推出固定7周期延迟？',options:['可以，每个框严格一个周期','不能，框是模块/职责；内部级数、支路延迟、缓存等待和仲裁不同','可以，线程数量不影响任何等待'],answer:1,explanation:'模块级图用于追踪职责与数据身份。没有真实时序、请求初态和竞争信息，不能把框数当成周期数。'}
);

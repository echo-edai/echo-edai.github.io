/* 基于本地固定 openTPU 快照的人工源码核对课程。 */
window.OTPU_SW = {
  "chapters": [
    {
      "id": "sw-map",
      "title": "从 Python 程序走到一条硬件命令",
      "kicker": "SOFTWARE / 01",
      "summary": "先把语言、编译、指令语义、RTL、板卡五层分开，再把它们连接起来。",
      "sections": [
        {
          "title": "不是任意 Python 都会变成电路",
          "body": "<p><code>@ol.jit</code> 包装的是一个可被追踪的 Python kernel。追踪时，传入的张量变成带地址、形状和布局的描述符；加法、load、dot 等调用在 Builder 中产生指令。普通 Python 控制流仍在主机上执行，例如 <code>ol.static_range</code> 会展开循环。这不是把任意 Python 自动综合成 RTL，也不是先生成 LLVM IR 再交给通用 CPU。</p><p>理解时用两支笔：一支标记“此时主机正在计算常量”，另一支标记“此时向程序列表添加了设备指令”。这能解释为什么 <code>program_id()</code> 可在编译时返回 slice 编号，而设备 token 位置需要 RunVar 与地址寄存器。</p>",
          "refs": [
            {
              "path": "opentpu/language.py",
              "line": 1,
              "label": "language.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 2042,
              "label": "compiler.py"
            }
          ]
        },
        {
          "title": "五层契约：表达、存储、命令、语义、实现",
          "body": "<p>表达层是 <code>language.py</code> 的 API；存储层是 Tensor、QTensor、Tile、Stationary；命令层是 <code>isa.Instr</code>；语义层是 <code>isasim.Slice.execute</code>；实现层是 Sequencer 与各执行单元。一个操作只有在五层能够互相解释时才算读懂。</p><p>例如 <code>ol.dot(x,w)</code> 先检查 w 是 DRAM 量化矩阵，x 若在 TMEM 则插入量化，再建立 MM 指令。模拟器按同一字段读取整数、尺度和结果地址；RTL 用这些字段驱动 ACT RAM、DRAM 和 MXU。不要只从函数名字推断数据实际在哪。</p>",
          "refs": [
            {
              "path": "opentpu/language.py",
              "line": 108,
              "label": "language.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1861,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/isasim.py",
              "line": 202,
              "label": "isasim.py"
            }
          ]
        },
        {
          "title": "项目目录各自回答什么问题",
          "body": "<p><code>opentpu/kernels/</code> 回答“怎样把神经网络算子排成这些硬件动作”；<code>compiler.py</code> 回答“描述符、地址、布局和生命周期怎样降低为 ISA”；<code>isa.py</code> 回答“二进制字段如何编码”；<code>isasim.py</code> 回答“写回的每一位应该是什么”；<code>rtlsim.py</code> 负责构建、启动 RTL 仿真和收集结果；<code>host/</code> 负责真实板卡运输、控制、配置核对与运行。</p><p><code>llm/</code> 已经是模型级组织，通常不适合第一次阅读。先完成一个没有权重下载的矩阵乘法，再看 attention，最后看模型调度、程序缓存和多会话服务。</p>",
          "refs": [
            {
              "path": "opentpu/kernels/mlp.py",
              "line": 33,
              "label": "mlp.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 261,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/rtlsim.py",
              "line": 65,
              "label": "rtlsim.py"
            },
            {
              "path": "opentpu/host/board.py",
              "line": 654,
              "label": "board.py"
            }
          ]
        },
        {
          "title": "第一张手绘图：load → QACT → MM → store",
          "body": "<pre><code>DRAM fp32 x ── LD ──→ TMEM x ── QACT ──→ ACT RAM int8 + scale\nDRAM packed w + scale ───────────────────→ MM ──→ TMEM y\nTMEM y ── ST ──→ DRAM output ── 主机回读 ──→ NumPy result</code></pre><p>如果 x 已经是 Stationary，后续 dot 可复用其驻留数据；如果 w 是普通 Tensor，dot 会拒绝它，因为硬件的流式操作数有特定打包格式。上图是功能顺序，不给出周期数；实际硬件可在依赖许可下重叠独立单元。</p>",
          "refs": [
            {
              "path": "opentpu/language.py",
              "line": 69,
              "label": "language.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1863,
              "label": "compiler.py"
            },
            {
              "path": "docs/compiler.md",
              "line": 18,
              "label": "compiler.md"
            }
          ]
        },
        {
          "title": "最小阅读练习：解释每个箭头",
          "body": "<p>把一个 <code>a[2,128]</code> 与 <code>w[5,128]</code> 的例子写在纸上，预期输出是 <code>[2,5]</code>，数学表达为 <code>a @ w.T</code>。沿代码写出 DRAM 字节地址、TMEM word 地址、ACT block 和结果 stride。再查看编译器对形状的拒绝条件，故意让 K 不匹配，预测错误。</p><p>自己实现时先支持静态连续形状、单 slice 和 int8；每条指令给出前置条件、读取集合、写入集合、异常条件。等逐层结果一致后，再加分块和重叠执行。这个顺序把错误限制在最小层级。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 1878,
              "label": "compiler.py"
            },
            {
              "path": "tests/test_isa.py",
              "line": 85,
              "label": "test_isa.py"
            },
            {
              "path": "tests/test_compiler.py",
              "line": 244,
              "label": "test_compiler.py"
            }
          ]
        }
      ]
    },
    {
      "id": "sw-layout",
      "title": "布局即数据搬运：四种对象的真实含义",
      "kicker": "SOFTWARE / 02",
      "summary": "地址空间、stride、量化尺度与生命周期决定一段 kernel 能否执行。",
      "sections": [
        {
          "title": "Tensor：DRAM 的视图，不是已加载的数组",
          "body": "<p>Tensor 保存 base、shape、strides、host 和 offset。base 是字节地址，而 strides 是元素数：沿一维前进 st 个 FP32 元素时，地址增加 <code>4*st</code> 字节。切片主要构造新的描述符，既没有搬运数据，也没有自动生成缓存。</p><p>这就是为什么 <code>ol.load(desc)</code> 仍然必要。自己设计描述符时必须在字段名或类型中写清单位；“字节地址”和“32-bit word 索引”一旦混用，矩阵很小也可能恰好不崩溃，却在第二行开始读取错误数据。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 236,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 244,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 189,
              "label": "runtime.py"
            }
          ]
        },
        {
          "title": "QTensor：MXU 流式操作数的存储协议",
          "body": "<p>QTensor 指向 DRAM 中已经打包的量化矩阵，包含数据地址、尺度地址、形状、行字节步长 rs、尺度行步长 srs、D、格式 wf、块偏移 k0。当前格式包括 int8、int4、fp4 和 nvfp4；尺度记录不是一概“每块一个 float”。</p><p>列切片不等于移动一个普通连续指针：必须同时保留正确的尺度起点、k0 和格式打包约束。parts 用于把列分片单独存放，tiles 用于 V 转置缓存的 token 分块。学习时把“逻辑矩阵坐标 → 物理字节 → 对应尺度”画成三栏，避免只看 shape。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 265,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 297,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/quant.py",
              "line": 287,
              "label": "quant.py"
            }
          ]
        },
        {
          "title": "Tile：TMEM 中间值和 bank-aware stride",
          "body": "<p>Tile 是 TMEM 中的 FP32 对象，其 base 和 row stride 以 word 为单位。TMEM 的低地址位选择 bank；MXU 一次流式行输出会把多个驻留行的结果写到 <code>out + j*row_stride</code>。当行步长是 bank 数的倍数，这些地址可能落到同一个 bank，减少并行度或触发实现约束。</p><p>当前 dot 为多行、偶数 N 的新结果选择 <code>N+1</code> 的奇数 stride，并为 rowmax 预留空间。逻辑上仍是 M×N，物理上却有 padding。因此不能用 <code>M*N*4</code> 直接代表全部 TMEM 分配量。自己写布局器时应把 shape、stride、分配长度分成三个字段。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 512,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1883,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1229,
              "label": "compiler.py"
            },
            {
              "path": "docs/compiler.md",
              "line": 235,
              "label": "compiler.md"
            }
          ]
        },
        {
          "title": "Stationary：驻留是一份有所有权的资源",
          "body": "<p>Stationary 表示已经被 QACT 写入 ACT RAM 的整数操作数。它跟踪 chunks、KB、owners、PAIR 与 qranges；owners 使编译器能发现物理区被覆盖。一个 Python 变量仍在，并不意味着其底层块永远未被其他操作重用。</p><p>当前 ACT_ROWS 可以大于 MCOLS。板卡默认 ACT_ROWS=16、MCOLS=4，一条 MM 先把整条 streamed row 的 chunks/scale 放入 FIFO，各驻留行组重读同一组条目，最后一组再释放；更大的输入也可能拆成多个 chunks。旧文档写“至多 8 行”不能作为当前限制，rowmax 和 acc_scale 的限制又要单独看 dot 的检查。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 680,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1304,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1900,
              "label": "compiler.py"
            },
            {
              "path": "targets/ypcb-00338.toml",
              "line": 14,
              "label": "ypcb-00338.toml"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 34,
              "label": "Replay row retention"
            }
          ]
        },
        {
          "title": "QACT 范围影响数值与指令条数",
          "body": "<p>一个 Stationary 可以由多次 <code>quantize_into</code> 填充。每次 QACT 建立自己的量化范围及尺度；当前 dot 会按 qranges 产生 MM，并把后续部分加到已有结果。只检查最终整数矩阵的 shape 不足以还原语义，还必须知道哪些 K 块共用同一 Sa。</p><p>自己实现时，让每个量化片段携带 <code>[k0,k1)</code> 与尺度 ID；合并前验证范围连续、没有未写块、没有错误覆盖。上游 <code>Stationary.ranges()</code> 就会拒绝缺口。测试应比较“一次整体量化”和“按规定范围分次量化”的差异，而不是默认它们永远相同。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 693,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 699,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1914,
              "label": "compiler.py"
            },
            {
              "path": "tests/test_quant.py",
              "line": 199,
              "label": "test_quant.py"
            }
          ]
        },
        {
          "title": "生命周期分配：为什么临时变量命名会影响编译",
          "body": "<p>TMEM 分配以 Tile 所属 buffer 的存活为依据，使用 weakref 跟踪；next-fit 从游标后找空隙，尽量让新临时值远离最近仍在执行的地址。必要场景可用 best-fit 重试。ACT RAM 则在仍存活的 Stationary 占用之外做 round-robin 搜索。</p><p>一些融合只对未命名的临时值生效，防止把调用者还会使用的中间结果改写。不要把 Python 垃圾回收理解为硬件执行已经结束：物理读写冲突仍由依赖机制排序。自己写第一版可用显式 free 和固定 buffer，验证正确后再实现 liveness。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 484,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1245,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1279,
              "label": "compiler.py"
            },
            {
              "path": "tests/test_compiler.py",
              "line": 290,
              "label": "test_compiler.py"
            }
          ]
        }
      ]
    },
    {
      "id": "sw-lowering",
      "title": "编译器微观：一次追踪怎样生成程序",
      "kicker": "SOFTWARE / 03",
      "summary": "不需要先读完两千行；抓住描述符、地址、分配、发射、收尾五个关口。",
      "sections": [
        {
          "title": "从 Kernel.trace 到每个 slice 的程序",
          "body": "<p>runtime 先将参数放入 DRAM 并构造每个 slice 的绑定参数，再对 s=0…S−1 分别调用 trace。追踪期间 Builder 知道当前 sid 和 S，所以 SPMD 的 <code>program_id()</code> 是编译时值。相同 kernel 函数可以在不同 slice 产生不同的静态地址和 shard 行为。</p><p>自己写一个最小编译器时，不必一开始建立复杂优化 IR。可以先用“操作对象列表 + 明确布局 + 指令构造函数”，保留源位置，把每个操作与输出指令一一对应。上游 Instr.src 也记录 kernel 源栈，便于 profiler 追踪来源。</p>",
          "refs": [
            {
              "path": "opentpu/runtime.py",
              "line": 198,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 2042,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/isa.py",
              "line": 76,
              "label": "isa.py"
            }
          ]
        },
        {
          "title": "Affine：让循环只占一个硬件 body",
          "body": "<p>Affine 表示常量与若干循环变量、运行时变量的线性组合，例如 <code>base + i*block*4</code>。编译器为合适的系数模式分配地址寄存器，循环末尾发射 ADDI，硬件指令读取寄存器加立即数。它不是任意表达式求值器：描述符大小若依赖循环且不能静态确定，就可能被拒绝。</p><p>自己实现时先写出标准形式 <code>c + Σ ai*vi</code>，对键排序并合并系数，再做寄存器共用。必须处理循环退出的恢复和寄存器归零，否则第一次迭代正确、第二次错误是最典型症状。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 174,
              "label": "compiler.py"
            },
            {
              "path": "docs/compiler.md",
              "line": 74,
              "label": "compiler.md"
            },
            {
              "path": "tests/test_compiler.py",
              "line": 12,
              "label": "test_compiler.py"
            },
            {
              "path": "tests/test_compiler.py",
              "line": 72,
              "label": "test_compiler.py"
            }
          ]
        },
        {
          "title": "ol.range 与 static_range 的代价不同",
          "body": "<p><code>static_range(n)</code> 在主机展开，程序大小随 n 增长；<code>ol.range(n)</code> 追踪一次 body 并生成 LOOP，节省 IMEM，但带来地址寄存器、可变状态和循环边界约束。循环中要更新硬件 tile，使用 <code>t.set(value)</code>；给 Python 名字重新赋值往往只是改变追踪对象。</p><p>比较同一个小循环的反汇编：展开版有几份 LD/MM，硬件循环版有几个 LOOP/ADDI？再观察 TMEM 峰值和 IMEM words。选择不是“循环越少越好”，而是在程序容量、寄存器压力与可调度性之间取舍。</p>",
          "refs": [
            {
              "path": "opentpu/language.py",
              "line": 12,
              "label": "language.py"
            },
            {
              "path": "docs/compiler.md",
              "line": 74,
              "label": "compiler.md"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1983,
              "label": "compiler.py"
            },
            {
              "path": "tests/test_isa.py",
              "line": 25,
              "label": "test_isa.py"
            }
          ]
        },
        {
          "title": "局部融合是少搬一次数据",
          "body": "<p>融合并不是一句抽象的“更快”：<code>exp2(a-b)</code> 可以成为 EXP2SUB，省去差值 Tile 的写回和重读；RMSNorm 的平方求和可变成 RSSQ；<code>quantize(x*cscale)</code> 可在量化单元内融合列缩放；MM 的 RMAX 在结果排出时顺便得到行最大值。</p><p>这些规则只在检查满足时触发。一个中间值若被用户命名并复用，就不能随意消除。自己添加融合时先写等价条件、别名条件、生命周期条件和数值舍入顺序；“数学等价”不保证逐位相同，尤其 add/mul 不是任意可结合的实数运算。</p>",
          "refs": [
            {
              "path": "opentpu/compiler.py",
              "line": 1403,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1635,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1665,
              "label": "compiler.py"
            },
            {
              "path": "tests/test_compiler.py",
              "line": 271,
              "label": "test_compiler.py"
            }
          ]
        },
        {
          "title": "怎么增加一个自己的算子",
          "body": "<p>建议从已有 ISA 可组合的算子开始，例如 <code>y=x*x+b</code>：写一个 ol kernel，检查形状和广播，反汇编确认 load/VOP/store，再与独立参考函数比较。下一步尝试把它融合成新 VOP：先定义 opcode/字段/舍入顺序，再加 isasim、RTL、编码往返和边界向量，最后才让 compiler 发射它。</p><p>最有价值的测试是“新算子应满足的契约”，如广播边界、alias、±0、极值、长度不是 lane 整数倍、读写重叠。只复制实现算法写另一份同样循环，很容易让相同错误同时存在于实现和测试。</p>",
          "refs": [
            {
              "path": "opentpu/isa.py",
              "line": 440,
              "label": "isa.py"
            },
            {
              "path": "opentpu/isasim.py",
              "line": 202,
              "label": "isasim.py"
            },
            {
              "path": "tests/test_isa.py",
              "line": 60,
              "label": "test_isa.py"
            },
            {
              "path": "tests/test_compiler.py",
              "line": 172,
              "label": "test_compiler.py"
            }
          ]
        }
      ]
    },
    {
      "id": "sw-isa",
      "title": "ISA、指令模拟器与依赖：哪些行为必须一致",
      "kicker": "SOFTWARE / 04",
      "summary": "功能顺序与硬件并行并不冲突；模拟器回答结果，RTL 回答时序。",
      "sections": [
        {
          "title": "每条指令占 8 个 32-bit word",
          "body": "<p>Instr.encode 将 opcode 放在 w0 低 8 bit，四个寄存器编号各占 4 bit，flags 放在高 8 bit，后接 w1…w7。每条指令因此是 256 bit，即 32 字节。IMEM_WORDS=32768 表示 32768 个 32-bit word，即 4096 条指令，而不是 32768 条指令。</p><p>自己设计 ISA 时，先固定字节序、符号解释、保留位、寄存器零值和非法字段的处理；再写 encode/decode 的往返测试。字段空间用完后的兼容成本很高，文档中的单位必须可直接用于 loader 长度检查。</p>",
          "refs": [
            {
              "path": "opentpu/isa.py",
              "line": 67,
              "label": "isa.py"
            },
            {
              "path": "opentpu/isasim.py",
              "line": 26,
              "label": "isasim.py"
            },
            {
              "path": "targets/ypcb-00338.toml",
              "line": 23,
              "label": "ypcb-00338.toml"
            },
            {
              "path": "tests/test_isa.py",
              "line": 17,
              "label": "test_isa.py"
            }
          ]
        },
        {
          "title": "R0、运行时参数与设备计算值",
          "body": "<p>机器有 16 个 32-bit 标量寄存器，R0 读取为零；启动参数进入 R8…R15。RunVar 把运行时值及其系数映射到参数寄存器，地址用寄存器加立即数；DevVar 则表示由设备运算得到的寄存器值。参数寄存器也会与循环地址寄存器争用有限资源。</p><p>这解释了为什么同一模型换一种布局后可能“寄存器不够”，即使 TMEM 还有空间。自己实现时给寄存器显式角色与存活区间，避免仅按递增编号分配；循环内释放的寄存器尤其要检查下一次迭代是否仍会使用其旧初值。</p>",
          "refs": [
            {
              "path": "docs/isa.md",
              "line": 28,
              "label": "isa.md"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 67,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 97,
              "label": "compiler.py"
            },
            {
              "path": "tests/test_compiler.py",
              "line": 86,
              "label": "test_compiler.py"
            }
          ]
        },
        {
          "title": "顺序语义不是整台机器只能做一件事",
          "body": "<p>isa.md 用“每条指令完成后下一条开始”描述可观察的功能结果；isasim 也主要按指令推进。但当前 RTL 的依赖控制和多执行单元允许安全重叠。读性能时必须回到 Sequencer、目标 SEQ_WC、unit 完成和 TMEM/DRAM 冲突，不能把参考模型当成周期模型。</p><p>自己实现时先做完全顺序核：发射一条，等待 done，再发下一条。通过对照后再加入多个 in-flight 槽，把每条命令的读写 footprint 作为依赖依据。这是一条可验证的演进路线；直接从并行窗口开始很难定位首次错误。</p>",
          "refs": [
            {
              "path": "docs/isa.md",
              "line": 25,
              "label": "isa.md"
            },
            {
              "path": "opentpu/isasim.py",
              "line": 133,
              "label": "isasim.py"
            },
            {
              "path": "opentpu/waits.py",
              "line": 4,
              "label": "waits.py"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 1,
              "label": "otpu_seq.sv"
            }
          ]
        },
        {
          "title": "WAITC：把保守依赖分析搬到软件",
          "body": "<p>当前目标启用 SEQ_WC。<code>waits.py</code> 为每条指令建立旁路的 64-bit wait entry：多个 4-bit 计数用于有序单元的生产者距离，VPU 用 mask 指定可能乱序完成的生产者。MM 的流式预取与释放还区分不同等待点，不能只等待一个全局 busy。</p><p>分析以寄存器区间与访问 footprint 保守覆盖可能地址，循环需要达到固定点。保守会损失并行度，漏掉依赖则会破坏正确性。该机制不是缓存一致性协议，也不是 docs/scoreboard.md 的工作负载估算模型。自己写第一版可先实现确定地址的 RAW/WAR/WAW，再逐步处理循环与运行时地址。</p>",
          "refs": [
            {
              "path": "opentpu/waits.py",
              "line": 4,
              "label": "waits.py"
            },
            {
              "path": "opentpu/waits.py",
              "line": 26,
              "label": "waits.py"
            },
            {
              "path": "targets/ypcb-00338.toml",
              "line": 29,
              "label": "ypcb-00338.toml"
            },
            {
              "path": "docs/scoreboard.md",
              "line": 1,
              "label": "scoreboard.md"
            }
          ]
        },
        {
          "title": "GATHER、BAR 与全局等待",
          "body": "<p>slice 的 DRAM 是私有的；跨 slice 通信通过显式 collective。模拟器遇到 BAR 或 GATHER 会把 slice 标成等待，由 Machine 统一推进匹配的 collective。语言层 all_gather 把各 slice 的 Tile 沿最后一维拼接并复制到所有 slice；all_reduce 当前由 gather 后的 VOP 加法组成。</p><p>自己实现时要规定参与者集合、相同 collective 的匹配方式、目标地址一致性与完成条件。不能让一个 slice 永远跳过 collective 而其他 slice 等待它。测试应包含不同 slice 到达时间、地址解析差异和错序 collective，而不是只看两份相同程序。</p>",
          "refs": [
            {
              "path": "opentpu/language.py",
              "line": 123,
              "label": "language.py"
            },
            {
              "path": "opentpu/language.py",
              "line": 132,
              "label": "language.py"
            },
            {
              "path": "opentpu/isasim.py",
              "line": 145,
              "label": "isasim.py"
            },
            {
              "path": "tests/test_isa.py",
              "line": 121,
              "label": "test_isa.py"
            }
          ]
        }
      ]
    },
    {
      "id": "sw-numeric",
      "title": "量化、整数积与 FP32：数值也是架构的一部分",
      "kicker": "SOFTWARE / 05",
      "summary": "少搬字节要付出怎样的精度与元数据代价？必须沿当前 MX 格式回答。",
      "sections": [
        {
          "title": "不是简单的 float 除以一个 scale",
          "body": "<p>当前 MX 格式在行尺度之下使用块或子块的结构化尺度。int8 元素配合行 FP32 Sw 和块偏移；fp4/int4 还含子块乘数；nvfp4 使用其规定的 E2M1/E4M3 记录。4-bit 两个元素可打包进一个字节，但整体模型占用还包含尺度、对齐、KV 和其他表。</p><p>因此“从 int8 变 fp4 等于全部显存正好减半”不成立。用 <code>row_bytes</code> 与 <code>scale_bytes</code> 计算实际格式字节，再在固定模型、上下文与目标上比较。旧 survey 结果和当前 MX 生产格式必须按版本区分。</p>",
          "refs": [
            {
              "path": "docs/quant.md",
              "line": 41,
              "label": "quant.md"
            },
            {
              "path": "opentpu/quant.py",
              "line": 287,
              "label": "quant.py"
            },
            {
              "path": "opentpu/quant.py",
              "line": 292,
              "label": "quant.py"
            },
            {
              "path": "opentpu/quant.py",
              "line": 510,
              "label": "quant.py"
            }
          ]
        },
        {
          "title": "激活量化的范围会改变误差",
          "body": "<p>QACT 把 TMEM FP32 转成 ACT RAM 整数及尺度；当前激活有每个 QACT 范围的行 Sa 和 D/4 子块偏移。若一个很大的离群值与许多小值共用尺度，小值可用的整数等级会减少。改变分块、按 head 分片或融合缩放时，要同步改变参考仿真中的量化范围。</p><p>自己写量化器可先实现对称 int8：求绝对最大值、建立非零 scale、按明确规则舍入并饱和，然后逐个加入零行、极值、±0 与子块。不要直接使用语言默认 round，必须核实负半整数、溢出与 NaN 的处理。</p>",
          "refs": [
            {
              "path": "docs/quant.md",
              "line": 61,
              "label": "quant.md"
            },
            {
              "path": "opentpu/quant.py",
              "line": 672,
              "label": "quant.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1534,
              "label": "compiler.py"
            },
            {
              "path": "tests/test_quant.py",
              "line": 122,
              "label": "test_quant.py"
            }
          ]
        },
        {
          "title": "矩阵积为何需要逐位参考",
          "body": "<p>MXU 先进行整数相关计算，再按规定尺度恢复并以 FP32 写回。不同实现在累加顺序、截断、偏移窗口和 epilogue 处可能产生不同结果。上游的 <code>mx_matmul</code> 及 isasim 不是随便一次 NumPy matmul 的替代名，而是当前数值契约的参考实现。</p><p>自己写时至少保留三个结果：理想 FP32、按设备格式重建后的浮点参考、设备规定顺序的逐位参考。第一个量化精度，第二个算法对照，第三个抓 RTL 实现错误。三者不能混成一个“误差小于某阈值”。</p>",
          "refs": [
            {
              "path": "opentpu/quant.py",
              "line": 726,
              "label": "quant.py"
            },
            {
              "path": "opentpu/isasim.py",
              "line": 243,
              "label": "isasim.py"
            },
            {
              "path": "tests/test_isa.py",
              "line": 85,
              "label": "test_isa.py"
            },
            {
              "path": "tests/test_quant.py",
              "line": 173,
              "label": "test_quant.py"
            }
          ]
        },
        {
          "title": "FP32 运算不是完整 IEEE 754 实现",
          "body": "<p>当前契约固定 roundTiesToEven，输入和输出的 denormal 会 flush-to-zero；没有完整的异常标志与多舍入模式；倒数、平方根相关函数和指数采用规定近似。因此读到“FP32”时应理解存储格式和这里明确的算术规则，不能自动推出所有 IEEE 754 行为。</p><p>softmax 使用 exp2，系数与运算序列固定；<code>x*1 + -0</code> 的零符号等细节也是逐位对照的一部分。自己实现浮点流水线时从独立加法器、乘法器和边界向量开始，再组合复合函数。数学恒等变换可能改变舍入结果。</p>",
          "refs": [
            {
              "path": "docs/isa.md",
              "line": 57,
              "label": "isa.md"
            },
            {
              "path": "docs/isa.md",
              "line": 81,
              "label": "isa.md"
            },
            {
              "path": "opentpu/fp32.py",
              "line": 1,
              "label": "fp32.py"
            },
            {
              "path": "tests/test_fp.py",
              "line": 1,
              "label": "test_fp.py"
            }
          ]
        },
        {
          "title": "判断量化改动是否值得：四种比较",
          "body": "<p>第一，设备与设备数值契约逐位参考比较，用来找实现错误。第二，量化后的模型与未量化模型比较，用来评估格式损失。第三，固定 token 上下文逐步比较 logits，避免一次 token 分叉导致后续输入也不同。第四，再测实际周期、流量和墙钟时间，区分设备算力与主机编译开销。</p><p>不应从一个小矩阵误差推出完整模型质量，也不应只从生成速度推出回答质量。源码里的 validate 工具和量化测试提供入口；本课程中的公式和交互只是教学计算，不声称重新测量了上游模型结果。</p>",
          "refs": [
            {
              "path": "tools/validate.py",
              "line": 1,
              "label": "validate.py"
            },
            {
              "path": "tests/test_quant.py",
              "line": 37,
              "label": "test_quant.py"
            },
            {
              "path": "docs/quant.md",
              "line": 41,
              "label": "quant.md"
            },
            {
              "path": "docs/benchmarks.md",
              "line": 1,
              "label": "benchmarks.md"
            }
          ]
        }
      ]
    },
    {
      "id": "sw-attention",
      "title": "从 Attention 到整层模型：数据复用怎样写进代码",
      "kicker": "SOFTWARE / 06",
      "summary": "沿 scores、online softmax、P·V、归一化逐步还原，不背一个抽象黑盒。",
      "sections": [
        {
          "title": "QK 与 PV 使用同一个 dot，但布局不同",
          "body": "<p>QK 阶段：query 量化后驻留 ACT RAM，K 的 token 行从 DRAM 流入，得到 score Tile。PV 阶段：softmax 概率经过量化后驻留，V 的转置布局流入，得到 head 输出。数学里这两个矩阵乘法很接近，物理存储需求却不同。</p><p>KV cache 的 K 更适合按 token 行，V 为 PV 读取而转置并可能按 token tile 存储。量化后的 V token scale 被折进 P 的量化，VT 可以作为 UNIT 流。自己写时先选固定 head_dim、固定 block 和单 head，再检查追加一个 token 后的四个区域：K、K scale、VT、V scale。</p>",
          "refs": [
            {
              "path": "opentpu/kernels/attention.py",
              "line": 112,
              "label": "attention.py"
            },
            {
              "path": "opentpu/kernels/attention.py",
              "line": 157,
              "label": "attention.py"
            },
            {
              "path": "opentpu/kernels/attention.py",
              "line": 184,
              "label": "attention.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 148,
              "label": "runtime.py"
            }
          ]
        },
        {
          "title": "Online softmax 只保留 m、l、acc",
          "body": "<p>每个块先得到局部 scores，再更新最大值 <code>m_new=max(m, block_max)</code>，用 <code>alpha=2^(m-m_new)</code> 修正之前的累积；当前块概率 <code>p=2^(score-m_new)</code>。随后 <code>l=alpha*l+sum(p)</code>、<code>acc=alpha*acc+p·V</code>，最终输出 acc/l。</p><p>不必保留整个 T×T attention 矩阵，这减少 TMEM 需求。代码的 acc_scale 把旧 acc 的修正放进 MM epilogue，避免额外完整读写。自己实现可先用实数/FP64 验证公式，再使用项目 FP32 规则；还要覆盖尾块全 mask 与所有值为负的情况。</p>",
          "refs": [
            {
              "path": "opentpu/kernels/attention.py",
              "line": 120,
              "label": "attention.py"
            },
            {
              "path": "opentpu/kernels/attention.py",
              "line": 184,
              "label": "attention.py"
            },
            {
              "path": "opentpu/language.py",
              "line": 108,
              "label": "language.py"
            }
          ]
        },
        {
          "title": "软件流水：当前实现可用 depth=3 多缓冲",
          "body": "<p>当前 <code>_attend_heads</code> 默认 depth=3，预先把后续若干 score block 发出去，在其他 buffer 上完成 softmax 和 PV。它还能跨 head 提前准备 queries，让不同依赖链重叠。旧 compiler.md 的两块循环是一个讲解例子，不能替代当前源代码的全部调度。</p><p>buffer 数量增加会延长 Tile 和 Stationary 的存活，消耗 TMEM/ACT RAM，并可能压低可容纳 query 行数。自己写流水线时先给每个 buffer 写清“生产者、消费者、最后一次读取、可重用时点”；仅交替两个数组名字并不保证没有覆盖。</p>",
          "refs": [
            {
              "path": "opentpu/kernels/attention.py",
              "line": 206,
              "label": "attention.py"
            },
            {
              "path": "opentpu/kernels/attention.py",
              "line": 237,
              "label": "attention.py"
            },
            {
              "path": "opentpu/kernels/attention.py",
              "line": 259,
              "label": "attention.py"
            },
            {
              "path": "docs/compiler.md",
              "line": 99,
              "label": "compiler.md"
            }
          ]
        },
        {
          "title": "因果 mask 与尾块是正确性路径",
          "body": "<p>Attention 不只是快速的满块路径。Bucket 处理运行时长度的最后部分，Additive 用 −0 和 −inf 的预置 score Tile 配合 MM ACC/RMAX，RowMasks 为 packed prefill 的每组 query 行给出不同可见 token 范围。尾部概率要补零到 D 的要求，以免把填充位置计入结果。</p><p>自己验证时用非常小的两三行矩阵逐项列出可见位置；分别测 block−1、block、block+1、cache 末端和第一 token。先确保“被 mask 的 token 权重严格为零”，再观察优化是否保持与未优化路径相同。</p>",
          "refs": [
            {
              "path": "opentpu/kernels/attention.py",
              "line": 9,
              "label": "attention.py"
            },
            {
              "path": "opentpu/kernels/attention.py",
              "line": 27,
              "label": "attention.py"
            },
            {
              "path": "opentpu/kernels/attention.py",
              "line": 55,
              "label": "attention.py"
            },
            {
              "path": "opentpu/kernels/attention.py",
              "line": 196,
              "label": "attention.py"
            }
          ]
        },
        {
          "title": "Decode、Prefill、Batch 为什么遇到不同瓶颈",
          "body": "<p>单 token decode 的矩阵行数小，很多权重字节只服务少量乘法；prefill 把多个 token 行放在一起，可复用同一次流式权重读取，但会消耗更多 TMEM 和 ACT RAM，并需要正确因果 mask；batch 也可增加独立行，却有不同会话、KV 和公平性约束。</p><p>增加 MCOLS 主要增加并行处理驻留行的能力，不会凭空增加 DRAM 带宽。增加 ACT_ROWS 可用 replay 复用权重，但每个流式 chunk 也需要更多处理拍。自己做性能模型应先数权重字节、KV 字节、算术次数、驻留行和 TMEM 峰值，再和 RTL 周期或板卡计数器比较，不能把理论峰值当作 tok/s。</p>",
          "refs": [
            {
              "path": "docs/isa.md",
              "line": 13,
              "label": "isa.md"
            },
            {
              "path": "opentpu/llm/prefill.py",
              "line": 1,
              "label": "prefill.py"
            },
            {
              "path": "opentpu/llm/batch.py",
              "line": 1,
              "label": "batch.py"
            },
            {
              "path": "opentpu/kernels/mlp.py",
              "line": 33,
              "label": "mlp.py"
            }
          ]
        },
        {
          "title": "SwiGLU MLP：shard、分块和 collective 在一处相遇",
          "body": "<p>MLP 先得到 gate 与 up 两个投影，向量单元计算激活函数及逐点乘，再进入 down 投影。当前 swiglu_down 可把下一个 chunk 的 gate/up MM 提前发射；多 slice 通过 all_gather 汇总各 slice 的中间片段，再累加 down 的对应列片。</p><p>F chunk 受 D、权重格式、TMEM 容量、量化范围和 epilogue 吞吐共同约束。自己写一个两 slice 版本时，先用整数小矩阵手算每个 slice 负责的 F 范围，再标记 gather 后的拼接位置；最常见错误是把“按输出行分片”和“按归约维列分片”混为一谈。</p>",
          "refs": [
            {
              "path": "opentpu/kernels/mlp.py",
              "line": 8,
              "label": "mlp.py"
            },
            {
              "path": "opentpu/kernels/mlp.py",
              "line": 33,
              "label": "mlp.py"
            },
            {
              "path": "opentpu/kernels/mlp.py",
              "line": 56,
              "label": "mlp.py"
            },
            {
              "path": "opentpu/kernels/mlp.py",
              "line": 93,
              "label": "mlp.py"
            }
          ]
        }
      ]
    },
    {
      "id": "sw-runtime",
      "title": "运行时与板卡：程序以外还有一半系统",
      "kicker": "SOFTWARE / 07",
      "summary": "从参数布局、启动、配置核对到回读，构造一条可复现的执行链。",
      "sections": [
        {
          "title": "Host 参数怎样变成各 slice 的 DRAM 镜像",
          "body": "<p>runtime Input 被复制到各 slice；Weight 可以完整复制，也能按行或列分片，且每份在放置时量化；Output 分配结果位置；KVCache 把 head 按 slice 分配。<code>place</code> 产生 DRAM images、布局记录和每个 slice 的参数描述符，编译与回读依赖同一份元数据。</p><p>DRAM 分配按 ALIGN=128 对齐，并检查容量。教学时不要对默认板卡 4 GiB 配置随意创建全尺寸零镜像：第一次执行宜显式用小 Config，避免只是为了一个小算子就分配大量主机内存。</p>",
          "refs": [
            {
              "path": "opentpu/runtime.py",
              "line": 25,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 79,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 102,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 123,
              "label": "runtime.py"
            }
          ]
        },
        {
          "title": "compile、launch、collect 是三个不同阶段",
          "body": "<p><code>compile_kernel</code> 放置参数并追踪程序；<code>run</code> 选择 ISA 或 RTL 后端；<code>collect</code> 根据 store 记录恢复主机输出，并能发现输出中从未被写入的元素。launch 只是编译再运行的便利封装。</p><p>自己设计 runtime 时保留可独立保存的“程序 + 数据镜像 + Config + 元数据”。这样同一输入可以送入 ISA、RTL 和板卡比较，而不是每个后端偷偷重新量化或重新分配，导致测试实际上比较了不同问题。</p>",
          "refs": [
            {
              "path": "opentpu/runtime.py",
              "line": 198,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 255,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 261,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/runtime.py",
              "line": 266,
              "label": "runtime.py"
            }
          ]
        },
        {
          "title": "三种配置入口不能互换",
          "body": "<p><code>Config()</code> 是小型语义测试默认值，D=32、MCOLS=8、DRAM=1 MiB；<code>target.config()</code> 返回目标声明的真实架构与可选特性；<code>board_config()</code> 还支持环境覆盖，部分可选特性默认关闭。真实板卡则由 device_config 从 bitstream 信息读取。</p><p>当前 YPCB 默认 m4：S=1、D=128、MCOLS=4、ACT_ROWS=16、TMEM=65536 words、IMEM=32768 words。m8 改为 MCOLS=8 与 TMEM=131072 words。不要把设计点、板卡、仿真默认值和 variant 的数字混在一个“默认架构”表里。</p>",
          "refs": [
            {
              "path": "opentpu/isasim.py",
              "line": 18,
              "label": "isasim.py"
            },
            {
              "path": "opentpu/isasim.py",
              "line": 51,
              "label": "isasim.py"
            },
            {
              "path": "opentpu/target.py",
              "line": 224,
              "label": "target.py"
            },
            {
              "path": "opentpu/host/board.py",
              "line": 1300,
              "label": "board.py"
            },
            {
              "path": "targets/ypcb-00338.toml",
              "line": 78,
              "label": "ypcb-00338.toml"
            }
          ]
        },
        {
          "title": "架构参数与微架构参数为何分开",
          "body": "<p>TOML 的 arch 描述程序依赖的容量、维度与功能；uarch 描述具体实现/时序选择，例如 MXU_IMPL、TMEM_IMPL、WIN、流水线长度。并非所有参数都应该改变程序语义，但它们可能显著改变时序和资源占用。</p><p>CFG_HASH 与 numerics 用于核对程序、镜像和 bitstream 的契约。软件若按错误 D、格式或可选能力构建，不能期待驱动自动补救。自己实现时应提供只读能力寄存器，并在 RUN 之前拒绝不匹配，错误提示列出实际值和期望值。</p>",
          "refs": [
            {
              "path": "targets/ypcb-00338.toml",
              "line": 13,
              "label": "ypcb-00338.toml"
            },
            {
              "path": "targets/ypcb-00338.toml",
              "line": 32,
              "label": "ypcb-00338.toml"
            },
            {
              "path": "opentpu/target.py",
              "line": 232,
              "label": "target.py"
            },
            {
              "path": "opentpu/host/board.py",
              "line": 1378,
              "label": "board.py"
            }
          ]
        },
        {
          "title": "板卡路径包含运输与控制，不等于模型算法",
          "body": "<p>Board/XdmaTransport 负责主机侧的数据运输和寄存器访问；BoardBackend 把模型的程序、数据与运行连接到设备。程序 loader、RUN/状态、参数、等待项和回读都有顺序要求。多个进程同时操作设备还需要设备级锁，不能仅靠 Python 的线程锁。</p><p>自己写第一版驱动先实现“读设备标识 → 核对能力 → 写入已知数据 → 运行小程序 → 带 timeout 等待 → 读取结果”。逐步加超时恢复、错误状态和统计。完整 LLM chat 是最终集成用例，不是最早应调试的用例。</p>",
          "refs": [
            {
              "path": "opentpu/host/board.py",
              "line": 269,
              "label": "board.py"
            },
            {
              "path": "opentpu/host/board.py",
              "line": 654,
              "label": "board.py"
            },
            {
              "path": "opentpu/host/board.py",
              "line": 1485,
              "label": "board.py"
            },
            {
              "path": "docs/host.md",
              "line": 1,
              "label": "host.md"
            }
          ]
        },
        {
          "title": "KV cache 不是 CPU 硬件缓存",
          "body": "<p>模型 KV cache 保存历史 token 的 key/value，是由软件显式管理的算法状态。它与普通 CPU 的 cache line、tag、替换策略和 MESI 权限状态不是同一概念。openTPU 的 program/image/quant cache 也可能指主机文件复用，不能据“cache”这个单词推出有 coherent cache RTL。</p><p>如果你要添加多核共享硬件缓存，需要另外定义地址映射、行大小、私有/共享层级、目录状态、消息与瞬态，而不是扩充 KVCache 类就能完成。先学清现有系统的显式数据移动，再单独设计一致性扩展。</p>",
          "refs": [
            {
              "path": "opentpu/runtime.py",
              "line": 54,
              "label": "runtime.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 411,
              "label": "compiler.py"
            },
            {
              "path": "opentpu/qcache.py",
              "line": 1,
              "label": "qcache.py"
            },
            {
              "path": "opentpu/progcache.py",
              "line": 1,
              "label": "progcache.py"
            }
          ]
        }
      ]
    },
    {
      "id": "sw-validation",
      "title": "自己写一台小 openTPU：从契约到验证闭环",
      "kicker": "SOFTWARE / 08",
      "summary": "用最小完整机器获得可定位的错误，而不是先堆完整模型。",
      "sections": [
        {
          "title": "第一阶段：一个可执行规格",
          "body": "<p>先定义单 slice、有限 DRAM/TMEM/ACT、静态 shape、int8 格式和最少指令 LD、ST、QACT、MM、HALT。用独立的小解释器明确每条指令的读取/写入、对齐、越界、零值、舍入与完成语义。把合法与非法输入都写成可重复向量。</p><p>验收标准是能手算的小矩阵与解释器逐项一致，错误程序会明确拒绝，而不是“跑起来且没有崩溃”。在这个阶段不需要 NoC、目录、复杂服务或完整 LLM。</p>",
          "refs": [
            {
              "path": "docs/isa.md",
              "line": 1,
              "label": "isa.md"
            },
            {
              "path": "opentpu/isa.py",
              "line": 190,
              "label": "isa.py"
            },
            {
              "path": "tests/test_isa.py",
              "line": 85,
              "label": "test_isa.py"
            },
            {
              "path": "tests/test_isa.py",
              "line": 133,
              "label": "test_isa.py"
            }
          ]
        },
        {
          "title": "第二阶段：先做完全顺序 RTL",
          "body": "<p>实现 fetch/decode、单命令启动、busy/done、简单 SRAM 和数据通路。每条指令结束后导出 TMEM/DRAM，与规格逐位比较。将 FP 单元、量化器、MXU、DMA 各自做模块级测试，再连成 slice。</p><p>验收标准包括：reset 后状态确定、最后一次写回完成才 done、stall 下请求信息稳定、越界不会静默绕回、尾块不覆盖相邻区域。完整吞吐优化应在这个阶段通过后进行。</p>",
          "refs": [
            {
              "path": "opentpu/isasim.py",
              "line": 202,
              "label": "isasim.py"
            },
            {
              "path": "opentpu/rtlsim.py",
              "line": 293,
              "label": "rtlsim.py"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 1,
              "label": "otpu_slice.sv"
            },
            {
              "path": "tests/test_fp_rtl.py",
              "line": 1,
              "label": "test_fp_rtl.py"
            }
          ]
        },
        {
          "title": "第三阶段：增加银行、流水线与依赖",
          "body": "<p>先让 TMEM bank 映射显式可见，再实现多 lane；然后把执行单元流水化，最后允许多个单元重叠。每新增一项优化都必须保持功能输出不变。RAW 之外要覆盖 WAR/WAW，以及 ACT RAM 被 QACT 覆盖而旧 MM 仍在读取的风险。</p><p>验收方法可以使用固定随机种子生成小程序，分别跑顺序规格与 RTL，首次不一致时保存配置、程序和镜像。不同 LANES/MCOLS/ACT_ROWS 下的结果应遵守契约；周期和资源可以不同。不要用一张更快的性能图替代正确性证明。</p>",
          "refs": [
            {
              "path": "opentpu/waits.py",
              "line": 26,
              "label": "waits.py"
            },
            {
              "path": "opentpu/compiler.py",
              "line": 1883,
              "label": "compiler.py"
            },
            {
              "path": "tests/test_config_matrix.py",
              "line": 1,
              "label": "test_config_matrix.py"
            },
            {
              "path": "tests/test_isa.py",
              "line": 79,
              "label": "test_isa.py"
            }
          ]
        },
        {
          "title": "第四阶段：编译器和真实工作负载",
          "body": "<p>加入描述符与简单 builder，先支持连续 load、广播 VOP 和 dot；随后增加循环、存储复用和分块 attention。为每次优化保留未优化路径作为对照。完整模型要分层比较 embedding、norm、每层输出与 logits，再看最终生成文本。</p><p>这里的测试入口包括 test_compiler、test_isa、test_quant、test_kernels 与 config_matrix。阅读测试时先看被保护的不变量，再看构造数据；它们能告诉你上游过去最容易发生哪类错误。课程中的练习是建议操作，未执行的命令不会被标成实测结果。</p>",
          "refs": [
            {
              "path": "tests/test_compiler.py",
              "line": 1,
              "label": "test_compiler.py"
            },
            {
              "path": "tests/test_kernels.py",
              "line": 56,
              "label": "test_kernels.py"
            },
            {
              "path": "tests/test_quant.py",
              "line": 173,
              "label": "test_quant.py"
            },
            {
              "path": "tools/validate.py",
              "line": 1,
              "label": "validate.py"
            }
          ]
        },
        {
          "title": "运行对照时记录哪些证据",
          "body": "<p>最低记录：源码 commit、target/variant、全部 Config、uarch、程序 words 与 wait entries、输入镜像、随机种子、后端、工具版本、结果 hash。性能还要记录 warm/cold、主机编译是否计入、模型格式、序列长度、batch、时钟与内存路径。</p><p>rtlsim 的构建缓存 key 会考虑源码内容、参数、flags 和 Verilator 版本，有助于避免旧可执行文件混入新实验。但缓存命中不是验证通过；仍须读取退出状态和结果对照。自己扩展时把这些元数据自动写入报告，比手抄一次运行命令更可靠。</p>",
          "refs": [
            {
              "path": "opentpu/rtlsim.py",
              "line": 52,
              "label": "rtlsim.py"
            },
            {
              "path": "opentpu/rtlsim.py",
              "line": 65,
              "label": "rtlsim.py"
            },
            {
              "path": "opentpu/target.py",
              "line": 240,
              "label": "target.py"
            },
            {
              "path": "docs/dataflow.md",
              "line": 1,
              "label": "dataflow.md"
            }
          ]
        }
      ]
    }
  ],
  "glossary": [
    {
      "term": "SPMD",
      "category": "软件",
      "definition": "同一 kernel 按多个 slice 分别追踪，各自使用 slice 编号。",
      "implementation": "Kernel.trace 接收 sid；runtime 为每个 slice 产生程序。",
      "build": "先生成两份程序并打印差异，再引入通信。",
      "refs": [
        {
          "path": "opentpu/runtime.py",
          "line": 198,
          "label": "runtime.py"
        }
      ]
    },
    {
      "term": "Tensor",
      "category": "布局",
      "definition": "DRAM FP32 张量的地址与形状描述符。",
      "implementation": "base 字节地址，strides 是元素数；切片构造视图。",
      "build": "为字段标注单位，先实现连续一维切片。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 236,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "QTensor",
      "category": "布局",
      "definition": "存于 DRAM 的打包量化矩阵，是 MM 的流式操作数。",
      "implementation": "包含 data/scale、rs/srs、wf、k0、parts 与 tiles。",
      "build": "先只支持 int8 和静态行切片，再加入尺度偏移。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 265,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "Tile",
      "category": "布局",
      "definition": "TMEM 中间张量及其布局视图。",
      "implementation": "跟踪 buffer、base、shape、row stride 和生命周期。",
      "build": "把逻辑 shape 与物理分配长度分开。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 512,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "Stationary",
      "category": "布局",
      "definition": "已经量化驻留 ACT RAM 的操作数。",
      "implementation": "保存 chunks、owners、KB、qranges，检查覆盖。",
      "build": "实现块分配器和所有权版本，再允许复用。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 680,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "Bcast",
      "category": "布局",
      "definition": "不复制数据的行/列广播视图。",
      "implementation": "编译器据形状选择 VPU 第二操作数模式。",
      "build": "先支持 scalar、ROW、COL、FULL 四种。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 648,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "TMEM",
      "category": "存储",
      "definition": "软件显式管理的 FP32 中间存储，地址单位为32-bit word。",
      "implementation": "Tile 分配器与硬件 bank 组织共同决定布局。",
      "build": "小型 SRAM 起步，随后加入 bank 和仲裁。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 1229,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "ACT RAM",
      "category": "存储",
      "definition": "QACT 写、MM 读的整数激活与尺度存储。",
      "implementation": "ACT_ROWS×ACT_BLOCKS×D，带所有权与尺度记录。",
      "build": "先分开整数数组和尺度数组，验证同一索引关联。",
      "refs": [
        {
          "path": "opentpu/isasim.py",
          "line": 93,
          "label": "isasim.py"
        }
      ]
    },
    {
      "term": "Stride",
      "category": "布局",
      "definition": "相邻逻辑元素或行在物理地址上的间隔。",
      "implementation": "Tensor 元素 stride、QTensor 字节 stride、Tile word stride 不同。",
      "build": "字段命名写出单位并测试非紧密行布局。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 236,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "Padding",
      "category": "布局",
      "definition": "为对齐、bank 分散或尾块而保留的额外空间。",
      "implementation": "dot 可选择 N+1 行步长；attention 尾部 P 补零。",
      "build": "分别维护 valid 长度与 physical 长度。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 1883,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "Affine",
      "category": "编译器",
      "definition": "常量与变量线性组合，用于可追踪地址。",
      "implementation": "常量加循环/运行时项，映射到地址寄存器。",
      "build": "先规范化系数，再分配寄存器。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 174,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "RunVar",
      "category": "编译器",
      "definition": "运行时输入值的符号表示。",
      "implementation": "参数寄存器提供值，host 可预乘系数。",
      "build": "定义范围和可用寄存器，拒绝无法表达地址。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 67,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "DevVar",
      "category": "编译器",
      "definition": "设备计算产生的寄存器值。",
      "implementation": "区别于主机启动参数，编译器跟踪 reg 与对齐。",
      "build": "用显式寄存器所有权防止提前释放。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 97,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "JIT tracing",
      "category": "编译器",
      "definition": "执行 Python kernel 以记录设备操作。",
      "implementation": "Kernel.trace 建立 Builder 上下文。",
      "build": "重载少量张量操作并保留源位置信息。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 2042,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "Hardware loop",
      "category": "控制",
      "definition": "一次保存 body，设备重复执行。",
      "implementation": "LOOP 配合 ADDI 与仿射地址；不同于主机展开。",
      "build": "先写两层有限循环并测试零次循环。",
      "refs": [
        {
          "path": "opentpu/isa.py",
          "line": 130,
          "label": "isa.py"
        }
      ]
    },
    {
      "term": "Peephole fusion",
      "category": "编译器",
      "definition": "将局部操作模式替换为更少指令。",
      "implementation": "EXP2SUB、RSSQ、QACT CSCALE、MM RMAX 等。",
      "build": "检查 alias、存活与逐位数值等价。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 1403,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "Liveness",
      "category": "编译器",
      "definition": "某个值还会不会被后续代码使用。",
      "implementation": "TMEM buffer 用 weakref，ACT块随 Stationary 存活。",
      "build": "显式 alloc/free 起步，再建立自动存活分析。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 1245,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "Next-fit",
      "category": "编译器",
      "definition": "从上次分配游标后寻找空闲区。",
      "implementation": "减少最近复用地址引入的假冲突，但可能碎片化。",
      "build": "为 wrap、空隙和不足容量分别写测试。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 1245,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "MM",
      "category": "ISA",
      "definition": "从 ACT RAM 读驻留操作数、从 DRAM 流入另一侧并写 TMEM 的矩阵指令。",
      "implementation": "dot 可生成多条 MM 以覆盖 chunks 和 qranges。",
      "build": "先实现单块单行，再增加输出行与K块。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 1928,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "QACT",
      "category": "ISA",
      "definition": "TMEM FP32 到 ACT RAM 整数/尺度的量化指令。",
      "implementation": "支持范围与可选行列缩放，写入驻留块。",
      "build": "明确舍入、零行、饱和、尺度关联。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 1534,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "QST",
      "category": "ISA",
      "definition": "把量化结果及尺度写入 DRAM。",
      "implementation": "KV追加等路径使用，布局由字段规定。",
      "build": "先验证按字节写入不会破坏旁边元素。",
      "refs": [
        {
          "path": "opentpu/isa.py",
          "line": 432,
          "label": "isa.py"
        }
      ]
    },
    {
      "term": "VOP",
      "category": "ISA",
      "definition": "TMEM 上的向量与归约操作族。",
      "implementation": "func、bmode、stride 等选择算术与广播。",
      "build": "从逐元素 add 开始，再加归约和尾 lane mask。",
      "refs": [
        {
          "path": "opentpu/isa.py",
          "line": 440,
          "label": "isa.py"
        }
      ]
    },
    {
      "term": "RMAX",
      "category": "矩阵",
      "definition": "MM 排出阶段附带计算行最大值。",
      "implementation": "dot rowmax 为结果预留额外区域。",
      "build": "跟踪每行最大值并定义首次元素初始化。",
      "refs": [
        {
          "path": "opentpu/compiler.py",
          "line": 1902,
          "label": "compiler.py"
        }
      ]
    },
    {
      "term": "ACC / ASCALE",
      "category": "矩阵",
      "definition": "累加到已有输出，或先按行尺度修正旧累加器。",
      "implementation": "attention 的 acc*=alpha 后再加 P·V 可在 epilogue 完成。",
      "build": "先规定读改写顺序与允许的alias。",
      "refs": [
        {
          "path": "opentpu/language.py",
          "line": 108,
          "label": "language.py"
        }
      ]
    },
    {
      "term": "Replay",
      "category": "矩阵",
      "definition": "ACT_ROWS 大于并行 MCOLS 时，多组 ACT 行复用同一条 streamed weight row。",
      "implementation": "整条 streamed row 的 chunks 与 scales 先进入 FIFO；各 ACT 行组重读同一组条目，最后一组才释放。",
      "build": "缓存整条 streamed row；各 ACT 行组依次重读相同 FIFO 条目，最后一组才释放，受 DEPTH 容量约束。issuer 可在容量允许时预取后续 chunk 或另一命令，不能用全局停止接受 chunk 来代替此协议。",
      "refs": [
        {
          "path": "rtl/mxu/otpu_mxu.sv",
          "line": 34,
          "label": "otpu_mxu.sv"
        },
        {
          "path": "rtl/mxu/otpu_mxu.sv",
          "line": 148,
          "label": "replay FIFO capacity"
        }
      ]
    },
    {
      "term": "WAITC",
      "category": "依赖",
      "definition": "软件预先计算的逐指令等待信息。",
      "implementation": "有序unit用计数，VPU用生产者mask；附在程序旁。",
      "build": "先处理静态地址，再保守覆盖循环和未知地址。",
      "refs": [
        {
          "path": "opentpu/waits.py",
          "line": 4,
          "label": "waits.py"
        }
      ]
    },
    {
      "term": "RAW / WAR / WAW",
      "category": "依赖",
      "definition": "RAW=写后读、WAR=读后写、WAW=写后写：按程序顺序必须维持的三类访问关系。",
      "implementation": "footprint之间的读写交叉决定是否必须等待。",
      "build": "为每条命令列出读写区间，逐对构造冲突案例。",
      "refs": [
        {
          "path": "opentpu/waits.py",
          "line": 26,
          "label": "waits.py"
        }
      ]
    },
    {
      "term": "All-gather",
      "category": "通信",
      "definition": "将各slice片段拼接并复制到所有slice。",
      "implementation": "S=1时直接返回输入，多slice发GATHER。",
      "build": "明确参与者、顺序、目标布局和完成条件。",
      "refs": [
        {
          "path": "opentpu/language.py",
          "line": 123,
          "label": "language.py"
        }
      ]
    },
    {
      "term": "All-reduce",
      "category": "通信",
      "definition": "各slice同一逻辑位置求和并复制结果。",
      "implementation": "当前语言实现是all-gather后逐片VOP相加。",
      "build": "先验证拼接，再固定求和顺序以保持数值契约。",
      "refs": [
        {
          "path": "opentpu/language.py",
          "line": 132,
          "label": "language.py"
        }
      ]
    },
    {
      "term": "KV cache",
      "category": "模型",
      "definition": "保存历史token的key/value以避免重复计算。",
      "implementation": "K按token行、V转置/分块，软件管理尺度和容量。",
      "build": "先实现append与单head读取，边界写不可越界。",
      "refs": [
        {
          "path": "opentpu/runtime.py",
          "line": 148,
          "label": "runtime.py"
        }
      ]
    },
    {
      "term": "Online softmax",
      "category": "模型",
      "definition": "用运行最大值、归一化和输出累积逐块计算softmax attention。",
      "implementation": "_finish更新m、l、acc，最后acc/l。",
      "build": "先证明小矩阵分块与不分块数学等价，再验证设备数值。",
      "refs": [
        {
          "path": "opentpu/kernels/attention.py",
          "line": 184,
          "label": "attention.py"
        }
      ]
    },
    {
      "term": "GQA",
      "category": "模型",
      "definition": "多个query head共享一个KV head的注意力组织。",
      "implementation": "query组作为驻留行复用同一流式K/V。",
      "build": "显式建立query-to-KV映射并测不等head数。",
      "refs": [
        {
          "path": "opentpu/kernels/attention.py",
          "line": 292,
          "label": "attention.py"
        }
      ]
    },
    {
      "term": "Prefill",
      "category": "模型",
      "definition": "处理输入prompt的一批token并建立历史状态。",
      "implementation": "将多个query行打包，配合因果mask和容量适配。",
      "build": "先固定位置，再加入运行时位置和程序缓存。",
      "refs": [
        {
          "path": "opentpu/llm/prefill.py",
          "line": 1,
          "label": "prefill.py"
        }
      ]
    },
    {
      "term": "Decode",
      "category": "模型",
      "definition": "利用已有历史状态逐步生成后续token。",
      "implementation": "小行数下权重流量容易主导，程序可复用。",
      "build": "先运行固定一步，再引入动态token和停止条件。",
      "refs": [
        {
          "path": "opentpu/llm/generate.py",
          "line": 1,
          "label": "generate.py"
        }
      ]
    },
    {
      "term": "FP32 FTZ",
      "category": "数值",
      "definition": "使用binary32存储但将denormal按规定冲为有符号零。",
      "implementation": "固定RNE，复合函数为指定运算序列。",
      "build": "测试边界指数、±0、溢出和canonical NaN。",
      "refs": [
        {
          "path": "docs/isa.md",
          "line": 57,
          "label": "isa.md"
        }
      ]
    },
    {
      "term": "INT4 / FP4",
      "category": "数值",
      "definition": "均为4-bit元素，但编码网格和尺度语义不同。",
      "implementation": "pack4打包，quantize_mxu产生当前MX格式与scale row。",
      "build": "分开实现编码表、尺度生成和打包。",
      "refs": [
        {
          "path": "opentpu/quant.py",
          "line": 275,
          "label": "quant.py"
        }
      ]
    },
    {
      "term": "CFG_HASH",
      "category": "运行时",
      "definition": "程序/镜像与硬件架构和数值契约的匹配标识。",
      "implementation": "target.arch_hash纳入配置和numerics。",
      "build": "RUN前核对，不把不匹配继续执行。",
      "refs": [
        {
          "path": "opentpu/target.py",
          "line": 240,
          "label": "target.py"
        }
      ]
    },
    {
      "term": "ISA simulator",
      "category": "验证",
      "definition": "按指令定义功能与数值结果的参考机器。",
      "implementation": "Slice.execute更新存储；Machine协调collective。",
      "build": "从确定性功能模型起步，不宣称周期精确。",
      "refs": [
        {
          "path": "opentpu/isasim.py",
          "line": 202,
          "label": "isasim.py"
        }
      ]
    },
    {
      "term": "RTL co-simulation",
      "category": "验证",
      "definition": "运行真实RTL并与规格比较状态和输出。",
      "implementation": "rtlsim调用Verilator，按源码/参数/版本缓存构建。",
      "build": "保存首次失败的program、镜像与配置供复现。",
      "refs": [
        {
          "path": "opentpu/rtlsim.py",
          "line": 52,
          "label": "rtlsim.py"
        }
      ]
    },
    {
      "term": "Arithmetic intensity",
      "category": "性能",
      "definition": "每搬运一个字节完成多少算术工作。",
      "implementation": "相同权重服务更多query行可提高复用，但受容量限制。",
      "build": "先数实际数据和scale字节，再估计吞吐上限。",
      "refs": [
        {
          "path": "docs/dataflow.md",
          "line": 1,
          "label": "dataflow.md"
        }
      ]
    }
  ],
  "quiz": [
    {
      "q": "ol.dot(a[M,K], w[N,K]) 的输出和数学定义是什么？",
      "options": [
        "[M,N]，a @ w.T",
        "[M,K]，a @ w",
        "[N,N]，w @ w.T"
      ],
      "answer": 0,
      "explanation": "w以[N,K]行存储并从DRAM流入，驻留a的每行与w各行做点积。"
    },
    {
      "q": "Tensor 切片通常立即做了什么？",
      "options": [
        "搬运DRAM数据到TMEM",
        "建立新的地址/形状描述符",
        "创建硬件缓存行"
      ],
      "answer": 1,
      "explanation": "load才生成显式搬运；描述符切片本身主要改变base与shape等元数据。"
    },
    {
      "q": "TMEM_WORDS=65536 的逻辑数据容量是多少？",
      "options": [
        "64 KiB",
        "256 KiB",
        "65536条指令"
      ],
      "answer": 1,
      "explanation": "TMEM word是32 bit，65536×4字节=256 KiB；不等于物理RAM面积。"
    },
    {
      "q": "IMEM_WORDS=32768 可存多少条8-word指令？",
      "options": [
        "32768",
        "8192",
        "4096"
      ],
      "answer": 2,
      "explanation": "每指令8×32-bit word，因此32768/8=4096条。"
    },
    {
      "q": "为什么结果 Tile 的行 stride 可能是 N+1？",
      "options": [
        "为了分散并行写到不同TMEM bank",
        "因为矩阵数学上多一列",
        "为了自动创建L1 cache"
      ],
      "answer": 0,
      "explanation": "padding改变物理布局，逻辑shape仍为M×N。"
    },
    {
      "q": "当前YPCB m4 的MCOLS和ACT_ROWS分别是？",
      "options": [
        "8和8",
        "4和16",
        "16和4"
      ],
      "answer": 1,
      "explanation": "MCOLS并行行组宽度与ACT_ROWS可驻留行数不是同一个参数。"
    },
    {
      "q": "ACT_ROWS > MCOLS 时，Replay主要做什么？",
      "options": [
        "要求从DRAM重新读取每个行组的权重",
        "复用已读chunk服务多个驻留行组",
        "改变最终矩阵shape"
      ],
      "answer": 1,
      "explanation": "同一流式chunk被重复用于多组MCOLS行，处理拍数增加但可减少重复DRAM遍历。"
    },
    {
      "q": "isa.md 的顺序完成语义能证明硬件完全串行吗？",
      "options": [
        "能",
        "不能，要看Sequencer与依赖机制",
        "只要D=128就能"
      ],
      "answer": 1,
      "explanation": "ISA给结果契约；硬件可在保持依赖顺序的情况下重叠执行。"
    },
    {
      "q": "all_reduce 在当前语言实现中的主要组成是？",
      "options": [
        "只调用硬件目录控制器",
        "all_gather后VOP逐片求和",
        "一次CPU缓存刷新"
      ],
      "answer": 1,
      "explanation": "这是显式集体通信与向量求和，不是coherence。"
    },
    {
      "q": "KV cache 与缓存一致性里的 cache 是同一个东西吗？",
      "options": [
        "是，均实现MESI",
        "不是，KV是显式管理的模型历史状态",
        "只有S=2时才一样"
      ],
      "answer": 1,
      "explanation": "名称相同不能推出tag、替换策略和一致性权限存在。"
    },
    {
      "q": "FP32 的表述在本项目中意味着什么？",
      "options": [
        "全部IEEE754模式和异常完整实现",
        "binary32存储与项目规定的RNE/FTZ及近似算术",
        "所有操作都是数学精确实数"
      ],
      "answer": 1,
      "explanation": "必须查看fp32.py和ISA数值契约，不能任意重排浮点操作。"
    },
    {
      "q": "ol.range 与 static_range 的区别是什么？",
      "options": [
        "二者都只在主机展开",
        "前者硬件LOOP，后者主机展开",
        "前者必定更快"
      ],
      "answer": 1,
      "explanation": "硬件循环减少程序体积，但增加地址与寄存器约束，性能需验证。"
    },
    {
      "q": "只要 Stationary 的Python变量还在，就永远可以安全读吗？",
      "options": [
        "可以",
        "还需检查ACT所有权与覆盖",
        "取决于变量名长短"
      ],
      "answer": 1,
      "explanation": "编译器验证owner；循环与物理复用都可能使驻留数据失效。"
    },
    {
      "q": "当前 attention _attend_heads 默认depth是多少？",
      "options": [
        "1",
        "2",
        "3"
      ],
      "answer": 2,
      "explanation": "当前源码默认depth=3，旧编译文档中的双缓冲例子不代表全部当前实现。"
    },
    {
      "q": "性能改善但结果不一致时，应先怎样做？",
      "options": [
        "只报告tok/s",
        "保留配置与失败输入，定位数值/地址首次分叉",
        "直接提高误差阈值"
      ],
      "answer": 1,
      "explanation": "先恢复语义一致性，再讨论吞吐改进。"
    },
    {
      "q": "Runtime place 对 Input 的默认处理是什么？",
      "options": [
        "复制进每个slice的DRAM",
        "只给slice0一个主机指针",
        "自动放入一致性L2"
      ],
      "answer": 0,
      "explanation": "显式DRAM镜像与描述符，slice之间不共享普通内存。"
    },
    {
      "q": "4-bit权重使整机全部存储占用精确减半吗？",
      "options": [
        "必然如此",
        "还要计算scale、对齐、KV、表和其他数据",
        "只有加NoC才减半"
      ],
      "answer": 1,
      "explanation": "元素压缩比例不能代替整个模型镜像的实际字节统计。"
    },
    {
      "q": "若要添加新VOP，最早要固定什么？",
      "options": [
        "网页配色",
        "opcode字段、数值顺序、边界与读写契约",
        "完整大模型权重"
      ],
      "answer": 1,
      "explanation": "规格、编码、模拟器、RTL、编译器和测试需要同一契约。"
    },
    {
      "q": "Config()、target.config()和真实bitstream能力能默认视为相同吗？",
      "options": [
        "可以",
        "不可以，需要核对来源及环境覆盖",
        "只有Python版本相同即可"
      ],
      "answer": 1,
      "explanation": "测试默认、小目标、variant、可选能力和真实设备可能不同。"
    },
    {
      "q": "下一步想实现共享缓存目录，应从哪里开始？",
      "options": [
        "给KVCache增加一个字段即可",
        "先定义cache line、权限、消息、状态和完成条件",
        "先增加矩阵列数"
      ],
      "answer": 1,
      "explanation": "coherence是单独的系统扩展，现有显式数据移动不会自动提供它。"
    }
  ],
  "routes": [
    {
      "title": "第一次阅读 · 从存储到指令",
      "steps": [
        "sw-map",
        "sw-layout",
        "sw-isa",
        "sw-runtime"
      ]
    },
    {
      "title": "编译器与模型 · 数据流路线",
      "steps": [
        "sw-lowering",
        "sw-numeric",
        "sw-attention",
        "sw-runtime"
      ]
    },
    {
      "title": "自己实现 · 最小机器到闭环验证",
      "steps": [
        "sw-isa",
        "sw-numeric",
        "sw-validation",
        "sw-lowering"
      ]
    }
  ]
};

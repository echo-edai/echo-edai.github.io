/* Source-grounded Chinese hardware course. Original prose; source files retain upstream license. */
window.OTPU_HW = {
  "baseline": {
    "commit": "91df41092f612361c5bc22f83b31d23382ffabb0",
    "repository": "https://github.com/FeSens/openTPU",
    "target": "ypcb-00338:m4",
    "scope": "静态源码阅读；章节内的实现练习与网页动画不等同于上游整机仿真。",
    "map_scope": "modules/journeys 是人工教学分层，包含 host、loader、epilogue 等概念节点，不等同于 Verilator elaborated instance hierarchy；完整实例层次见网页的设计分析数据。"
  },
  "chapters": [
    {
      "id": "hw-machine",
      "title": "先建立机器模型：这里的 NPU core 是什么",
      "kicker": "01 / MACHINE MODEL",
      "summary": "openTPU 是由命令驱动的张量处理 slice，不是运行普通 CPU 线程的通用处理器。先把命令、计算和存储三条边界画清楚。",
      "sections": [
        {
          "title": "一张全图：主机、板级外壳、slice、运算单元",
          "body": "<p>主机通过 PCIe 把程序、权重、输入放进板载 DRAM，再用控制寄存器启动。<code>otpu_board</code> 包装一个或多个 <code>otpu_slice</code>，每个 slice 有自己的 IMEM、TMEM、ACT RAM、sequencer、DMA、MXU、quantizer 和 VPU。一个 sequencer 发命令，五类执行单元可以重叠工作；数据大多在显式地址的存储之间搬运。</p><p>把 slice 称作本项目的“张量计算核”有助于理解，但它没有 NaplesPU 那样的硬件线程、通用向量寄存器文件、缓存目录和 mesh router。openTPU 的 <code>LANES</code> 是 VPU/TMEM 并行通道，<code>MCOLS</code> 是 MXU 并行驻留行数，二者不是同一个参数。</p><pre>Host / PCIe → otpu_board → otpu_slice × S\n                         ├─ sequencer + IMEM + dispatch window\n                         ├─ DMA ⇄ private DRAM\n                         ├─ QACT → ACT RAM → MXU → TMEM\n                         ├─ VPU ⇄ TMEM\n                         └─ collective ⇄ every slice's TMEM</pre>",
          "refs": [
            {
              "path": "rtl/shell/otpu_board.sv",
              "line": 1,
              "label": "板级层级与跨 SLR 边界"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 1,
              "label": "slice 的并发单元与共享资源"
            }
          ]
        },
        {
          "title": "三种数据存储和一种指令存储",
          "body": "<table><thead><tr><th>空间</th><th>寻址单位</th><th>主要内容</th><th>主要读写者</th></tr></thead><tbody><tr><td>DRAM</td><td>字节</td><td>权重、输入输出、程序、量化 scale、状态</td><td>主机、DMA、MXU、QST</td></tr><tr><td>TMEM</td><td>32-bit word</td><td>FP32 张量及少量控制描述符</td><td>DMA、VPU、MXU epilogue、quantizer、collective</td></tr><tr><td>ACT RAM</td><td>row / block / byte</td><td>INT8 驻留操作数和 64-bit scale record</td><td>QACT 写，MM 读</td></tr><tr><td>IMEM</td><td>256-bit 指令</td><td>程序及独立 WAITC sidecar</td><td>loader 写，sequencer 取指</td></tr></tbody></table><p>最常见的地址错误是把 TMEM word address 当成 DRAM byte address：一个 FP32 元素在 DRAM 中地址加 4，在 TMEM 中地址加 1。容量同样必须带单位：<code>TMEM_WORDS=65536</code> 是逻辑数据 256 KiB；<code>IMEM_WORDS=32768</code> 是 32-bit words，所以是 4096 条 32-byte 指令。</p>",
          "refs": [
            {
              "path": "docs/isa.md",
              "line": 7,
              "label": "ISA 机器模型"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 79,
              "label": "IPR 与 IMEM 行数"
            },
            {
              "path": "rtl/shell/otpu_ctrl.sv",
              "line": 67,
              "label": "CFG_IMEM：每条指令 8 words"
            }
          ]
        },
        {
          "title": "为什么显式 scratchpad 有利于可预测的数据流",
          "body": "<p>缓存依靠 tag 比较、命中/未命中、替换、回填把一块内存透明地映射到较小存储；scratchpad 则由程序明确选择本地地址并安排搬运。TMEM 是后者。软件编译时分配中间张量位置，生成 LD、QACT、MM、VOP、ST，硬件保证这些命令之间的依赖与端口契约。</p><p>优势是 tile 生存期和复用可由编译器安排，省去通用缓存替换与一致性控制；代价是容量、bank 冲突和搬运必须认真处理。TMEM 中某个变量被覆盖，不会自动从 DRAM 补回来；地址分配错误也不是“cache miss”，而是错误结果。自己写最小 NPU 时，可以先用同步 RAM + 显式 DMA 建出这条路线，再考虑缓存。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 1,
              "label": "显式地址 TMEM"
            },
            {
              "path": "rtl/top/otpu_pkg.sv",
              "line": 74,
              "label": "三个地址空间的范围表示"
            }
          ]
        },
        {
          "title": "不把不存在的结构画进项目",
          "body": "<p>已核对的 top/slice/board 生产层级没有通用 mesh NoC，也没有以缓存行 sharer/owner 为状态的 <code>directory_controller</code>。<code>otpu_coll</code> 是中心 collective 通路，TMEM 的读口副本是同一逻辑 scratchpad 的物理复制，DRAM adapter 的 A 读复用/预取是局部优化；这些都不能改名成 MESI 目录。</p><p>学习 NoC 和缓存一致性仍然有价值，但应作为设计扩展：如果要把多个 slice 改成共享地址的 coherent cores，需要新增缓存、home 映射、目录、探针与响应网络、瞬态和死锁规则。当前 openTPU 用私有 DRAM、显式 GATHER/BAR、主机/设备 ordering 合约处理跨单元协作。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_top.sv",
              "line": 65,
              "label": "slice 私有 DRAM 与 collective 连线"
            },
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 1,
              "label": "BAR/GATHER 的真实含义"
            },
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 55,
              "label": "adapter ordering 与局部读复用"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-configuration",
      "title": "用 target 读架构：默认值不是板卡配置",
      "kicker": "02 / PARAMETERS & ELABORATION",
      "summary": "每个参数都改变一组端口、RAM 或调度约束。以固定提交的 ypcb-00338:m4 为主线，同时识别测试默认与实验变体。",
      "sections": [
        {
          "title": "m4 的架构参数：先记住有单位的量",
          "body": "<p><code>targets/ypcb-00338.toml</code> 的默认 variant 为 <code>m4</code>：S=1、D=128、MCOLS=4、ACT_ROWS=16、ACT_BLOCKS=128、TMEM_WORDS=65536、IMEM_WORDS=32768、LANES=8、DRAM_BYTES=4 GiB。D 是 INT8 元素/字节的 block 深度，不是总线“位数”；DRAM B 宽度是 D×8=1024 bit。</p><p>ACT 的逻辑量化数据容量为 16×128×128=262144 bytes，scale record 容量为 16×128×8=16384 bytes，合计 272 KiB；这只是逻辑内容量，不等于 FPGA BRAM 实占。m8 变体把 MCOLS 和 MXU_E 改为 8，TMEM 改为 131072 words，不能把它的容量与 m4 的实现数字混在一起。</p>",
          "refs": [
            {
              "path": "targets/ypcb-00338.toml",
              "line": 10,
              "label": "架构参数与默认 variant"
            },
            {
              "path": "targets/ypcb-00338.toml",
              "line": 78,
              "label": "m8 / m4 覆盖项"
            },
            {
              "path": "rtl/mem/otpu_actram.sv",
              "line": 1,
              "label": "ACT 数据与 scale 容量结构"
            }
          ]
        },
        {
          "title": "m4 的微架构参数：单拷贝、replay 与 2× 时钟",
          "body": "<p>当前 target 的 <code>TMEM_IMPL=3</code>、<code>TMEM_NSB=2</code>、<code>TMEM_RPL=true</code>、<code>TMEM_TDP=true</code>、<code>TMEM_GST=true</code>、<code>TMEM_PMP=1</code>，表示每 bank 两个 subbank 的单拷贝存储，读冲突通过 replay，真实双端口 RAM 以 2× core clock 使用。不能用 <code>otpu_tmem</code> 的参数默认值 IMPL=0 描述当前生产 target。</p><p>同一 target 还有 WIN=16、FIFO_DEPTH=1024、MXU_IMPL=2、MXU_CL=16、MXU_E=4、SEQ_WC=true。源码注释保留 EXPERIMENTAL 字样，但 target 已选用这些配置；应分别说明“机制在源码中的标注”和“当前 target 的选择”，不要由标签推断是否启用。</p>",
          "refs": [
            {
              "path": "targets/ypcb-00338.toml",
              "line": 31,
              "label": "微架构、TMEM、wait counts"
            },
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 371,
              "label": "单拷贝与 replay 机制"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 220,
              "label": "MXU 与 replay 接口选择"
            }
          ]
        },
        {
          "title": "仿真顶层与板级顶层各回答什么问题",
          "body": "<p><code>otpu_top</code> 默认 S=1、D=32、MCOLS=8，服务于仿真。AXI=0 选固定延迟行为 DRAM；AXI=1 用 native adapter 加随机 stall/latency 模型；AXI=2 把 adapter 接到更接近实际 LiteDRAM 的仿真通路。这几个名字是本项目历史参数，AXI=1 并不意味着内部仍用旧 MIG AXI adapter。</p><p>真实板卡从 <code>otpu_board</code>、板级 FPGA top 和 target 派生参数进入，包含主机控制、校准、时钟域、DRAM channel 和 trace。ASIC top 则接技术 RAM/DSP 与不同平台包装。先选问题再选顶层：算术差异查 ISA/单元，背压查 native memory 模型，时序闭合查实际 FPGA flow。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_top.sv",
              "line": 1,
              "label": "三种 DRAM 仿真路径"
            },
            {
              "path": "rtl/shell/otpu_board.sv",
              "line": 21,
              "label": "板级参数入口"
            },
            {
              "path": "rtl/asic/otpu_asic_top.sv",
              "line": 1,
              "label": "ASIC 顶层"
            }
          ]
        },
        {
          "title": "参数的约束比参数值更值得学",
          "body": "<p>MXU 要求 D 能按链分组、只接受当前 systolic IMPL=2、ACT_ROWS 至少 MCOLS；ACT RAM 要求 ROWS 是 MCOLS 的倍数并满足分组条件；DMA buffer 深度必须是至少 2 的 2 次幂；异步 FIFO 深度至少 4 且为 2 次幂。改一行 TOML 不保证组合合法。</p><p>自己设计参数化 RTL 时先把可合法化的集合写成 elaboration checks，再写测试矩阵。例如测试 D=32/128、MCOLS=2/4/8、ROWS=MCOLS/2×MCOLS 时要同时改变地址宽度、replay 次数和 FIFO 容量；仅检查“综合能过”不能证明寻址和尾 mask 正确。</p>",
          "refs": [
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 132,
              "label": "MXU elaboration 与命令约束"
            },
            {
              "path": "rtl/mem/otpu_actram.sv",
              "line": 57,
              "label": "ACT 参数约束"
            },
            {
              "path": "rtl/dma/otpu_dma.sv",
              "line": 97,
              "label": "chunk/segment 参数"
            },
            {
              "path": "rtl/shell/otpu_afifo.sv",
              "line": 59,
              "label": "异步 FIFO 参数约束"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-sequencer",
      "title": "发射不是执行：把 sequencer 拆成可理解的状态",
      "kicker": "03 / FETCH · DISPATCH · ISSUE",
      "summary": "从 256-bit 指令到五类独立单元：取指、地址解析、窗口分配、依赖跟踪、开始和完成有不同的时刻。",
      "sections": [
        {
          "title": "指令格式与标量寄存器的角色",
          "body": "<p>指令长 32 bytes，除 opcode/flags 外包含多个地址、长度、stride 字段。<code>cmd_t</code> 保存已经加过 R[ra]/R[rb]/R[rc] 的字段；单元收到的是解析后的命令。16 个 32-bit 标量寄存器负责地址、循环计数和少量运行控制，不是 FP32 张量寄存器文件。R8..R15 可由主机参数初始化。</p><p>NOP、LI、ADDI、LOOP 由 sequencer 内部执行；LD/ST/DSTEP/STREAM/WAITW 去 DMA，MM 去 MXU，QACT/QST 去 quantizer，VOP 去 VPU，BAR/GATHER 去 collective。RLD 使用 collective 的本地读口，但不发给跨 slice collective 状态机。自己实现时先定义命令结构和单元映射，避免各模块重复解析字段造成语义漂移。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_pkg.sv",
              "line": 4,
              "label": "操作码、单元映射和 cmd_t"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 19,
              "label": "RLD 与主机参数"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 550,
              "label": "RLD 单独处理"
            }
          ]
        },
        {
          "title": "同步 IMEM 为什么需要看前一条地址",
          "body": "<p>FPGA block RAM 的读是同步的，不能把 PC 组合地连到 RAM 后当作当拍指令。这里用 <code>fa</code> 预先取下一条、<code>ir</code> 寄存当前指令；reset 后 ir_v=0，因此开始有填充延迟。一个 D-byte 行能装 D/32 条指令，D=128 时每行 4 条。</p><p>这不仅是功能设计，也是时序设计：决定窗口能否接收的信号影响 RAM 的 read enable，而尽量不经过下一取指地址多路器。LOOP 分两拍登记次数和 body 长度后再决定进入或跳过，减少地址路径上的加法组合深度。学习 RTL 时应追 enable 和 valid，而不是只看 PC++。</p>",
          "refs": [
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 25,
              "label": "同步取指设计说明"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 383,
              "label": "IMEM 实例和 ir_v"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 98,
              "label": "LOOP 栈与两拍控制"
            }
          ]
        },
        {
          "title": "分派窗口里究竟存了什么",
          "body": "<p>窗口每个 slot 保存 valid、目标单元、年龄关系、started、依赖以及命令。<code>older[i][j]</code> 表示 j 比 i 老，是年龄矩阵；slot 编号本身不代表先后。一个 slot 空了可以被复用，因此不能简单选择最小编号作为最老指令。</p><p>非 WAITC 路径把地址和长度计算划成 P/S/Q/C 阶段，得到 memory footprint 后才分配 slot。C 阶段在窗口满时 hold，背压沿上游 valid/advance 条件传播。执行开始时命令从每单元的 distributed RAM 副本读进寄存器，再由 ustart 告诉单元接受；命令存储与组合优先选择也要考虑 FPGA 时序。</p>",
          "refs": [
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 368,
              "label": "窗口状态与年龄矩阵"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 499,
              "label": "P/S/Q/C 分派流水"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 820,
              "label": "寄存后的命令接口"
            }
          ]
        },
        {
          "title": "完成不是“所有运算都同时结束”",
          "body": "<p><code>ustart[u]</code>、<code>urdy[u]</code>、<code>udone[u]</code> 是命令级接口。每个单元的已开始 slot ID 排队到 uq，done 用队首找到完成 slot，再清掉其他 slot 对它的依赖。HALT 先停止接收后续指令，等待分派流水和窗口清空。</p><p>单元之间可以乱序开始独立工作；每单元对外完成按它的开始顺序。VPU 内部能重叠多条不同延迟操作，因此开始条件还受延迟和依赖规则约束。不要把“ISA 语义等价顺序执行”误读成“RTL 每条命令完全串行”。</p>",
          "refs": [
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 1,
              "label": "并发与顺序语义"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 523,
              "label": "done 映射到窗口 slot"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 728,
              "label": "同单元依赖与 VPU 例外"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-dependencies",
      "title": "scoreboard 与 WAITC：同一种正确性，两种成本",
      "kicker": "04 / DEPENDENCE TRACKING",
      "summary": "RAW/WAR/WAW 是对地址范围的冲突，TMEM bank 仲裁是同一拍端口资源冲突。两者必须分开理解。",
      "sections": [
        {
          "title": "RAW、WAR、WAW 到底比较什么",
          "body": "<p>RAW：年轻命令读一个老命令将写的位置；WAR：年轻命令想写老命令尚未读完的位置；WAW：两者写同一位置。这里只读/只读不构成冲突；DRAM 与 TMEM 即使数字地址相同，也不是同一个空间。footprint 以半开区间 [lo,hi) 描述范围，相交条件是 <code>a.lo &lt; b.hi &amp;&amp; b.lo &lt; a.hi</code>。</p><p>例如 LD 写 T[0,128)，QACT 读 T[0,128)，MM 读 ACT row 0、写 T[256,320)，VOP 读 T[256,320)：形成 LD→QACT→MM→VOP。另一个 LD 写 T[1024,1152) 可能提前执行。若 footprint 太大，只会丢掉并行；漏掉一个范围则可能产生错误结果，因此实现倾向保守。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_pkg.sv",
              "line": 74,
              "label": "范围和 footprint 结构"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 236,
              "label": "实际冲突比较逻辑"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 107,
              "label": "按空间压缩的 footprint"
            }
          ]
        },
        {
          "title": "基础 scoreboard 的位图怎样解除依赖",
          "body": "<p>dispatch 时对每个有效老 slot 做 conflict()，把结果记入新 slot 的 sdep；MXU 另有只含 DRAM 冲突的 sdepd。单位选择候选时先看依赖是否消失，再按年龄找最老的 ready。done 产生 fin 位图，各 slot 清除已经结束的 producer。</p><p>自己写最小原型可先固定四个 slot，每条命令只读写一个连续范围，用 N×N 依赖 bit 和年龄计数表示。验证应覆盖 slot 复用、同拍完成/分派、RAW/WAR/WAW、相邻不相交范围、不同空间以及 BAR。不要一开始就用推测执行和复杂 reorder buffer；本项目的重点是 memory footprint 调度。</p>",
          "refs": [
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 531,
              "label": "依赖生成与空 slot"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 741,
              "label": "最老 ready 选择"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 1064,
              "label": "dispatch 更新"
            }
          ]
        },
        {
          "title": "为什么 MXU 分成 start 与 release 两次许可",
          "body": "<p>MM 有两种本质不同的资源依赖：权重从 DRAM 预取，驻留 ACT 操作数可能由尚未完成的 QACT 产生。sequencer 可在 DRAM 依赖清除后发 <code>ustart</code>，让 issuer 提前把权重和 scales 读进 FIFO；等所有依赖清除后才发 <code>urel</code>，许可 consumer 访问 ACT 和生成输出。</p><p>若把 start 当成“立刻开始乘法”，就会误判 QACT/MM 之间的数据竞争。最小实现可用一条命令的 fetched/released/consumed 三状态，只有 fetched &amp;&amp; released 才 pop 权重；再扩为两个 command slots，让下一命令读权重与上一命令计算/排出重叠。</p>",
          "refs": [
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 14,
              "label": "两阶段 MM 发射"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 815,
              "label": "release 条件"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 41,
              "label": "双命令 issuer/consumer"
            }
          ]
        },
        {
          "title": "当前 m4 使用 WAITC：编译器生成等待表",
          "body": "<p>target 的 SEQ_WC=true 映射到 sequencer 的 WAITC。每条指令旁边还有 64-bit wait entry，编码为 7 个 4-bit 字段与 VPU 前 31 条指令的依赖 mask；k3 保留为 0，k0/k1/k2/k4 等四类单元，k5/k6 专管 MM 预取对 DMA/quantizer 的等待。硬件打包宽度是 28+31 bits。DMA/MXU/QUANT/COLL 按本单元顺序开始/完成，计数表示还需等到某个历史位置；VPU 可挑最老 ready，故需要 mask 而不是单个累计完成数。</p><p>WAITC 用软件已算出的信息替代地址范围比较，缩短 RTL 依赖路径；代价是程序镜像和硬件模式必须匹配。loader 不只搬指令，还要把 sidecar 送进对应 RAM。只给 WAITC 板卡加载裸指令，即使 opcode 编码正确，也违反运行契约。源码含用于检查 wait entries 是否覆盖真实 conflict 的仿真 assertions；本教学没有把该检查描述成已运行的整机验证。</p>",
          "refs": [
            {
              "path": "targets/ypcb-00338.toml",
              "line": 29,
              "label": "SEQ_WC 选择"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 399,
              "label": "wait entry 打包和 sidecar RAM"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 564,
              "label": "计数和 VPU pending"
            },
            {
              "path": "docs/isa.md",
              "line": 503,
              "label": "WAITC 程序镜像合约"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 966,
              "label": "wait entry 覆盖性检查"
            }
          ]
        },
        {
          "title": "两种“等待”不要混淆：依赖 ready 与端口 grant",
          "body": "<p>一个 VOP 可能在 scoreboard 上已 ready，并且已经 start，随后因为同拍 DMA 写了相同 TMEM bank 而被 hold。前者决定命令是否可以开始，后者决定其流水某一拍能否前进。前者跟命令的数据生存期有关，后者跟 RAM 的物理端口有关。</p><p>自己写 RTL 时为两类事件单独计数：等待 producer 的周期数和请求 bank 但未获 grant 的周期数。若把所有停顿合并为 busy，就无法判断加大 MXU、增加 TMEM 端口还是改软件调度哪一项有用。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 618,
              "label": "TMEM bank arbiter"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 1031,
              "label": "P/Q 和单元停顿观测"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 1042,
              "label": "依赖 ready 时刻"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-tmem",
      "title": "TMEM：bank、复制、replay 与真实 RAM 端口",
      "kicker": "05 / SCRATCHPAD MICROARCHITECTURE",
      "summary": "用显式 scratchpad 学习多端口存储的实现成本，比把每个并行访问都写成数组读更接近真正硬件。",
      "sections": [
        {
          "title": "bank mapping：地址为什么决定并行度",
          "body": "<p>TMEM 有 LANES 个 bank，<code>bank = word_address mod LANES</code>。LANES=8 时，连续 8 words 跨过所有 bank，适合每周期 8 元素的 VPU；stride=8 的一组地址却全落同一个 bank。逻辑容量足够不代表端口带宽足够。</p><p>连续向量端口可用 barrel rotator 将 lane 对齐到 bank：若起始地址 mod 8=3，lane0→bank3、lane5→bank0 并跨到下一 bank row。MXU epilogue 写多个输出行，地址可能不连续，因此保留通用 crossbar。代码对本应连续的端口和同端口 bank 冲突有仿真检查，避免用不合法行为得到虚假性能。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 1,
              "label": "bank 与接口概念"
            },
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 24,
              "label": "rotator 与 general crossbar"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 138,
              "label": "输出 stride 决定 conflict-free drain"
            }
          ]
        },
        {
          "title": "IMPL0：用物理复制换多读口",
          "body": "<p>普通 FPGA BRAM 没有八个任意读端口。IMPL0 给不同读口做多份逻辑相同的数据副本，每个副本有 LANES banks；所有写广播到所有副本。这样不同读口大多不争 RAM，只剩同 bank 的写端口限制。guest ports 则共享 host port 的副本以省资源。</p><p>这不是缓存副本：没有不同 tag、替换或延迟一致性的协议，写同时传播到全部复制体，它们表达同一块 TMEM。好处是简化读仲裁，代价是 BRAM 成本随读口数增加。自己实现时可以先做 2R1W RAM，两份 1R1W/SDP RAM 同写、分别读，再扩展 bank 和 bypass。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 6,
              "label": "每读口副本与写广播"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 154,
              "label": "端口映射和 ARB_MASK"
            }
          ]
        },
        {
          "title": "IMPL1：较少副本需要按 copy/bank 仲裁",
          "body": "<p>ASIC SRAM 宏的复制成本不能忽略，IMPL1 把多个读口分配到 NCP 份 RAM。一个单元的不同读端口尽量分到不同 copy，避免单独执行也必冲突；共享 copy 的不同单元则通过优先仲裁限制每 bank 的读数。</p><p>RQ 选项让 RAM 地址由请求优先级决定，grant 再确认所选地址属于获得许可的单元，目的是切断 grant→RAM address 的长组合路径。这个例子说明面积、并发和时序相互制约：算法上少复制节省容量，物理上却可能增加地址选择、仲裁和布线的关键路径。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 34,
              "label": "banked SRAM 与请求地址选择"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 161,
              "label": "copy 分组和优先级"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 837,
              "label": "banked arbiter"
            }
          ]
        },
        {
          "title": "IMPL3：当前 target 的单拷贝与丢读重放",
          "body": "<p>IMPL3 把每个 bank 拆成多个 subbank，多个端口争同个物理 RAM 时有的读先赢，有的读记入 replay buffer。<code>lost[p]</code> 告诉 slice：这一读没有成功，下一周期需 hold 该单元并用保存的 bank/row/lane 再读。已经成功的 lane 不能混入后续新请求。</p><p>replay 必须同时证明两件事：重读仍返回第一次应观察到的数据；持续冲突下也最终能赢。源码检查“等待重放的 word 在重放前没有被不允许的写覆盖”，并为多个 replay 保存年龄，防止轮流抢占造成 livelock。自己实现先固定两个读口和两个 subbank，先写逐拍测试，再加 guest、hash、pumping，别把全部旋钮一起打开。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 371,
              "label": "单拷贝实现与 replay 合约"
            },
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 519,
              "label": "replay 年龄与前进性"
            },
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 652,
              "label": "lost 与 replay registers"
            },
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 671,
              "label": "重放数据和前进性检查"
            }
          ]
        },
        {
          "title": "pumping、写流水和 bypass 是时序功能",
          "body": "<p>PMP=1 让真正双端口 RAM 在 clk_f=2×clk 运行，一个 core 周期内安排更多 RAM 工作。它要求两时钟相位关系由平台保证；不是给任意逻辑“翻倍时钟”就能安全使用。PMP=2 是 core-clock 的模型，不能拿它直接当 FPGA 物理实现。</p><p>TMEM 还有 IQ 输入级和延迟写入。普通分支用 pending write bypass 让尚未落 RAM 的写仍能被正确读到；pumped RAM 的时序安排又改变 bypass 需求。学习时必须标注一次写在“获得 grant”“寄存”“真正落 RAM”各在何拍，以及一个读观察哪一版；不能将所有非阻塞赋值都看成同一时刻完成。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 124,
              "label": "IQ 输入级与顺序"
            },
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 235,
              "label": "延迟写与 bypass"
            },
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 398,
              "label": "PMP 的两倍时钟语义"
            },
            {
              "path": "rtl/mem/otpu_tmem.sv",
              "line": 1094,
              "label": "pumped bank 实现"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-quant-act",
      "title": "量化与 ACT RAM：计算开始前的数据准备",
      "kicker": "06 / QUANTIZATION & STATIONARY DATA",
      "summary": "矩阵单元并不直接把 TMEM FP32 喂进 INT8 乘法器；QACT 和 scale records 把两种数值表示连接起来。",
      "sections": [
        {
          "title": "QACT 与 QST 为什么是两条命令",
          "body": "<p>QACT 将 TMEM FP32 行量化成 ACT RAM 的驻留 INT8 操作数，供后续 MM 复用。QST 将 TMEM FP32 量化并写入 DRAM byte 数据及 scale rows，适合量化缓存或下一次作为 streamed operand 读取。它们共享 quantizer，但目标端口、布局和完成条件不同。</p><p>量化不仅是截断为 8 位：每行求 amax，scale S=amax/127，分组 offset d 帮小幅值组利用更多 INT8 级别；值经过可选 row/column prescale 再舍入。零行、溢出和舍入边界必须服从 ISA 的数值语义。用普通浮点库的近似输出替代，可能在阈值边缘量化到另一个整数。</p>",
          "refs": [
            {
              "path": "rtl/vpu/otpu_quant.sv",
              "line": 1,
              "label": "quantizer 的数学公式与数据通路"
            },
            {
              "path": "docs/isa.md",
              "line": 269,
              "label": "QACT/QST 编码和布局"
            }
          ]
        },
        {
          "title": "为什么先求 max，再量化：两遍和 row buffer",
          "body": "<p>在读完一行之前不知道 amax，因此基本量化要两遍读：pass0 做 prescale、abs、chunk max、行 max 和 scale；pass1 用 scale/offset 再读数据并生成 INT8。二者间要处理倒数计算延迟和不同组的 max 存储。</p><p>XD&gt;0 时，可容纳的 QACT 行把 prescaled chunks 放进 row FIFO，第二遍从 FIFO 取，从而省一次 TMEM read 和 prescale。最多四行在两遍之间，用 row-bank 保留 scales/group maxima，并在 read 发出时预留 FIFO credits，防止不可背压的数据回包把缓冲挤爆。这个优化以额外 RAM 换 TMEM 带宽，不能简单算作“quantizer 每拍恒定完成 LANES 个结果”。</p>",
          "refs": [
            {
              "path": "rtl/vpu/otpu_quant.sv",
              "line": 7,
              "label": "两遍流水"
            },
            {
              "path": "rtl/vpu/otpu_quant.sv",
              "line": 21,
              "label": "XD row buffer 与四行 banks"
            },
            {
              "path": "rtl/vpu/otpu_quant.sv",
              "line": 135,
              "label": "quantizer 参数"
            }
          ]
        },
        {
          "title": "scale unit：倒数也有可验证的操作序列",
          "body": "<p><code>otpu_qscale</code> 使用种子、两次 Newton 迭代和修正来求 reciprocal，再生成 S 和 inv。这里的 fp_mul/fp_add 是项目定义的 binary32 路径，包含 round-to-nearest-even 和 flush-to-zero 规则；固定运算顺序是 bit-exact 比对的基础。</p><p>自己实现时先写 Python bit-level reference，确定每一步舍入，再把每级 pipeline 的 data、valid、row tag 和 enable 一同延迟。只延迟数值而漏掉 tag，会把上一行 scale 用在下一行数据；遇到 gnt=0 时必须整体 hold，而不是只有主计数器停。</p>",
          "refs": [
            {
              "path": "rtl/vpu/otpu_quant.sv",
              "line": 61,
              "label": "qscale 模块与 latency"
            },
            {
              "path": "rtl/vpu/otpu_quant.sv",
              "line": 100,
              "label": "Newton 迭代与 correction"
            },
            {
              "path": "rtl/vpu/otpu_fp.sv",
              "line": 1,
              "label": "项目 fp32 约定"
            }
          ]
        },
        {
          "title": "ACT RAM 的形状与写读安全",
          "body": "<p>ACT RAM 逻辑形状为 ROWS×BLOCKS×D bytes；每 (row,block) 还有 64-bit record <code>{da3,da2,da1,da0,Sa}</code>。quantizer 每拍写 LANES 个连续字节，MXU 每列取一个完整 D-byte block 和 scale。MCOLS 小于 ACT_ROWS 时，以 group 选择复用物理列存储。</p><p>QACT 写经过窄寄存和局部放置级才到 BRAM；done 与 sequencer 的 release 留出了落地时间，仿真还有 r_use 检查。DUP 用于 4-bit PAIR 的数据布局复制，不能把它解释成缓存一致性复制。自己写时要覆盖读写同块同拍返回旧值、group 切换、DUP row 边界和最后一笔写后马上开始 MM。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_actram.sv",
              "line": 1,
              "label": "ACT 组织与写流水"
            },
            {
              "path": "rtl/mem/otpu_actram.sv",
              "line": 21,
              "label": "读写接口"
            },
            {
              "path": "rtl/mem/otpu_actram.sv",
              "line": 57,
              "label": "group 和 bank 选择约束"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-mxu",
      "title": "MXU：从一个点积到真正的流水矩阵单元",
      "kicker": "07 / SYSTOLIC MATRIX ENGINE",
      "summary": "跟着一份 streamed weight chunk，穿过预取、ACT reuse、整数精确累加、scale epilogue 和 TMEM drain。",
      "sections": [
        {
          "title": "MM 的矩阵方向与驻留行复用",
          "body": "<p>把 ACT 的 M 行看作 A[M,K]，DRAM streamed operand 的 N 行看作 W[N,K]，输出是 A×Wᵀ，形状 M×N。每次从 DRAM 读一个 D-byte 权重 chunk，可与至多 MCOLS 条 ACT 驻留行做点积；这就是减少权重流量的复用来源。</p><p>D=128、MCOLS=4 的 INT8 情况，一个计算 advance 最多涉及 4×128=512 个 INT8 乘积，但 advance 会受 FIFO、scale、命令边界和 drain 限制，且不同数据格式有不同节奏。不能将这个乘积直接标为每秒实测算力。先计算访存量与理想上界，再用计数器找真实空泡。</p>",
          "refs": [
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 1,
              "label": "streamed/stationary 数据流"
            },
            {
              "path": "docs/isa.md",
              "line": 179,
              "label": "MM 形状和 stride 字段"
            }
          ]
        },
        {
          "title": "systolic 不是必须画成方形 2D 网格",
          "body": "<p>本实现把乘积沿 DSP cascade 链传递，<code>CLS=min(CL,D/8)</code>，每组 D/8 元素由一条或两条链产生整数 group sum。各列错开一拍，列端再按 block/group scale 对齐、累加，最后 deskew 回到同一输出行。</p><p>关键是局部连接、逐拍传播和流水重用，不是图上有没有 16×16 正方形。真实技术 <code>otpu_pe</code> / <code>otpu_mxce</code> 在 generic、xilinx7、xilinxus 目录有相同接口的不同实现；当前 target 选择 Xilinx7 DSP48E1。自己写最小版先做 4 元素链，给每个值标 k 和 valid，看第 k 个乘积在何拍到列端，再扩 MCOLS。</p>",
          "refs": [
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 17,
              "label": "DSP cascade、skew 和 deskew"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 117,
              "label": "CLS、CPG、LROW"
            },
            {
              "path": "rtl/tech/xilinx7/otpu_tech_dsp.sv",
              "line": 17,
              "label": "PE 的技术实现"
            },
            {
              "path": "rtl/tech/generic/otpu_tech_dsp.sv",
              "line": 12,
              "label": "generic 算术实现"
            }
          ]
        },
        {
          "title": "整数累加与 FP32 epilogue 分开的原因",
          "body": "<p>MX 数值先对 INT8 激活、不同权重格式的 group sum 做整数缩放，整行保留 48-bit 精确累加；最后只对每个输出做 i2f48，再乘权重行 Sw 和激活行 Sa·2⁻ᵂ。这样大量 MAC 不需要每次 FP32 舍入，scale 又能在最终恢复幅值。</p><p>epilogue 由 E 条共享 lanes 排出，MXU_E 可以小于 MCOLS。m4 显式 E=4，恰好匹配四列；模块默认 E=0 则推导为 MCOLS/2（至少 1）。ACC/ASCALE 会读旧 TMEM 做 read-modify-write，RMAX 另写行最大值；这些额外范围必须进入 scoreboard，否则“矩阵结果正确但后处理冲突”仍会出错。</p>",
          "refs": [
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 4,
              "label": "精确整数及输出公式"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 22,
              "label": "result FIFO 和 drain"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 113,
              "label": "epilogue lane 推导"
            },
            {
              "path": "rtl/seq/otpu_seq.sv",
              "line": 118,
              "label": "RMAX 范围 hull"
            }
          ]
        },
        {
          "title": "issuer、FIFO 和 consumer 如何吸收 DRAM 延迟",
          "body": "<p>issuer 负责读 weight chunks 和 scale lines，并为每笔 scale 请求保留 tag；consumer 只在一整行所需 chunks/scales 都已到位且命令已 release 时开始。这使一行进入阵列后不在中间被 DRAM 空泡打断，阵列无需逐级 clock-enable。</p><p>两条 command slots 让较年轻命令预取与较老命令 drain 重叠；结果 FIFO 把整数阵列与受 TMEM grant 控制的 epilogue 分离。三个缓冲不能混为一个 FIFO：输入 chunk/scale FIFO 解决外存延迟，command queue 解决命令重叠，result FIFO 解决输出背压。</p>",
          "refs": [
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 27,
              "label": "scale 请求 tag 和 FIFOs"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 41,
              "label": "两条命令和整行启动条件"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 123,
              "label": "result FIFO 深度与在途行"
            }
          ]
        },
        {
          "title": "ACT_ROWS 大于 MCOLS：权重本地 replay",
          "body": "<p>m4 可一次 MM 指定最多 16 条驻留行，但只有 4 个物理 columns。一个 streamed row 在 FIFO 内被消费 ceil(M/MCOLS) 次：前几组只移动读位置而不释放 chunks，最后一组才真正释放。因此同一权重从 DRAM 只流入一次，却服务所有 M 行。</p><p>这要求整条 streamed row 的 chunks 放得进 FIFO；源码显式检查 M&gt;MCOLS 时的 KB/DEPTH 约束。区别于 TMEM 的“丢读重放”：这里是有意计算复用，TMEM replay 则修复物理读冲突。两者都叫 replay，但数据、触发条件和正确性证明完全不同。</p>",
          "refs": [
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 34,
              "label": "驻留行分组复用"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 148,
              "label": "replayed row 容量检查"
            },
            {
              "path": "rtl/mem/otpu_actram.sv",
              "line": 6,
              "label": "ACT group 对应物理列"
            }
          ]
        },
        {
          "title": "4-bit、PAIR 与输出 bank 冲突",
          "body": "<p>4-bit 权重的一个 D-byte chunk 装两块，通常分两次 advance 消费；PAIR 在 2M≤MCOLS 时用两组 columns 同时处理低/高块，再在入结果 FIFO 前把两份整数相加。它利用闲置列提高小 M（尤其 decode）时的数据吞吐，但不是“所有 4-bit 矩阵都自动快两倍”。</p><p>输出 stride ors 也影响速度。相邻物理 columns 写不同输出行，若 ors 是 LANES 的倍数，它们可能全命中同 bank，drain 一拍只能写较少结果。<code>drain_run()</code> 按 gcd(ors,LANES) 计算无冲突 run；这是软件布局能显著影响微架构利用率的直接例子。</p>",
          "refs": [
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 10,
              "label": "4-bit 与 PAIR"
            },
            {
              "path": "rtl/mxu/otpu_mxu.sv",
              "line": 138,
              "label": "drain_run 与输出 bank 映射"
            },
            {
              "path": "docs/isa.md",
              "line": 257,
              "label": "column reuse 契约"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-vpu",
      "title": "VPU、归约和 stream engine：矩阵之外的工作",
      "kicker": "08 / VECTOR & STREAM COMPUTE",
      "summary": "Transformer 中的 norm、softmax、非线性和状态更新都需要矩阵单元之外的微架构。",
      "sections": [
        {
          "title": "VOP 把 tile 映射到 lanes",
          "body": "<p>VPU 每次沿 TMEM tile 的一行处理 LANES 个 FP32 元素。A/B 可取完整 tile、每行广播、每列广播或标量 immediate；函数决定读哪些端口、走哪些槽位以及写回延迟。COPY/FILL/MAX 等也要经过地址和写回通路，并非“零成本指令”。</p><p>tile 的 rows、cols、stride 与 lane mask 控制尾部。若 cols 不是 LANES 整数倍，最后一组必须禁用越界 lane；读 mask、写 mask 和归约中填的零/负无穷不能混用。自己写最小 VPU 时从 ADD 和 COPY 开始，先验证非对齐起始地址与尾 mask，再加广播。</p>",
          "refs": [
            {
              "path": "rtl/vpu/otpu_vpu.sv",
              "line": 1,
              "label": "lanes 和广播形态"
            },
            {
              "path": "docs/isa.md",
              "line": 299,
              "label": "VOP 字段与函数"
            }
          ]
        },
        {
          "title": "复合函数是固定浮点操作程序",
          "body": "<p>EXP2、RECIP、RSQRT、LOG2 被实现成固定 fp_mul/fp_add 序列：多项式、Newton 迭代和修正，近似误差与运算顺序都属于 ISA 约定。无 stream engine 时，一部分 long lanes 有多级 slot chain；短 lanes 只支持较简单函数，故 composite issue 宽度可能是 CL 而非 LANES。</p><p>有 stream engine 时，COMP8 可让八 lanes 复用 slot0 和 tail 的部分 stage，按微码多次迭代。函数较长不必然意味着每元素独占整个单元直到结束，要看 issue 节奏、循环资源和 write order。用一个统一“VPU 每周期 8 ops”估算 softmax 会严重失真。</p>",
          "refs": [
            {
              "path": "rtl/vpu/otpu_vpu.sv",
              "line": 5,
              "label": "slot 数与 composite functions"
            },
            {
              "path": "rtl/vpu/otpu_vpu.sv",
              "line": 72,
              "label": "COMP8 复用路径"
            },
            {
              "path": "rtl/vpu/otpu_se_comp.sv",
              "line": 1,
              "label": "复合函数微码引擎"
            },
            {
              "path": "rtl/vpu/otpu_fp.sv",
              "line": 23,
              "label": "多项式常量与算法"
            }
          ]
        },
        {
          "title": "归约为什么不直接写 for 循环相加",
          "body": "<p>FP32 加法不满足结合律；把一串数改成另一棵树可能改变 bit pattern。RSUM/RSSQ/RDOT 按固定 64 partials 的 isum_64 顺序：lane 负责若干 partial，流水 adder 形成 RL=64/LANES chunks 的反馈循环，再按固定树折叠。RMAX/ARGMAX 用比较树，argmax 在相等时选低 index。</p><p>RDOT 先存每行结果，最后集中写回，可避免流式读取时与 DMA 的 TMEM 写竞争。自己实现先在 reference 中明确求和顺序与 padding，再做流水；只比较小整数和不足以发现浮点归约错误，必须加入大/小数混合、抵消、+0/-0 和边界舍入。</p>",
          "refs": [
            {
              "path": "rtl/vpu/otpu_vpu.sv",
              "line": 25,
              "label": "归约的 64 partials 和比较规则"
            },
            {
              "path": "rtl/vpu/otpu_vpu.sv",
              "line": 38,
              "label": "RDOT 结果缓冲"
            },
            {
              "path": "rtl/vpu/otpu_vtree.sv",
              "line": 1,
              "label": "归约树实现"
            }
          ]
        },
        {
          "title": "WBUF 与前后端分离：背压不是随便停一拍",
          "body": "<p>基础 VPU 在 TMEM grant 低时整个计算进度 hold；WBUF 让 grant 只弹出缓冲头，内部前端靠已登记的 room enable 继续。读 replay 会在下一周期 hold 前端，后端按延后一拍的 en_b 对应停下，保证归约反馈、metadata 与数据仍同一节奏。</p><p>这类设计的正确性来自“每一个 advance 都对应一份有效输入和足够的输出空间”。自己加 buffer 时要把所有 in-flight writes 算进 credits；不能只看 FIFO 当前不满，就忽略流水中下一拍还会到来的结果。源码的 front/back 描述值得逐句对着寄存器副本看。</p>",
          "refs": [
            {
              "path": "rtl/vpu/otpu_vpu.sv",
              "line": 42,
              "label": "grant、WBUF 与前后端"
            },
            {
              "path": "rtl/vpu/otpu_vpu.sv",
              "line": 49,
              "label": "en / en_b 和 metadata 延迟"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 540,
              "label": "VPU WBUF/replay 连线"
            }
          ]
        },
        {
          "title": "STREAM 如何借用 VPU 做状态矩阵更新",
          "body": "<p>DSTEP/STREAM 由 DMA 驱动 DRAM 状态数据，先拉高 ss_req，等待 VPU 的 VOP 全部排空、ss_gnt 许可，随后 DMA 填向量/标量，再逐 segment 推入 SE。VPU 的 slot0 reduction 和 tail 进行 dot、更新和输出，结果 segment 回 DMA 聚合后写回 DRAM，row output 回 TMEM。</p><p>这让 Gated DeltaNet 等状态更新绕过“每次先搬整矩阵进 TMEM”的成本。它也意味着 SE 与普通 VOP 共享资源，不是可以永远与 VPU 并发的独立第三处理器。硬件只支持 STREAM 描述符的子集；新增描述符语义要同步 ISA、reference、DMA、SE 和测试。</p>",
          "refs": [
            {
              "path": "rtl/dma/otpu_dma.sv",
              "line": 17,
              "label": "DSTEP/STREAM 流程"
            },
            {
              "path": "rtl/vpu/otpu_vpu.sv",
              "line": 60,
              "label": "SE 请求与 VOP 排空"
            },
            {
              "path": "rtl/vpu/otpu_se_tail.sv",
              "line": 1,
              "label": "stream tail"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 154,
              "label": "HAS_SS 的条件"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-dma",
      "title": "DMA：请求可以拒绝，响应却不能丢",
      "kicker": "09 / MOVEMENT & BACKPRESSURE",
      "summary": "搬运模块的难点不是地址加法，而是在任意延迟、背压、mask 和写完成下保证每个字节恰好出现一次。",
      "sections": [
        {
          "title": "chunk 与 segment：两侧宽度不同",
          "body": "<p>DRAM B 一次搬 D bytes，TMEM 一拍搬 W=min(D/4,LANES) 个 words。D=128、LANES=8 时一个 chunk 是 32 words，要拆成 4 个 8-word segments。DMA 对 transfer 触及的每个对齐 chunk 只请求一次，首尾 partial segment 用 mask 保留所需 words。</p><p>LD 把回来的 chunk 放 buffer，之后按 segment 写 TMEM；ST 从 TMEM 逐 segment 收集成 chunk，附 word mask 后写 DRAM。设计中地址、word mask、buffer slot 和数据必须作为同一事务推进，单独给 b_addr++ 而忘了 tail mask 是典型 bug。</p>",
          "refs": [
            {
              "path": "rtl/dma/otpu_dma.sv",
              "line": 1,
              "label": "chunk/segment 和首尾 mask"
            },
            {
              "path": "rtl/dma/otpu_dma.sv",
              "line": 95,
              "label": "CW/W/SPC 推导"
            }
          ]
        },
        {
          "title": "read credit：在发请求时预留响应空间",
          "body": "<p>DRAM read response 没有反压，不能说“回包时 FIFO 满了就让它等等”。DMA 发请求的当拍先 reserve 一个 chunk slot，只有剩余 credits 足够才继续读。buffer occupancy 包含已经回来和尚在路上的数据，不能只数当前 FIFO valid。</p><p>最小原型可维护 issued、received、consumed 三个单调计数，约束 issued−consumed≤DEPTH、received≤issued、consumed≤received。固定延迟测试很容易遮住问题；随机拉低 request ready、随机但保序延迟 read response、长期停止 TMEM grant 才能验证缓冲是否真的安全。</p>",
          "refs": [
            {
              "path": "rtl/dma/otpu_dma.sv",
              "line": 7,
              "label": "请求时预留 chunk slot"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 10,
              "label": "DRAM request/response 契约"
            },
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 27,
              "label": "native adapter 响应 credits"
            }
          ]
        },
        {
          "title": "ST 完成要等写被内存接收",
          "body": "<p>ST 可能把最后一个 chunk 交给 slice 的输出寄存器，但写仍在 adapter queue 或 memory controller 中。故 DMA done 要等 wr_idle，系统状态还要计入 slice 自己停留的 SW/B requests。否则主机一见 HALTED 就读取结果，有可能看见旧内容。</p><p>ST 把收集好的 chunks 成 runs 连续发出，降低 DRAM read/write turnaround：DMA 有 B 口优先权，发一段写期间不夹杂 MXU 的 weight read。这里既有正确性上的完成 fence，也有性能上的请求批处理，应分别观测。</p>",
          "refs": [
            {
              "path": "rtl/dma/otpu_dma.sv",
              "line": 10,
              "label": "ST write runs"
            },
            {
              "path": "rtl/dma/otpu_dma.sv",
              "line": 38,
              "label": "done 等待 wr_idle"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 911,
              "label": "slice 输出寄存器也计入未完成写"
            }
          ]
        },
        {
          "title": "WAITW：主机与正在运行的程序握手",
          "body": "<p>WAITW 周期读一个主机写的 DRAM word，比较条件成立才交付到 TMEM；不成立等待指定间隔再读，可设置 timeout。成功时会触发 a_inval，避免后续 MXU 的 scale read 复用到主机刚更新前的旧 A-port 数据。</p><p>这种显式同步不是硬件 coherent cache：主机必须先写所需数据，最后写门铃 word；设备在 WAITW 成功后再读这些数据。自己实现需要定义 timeout 与在途 response 的竞争：本源码允许已经在路上的读若满足条件则正常完成，否则超时且不写 TMEM，避免半完成状态。</p>",
          "refs": [
            {
              "path": "rtl/dma/otpu_dma.sv",
              "line": 31,
              "label": "WAITW 的比较/重试/超时"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 140,
              "label": "a_inval 接口"
            },
            {
              "path": "docs/isa.md",
              "line": 437,
              "label": "WAITW ordering 合约"
            },
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 83,
              "label": "WAITW 后 A 复用数据失效"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-memory-interface",
      "title": "从逻辑 DRAM 到两路 DDR：局部缓存与一致性的边界",
      "kicker": "10 / DRAM ADAPTER & CHANNELS",
      "summary": "地址散列、scale 预取、partial writes、ordering 和 CDC 共同决定真实板卡能否喂饱计算核。",
      "sections": [
        {
          "title": "A、B、SW 三个接口为什么分开",
          "body": "<p>B 搬 D-byte 数据 chunks，DMA 优先于 MXU 权重流；A 为 MXU 读 scale 所在的 32-byte line；SW 接 QST 的 byte-enabled scalar writes。把 QST 写从 A 分离，避免大量量化字节存储阻塞 MXU 的 scale reads。</p><p>slice 先寄存 A/B/SW 输出，request valid 和 payload 在未 ready 时保持；B 的回包也寄存一拍，并用 tag 路由 DMA/MXU。注意 req/rdy 是本地协议，不应套用“请求打一拍就一定收到了”的假设。自己写时为每口规定 accept=req&amp;&amp;rdy，要求 ready 只依赖登记状态，减少组合环。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 1,
              "label": "三个 DRAM 路径和单元优先级"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 938,
              "label": "B mux 与 tag"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 966,
              "label": "B 输出和回包寄存器"
            },
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 95,
              "label": "request handshake"
            }
          ]
        },
        {
          "title": "64-byte beat 与 channel hash",
          "body": "<p>D=128 的一个 chunk 被拆成两路 channel 各一个 64-byte beat。未 hash 时 c=b mod 2；CHASH 开启时 channel 还 XOR chunk index 的 parity，让某些 2 的幂 stride 访问不总压在单路 DDR 上。主机填充/读出 DRAM 必须使用相同地址映射。</p><p>这属于存储通道交织，不是 NoC 路由或 cache home mapping。自己实现先写无 hash 的地址变换及逆变换，再验证任意 byte address round-trip，最后加 hash 并测试顺序流、矩阵转置 stride 和 partial beats。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 9,
              "label": "地址映射与 CHASH"
            },
            {
              "path": "targets/ypcb-00338.toml",
              "line": 54,
              "label": "CHASH 配置"
            },
            {
              "path": "rtl/shell/otpu_board.sv",
              "line": 100,
              "label": "每 slice 两个 native channels"
            }
          ]
        },
        {
          "title": "A-port 复用是局部 scale buffer，不是 coherent hierarchy",
          "body": "<p>scale 读取有局部性：A adapter 可复用上次 beat，miss 时预取连续 APF beats；偏离 run 或写入命中会丢弃相关复用内容。它确实具有小缓存/预取缓冲的功能，但没有通用 tag hierarchy、跨 core sharer directory 或 CPU snoop 协议。</p><p>尤其主机 XDMA 写不经过 native adapter，本地 buffer 无法自动观察所有主机写。故在 run reset、程序 load、WAITW 成功时 a_flush，依靠显式 ordering 防 stale data。理解这一点能帮助判断“为何没有 directory 仍要谈一致性”：这里需要局部新鲜度和可见性契约，不是 MESI 共享缓存协议。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 49,
              "label": "A beat 复用与 APF run"
            },
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 68,
              "label": "写入导致 A run 失效"
            },
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 83,
              "label": "主机写不被 adapter 自动观察"
            }
          ]
        },
        {
          "title": "partial write 的 read-modify-write 竞态",
          "body": "<p>DDR/ECC 控制路径不接受任意 partial beat 时，需先读旧 beat，再保留未修改字节、合并新字节、写完整 beat。若另一写在“旧读”与“整写”之间修改其他字节，整写会覆盖它，形成 lost update。</p><p>SW queue 为分散 QST 写先做 fill read 并保序；QST footprint 覆盖所触及完整 beats，以阻止设备 B 写插入危险范围。主机同样不能写正在运行 QST 的 beats。channel 层的原子 partial RMW 会暂停对应命令流，代价可达一次 read latency；这解释了为什么逐 byte 写需要 gathering，而不是说 DRAM 天然按字节无代价写。</p>",
          "refs": [
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 39,
              "label": "SW gather、fill reads 和 queue"
            },
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 62,
              "label": "QST RMW 的原子性边界"
            },
            {
              "path": "rtl/shell/otpu_mem_ch.sv",
              "line": 40,
              "label": "channel partial RMW"
            }
          ]
        },
        {
          "title": "out-of-order 返回怎样恢复成顺序",
          "body": "<p>channel bridge 为避免单个 DRAM bank 阻塞所有命令，按 bank parity 分到两个 controller native ports。每个 port 保序，两个 port 的读可能相对乱序返回；bridge 在发出时为每个读预留 master FIFO slot，回包按 slot 写入，只有前面 slot 都完成才向上游前移 commit pointer。</p><p>这不是 CPU 指令 reorder buffer，但思想相通：物理完成可乱序，接口承诺仍保序。读 tags 保存 master/slot 等信息；write data 必须在 controller 接收 write command 前已可用，因为 LiteDRAM 某些路径不会等你晚来的 valid。读代码时从“下游到底承诺了什么”反推上游 buffer，而不是只看总线名字。</p>",
          "refs": [
            {
              "path": "rtl/shell/otpu_mem_ch.sv",
              "line": 17,
              "label": "两 native ports 与 read slots"
            },
            {
              "path": "rtl/shell/otpu_mem_ch.sv",
              "line": 30,
              "label": "write data 合约"
            },
            {
              "path": "rtl/shell/otpu_afifo.sv",
              "line": 10,
              "label": "OOO slot 与有序 commit"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-collective",
      "title": "collective 不是 mesh：多 slice 怎样协作",
      "kicker": "11 / INTER-SLICE COORDINATION",
      "summary": "先学当前中心式 BAR/GATHER 的数据和完成条件，再思考扩大规模需要哪些 NoC 机制。",
      "sections": [
        {
          "title": "BAR 与 GATHER 的精确语义",
          "body": "<p>所有 slices 到达同一种 collective 才开始。BAR 只同步；GATHER 从每个 slice 的 TMEM 段读出，再广播写入所有 slices 的目标位置：<code>T_all[dst+s*seg+r*drs+c]=T_s[src+r*srs+c]</code>。单元维护 s/r/c 计数，按 LANES 个连续 words 组织流水。</p><p>所有 slice 必须给出一致的 GATHER 目标形状/stride；源码在仿真中检查命令不一致。整体 grant 是每 slice 本地 grant 的 AND，所以任一 TMEM 口阻塞都可 hold collective。它不是让任意核随意 load 另一个核的缓存行，数据移动和同步都由显式指令触发。</p><p>YPCB 的 Vivado flow 默认 <code>COLL_GATHER=0</code>（自 release r2），S=1 时只构建 <code>otpu_coll_bar</code>；遇到 GATHER 会报告错误。仿真顶层默认 COLL_GATHER=1，S&gt;1 需要完整 GATHER。是否存在这条数据通路必须核对 flow 参数和 CAPS2，不能只看源码中定义了模块。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 1,
              "label": "BAR/GATHER 与 grant"
            },
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 29,
              "label": "collective 状态"
            },
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 90,
              "label": "collective 一致参数检查"
            },
            {
              "path": "docs/isa.md",
              "line": 577,
              "label": "GATHER 形式化语义"
            },
            {
              "path": "boards/ypcb-00338/vivado/create_project.tcl",
              "line": 48,
              "label": "YPCB 默认 BAR-only 的 flow 选择"
            }
          ]
        },
        {
          "title": "四状态机与 ACK 冷却周期",
          "body": "<p><code>C_IDLE</code> 等所有 req，<code>C_RUN</code> 发读/写并排空流水，<code>C_ACK</code> 通知所有 slice 完成，<code>C_COOL</code> 防止尚未降下来的 req 被当成下一条命令。读请求、读数据、写寄存都是不同阶段；“发出最后一个读”不代表最后一个目标写已落下。</p><p>自己写最小 barrier 时就应该保留请求/应答的完整握手：每个参与者持 req 直到 ack，controller 记录或等待所有 req，ack 后要求参与者撤销再复用。只写 <code>ack=&amp;req</code> 容易重复确认；跨 pipeline/clock 时尤其危险。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 29,
              "label": "C_IDLE/C_RUN/C_ACK/C_COOL"
            },
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 110,
              "label": "状态推进"
            },
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 193,
              "label": "ACK 冷却"
            }
          ]
        },
        {
          "title": "BCU1525 跨 SLR：数据管线与 credits",
          "body": "<p>board 在 S&gt;1 时把 slice 分到不同 SLR，控制和 collective 双向经过寄存级。<code>otpu_coll_hub</code> 与每 slice 的 <code>otpu_coll_port</code> 解耦长距离接口，本地端口自己争取 TMEM grant；写入通过队列/credits 控制。</p><p>hub 收到 collective 内部 ack 后还要等待各 port 的 writes 真正 drain，才把 ack 送回 slices。已经确认但还跨线未降的 req 用 blk mask 防重复。这是 interconnect 学习的好入口：传播延迟使“远端现在 ready”不能直接等同“我这拍可以无限发”。但它仍是专门的中心 hub，不是 XY 路由 mesh。</p>",
          "refs": [
            {
              "path": "rtl/shell/otpu_board.sv",
              "line": 15,
              "label": "SLR crossings 与 hub"
            },
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 277,
              "label": "hub/port 协议"
            },
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 325,
              "label": "blk、pending 和 drained"
            }
          ]
        },
        {
          "title": "从 collective 扩展到 NoC：要新增什么",
          "body": "<p>若自己要扩为 mesh，最小非一致性版本可定义 packet{dst,src,op,addr,len,txn_id}，加本地 network interface、每方向 FIFO、route selection、output arbitration 与 ready/credit flow control，先实现单 flit XY 路由和无环请求路径。GATHER 可以由软件分解成点对点传送加 barrier。</p><p>不要只替换一条连线：需要证明背压时 packet 不丢、不重复、头尾不混，多个包公平前进，response 不被 request 堵死。加入 coherence 后还需区分 request/probe/response 的依赖或虚拟网络。本段是扩展设计任务；当前源码没有这些 router 或 directory 模块，应在自己的新目录实现与验证，不能称为上游功能。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_coll.sv",
              "line": 288,
              "label": "当前 hub 作为扩展起点"
            },
            {
              "path": "rtl/shell/otpu_board.sv",
              "line": 1,
              "label": "当前私有内存边界"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-bringup",
      "title": "复位、CDC、可观测性与从零实现路线",
      "kicker": "12 / BUILD A CORRECT SYSTEM",
      "summary": "一个能乘矩阵的组合电路与一个可稳定运行模型的系统之间，还隔着启动、停止、跨时钟与可复现验证。",
      "sections": [
        {
          "title": "LOAD、RUN、HALT CHAIN 的完整生命周期",
          "body": "<p>主机先确认 controller calibrated，RUN=0 时写 PROG_ADDR/PROG_N 和参数，触发 LOAD；loader 等 rd_idle，防 stopped run 的旧回包被当成新程序，再按 chunk 写 IMEM 和 WAITC sidecar，完成后 RUN 拉高开始。停止 RUN 不会撤销 adapter 已接收的写；主机要等 WR_IDLE 再安全复用 DRAM。</p><p>HALT CHAIN 在程序结束时拿标量寄存器指定下一段程序，让 slice 复位执行单元、装入新 IMEM 后继续；TMEM/ACT/DRAM 内容保留。它把设备侧循环扩展为多程序链，不能当普通 CPU jump：loader 与 memory ordering 仍参与。自己实现时写出 start/stop/load/chain 与旧读回包交叉的状态表，比先堆更多算子更有价值。</p>",
          "refs": [
            {
              "path": "rtl/shell/otpu_ctrl.sv",
              "line": 8,
              "label": "LOAD/RUN/WR_IDLE 合约"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 309,
              "label": "HALT CHAIN 状态"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 340,
              "label": "loader 与 sidecar"
            },
            {
              "path": "docs/isa.md",
              "line": 493,
              "label": "HALT CHAIN 保留状态"
            }
          ]
        },
        {
          "title": "CDC：不能直接同步一整条数据总线",
          "body": "<p>core、DDR user clock、PCIe clock 各自独立。异步 FIFO 在本时钟域保存数据，用 Gray-coded pointers 经过两级同步器把“写到了哪/读到了哪”告诉对端；对端看到的是保守滞后的 occupancy，读 credits 必须按这个延迟计算。</p><p>Gray code 保证计数每次加一只变一 bit；若一个周期计数加二，多 bit 同时变化会破坏假设。channel bridge 因此分别跨每 port 的单步 write counts，再在主域相加。复位两侧也必须协调，否则一边指针归零、另一边仍认为旧数据有效。RTL 的 ASYNC_REG 与 max-delay/bus-skew 约束属于实现的一部分。</p>",
          "refs": [
            {
              "path": "rtl/shell/otpu_afifo.sv",
              "line": 1,
              "label": "Gray FIFO"
            },
            {
              "path": "rtl/shell/otpu_afifo.sv",
              "line": 63,
              "label": "指针和两级同步"
            },
            {
              "path": "rtl/shell/otpu_mem_ch.sv",
              "line": 50,
              "label": "write counts 单步跨域"
            },
            {
              "path": "rtl/shell/otpu_mem_ch.sv",
              "line": 71,
              "label": "协调 reset 与时序约束"
            }
          ]
        },
        {
          "title": "先测什么：让每层有自己的 oracle",
          "body": "<p>最低层用 directed/random tests 检查 FIFO、RAM bypass、bank/replay、mask；算术层用 opentpu/fp32.py 的位级定义比对 FP 和量化；命令层用 ISA simulator 比对 TMEM/DRAM；整核再跑编译后的最小 matmul/norm/attention，最后才上模型和板卡。</p><p>最有价值的测试会制造时序差异：随机拒绝 DRAM request、可变回包延迟、连续 SW partial writes、TMEM replay、在途写时停止 RUN、两个 slice 先后到 BAR。仅检查最终一个矩阵对了，不足以发现 reset/credit/deadlock。网页教学演示是解释工具；除明确列出实际运行记录外，不等于上游 RTL 的周期精确验证。</p>",
          "refs": [
            {
              "path": "docs/isa.md",
              "line": 1,
              "label": "ISA 位精确规范"
            },
            {
              "path": "rtl/vpu/otpu_fp.sv",
              "line": 1,
              "label": "fp32 reference 对应关系"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 489,
              "label": "内部启动/复位检查"
            },
            {
              "path": "rtl/mem/otpu_native_dram.sv",
              "line": 31,
              "label": "overflow 与 reserved-room 契约"
            }
          ]
        },
        {
          "title": "从现有计数器定位瓶颈",
          "body": "<p>板卡寄存器提供 CYCLES、ICOUNT、B_RD/B_WR/A_RD/SW_WR、B_STALL 和构建参数；free-running counters 包含 MXU_BUSY、MXU_MAC、VPU_BUSY、QNT_BUSY、DMA_BUSY、TMEM_DENY、DRAM_WAIT、MXU_STARVE。trace 可看到 dispatch/start/end 等事件，帮助区分“没有可用工作”和“有工作但等数据”。</p><p>分析顺序是：先确认 target/CFG_HASH 与程序匹配，再看正确性，然后将总 cycles 分为依赖等待、输入 starvation、输出/端口背压和真实计算。decode 小 M 往往读权重占主导，prefill 多行更能复用权重但可能暴露 MXU 或 VPU 瓶颈。这里是分析方法，不把上游某次性能数字当成本次测量。</p>",
          "refs": [
            {
              "path": "rtl/shell/otpu_ctrl.sv",
              "line": 24,
              "label": "per-run counters"
            },
            {
              "path": "rtl/shell/otpu_ctrl.sv",
              "line": 57,
              "label": "配置身份与 free-running counters"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 1031,
              "label": "P/Q stall 分类"
            },
            {
              "path": "rtl/shell/otpu_trace.sv",
              "line": 1,
              "label": "硬件 trace"
            }
          ]
        },
        {
          "title": "自己写一个最小 openTPU 风格核",
          "body": "<ol><li><b>定义契约。</b>选 D=16/32、LANES=2/4，写指令语义和 Python reference；用 byte/word 单位区分地址。</li><li><b>先写搬运。</b>同步 TMEM + LD/ST DMA，带 mask 和有界 read credits；随机背压仍严格保存数据。</li><li><b>加入量化和点积。</b>先固定 row scale 和简单 INT8 链，再添加 scale records、整数累加和 FP epilogue；与 reference 位比对。</li><li><b>加入命令并发。</b>四 slot 范围 scoreboard，覆盖 RAW/WAR/WAW 和 BAR；建立 start/done 规则后再做 MM start/release。</li><li><b>逐项优化。</b>bank mapping、command/FIFO overlap、TMEM replay 或 WAITC 一次只开一项，并记录正确性和 cycles。</li><li><b>扩展系统。</b>最初用单时钟行为 DRAM；最后接 native ports、CDC、主机寄存器和真实 controller。</li></ol><p>若目标是 coherent manycore，应单列 cache/directory/NoC 支线；它需要不同系统契约，不能靠给 scratchpad 改名完成。实现完成的标准不是画图相似，而是接口、状态、不变量和压力测试全部闭环。</p>",
          "refs": [
            {
              "path": "rtl/top/otpu_pkg.sv",
              "line": 66,
              "label": "命令接口起点"
            },
            {
              "path": "rtl/top/otpu_slice.sv",
              "line": 500,
              "label": "执行单元集成起点"
            },
            {
              "path": "rtl/shell/otpu_board.sv",
              "line": 21,
              "label": "系统集成起点"
            }
          ]
        }
      ]
    }
  ],
  "modules": [
    {
      "id": "host",
      "label": "主机与 PCIe",
      "role": "程序、权重与运行控制",
      "path": "opentpu/host/board.py",
      "line": 1,
      "detail": "主机使用同一 target、地址映射和 CFG_HASH；先加载数据/程序，再通过 AXI4-Lite 控制 RUN/LOAD。主机访问与设备访问依靠明确的可见性/等待规则。",
      "signals": "PCIe XDMA / AXI4-Lite / ARG0..7",
      "children": [
        "board"
      ],
      "kind": "conceptual-subsystem"
    },
    {
      "id": "board",
      "label": "otpu_board",
      "role": "真实板卡加速器外壳",
      "path": "rtl/shell/otpu_board.sv",
      "line": 21,
      "detail": "把 S 个 slice、每 slice 两个 native DDR channel、collective、host registers 和 trace 接起来。S>1 时加入跨 SLR 寄存器和 collective hub。模块默认不是 target 的全部实际配置。",
      "signals": "RUN / LOAD / calib / native n_*",
      "children": [
        "slice",
        "control",
        "native",
        "collective",
        "trace"
      ],
      "kind": "source-module"
    },
    {
      "id": "simtop",
      "label": "otpu_top",
      "role": "行为与控制器仿真顶层",
      "path": "rtl/top/otpu_top.sv",
      "line": 8,
      "detail": "实例化每 slice 私有 DRAM 和 collective。AXI=0 固定延迟，1 native 随机延迟模型，2 LiteDRAM 路径模型；默认 D32/MCOLS8 不等同 m4。",
      "signals": "AXI / S / D / all_halted / any_error",
      "children": [
        "slice",
        "collective"
      ],
      "kind": "source-module"
    },
    {
      "id": "slice",
      "label": "otpu_slice",
      "role": "命令、计算和存储汇合点",
      "path": "rtl/top/otpu_slice.sv",
      "line": 31,
      "detail": "真正连接 sequencer、DMA、MXU、quantizer、VPU、TMEM、ACT；共享端口每拍仲裁。RLD 在本地 collective read port 完成，loader 有独立复位。",
      "signals": "ustart / urdy / udone / gnt / a_* / b_* / sw_*",
      "children": [
        "sequencer",
        "dma",
        "mxu",
        "quantizer",
        "vpu",
        "tmem",
        "actram"
      ],
      "kind": "source-module"
    },
    {
      "id": "sequencer",
      "label": "otpu_seq",
      "role": "取指、依赖与发射",
      "path": "rtl/seq/otpu_seq.sv",
      "line": 31,
      "detail": "同步 IMEM、标量 R、LOOP 栈、WIN slots、年龄矩阵、依赖和开始/完成队列。基线路径比范围；m4 使用编译器 WAITC sidecar。MXU 分 ustart 和 urel。",
      "signals": "ucmd[NUNITS] / ustart / urdy / udone / urel / im_* / sc_*",
      "children": [
        "isa",
        "loader"
      ],
      "kind": "source-module"
    },
    {
      "id": "isa",
      "label": "otpu_pkg",
      "role": "RTL 命令与 footprint 定义",
      "path": "rtl/top/otpu_pkg.sv",
      "line": 3,
      "detail": "定义 opcode、VOP、cmd_t、三个地址空间、footprint 以及单元映射。阅读含糊注释时以 seq 的真实 oldest-ready 逻辑和配置分支为准。",
      "signals": "cmd_t / rng_t / fp_t / unit_of / conflict",
      "children": [],
      "kind": "conceptual-subsystem"
    },
    {
      "id": "loader",
      "label": "slice loader",
      "role": "复位期程序及 sidecar 装载",
      "path": "rtl/top/otpu_slice.sv",
      "line": 340,
      "detail": "等旧读 drain 后独占 B 口搬程序，按 D-byte chunk 写 IMEM；SEQ_WC 模式继续装 wait entries。HALT CHAIN 可在设备侧触发重装。",
      "signals": "ld_start / ld_addr / ld_n / ld_busy / rd_idle / sc_we",
      "children": [],
      "kind": "conceptual-subsystem"
    },
    {
      "id": "dma",
      "label": "otpu_dma",
      "role": "LD/ST、状态流和 WAITW",
      "path": "rtl/dma/otpu_dma.sv",
      "line": 40,
      "detail": "D-byte chunk buffer 与 LANES-word segments 间拆分/聚合；请求时 reserve 响应 slot，ST/STREAM 等 wr_idle。借 VPU SE 处理状态矩阵。",
      "signals": "b_req/b_gnt / t_ren/t_wen / ss_req/ss_gnt / wr_idle",
      "children": [
        "stream"
      ],
      "kind": "source-module"
    },
    {
      "id": "mxu",
      "label": "otpu_mxu",
      "role": "量化矩阵流计算",
      "path": "rtl/mxu/otpu_mxu.sv",
      "line": 45,
      "detail": "权重 B chunk 和 A scales 预取，ACT 驻留行复用，DSP cascade 精确整数累加，result FIFO，FP32 epilogue 与 TMEM drain。支持 ACT group replay 和特定 4-bit PAIR。",
      "signals": "start/go / a_* / b_* / act_* / t_* / t_gnt",
      "children": [
        "pe",
        "epilogue"
      ],
      "kind": "source-module"
    },
    {
      "id": "pe",
      "label": "otpu_pe / otpu_mxce",
      "role": "DSP 链和列端",
      "path": "rtl/tech/xilinx7/otpu_tech_dsp.sv",
      "line": 17,
      "detail": "相同接口在 generic / xilinx7 / xilinxus 技术目录有不同映射。m4 使用 DSP48E1；不能把 generic 的组合算术数量直接当物理 DSP 数。",
      "signals": "FIRST / LAST / WREG / CPG / cascade",
      "children": [],
      "kind": "source-module"
    },
    {
      "id": "epilogue",
      "label": "MXU epilogue",
      "role": "整数结果恢复 FP32 并写回",
      "path": "rtl/mxu/otpu_mxu.sv",
      "line": 113,
      "detail": "E 条共享 lanes 做 i2f48、两次 scale multiply、ACC/ASCALE 读改写、RMAX 与 TMEM bank-aware drain；与阵列由结果 FIFO 解耦。",
      "signals": "EL / RF / t_raddr / t_waddr / drain_run",
      "children": [],
      "kind": "conceptual-subsystem"
    },
    {
      "id": "quantizer",
      "label": "otpu_quant",
      "role": "量化数据与 scale 生成",
      "path": "rtl/vpu/otpu_quant.sv",
      "line": 135,
      "detail": "pass0 求 row/group max、scale；pass1 生成 bytes。QACT 可用 XD row buffer，QST 写 DRAM，done 考虑 write acknowledge。",
      "signals": "start/done / t_ren* / act_we / asc_we / a_want / wr_idle",
      "children": [
        "qscale"
      ],
      "kind": "source-module"
    },
    {
      "id": "qscale",
      "label": "otpu_qscale",
      "role": "倒数迭代和 scale 流水",
      "path": "rtl/vpu/otpu_quant.sv",
      "line": 61,
      "detail": "种子、Newton 迭代和 correction 产生 S 与 inv；valid、row tag、数据和 enable 全程同步。",
      "signals": "iv/ov / itag/otag / amax / sc / inv",
      "children": [],
      "kind": "source-module"
    },
    {
      "id": "actram",
      "label": "otpu_actram",
      "role": "量化驻留矩阵",
      "path": "rtl/mem/otpu_actram.sv",
      "line": 21,
      "detail": "row×block×D INT8 加 64-bit scale records。MCOLS physical columns 通过 groups 支持更多 ACT_ROWS；写经寄存分布到 BRAM，读采用 read-first。",
      "signals": "we/w_row/w_idx / ren/r_blk/r_grp / r_data/r_scale",
      "children": [],
      "kind": "source-module"
    },
    {
      "id": "tmem",
      "label": "otpu_tmem",
      "role": "banked FP32 scratchpad",
      "path": "rtl/mem/otpu_tmem.sv",
      "line": 46,
      "detail": "逻辑 word-addressed bank memory。IMPL0 每读口副本，IMPL1 少副本银行化，m4 IMPL3 单拷贝/subbank/2x pumping/replay；不是 coherent cache。",
      "signals": "r_req/r_en / w_req/w_en / lost/frz / clk_f / IQ",
      "children": [],
      "kind": "source-module"
    },
    {
      "id": "vpu",
      "label": "otpu_vpu",
      "role": "FP32 elementwise、归约与 SE",
      "path": "rtl/vpu/otpu_vpu.sv",
      "line": 81,
      "detail": "广播/向量/归约、复合函数和可变延迟 pipeline。WBUF 与 front/back enable 解耦 TMEM 写 grant；SE 与普通 VOP 互斥占用共享执行资源。",
      "signals": "start/rdy/done / ta_*/tb_*/tw_* / gnt / rhold / ss_*",
      "children": [
        "fp",
        "vtree",
        "stream"
      ],
      "kind": "source-module"
    },
    {
      "id": "fp",
      "label": "otpu_fp / fpipe",
      "role": "位精确浮点基础",
      "path": "rtl/vpu/otpu_fp.sv",
      "line": 5,
      "detail": "binary32 RNE、输入/输出 FTZ 与固定复合运算序列；Python fp32.py 为参考。不能用任意宿主 FP 运算顺序替代。",
      "signals": "f32_t / fp_add / fp_mul / recip / rsqrt",
      "children": [],
      "kind": "conceptual-subsystem"
    },
    {
      "id": "vtree",
      "label": "otpu_vtree",
      "role": "固定顺序归约",
      "path": "rtl/vpu/otpu_vtree.sv",
      "line": 1,
      "detail": "与 VPU 的 64 partial feedback 配合，用固定 schedule/tree 归约，保持 ISA 数值顺序。",
      "signals": "partial loop / root / valid",
      "children": [],
      "kind": "source-module"
    },
    {
      "id": "stream",
      "label": "SE tail + COMP",
      "role": "流状态更新与函数复用",
      "path": "rtl/vpu/otpu_se_tail.sv",
      "line": 1,
      "detail": "DMA 驱动填充和 segment 进入 VPU slot0/tail。ss_req 等普通 VOP drain；COMP8 可复用部分 stages 做复合函数。",
      "signals": "ss_cfg / ss_pe / ss_in_* / ss_y_* / ss_o_*",
      "children": [],
      "kind": "conceptual-subsystem"
    },
    {
      "id": "native",
      "label": "otpu_native_dram",
      "role": "逻辑端口到双 channel",
      "path": "rtl/mem/otpu_native_dram.sv",
      "line": 97,
      "detail": "A/B/SW 请求队列、64-byte channel interleave/hash、scale run 复用、SW gather/fill read、tags/credits，保持同端口保序与写完成条件。",
      "signals": "a_*/b_*/sw_* / n_cvalid/n_cready / n_wdone",
      "children": [
        "memchannel"
      ],
      "kind": "source-module"
    },
    {
      "id": "memchannel",
      "label": "otpu_mem_ch",
      "role": "DDR controller 与 PCIe 桥接",
      "path": "rtl/shell/otpu_mem_ch.sv",
      "line": 86,
      "detail": "主机与加速器经异步 FIFOs 进 DDR uclk。两个 native ports 降低 bank 切换空泡，OOO slot 恢复读顺序，partial RMW 与 reset 保证端口契约。",
      "signals": "uclk / xclk / n_* / x_* / credits / n_err",
      "children": [
        "afifo"
      ],
      "kind": "source-module"
    },
    {
      "id": "afifo",
      "label": "otpu_afifo",
      "role": "跨时钟队列",
      "path": "rtl/shell/otpu_afifo.sv",
      "line": 35,
      "detail": "Gray 指针各自经过两级同步；occupancy 保守估计。OOO 模式按 slot 写，commit 只放行连续完成前缀。",
      "signals": "wvalid/wready / rvalid/rready / wslot/wcommit / wused/rused",
      "children": [],
      "kind": "source-module"
    },
    {
      "id": "collective",
      "label": "otpu_coll / hub / port",
      "role": "BAR 与显式 GATHER",
      "path": "rtl/top/otpu_coll.sv",
      "line": 9,
      "detail": "中心 collective 等所有 slice 到达，读各私有 TMEM 再广播写回。跨 SLR 的 hub/ports 使用缓冲和 credits，ACK 要等 writes drain。不是 mesh router。",
      "signals": "req/cmds / gnt / ack / r_* / w_*",
      "children": [
        "collhub"
      ],
      "kind": "source-module"
    },
    {
      "id": "collhub",
      "label": "otpu_coll_hub",
      "role": "跨 slice pipeline 解耦",
      "path": "rtl/top/otpu_coll.sv",
      "line": 288,
      "detail": "桥接延迟中的 req/ack/read/write，blk 防重复请求；等待 port queues drain 后再 ack。",
      "signals": "u_req/u_ack / x_req/x_ack / credits / drained",
      "children": [],
      "kind": "source-module"
    },
    {
      "id": "control",
      "label": "otpu_ctrl",
      "role": "host contract 与构建身份",
      "path": "rtl/shell/otpu_ctrl.sv",
      "line": 94,
      "detail": "AXI4-Lite register map v5：RUN/LOAD/STATUS、参数、CFG_* 与 ARCH_HASH、per-run/free-running counters、trace。",
      "signals": "CTRL / STATUS / CAPS / CFG_HASH / SNAP",
      "children": [],
      "kind": "source-module"
    },
    {
      "id": "trace",
      "label": "otpu_trace",
      "role": "硬件事件观测",
      "path": "rtl/shell/otpu_trace.sv",
      "line": 1,
      "detail": "收集有界的 dispatch/start/end/活动事件；满队列可有 drop 计数，不能把缺失事件直接当作未发生。",
      "signals": "TRACE_CTRL / TRACE_COUNT / TRACE_DROP / TRACE_LO/HI",
      "children": [],
      "kind": "source-module"
    }
  ],
  "journeys": [
    {
      "id": "journey-matmul",
      "title": "一条矩阵乘法：从 DRAM 到 TMEM",
      "steps": [
        {
          "title": "1 · LD 准备激活",
          "detail": "DMA 将 DRAM FP32 chunks 拆为 segments 写 TMEM；read 发出时已预留 buffer slot。",
          "path": "rtl/dma/otpu_dma.sv",
          "line": 1
        },
        {
          "title": "2 · QACT 求 scale 并驻留",
          "detail": "量化器读 TMEM，求 row/group max，生成 INT8 bytes 和 scale records；ACT RAM 写流水完成后才允许依赖 MM 使用。",
          "path": "rtl/vpu/otpu_quant.sv",
          "line": 1
        },
        {
          "title": "3 · MM 提前预取",
          "detail": "sequencer 的 ustart 只要求 DRAM 依赖解除，MXU issuer 将权重 chunks 与 scale lines 放入 FIFO。",
          "path": "rtl/seq/otpu_seq.sv",
          "line": 14
        },
        {
          "title": "4 · release 与整行就绪",
          "detail": "urel 等全部依赖满足；consumer 等整行 chunks/scales 就绪，避免阵列行内停顿。",
          "path": "rtl/mxu/otpu_mxu.sv",
          "line": 41
        },
        {
          "title": "5 · DSP cascade 与驻留复用",
          "detail": "同一权重 chunk 服务 MCOLS 条驻留 ACT 行；更多 ACT_ROWS 通过 FIFO 内 replay 服务。",
          "path": "rtl/mxu/otpu_mxu.sv",
          "line": 17
        },
        {
          "title": "6 · epilogue 与完成",
          "detail": "整数 row sums 入 result FIFO，经 i2f48 与 scales 变 FP32，bank-aware drain 写 TMEM，最后 done 解除后继 VOP 的依赖。",
          "path": "rtl/mxu/otpu_mxu.sv",
          "line": 22
        }
      ]
    },
    {
      "id": "journey-stream",
      "title": "一条 STREAM：状态矩阵不必进 TMEM",
      "steps": [
        {
          "title": "1 · DMA 取得 stream 命令",
          "detail": "WAITC/scoreboard 确保状态与输入范围没有老冲突。DMA 读描述符及向量/scalars。",
          "path": "rtl/dma/otpu_dma.sv",
          "line": 17
        },
        {
          "title": "2 · 请求共享 SE",
          "detail": "ss_req 拉高，VPU 让已开始 VOP 排空，ss_gnt 后转入 stream mode。",
          "path": "rtl/vpu/otpu_vpu.sv",
          "line": 60
        },
        {
          "title": "3 · 分段运行",
          "detail": "D-byte DRAM chunk 分成 W-word segments；pe 是登记的推进条件，必须同时有输入和输出空间。",
          "path": "rtl/dma/otpu_dma.sv",
          "line": 25
        },
        {
          "title": "4 · 归约与 tail 更新",
          "detail": "VPU slot0 固定 partial loop 和 SE tail 做 dot/update，Y segments 回 DMA、O 回 TMEM。",
          "path": "rtl/vpu/otpu_se_tail.sv",
          "line": 1
        },
        {
          "title": "5 · 聚合写与释放",
          "detail": "DMA 把 Y 聚合成 chunks 以 runs 写回，等 wr_idle 才完成并释放 SE。",
          "path": "rtl/dma/otpu_dma.sv",
          "line": 38
        }
      ]
    },
    {
      "id": "journey-host",
      "title": "主机启动、停止和再次装载",
      "steps": [
        {
          "title": "1 · 核对身份与校准",
          "detail": "读 ID/CAPS/CFG_* 和 CFG_HASH，确认 target 与程序一致，两个 DDR controller 都已 calibrated。",
          "path": "rtl/shell/otpu_ctrl.sv",
          "line": 39
        },
        {
          "title": "2 · RUN=0 时 LOAD",
          "detail": "写 PROG_ADDR/PROG_N/ARG，LOAD 后 loader 等旧 read drain，再加载 IMEM 和 WAITC sidecar。",
          "path": "rtl/top/otpu_slice.sv",
          "line": 340
        },
        {
          "title": "3 · RUN=1 开始",
          "detail": "释放 slice reset；R8..R15 使用 host 参数，sequencer 同步取指填 ir_v。",
          "path": "rtl/seq/otpu_seq.sv",
          "line": 383
        },
        {
          "title": "4 · HALT 或停止",
          "detail": "正常 HALT 等窗口 drain；强制 RUN=0 不撤销 memory 已接受的 writes/reads。",
          "path": "rtl/shell/otpu_ctrl.sv",
          "line": 8
        },
        {
          "title": "5 · 等待后复用内存",
          "detail": "等 WR_IDLE；再次 LOAD 会等 rd_idle 并 flush 可能 stale 的 A-port scale 复用。",
          "path": "rtl/mem/otpu_native_dram.sv",
          "line": 77
        }
      ]
    },
    {
      "id": "journey-gather",
      "title": "两个 slice 的 GATHER 与真正完成",
      "steps": [
        {
          "title": "1 · 各 slice 到达",
          "detail": "collective 必须按顺序配对，各 slice 持 req 直到共同 ack。",
          "path": "rtl/top/otpu_slice.sv",
          "line": 550
        },
        {
          "title": "2 · 中心 unit 发读",
          "detail": "C_IDLE 等 &req；C_RUN 按 slice、row、column 从私有 TMEM 发 LANES-word 读。",
          "path": "rtl/top/otpu_coll.sv",
          "line": 110
        },
        {
          "title": "3 · 读写流水与 backpressure",
          "detail": "读请求/返回数据/写寄存分级，任一本地端口无 grant 会 hold；跨 SLR 用 hub/port credits。",
          "path": "rtl/top/otpu_coll.sv",
          "line": 277
        },
        {
          "title": "4 · 所有目标落下后 ACK",
          "detail": "hub 等各写队列 drained 再 ack；blk 和冷却态避免延迟 req 再次被接受。",
          "path": "rtl/top/otpu_coll.sv",
          "line": 325
        }
      ]
    }
  ]
};

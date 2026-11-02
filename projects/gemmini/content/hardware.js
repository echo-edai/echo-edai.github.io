/* Fixed-commit, source-audited Gemmini hardware curriculum. */
window.GHARDWARE = {
  "commit": "8c3f9923a44a2fe2c7930587be297d6d4f8c09ca",
  "chapters": [
    {
      "id": "hw-orientation",
      "title": "01 · Gemmini 的边界与硬件生成",
      "kicker": "SYSTEM BOUNDARY",
      "summary": "把主核、加速器、存储系统放在同一张图，再明确哪些部件属于 Gemmini。",
      "sections": [
        {
          "id": "what-is-core",
          "title": "NPU core 到底包含什么？",
          "html": "<p>在 Gemmini 中，最小乘加单元叫 PE，二维计算结构叫 Mesh；整个加速器还包含命令调度、DMA、地址转换、Scratchpad 和 Accumulator。把 256 个 PE 直接称为 256 个独立处理器，会漏掉共享控制与数据供给的成本。RISC-V 主核运行程序控制流，通过 RoCC 发出专用命令。</p><p><b>沿接口理解：</b>Controller 中 Gemmini 继承 LazyRoCC，实例化 Scratchpad；GemminiModule 将命令送给三个控制器。先写出四份契约：命令怎样接收、数据存在哪里、计算怎样启动、完成怎样返回。一个有用的架构描述必须能回答这四件事。</p><p><b>如果自己写：</b>先实现一个主机可写控制寄存器的 2×2 矩阵单元，使用显式启动/完成位；功能正确后再加命令 FIFO、DMA、并行调度。第一版不要同时复制 RoCC、虚拟内存和复杂 Loop 控制。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 23,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 304,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 31,
              "label": "PE"
            }
          ]
        },
        {
          "id": "generator",
          "title": "Scala / Chisel 源码与生成 RTL 是两层产物",
          "html": "<p>源码中 <code>Seq.fill</code>、<code>if (config...)</code>、<code>require</code> 在硬件展开时决定模块数量、端口和合法配置；<code>Reg</code>、<code>when</code>、<code>Mux</code> 才描述生成后电路中的寄存器、选择与更新。Scala 的循环通常展开成重复硬件，不等于硬件逐拍执行该循环。</p><p>Mesh 的 Seq.fill 创建 Tile 网格，Tile 再创建 PE 网格。改 meshRows 会改变实例数量；改运行时 dataflow 控制则选择已生成的电路行为。阅读源码时，对每个条件标注“生成期”或“运行期”，就能减少把软件流程当成硬件流程的误解。</p><p><b>实现练习：</b>分别写一个 Scala for 生成四个加法器，以及一个计数器驱动的单加法器复用电路。比较生成 Verilog 的实例与寄存器数量。网页的词法关系索引不等于 Chisel 展开后的完整网表。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 39,
              "label": "Mesh"
            },
            {
              "path": "src/main/scala/gemmini/Tile.scala",
              "line": 42,
              "label": "Tile"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 102,
              "label": "PE"
            }
          ]
        },
        {
          "id": "true-entry",
          "title": "当前入口：不要把已注释的旧 Tiler 当成主路径",
          "html": "<p>固定提交中的 Controller 保留了旧 CmdFSM、TilerController 和旧 ROB 接线的大段块注释。当前活动路径是 <code>io.cmd → raw_cmd_q → 可选 LoopConv → LoopMatmul → unrolled_cmd → ReservationStation</code>。文件存在只能证明项目保留了实现，不能证明该配置会实例化它。</p><p>raw_cmd_q 记录原始 RoCC 命令并标记命令是否由循环状态机生成。Loop 控制器生成细粒度命令后，仍使用共同的 ReservationStation 与 Load/Execute/Store 通路。Counter 和 flush 等特殊命令在顶层另行处理，不能假设全部 funct 都走普通计算队列。</p><p><b>自己分析项目：</b>从活动顶层向下追 Module/LazyModule 和有效连接，把块注释、备用实现、测试代码单独标记。然后用生成 RTL 或层级报告验证，不能仅靠按文件名连线。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 193,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 236,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 251,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 262,
              "label": "Controller"
            }
          ]
        },
        {
          "id": "noc-boundary",
          "title": "Mesh、TileLink 与目录控制器分别在哪一层？",
          "html": "<p><code>gemmini/Mesh.scala</code> 是固定流向的脉动数据通路：A 沿行传播，B、D 和控制沿列传播。它没有包头、路由计算、虚通道、交换仲裁等 packet NoC 结构。二维排列只是外观相似，协议与用途不同。</p><p>外存访问由 DMA 的 TileLink client 发起 Get/Put；系统主核缓存、总线、共享缓存或目录属于选定的 Chipyard/主机集成。Gemmini 的 LocalAddr 是片上行地址，不是共享缓存的 tag+MESI 状态。不能在 Gemmini 文件列表中想象出一个本地 directory_controller。</p><p><b>如果扩展多加速器：</b>先决定共享的是主存、片上 SRAM 还是一致性缓存行，再定义权限、顺序与完成条件。将数据搬运接到 coherent system 不等于让每个 Scratchpad 行自动成为一致性缓存行。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 48,
              "label": "Mesh"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 130,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 206,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 89,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 21,
              "label": "LocalAddr"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-config",
      "title": "02 · 配置、位宽与软件契约",
      "kicker": "ELABORATION",
      "summary": "一个参数变化会穿过算术、存储、地址与软件头文件。",
      "sections": [
        {
          "id": "default-configuration",
          "title": "固定版本的默认配置逐项读",
          "html": "<p>本页基线 <code>defaultConfig</code>：Tile 为 1×1 PE，Mesh 为 16×16 Tile；输入和权重 INT8，外部 Accumulator INT32，阵列输出类型 INT20；dataflow 为 BOTH。默认 Scratchpad 256 KiB/4 bank，Accumulator 64 KiB/2 bank。</p><p>务必区分两套容量：ReservationStation 的 LD/ST/EX 条目数为 8/4/16；三个控制器命令队列长度为 8/2/8。前者保存未完成命令及依赖，后者缓冲送到各执行控制器的命令。它们不是同一个 FIFO 的不同叫法。</p><p><b>观察点：</b>改参数前记录生成配置类，别把 defaultConfig 数字套到 chipConfig、leanConfig 或多 Gemmini 配置。默认值说明生成模板的一个实例，不保证所有系统配置相同。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Configs.scala",
              "line": 21,
              "label": "Configs"
            },
            {
              "path": "src/main/scala/gemmini/Configs.scala",
              "line": 55,
              "label": "Configs"
            },
            {
              "path": "src/main/scala/gemmini/Configs.scala",
              "line": 61,
              "label": "Configs"
            },
            {
              "path": "src/main/scala/gemmini/Configs.scala",
              "line": 229,
              "label": "Configs"
            }
          ]
        },
        {
          "id": "capacity-equation",
          "title": "容量如何变成 SRAM 的宽与深？",
          "html": "<p>一行 Scratchpad 宽度为 <code>DIM × inputBits</code>。默认 DIM=16 时一行 128 bit，即 16 byte；256 KiB 分给四个 bank，因此每 bank 4096 行。Accumulator 一行是 16×32=512 bit，即 64 byte；64 KiB 分给两个 bank，因此每 bank 512 行。</p><p>容量与 bank 数固定时，增加 DIM 会加宽 SRAM、减少行深，同时改变 DMA、转置与本地地址范围。增加 bank 数不自动增加每个访问者的带宽：同 bank 冲突、仲裁、端口类型及下游 ready 仍会限流。</p><p><b>自己写：</b>把容量换算放在一个配置函数中，并为整除、幂次、地址宽度加断言。先画出 bank/row 解码，再做随机读写测试。这里是逻辑数据容量，不能据此推断宏单元面积或工艺下的时序。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/GemminiConfigs.scala",
              "line": 105,
              "label": "GemminiConfigs"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 200,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 33,
              "label": "LocalAddr"
            }
          ]
        },
        {
          "id": "width-contract",
          "title": "INT8、INT20、INT32 为什么同时出现？",
          "html": "<p>乘法输入宽度、阵列输出/级联宽度、跨分块累加存储宽度解决不同问题。INT8×INT8 的乘积需要比输入更宽；多个乘积求和继续增长。当前默认阵列输出为 INT20，而外部 Accumulator 保存 INT32 结果，不能把二者合并成一句“整个阵列全程 INT32”。</p><p>PE 使用泛型 Arithmetic 实现 MAC、裁剪、移位与类型转换。支持 BOTH 时内部驻留寄存器使用 accType，WS-only 时的寄存器类型还会因生成配置不同而改变。数据流切换不意味着所有中间位宽相同。</p><p><b>设计练习：</b>为最大绝对输入、K 长度和允许溢出规则推导位宽；分别测试正负极值、右移、舍入和饱和。若只测小随机数，位宽错误很容易藏住。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Configs.scala",
              "line": 23,
              "label": "Configs"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 58,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 64,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 104,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/Arithmetic.scala",
              "line": 31,
              "label": "Arithmetic"
            }
          ]
        },
        {
          "id": "header-contract",
          "title": "修改硬件后为什么必须重新生成参数头？",
          "html": "<p>Gemmini 的 LazyRoCC 构造阶段调用 <code>config.generateHeader()</code> 写软件参数头。生成头携带 DIM、类型、容量等软硬件共同假设。C 程序按这些假设分块、编码地址并解释结果。只改软件宏不会增减硬件中的 PE。</p><p>配置类包含方阵、bank 行数对 DIM 对齐等 require。它们在展开时拒绝不支持的组合；绕过断言只会掩盖设计假设。新增配置时应先完整记录输入参数，再比较生成头与生成 RTL，最后执行匹配的软件测试。</p><p><b>验收：</b>保存提交号、配置名、生成头、构建命令和测试结果为一组实验记录。不同配置的二进制和硬件即使能启动，也可能在边界尺寸或地址计算处产生错误。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 29,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/GemminiConfigs.scala",
              "line": 274,
              "label": "GemminiConfigs"
            },
            {
              "path": "src/main/scala/gemmini/GemminiConfigs.scala",
              "line": 325,
              "label": "GemminiConfigs"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-scheduler",
      "title": "03 · 命令调度与依赖跟踪",
      "kicker": "RESERVATION STATION",
      "summary": "搬运、计算、写回能够重叠，前提是没有破坏数据依赖。",
      "sections": [
        {
          "id": "rs-entry",
          "title": "一个 ReservationStation 条目到底保存什么？",
          "html": "<p>Entry 不只存 opcode：它保存操作数本地地址区间、是否为配置命令、目的地址标记、issued 状态、完整命令，以及分别指向 LD、EX、ST 表的依赖位向量。ready 表示三组依赖位全零，并非控制器此刻一定能接收。</p><p>地址区间由 start/end/wraps_around 表达，重叠判断还排除 garbage 地址。大矩阵的一条搬运命令可能覆盖多行，因此只比较起始地址不足以保护正确性。区间推导依赖当前 stride、transpose、load block stride 等配置。</p><p><b>自己写：</b>从固定四槽表开始，每条命令只读写一个不跨界区间。分配时比较所有旧条目并生成依赖位；所有边都从新命令指向旧命令，避免凭空生成循环等待。先验证互不重叠命令可并行，再增加环绕地址。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 69,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 89,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 115,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 226,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "id": "raw-war-waw",
          "title": "RAW、WAR、WAW 都与“谁先碰同一行”有关",
          "html": "<p><b>RAW：</b>compute 读取尚未 mvin 完成的 A，必须等生产者；<b>WAR：</b>新的 mvin 覆盖旧 compute 还在读的区域，必须等读者；<b>WAW：</b>两次写同一区域必须有确定顺序。地址不同才能考虑重叠执行，而不是见到不同指令类型就一律并行。</p><p>源码对新 LD/EX/ST 分别生成跨表依赖，区分 opa 是否为目的、opb 是否有效和配置命令。PRELOAD 还携带未来结果目的地址信息，compute 与 preload 的配对语义使依赖分析比普通 CPU 两源一目的指令更特殊。</p><p><b>练习：</b>写出 mvin(A)、mvin(B)、preload(B,C)、compute(A)、mvout(C) 的读写区间表。逐条加入依赖图，再把 A 的下一轮输入放到另一个 bank 区间，观察哪些依赖消失。教学图需要标明何处是近似，不要当作完整 RS 模拟器。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 314,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 337,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 357,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "id": "issue-complete",
          "title": "发射与完成是两个不同事件",
          "html": "<p>每一类队列从 valid、ready、未 issued 条目中用 PriorityEncoderOH 选择命令，只有下游 ready 且 valid 才算发射。发射后一般仍保留表项，直到完成通知回来；部分配置命令标记 complete_on_issue，可以在接收时释放。</p><p>同类 LD/EX 的某些顺序依赖在 issue 时清除，使控制器继续管理同类命令；跨类真实数据依赖通常等 completed 才清除。ST 还采用更保守的同类依赖。把所有依赖统一在发射时清零会让消费者读到未写完的数据。</p><p><b>实现不变量：</b>已发射但未完成的槽不能重复分配；每个完成 ID 必须对应有效槽；ready=0 时命令与 ID 保持稳定。分别驱动下游长期背压和乱序完成，检查是否丢失或重复执行。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 382,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 438,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 455,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 463,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 491,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "id": "completion-tag",
          "title": "ROB ID 是完成身份，不是矩阵地址",
          "html": "<p>RS 的全局发射 ID 拼接队列类别与槽编号。控制器携带这个 ID，完成后通过顶层仲裁器返回；RS 按类别清依赖、释放对应表项。命令数据的地址告诉硬件读写哪里，完成标签告诉硬件这一结果属于哪个未完成事务。</p><p>LoadController 使用 DMACommandTracker 把“一条命令”与“若干行/若干返回字节”联系起来。DMA 请求被接收只说明下层接管了请求；它不证明所有数据已经写到片上并可供后续使用。</p><p><b>自己写：</b>先实现 tag 表和 outstanding 计数，并允许响应延迟变化。测试同时到达的多个完成、tag 复用、背压及复位。真实源码不同接口是 Valid 或 Decoupled，不能把全部完成通路想象成相同握手。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 441,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 425,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 94,
              "label": "LoadController"
            },
            {
              "path": "src/main/scala/gemmini/DMACommandTracker.scala",
              "line": 71,
              "label": "DMACommandTracker"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-dma",
      "title": "04 · 搬运、虚拟地址与外存事务",
      "kicker": "DATA MOVEMENT",
      "summary": "DMA 把二维矩阵命令翻译成可跟踪、可背压的总线事务。",
      "sections": [
        {
          "id": "mvin-rows",
          "title": "mvin：二维命令如何变成逐行请求？",
          "html": "<p>LoadController 解码本地地址、行数、列数，并按三个 load state 选择 stride、scale、shrink 与 block stride。第 r 行虚拟地址是 base+r×stride，本地地址随 row_counter 增长。只有 dma.req.fire 才推进计数。</p><p>当主存 stride=0 且不是补零操作时，可只读一行再重复；vaddr=0 在这条接口中用于生成全零数据，不应按普通指针去读取内存。命令 tracker 根据有效元素的字节数判断完成，不能简单数行后立即释放 RS。</p><p><b>第一版 DMA：</b>限制对齐、固定一行、只允许一个 outstanding；确认握手和地址正确后再加 stride、多行与缩放。必须测试 ready 断续、最后一行背压、零填充、跨 bank 边界及部分列。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 45,
              "label": "LoadController"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 61,
              "label": "LoadController"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 72,
              "label": "LoadController"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 99,
              "label": "LoadController"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 133,
              "label": "LoadController"
            }
          ]
        },
        {
          "id": "read-packets",
          "title": "一行读取为什么会拆成多个 TileLink Get？",
          "html": "<p>DMA 行长度与总线请求尺寸不同。StreamReaderCore 为可用的幂次请求大小构造候选，计算对齐地址、有效字节数和位移，选择能覆盖当前需求的包。为了减少请求数，读取的总字节可能包含对齐产生的额外字节，后端再挑出有效部分。</p><p>TileLink source ID 由 XactTracker 分配，用于将返回 beat 关联到片上地址、位移、mask 和原始命令。BeatMerger 将多 beat 重组成片上行。总线接收、beat 返回、拼接完成和 SRAM 写入是不同层级的事件。</p><p><b>实现练习：</b>画一个未对齐 20-byte 行在 16-byte beat、最大 64-byte 请求下的覆盖区间；标记哪些字节有效。写参考模型逐字节比较，避免用“发了一个64B请求”替代真正的有效数据计数。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 168,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 180,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 206,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 53,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/BeatMerger.scala",
              "line": 30,
              "label": "BeatMerger"
            },
            {
              "path": "src/main/scala/gemmini/XactTracker.scala",
              "line": 56,
              "label": "XactTracker"
            }
          ]
        },
        {
          "id": "tlb-pagewalk",
          "title": "TLB miss 为什么会让 NPU 等待？",
          "html": "<p>软件提供虚拟地址，而 TileLink 访问需要物理地址。FrontendTLB 包装 Rocket TLB，并连接主机 Page Table Walker。每个客户端先检查最近一次翻译的 VPN/PPN 过滤寄存器；是否共享真正的 TLB 由生成参数决定。默认配置的 tlb_size=4 是此模板中的条目参数。</p><p>未命中时 DMA 不能把尚未翻译的地址当物理地址发出。页表遍历、权限检查、异常和 flush 都参与请求能否前进。增加 DMA outstanding 对跨页工作负载不必然奏效，因为地址翻译也会成为瓶颈。</p><p><b>从零实现：</b>先使用物理地址模式把搬运功能做对，再加一项固定映射，最后接页表遍历。至少验证地址空间切换、sfence/flush 后旧映射失效、只读页写入与缺页异常。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 46,
              "label": "FrontendTLB"
            },
            {
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 60,
              "label": "FrontendTLB"
            },
            {
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 89,
              "label": "FrontendTLB"
            },
            {
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 118,
              "label": "FrontendTLB"
            },
            {
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 139,
              "label": "FrontendTLB"
            }
          ]
        },
        {
          "id": "store-return",
          "title": "mvout：结果从 SRAM 到主存，何时算完成？",
          "html": "<p>StoreController 组织本地读、输出宽度、激活/缩放、可选池化和写回地址。Scratchpad 内的 write_dispatch、norm、scale、issue 队列维持处理顺序；来自 Accumulator 的全精度结果与缩放结果可以走不同处理。</p><p>输出数据再交给 StreamWriter 分割为 TileLink 写请求。完成身份必须沿所有流水传递，不能因为阵列计算已经结束就提前允许主机消费主存结果。主机软件 fence、设备完成与系统内存顺序仍需共同满足。</p><p><b>实现练习：</b>先只支持 INT32 原样输出，再加 INT8 饱和缩放；用固定小矩阵比较两种输出，并在每一级插入背压。检查最后一行/最后一 beat 的处理，尤其避免“请求已发出”与“数据已可见”混用。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/StoreController.scala",
              "line": 14,
              "label": "StoreController"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 270,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 312,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 351,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 442,
              "label": "Controller"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-storage",
      "title": "05 · Scratchpad、Accumulator 与 Bank 冲突",
      "kicker": "LOCAL MEMORY",
      "summary": "容量解决能装多少；端口和仲裁决定每拍能供多少。",
      "sections": [
        {
          "id": "scratchpad-not-cache",
          "title": "Scratchpad 为什么没有 cache miss？",
          "html": "<p>Scratchpad 是软件/控制器显式安排的本地矩阵存储。LocalAddr 明确选择 scratchpad 或 accumulator 及行位置；mvin 指定把主存数据搬到哪里。它不通过地址 tag 自动判断某条主存缓存行是否命中，也不自行替换缓存行。</p><p>显式存储让分块和数据复用可控，但软件必须负责布局、搬运与生命周期。缓存则把这些决策部分交给硬件。Gemmini 可以挂在具有缓存的主机系统中，两种机制可以共存；这不改变 Scratchpad 本身的寻址语义。</p><p><b>自己写：</b>先做一块可显式读写的 SRAM 和独立地址空间。为 A、B、C 分配不重叠区间，验证结束前不会重用缓冲区。只有确实需要透明共享内存时，才增加 tag、替换、MSHR 与一致性。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 6,
              "label": "LocalAddr"
            },
            {
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 21,
              "label": "LocalAddr"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 100,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 102,
              "label": "LoadController"
            }
          ]
        },
        {
          "id": "bank-port",
          "title": "单端口 SRAM：为什么读写同 bank 会卡住？",
          "html": "<p>ScratchpadBank 默认使用 SyncReadMem，并考虑单端口忙于写入时不能同时接受读。同步读还意味着地址接收与数据返回相隔时序，响应队列必须有空位。ready 不是一根装饰线，它保证接收的读以后有地方保存结果。</p><p>同一个 Scratchpad bank 既服务 Execute 读取，也可能服务 mvout 的本地读，并接收 mvin 或执行结果写入。Scratchpad.scala 按 bank 选择与仲裁这些通路；ExecuteController 还比较 A/B/D 是否争用同一 bank，按优先与计数器限制推进。</p><p><b>实现方法：</b>为每 bank 写一张端口使用表；先固定优先级，确认不丢请求，再考虑公平性。验证读写同地址、连续写、read resp.ready=0，以及两个读者共享 bank 时的响应路由。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 120,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 163,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 498,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 504,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 316,
              "label": "ExecuteController"
            }
          ]
        },
        {
          "id": "accumulate-rmw",
          "title": "Accumulator 的 accumulate 位为什么需要读改写？",
          "html": "<p>跨 K 分块的矩阵乘法需要把新部分和加到旧 C，而不是覆盖。AccumulatorWriteReq 的 acc 控制区分覆盖与累加。累加时必须先读原行，通过加法流水，再把和写回；所以 Accumulator 不只是“另一块更宽的 SRAM”。</p><p>源码使用 pipelined_writes 保存地址、mask、acc 与数据，配合共享加法流水和端口冲突控制。相同地址的相邻读改写可能形成 RAW 冒险；加法器延迟、SRAM 端口与读写阻塞要一起推导。</p><p><b>先实现最小版：</b>每次只接受一个读改写，等待写回后才 ready。正确后允许不同地址流水，并为同址加入阻塞或转发。用连续对同一行加1、交替地址、多种 mask 和全幅溢出作为定向测试。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 39,
              "label": "AccumulatorMem"
            },
            {
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 113,
              "label": "AccumulatorMem"
            },
            {
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 127,
              "label": "AccumulatorMem"
            },
            {
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 181,
              "label": "AccumulatorMem"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 685,
              "label": "Scratchpad"
            }
          ]
        },
        {
          "id": "local-address",
          "title": "本地地址的控制位与 garbage 地址",
          "html": "<p>LocalAddr 包含 is_acc_addr、accumulate、read_full_acc_row 和 norm_cmd 等元信息，data 部分再拆 bank 与 row。外存 vaddr 按字节计算，本地地址以矩阵行语义使用；把它们都当作 uint32 字节地址相加会产生错误。</p><p>garbage 是特殊编码，用来表示某个输入不需要读取真实存储或某个输出应被丢弃。它不是随机无效值：is_garbage 有明确布尔条件，依赖分析和执行路径据此排除无实际读写的操作。</p><p><b>自己写：</b>用结构化类型区分主存 byte address、本地 row address 与事务 ID；为元信息提供构造函数。测试 bank 末行、地址环绕与特殊值，避免 C 中位运算和 Chisel Bundle 布局各自维护不同版本。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 21,
              "label": "LocalAddr"
            },
            {
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 33,
              "label": "LocalAddr"
            },
            {
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 43,
              "label": "LocalAddr"
            },
            {
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 46,
              "label": "LocalAddr"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-execute",
      "title": "06 · 执行控制、转置与时间对齐",
      "kicker": "EXECUTE PIPELINE",
      "summary": "PE 可以很简单，但把正确元素在正确时刻喂进去需要完整控制。",
      "sections": [
        {
          "id": "preload-compute",
          "title": "preload 与 compute 不是两个独立 GEMM",
          "html": "<p>PRELOAD 与后续 COMPUTE 共同定义本次阵列操作的输入/驻留数据和结果目的地。ExecuteController 会查看多个命令位置、当前 dataflow、transpose、garbage 与矩阵尺寸，再决定读哪些 SRAM 行、何时推进。只逐条把 preload 解释为“往 B 写一个矩阵”会遗漏 OS 模式与 D/C 的角色。</p><p>执行状态包含 waiting_for_cmd、compute、flush、flushing。OS 中需要排出驻留部分和，配置修改也必须等待不冲突的边界。未完成结果和 pending completed ID 的存在使“命令已经从 FIFO 出队”不等于“输出已写完”。</p><p><b>自己写：</b>先固定一种数据流和满尺寸矩阵，用一条 start 携带全部地址；再拆 preload/compute。对每条指令写清它保存哪些状态、占用哪些资源，以及何时允许下一条指令改变这些状态。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 73,
              "label": "ExecuteController"
            },
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 88,
              "label": "ExecuteController"
            },
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 175,
              "label": "ExecuteController"
            },
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 541,
              "label": "ExecuteController"
            }
          ]
        },
        {
          "id": "operand-ready",
          "title": "为什么 A、B、D 要分别缓存已到达标记？",
          "html": "<p>A、B、D 可能来自不同 SRAM bank、Accumulator 或转置路径，返回时间不一定一致。MeshWithDelays 使用 a_buf/b_buf/d_buf 与 a_written/b_written/d_written 收集各路，只有当前请求有效且所需数据齐备，或正在执行 flush，才推进一行。</p><p>如果一条输入通路暂停，另外两条仍然覆盖尚未消费的数据，就会把不同行的元素拼成一次乘法。代码中 ready 表达缓冲区空或本拍即将消费；这是弹性握手的关键，不是把三个 valid 做与后就结束。</p><p><b>实现练习：</b>写三路 join 模块，每路一个弹性槽，随机使三个输入与输出停顿。参考模型记录每一组 token 的序号，断言没有串组、丢组或重复。再把它接到阵列行输入。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 100,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 110,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 123,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 143,
              "label": "MeshWithDelays"
            }
          ]
        },
        {
          "id": "transposer",
          "title": "转置器解决的是存储顺序与阵列消费顺序不匹配",
          "html": "<p>SRAM 一次读出一行，但阵列的数据流可能要求按列逐拍进入。MeshWithDelays 根据 OS/WS 与 a_transpose、bd_transpose 选择 A、B 或 D 使用转置器，并且对某些 D 排列做 reverse。软件 transpose 标记与“硬件是否经过转置器”不是简单同义词。</p><p>这说明数据布局不仅是数学矩阵的行列交换，还包括阵列端口约定与预装载顺序。若只看转置器输出数值而不看 valid、输入模式和边界尺寸，很容易得到整体看似合理、局部元素却错位的结果。</p><p><b>自己写：</b>先用 2×2/4×4 寄存器阵列收满 N 行，再按列输出，验证 A[r][c] 精确变成输出[c][r]。第二步才加入乒乓缓冲，使下一块装载与上一块排出重叠。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 151,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/Transposer.scala",
              "line": 94,
              "label": "Transposer"
            },
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 123,
              "label": "ExecuteController"
            }
          ]
        },
        {
          "id": "skew-tag",
          "title": "输入 skew、输出 deskew 与标签必须同步",
          "html": "<p>脉动阵列不同位置有传播延迟。同一 k 的 A 与 B 必须在对应 PE 相遇，因此 shifted 函数为不同组和元素添加不同延迟；输出再按相反方向对齐。控制 dataflow/propagate、valid、matmul_id、last 也沿对应时序传播。</p><p>输出不仅需要数据，还要知道该数据属于哪个结果地址。TagQueue 保存地址等标签，并按阵列传播的 matmul_id 选择匹配输出。一次错误的标签延迟可能让数值正确的结果写到另一个矩阵。</p><p><b>验证方法：</b>给每个元素和事务加可辨识编号，手推 2×2 阵列的前几拍。分别检查数值、valid、last、ID 和目的地址对齐。数学 GEMM 对了只是第一层验证，还要检查停顿、flush 和事务交叠。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 72,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 175,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 188,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 222,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 232,
              "label": "MeshWithDelays"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-array",
      "title": "07 · 从 MAC 到完整脉动阵列",
      "kicker": "PE / TILE / MESH",
      "summary": "用空间复用理解数据流，再回到寄存器更新。",
      "sections": [
        {
          "id": "mac-pe",
          "title": "MAC 的组合运算与驻留寄存器",
          "html": "<p>MacUnit 计算 <code>out_d = in_c.mac(in_a,in_b)</code>。PE 包装一个 MAC，并用 c1/c2 两套寄存器实现驻留和传播切换。共享一个独立 MAC 模块还有生成/综合目的：避免支持 BOTH 时工具未自动合并重复乘加逻辑。</p><p>A 直接传到 out_a，控制、valid、id、last 同样传出；具体周期寄存主要由 Tile 间 Mesh 的 pipeline 插入。旧注释可能把 PE 描述为“完全组合”，但 c1/c2 明显是状态寄存器，阅读时必须让实际 Reg 定义优先于概括注释。</p><p><b>自己写：</b>先写一个带 valid 和 enable 的 signed MAC；定义 reset 是否清 accumulator，定义溢出是截断还是饱和。用正负数与连续 valid 空洞测试，保证 invalid 拍不改变驻留状态。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 14,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 58,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 64,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 79,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 142,
              "label": "PE"
            }
          ]
        },
        {
          "id": "output-stationary",
          "title": "OS：部分和留在 PE，操作数流过",
          "html": "<p>在 OS 分支中，MAC 用 b 与 a 相乘，并把 c1 或 c2 作为累加输入。propagate 决定哪套寄存器参与计算、哪套传播/载入 D。输出 out_c 可能带右移与宽度裁剪，out_b 则让 B 向下传递。</p><p>“输出驻留”指一段内积期间部分和驻留，不表示最终结果永远不移动，也不表示外部 Accumulator 不再有用途。计算结束后仍需要排空、标签匹配和本地结果写回。</p><p><b>实现练习：</b>用 2×2 PE 做 K=3 的 GEMM，每个 PE 记录三个乘积的累加轨迹。先所有 PE 同时广播操作数验证数学，再加入行列传播和 skew；最后加双寄存器与排空。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 102,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 104,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 111,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 624,
              "label": "ExecuteController"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 197,
              "label": "MeshWithDelays"
            }
          ]
        },
        {
          "id": "weight-stationary",
          "title": "WS：权重留在 PE，部分和沿列流动",
          "html": "<p>在 WS 分支中，c1/c2 之一给 MAC 提供驻留权重，b 作为输入部分和，MAC 结果从 out_b 向下传播；另一套寄存器接收 d 为后续操作准备。与 OS 相比，端口名相同，但传输内容的数学意义变化。</p><p>阵列输出选择在 MeshWithDelays 中明确体现：OS 取 out_c，WS 取 out_b。切换模式还会改变转置、输入顺序与排空需求，不能只把 dataflow 寄存器翻转就假定所有软件命令完全相同。</p><p><b>自己推导：</b>把一个权重固定到每个 PE，沿列累加 a×w，手写每拍 out_b。比较同一权重被多少个输入重复使用，再讨论 WS 在该工作负载下节约了哪一层数据搬运。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 118,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 121,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 127,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 199,
              "label": "MeshWithDelays"
            }
          ]
        },
        {
          "id": "tile-mesh",
          "title": "Tile 内组合连接、Tile 间流水为何分层？",
          "html": "<p>Tile 把 PE 组成行列结构，常规连接沿行送 A、沿列送 B/D/控制；Mesh 再把 Tile 组成网格，在 Tile 之间使用 tile_latency+1 的延迟。默认 Tile=1×1，因此 Mesh 的每格就是一个 PE，但更大 Tile 会改变组合路径长度。</p><p>更大组合 Tile 可能减少寄存器边界、改变延迟与布线压力；更多流水边界有助于切短路径，却增加控制/数据同步成本。源码还有特定条件下的 tree reduction，不能把所有配置都解释为完全相同的逐 PE 寄存链。</p><p><b>设计练习：</b>保持总 PE 数不变，比较 Tile1×1/Mesh4×4 与 Tile2×2/Mesh2×2 的生成层级和关键路径。功能仿真只能说明数值，不代表两者频率、功耗或面积谁更优，必须再看综合与物理实现。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Tile.scala",
              "line": 42,
              "label": "Tile"
            },
            {
              "path": "src/main/scala/gemmini/Tile.scala",
              "line": 46,
              "label": "Tile"
            },
            {
              "path": "src/main/scala/gemmini/Tile.scala",
              "line": 117,
              "label": "Tile"
            },
            {
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 39,
              "label": "Mesh"
            },
            {
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 50,
              "label": "Mesh"
            },
            {
              "path": "src/main/scala/gemmini/GemminiConfigs.scala",
              "line": 182,
              "label": "GemminiConfigs"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-loops",
      "title": "08 · 大矩阵、卷积与硬件循环",
      "kicker": "LOOP ENGINES",
      "summary": "循环引擎减少主机发命令的成本，同时保持搬运与执行可重叠。",
      "sections": [
        {
          "id": "blocked-gemm",
          "title": "大矩阵为什么必须分块？",
          "html": "<p>阵列一次处理固定 DIM 的空间块，片上容量也有限。对 C 的一个块，K 方向各块产生部分和；A/B 可以在不同输出块之间复用。分块决定主存流量、片上占用与阵列边缘浪费，因此它是软硬件共同问题。</p><p>当前硬件矩阵循环入口识别 <code>LOOP_WS</code> 及其配置命令；不要据此推断它自动为 OS 提供同样的硬件循环接口。LoopMatmul 接收循环边界、pad、地址、stride、transpose 与累加设置，内部拆成 LdA、LdB、LdD、Execute、StC 等子状态机。每个状态机推进自身迭代器，并通过完成与进度约束协调，不能把它看成“发完所有 load 再发所有 compute”的单一顺序脚本。</p><p><b>先自己写：</b>用三重软件循环生成最小 mvin/preload/compute/mvout 序列，参考 NumPy/C GEMM 验证边缘块。然后再把相同循环搬进硬件，避免硬件状态机和数学分块同时出错。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 28,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 139,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 352,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 514,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 892,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 982,
              "label": "LoopMatmul / LOOP_WS decode"
            }
          ]
        },
        {
          "id": "loop-overlap",
          "title": "双缓冲与进度反馈怎样保护复用？",
          "html": "<p>LoopMatmul 保留多个 loop 状态，使用 head/tail 与分区本地地址来交叠工作。Load 和 Execute 的迭代进度、idle、loop_id 等信号约束消费者；RS 完成计数又控制各类型 outstanding，防止循环引擎无限塞满某一类条目。</p><p>数据已经由 load 状态机“生成了命令”，不意味着 DMA 已经写完；RS 仍保护细粒度地址依赖。循环进度约束与 RS 依赖是不同层的防线，理解一个不等于可以删除另一个。</p><p><b>实现练习：</b>画两个缓冲区的生命周期：free→loading→ready→computing→free。只有真正消费完才回 free。随机拖慢 load 或 store，检查下一轮不会覆盖当前计算的数据。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 984,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 1000,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 1006,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 1119,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 1286,
              "label": "LoopMatmul"
            }
          ]
        },
        {
          "id": "convolution",
          "title": "卷积如何复用矩阵阵列？",
          "html": "<p>卷积可把输入窗口和权重映射成矩阵乘法，但把整个 im2col 矩阵写回主存会放大流量。Gemmini 中 LoopConv 组织 bias、input、weight、execute、store 等循环；Im2Col 根据配置从片上输入生成阵列所需片段。</p><p>边界 padding、stride、dilation、通道布局与池化会改变地址和有效元素。Controller 为 Execute 与 Im2Col 的 Scratchpad 读请求加仲裁，因此 im2col 的“省搬运”收益也可能伴随片上端口竞争，需通过测量判定。</p><p><b>自己写：</b>先实现 1 通道、3×3、stride1、无 padding 的直接卷积参考，再与显式 im2col+GEMM 比较。一次只增加 padding、stride 或多通道中的一个维度，并覆盖最边缘窗口。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/LoopConv.scala",
              "line": 84,
              "label": "LoopConv"
            },
            {
              "path": "src/main/scala/gemmini/LoopConv.scala",
              "line": 235,
              "label": "LoopConv"
            },
            {
              "path": "src/main/scala/gemmini/LoopConv.scala",
              "line": 414,
              "label": "LoopConv"
            },
            {
              "path": "src/main/scala/gemmini/LoopConv.scala",
              "line": 596,
              "label": "LoopConv"
            },
            {
              "path": "src/main/scala/gemmini/Im2Col.scala",
              "line": 43,
              "label": "Im2Col"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 379,
              "label": "Controller"
            }
          ]
        },
        {
          "id": "optional-features",
          "title": "训练卷积、池化、归一化与激活不是同一功能开关",
          "html": "<p>配置区分 has_training_convs、has_max_pool、has_nonlinear_activations、has_normalizations 等能力。默认打开某些选项不表示所有数学操作都走同一流水，也不保证另一种 lean 配置具有相同硬件。</p><p>Scratchpad 写出通路含 norm/scale 的排队与选择，AccumulatorScale 和 Normalizer 各负责一类变换。软件配置、数值近似与生成硬件能力要对应；不能只从 API 名字判断精度和支持范围。</p><p><b>扩展方法：</b>先定义一个新算子的整数参考公式、范围与误差容限，再决定放在阵列、Accumulator 后处理还是主核软件。增加 opcode 或配置字段时，同步修改解码、依赖、软件头与测试，避免只加一个算术模块。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Configs.scala",
              "line": 49,
              "label": "Configs"
            },
            {
              "path": "src/main/scala/gemmini/GemminiConfigs.scala",
              "line": 89,
              "label": "GemminiConfigs"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 270,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/AccumulatorScale.scala",
              "line": 90,
              "label": "AccumulatorScale"
            },
            {
              "path": "src/main/scala/gemmini/Normalizer.scala",
              "line": 236,
              "label": "Normalizer"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-performance",
      "title": "09 · 性能、瓶颈与可信实验",
      "kicker": "MEASUREMENT",
      "summary": "理论峰值、利用率与端到端延迟回答不同问题。",
      "sections": [
        {
          "id": "peak-vs-real",
          "title": "256 个 MAC 为什么不能直接推出程序速度？",
          "html": "<p>默认 16×16 阵列有256个 PE。在理想每 PE 每拍一个 MAC 且全有效的条件下，可讨论256 MAC/周期；若按乘加各算一次则为512算术操作/周期。换算 TOPS 还需要实际频率、数值类型及统一的操作计数口径。</p><p>小矩阵、K 较短、边缘 padding、填充排空、bank 冲突、TLB miss、DMA 等待、主核发命令以及输出处理都会降低端到端效率。更大阵列让理想峰值增加，也可能让单位任务的无效空间和供数压力增加。</p><p><b>实验：</b>固定数据类型与频率假设，分别报告理论峰值、有效 MAC 数/总周期、完整函数延迟与搬运字节。不能用网页概念动画或容量公式生成“实测”性能结论。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Configs.scala",
              "line": 32,
              "label": "Configs"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 23,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/CounterFile.scala",
              "line": 13,
              "label": "CounterFile"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 449,
              "label": "Controller"
            }
          ]
        },
        {
          "id": "counter-diagnosis",
          "title": "用计数器区分计算忙与等待忙",
          "html": "<p>CounterEvent 定义 LOAD/STORE DMA等待、TLB miss、RDMA/WDMA TileLink等待、EX active/flush/控制队列阻塞等事件。顶层还统计 LD/ST/EX 单独活跃与多种交叠组合。这些观测点帮助定位哪条流水没有前进。</p><p>busy 周期不等于有效乘加周期，active 也可能包含特定状态机的等待。应先读计数器连接的布尔条件，再解释结果。例如 LoadController 的 LOAD_SCRATCHPAD_WAIT_CYCLE 对应 dma.req.valid&&!ready，而不是直接测量所有 bank 内部冲突。</p><p><b>实验设计：</b>同一二进制输入逐项改变阵列、容量或总线宽度；每次只改一个主要因素并保留匹配构建。若总周期改善，检查是外存字节下降、等待减少还是有效计算占比变化，不能只凭单个计数器命名推断因果。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/CounterFile.scala",
              "line": 13,
              "label": "CounterFile"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 178,
              "label": "LoadController"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 325,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 460,
              "label": "Controller"
            }
          ]
        },
        {
          "id": "simulation-layers",
          "title": "功能模拟、RTL 仿真与综合分别证明什么？",
          "html": "<p>功能级模型帮助验证指令与数值语义；RTL 仿真能观察队列、握手、时序关系和死锁；综合估计所选实现的资源与逻辑路径；物理实现还决定布线、实际时钟与 SRAM 宏集成。它们回答的问题不同。</p><p>本教材依照固定源码静态编写，交互实验是缩小范围的教学模型。本次没有完成整个 Gemmini+Chipyard 的构建、RTL 仿真、综合或上板验证。已运行的独立教学原型若另有记录，其结论只覆盖该原型。</p><p><b>从零验证：</b>PE 数学单元→Tile连线→Mesh时序→本地存储→单条命令→GEMM命令序列→系统软件。每层保留参考结果和可复现输入，让失败能缩小到明确边界。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 23,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 77,
              "label": "Mesh"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 568,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/DMACommandTracker.scala",
              "line": 88,
              "label": "DMACommandTracker"
            }
          ]
        },
        {
          "id": "debug-deadlock",
          "title": "没有输出时，按“最后一次 fire”倒推",
          "html": "<p>先确定输入命令是否被接收，再看 RS 是否分配、是否有依赖未清、目标控制器是否 ready，之后检查 DMA outstanding、TLB miss、SRAM bank 与 Mesh 输入收集。没有 valid 是上游没提供；有 valid 无 ready 是下游背压；两者同时高才表示事件发生。</p><p>RS 保留 valids、functs、issueds、packed_deps 等调试信号，并对长期无进展设置超时断言。超时只说明观察窗口中没有进展，不自动证明是哪一个模块设计错误；也可能是输入序列、环境或内存响应不满足契约。</p><p><b>调试练习：</b>手动冻结一个内存响应，记录它会让哪些槽、缓冲与命令停下；恢复后应继续且结果不丢失。随后冻结错误的tag，验证断言是否能定位“响应身份不合法”，而不是直到最终 C 错了才发现。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 543,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 561,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 133,
              "label": "LoadController"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 110,
              "label": "MeshWithDelays"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-build-yourself",
      "title": "10 · 如果自己写一个小型 Gemmini",
      "kicker": "IMPLEMENTATION ROADMAP",
      "summary": "按可独立验证的阶段搭建，逐步增加并发，而不是一次复刻整个仓库。",
      "sections": [
        {
          "id": "build-arithmetic",
          "title": "阶段一：signed MAC 与 2×2 OS 阵列",
          "html": "<p><b>接口：</b>时钟、复位、valid、A/B 输入、clear/accumulate 控制和 C 输出。<b>状态：</b>每 PE 一份部分和，行列输入的延迟寄存器。<b>组合：</b>signed乘法、加法、数据与valid选择。先只支持一种精度与固定 K。</p><p><b>实现顺序：</b>单 MAC→四个 MAC 的无流水数学验证→加入邻接传输→加入 skew 与 valid→输出 last。用 A或B为单位矩阵、全0、全1和正负极值检验位置与符号；用每元素唯一值检验行列是否交换。</p><p><b>验收条件：</b>任何 invalid 拍不会改变部分和，完整K个有效项只累加一次，每个C位置恰好输出一次。通过后才考虑 WS、双驻留寄存器和模式切换。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 14,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 102,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/Tile.scala",
              "line": 42,
              "label": "Tile"
            },
            {
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 50,
              "label": "Mesh"
            }
          ]
        },
        {
          "id": "build-storage",
          "title": "阶段二：显式 SRAM、bank 与最小 DMA",
          "html": "<p><b>接口：</b>read req/resp、write req、主存请求/响应。<b>状态：</b>读响应槽、DMA行计数、当前地址、outstanding tag。<b>组合：</b>bank解码、端口仲裁、响应路由。第一版物理地址且仅一个在途事务。</p><p>先允许主机直接写入 SRAM 并启动阵列，确认本地读写；再增加 mvin/mvout。为了实现跨K累加，加一个阻塞式Accumulator读改写。最后再加多bank和多个DMA outstanding。</p><p><b>验收条件：</b>请求仅在fire时推进，返回响应属于活跃tag，所有接收数据写到正确行，ready=0期间保存请求，任意暂停恢复不重复搬运。还需测试最后一行和部分列mask。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 100,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 99,
              "label": "LoadController"
            },
            {
              "path": "src/main/scala/gemmini/DMACommandTracker.scala",
              "line": 78,
              "label": "DMACommandTracker"
            },
            {
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 127,
              "label": "AccumulatorMem"
            }
          ]
        },
        {
          "id": "build-scheduler",
          "title": "阶段三：三队列与范围依赖",
          "html": "<p><b>接口：</b>命令分配、LD/EX/ST发射、完成tag。<b>状态：</b>每槽valid/issued/读写范围/依赖位。<b>组合：</b>新旧范围冲突比较、可发射选择、队满判断。先同类严格顺序，再放开互不依赖的跨类重叠。</p><p>每次只加入一种hazard：先RAW，再WAR，最后WAW及特殊配置顺序。用小范围穷举或随机命令与完全顺序参考模型比较最终存储；检查不仅结果正确，也要确保消费者永远不能在生产者完成前触碰数据。</p><p><b>验收条件：</b>槽不提前复用，无依赖条目可在公平环境下前进，完成通知合法，复位清valid。完成正确后再加循环引擎、多个结果在途与优化的complete-on-issue。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 89,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 314,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 438,
              "label": "ReservationStation"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 491,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "id": "build-system",
          "title": "阶段四：主机集成、虚拟内存与系统一致性",
          "html": "<p>把已验证的小加速器挂到主核时，先固定命令协议、地址空间、异常、复位、时钟域与完成顺序。若使用共享主存，明确CPU缓存脏数据如何被设备读到、设备写回何时对CPU可见，以及软件需要什么同步。</p><p>Gemmini 提供 RoCC、PTW和TileLink接入点，最终一致性行为还受所选主机缓存/总线/共享缓存实现影响。要写 directory controller，应在系统层先定义缓存行状态、owner/sharers、瞬态、probe/ACK、事务身份与死锁约束，不能把RS依赖表当目录。</p><p><b>验收条件：</b>CPU先写→设备读、设备先写→CPU读、并发访问与异常恢复都有确定契约和测试。然后再研究多加速器、NoC与目录协议。本页的Gemmini证据只能支持接口边界，完整系统协议必须另读匹配平台源码。</p>",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 23,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 89,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 174,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 130,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 46,
              "label": "FrontendTLB"
            }
          ]
        }
      ]
    }
  ],
  "modules": [
    {
      "id": "host",
      "title": "RISC-V / RoCC",
      "group": "system",
      "summary": "主核运行控制程序并发出专用命令。",
      "detail": "Gemmini继承LazyRoCC，主核并不包含在Gemmini的PE网格中。程序控制、地址空间与系统缓存来自集成平台。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 23,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "config",
      "title": "Config / 参数头",
      "group": "control",
      "summary": "生成阵列、存储、队列与软件共同常量。",
      "detail": "defaultConfig定义一个实例；generateHeader把DIM、位宽等契约交给软件。生成期参数与运行期寄存器不同。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Configs.scala",
          "line": 21,
          "label": "Configs"
        },
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 29,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "controller",
      "title": "Controller / raw_cmd_q",
      "group": "control",
      "summary": "两项原始命令缓冲，隔离主核与循环展开。",
      "detail": "valid&&ready才接收RoCC命令，队列保持命令与状态；from_matmul/conv标记初始化为false。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 236,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "loopconv",
      "title": "LoopConv",
      "group": "control",
      "summary": "卷积循环展开为搬运、执行与写回。",
      "detail": "可选has_loop_conv路径；处理bias、input、weight、execute、store子任务，完成信息从RS反馈。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 251,
          "label": "Controller"
        },
        {
          "path": "src/main/scala/gemmini/LoopConv.scala",
          "line": 1169,
          "label": "LoopConv"
        }
      ]
    },
    {
      "id": "loop",
      "title": "LoopMatmul",
      "group": "control",
      "summary": "LOOP_WS分块矩阵循环与多阶段重叠。",
      "detail": "LdA/LdB/LdD/EX/StC协调进度，限制各类型在途命令；细粒度依赖仍由RS保护。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/LoopMatmul.scala",
          "line": 892,
          "label": "LoopMatmul"
        },
        {
          "path": "src/main/scala/gemmini/LoopMatmul.scala",
          "line": 1000,
          "label": "LoopMatmul"
        }
      ]
    },
    {
      "id": "rs",
      "title": "ReservationStation",
      "group": "control",
      "summary": "地址范围依赖与LD/EX/ST分发表。",
      "detail": "Entry含valid/issued、操作数范围和三组deps；发射和完成分离。默认LD8/EX16/ST4项。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/ReservationStation.scala",
          "line": 89,
          "label": "ReservationStation"
        },
        {
          "path": "src/main/scala/gemmini/Configs.scala",
          "line": 55,
          "label": "Configs"
        }
      ]
    },
    {
      "id": "load",
      "title": "LoadController",
      "group": "memory",
      "summary": "二维mvin命令拆成逐行DMA请求。",
      "detail": "维护三组load配置，计算主存stride、本地行与缩放，并用DMACommandTracker确认返回数据完成。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/LoadController.scala",
          "line": 61,
          "label": "LoadController"
        },
        {
          "path": "src/main/scala/gemmini/LoadController.scala",
          "line": 99,
          "label": "LoadController"
        }
      ]
    },
    {
      "id": "store",
      "title": "StoreController",
      "group": "memory",
      "summary": "本地结果读出、池化及主存写回控制。",
      "detail": "写回阶段与计算阶段不同，需保持数据、地址、格式及完成ID一致。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/StoreController.scala",
          "line": 14,
          "label": "StoreController"
        },
        {
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 270,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "execute",
      "title": "ExecuteController",
      "group": "compute",
      "summary": "preload/compute、bank读与阵列调度。",
      "detail": "管理OS/WS、转置、矩阵边缘、flush和pending完成标签，并协调A/B/D返回。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/ExecuteController.scala",
          "line": 73,
          "label": "ExecuteController"
        },
        {
          "path": "src/main/scala/gemmini/ExecuteController.scala",
          "line": 186,
          "label": "ExecuteController"
        }
      ]
    },
    {
      "id": "scratchpad",
      "title": "Scratchpad",
      "group": "memory",
      "summary": "片上存储系统、DMA与多路径汇合点。",
      "detail": "包裹StreamReader/Writer、bank、mvin缩放、Accumulator后处理与仲裁；不是带tag的透明缓存。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 191,
          "label": "Scratchpad"
        },
        {
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 208,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "spbank",
      "title": "ScratchpadBank",
      "group": "memory",
      "summary": "按矩阵行访问的同步SRAM bank。",
      "detail": "单端口模式下写入占用端口阻塞读取；响应缓冲保证下游停顿时不丢数据。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 100,
          "label": "Scratchpad"
        },
        {
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 120,
          "label": "Scratchpad"
        },
        {
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 163,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "accumulator",
      "title": "AccumulatorMem",
      "group": "memory",
      "summary": "宽部分和存储及读改写累加。",
      "detail": "acc标志选择覆盖或读改写，加法流水、端口与同址冒险决定是否可接收下一请求。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/AccumulatorMem.scala",
          "line": 92,
          "label": "AccumulatorMem"
        },
        {
          "path": "src/main/scala/gemmini/AccumulatorMem.scala",
          "line": 113,
          "label": "AccumulatorMem"
        },
        {
          "path": "src/main/scala/gemmini/AccumulatorMem.scala",
          "line": 127,
          "label": "AccumulatorMem"
        }
      ]
    },
    {
      "id": "scale",
      "title": "Scale / Normalizer",
      "group": "memory",
      "summary": "结果缩放、激活与可选归一化。",
      "detail": "全精度输出与低精度输出通路不同，数值规则需同时对照软件参考和当前生成能力。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/AccumulatorScale.scala",
          "line": 90,
          "label": "AccumulatorScale"
        },
        {
          "path": "src/main/scala/gemmini/Normalizer.scala",
          "line": 236,
          "label": "Normalizer"
        },
        {
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 270,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "dma",
      "title": "DMA StreamReader/Writer",
      "group": "system",
      "summary": "TileLink主存事务、拆包与返回处理。",
      "detail": "虚拟地址经TLB后生成Get/Put，sourceID与事务元数据关联返回beat。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 124,
          "label": "DMA"
        },
        {
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 206,
          "label": "DMA"
        },
        {
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 351,
          "label": "DMA"
        }
      ]
    },
    {
      "id": "tlb",
      "title": "FrontendTLB / PTW",
      "group": "system",
      "summary": "设备虚拟地址翻译与页表遍历接入。",
      "detail": "可共享或分离TLB；最近VPN/PPN过滤器、flush与异常保证翻译正确。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/FrontendTLB.scala",
          "line": 89,
          "label": "FrontendTLB"
        },
        {
          "path": "src/main/scala/gemmini/FrontendTLB.scala",
          "line": 118,
          "label": "FrontendTLB"
        }
      ]
    },
    {
      "id": "xact",
      "title": "XactTracker / BeatMerger",
      "group": "memory",
      "summary": "关联source ID并拼接总线beat。",
      "detail": "一条命令可对应多个事务，一个事务可有多个beat。三级身份不能混用。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/XactTracker.scala",
          "line": 56,
          "label": "XactTracker"
        },
        {
          "path": "src/main/scala/gemmini/BeatMerger.scala",
          "line": 30,
          "label": "BeatMerger"
        },
        {
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 76,
          "label": "DMA"
        }
      ]
    },
    {
      "id": "tracker",
      "title": "DMACommandTracker",
      "group": "control",
      "summary": "累计命令剩余返回字节并产生完成。",
      "detail": "bytes_left减到0后等待完成端口接收，再释放槽位；总线请求发出不能立即完成命令。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/DMACommandTracker.scala",
          "line": 50,
          "label": "DMACommandTracker"
        },
        {
          "path": "src/main/scala/gemmini/DMACommandTracker.scala",
          "line": 84,
          "label": "DMACommandTracker"
        }
      ]
    },
    {
      "id": "mesh-delay",
      "title": "MeshWithDelays",
      "group": "compute",
      "summary": "多输入收集、skew/deskew与输出标签。",
      "detail": "三路缓冲收集一行，按数据流选择转置，再将数据/控制/ID按阵列位置延迟对齐。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/MeshWithDelays.scala",
          "line": 100,
          "label": "MeshWithDelays"
        },
        {
          "path": "src/main/scala/gemmini/MeshWithDelays.scala",
          "line": 175,
          "label": "MeshWithDelays"
        },
        {
          "path": "src/main/scala/gemmini/MeshWithDelays.scala",
          "line": 222,
          "label": "MeshWithDelays"
        }
      ]
    },
    {
      "id": "transpose",
      "title": "AlwaysOutTransposer",
      "group": "compute",
      "summary": "把行粒度SRAM数据变为阵列所需方向。",
      "detail": "是否经过转置由OS/WS和配置共同决定，不应直接等同于软件transpose标志。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/MeshWithDelays.scala",
          "line": 151,
          "label": "MeshWithDelays"
        },
        {
          "path": "src/main/scala/gemmini/Transposer.scala",
          "line": 94,
          "label": "Transposer"
        }
      ]
    },
    {
      "id": "mesh",
      "title": "Mesh",
      "group": "compute",
      "summary": "Tile之间固定行列连接与流水。",
      "detail": "A向右，B/D/控制向下；它是systolic array，不是packet NoC。每Tile间插入tile_latency+1延迟。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 39,
          "label": "Mesh"
        },
        {
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 50,
          "label": "Mesh"
        },
        {
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 60,
          "label": "Mesh"
        }
      ]
    },
    {
      "id": "tile",
      "title": "Tile",
      "group": "compute",
      "summary": "PE的组合连接与可选列归约。",
      "detail": "Tile内行列连接通常无Mesh级流水；改变Tile尺寸会改变组合路径。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Tile.scala",
          "line": 42,
          "label": "Tile"
        },
        {
          "path": "src/main/scala/gemmini/Tile.scala",
          "line": 46,
          "label": "Tile"
        },
        {
          "path": "src/main/scala/gemmini/Tile.scala",
          "line": 117,
          "label": "Tile"
        }
      ]
    },
    {
      "id": "pe",
      "title": "PE / MacUnit",
      "group": "compute",
      "summary": "乘加与OS/WS驻留寄存器。",
      "detail": "c1/c2支持传播与计算切换；OS结果取out_c，WS部分和取out_b。valid=0时保持状态。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 14,
          "label": "PE"
        },
        {
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 64,
          "label": "PE"
        },
        {
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 102,
          "label": "PE"
        },
        {
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 118,
          "label": "PE"
        }
      ]
    },
    {
      "id": "im2col",
      "title": "Im2Col",
      "group": "compute",
      "summary": "从片上输入组织卷积窗口。",
      "detail": "与Execute共享Scratchpad读端口，顶层有两输入仲裁；节省展开流量仍有片上读竞争。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 370,
          "label": "Controller"
        },
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 379,
          "label": "Controller"
        },
        {
          "path": "src/main/scala/gemmini/Im2Col.scala",
          "line": 43,
          "label": "Im2Col"
        }
      ]
    },
    {
      "id": "counters",
      "title": "CounterController / CounterFile",
      "group": "control",
      "summary": "统计计算、等待、传输和重叠事件。",
      "detail": "要读事件实际连接条件再解释计数；busy、active与有效MAC吞吐不等价。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 161,
          "label": "Controller"
        },
        {
          "path": "src/main/scala/gemmini/CounterFile.scala",
          "line": 13,
          "label": "CounterFile"
        },
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 449,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "tilelink",
      "title": "Host TileLink fabric",
      "group": "system",
      "summary": "主存、系统缓存与总线接入边界。",
      "detail": "tlNode/atlNode按配置选择；具体主机coherence与directory需读匹配平台。不是Gemmini内部Scratchpad协议。",
      "refs": [
        {
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 89,
          "label": "Controller"
        },
        {
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 130,
          "label": "DMA"
        }
      ]
    }
  ],
  "flows": [
    {
      "id": "mvin",
      "title": "mvin：主存 → Scratchpad",
      "steps": [
        {
          "module": "host",
          "title": "程序提交RoCC命令",
          "text": "主核给出主存虚拟地址、本地地址、行列数；先经过raw命令队列。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 236,
              "label": "Controller"
            }
          ]
        },
        {
          "module": "rs",
          "title": "建立写范围依赖",
          "text": "检查新搬运是否覆盖旧计算/写回仍在使用的区域，依赖清零后发往LD。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 314,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "module": "load",
          "title": "拆分矩阵行",
          "text": "vaddr+row×stride，LocalAddr+row；为整个命令分配tracker。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/LoadController.scala",
              "line": 99,
              "label": "LoadController"
            }
          ]
        },
        {
          "module": "tlb",
          "title": "翻译与权限",
          "text": "最近页过滤/TLB/PTW提供物理地址；miss时等待，异常可触发interrupt。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 46,
              "label": "FrontendTLB"
            },
            {
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 118,
              "label": "FrontendTLB"
            }
          ]
        },
        {
          "module": "dma",
          "title": "发出TileLink Get",
          "text": "选择对齐请求大小，分配source ID，接收返回beat。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 168,
              "label": "DMA"
            },
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 206,
              "label": "DMA"
            }
          ]
        },
        {
          "module": "scratchpad",
          "title": "缩放、拼接并写入本地bank",
          "text": "DMA返回经过mvin缩放等通路，再按本地bank/row存放。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 407,
              "label": "Scratchpad"
            },
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 567,
              "label": "Scratchpad"
            }
          ]
        },
        {
          "module": "tracker",
          "title": "返回字节齐全后完成",
          "text": "tracker用bytes_left确认命令完成；RS清除其依赖并释放条目。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/DMACommandTracker.scala",
              "line": 84,
              "label": "DMACommandTracker"
            },
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 497,
              "label": "ReservationStation"
            }
          ]
        }
      ]
    },
    {
      "id": "gemm",
      "title": "GEMM：片上数据 → 阵列 → Accumulator",
      "steps": [
        {
          "module": "loop",
          "title": "循环展开",
          "text": "大矩阵分块，准备LdA/LdB/LdD/EX/StC任务并限制在途命令。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 892,
              "label": "LoopMatmul"
            },
            {
              "path": "src/main/scala/gemmini/LoopMatmul.scala",
              "line": 1000,
              "label": "LoopMatmul"
            }
          ]
        },
        {
          "module": "rs",
          "title": "等待真实数据依赖",
          "text": "PRELOAD/COMPUTE读取的范围必须在生产者完成后可用。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 337,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "module": "execute",
          "title": "解码preload/compute",
          "text": "确认dataflow、地址、尺寸、转置与garbage，协调读取本地bank。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 73,
              "label": "ExecuteController"
            },
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 423,
              "label": "ExecuteController"
            }
          ]
        },
        {
          "module": "mesh-delay",
          "title": "收集并对齐三路输入",
          "text": "A/B/D收齐后推进一行；转置与skew让匹配元素在正确PE相遇。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 110,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 151,
              "label": "MeshWithDelays"
            }
          ]
        },
        {
          "module": "pe",
          "title": "执行OS或WS乘加",
          "text": "OS累加在驻留寄存器，WS用驻留权重产生流动部分和。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 102,
              "label": "PE"
            },
            {
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 118,
              "label": "PE"
            }
          ]
        },
        {
          "module": "mesh-delay",
          "title": "输出deskew与tag匹配",
          "text": "匹配matmul_id与标签，给结果附上正确目的地址。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 199,
              "label": "MeshWithDelays"
            },
            {
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 232,
              "label": "MeshWithDelays"
            }
          ]
        },
        {
          "module": "accumulator",
          "title": "写入或累加结果",
          "text": "按acc标志覆盖/读改写，等待完整结果写回边界后反馈完成。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 127,
              "label": "AccumulatorMem"
            },
            {
              "path": "src/main/scala/gemmini/ExecuteController.scala",
              "line": 907,
              "label": "ExecuteController"
            }
          ]
        }
      ]
    },
    {
      "id": "mvout",
      "title": "mvout：Accumulator → 主存",
      "steps": [
        {
          "module": "rs",
          "title": "等待结果可读",
          "text": "store对结果区域的RAW依赖必须清除，才能进入StoreController。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 357,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "module": "store",
          "title": "解释写回形状和格式",
          "text": "配置主存stride、行列、缩放、激活与可选池化。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/StoreController.scala",
              "line": 14,
              "label": "StoreController"
            }
          ]
        },
        {
          "module": "accumulator",
          "title": "读取全精度部分和",
          "text": "本地bank读有仲裁与同步读延迟，全精度与缩放格式不同。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 699,
              "label": "Scratchpad"
            }
          ]
        },
        {
          "module": "scale",
          "title": "按配置后处理",
          "text": "norm/scale/issue队列维持处理顺序；低精度结果按规则转换。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 270,
              "label": "Scratchpad"
            }
          ]
        },
        {
          "module": "dma",
          "title": "拆分TileLink写事务",
          "text": "StreamWriter组织地址、mask与数据，接受外存背压。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 351,
              "label": "DMA"
            }
          ]
        },
        {
          "module": "rs",
          "title": "完成反馈与软件同步",
          "text": "控制器完成返回RS，软件还需要遵守设备完成与主机内存顺序契约。",
          "refs": [
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 425,
              "label": "Controller"
            },
            {
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 442,
              "label": "Controller"
            }
          ]
        }
      ]
    }
  ]
};

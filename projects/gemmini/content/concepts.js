/* Authored teaching material; source facts and extensions are distinguished. */
window.GCONCEPTS = {
  "chapters": [
    {
      "id": "implementation-foundations",
      "title": "把硬件写对：状态、时钟与接口契约",
      "kicker": "MICROARCHITECTURE / 从机制到实现",
      "summary": "先学会区分静态生成、组合计算和寄存器更新，才能读懂控制器。",
      "sections": [
        {
          "id": "system-boundaries",
          "title": "四层地图：NPU core 到底指什么？",
          "html": "<p>“NPU core”没有跨项目统一的接口定义。在 Gemmini 中，一个完整矩阵加速器包含命令前端、依赖管理、搬运、片上存储和脉动阵列；<code>PE</code>只是其中的乘加单元。主机 RISC-V 核负责控制程序、地址空间与异常处理，Gemmini 通过 RoCC 接受命令。不能把一颗 PE、一整个 Gemmini、带 CPU 的 SoC 都叫作同一个层次的 core。</p><h4>先画边界，再写接口</h4><ol><li>计算层：输入操作数与控制，输出部分和及有效标记。</li><li>加速器层：命令、DMA 请求、完成事件；有自己的本地地址空间。</li><li>SoC 层：主机缓存、一致性代理、TileLink 互联、DRAM。</li><li>软件层：分块、布局、同步、量化以及生成参数头。</li></ol><p>自己写时，先做只有一条未完成 GEMM 的加速器：<code>cmd_valid/ready</code>接收尺寸与地址，执行 LOAD→COMPUTE→STORE，最后产生保持到消费的 done。把地址类型、错误响应和缓冲区所有权写成接口契约，再扩展并行度。</p><p><b>定位练习：</b>在 Controller 中分别圈出命令接口、PTW、三个控制器的连接。任何“core 包含什么”的说法都应能对应一个实例边界。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 24,
              "label": "Controller"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 174,
              "label": "Controller"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 346,
              "label": "Controller"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 31,
              "label": "PE"
            }
          ]
        },
        {
          "id": "generator-state",
          "title": "Scala 生成硬件，不是在芯片上运行 Scala",
          "html": "<p><code>Seq.fill(meshRows, meshColumns)(Module(...))</code>在 elaboration 阶段复制模块，<code>for</code>循环展开连线；它不是芯片逐拍执行的循环。<code>Reg</code>表示跨周期状态，<code>Wire</code>、<code>Mux</code>和连接表达组合关系，<code>when</code>选择当前周期的更新条件。</p><pre><code>// 教学伪代码：唯一状态 q 在时钟边沿更新\nnext_q = q;\nif (accept) next_q = input;\nalways_ff @(posedge clk) q &lt;= next_q;</code></pre><p>PE 的 <code>c1/c2</code>是两组寄存器；OS/WS 分支改变它们的含义与 MAC 选择。看到同一寄存器有多处赋值，要按 Chisel 的连接与条件覆盖规则恢复最终 next-state 表，而不是按软件语句顺序想象多次写入。</p><h4>自己写与检查</h4><p>先用 SystemVerilog 的 <code>always_comb</code>给 next-state 默认值，用 <code>always_ff</code>统一更新。每个状态必须回答复位值、更新条件、stall 时是否保持。注意 PE 的数据寄存器未必逐个清零；有效位决定哪些数据可用，不能把波形里的未初始化数据当成有效错误。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 39,
              "label": "Mesh"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 70,
              "label": "PE"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 102,
              "label": "PE"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 141,
              "label": "PE"
            }
          ]
        },
        {
          "id": "ready-valid",
          "title": "ready/valid：传输发生在双方同时同意的边沿",
          "html": "<p>对 Decoupled 风格接口，接受事件是 <code>fire = valid &amp;&amp; ready</code>。valid 表示发送方确有事务，ready 表示接收方本拍能保存或处理。自己约定发送方在阻塞期间保持 valid 和 payload，直到 fire；这是弹性队列常用的更强契约。不要仅凭“Decoupled”名称就假设所有上游实现都满足跨周期不可撤销性，Chisel 还区分 Irrevocable 接口。</p><p>Gemmini 的 RS 自定义 issue 接口明确实现 fire；Controller 把 issue.ready 接到对应控制器。一个命令已发出只表示下游接收，完成是另一条事件，不能在 fire 时立刻清除所有数据依赖。</p><pre><code>accept_in  = in_valid  &amp;&amp; in_ready;\naccept_out = out_valid &amp;&amp; out_ready;\n// hold 时：out_valid 保持，out_data 保持\n// 计数、指针、命令推进都用 accept，而非单独 valid</code></pre><p><b>自己写：</b>把“我能接收”从存储空间推导出来，valid 从寄存的占用状态推导。先画依赖图检查 ready 是否沿多级组合回传，避免 valid 与 ready 相互等待造成死锁。<b>验证：</b>下游连续阻塞三拍，输入只应被接收一次，输出不得跳过或重复。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 13,
              "label": "ReservationStation"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 346,
              "label": "Controller"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 113,
              "label": "Scratchpad"
            }
          ]
        },
        {
          "id": "fifo-elastic",
          "title": "一格弹性缓冲：满时仍可同时出入",
          "html": "<p>最小缓冲只有 <code>full</code>与 <code>data</code>。输出为 full/data；若本拍输出可被消费，就允许同拍换入新数据，因此 <code>in_ready = !full || out_ready</code>。在 <code>in_ready</code>时，下一拍 full 等于 in_valid；在 input fire 时写 data。这样满队列同拍 pop+push 保持满且替换内容，不产生额外空拍。</p><table><thead><tr><th>输入接受</th><th>输出接受</th><th>下一状态</th></tr></thead><tbody><tr><td>0</td><td>0</td><td>保持</td></tr><tr><td>1</td><td>0</td><td>满，新数据</td></tr><tr><td>0</td><td>1</td><td>空</td></tr><tr><td>1</td><td>1</td><td>满，替换数据</td></tr></tbody></table><p>ScratchpadBank 用队列保留未被立即消费的 SRAM 读结果，并根据队列下一状态与单端口写冲突决定 read.ready。读请求一旦接受，下拍会回数据，所以必须提前预留响应槽。</p><p>本网站 <a href=\"rtl/README.md\">独立教学 RTL</a>里的 <code>learn_elastic.sv</code>可运行。它不是上游 Chisel Queue 的替换品；它有一拍存储延迟和组合 ready 回传，不是切断 ready 路径的完整 skid buffer。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 116,
              "label": "Scratchpad"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 172,
              "label": "Scratchpad"
            }
          ]
        }
      ]
    },
    {
      "id": "compute-from-scratch",
      "title": "计算阵列：从一个 MAC 到可运行的矩阵核",
      "kicker": "MICROARCHITECTURE / 从机制到实现",
      "summary": "驻留的是哪种数据、控制怎样跟随数据、何时可以覆盖旧值，这些决定阵列能否算对。",
      "sections": [
        {
          "id": "mac-width",
          "title": "MAC 的位宽与符号扩展，比乘法表达式更重要",
          "html": "<p>MAC 的数学式是 <code>d = c + a×b</code>。两个有符号 INT8 的乘积需要16位精确容纳；连续 K 项求和还需要增长空间。若用32位累加，必须明确从乘积到累加域的符号扩展，以及超范围时的截断、饱和或异常契约。软件的“INT8 模型”不能推出所有硬件通路都是8位。</p><p>上游 <code>MacUnit</code>通过泛型 Arithmetic 的 mac 运算实现；PE 的输入、权重、阵列输出与累加器可以有不同类型。Config 中参数才是当前精度的依据。教学原型将输入固定 INT8、和固定 INT32，以32位二补码模运算处理溢出，不实现量化缩放。</p><h4>从零实现</h4><ol><li>先把乘积显式声明为 signed [15:0]。</li><li>显式扩展为32位，再加偏置或部分和。</li><li>用负数、-128×-128、零和边界累加构造参考测试。</li><li>确定舍入/饱和发生在写回缩窄处，避免每项累加都提前截断。</li></ol><p><b>不变量：</b>无效输入不可改变有效累加状态；每个被接收的元素恰好计入一次。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 14,
              "label": "PE"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 58,
              "label": "PE"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Configs.scala",
              "line": 21,
              "label": "Configs"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Arithmetic.scala",
              "line": 1,
              "label": "Arithmetic"
            }
          ]
        },
        {
          "id": "stationary-design",
          "title": "WS 与 OS：复用位置决定数据通路",
          "html": "<p><b>OS（output stationary）</b>把某个输出的部分和留在 PE，本拍读 A/B，累加到本地寄存器；完成 K 项后排出结果。<b>WS（weight stationary）</b>把权重留在 PE，激活与部分和流动，每个 PE 对流经的部分和贡献一次乘加。驻留是复用策略，不是说阵列其他数据永远不动。</p><p>Gemmini 的 PE 有 c1/c2 两组状态，propagate 控制哪组用于计算、哪组传播或装载；OS 分支的 MAC 加数来自本地 c，WS 分支来自流入的 b。不要把教学单寄存器PE的变量名与上游端口名直接一一对应。<code>in_b</code>在不同模式下承载的数据语义会变化。</p><pre><code>// 独立教学模型：语义刻意简化\nOS: os_sum_next = (start ? 0 : os_sum) + a*b;\nWS: result = partial_in + a*weight_reg;\npreload: weight_reg_next = weight_in;</code></pre><p>自己写时先锁定一种模式、一个输出块、一组权重，确认结果后再增加双缓冲和运行时模式切换。练习分别数 A、B、部分和跨链路的传输次数；哪个更好取决于形状、分块和存储带宽。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 102,
              "label": "PE"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 118,
              "label": "PE"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 89,
              "label": "PE"
            }
          ]
        },
        {
          "id": "systolic-alignment",
          "title": "脉动不是广播：把数据和标签一起对齐",
          "html": "<p>Mesh 将 A 沿行传播，把 B/结果/控制沿列连接，Tile 间插入寄存器。数据有延迟，valid、matmul id、last 与 dataflow/propagate 控制也要同步延迟。只延迟数值、不延迟标签，会把一个矩阵结果标给另一个矩阵；只写乘加关系、不处理边界偏斜，也无法得到正确矩阵。</p><h4>2×2 阵列的实现步骤</h4><ol><li>写出每个 PE(i,j) 在第 t 拍需要 A(i,k)、B(k,j) 的 k。</li><li>对边缘注入做 skew，让同一 k 在交点相遇。</li><li>逐链路定义寄存器深度，避免在 Tile 内与 Tile 间重复计拍。</li><li>流水 control/valid，最后 drain 并收齐所有结果。</li></ol><p>Gemmini 用 <code>MeshWithDelays</code>处理外围延迟/标签，内部 <code>Mesh</code>负责规则连接。这里的 mesh 是阵列形状与数据通路；没有路由头、目标地址、路由算法或每跳VC分配。将其当成系统 packet NoC 会导致错误的性能与死锁模型。</p><p><b>观察点：</b>检查相邻 Tile 的输出和输入相差几拍，以及最后一项 valid 如何穿过底边。尺寸N的阵列需要填充/排空，小矩阵无法简单按N²峰值估算速度。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 48,
              "label": "Mesh"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 76,
              "label": "Mesh"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 90,
              "label": "Mesh"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/MeshWithDelays.scala",
              "line": 1,
              "label": "MeshWithDelays"
            }
          ]
        },
        {
          "id": "minimal-core-roadmap",
          "title": "自己写一个最小矩阵加速核",
          "html": "<p>先实现可证明正确的闭环：固定2×2矩阵、片上寄存器输入、单种OS数据流、串行输出。控制器只需 IDLE、LOAD、RUN、DRAIN、DONE 五态。LOAD 收齐输入，RUN 依据 k 计数注入数据，DRAIN 等最后valid退出，DONE 在响应握手后回IDLE。</p><p>第二步把输入换成同步SRAM：接受地址后等待读结果，控制要跟随读延迟。第三步接主存DMA：每个请求保存事务ID与目标本地行，响应回来才允许相依计算。第四步增加双缓冲，先静态安排“计算缓冲A/搬运缓冲B”，再引入RS实现动态重叠。不要从多核一致性系统起步。</p><table><thead><tr><th>阶段</th><th>必须守住的条件</th><th>最小测试</th></tr></thead><tbody><tr><td>单PE</td><td>valid=0时状态保持</td><td>负数乘加、插空拍</td></tr><tr><td>2×2阵列</td><td>每个k在正确交点相遇</td><td>单位矩阵、全1、随机</td></tr><tr><td>SRAM</td><td>每次读有唯一响应槽</td><td>响应阻塞、同bank冲突</td></tr><tr><td>DMA</td><td>ID不提前复用</td><td>响应乱序、跨页、错误</td></tr><tr><td>并行控制</td><td>先写数据的命令完成后才能被读取</td><td>重叠地址RAW/WAR/WAW</td></tr></tbody></table><p>网站的 <code>learn_pe.sv</code>只演示单PE的算术和驻留选择，不能用它的仿真结果声称已运行 Gemmini。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 346,
              "label": "Controller"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/PE.scala",
              "line": 141,
              "label": "PE"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 329,
              "label": "ReservationStation"
            }
          ]
        }
      ]
    },
    {
      "id": "memory-microarchitecture",
      "title": "片上存储：容量、Bank 与在途读写",
      "kicker": "MICROARCHITECTURE / 从机制到实现",
      "summary": "矩阵核常被喂数限制。沿地址、端口、缓冲和完成事件理解存储，比只数KiB更有效。",
      "sections": [
        {
          "id": "scratchpad-vs-cache",
          "title": "Scratchpad 与 Cache：谁决定数据在哪里？",
          "html": "<p>Scratchpad 由软件/控制器显式指定本地行地址，mvin/mvout决定何时搬运，没有自动按主存地址查找的tag与替换策略。Cache 则以主存地址索引/比较tag，在miss时分配行并发起回填，可能驱逐脏行。两者都可由SRAM实现，但控制语义完全不同。</p><p>Gemmini 的 LocalAddr 含存储类型标志、累加模式、读全精度标志和行号。<code>sp_bank()</code>与 <code>sp_row()</code>从配置决定的位段拆出Bank和行；当前默认不是把连续每一个字节低位轮询映射到各Bank。不要把其他GPU的交叉存储映射套进来。</p><h4>自己写一个最小Cache</h4><p>从直映射写回Cache开始：数据阵列、tag、valid、dirty；命中读返回，写命中更新脏位；miss先处理脏驱逐，再读回一整行。保持miss事务的原请求，防止CPU改变地址后响应发错。增加MSHR前先在一个miss槽下通过交错读写测试。它是理解host缓存的练习，不是给Gemmini scratchpad添加tag的必经步骤。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 21,
              "label": "LocalAddr"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 33,
              "label": "LocalAddr"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 163,
              "label": "Scratchpad"
            }
          ]
        },
        {
          "id": "banks-arbitration",
          "title": "Bank 冲突：容量够，也可能无法同拍服务",
          "html": "<p>一个Bank只有有限读写端口。两个请求命中同一单端口Bank，即使地址不同，也不能同时访问；不同Bank才可能并行。Gemmini ScratchpadBank 在单端口模式下写优先，read.ready会被当前写占用挡住；还有为读响应队列预留空间的条件。多端口逻辑视图也未必能直接映射到目标工艺SRAM。</p><p>Scratchpad 更高层按Bank路由来自计算和DMA的访问，并携带 fromDMA 等来源信息。数据响应必须送回真正的请求者，仲裁选择不仅决定本拍谁赢，还决定未来响应的归属。</p><h4>自己写</h4><ol><li>把本地地址分解为memory-kind、bank、row。</li><li>每Bank做请求仲裁，赢者产生唯一fire。</li><li>寄存本拍选中者/transaction tag，延迟到读结果回来。</li><li>为每个必然回来的响应保证槽位；下游stall反压新读。</li><li>验证单端口不同时读写、每个被接受请求恰好一个响应。</li></ol><p>固定优先级容易写，但持续高优先级负载会饿死其他来源；round-robin指针只在真正发出一次授权时更新。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 113,
              "label": "Scratchpad"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 119,
              "label": "Scratchpad"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Scratchpad.scala",
              "line": 567,
              "label": "Scratchpad"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 379,
              "label": "Controller"
            }
          ]
        },
        {
          "id": "acc-read-modify-write",
          "title": "Accumulator：读改写与旁路依赖",
          "html": "<p>Accumulator 保存较宽部分和，并支持对旧值读改写：读出原数据，送加法器，与新数据相加，再写回。相同地址连续累加时，第二次读可能遇到第一次写尚未提交，不能假设SRAM会自动给出新值。解决方法包括阻塞冲突、旁路在途结果、改变调度；具体允许哪些访问由目标SRAM与控制逻辑共同决定。</p><p>上游 AccumulatorMem 显式保存 pipelined_writes，<code>acc</code>标志控制加法器，要求 acc_latency≥2。源码还保留小矩阵配置读写时序的TODO；这提醒我们“参数可填”不等于每种组合已经验证。</p><h4>实现一条可靠路径</h4><p>先只容许一个RMW在途：接收→读→加→写→完成。完成以前相同地址的新操作阻塞。若要每拍接受，则对每一级的valid/address作比较，从最近的匹配写优先转发，明确两项同地址累加的先后语义。测试a+=x、a+=y紧挨出现，应得到old+x+y；插入读时要返回契约规定的最新可见值。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 99,
              "label": "AccumulatorMem"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 111,
              "label": "AccumulatorMem"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/AccumulatorMem.scala",
              "line": 127,
              "label": "AccumulatorMem"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/LocalAddr.scala",
              "line": 21,
              "label": "LocalAddr"
            }
          ]
        },
        {
          "id": "dma-transaction",
          "title": "DMA：不是 memcpy 变成一根总线线",
          "html": "<p>DMA把长行拆成满足总线粒度、对齐、页面边界和最大请求字节数的事务。请求发出以后，还要保存它对应哪个原命令、本地行、字节偏移和剩余长度。TileLink的source ID让响应关联在途事务；请求握手时不能立刻复用ID，要等该事务全部响应完成。</p><p>Gemmini StreamReaderCore 创建TLClientNode、计算可用读尺寸、发Get，通过TLB翻译，并从D通道source恢复事务ID。BeatMerger/事务跟踪器把返回beat拼成本地存储所需的行与mask。输入命令、总线请求、总线beat、本地行响应是四种不同粒度的完成事件。</p><pre><code>descriptor → split(size/alignment/page)\n           → translate → allocate ID → issue request\nD beat → lookup ID → merge bytes → local write → command completion</code></pre><p><b>自己写：</b>第一版只允许一个Get在途，记录地址/长度/目标行。再增加ID表与乱序返回；为“最终一个beat”的判定写测试。错误/超时必须有回收策略，否则一次异常会永久占满ID。真实协议错误响应处理需按总线规范实现，教学图不替代协议监视器。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 130,
              "label": "DMA"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 168,
              "label": "DMA"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 206,
              "label": "DMA"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 292,
              "label": "DMA"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/XactTracker.scala",
              "line": 1,
              "label": "XactTracker"
            }
          ]
        }
      ]
    },
    {
      "id": "ordering-and-addresses",
      "title": "依赖、地址翻译与主机可见性",
      "kicker": "MICROARCHITECTURE / 从机制到实现",
      "summary": "并行的前提是保持程序含义；地址翻译、数据依赖、一致性与内存顺序各解决不同问题。",
      "sections": [
        {
          "id": "dependencies",
          "title": "RAW / WAR / WAW：按区域比较，而非只比较一个地址",
          "html": "<p><b>RAW</b>：后来的读必须等早先写完成；<b>WAR</b>：后来的写不能覆盖早先尚未读完的数据；<b>WAW</b>：两次写要保持预期的最终顺序。Gemmini命令操作一段本地行范围，而不是单个CPU寄存器，因此只比较起始地址不足以发现重叠。</p><p>RS 条目保存操作数区间与目标标志，用overlaps检查，分别建立对LD/EX/ST条目的依赖位图；同类队列的发射顺序还有自己的约束。它不是通用CPU的寄存器重命名ROB。跨引擎重叠允许提升并发，但每个读必须看到正确那次写的数据。</p><h4>自己写</h4><p>先把区间规范化为半开区间[start,end)，判断<code>a.start &lt; b.end &amp;&amp; b.start &lt; a.end</code>，并同时比较SP/ACC地址空间。对于每个新命令，与所有更老在途命令比较R/W集合；有冲突就记录依赖ID。完成时清除对应位。若资源允许，且依赖全零，才能发射。加入跨Bank、边界溢出、garbage地址的专项测试。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 68,
              "label": "ReservationStation"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 112,
              "label": "ReservationStation"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 329,
              "label": "ReservationStation"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 360,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "id": "issue-completion",
          "title": "分清分配、发射、完成与回收",
          "html": "<p>命令进入RS是allocate；被控制器接受是issue；真正完成搬运或执行才产生completed。三者有不同valid/ready与ID。如果在issue时释放数据依赖，依赖命令可能在数据尚未写入前读到旧值；如果从不回收完成条目，则表最终塞满。</p><p>Controller 把三个控制器完成事件汇入仲裁器，再送RS；RS以ID更新相关状态。需要补充一个实现细节：同队列的发射顺序依赖可在issue时解除；LD/ST配置命令还可标记complete_on_issue（分配处383行、发射处451—475行）。数据真正写回的跨引擎依赖不能照搬这种提前解除。这条“反馈边”与前向数据流同样重要。研究流水线时，既要画命令去哪里，也要画完成由谁回来、一次能回几条。</p><h4>最小实现契约</h4><ol><li>分配时保存命令、有效位、序号以及依赖位图。</li><li>发射时置issued，阻止重复发射。</li><li>收到合法completed ID后，清其占用并解除依赖。</li><li>ID复用前，保证旧事务不会迟到；更复杂系统使用epoch/tag。</li></ol><p>用延迟随机化让LD、EX、ST按不同顺序完成，检查输出仍与串行参考一致。要测试同时多个完成时仲裁/缓冲是否会丢事件，而不只测试无冲突理想路径。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 425,
              "label": "Controller"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 438,
              "label": "Controller"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 112,
              "label": "ReservationStation"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/ReservationStation.scala",
              "line": 451,
              "label": "ReservationStation"
            }
          ]
        },
        {
          "id": "virtual-address",
          "title": "TLB / PTW：查到物理地址，也要检查权限",
          "html": "<p>软件传入的指针通常是虚拟地址。DMA要在正确的权限上下文下翻译为物理地址，TLB缓存翻译；miss通过PTW查询页表。页号被替换、页内偏移通常保持，页大小和超级页处理不能简单写成永久固定4KiB。</p><p>Gemmini FrontendTLB 使用Rocket的TLB与TLBPTWIO，可配置共享TLB；每个客户端还缓存最近一次翻译作过滤。TLB异常会置interrupt，flush_retry/flush_skip用于处理后续动作，不能把miss和page fault都当成“再等一拍”。</p><h4>从零做法</h4><p>第一版裸机加速器可明确只收物理地址，并由软件保证合法缓冲区；要支持进程虚拟地址，必须引入上下文、权限、异常、页表更新同步与安全隔离，不能只加一个VPN→PPN数组。先接入主机已有PTW/TLB协议比自己发明页表遍历器更可靠。</p><p><b>区分：</b>SFENCE.VMA一类翻译同步处理地址映射；缓存数据一致性处理缓存副本；内存顺序处理操作何时对其他代理可见。这三件事不能互相替代。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 46,
              "label": "FrontendTLB"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 60,
              "label": "FrontendTLB"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 92,
              "label": "FrontendTLB"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/FrontendTLB.scala",
              "line": 117,
              "label": "FrontendTLB"
            }
          ]
        },
        {
          "id": "host-coherence-boundary",
          "title": "DMA 与 CPU：一致性、顺序、完成要分别回答",
          "html": "<p>CPU写入输入缓冲区后发起加速，必须保证DMA能看到这些写；DMA写出结果后CPU读取，必须保证读取发生在设备真正完成之后。<b>一致性</b>决定同一地址各缓存副本的权限/数据一致，<b>内存顺序</b>约束多个操作的可见先后，<b>完成</b>说明设备承诺了哪一阶段。三者并不等价。</p><p>Gemmini DMA使用Get/Put风格TileLink主端口，其本地SP/ACC并不是CPU缓存中的自动一致副本。DMA访问若接到SoC的一致性点，可由host一致性代理协调CPU缓存；若接到非一致内存路径，软件/驱动需要相应缓存维护与所有权交接。不能从“用了TileLink”推出所有配置都会探测CPU缓存。</p><p>本地Chipyard文档明确把DMA直接连接coherent memory system与经L1接口区分，也说明L2可选InclusiveCache或broadcast hub。Gemmini主仓库没有名为directory_controller的实现；在这里研究目录属于host SoC/扩展架构课程。</p><p><b>自己集成检查：</b>画出CPU store→缓存→一致性点→DMA read路径；明确发命令前的release、完成后的acquire、缓冲区生命周期及驱动API约定。请按具体SoC/操作系统实现验证，不能只插一条通用fence就宣称解决缓存维护。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 130,
              "label": "DMA"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/DMA.scala",
              "line": 206,
              "label": "DMA"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Controller.scala",
              "line": 443,
              "label": "Controller"
            },
            {
              "repo": "chipyard",
              "path": "docs/Customization/DMA-Devices.rst",
              "line": 7,
              "label": "docs/Customization/DMA-Devices.rst"
            },
            {
              "repo": "chipyard",
              "path": "docs/Customization/Memory-Hierarchy.rst",
              "line": 62,
              "label": "docs/Customization/Memory-Hierarchy.rst"
            }
          ]
        }
      ]
    },
    {
      "id": "noc-implementation",
      "title": "NoC：从规则连线走向分组交换",
      "kicker": "MICROARCHITECTURE / 从机制到实现",
      "summary": "这一章属于系统扩展设计。Gemmini内部systolic Mesh没有packet router，系统互联由host配置决定。",
      "sections": [
        {
          "id": "noc-vs-mesh",
          "title": "几何是 Mesh，协议可能完全不同",
          "html": "<p>二维mesh只是连接图形。Gemmini的Mesh沿固定方向传递操作数与控制；每条链路数据语义由位置决定。packet NoC则需要目的地、消息类型、分组边界、路由和争用管理，多个源共享物理链路。两者都能画成网格，但硬件责任不同。</p><p>Chipyard文档说明，系统TileLink互联通常可用crossbar，也可由Constellation替换为NoC。把Gemmini接入这种SoC会增加系统网络延迟与争用，但不会自动把PE改成网络路由器。</p><h4>自己做最小NoC</h4><p>从2×2网格、每包一个flit、确定性XY路由、每输入2深度FIFO开始。flit含dst_x、dst_y、type、transaction_id、payload；每个输出仲裁一个输入，满足下游容量后转发。先不做wormhole多flit，避免起步就引入packet锁定、tail释放和VC所有权。</p><p>连接到TileLink前还要定义NI：通道怎样封包、source/sink ID如何保留、请求响应依赖如何隔离。协议桥不是简单拼接payload。参见<a href=\"https://constellation.readthedocs.io/en/latest/\" target=\"_blank\" rel=\"noopener\">Constellation官方文档</a>。</p>",
          "refs": [
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/Mesh.scala",
              "line": 48,
              "label": "Mesh"
            },
            {
              "repo": "chipyard",
              "path": "docs/Customization/Memory-Hierarchy.rst",
              "line": 44,
              "label": "docs/Customization/Memory-Hierarchy.rst"
            },
            {
              "repo": "chipyard",
              "path": "docs/Customization/NoC-SoCs.rst",
              "line": 6,
              "label": "docs/Customization/NoC-SoCs.rst"
            }
          ]
        },
        {
          "id": "router-pipeline",
          "title": "Router 的四件事：算路、分配、仲裁、穿越",
          "html": "<p>一个典型wormhole router可分为RC（确定下一跳候选）、VA（分配下游虚拟通道）、SA（多个输入争用输出crossbar）、ST（数据穿过交换阵列）。这不是Gemmini PE的流水线，而是系统NoC的微架构例子。Constellation官方描述了这些阶段与可合并的组合路径。</p><h4>写RTL时需要的状态</h4><ul><li>每输入VC的FIFO、读写指针、占用计数。</li><li>当前packet目标与已分配的输出/VC。</li><li>每输出VC空闲状态和仲裁指针。</li><li>下游credit数量；离开的flit与返回credit分别更新。</li></ul><p>组合逻辑从FIFO头生成候选，仲裁生成one-hot grant，crossbar按grant选择数据；时序逻辑只在实际转发时pop/push/扣credit。head获得VC，body沿已保存路径走，tail被接收后释放所有权。不能每个body重新算路后任意选VC，否则packet可能被拆散。</p><p><b>验证：</b>用不同输入持续请求同一个输出检查公平性；反压某个目的地检查其他目的地仍能推进；让head/tail在阻塞时保持一致。<a href=\"https://constellation.readthedocs.io/en/latest/Configuration/Routers.html\" target=\"_blank\" rel=\"noopener\">官方Router参数说明</a>。</p>",
          "refs": [
            {
              "repo": "chipyard",
              "path": "docs/Generators/Constellation.rst",
              "line": 6,
              "label": "docs/Generators/Constellation.rst"
            }
          ]
        },
        {
          "id": "credits-and-vcs",
          "title": "Credit、VC 与死锁：多加缓冲并不等于安全",
          "html": "<p>Credit表示接收端尚可容纳的flit槽数。发送一次扣一个，接收端释放槽后返还一个。credit不是确认数据已被最终消费者处理；它只描述某段链路下游缓冲容量。为了抵御返回延迟，链路可以有多个在途flit。</p><p>VC把一条物理链路分成多个独立排队/资源占用上下文，用于降低队头阻塞或打破依赖环。VC仍共享物理带宽。死锁来源于循环等待资源，需从channel-dependency图证明无环或提供可逃逸子网络；“有2个VC”本身不是证明。</p><h4>先做可证明的路由</h4><p>在无环回边的二维mesh上，严格先X后Y的确定性路由可按维度建立无环资源顺序；如果加入torus、转弯例外、请求响应共享缓冲或自适应路由，原证明不再直接适用。协议层也可能死锁：请求占满队列等待响应，而响应又需要同一被请求堵住的资源。</p><p>自己实现时写两个不变量：credit从不为负也不超过缓冲深度；buffered+in-flight+available-credit的守恒关系符合链路契约。再写活性假设：目的端最终接收、仲裁不会永久饿死。安全检查通过并不自动证明最终完成。</p>",
          "refs": [
            {
              "repo": "chipyard",
              "path": "docs/Generators/Constellation.rst",
              "line": 8,
              "label": "docs/Generators/Constellation.rst"
            }
          ]
        },
        {
          "id": "noc-integration-lab",
          "title": "把多个加速器接上网络：先定义所有权和观测点",
          "html": "<p>多个Gemmini共享内存时，系统瓶颈可能是DRAM、L2、翻译或NoC，而非阵列。把“每核峰值×核数”作为实际吞吐会忽略共同资源。第一步列出哪些数据私有、哪些只读共享、哪些需要跨设备生产消费；第二步选择集中共享内存、显式消息传递或一致共享存储。</p><h4>建议的递进实验</h4><ol><li>两个请求源接单仲裁器与内存模型，验证ID与响应返回。</li><li>增加2×2单flit NoC，随机反压、随机目的地；检查无丢失/无重复/目的地正确。</li><li>增加多flit与VC，测试tail阻塞与中途撤销；不允许未定义的包内重排。</li><li>封装TileLink通道，使用协议监视器并区分请求/响应依赖。</li><li>最后加入缓存一致性与目录，同时考虑网络虚拟网络映射。</li></ol><p>在每跳记录队列占用、仲裁等待、credit空耗时；在设备边界记录命令/响应时间。只看最终kernel耗时无法分辨计算不足还是喂数不足。本网站NoC演示若有动画，应视为结构/事件推演，不能用来声称完整RTL的拥塞周期。</p>",
          "refs": [
            {
              "repo": "chipyard",
              "path": "docs/Customization/NoC-SoCs.rst",
              "line": 20,
              "label": "docs/Customization/NoC-SoCs.rst"
            },
            {
              "repo": "gemmini",
              "path": "src/main/scala/gemmini/CounterFile.scala",
              "line": 1,
              "label": "CounterFile"
            }
          ]
        }
      ]
    },
    {
      "id": "coherence-directory",
      "title": "缓存一致性与 directory_controller：从权限到状态机",
      "kicker": "MICROARCHITECTURE / 从机制到实现",
      "summary": "系统扩展教材：Gemmini本地存储不实现这一目录。学习host缓存时，要同时看元数据阵列与事务控制。",
      "sections": [
        {
          "id": "coherence-basics",
          "title": "先定义单写多读，再选择 MESI 或 TileLink 权限",
          "html": "<p>缓存一致性首先要守住单地址的权限规则：允许多个只读副本，或者一个可写所有者；写权限授予前必须收回冲突副本。MESI用M/E/S/I描述一种协议状态族，TileLink定义None/Branch/Trunk等权限关系与消息，不能直接把每个名称按字母硬套成MESI。</p><p>一致性不是“每次读都访问最新DRAM”：最新数据可能在某个dirty cache，内存副本暂时较旧，目录必须知道该向谁取数据。也不是“给所有cache发invalidate就立刻完成”：失效消息可能在网络和队列里，必须等待对方确认撤销权限。</p><h4>最小两核单行设计</h4><p>先只有一条缓存行、两个客户端，定义U（无人）、S（共享读者位图）、M（独占写者）。读U可授予S；读M由其他核发起时要召回/降级；写S要失效其他读者；写M由其他核发起时要召回原owner。为每个转换列请求、消息、等待条件与最终状态。</p><p>这只是自编教学协议，不是完整MESI，也不是TileLink实现。<a href=\"https://www.sifive.com/documentation\" target=\"_blank\" rel=\"noopener\">TileLink规范入口</a>提供真实通道与权限消息定义。</p>",
          "refs": [
            {
              "repo": "chipyard",
              "path": "docs/Customization/Memory-Hierarchy.rst",
              "line": 49,
              "label": "docs/Customization/Memory-Hierarchy.rst"
            },
            {
              "repo": "chipyard",
              "path": "docs/Customization/Memory-Hierarchy.rst",
              "line": 80,
              "label": "docs/Customization/Memory-Hierarchy.rst"
            }
          ]
        },
        {
          "id": "cache-controller",
          "title": "缓存控制器：tag 命中只是开始",
          "html": "<p>一个可写回Cache控制器至少管理命中路径、miss分配、脏驱逐、回填、probe以及错误。元数据阵列保存tag、valid、dirty和权限；数据阵列保存cache line；MSHR保存尚未完成的事务。控制逻辑必须处理本地CPU请求与外来probe的资源争用和瞬态相遇。</p><p>读源码时把组合判定与时序状态分开：tag compare给出hit/way，权限检查决定可否执行；缺数据或缺权限都可能需要外部事务；回填到达不代表CPU响应已被接受；dirty release不代表写回响应已完成。</p><h4>自己实现顺序</h4><ol><li>只读直映射cache，单miss阻塞，验证行偏移和回填。</li><li>增加写命中、dirty与驱逐，确认不会在写回前覆盖旧行。</li><li>增加来自目录的probe，忙时有定义的排队/重试规则。</li><li>增加状态瞬态与事务ID，随后再增加多MSHR。</li></ol><p>host源码参考：<a href=\"https://github.com/chipsalliance/rocket-chip/blob/c7aabd2823d3d001a7a9e8a982bb65d6cb7c9bdf/src/main/scala/rocket/DCache.scala\" target=\"_blank\" rel=\"noopener\">Rocket DCache固定依赖版本</a>。这是平台实现参考链接，本次主资料包未完整展开该平台子模块；不要把线上当前分支与本地固定版本混为一谈。</p>",
          "refs": [
            {
              "repo": "chipyard",
              "path": "docs/Customization/RoCC-Accelerators.rst",
              "line": 59,
              "label": "docs/Customization/RoCC-Accelerators.rst"
            },
            {
              "repo": "chipyard",
              "path": "docs/Customization/Memory-Hierarchy.rst",
              "line": 52,
              "label": "docs/Customization/Memory-Hierarchy.rst"
            }
          ]
        },
        {
          "id": "directory-controller",
          "title": "目录不是一个状态寄存器：元数据阵列 + 在途事务表",
          "html": "<p>目录的稳定元数据通常包含tag、状态、owner、sharers、dirty/数据位置。事务控制还要记住当前requester、操作、已发probe、待收ACK、数据是否到达、grant是否发出和响应是否被接受。许多实现并不叫directory_controller一个文件：目录阵列与MSHR/scheduler协作完成协议。</p><p>官方inclusive-cache源码就是一个学习入口：<a href=\"https://github.com/chipsalliance/rocket-chip-inclusive-cache/blob/main/design/craft/inclusivecache/src/Directory.scala\" target=\"_blank\" rel=\"noopener\">Directory.scala</a>处理目录读写，<a href=\"https://github.com/chipsalliance/rocket-chip-inclusive-cache/blob/main/design/craft/inclusivecache/src/MSHR.scala\" target=\"_blank\" rel=\"noopener\">MSHR.scala</a>管理事务等待和调度；这些是在线扩展阅读，不是Gemmini内部模块。</p><pre><code>IDLE: latch request; pending = conflicting_holders;\nSEND: probe remaining holders, record accepted probes;\nWAIT: clear pending[id] only for a valid expected ACK;\nGRANT: after all ACK/data conditions, hold response;\nCOMMIT: once granted transaction finishes, update directory;</code></pre><p>pending应为位图或有身份的计数，重复ACK不能让等待数少一次；迟到ACK必须有transaction tag/epoch区分，不能误完成后来的事务。真实系统还要处理脏数据转发、多beat、超时、probe与release竞争、同组替换冲突。仅U/S/M三个稳定状态远远不够。</p>",
          "refs": [
            {
              "repo": "chipyard",
              "path": "docs/Generators/Rocket-Chip-Generators.rst",
              "line": 10,
              "label": "docs/Generators/Rocket-Chip-Generators.rst"
            }
          ]
        },
        {
          "id": "directory-build-test",
          "title": "从教学目录走向可用系统：先守住不变量",
          "html": "<p>本网站的 <a href=\"rtl/README.md\">learn_directory.sv</a> 是独立教学原型：两个客户端、一条隐含缓存行、单个在途事务、权限元数据；没有cache line数据、真实内存、消息网络、地址、事务tag和异常。它用probe与ACK两个阶段防止在probe真正被接受前就清除等待位，响应则保持到ready。</p><h4>必须验证的行为</h4><ul><li>共享读者C0/C1之后C1请求写，只向C0发失效，收到对应ACK前不得grant。</li><li>owner C0被C1读时先降级，完成后两者为共享读者。</li><li>重复ACK、非等待客户端ACK不能提前完成。</li><li>输出阻塞期间响应身份与权限保持；目录事务未完成时不接受新请求。</li><li>任何稳定状态下M恰好一个owner，S没有独占owner。</li></ul><p>继续扩展应先加入行地址与tag，再加入缓存行数据与脏转发、每事务ID、多个MSHR，最后才接NoC。每增加一种并发，都重画“谁等待谁”的图并补竞争测试。完整一致性需要端到端参考内存模型、随机序列、协议断言与活性分析，教学testbench通过只证明列出的有限情景。</p><p><b>最终练习：</b>用一页设计说明写清接口、状态表、消息格式、拒绝/重试策略、完成条件与五条不变量。能说明为什么不会同时授予两个写者，才算把“directory_controller怎么写”变成了可审查的设计。</p>",
          "refs": [
            {
              "repo": "chipyard",
              "path": "docs/Customization/Memory-Hierarchy.rst",
              "line": 80,
              "label": "docs/Customization/Memory-Hierarchy.rst"
            }
          ]
        }
      ]
    }
  ],
  "concepts": [
    {
      "id": "elaboration",
      "term": "硬件展开",
      "english": "Elaboration",
      "category": "rtl",
      "why": "把参数化设计变成具体数量的寄存器、模块与连线。",
      "implementation": "Mesh的Seq.fill复制Tile，维度在生成时确定。",
      "build": "先生成2×2再生成4×4，比较实例数与端口；不要只改软件DIM。",
      "invariant": "所有索引和类型位宽在展开后合法。",
      "pitfall": "把Scala for循环当成运行时循环。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 39,
          "label": "Mesh"
        }
      ]
    },
    {
      "id": "state",
      "term": "组合与时序",
      "english": "Combinational / Sequential logic",
      "category": "rtl",
      "why": "区分本拍计算与跨拍保存的信息。",
      "implementation": "PE c1/c2是Reg，MacUnit是组合乘加关系。",
      "build": "画current-state→comb→next-state，再统一在posedge更新。",
      "invariant": "stall条件下需要保存的状态保持。",
      "pitfall": "把多处条件赋值理解为多个顺序软件写入。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 23,
          "label": "PE"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 70,
          "label": "PE"
        }
      ]
    },
    {
      "id": "handshake",
      "term": "握手接受事件",
      "english": "Ready / Valid / Fire",
      "category": "rtl",
      "why": "让不同延迟模块按容量交换事务。",
      "implementation": "RS issue.fire定义为valid&&ready；Controller连接控制器ready。",
      "build": "所有指针、计数和命令推进由fire触发。",
      "invariant": "一次fire对应一次接受，阻塞不重复接收。",
      "pitfall": "只看valid递增计数。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/ReservationStation.scala",
          "line": 22,
          "label": "ReservationStation"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 346,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "backpressure",
      "term": "反压",
      "english": "Backpressure",
      "category": "rtl",
      "why": "下游拥塞时阻止上游覆盖未消费内容。",
      "implementation": "Scratchpad读ready受响应槽与单端口写占用限制。",
      "build": "从响应存储空间倒推新读能否接受。",
      "invariant": "已接受请求的响应永不因无槽而丢失。",
      "pitfall": "响应到来后才发现没有地方保存。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 116,
          "label": "Scratchpad"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 176,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "elastic",
      "term": "弹性缓冲",
      "english": "Elastic Buffer",
      "category": "rtl",
      "why": "隔离数据保存与消费，同时允许满时同拍替换。",
      "implementation": "上游采用Chisel Queue；教学learn_elastic是独立一格队列。",
      "build": "full/data寄存；ready=!full||out_ready；ready时full更新为in_valid。",
      "invariant": "阻塞时out_valid和data不变。",
      "pitfall": "误称带组合ready回传的一格队列能切断全部时序路径。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 117,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "fifo",
      "term": "先进先出",
      "english": "FIFO",
      "category": "rtl",
      "why": "缓存突发与延迟差，保持事务顺序。",
      "implementation": "Controller与Scratchpad多级Queue解耦命令和数据。",
      "build": "写读指针和count只在各自fire时更新，显式处理同时push/pop。",
      "invariant": "0≤count≤depth且输出顺序等于接受顺序。",
      "pitfall": "只比较读写指针而不区分满空。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 237,
          "label": "Controller"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 274,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "arbitration",
      "term": "仲裁与公平性",
      "english": "Arbitration",
      "category": "rtl",
      "why": "多个访问者共享端口或完成总线。",
      "implementation": "Controller对EX/Im2Col读和多个完成源做Arbiter。",
      "build": "先固定优先级，后增加RR；grant必须one-hot且只给ready路径。",
      "invariant": "每拍每个资源至多接受一个赢者。",
      "pitfall": "固定优先级下长期低优先级请求可能饥饿。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 381,
          "label": "Controller"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 425,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "tag",
      "term": "数据标签",
      "english": "Transaction Tag / ID",
      "category": "rtl",
      "why": "将延迟返回的数据关联到原命令。",
      "implementation": "Mesh同步传递matmul id；DMA响应携带source/xactid。",
      "build": "把ID与payload同级流水，复用前等旧事务完全退出。",
      "invariant": "返回数据只能修改其所属条目。",
      "pitfall": "数据延迟而ID未延迟，或提前复用ID。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 99,
          "label": "Mesh"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 294,
          "label": "DMA"
        }
      ]
    },
    {
      "id": "mac",
      "term": "乘加单元",
      "english": "MAC",
      "category": "core",
      "why": "神经网络矩阵运算的基本算术。",
      "implementation": "MacUnit用Arithmetic.mac表达c+a*b。",
      "build": "显式声明signed乘积与累加域，先写纯函数参考。",
      "invariant": "有效输入恰计一次，无效输入不改变累加。",
      "pitfall": "INT8乘积当成8位，或忘记符号扩展。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 14,
          "label": "PE"
        }
      ]
    },
    {
      "id": "precision",
      "term": "精度与溢出",
      "english": "Precision / Overflow",
      "category": "core",
      "why": "控制面积、带宽与数值误差。",
      "implementation": "input/weight/output/acc是不同类型，PE可复用MAC。",
      "build": "为每条边标位宽，定义缩窄处舍入和饱和。",
      "invariant": "每次类型转换符合约定数值语义。",
      "pitfall": "把INT8输入等同于INT8累加。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 58,
          "label": "PE"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 64,
          "label": "PE"
        }
      ]
    },
    {
      "id": "ws",
      "term": "权重驻留",
      "english": "Weight Stationary",
      "category": "core",
      "why": "重复使用权重，减少相应移动。",
      "implementation": "WS分支从c1或c2选择驻留权重，MAC加数来自b。",
      "build": "preload weight寄存，valid时计算partial+a*w。",
      "invariant": "preload和compute先后规则明确。",
      "pitfall": "将WS误解为所有输入和结果都不移动。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 118,
          "label": "PE"
        }
      ]
    },
    {
      "id": "os",
      "term": "输出驻留",
      "english": "Output Stationary",
      "category": "core",
      "why": "把部分和留在PE，减少部分和流动。",
      "implementation": "OS分支MAC加数来自本地c1/c2。",
      "build": "start清本次和，逐k累加，last标识最终输出。",
      "invariant": "不同输出不能无意共用未清的累加状态。",
      "pitfall": "换矩阵时忘记清零或预载偏置。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 102,
          "label": "PE"
        }
      ]
    },
    {
      "id": "double-buffer",
      "term": "双缓冲",
      "english": "Double Buffering",
      "category": "core",
      "why": "让一组数据被计算时另一组装载或排出。",
      "implementation": "PE c1/c2通过propagate交换计算/传播角色。",
      "build": "显式记录bank ownership，旧数据释放后才能覆盖。",
      "invariant": "缓冲区不能同时被新写者覆盖与旧读者消费。",
      "pitfall": "两个寄存器等同于无条件双倍吞吐。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 70,
          "label": "PE"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/PE.scala",
          "line": 89,
          "label": "PE"
        }
      ]
    },
    {
      "id": "skew",
      "term": "数据偏斜与对齐",
      "english": "Skew / Alignment",
      "category": "core",
      "why": "使相同k的操作数在正确PE同拍相遇。",
      "implementation": "MeshWithDelays外围组织延迟，Mesh逐行逐列流水。",
      "build": "从时空表计算每个边缘元素注入拍，标签同延迟。",
      "invariant": "同一乘加的A/B/control属于同一个任务。",
      "pitfall": "数值对齐了但valid/id错拍。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 48,
          "label": "Mesh"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 76,
          "label": "Mesh"
        }
      ]
    },
    {
      "id": "fill-drain",
      "term": "填充与排空",
      "english": "Fill / Drain",
      "category": "core",
      "why": "阵列边界进出数据有传播开销。",
      "implementation": "Mesh跨Tile寄存并在底边捕获输出。",
      "build": "计数器不能只数K；等待最后有效结果退出。",
      "invariant": "done晚于最后结果被保存。",
      "pitfall": "峰值MAC数直接当作小矩阵性能。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 117,
          "label": "Mesh"
        }
      ]
    },
    {
      "id": "scratchpad",
      "term": "显式片上存储",
      "english": "Scratchpad",
      "category": "memory",
      "why": "让分块数据复用与搬运由软件可控。",
      "implementation": "LocalAddr指定SP/ACC与本地行，ScratchpadBank为SRAM。",
      "build": "先地址译码再bank仲裁，DMA填入后才能计算。",
      "invariant": "未搬入的数据不能被当作有效操作数。",
      "pitfall": "把scratchpad当成自动缓存或CPU地址别名。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/LocalAddr.scala",
          "line": 21,
          "label": "LocalAddr"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 163,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "bank",
      "term": "分Bank存储",
      "english": "Memory Banking",
      "category": "memory",
      "why": "增加可并行访问的端口来源。",
      "implementation": "LocalAddr的bank字段来自行号高位，映射受配置决定。",
      "build": "按映射拆bank/row，构造同bank和异bank请求测试。",
      "invariant": "一个物理端口同拍不执行不支持的操作组合。",
      "pitfall": "假设连续元素按最低位交叉到不同bank。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/LocalAddr.scala",
          "line": 33,
          "label": "LocalAddr"
        }
      ]
    },
    {
      "id": "sram-read",
      "term": "同步SRAM读",
      "english": "Synchronous SRAM Read",
      "category": "memory",
      "why": "真实SRAM读有延迟，响应需要缓存。",
      "implementation": "Scratchpad使用SyncReadMem并RegNext(ren)产生响应valid。",
      "build": "接受读时预留响应槽，保存来源标签。",
      "invariant": "每个ren对应一个有效读结果。",
      "pitfall": "把同步读写成同拍组合读并期望时序一致。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 163,
          "label": "Scratchpad"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Scratchpad.scala",
          "line": 172,
          "label": "Scratchpad"
        }
      ]
    },
    {
      "id": "accumulator",
      "term": "宽累加存储",
      "english": "Accumulator",
      "category": "memory",
      "why": "保存跨块高精度部分和并支持累加。",
      "implementation": "AccumulatorMem保存写流水并调用加法器。",
      "build": "单在途RMW起步，再补地址旁路或冲突阻塞。",
      "invariant": "同地址累加看到正确的最新逻辑旧值。",
      "pitfall": "只加SRAM不处理读改写hazard。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/AccumulatorMem.scala",
          "line": 113,
          "label": "AccumulatorMem"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/AccumulatorMem.scala",
          "line": 127,
          "label": "AccumulatorMem"
        }
      ]
    },
    {
      "id": "local-address",
      "term": "本地地址元数据",
      "english": "Local Address Encoding",
      "category": "memory",
      "why": "在同一命令字段表达目标空间与操作模式。",
      "implementation": "LocalAddr包含is_acc_addr、accumulate、read_full_acc_row。",
      "build": "先decode控制位再提取bank/row，检查越界与garbage。",
      "invariant": "地址比较包含存储空间，不把SP行与ACC行混同。",
      "pitfall": "把整个32位本地地址直接当主存字节地址。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/LocalAddr.scala",
          "line": 21,
          "label": "LocalAddr"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/LocalAddr.scala",
          "line": 41,
          "label": "LocalAddr"
        }
      ]
    },
    {
      "id": "dma",
      "term": "直接存储访问",
      "english": "DMA",
      "category": "memory",
      "why": "让设备搬运大块数据而非CPU逐字拷贝。",
      "implementation": "StreamReader分块发TileLink Get并合并返回beat。",
      "build": "单在途请求→多ID→乱序响应，逐步验证。",
      "invariant": "每个发出事务最终唯一完成或报错并释放。",
      "pitfall": "把请求握手等同于数据已到本地存储。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 130,
          "label": "DMA"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 206,
          "label": "DMA"
        }
      ]
    },
    {
      "id": "burst",
      "term": "传输粒度与对齐",
      "english": "Beat / Burst / Alignment",
      "category": "memory",
      "why": "匹配总线支持的尺寸和边界。",
      "implementation": "DMA根据beatBytes、maxBytes与对齐限制选请求尺寸。",
      "build": "区分原命令长度、请求size、beat和最终本地行。",
      "invariant": "不跨不允许的边界，mask精确覆盖目标字节。",
      "pitfall": "“DMA 128bit”当成每拍实测可用带宽。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 143,
          "label": "DMA"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/DMA.scala",
          "line": 168,
          "label": "DMA"
        }
      ]
    },
    {
      "id": "raw",
      "term": "写后读依赖（RAW）",
      "english": "Read After Write (RAW)",
      "category": "ordering",
      "why": "后读不能读到前写尚未生成的旧值。",
      "implementation": "RS比较新读区域与老写区域，建立依赖位。",
      "build": "对重叠半开区间记录producer ID，完成后解除。",
      "invariant": "读执行晚于它依赖的写完成。",
      "pitfall": "只比较起始地址，漏掉部分重叠。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/ReservationStation.scala",
          "line": 360,
          "label": "ReservationStation"
        }
      ]
    },
    {
      "id": "war",
      "term": "写覆盖早先读",
      "english": "Write After Read (WAR)",
      "category": "ordering",
      "why": "后写不能在前读结束前破坏数据。",
      "implementation": "RS在LD与EX/ST区域重叠时建立WAR相关约束。",
      "build": "保留读者生命周期，读取实际结束后再允许覆盖。",
      "invariant": "每个读看到所属版本的数据。",
      "pitfall": "发射读命令后立刻认为所有数据都读完。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/ReservationStation.scala",
          "line": 329,
          "label": "ReservationStation"
        }
      ]
    },
    {
      "id": "waw",
      "term": "写后写次序",
      "english": "Write After Write (WAW)",
      "category": "ordering",
      "why": "两写相同区域时最终值需遵循命令顺序。",
      "implementation": "RS用区域冲突与队列顺序限制重排。",
      "build": "后写依赖前写，或设计有明确定义的版本机制。",
      "invariant": "年轻写不能被迟到老写覆盖。",
      "pitfall": "不同引擎延迟不同却只看发射顺序。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/ReservationStation.scala",
          "line": 332,
          "label": "ReservationStation"
        }
      ]
    },
    {
      "id": "rs",
      "term": "保留站",
      "english": "Reservation Station",
      "category": "ordering",
      "why": "允许无依赖的LD/EX/ST并行，阻塞有冲突的命令。",
      "implementation": "条目包含valid、issued、操作区间和deps位图。",
      "build": "先实现保守单队列，再拆引擎与依赖图。",
      "invariant": "发射只选有效且未发射且无依赖条目。",
      "pitfall": "直接称为通用CPU寄存器重命名ROB。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/ReservationStation.scala",
          "line": 112,
          "label": "ReservationStation"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/ReservationStation.scala",
          "line": 329,
          "label": "ReservationStation"
        }
      ]
    },
    {
      "id": "completion",
      "term": "完成反馈",
      "english": "Issue vs Completion",
      "category": "ordering",
      "why": "下游接收不代表数据已生成。",
      "implementation": "三控制器completed事件经仲裁返回RS。",
      "build": "给每个事务ID定义发射、最终写入、释放的边界。",
      "invariant": "条目只在其真实完成条件后回收。",
      "pitfall": "issue.fire时解除所有依赖。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 425,
          "label": "Controller"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 438,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "tlb",
      "term": "翻译后备缓冲",
      "english": "TLB",
      "category": "ordering",
      "why": "缓存地址转换与权限，减少页表访问。",
      "implementation": "FrontendTLB实例化Rocket TLB并处理异常/flush。",
      "build": "裸机物理地址模式起步；虚拟模式复用host PTW。",
      "invariant": "翻译与访问权限上下文匹配。",
      "pitfall": "把page fault当成普通miss无限重试。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/FrontendTLB.scala",
          "line": 46,
          "label": "FrontendTLB"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/FrontendTLB.scala",
          "line": 62,
          "label": "FrontendTLB"
        }
      ]
    },
    {
      "id": "ptw",
      "term": "页表遍历",
      "english": "Page Table Walker",
      "category": "ordering",
      "why": "在TLB miss时取得映射和权限。",
      "implementation": "Gemmini将TLBPTWIO连接到RoCC主机PTW。",
      "build": "定义miss请求、响应、异常和映射更新同步契约。",
      "invariant": "不使用已被无效化的翻译访问新地址空间。",
      "pitfall": "TLB flush被误认为刷新cache数据。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/FrontendTLB.scala",
          "line": 60,
          "label": "FrontendTLB"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 181,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "noc",
      "term": "片上网络",
      "english": "Network on Chip",
      "category": "noc",
      "why": "让多个SoC代理共享可扩展的数据传输结构。",
      "implementation": "Gemmini Mesh不是packet NoC；Chipyard可选Constellation替换系统总线。",
      "build": "先2×2单flit XY网络，再加多flit与协议NI。",
      "invariant": "数据无丢失、无重复、到达正确目的地。",
      "pitfall": "把PE阵列二维连线等同于路由网络。",
      "refs": [
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Mesh.scala",
          "line": 48,
          "label": "Mesh"
        },
        {
          "repo": "chipyard",
          "path": "docs/Customization/NoC-SoCs.rst",
          "line": 6,
          "label": "docs/Customization/NoC-SoCs.rst"
        }
      ]
    },
    {
      "id": "router",
      "term": "路由器与交叉开关",
      "english": "Router / Crossbar",
      "category": "noc",
      "why": "在多个输入间选择输出链路。",
      "implementation": "系统扩展参考Constellation，非Gemmini内部模块。",
      "build": "FIFO头算候选，one-hot仲裁，crossbar选数据，fire时pop。",
      "invariant": "每个输出每拍至多一个输入获准。",
      "pitfall": "发送valid后未看下游接受就pop。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Generators/Constellation.rst",
          "line": 6,
          "label": "docs/Generators/Constellation.rst"
        }
      ]
    },
    {
      "id": "vc",
      "term": "虚拟通道",
      "english": "Virtual Channel",
      "category": "noc",
      "why": "隔离排队上下文，减少队头阻塞或组织资源依赖。",
      "implementation": "系统扩展参考；Gemmini PE没有VC分配器。",
      "build": "每VC保存FIFO/packet所有权，共享物理输出仲裁。",
      "invariant": "body/tail沿head分配的VC前进。",
      "pitfall": "VC数增加被当成物理带宽增加。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Generators/Constellation.rst",
          "line": 8,
          "label": "docs/Generators/Constellation.rst"
        }
      ]
    },
    {
      "id": "credit",
      "term": "信用流控",
      "english": "Credit Based Flow Control",
      "category": "noc",
      "why": "提前反映远端缓冲可用槽，支持多flit在途。",
      "implementation": "Constellation文档描述credit-based链接。",
      "build": "发出flit扣credit，远端释放槽返credit，规定同时事件。",
      "invariant": "credit范围合法且槽位守恒。",
      "pitfall": "把credit当作端到端请求完成ACK。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Generators/Constellation.rst",
          "line": 8,
          "label": "docs/Generators/Constellation.rst"
        }
      ]
    },
    {
      "id": "deadlock",
      "term": "死锁与活性",
      "english": "Deadlock / Liveness",
      "category": "noc",
      "why": "避免多资源循环等待导致永远不推进。",
      "implementation": "系统协议与网络层都可能有依赖环。",
      "build": "画channel-dependency图；XY顺序、逃逸VC和消息隔离要有证明。",
      "invariant": "在外部最终可接收等假设下事务最终完成。",
      "pitfall": "加更多FIFO或两个VC就声称死锁消失。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Generators/Constellation.rst",
          "line": 10,
          "label": "docs/Generators/Constellation.rst"
        }
      ]
    },
    {
      "id": "coherence",
      "term": "缓存一致性",
      "english": "Cache Coherence",
      "category": "coherence",
      "why": "维持同一地址各缓存副本的权限与数据关系。",
      "implementation": "属于host L2/broadcast代理；Gemmini SP/ACC不是CPU缓存副本。",
      "build": "先两核单行U/S/M模型，再加数据和事务ID。",
      "invariant": "单写者或多个只读者，不同时冲突。",
      "pitfall": "用了TileLink就假设任意连接点天然coherent。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Customization/Memory-Hierarchy.rst",
          "line": 62,
          "label": "docs/Customization/Memory-Hierarchy.rst"
        }
      ]
    },
    {
      "id": "consistency",
      "term": "内存顺序",
      "english": "Memory Ordering / Consistency",
      "category": "coherence",
      "why": "规定多个读写如何对其他代理观察。",
      "implementation": "CPU↔DMA还需完成同步与缓冲区所有权交接。",
      "build": "按具体SoC/OS定义release、acquire和非一致缓存维护。",
      "invariant": "消费者读取晚于生产者承诺的完成与可见条件。",
      "pitfall": "把fence、cache flush、TLB flush混为一谈。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Customization/DMA-Devices.rst",
          "line": 7,
          "label": "docs/Customization/DMA-Devices.rst"
        },
        {
          "repo": "gemmini",
          "path": "src/main/scala/gemmini/Controller.scala",
          "line": 443,
          "label": "Controller"
        }
      ]
    },
    {
      "id": "directory",
      "term": "目录元数据",
      "english": "Directory",
      "category": "coherence",
      "why": "避免广播到所有cache，记录谁持有副本。",
      "implementation": "不在Gemmini主仓库；host可选InclusiveCache或broadcast hub。",
      "build": "tag/state/owner/sharers阵列，配合事务控制和数据位置。",
      "invariant": "元数据记录与实际授予权限相容。",
      "pitfall": "只写sharers位图就以为完成整个协议。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Generators/Rocket-Chip-Generators.rst",
          "line": 10,
          "label": "docs/Generators/Rocket-Chip-Generators.rst"
        }
      ]
    },
    {
      "id": "directory-controller",
      "term": "目录控制器",
      "english": "Directory Controller",
      "category": "coherence",
      "why": "协调召回、失效、ACK、数据和授权完成。",
      "implementation": "系统扩展中Directory阵列与MSHR/scheduler协作，不必单文件同名。",
      "build": "保存requester/pending/sent/response，按事件推进瞬态。",
      "invariant": "冲突权限撤销且所需数据可用后才能grant。",
      "pitfall": "Gemmini中搜索不到同名模块却虚构它存在。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Customization/Memory-Hierarchy.rst",
          "line": 80,
          "label": "docs/Customization/Memory-Hierarchy.rst"
        }
      ]
    },
    {
      "id": "transient",
      "term": "瞬态与ACK集合",
      "english": "Transient State / Pending Acks",
      "category": "coherence",
      "why": "网络消息在途时稳定U/S/M状态不够描述系统。",
      "implementation": "独立learn_directory演示SEND→WAIT→RESP。",
      "build": "ACK以身份位图去重，关联事务ID；probe.fire后才等ACK。",
      "invariant": "未确认撤销的旧owner不能与新owner同时有写权限。",
      "pitfall": "重复ACK减少计数，迟到ACK误完成新事务。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Customization/Memory-Hierarchy.rst",
          "line": 80,
          "label": "docs/Customization/Memory-Hierarchy.rst"
        }
      ]
    },
    {
      "id": "mshr",
      "term": "缺失状态保持寄存器",
      "english": "Miss Status Holding Register",
      "category": "coherence",
      "why": "跨多个消息保存未完成cache事务并跟踪等待条件。",
      "implementation": "host inclusive-cache MSHR维护probe/grant/release等完成条件。",
      "build": "从单MSHR起步，再处理同地址合并、同组替换与多事务冲突。",
      "invariant": "每个事务的回复、数据与目录更新只归它所有。",
      "pitfall": "把MSHR当成只有地址的FIFO。",
      "refs": [
        {
          "repo": "chipyard",
          "path": "docs/Generators/Rocket-Chip-Generators.rst",
          "line": 10,
          "label": "docs/Generators/Rocket-Chip-Generators.rst"
        }
      ]
    }
  ]
};

/* NaplesPU master 02a73a6d: evidence-linked RTL learning content. */
window.NPU_HARDWARE = {
  "chapters": [
    {
      "id": "hw-map",
      "title": "先把系统拆成三张地图",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "把“仓库目录”“硬件层级”和“数据流”分开理解，再把它们一一对应。NaplesPU 的核心不是一个孤立的 ALU，而是一套从启动、执行、存储到互联的系统。",
      "sections": [
        {
          "title": "地图一：从可综合模块到实验环境",
          "paragraphs": [
            "src/ 保存设计与 testbench，boards/ 保存板级约束和 MIG 配置，tools/ 保存仿真与结果比较脚本。core/ 是计算核心，不是整个芯片；mc/ 是多 tile 系统；sc/ 是单核系统封装；deploy/ 才与具体 FPGA 的 UART、DDR 接口相连。",
            "这些目录不是运行顺序。理解时先沿实例化关系向下走，看到顶层输入输出以后，再沿一条请求的信号向前走。include/ 的宏、typedef 与消息结构是各层共同使用的“接口字典”。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/npu_core.sv",
              "line": 37,
              "label": "npu_core.sv"
            },
            {
              "path": "source/hardware/src/mc/system/npu_noc.sv",
              "line": 56,
              "label": "npu_noc.sv"
            },
            {
              "path": "source/hardware/src/sc/system/npu_system.sv",
              "line": 41,
              "label": "npu_system.sv"
            }
          ]
        },
        {
          "title": "地图二：4×4 网络位置不等于 16 个计算核",
          "paragraphs": [
            "默认配置 NoC_X_WIDTH=4、NoC_Y_WIDTH=4，生成 16 个位置。npu_noc 用 row×NoC_COL+col 生成线性 tile ID，先判断 memory 和 host 特殊 ID，再判断 NPU 和异构核数量，剩余实例化 tile_none。",
            "默认 TILE_NPU=8、TILE_HT=0，所以 0–7 是 NPU tile，14 是 host-to-core tile，15 是 memory tile，8–13 是没有计算核的 tile_none。tile_none 仍有网络接口、目录控制器和路由器；“none”省去的是计算核心，不是整块网络与存储服务。"
          ],
          "table": {
            "headers": [
              "位置",
              "默认 ID",
              "主要职责"
            ],
            "rows": [
              [
                "NPU tile",
                "0–7",
                "执行 kernel，同时连接本地存储与 NoC"
              ],
              [
                "无计算核 tile",
                "8–13",
                "仍有 NI、目录和路由器"
              ],
              [
                "Host tile",
                "14",
                "处理外部 item 流与核侧控制通信"
              ],
              [
                "Memory tile",
                "15",
                "把片上请求接到外部存储接口"
              ]
            ]
          },
          "sources": [
            {
              "path": "source/hardware/src/include/npu_user_defines.sv",
              "line": 90,
              "label": "npu_user_defines.sv"
            },
            {
              "path": "source/hardware/src/mc/system/npu_noc.sv",
              "line": 126,
              "label": "npu_noc.sv"
            },
            {
              "path": "source/hardware/src/mc/tile/tile_none.sv",
              "line": 184,
              "label": "tile_none.sv"
            }
          ]
        },
        {
          "title": "地图三：计算、数据、服务是不同流",
          "paragraphs": [
            "一条向量加法主要在计算核里流动；缓存未命中的 load 会横跨 core_interface、cache controller、NI、router 与 home directory；启动和 barrier 则走服务消息。它们共享系统，却不能混成一条通路。",
            "阅读顶层时把每组信号贴上三种标签：请求的拥有者是谁、谁用 valid/available 接受它、谁最终发出完成/唤醒。先建立这些责任边界，比从第一行 RTL 顺序阅读更有效。"
          ],
          "bullets": [
            "计算路径：fetch → decode → instruction buffer → scheduler → operand fetch → 执行管线 → writeback。",
            "数据路径：LSU ↔ 缓存控制/目录 ↔ NI ↔ NoC ↔ memory。",
            "服务路径：host/boot、I/O、barrier ACCOUNT/RELEASE。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/mc/tile/tile_npu.sv",
              "line": 46,
              "label": "tile_npu.sv"
            },
            {
              "path": "source/hardware/src/core/core_interface.sv",
              "line": 46,
              "label": "core_interface.sv"
            },
            {
              "path": "source/hardware/src/mc/network_interface/network_interface_core.sv",
              "line": 65,
              "label": "network_interface_core.sv"
            }
          ]
        },
        {
          "title": "参数是一组相互约束的设计选择",
          "paragraphs": [
            "默认每核 8 个硬件线程、16 个 32-bit 向量 lane，向量宽 512 bit。多个线程具有各自 PC 和寄存器上下文，共享执行资源；多个 lane 在同一条向量指令下处理多个元素；多个 tile 可执行不同线程组。三种并行尺度不同。",
            "用户宏并不意味着任意取值都能得到有效硬件。例如线程、组数、way 和 NoC 维度多处以 $clog2 计算；home directory 的地址映射还明确注明只适用于方形 NoC。网页配置计算只帮助理解规模，不能替代重新 elaboration、仿真和综合。"
          ],
          "note": {
            "type": "limit",
            "text": "本网站依据默认 master 快照。next 分支的浮点模块发生变化，不能把它的结构或行为混入 master 的讲解。"
          },
          "sources": [
            {
              "path": "source/hardware/src/include/npu_defines.sv",
              "line": 39,
              "label": "npu_defines.sv"
            },
            {
              "path": "source/hardware/src/include/npu_user_defines.sv",
              "line": 68,
              "label": "npu_user_defines.sv"
            },
            {
              "path": "source/hardware/src/mc/cache_controller/cache_controller_stage4.sv",
              "line": 91,
              "label": "cache_controller_stage4.sv"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-pipeline",
      "title": "跟随一条指令穿过核心",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "流水线不是简单的五个盒子。取指和操作数读取内部各有阶段，后端有多种延迟的执行管线，线程调度、buffer、writeback 和 rollback 共同维持正确性。",
      "sections": [
        {
          "title": "取指：先选线程，再读该线程的 PC",
          "paragraphs": [
            "instruction_fetch_stage 用 round-robin 从 Thread Controller 提供的 tc_thread_en 中选择一个线程。每个线程的 PC 独立保存；命中 I-cache 时选出 32-bit 指令，顺序 PC 按 4 byte 前进。",
            "取指 miss 不是给整个系统按暂停键。Thread Controller 用 load_miss_queue 记录请求，可合并同一 I-cache line 对应的线程（不同 PC 的行内 offset 可以不同），待指令行返回后唤醒相关线程。别的可运行线程仍可参与后续选择。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/instruction_fetch_stage.sv",
              "line": 34,
              "label": "instruction_fetch_stage.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_fetch_stage.sv",
              "line": 142,
              "label": "instruction_fetch_stage.sv"
            },
            {
              "path": "source/hardware/src/core/thread_controller.sv",
              "line": 99,
              "label": "thread_controller.sv"
            }
          ]
        },
        {
          "title": "译码与每线程指令 FIFO：把“取得指令”和“允许执行”解耦",
          "paragraphs": [
            "decode 把原始指令拆成 instruction_decoded_t：除了 opcode 和寄存器编号，还有线程 ID、PC、立即数、源/目标是否向量、mask_enable、pipe_sel 等信息。后级依赖这些语义字段，不再重复解释全部位编码。",
            "instruction_buffer 为每个线程建立私有 FIFO。译码写入对应线程，调度选中的线程出队；rollback 清空目标线程 FIFO。若该线程 LSU 队列满，buffer 会对其内存指令的有效性进行门控。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/decode.sv",
              "line": 42,
              "label": "decode.sv"
            },
            {
              "path": "source/hardware/src/include/npu_defines.sv",
              "line": 348,
              "label": "npu_defines.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_buffer.sv",
              "line": 77,
              "label": "instruction_buffer.sv"
            }
          ]
        },
        {
          "title": "操作数读取：线程地址、标量广播、立即数与有效地址",
          "paragraphs": [
            "operand_fetch 实例化 SRF 和 VRF，两者深度均按 REGISTER_NUMBER×THREAD_NUMB 组织。地址由 {thread_id, register_index} 拼接，因此同一个 s3 或 v3 在不同线程中不是同一个物理存储槽。",
            "若源是标量，读取一个 32-bit 值；需要向量形式时可复制到多个 lane。内存和分支操作使用译码指定的 base 源和立即数；对 PC 相对操作，还要选择 PC 的语义。这一层把“寄存器来源”和“执行数据格式”真正衔接起来。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/operand_fetch.sv",
              "line": 34,
              "label": "operand_fetch.sv"
            },
            {
              "path": "source/hardware/src/core/operand_fetch.sv",
              "line": 125,
              "label": "operand_fetch.sv"
            },
            {
              "path": "source/hardware/src/core/operand_fetch.sv",
              "line": 210,
              "label": "operand_fetch.sv"
            }
          ]
        },
        {
          "title": "多执行通路汇合：完成顺序与发射顺序不是同一件事",
          "paragraphs": [
            "整数、浮点、LSU 和 scratchpad 各自向 writeback 送结果，分支控制还会产生重定向/rollback。writeback 为不同结果源建立缓冲与仲裁，并处理小宽度 load 的符号扩展。",
            "从流水线图看到“一个 writeback”不能推断所有操作延迟相同。发射端既检查源/目标依赖，也检查结构性冲突与 writeback FIFO 压力；对某些不可预测的完成时间，还必须在写回端处理冲突。这里没有把全核抽象成固定每周期完成 16 次运算的模型。"
          ],
          "note": {
            "type": "limit",
            "text": "交互中的“下一步”表示请求在模块责任之间的推进，不是 RTL 的一个时钟周期；没有运行周期精确模拟器。"
          },
          "sources": [
            {
              "path": "source/hardware/src/core/writeback.sv",
              "line": 37,
              "label": "writeback.sv"
            },
            {
              "path": "source/hardware/src/core/writeback.sv",
              "line": 42,
              "label": "writeback.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 153,
              "label": "instruction_scheduler.sv"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-scheduling",
      "title": "为什么有指令，却暂时不能发射",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "用 scoreboard 识别数据依赖，用结构性门控保护共享资源，再在可发射线程中选择。线程轮转隐藏等待，但不会凭空消除依赖。",
      "sections": [
        {
          "title": "两次线程选择：可取指不等于可发射",
          "paragraphs": [
            "取指端 tc_if_thread_en 同时考虑等待、外部 thread_en、指令 FIFO 是否接近满和调试停止；执行端 can_issue 还要看已译码指令、RAW/WAW、writeback 队列、rollback、FPU/SPM 结构冲突和 barrier 状态。",
            "因此一个线程可能已取到下一条指令，却因为前条结果尚未写回而不能执行。另一个线程可能没有依赖，可以利用同一组执行资源。取指 round-robin 和发射 round-robin 分别解决前端供给与后端选择。"
          ],
          "code": {
            "language": "systemverilog",
            "text": "// 取指资格：等待、外部启用、缓冲压力、调试状态\ntc_if_thread_en = ~wait_thread_mask & thread_en\n               & ~ib_fifo_full & ~dsu_stop_issue;"
          },
          "sources": [
            {
              "path": "source/hardware/src/core/thread_controller.sv",
              "line": 124,
              "label": "thread_controller.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 155,
              "label": "instruction_scheduler.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 277,
              "label": "instruction_scheduler.sv"
            }
          ]
        },
        {
          "title": "每线程 128 位的 scoreboard 跟踪什么",
          "paragraphs": [
            "SCOREBOARD_LENGTH=REGISTER_NUMBER×2，默认 128 位。标量和向量寄存器用 {is_vector, register_index} 区分，各线程维护独立 scoreboard。发射时目的寄存器置忙，写回时释放；rollback 也可清除被取消指令留下的目的位。",
            "RAW 意味着本指令要读取一个尚未准备好的源；WAW 意味着它要写入一个已经有待完成写操作的目标。二者都用源/目标 mask 与 scoreboard 的位与来检测。mask 寄存器本身也会成为被 mask 指令的源依赖。"
          ],
          "code": {
            "language": "systemverilog",
            "text": "hazard_raw = |((source_mask_0 | source_mask_1) & scoreboard);\nhazard_waw = |(destination_mask & scoreboard);\nscoreboard_next = (scoreboard & ~scoreboard_clear_bitmap)\n                | scoreboard_set_bitmap[thread_id];"
          },
          "sources": [
            {
              "path": "source/hardware/src/include/npu_defines.sv",
              "line": 55,
              "label": "npu_defines.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 126,
              "label": "instruction_scheduler.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 149,
              "label": "instruction_scheduler.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 162,
              "label": "instruction_scheduler.sv"
            }
          ]
        },
        {
          "title": "结构冲突：数据就绪仍不是充分条件",
          "paragraphs": [
            "FPU 不同运算会在不同时间结束。如果两条已发射运算会在同一时刻碰到共享输出，scheduler 的 fp_pending_queue 会参与阻止冲突。SPM 的 spm_can_issue 和 writeback 的 wb_fifo_full 也会限制发射。",
            "这个设计把部分已知完成时间冲突前移到调度端，同时保留写回缓冲。理解 FPU 要同时读 fp_pipe、延迟宏与 scheduler；单看运算模块里的加法表达式，看不到调度保证。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 90,
              "label": "instruction_scheduler.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 188,
              "label": "instruction_scheduler.sv"
            },
            {
              "path": "source/hardware/src/core/fp_pipe.sv",
              "line": 40,
              "label": "fp_pipe.sv"
            }
          ]
        },
        {
          "title": "Rollback：改 PC 只是恢复的一部分",
          "paragraphs": [
            "rollback_handler 接收分支重定向、LSU 与 SPM 的异常请求，生成按线程的 rollback_valid、恢复 PC 和 scoreboard 清理位。被取消的在途操作与 buffer 项必须一起失效，避免把旧路径结果提交到新路径。",
            "阅读 rollback 时应追踪三条线：PC 在哪恢复，valid 在哪被屏蔽，目的寄存器 busy 在哪被清除。只清 FIFO 会遗留忙位；只改 PC 会让旧指令继续影响状态。该模块在相同线程事件中按分支、LSU、SPM 的顺序选择恢复来源。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/rollback_handler.sv",
              "line": 35,
              "label": "rollback_handler.sv"
            },
            {
              "path": "source/hardware/src/core/rollback_handler.sv",
              "line": 124,
              "label": "rollback_handler.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_buffer.sv",
              "line": 91,
              "label": "instruction_buffer.sv"
            }
          ]
        },
        {
          "title": "一处容易被名称误导的信号",
          "paragraphs": [
            "scheduler 中 scoreboard_empty 被赋值为 |scoreboard。也就是说，信号为 1 时实际上“至少有一个寄存器仍然忙”；barrier_core 再通过 ~scoreboard_empty 判断没有在途寄存器写入。",
            "这不是网页为该信号另起的规范，而是该快照中的真实赋值。阅读开源 RTL 时，名称和注释是线索，布尔定义和使用端才确定语义。也不应根据这一个名称就直接宣告硬件 bug：生产端与消费端可能使用了一致的反向含义。"
          ],
          "note": {
            "type": "fact",
            "text": "已直接核对 scoreboard_empty = |scoreboard，以及 barrier_core 的 can_account 对它取反；本页不把该名称按字面解释。"
          },
          "sources": [
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 171,
              "label": "instruction_scheduler.sv"
            },
            {
              "path": "source/hardware/src/mc/synchronization/barrier_core.sv",
              "line": 107,
              "label": "barrier_core.sv"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-registers",
      "title": "线程、向量 lane 与掩码",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "把一条指令的控制流、16 个数据元素和多个线程上下文分清，才能读懂 GPU-like 这个描述在 NaplesPU 里具体意味着什么。",
      "sections": [
        {
          "title": "三种“同时”不是同一个维度",
          "paragraphs": [
            "一个硬件线程拥有独立 PC 和寄存器上下文；它发射的向量指令操作 16 个 lane。8 个线程共享核心执行资源，这不表示每周期同时发射 8 条、每条再运行 16 lane。多个 tile 则把核心扩展到系统层。",
            "一个向量变量 vec16i32 通常对应 16 个 32-bit 元素；一个标量变量是一个 32-bit 值。程序员可以分配工作给不同 core/thread，再用向量表达式处理每个线程的数据块。线程划分与向量划分可以独立决定。"
          ],
          "table": {
            "headers": [
              "层次",
              "默认规模",
              "上下文/共享关系"
            ],
            "rows": [
              [
                "lane",
                "16",
                "共享一条向量指令及其 lane mask"
              ],
              [
                "硬件线程",
                "每核8",
                "独立 PC、SRF/VRF 片段，竞争执行资源"
              ],
              [
                "NPU tile",
                "8",
                "各有核心，经 NoC 共享存储系统"
              ]
            ]
          },
          "sources": [
            {
              "path": "source/hardware/src/include/npu_defines.sv",
              "line": 39,
              "label": "npu_defines.sv"
            },
            {
              "path": "source/hardware/src/include/npu_user_defines.sv",
              "line": 68,
              "label": "npu_user_defines.sv"
            },
            {
              "path": "source/hardware/src/core/operand_fetch.sv",
              "line": 34,
              "label": "operand_fetch.sv"
            }
          ]
        },
        {
          "title": "64 个标量寄存器与 64 个 512-bit 向量寄存器",
          "paragraphs": [
            "REGISTER_NUMBER=64 同时用于标量/向量寄存器文件的编号空间；并非“总共 64 个寄存器”。默认向量寄存器宽 16×32=512 bit。标量编号还保留 PC、返回地址、栈指针、帧指针和掩码等用途。",
            "宏定义 MASK_REG=REGISTER_NUMBER−5，所以当前值为 59。operand_fetch 的一处旧注释写默认 $60，但实现用宏；这正是应以定义和后端寄存器约定交叉核对的例子。不能把注释里的数字直接画进寄存器架构。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/include/npu_defines.sv",
              "line": 41,
              "label": "npu_defines.sv"
            },
            {
              "path": "source/hardware/src/include/npu_defines.sv",
              "line": 62,
              "label": "npu_defines.sv"
            },
            {
              "path": "source/hardware/src/core/operand_fetch.sv",
              "line": 41,
              "label": "operand_fetch.sv"
            }
          ]
        },
        {
          "title": "掩码参与读依赖，也参与最终字节写使能",
          "paragraphs": [
            "每线程 mask_register 保存 lane 活跃位。若译码说明当前指令不启用 mask，operand_fetch 输出全 1；否则取该线程的掩码。写回向量寄存器时，lane mask 再和字节写使能相与，决定每个 byte 是否真正更新。",
            "这意味着“禁用 lane”一般是保留原来的寄存器字节，而不是自动写零。部分宽度 move 或 load 还需要字节层控制。理解条件向量化时，应沿 mask_enable → opf_hw_lane_mask → wb_result_hw_lane_mask → write_en_byte 追踪。"
          ],
          "code": {
            "language": "systemverilog",
            "text": "opf_hw_lane_mask_buff = next_issue_inst_scheduled.mask_enable\n  ? mask_register[next_issue_thread_id] : {`HW_LANE{1'b1}};\n// 每 lane 的每字节写使能同时受 lane mask 限制。"
          },
          "sources": [
            {
              "path": "source/hardware/src/core/operand_fetch.sv",
              "line": 113,
              "label": "operand_fetch.sv"
            },
            {
              "path": "source/hardware/src/core/operand_fetch.sv",
              "line": 210,
              "label": "operand_fetch.sv"
            }
          ]
        },
        {
          "title": "控制寄存器是系统观察窗口",
          "paragraphs": [
            "control_register 提供 tile/core/thread/global ID、线程启用状态、PC、性能计数与异常相关状态等接口。它们不等同于普通 s0…s63，也不与向量寄存器混用。",
            "软件 builtin 读取这些值，才能按线程分工；host/boot 控制也会影响线程启动。调试单步和断点则由 DSU 相关模块控制发射停止与寄存器访问。DSU 在这里是调试支持，不是向量 shuffle 单元。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/control_register.sv",
              "line": 46,
              "label": "control_register.sv"
            },
            {
              "path": "source/hardware/src/include/npu_defines.sv",
              "line": 396,
              "label": "npu_defines.sv"
            },
            {
              "path": "source/hardware/src/core/dsu/debug_controller.sv",
              "line": 33,
              "label": "debug_controller.sv"
            },
            {
              "path": "source/hardware/src/core/operand_fetch_dsu.sv",
              "line": 48,
              "label": "operand_fetch_dsu.sv"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-memory",
      "title": "一次访存的三种目的地",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "数据缓存、scratchpad 与 I/O 是不同语义的路径。向量宽度、缓存行宽度和网络 payload 宽度虽然互相关联，却不能互换。",
      "sections": [
        {
          "title": "LSU：逐线程排队，再访问缓存数据路径",
          "paragraphs": [
            "load_store_unit 把入口分为三个阶段，接受操作数、有效地址、lane mask 和 store 值。请求按线程缓冲；当某线程队列接近满，会反馈 ldst_almost_full，让该线程的内存指令暂时不再从指令 buffer 发出。",
            "LSU 直接管理 L1 数据访问侧，cache_controller 处理一致性状态及来自网络的动作。未命中后，请求要经过 core_interface 与一致性流程；数据/权限更新与 cc_wakeup 再使等待访存继续。不要把“缓存”当成单一 SRAM 模块。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/load_store_unit.sv",
              "line": 35,
              "label": "load_store_unit.sv"
            },
            {
              "path": "source/hardware/src/core/load_store_unit.sv",
              "line": 50,
              "label": "load_store_unit.sv"
            },
            {
              "path": "source/hardware/src/mc/cache_controller/cache_controller.sv",
              "line": 35,
              "label": "cache_controller.sv"
            }
          ]
        },
        {
          "title": "cache line 是 64 byte，而一个 flit 的 payload 是 8 byte",
          "paragraphs": [
            "CACHE_LINE_WIDTH=V_REGISTER_SIZE，默认 512 bit，即 64 byte。I/D cache 各为 32 sets×4 ways，因此数据容量各 8 KiB；L2 参数为 128 sets×8 ways，按同一行宽计算每对应缓存实例 64 KiB。标签与一致性元数据不在这个数据容量里。",
            "一个 cache line 恰好容纳 16 个 32-bit 元素，但这不意味着所有向量 load 都天然一个周期结束，也不意味着网络用一个 flit 运完。PAYLOAD_W=64，带数据的包还包含消息字段并经 NI 分段；flit 的完整位宽还要加 header。"
          ],
          "table": {
            "headers": [
              "对象",
              "默认大小",
              "含义"
            ],
            "rows": [
              [
                "标量元素",
                "32 bit",
                "单个 lane 的常见数据宽度"
              ],
              [
                "向量/缓存行",
                "512 bit / 64 byte",
                "16×32 bit；两种对象语义不同"
              ],
              [
                "flit payload",
                "64 bit / 8 byte",
                "不包含 header 的链路数据部分"
              ],
              [
                "L1 I / D",
                "各8 KiB",
                "数据阵列容量，非总硬件面积"
              ]
            ]
          },
          "sources": [
            {
              "path": "source/hardware/src/include/npu_defines.sv",
              "line": 47,
              "label": "npu_defines.sv"
            },
            {
              "path": "source/hardware/src/include/npu_user_defines.sv",
              "line": 69,
              "label": "npu_user_defines.sv"
            },
            {
              "path": "source/hardware/src/include/npu_network_defines.sv",
              "line": 42,
              "label": "npu_network_defines.sv"
            }
          ]
        },
        {
          "title": "Scratchpad：显式地址与 bank 冲突",
          "paragraphs": [
            "memory bank 是一块可以单独寻址和控制的存储子阵列。把大存储拆为多个 bank，主要是用多块端口较少的 RAM 提供并行带宽；请求分散到不同 bank 时可以并行，集中到同一 bank 时受该 bank 的端口能力限制。bank 数量与每个 bank 的端口数量是两个维度，不能互相代替。",
            "scratchpad 是软件显式使用的局部存储路径，不以普通缓存 miss/refill 方式工作。当前配置 16 banks，每 bank 1024 entries，每 entry 4 byte，按参数算共 64 KiB。NPU_SPM 默认启用。",
            "address_decode_unit 取 byte offset 之上的 bank bits；请求发行、冲突检测、bank steering、输入/输出互联共同处理多个 lane 的地址。若 lane 访问映射到同一 bank，可能需要串行服务；因此向量宽 16 不自动保证 16 次任意地址访问同时完成。",
            "banked_memory 用 for generate 实例化16个 memory_bank，每个实例有独立的 enable、bank内地址、数据和字节写使能。另一类通用模块 memory_bank_1r1w 的名字表示一个读端口、一个写端口；系统有几个 bank，要看上层实例化数量，不能从 1r1w 推断。下表以从地址0开始的32-bit word为例，bank=word编号%16；同一地址的读取还可能走广播优化，不能与同bank不同地址冲突混为一谈。"
          ],
          "table": {
            "headers": ["lane i 的访问", "bank 分布", "理解重点"],
            "rows": [
              ["第 i 个32-bit word", "bank 0到15", "地址分散，具备并行bank访问条件"],
              ["第 16×i 个32-bit word", "全部为bank 0，行号不同", "同bank不同地址竞争，需要分批服务"],
              ["同一个32-bit word", "同一bank、同一地址", "可考虑一次读取后广播；须检查实际广播条件"]
            ]
          },
          "code": {
            "language": "text",
            "text": "默认地址拆分：\nbyte offset = address[1:0]\nbank index  = address[5:2]       // 16 banks\nbank offset = address[15:6]     // 1024 entries\n数据容量    = 16 × 1024 × 4 = 65536 byte"
          },
          "note": {
            "type": "inference",
            "text": "容量与位段由当前宏和 address_decode_unit 的切片计算而来；不是综合报告，也不包含控制逻辑面积。"
          },
          "sources": [
            {
              "path": "source/hardware/src/include/npu_spm_defines.sv",
              "line": 34,
              "label": "npu_spm_defines.sv"
            },
            {
              "path": "source/hardware/src/core/scratchpad_memory/address_decode_unit.sv",
              "line": 39,
              "label": "address_decode_unit.sv"
            },
            {
              "path": "source/hardware/src/core/scratchpad_memory/requests_issue_unit.sv",
              "line": 34,
              "label": "requests_issue_unit.sv"
            },
            {
              "path": "source/hardware/src/core/scratchpad_memory/banked_memory.sv",
              "line": 43,
              "label": "16个bank的实际例化"
            },
            {
              "path": "source/hardware/src/common/memory_bank_1r1w.sv",
              "line": 35,
              "label": "单bank端口与RAM阵列"
            }
          ]
        },
        {
          "title": "I/O 与不一致性区域：要读地址语义",
          "paragraphs": [
            "默认 I/O map 从 0xFF00_0000 开始，大小由 IO_MAP_SIZE 定义。LSU 识别 I/O 请求后走专用接口，不把设备访问当成普通可缓存数据；控制寄存器还提供不一致性映射配置。",
            "数据一致性解决 NPU 缓存之间的可见性，不自动等价于任意 host 读回都已拿到最新值。官方编程模型要求输出数据使用 flush；flush 对缓存行操作，软件仍需按结果覆盖范围处理。barrier 的参与者同步与输出写回到 host 能读取的层次也应分别核对。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/include/npu_user_defines.sv",
              "line": 80,
              "label": "npu_user_defines.sv"
            },
            {
              "path": "source/hardware/src/core/load_store_unit.sv",
              "line": 44,
              "label": "load_store_unit.sv"
            },
            {
              "path": "source/hardware/src/core/operand_fetch.sv",
              "line": 76,
              "label": "operand_fetch.sv"
            }
          ],
          "note": {
            "type": "limit",
            "text": "本页说明访问路径与接口边界，没有为该历史系统宣称某种现代标准内存模型，也没有替代实际并发与I/O测试。"
          }
        }
      ]
    },
    {
      "id": "hw-coherence",
      "title": "缓存一致性是一组分布式事务",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "不要只背 I/S/M 三个字母。必须同时理解 home、owner、sharer、瞬态记录、网络消息和等待的处理器线程。",
      "sections": [
        {
          "title": "本地缓存控制与 home directory 分工",
          "paragraphs": [
            "cache_controller 维护 L1 的一致性信息；LSU 持有 L1 数据访问侧。directory_controller 管理 L2 与内存行的拥有权，保存 owner 与 sharer 信息。二者面对同一物理地址，却承担不同角色。",
            "cache_controller_stage4 取地址最高 $clog2(TILE_COUNT) 位形成 home directory ID；默认 16 tile 时对应最高 4 位。地址低位相邻并不代表 home 轮流散到所有 tile，因此程序的地址布局会影响目录分布。源码明确注明这段 home 计算仅适用于方形 NoC。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/mc/cache_controller/cache_controller.sv",
              "line": 35,
              "label": "cache_controller.sv"
            },
            {
              "path": "source/hardware/src/mc/directory_controller/directory_controller.sv",
              "line": 33,
              "label": "directory_controller.sv"
            },
            {
              "path": "source/hardware/src/mc/cache_controller/cache_controller_stage4.sv",
              "line": 91,
              "label": "cache_controller_stage4.sv"
            }
          ]
        },
        {
          "title": "协议 ROM：从“状态×事件”到一组动作",
          "paragraphs": [
            "cc_protocol_rom 的输入是当前一致性状态、请求事件等，输出不是单一新状态，而是一包控制动作：是否分配/释放 MSHR、写缓存数据/状态、发送请求/响应/forward、数据来自 cache/MSHR/request 等。目录端有自己的 directory_protocol_rom。",
            "这些 ROM 是可综合的组合控制逻辑，并不意味着运行时可以装载任意协议。若要改协议，必须让状态编码、事件分类、事务记录、消息生成与阻塞规则保持一致。只在一个 case 加分支通常不够。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/include/npu_coherence_defines.sv",
              "line": 275,
              "label": "npu_coherence_defines.sv"
            },
            {
              "path": "source/hardware/src/mc/cache_controller/cc_protocol_rom.sv",
              "line": 119,
              "label": "cc_protocol_rom.sv"
            },
            {
              "path": "source/hardware/src/mc/directory_controller/directory_protocol_rom.sv",
              "line": 42,
              "label": "directory_protocol_rom.sv"
            }
          ]
        },
        {
          "title": "稳定态与瞬态：为什么收到 DATA 还可能不能完成",
          "paragraphs": [
            "目录 ROM 注释说明协议基于 MSI，并因目录包含关系扩展状态。L1 状态枚举还包含 ISd、IMad、IMa、IMd、SMad 等事务进行中的状态，以及不一致性路径相关状态，远多于 I/S/M。",
            "例如读 miss 发 GetS，写 miss 或共享到修改权限转换发 GetM。DATA、INV_ACK 和 owner 转发可能以不同相对顺序到达。MSHR 中 ack_count、inv_ack_received、ack_count_received 等字段，使实现能够等待所需条件，而不是“见到数据就一定写回完成”。"
          ],
          "table": {
            "headers": [
              "角色/信息",
              "解释"
            ],
            "rows": [
              [
                "Home",
                "对该地址负责的目录节点"
              ],
              [
                "Owner",
                "持有修改后有效数据的节点角色"
              ],
              [
                "Sharers",
                "目录记录的共享持有者集合"
              ],
              [
                "MSHR / TSHR",
                "跟踪未完成 miss 或目录事务，承接瞬态"
              ],
              [
                "GETS / GETM",
                "请求共享读权限 / 修改权限"
              ],
              [
                "FWD / INV / ACK",
                "转发、失效与完成确认所需的消息"
              ]
            ]
          },
          "sources": [
            {
              "path": "source/hardware/src/include/npu_coherence_defines.sv",
              "line": 190,
              "label": "npu_coherence_defines.sv"
            },
            {
              "path": "source/hardware/src/include/npu_coherence_defines.sv",
              "line": 236,
              "label": "npu_coherence_defines.sv"
            },
            {
              "path": "source/hardware/src/mc/directory_controller/directory_protocol_rom.sv",
              "line": 33,
              "label": "directory_protocol_rom.sv"
            }
          ]
        },
        {
          "title": "四级 CC、三级目录：看仲裁与回压，而非只看 ROM",
          "paragraphs": [
            "CC 的 stage1 选本地/网络待处理请求，stage2 查一致性缓存与 MSHR，stage3 按协议决定动作，stage4 组装网络消息。还有 response recycle buffer 处理部分替换/事务冲突，stall ROM 表达何时必须等待。",
            "目录控制器则有自己的三级处理与 L2 TSHR。理解 hang 时，问题经常不在某条消息内容，而在某个队列满、TSHR/MSHR 占用、被等待的 ACK 或资源依赖。应把“这个请求为何还没完成”写成一张等待关系表。"
          ],
          "bullets": [
            "先选一个地址，记录本地 L1 状态、home 目录状态和在途消息。",
            "再记录哪个 MSHR/TSHR entry 拥有这笔事务，以及它等待的事件。",
            "最后看每个 valid 是否被对端 available/consumed 接受；不能把发出 valid 等同于完成。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/mc/cache_controller/cache_controller.sv",
              "line": 39,
              "label": "cache_controller.sv"
            },
            {
              "path": "source/hardware/src/mc/cache_controller/cache_controller.sv",
              "line": 229,
              "label": "cache_controller.sv"
            },
            {
              "path": "source/hardware/src/mc/cache_controller/stall_protocol_rom.sv",
              "line": 33,
              "label": "stall_protocol_rom.sv"
            },
            {
              "path": "source/hardware/src/mc/directory_controller/l2_tshr.sv",
              "line": 46,
              "label": "l2_tshr.sv"
            }
          ]
        },
        {
          "title": "教学场景：A 读、B 读、A 写",
          "paragraphs": [
            "从 A 对某行没有副本开始，A 通过 GetS 获得共享可读副本；B 读取时，home 根据当前目录状态提供或协调数据。若 A 随后写入，需要修改权限，并使其他共享者失效；B 对该行的副本不能继续被当成有效共享数据。",
            "这是为了建立“请求权限—目录协调—数据与确认—唤醒”的概念链，真实路径会因初始状态、owner、L2 命中、替换、网络回压及事务竞争改变。交互演示不声称列出所有 RTL 分支，也不根据步骤数输出延迟。"
          ],
          "note": {
            "type": "limit",
            "text": "一致性交互是事件级教学模型，不能用于验证硬件、证明协议完整性或测量性能。"
          },
          "sources": [
            {
              "path": "source/hardware/src/mc/cache_controller/cc_protocol_rom.sv",
              "line": 186,
              "label": "cc_protocol_rom.sv"
            },
            {
              "path": "source/hardware/src/mc/directory_controller/directory_protocol_rom.sv",
              "line": 244,
              "label": "directory_protocol_rom.sv"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-network",
      "title": "消息怎样穿过 Mesh NoC",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "从 packet 到 flit，从虚拟网络到物理端口，从源端选路到中间路由器前瞻计算，逐层确认谁保留了哪些信息。",
      "sections": [
        {
          "title": "NI 负责语义，router 负责转发",
          "paragraphs": [
            "network_interface_core 面向 cache/directory/service 消息：把包含地址、类型、源/目标和可能的数据的 packet 排队并拆成 flit，接收端再重组。router 不解释 GetM 或 barrier 的算法语义，只按 header、端口、VC 和回压转发。",
            "control_unit_packet_to_flit 还把多目标发送实现为多次 unicast：从 destination mask 选目标，完成一个包后去掉该位，再服务其他目标。因此目录向多个 sharer 发送失效，不应画成物理链路一次神奇广播。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/mc/network_interface/network_interface_core.sv",
              "line": 65,
              "label": "network_interface_core.sv"
            },
            {
              "path": "source/hardware/src/mc/network_interface/control_unit_packet_to_flit.sv",
              "line": 33,
              "label": "control_unit_packet_to_flit.sv"
            }
          ]
        },
        {
          "title": "五个端口、四个 VC、64-bit payload",
          "paragraphs": [
            "每个 router 有 LOCAL、EAST、NORTH、WEST、SOUTH 五个端口，每端口默认四个虚拟通道。定义中 VC0 为 request、VC1 为 response inject、VC2 为 forward、VC3 为 service。每 VC 队列默认深度 16。",
            "VC 是共享物理端口上的独立队列/流量类别，不等于四根独立物理数据链路。PAYLOAD_W=64，flit_t 同时还带 flit_header_t。Header/BODY/TAIL/HT 区分包中位置，HT 表示可由单一 flit 表示的包形态。"
          ],
          "table": {
            "headers": [
              "配置",
              "默认值",
              "不能误读成"
            ],
            "rows": [
              [
                "PORT_NUM",
                "5",
                "五个计算核"
              ],
              [
                "VC_PER_PORT",
                "4",
                "每方向四条独立64-bit物理链路"
              ],
              [
                "QUEUE_LEN_PER_VC",
                "16",
                "每包固定16 flit"
              ],
              [
                "PAYLOAD_W",
                "64 bit",
                "含header的完整flit宽度"
              ],
              [
                "VC3",
                "service",
                "只允许用户软件数据"
              ]
            ]
          },
          "sources": [
            {
              "path": "source/hardware/src/include/npu_network_defines.sv",
              "line": 39,
              "label": "npu_network_defines.sv"
            },
            {
              "path": "source/hardware/src/include/npu_network_defines.sv",
              "line": 71,
              "label": "npu_network_defines.sv"
            },
            {
              "path": "source/hardware/src/include/npu_network_defines.sv",
              "line": 93,
              "label": "npu_network_defines.sv"
            }
          ]
        },
        {
          "title": "XY：先横向，再纵向，最后 LOCAL",
          "paragraphs": [
            "routing_xy 比较目标与当前 x/y。若 x 仍不同，向 EAST/WEST；只有 x 相同才按 y 选择 SOUTH/NORTH；x、y 都相同时使用 LOCAL。row 与 y 对应，因此图中向下走是 SOUTH。",
            "没有障碍和绕路时，路径跳数是 |Δx|+|Δy|，这是该拓扑和选路规则下的路由距离。它不是通信时延：实际还受注入、排队、仲裁、包长度和回压影响。网页路径实验只展示这种确定性路线。"
          ],
          "code": {
            "language": "text",
            "text": "if target.x > current.x: EAST\nelse if target.x < current.x: WEST\nelse if target.y > current.y: SOUTH\nelse if target.y < current.y: NORTH\nelse: LOCAL"
          },
          "sources": [
            {
              "path": "source/hardware/src/mc/network_interface/routing_xy.sv",
              "line": 35,
              "label": "routing_xy.sv"
            },
            {
              "path": "source/hardware/src/mc/network_interface/routing_xy.sv",
              "line": 51,
              "label": "routing_xy.sv"
            }
          ]
        },
        {
          "title": "Look-ahead 与 wormhole：header 带路，队列与仲裁保留关系",
          "paragraphs": [
            "router 第一层由 input_port 按 VC 缓冲。后续层做仲裁、crossbar 选择和 look-ahead routing；header/HT 的 next_hop_port 会被更新，仿佛提前站在下一台 router 上算下一步，减少后续路由决策路径。",
            "input_port 的目标端口队列在 HEADER/HT 入队，在 TAIL/HT 获得 grant 时出队。配合 grant-hold 仲裁，包内后续 flit 延续该路由关系，构成 wormhole 风格传输。若前方接收能力不足，on_off/credit 相关信号必须阻止继续推进。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/mc/router/router.sv",
              "line": 34,
              "label": "router.sv"
            },
            {
              "path": "source/hardware/src/mc/router/router.sv",
              "line": 69,
              "label": "router.sv"
            },
            {
              "path": "source/hardware/src/mc/router/input_port.sv",
              "line": 93,
              "label": "input_port.sv"
            },
            {
              "path": "source/hardware/src/mc/router/grant_hold_round_robin_arbiter.sv",
              "line": 55,
              "label": "grant_hold_round_robin_arbiter.sv"
            }
          ]
        },
        {
          "title": "边界与可扩展性：网络参数不是自由缩放按钮",
          "paragraphs": [
            "npu_noc 将相邻 tile 东西/南北端口逐一连接，边界端口不注入有效 flit。系统同时给特殊 tile 分配固定相对 ID，地址到 home 的规则又依赖 tile 数及坐标编码。改变网格尺寸时要一起检查这些关系。",
            "正确的扩容实验至少需要检查：编译期位宽、NPU/HT/host/memory 分配是否重叠、目标 ID 是否有效、home 编码、barrier 目标及软件分工。网页计算的节点数和最短 XY 距离能解释结构，不代表任意配置已被作者验证。"
          ],
          "note": {
            "type": "limit",
            "text": "当前 home 计算代码明确标注仅适用于 square NoC。教学配置应优先保留方形；矩形变体需要额外 RTL 设计与验证。"
          },
          "sources": [
            {
              "path": "source/hardware/src/mc/system/npu_noc.sv",
              "line": 250,
              "label": "npu_noc.sv"
            },
            {
              "path": "source/hardware/src/mc/system/npu_noc.sv",
              "line": 272,
              "label": "npu_noc.sv"
            },
            {
              "path": "source/hardware/src/mc/cache_controller/cache_controller_stage4.sv",
              "line": 91,
              "label": "cache_controller_stage4.sv"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-sync",
      "title": "同步、启动与调试也是架构的一部分",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "barrier 不只是一个软件循环。硬件服务通路把“线程到达”“收集计数”“释放参与者”分开，并与未完成访存和写回相关联。",
      "sections": [
        {
          "title": "Barrier 的两个层次：本地到达与同步 master",
          "paragraphs": [
            "barrier_core 观察 PIPE_SYNC/BARRIER_CORE 指令，提取 barrier ID 和计数设置，先让对应线程进入等待。只有该线程没有 pending load/store、scoreboard 清空且网络可用，才允许发送 ACCOUNT。",
            "synchronization_core 接收 ACCOUNT，维护 barrier 记录并决定 RELEASE 的目的 tile mask。release 通过 NI 服务网络返回；本地 barrier_core 匹配对应 barrier，更新 bc_release_val，让调度器重新允许相关线程发射。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/mc/synchronization/barrier_core.sv",
              "line": 38,
              "label": "barrier_core.sv"
            },
            {
              "path": "source/hardware/src/mc/synchronization/barrier_core.sv",
              "line": 106,
              "label": "barrier_core.sv"
            },
            {
              "path": "source/hardware/src/mc/synchronization/synchronization_core.sv",
              "line": 33,
              "label": "synchronization_core.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 156,
              "label": "instruction_scheduler.sv"
            }
          ]
        },
        {
          "title": "集中与分布式模式，不能只看一个类名",
          "paragraphs": [
            "npu_user_defines 默认定义 DIRECTORY_BARRIER，注释表示支持分布式同步目录；若不定义，则使用 CENTRAL_SYNCH_ID 指定单一 synchronization master。barrier_core 通过 MANYCORE、DIS_SYNCMASTER 参数决定目标来源。",
            "分布式并不意味着每个线程任意挑 master。barrier ID 编码、目标提取、每 tile 可管理 barrier 数和软件传入计数都要配套。改变 barrier 数或线程数时，应同时查 npu_synchronization_defines、barrier_core 和软件 builtin 的约定。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/include/npu_user_defines.sv",
              "line": 76,
              "label": "npu_user_defines.sv"
            },
            {
              "path": "source/hardware/src/mc/synchronization/barrier_core.sv",
              "line": 50,
              "label": "barrier_core.sv"
            },
            {
              "path": "source/hardware/src/mc/synchronization/barrier_core.sv",
              "line": 120,
              "label": "barrier_core.sv"
            }
          ]
        },
        {
          "title": "为什么 barrier 前要等待访存和 scoreboard",
          "paragraphs": [
            "如果先宣布到达，再让之前的写操作仍在本地管线或队列中排队，其他参与者被释放后可能观察不到预期结果。当前 can_account 将 no_load_store_pending 与 ~scoreboard_empty 纳入条件，体现“先排空相关在途工作，再登记到达”的控制意图。",
            "但不能仅凭这两根信号推出某个完整语言内存模型。对 host 可见性、缓存 flush 与不同地址空间的约束，还要读 LSU、缓存控制与编程模型，并用真实程序验证。同步范围和缓存可见性是互相联系但不同的问题。"
          ],
          "note": {
            "type": "inference",
            "text": "“避免在途工作越过到达登记”是根据 can_account 门控给出的设计解释；不据此宣称实现了某种未被源码明确规定的标准 fence 语义。"
          },
          "sources": [
            {
              "path": "source/hardware/src/mc/synchronization/barrier_core.sv",
              "line": 107,
              "label": "barrier_core.sv"
            },
            {
              "path": "source/hardware/src/core/load_store_unit.sv",
              "line": 79,
              "label": "load_store_unit.sv"
            }
          ]
        },
        {
          "title": "启动、性能观察与 DSU",
          "paragraphs": [
            "host_interface、boot_manager 及 item 服务流把外部作业信息送到核心，Thread Controller 的 job 接口初始化线程 PC。是否启用某个线程和该线程起始地址不是普通 ALU 数据路径自己决定的。",
            "debug_controller、breakpoint/watchpoint handler、debugger_request_manager 和 operand_fetch_dsu 提供停止、单步与上下文观察相关通路。调试信息能帮助定位“未取指、不能发射、等访存、等barrier”的不同原因；性能计数器同样要核对具体计数条件，不能只看名称。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/thread_controller.sv",
              "line": 87,
              "label": "thread_controller.sv"
            },
            {
              "path": "source/hardware/src/core/dsu/debug_controller.sv",
              "line": 33,
              "label": "debug_controller.sv"
            },
            {
              "path": "source/hardware/src/core/dsu/debugger_request_manager.sv",
              "line": 39,
              "label": "debugger_request_manager.sv"
            },
            {
              "path": "source/hardware/src/mc/synchronization/performance_counter.sv",
              "line": 35,
              "label": "performance_counter.sv"
            }
          ]
        }
      ]
    },
    {
      "id": "hw-deploy",
      "title": "从可读源码走到可验证系统",
      "eyebrow": "HARDWARE / RTL 深读",
      "summary": "源码解释建立的是可追溯的理解；仿真、综合和上板则需要匹配版本、工具环境与逐层验证。用最小闭环逐步扩大范围。",
      "sections": [
        {
          "title": "单核系统与多核系统是两个阅读入口",
          "paragraphs": [
            "src/sc/system/npu_system.sv 封装单核及其外围路径；src/mc/system/npu_noc.sv 组织多 tile 网格。读者可以先在单核中理解取指、数据访问和 item 接口，再切换到多核中追踪一致性与网络消息。",
            "不能把单核系统的所有接口时序直接等同于多核目录路径。它们共享核心，却在存储/外设组织上有不同封装。测试时先确认脚本是否选择 single-core，再对照实际实例化层次设置波形。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/sc/system/npu_system.sv",
              "line": 41,
              "label": "npu_system.sv"
            },
            {
              "path": "source/hardware/src/mc/system/npu_noc.sv",
              "line": 56,
              "label": "npu_noc.sv"
            }
          ]
        },
        {
          "title": "Nexys4DDR：UART 命令、AXI/MIG 与时钟复位",
          "paragraphs": [
            "nexys4ddr_top 将 UART 字节重新组织为 32-bit 命令字，uart_router 区分目标接口；npu_system 在中间执行，memory_controller 将 NPU 的 512-bit block 请求桥接到 AXI，再连接 Xilinx MIG DDR 控制器。",
            "该顶层还包含时钟产生和 MIG 的 UI 时钟/复位关系。可读 RTL 不等于板级工程已经具备所有供应商生成产物；复现必须核对 IP、约束、板卡与历史 Vivado 版本。当前讲解不声称已经完成上板。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/deploy/nexys4ddr/nexys4ddr_top.sv",
              "line": 115,
              "label": "nexys4ddr_top.sv"
            },
            {
              "path": "source/hardware/src/deploy/nexys4ddr/nexys4ddr_top.sv",
              "line": 164,
              "label": "nexys4ddr_top.sv"
            },
            {
              "path": "source/hardware/src/deploy/nexys4ddr/nexys4ddr_top.sv",
              "line": 230,
              "label": "nexys4ddr_top.sv"
            },
            {
              "path": "source/hardware/src/deploy/nexys4ddr/nexys4ddr_top.sv",
              "line": 297,
              "label": "nexys4ddr_top.sv"
            }
          ]
        },
        {
          "title": "testbench 不是一个空壳",
          "paragraphs": [
            "tb_npu 具有 KERNEL_IMAGE、THREAD_MASK、CORE_MASK 等参数，并连接存储器与 item 接口。默认 PC_DEFAULT=0x400；测试结束逻辑观察特定地址的写入与活跃线程数量。因此生成镜像、启动 PC、运行库和结束协议必须一致。",
            "tools/test.sh 进一步调用目标编译、仿真与主机参考程序，再用 memcheck.py 比较。它提供功能闭环，但通过示例不能证明整个 ISA、所有一致性竞争、全部参数组合均正确。新增特性应设计能触发该机制的定向测试。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/tb/tb_npu.sv",
              "line": 36,
              "label": "tb_npu.sv"
            },
            {
              "path": "source/hardware/src/tb/tb_npu.sv",
              "line": 53,
              "label": "tb_npu.sv"
            },
            {
              "path": "source/hardware/src/tb/tb_npu.sv",
              "line": 86,
              "label": "tb_npu.sv"
            },
            {
              "path": "source/hardware/tools/test.sh",
              "line": 168,
              "label": "test.sh"
            }
          ]
        },
        {
          "title": "复现前先对版本，而不是先改代码",
          "paragraphs": [
            "硬件 master 是 2019-07-20 的 02a73a6d…，其中 toolchain gitlink 固定在 d2ebbc3…；当前展开的软件 master 则是 2020-01-17 的 0dc20431…。运行库、链接脚本及 elf2hex 有后续变化，搭错版本会让症状看起来像硬件故障。",
            "硬件 next 分支 244d81a8… 修改了浮点模块与 ModelSim 脚本，新增 vector_test；默认展开内容仍是 master。先从保留的 bundle 恢复历史配对，再根据单核/多核和工具选择跑最小示例。网页中的源码导航始终以该快照为依据。"
          ],
          "note": {
            "type": "limit",
            "text": "本次网站工作不执行历史构建/仿真，也不自动修改上游 RTL；展示内容、参数计算和事件演示用于理解与导航。"
          },
          "sources": [
            {
              "path": "source/hardware/.gitmodules",
              "line": 1,
              "label": ".gitmodules"
            },
            {
              "path": "source/hardware/README",
              "line": 1,
              "label": "README"
            }
          ]
        },
        {
          "title": "形成自己的问题驱动阅读清单",
          "paragraphs": [
            "选一个最小 kernel，写出它的入口 PC、线程分工、第一条向量运算、一次 load miss、一次 barrier 和结果 flush。每个事件至少找到一个产生 valid 的模块、一个接受它的模块和一个完成条件。",
            "然后故意构造一个你能预测的变化：让连续 lane 访问连续 scratchpad word 与同一 bank；让两个线程出现同一寄存器依赖；让两个 core 读同一行再写。这些问题能把目录知识变成可检验的理解，而不是仅记住文件名。"
          ],
          "bullets": [
            "能解释 tc_if_thread_en 与 can_issue 的差别。",
            "能解释一个 cache miss 需要的状态与消息，而不只是说“去内存拿数据”。",
            "能按地址手算 scratchpad bank、home directory 和 XY 路径。",
            "能指出哪一条说法来自 RTL、哪一条是推断、哪一条必须仿真验证。"
          ],
          "sources": [
            {
              "path": "source/hardware/src/core/thread_controller.sv",
              "line": 124,
              "label": "thread_controller.sv"
            },
            {
              "path": "source/hardware/src/core/instruction_scheduler.sv",
              "line": 155,
              "label": "instruction_scheduler.sv"
            },
            {
              "path": "source/hardware/src/mc/cache_controller/cache_controller_stage4.sv",
              "line": 98,
              "label": "cache_controller_stage4.sv"
            }
          ]
        }
      ]
    }
  ],
  "modules": [
    {
      "id": "system",
      "name": "npu_noc",
      "group": "system",
      "file": "source/hardware/src/mc/system/npu_noc.sv",
      "line": 56,
      "summary": "生成 Mesh 及不同类型 tile，并连接边界、外部存储和 host item 接口。",
      "inputs": [
        "item_data_i",
        "mc_*"
      ],
      "outputs": [
        "tile_flit_out",
        "mc_request"
      ],
      "concepts": [
        "tile",
        "mesh",
        "host"
      ],
      "related": [
        "tile",
        "router",
        "directory"
      ]
    },
    {
      "id": "tile",
      "name": "tile_npu",
      "group": "system",
      "file": "source/hardware/src/mc/tile/tile_npu.sv",
      "line": 46,
      "summary": "NPU 计算 tile 的聚合层：核心、目录、NI、router 及服务。",
      "inputs": [
        "tile_flit_in",
        "tile_on_off_in"
      ],
      "outputs": [
        "tile_flit_out",
        "tile_on_off_out"
      ],
      "concepts": [
        "层级实例化",
        "服务通路"
      ],
      "related": [
        "core",
        "network-interface",
        "directory",
        "router"
      ]
    },
    {
      "id": "core",
      "name": "npu_core",
      "group": "core",
      "file": "source/hardware/src/core/npu_core.sv",
      "line": 37,
      "summary": "将取指、线程控制、执行与恢复通路连接成处理器核。",
      "inputs": [
        "thread_en",
        "hi_job_*",
        "cache update"
      ],
      "outputs": [
        "访存请求",
        "执行状态"
      ],
      "concepts": [
        "硬件线程",
        "SIMD"
      ],
      "related": [
        "fetch",
        "scheduler",
        "lsu",
        "writeback"
      ]
    },
    {
      "id": "thread-control",
      "name": "thread_controller",
      "group": "core",
      "file": "source/hardware/src/core/thread_controller.sv",
      "line": 50,
      "summary": "处理线程取指资格、指令 miss 等待/唤醒和 job PC。",
      "inputs": [
        "if_cache_miss",
        "thread_en",
        "ib_fifo_full"
      ],
      "outputs": [
        "tc_if_thread_en",
        "tc_job_pc"
      ],
      "concepts": [
        "可取指",
        "miss合并"
      ],
      "related": [
        "fetch",
        "instruction-buffer"
      ]
    },
    {
      "id": "fetch",
      "name": "instruction_fetch_stage",
      "group": "core",
      "file": "source/hardware/src/core/instruction_fetch_stage.sv",
      "line": 51,
      "summary": "轮询可运行线程并访问其独立 PC 与 I-cache。",
      "inputs": [
        "tc_thread_en",
        "rollback_valid"
      ],
      "outputs": [
        "if_valid",
        "if_inst_scheduled"
      ],
      "concepts": [
        "PC",
        "I-cache",
        "round robin"
      ],
      "related": [
        "decode",
        "thread-control"
      ]
    },
    {
      "id": "decode",
      "name": "decode",
      "group": "core",
      "file": "source/hardware/src/core/decode.sv",
      "line": 42,
      "summary": "把32-bit指令转成结构化控制、寄存器、立即数与管线选择。",
      "inputs": [
        "if_inst_scheduled",
        "if_pc"
      ],
      "outputs": [
        "dec_instr",
        "dec_valid"
      ],
      "concepts": [
        "ISA编码",
        "控制信号"
      ],
      "related": [
        "instruction-buffer",
        "operand-fetch"
      ]
    },
    {
      "id": "instruction-buffer",
      "name": "instruction_buffer",
      "group": "core",
      "file": "source/hardware/src/core/instruction_buffer.sv",
      "line": 47,
      "summary": "每线程 FIFO，将译码供给与依赖受限发射解耦。",
      "inputs": [
        "dec_instr",
        "rb_valid",
        "is_thread_scheduled_mask"
      ],
      "outputs": [
        "ib_instructions",
        "ib_fifo_full"
      ],
      "concepts": [
        "FIFO",
        "回压",
        "flush"
      ],
      "related": [
        "scheduler",
        "rollback"
      ]
    },
    {
      "id": "scheduler",
      "name": "instruction_scheduler",
      "group": "core",
      "file": "source/hardware/src/core/instruction_scheduler.sv",
      "line": 45,
      "summary": "每线程 scoreboard 检测 RAW/WAW 和结构冲突，再轮询选一个可发射线程。",
      "inputs": [
        "ib_instructions",
        "wb_result",
        "rb_valid"
      ],
      "outputs": [
        "is_instruction",
        "is_thread_scheduled_mask"
      ],
      "concepts": [
        "scoreboard",
        "RAW",
        "WAW"
      ],
      "related": [
        "operand-fetch",
        "writeback",
        "rollback"
      ]
    },
    {
      "id": "operand-fetch",
      "name": "operand_fetch",
      "group": "core",
      "file": "source/hardware/src/core/operand_fetch.sv",
      "line": 49,
      "summary": "读取线程私有 SRF/VRF、组成操作数、应用 lane mask。",
      "inputs": [
        "issue_inst_scheduled",
        "wb_result"
      ],
      "outputs": [
        "opf_fetched_op0",
        "opf_hw_lane_mask"
      ],
      "concepts": [
        "寄存器文件",
        "mask",
        "广播"
      ],
      "related": [
        "integer",
        "floating",
        "lsu",
        "scratchpad"
      ]
    },
    {
      "id": "integer",
      "name": "int_pipe",
      "group": "core",
      "file": "source/hardware/src/core/int_pipe.sv",
      "line": 42,
      "summary": "整数执行管线及 lane 运算连接。",
      "inputs": [
        "opf_*",
        "cr_result",
        "opf_hw_lane_mask"
      ],
      "outputs": [
        "int_result",
        "int_valid"
      ],
      "concepts": [
        "SIMD lane",
        "整数运算"
      ],
      "related": [
        "writeback",
        "branch"
      ]
    },
    {
      "id": "floating",
      "name": "fp_pipe",
      "group": "core",
      "file": "source/hardware/src/core/fp_pipe.sv",
      "line": 40,
      "summary": "浮点执行子单元的选路与完成结果汇合，受调度端冲突约束。",
      "inputs": [
        "opf_*"
      ],
      "outputs": [
        "fp_result",
        "fp_valid"
      ],
      "concepts": [
        "浮点延迟",
        "结构冲突"
      ],
      "related": [
        "scheduler",
        "writeback"
      ]
    },
    {
      "id": "branch",
      "name": "branch_control",
      "group": "core",
      "file": "source/hardware/src/core/branch_control.sv",
      "line": 52,
      "summary": "控制流与异常相关判断，产生重定向/rollback。",
      "inputs": [
        "执行元数据",
        "操作数"
      ],
      "outputs": [
        "bc_rollback_pc",
        "bc_rollback_enable"
      ],
      "concepts": [
        "分支",
        "trap",
        "PC"
      ],
      "related": [
        "rollback",
        "fetch"
      ]
    },
    {
      "id": "rollback",
      "name": "rollback_handler",
      "group": "core",
      "file": "source/hardware/src/core/rollback_handler.sv",
      "line": 42,
      "summary": "按线程生成恢复 PC、有效掩码及 scoreboard 清理信息。",
      "inputs": [
        "bc_rollback_*",
        "ldst_rollback_*",
        "spm_rollback_*"
      ],
      "outputs": [
        "rollback_valid",
        "rollback_clear_bitmap"
      ],
      "concepts": [
        "恢复",
        "取消",
        "in-flight"
      ],
      "related": [
        "fetch",
        "instruction-buffer",
        "scheduler"
      ]
    },
    {
      "id": "writeback",
      "name": "writeback",
      "group": "core",
      "file": "source/hardware/src/core/writeback.sv",
      "line": 42,
      "summary": "缓冲和仲裁不同执行源的完成结果，做 load 扩展后反馈寄存器/scoreboard。",
      "inputs": [
        "int_valid",
        "fp_valid",
        "spm_valid",
        "ldst_valid"
      ],
      "outputs": [
        "wb_valid",
        "wb_result",
        "wb_fifo_full"
      ],
      "concepts": [
        "写回冲突",
        "符号扩展"
      ],
      "related": [
        "operand-fetch",
        "scheduler"
      ]
    },
    {
      "id": "lsu",
      "name": "load_store_unit",
      "group": "memory",
      "file": "source/hardware/src/core/load_store_unit.sv",
      "line": 50,
      "summary": "三级数据访存与按线程缓冲，连接缓存数据和一致性/I/O服务。",
      "inputs": [
        "opf_*",
        "cc_update_ldst_*"
      ],
      "outputs": [
        "ldst_miss",
        "ldst_cache_line",
        "ldst_almost_full"
      ],
      "concepts": [
        "load/store",
        "cache line",
        "thread FIFO"
      ],
      "related": [
        "cache-controller",
        "core-interface",
        "writeback"
      ]
    },
    {
      "id": "scratchpad",
      "name": "scratchpad_memory",
      "group": "memory",
      "file": "source/hardware/src/core/scratchpad_memory/scratchpad_memory.sv",
      "line": 63,
      "summary": "显式管理的16-bank本地存储，串行化无法并行满足的lane请求。",
      "inputs": [
        "addresses",
        "write_data",
        "mask",
        "start"
      ],
      "outputs": [
        "sm_ready",
        "sm_valid",
        "sm_read_data"
      ],
      "concepts": [
        "bank conflict",
        "局部存储"
      ],
      "related": [
        "spm-address",
        "operand-fetch",
        "writeback"
      ]
    },
    {
      "id": "spm-address",
      "name": "address_decode_unit",
      "group": "memory",
      "file": "source/hardware/src/core/scratchpad_memory/address_decode_unit.sv",
      "line": 33,
      "summary": "按宏定义把 scratchpad 地址拆成 bank index 和 bank offset。",
      "inputs": [
        "address"
      ],
      "outputs": [
        "bank_index",
        "bank_offset"
      ],
      "concepts": [
        "地址位段",
        "bank"
      ],
      "related": [
        "scratchpad"
      ]
    },
    {
      "id": "core-interface",
      "name": "core_interface",
      "group": "memory",
      "file": "source/hardware/src/core/core_interface.sv",
      "line": 46,
      "summary": "核心访存与缓存控制侧之间的排队和接口聚合。",
      "inputs": [
        "ldst_*",
        "cache side available"
      ],
      "outputs": [
        "ci_load_request_*",
        "ci_store_request_*"
      ],
      "concepts": [
        "请求队列",
        "回压"
      ],
      "related": [
        "lsu",
        "cache-controller"
      ]
    },
    {
      "id": "cache-controller",
      "name": "cache_controller",
      "group": "memory",
      "file": "source/hardware/src/mc/cache_controller/cache_controller.sv",
      "line": 47,
      "summary": "四级L1一致性控制；数据阵列访问与LSU协作。",
      "inputs": [
        "ci_*",
        "ni_request_*"
      ],
      "outputs": [
        "cc_*",
        "网络请求/响应"
      ],
      "concepts": [
        "MSHR",
        "协议动作"
      ],
      "related": [
        "cc-rom",
        "mshr",
        "directory",
        "network-interface"
      ]
    },
    {
      "id": "cc-rom",
      "name": "cc_protocol_rom",
      "group": "memory",
      "file": "source/hardware/src/mc/cache_controller/cc_protocol_rom.sv",
      "line": 119,
      "summary": "按L1状态与事件给出新状态、数据动作和消息动作。",
      "inputs": [
        "current_state",
        "current_request"
      ],
      "outputs": [
        "pr_output"
      ],
      "concepts": [
        "MSI扩展",
        "状态机"
      ],
      "related": [
        "cache-controller",
        "mshr"
      ]
    },
    {
      "id": "mshr",
      "name": "mshr_cc",
      "group": "memory",
      "file": "source/hardware/src/mc/cache_controller/mshr_cc.sv",
      "line": 52,
      "summary": "记录等待中的本地缓存事务、线程和确认条件。",
      "inputs": [
        "lookup/update/allocation"
      ],
      "outputs": [
        "entry info",
        "可用性"
      ],
      "concepts": [
        "未完成事务",
        "ACK计数"
      ],
      "related": [
        "cache-controller",
        "cc-rom"
      ]
    },
    {
      "id": "directory",
      "name": "directory_controller",
      "group": "memory",
      "file": "source/hardware/src/mc/directory_controller/directory_controller.sv",
      "line": 37,
      "summary": "管理home侧L2数据及owner/sharer状态，协调读写权限。",
      "inputs": [
        "ni_request",
        "ni_response",
        "tc_instr_request"
      ],
      "outputs": [
        "dc_forwarded_request",
        "dc_response"
      ],
      "concepts": [
        "home",
        "owner",
        "sharer",
        "TSHR"
      ],
      "related": [
        "directory-rom",
        "network-interface",
        "system"
      ]
    },
    {
      "id": "directory-rom",
      "name": "directory_protocol_rom",
      "group": "memory",
      "file": "source/hardware/src/mc/directory_controller/directory_protocol_rom.sv",
      "line": 42,
      "summary": "目录状态与消息到具体更新/转发/响应动作的映射。",
      "inputs": [
        "input_state",
        "input_request"
      ],
      "outputs": [
        "dpr_output"
      ],
      "concepts": [
        "目录状态机",
        "包含性"
      ],
      "related": [
        "directory",
        "cc-rom"
      ]
    },
    {
      "id": "network-interface",
      "name": "network_interface_core",
      "group": "network",
      "file": "source/hardware/src/mc/network_interface/network_interface_core.sv",
      "line": 65,
      "summary": "对接一致性/服务packet与router flit端口，区分虚拟网络。",
      "inputs": [
        "coherence/service packets",
        "router_flit_in"
      ],
      "outputs": [
        "router flit",
        "depacketized messages"
      ],
      "concepts": [
        "packet/flit",
        "virtual network"
      ],
      "related": [
        "packetizer",
        "router",
        "directory"
      ]
    },
    {
      "id": "packetizer",
      "name": "control_unit_packet_to_flit",
      "group": "network",
      "file": "source/hardware/src/mc/network_interface/control_unit_packet_to_flit.sv",
      "line": 43,
      "summary": "按64-bit payload分段，使用目的mask将多播实现为多次单播。",
      "inputs": [
        "packet_valid",
        "packet_destinations",
        "flit_credit"
      ],
      "outputs": [
        "cu_flit_valid",
        "cu_flit_out_header"
      ],
      "concepts": [
        "分段",
        "multicast",
        "unicast"
      ],
      "related": [
        "network-interface",
        "routing"
      ]
    },
    {
      "id": "routing",
      "name": "routing_xy",
      "group": "network",
      "file": "source/hardware/src/mc/network_interface/routing_xy.sv",
      "line": 35,
      "summary": "确定性先X后Y选路，相同坐标选择LOCAL。",
      "inputs": [
        "dest_x_node",
        "dest_y_node"
      ],
      "outputs": [
        "next_port"
      ],
      "concepts": [
        "XY-DOR",
        "曼哈顿距离"
      ],
      "related": [
        "router",
        "packetizer"
      ]
    },
    {
      "id": "router",
      "name": "router",
      "group": "network",
      "file": "source/hardware/src/mc/router/router.sv",
      "line": 44,
      "summary": "五端口四VC的Mesh路由器，含input queues、分配与look-ahead。",
      "inputs": [
        "flit_in",
        "wr_en_in",
        "on_off_in"
      ],
      "outputs": [
        "flit_out",
        "wr_en_out",
        "on_off_out"
      ],
      "concepts": [
        "wormhole",
        "look-ahead",
        "crossbar"
      ],
      "related": [
        "routing",
        "network-interface"
      ]
    },
    {
      "id": "barrier",
      "name": "barrier_core",
      "group": "system",
      "file": "source/hardware/src/mc/synchronization/barrier_core.sv",
      "line": 50,
      "summary": "登记本地线程到达，等待在途访存/写回排空，再发送ACCOUNT并等RELEASE。",
      "inputs": [
        "opf_*",
        "no_load_store_pending",
        "n2c_release_*"
      ],
      "outputs": [
        "c2n_account_*",
        "bc_release_val"
      ],
      "concepts": [
        "barrier",
        "ACCOUNT",
        "RELEASE"
      ],
      "related": [
        "sync-master",
        "scheduler",
        "network-interface"
      ]
    },
    {
      "id": "sync-master",
      "name": "synchronization_core",
      "group": "system",
      "file": "source/hardware/src/mc/synchronization/synchronization_core.sv",
      "line": 33,
      "summary": "同步master侧的ACCOUNT排队、barrier状态维护和RELEASE生成。",
      "inputs": [
        "ni_account_mess",
        "ni_available"
      ],
      "outputs": [
        "sc_release_mess",
        "sc_release_dest_valid"
      ],
      "concepts": [
        "同步目录",
        "计数",
        "目标mask"
      ],
      "related": [
        "barrier",
        "network-interface"
      ]
    },
    {
      "id": "debug",
      "name": "debug_controller",
      "group": "debug",
      "file": "source/hardware/src/core/dsu/debug_controller.sv",
      "line": 33,
      "summary": "调试停止、断点命中、单步及核心静止条件的控制状态机。",
      "inputs": [
        "dsu_*",
        "scoreboard_empty",
        "no_load_store_pending"
      ],
      "outputs": [
        "dsu_stop_issue",
        "freeze"
      ],
      "concepts": [
        "DSU",
        "断点",
        "调试"
      ],
      "related": [
        "scheduler",
        "core"
      ]
    },
    {
      "id": "single-core",
      "name": "npu_system",
      "group": "system",
      "file": "source/hardware/src/sc/system/npu_system.sv",
      "line": 41,
      "summary": "单核版本的计算核、存储与item服务封装。",
      "inputs": [
        "memory/item接口"
      ],
      "outputs": [
        "memory/item请求"
      ],
      "concepts": [
        "单核系统",
        "外设"
      ],
      "related": [
        "core",
        "fpga"
      ]
    },
    {
      "id": "fpga",
      "name": "nexys4ddr_top",
      "group": "system",
      "file": "source/hardware/src/deploy/nexys4ddr/nexys4ddr_top.sv",
      "line": 29,
      "summary": "Nexys4DDR板级顶层，连接UART命令、npu_system、AXI和MIG。",
      "inputs": [
        "板级时钟/复位",
        "UART RX",
        "DDR"
      ],
      "outputs": [
        "UART TX",
        "DDR控制"
      ],
      "concepts": [
        "FPGA",
        "MIG",
        "AXI",
        "UART"
      ],
      "related": [
        "single-core"
      ]
    }
  ],
  "pipeline": [
    {
      "id": "fetch",
      "name": "选择线程 / 取指",
      "file": "source/hardware/src/core/instruction_fetch_stage.sv",
      "line": 51,
      "description": "从tc_thread_en轮询选线程，用该线程PC访问I-cache；miss由Thread Controller追踪。",
      "signals": [
        "tc_thread_en",
        "if_pc_scheduled",
        "if_inst_scheduled",
        "if_cache_miss"
      ],
      "hazard": "线程未启用、I-cache miss、指令buffer压力、DSU停止"
    },
    {
      "id": "decode",
      "name": "译码",
      "file": "source/hardware/src/core/decode.sv",
      "line": 42,
      "description": "将原始32-bit指令展开为寄存器、立即数、mask与pipe_sel等结构化字段。",
      "signals": [
        "if_valid",
        "dec_valid",
        "dec_instr"
      ],
      "hazard": "rollback导致该线程旧路径指令失效"
    },
    {
      "id": "instruction-buffer",
      "name": "每线程 FIFO",
      "file": "source/hardware/src/core/instruction_buffer.sv",
      "line": 77,
      "description": "各线程独立缓冲译码结果，等待后端允许发射。",
      "signals": [
        "ib_instructions_valid",
        "ib_fifo_full",
        "is_thread_scheduled_mask"
      ],
      "hazard": "线程队列空；LSU队列满时内存指令暂不可用"
    },
    {
      "id": "scheduler",
      "name": "依赖检查 / 发射",
      "file": "source/hardware/src/core/instruction_scheduler.sv",
      "line": 149,
      "description": "检查RAW/WAW和结构资源，再从can_issue线程中round-robin选择。",
      "signals": [
        "can_issue",
        "is_instruction_valid",
        "is_destination_mask"
      ],
      "hazard": "scoreboard忙位、wb_fifo_full、FP/SPM冲突、barrier、rollback"
    },
    {
      "id": "operand-fetch",
      "name": "读寄存器 / 形成操作数",
      "file": "source/hardware/src/core/operand_fetch.sv",
      "line": 49,
      "description": "以线程ID与寄存器编号读取SRF/VRF，处理标量广播、有效地址与mask。",
      "signals": [
        "opf_valid",
        "opf_fetched_op0",
        "opf_fetched_op1",
        "opf_hw_lane_mask"
      ],
      "hazard": "恢复路径取消有效性；mask寄存器也必须满足依赖"
    },
    {
      "id": "execute",
      "name": "并行执行通路",
      "file": "source/hardware/src/core/npu_core.sv",
      "line": 37,
      "description": "按pipe_sel送往INT、FP、LSU、SPM或分支/同步控制；不同路径延迟不同。",
      "signals": [
        "int_valid",
        "fp_valid",
        "ldst_valid",
        "spm_valid"
      ],
      "hazard": "缓存miss、SPM bank冲突、FP输出时机冲突、分支重定向"
    },
    {
      "id": "writeback",
      "name": "结果仲裁 / 写回",
      "file": "source/hardware/src/core/writeback.sv",
      "line": 42,
      "description": "汇合执行结果，按mask与byte enable更新寄存器，并反馈scoreboard释放。",
      "signals": [
        "wb_valid",
        "wb_thread_id",
        "wb_result",
        "wb_fifo_full"
      ],
      "hazard": "多个结果竞争有限写回能力；必要时先进入各源FIFO"
    }
  ],
  "coherence": [
    {
      "title": "A 请求读权限",
      "description": "A 的load对该行没有可用副本，LSU/CC把本地未命中转为GETS，记录事务与等待线程。",
      "modules": [
        "lsu",
        "cache-controller",
        "mshr"
      ],
      "caveat": "起始条件设为A无有效副本；未展示替换冲突。"
    },
    {
      "title": "请求找到 home",
      "description": "CC按地址高位形成home目录ID；NI拆包成flit，经XY路径到达对应目录。",
      "modules": [
        "network-interface",
        "packetizer",
        "router",
        "directory"
      ],
      "caveat": "路由距离不等于周期数；未模拟队列与credit时序。"
    },
    {
      "title": "目录协调数据与共享记录",
      "description": "home检查其L2/owner/sharer状态，提供数据或向持有者/存储服务发起所需动作，返回DATA。",
      "modules": [
        "directory",
        "directory-rom",
        "network-interface"
      ],
      "caveat": "数据来源依初态变化，这里合并为一个概念事件。"
    },
    {
      "title": "A 完成读取，B 加入共享",
      "description": "A收齐所需数据与完成条件后更新本地状态并唤醒线程；B读取同一行也获得共享可读副本，目录记录共享者。",
      "modules": [
        "cache-controller",
        "cc-rom",
        "lsu"
      ],
      "caveat": "未展开每个瞬态及并发消息到达顺序。"
    },
    {
      "title": "A 写入先请求修改权限",
      "description": "A对共享行写入时请求GETM；home不能在B仍持有效共享副本时简单授予独占修改权限。",
      "modules": [
        "cache-controller",
        "directory",
        "directory-rom"
      ],
      "caveat": "实际协议有多个SM/IM瞬态与不同的数据、ACK路径。"
    },
    {
      "title": "使 B 的共享副本失效",
      "description": "目录协调INV/forward等动作，B处理失效并返回所需确认；NI把多目标发送实现为多次单播。",
      "modules": [
        "directory",
        "packetizer",
        "cache-controller"
      ],
      "caveat": "这是事件级逻辑，不是网络中的原子广播。"
    },
    {
      "title": "完成确认并恢复执行",
      "description": "请求方依据协议等待数据、ACK及权限条件满足后完成，更新缓存/事务状态并唤醒等待访存；后续写回释放寄存器依赖。",
      "modules": [
        "mshr",
        "cc-rom",
        "lsu",
        "writeback"
      ],
      "caveat": "只有真实仿真才能验证某次执行的周期、竞争和所有状态转换。"
    }
  ],
  "network": {
    "columns": 4,
    "rows": 4,
    "npuTiles": 8,
    "heterogeneousTiles": 0,
    "hostTile": 14,
    "memoryTile": 15,
    "tileIdFormula": "row * NoC_COL + col",
    "tileTypes": [
      {
        "id": 0,
        "type": "npu",
        "label": "NPU"
      },
      {
        "id": 1,
        "type": "npu",
        "label": "NPU"
      },
      {
        "id": 2,
        "type": "npu",
        "label": "NPU"
      },
      {
        "id": 3,
        "type": "npu",
        "label": "NPU"
      },
      {
        "id": 4,
        "type": "npu",
        "label": "NPU"
      },
      {
        "id": 5,
        "type": "npu",
        "label": "NPU"
      },
      {
        "id": 6,
        "type": "npu",
        "label": "NPU"
      },
      {
        "id": 7,
        "type": "npu",
        "label": "NPU"
      },
      {
        "id": 8,
        "type": "directory",
        "label": "无计算核 / 目录"
      },
      {
        "id": 9,
        "type": "directory",
        "label": "无计算核 / 目录"
      },
      {
        "id": 10,
        "type": "directory",
        "label": "无计算核 / 目录"
      },
      {
        "id": 11,
        "type": "directory",
        "label": "无计算核 / 目录"
      },
      {
        "id": 12,
        "type": "directory",
        "label": "无计算核 / 目录"
      },
      {
        "id": 13,
        "type": "directory",
        "label": "无计算核 / 目录"
      },
      {
        "id": 14,
        "type": "host",
        "label": "Host"
      },
      {
        "id": 15,
        "type": "memory",
        "label": "Memory"
      }
    ],
    "ports": [
      "LOCAL",
      "EAST",
      "NORTH",
      "WEST",
      "SOUTH"
    ],
    "virtualChannels": [
      {
        "id": 0,
        "name": "Request"
      },
      {
        "id": 1,
        "name": "Response Inject"
      },
      {
        "id": 2,
        "name": "Forward"
      },
      {
        "id": 3,
        "name": "Service"
      }
    ],
    "queueDepthPerVC": 16,
    "payloadBits": 64,
    "routing": "XY-DOR：先 X 再 Y；y增大向SOUTH。",
    "homeMapping": "cache_controller_stage4 取地址最高 clog2(TILE_COUNT) 位；源码限定square NoC。",
    "limits": [
      "tile_none 仍有NI、目录控制器与router，不能视为空网络位置。",
      "64 bit是payload宽度，flit还包含header。",
      "路径实验是路由概念模型，没有实现队列、credit、仲裁或周期精确仿真。"
    ],
    "sources": [
      {
        "path": "source/hardware/src/include/npu_network_defines.sv",
        "line": 39,
        "label": "npu_network_defines.sv"
      },
      {
        "path": "source/hardware/src/mc/network_interface/routing_xy.sv",
        "line": 51,
        "label": "routing_xy.sv"
      },
      {
        "path": "source/hardware/src/mc/tile/tile_none.sv",
        "line": 184,
        "label": "tile_none.sv"
      },
      {
        "path": "source/hardware/src/mc/cache_controller/cache_controller_stage4.sv",
        "line": 91,
        "label": "cache_controller_stage4.sv"
      }
    ]
  }
};

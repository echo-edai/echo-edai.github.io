# NaplesPU 技术图生成与核验记录

本次使用 [imagegen 技能](<home>/.codex/skills/.system/imagegen/SKILL.md) 的内置 `image_gen`，生成两张平面工程图。未使用 CLI/API fallback，未采用芯片宣传画或概念艺术图。提示词与定向修改提示词完整保存在 [diagram-prompts.md](diagram-prompts.md)。

两张最终图均为 1536 × 1024 PNG。核验方式为：读取当前硬件 `master 02a73a6d…` 的模块实例化和关键信号，对生成结果进行可见标签、拓扑与数值检查。图为模块/消息责任关系图，省略大量单线接口，**不是** RTL elaboration 工具导出的完整网表、逐周期时序图或形式验证结果。本记录不声称像素级文本绝对无误。

## 最终文件

| 文件 | 原始内置生成输出 | SHA-256 |
| --- | --- | --- |
| `web/assets/system-architecture.png` | `<home>/.codex/generated_images/01a19b73-0212-7e53-a18b-fbddf6b456ef/exec-c79d2cc7-da35-4a16-86c2-e5578e355b43.png` | `a1f7391ab6d6bba25f74ccd61f75a89ddf5f6a2a10a351204a32faf1fc4c418a` |
| `web/assets/core-dataflow.png` | `<home>/.codex/generated_images/01a19b73-0212-7e53-a18b-fbddf6b456ef/exec-24f0fd95-e041-467b-a2ef-6a48b3caa664.png` | `3aa6ad7fff759a588134d7182a2d32ea2522f1bbae9d185fcf26cff187f30c6b` |

选定图片已复制进项目；项目不依赖只存在于默认生成目录的资产。原始生成文件保留。

## 图一：默认 4 × 4 多核系统

| 检查项 | 观察与依据 |
| --- | --- |
| tile 数与编号 | 图中 4 行 × 4 列，0–15 各一次，ID=y×4+x；无额外 tile、回绕或对角链路。依据 `npu_noc.sv:96,126`。 |
| 计算 tile | 0–7 标为 NPU，对应 `TILE_NPU=8` 与分配逻辑。依据 `npu_user_defines.sv:95`、`npu_noc.sv:186`。 |
| 无计算核 tile | 8–13 标为 DIR/no core，且保留 DIR、NI、R；没有把 `tile_none` 画成不存在的网络节点。依据 `tile_none.sv:95,184,248`。 |
| Host / memory | ID14 为 HOST、ID15 为 MEM，分别保留目录；item interface 与外部 block memory 分开。依据 `npu_user_defines.sv:93,94`、`tile_h2c.sv`、`tile_mc.sv`。 |
| NPU tile 内部 | core ↔ l1d_cache wrapper ↔ NI；directory 独立接 NI；服务侧与 NI 相连；NI 经 router LOCAL 端到 mesh。依据 `tile_npu.sv:268,377,476,570,615,645,768,808`。 |
| wrapper 边界 | 明确标注 core_interface + cache_controller；并没有把目录与数据缓存合并成一个中央缓存。依据 `l1d_cache.sv:143,188`。 |
| 取指路径 | 图内文字明确：请求 TC→DC；返回 NI→CC stage1→TC→I-cache。也明确 CC response dispatch 在 wrapper 内，但不访问 D-cache 数据阵列。依据 `tile_npu.sv:455,578`、`cache_controller_stage1.sv:469,516,556,565`。 |
| 默认核心配置 | 16 × 32-bit lane、8 HW threads/core、每线程 SRF 64×32 和 VRF 64×512。依据 `npu_defines.sv:39`、`npu_user_defines.sv:68`、`operand_fetch.sv:34`。 |
| NoC 标签 | request / response / forward / service 四种 VC；N/E/S/W/LOCAL；64-bit payload + header，不把 64 bit 当成整个 flit。依据 `npu_network_defines.sv:39–104`。 |
| home 约束 | 图中保留高位地址映射与 square NoC 限制，避免暗示任意矩形配置已经受支持。依据 `cache_controller_stage4.sv:91–98`。 |

省略范围：图中的四类 tile 插图是概念消息路径，不列全 host/memory tile 内每个外围单元和每根握手线；mesh 的整体双向链接不表达 router 内部具体级数或拥塞时序。

## 图二：核心数据流与控制契约

| 检查项 | 观察与依据 |
| --- | --- |
| 前端模块顺序 | fetch → decode → instruction_buffer → instruction_scheduler → operand_fetch。未画成固定八级流水线。依据 `npu_core.sv` 中对应实例。 |
| 前端箭头标签 | 已定向编辑修复首轮重绘中标签错位：TC→fetch 为 tc_if_thread_en/job PC，随后依次 if_*、dec_*、ib_instructions/valid、is_instruction/thread_id。 |
| 线程上下文 | 图中独立 PC/寄存器上下文与共享 lane/执行资源区分清楚，没有把 lane 画成独立 CPU 核。 |
| 执行与写回 | INT、FP、SPM、LSU 四种结果进入 writeback；branch/barrier 位于单独控制面板，没有新增 branch→WB 直连。依据 `writeback.sv:42` 的四类输入。 |
| LSU / SPM | LSU 通过具名 D-access 端口连接 tile wrapper；SPM 为独立本地 banked memory，不位于 L1 后方。依据 `npu_core.sv:591,675`。 |
| 回压 / 资源反馈 | ldst_almost_full 指向 instruction_buffer 的具名端口；wb_fifo_full 指向 scheduler readiness；WB result 同时通往寄存器写端与 scoreboard。依据 `instruction_buffer.sv:62,102`、`instruction_scheduler.sv:155`。 |
| 取指请求与回填 | C 面板分三行列出不对称路径；没有画从 operand_fetch 发出的 I-miss 请求，也没有画错误的 TC↔DC 直接返回。 |
| 恢复目标 | branch/LSU/SPM → rollback_handler → PC 恢复、线程 FIFO 清空、scoreboard 清理和有效性屏蔽；没有将 writeback 画为统一 rollback 终点。依据 `rollback_handler.sv:42` 与顶层连接。 |
| barrier | 等待访存完成与 scoreboard drained，ACCOUNT→服务 VC3，RELEASE→bc_release_val→scheduler。依据 `barrier_core.sv:106,107`。 |
| 反向命名提醒 | 图中提醒 scoreboard_empty 实际是忙位 OR；不按名字推断为“1表示空”。依据 `instruction_scheduler.sv:170`。 |

图二用四个独立分面和同名端口表达跨面板信号，避免生成器把长跨越线接到相邻模块。这些端口与文字是契约摘要；不能当成逐根端口的原理图。少量信号以短写形式呈现，实际 RTL 声明及端口仍应由源码查看器确认。

## 未采用版本与修正

1. 第一张系统图满足本次重点检查，直接选用。
2. 第一张核心图 `exec-2735b6ee…` 把外部存储蓝线连到 barrier 附近，I-refill 请求看起来来自 operand_fetch，且部分反馈线错接，故拒绝采用，没有放入 `web/assets/`。
3. 核心图重新生成分面布局 `exec-fac94812…` 后，结果/控制拓扑得到修正，但前端信号文字整体错移一个模块间隙，因此仍未作为最终图。
4. 使用内置图像编辑仅修正 A 面板五个前向箭头标签，得到最终 `exec-24f0fd95…`。检查了下方执行、存储与控制面板没有出现明显新增拓扑错误后采用。

最终检查覆盖可见的主要模块与因果方向。图像不能取代网页中可交互、可修订的关系图、真实源码行和进一步 RTL 验证。

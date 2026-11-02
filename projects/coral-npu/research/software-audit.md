# Coral NPU 软件内容源码审计

日期：2026-11-02。范围：`content/software.json` 的软件栈、编译、运行时、模型和学习实验。未修改上游源码。

## 产物与校验

- 9 章、44 节、50 个术语、8 个实验计划、8 道测验。
- 44 处 `source` 均核验本地文件存在且一基行号范围有效。
- JSON 可解析、chapter id 唯一、章目结构有效、测验 `answer` 落在选项范围内。
- 实验均为 `notRun: true`；本次没有构建编译器、运行 Matmul、RTL 仿真、FPGA 或性能测量。
- 教学示例的公式、状态机、工作集估算不作为实际测试结果。

## 必须保留的版本合同

| 组件 | 固定提交 |
| --- | --- |
| 主硬件快照 | f79522157fc0f1d7311f44e209fc36c9c8b7a039 |
| 编译器 | d715556c3853719e414182c0bf5f4a10f248f1d9 |
| 编译器 `third_party/coralnpu` | 782675ac1af7cefd7612c5bdae5445796b62a7f6 |
| IREE | 2b05c5dbb2f2ecb27c0d3941e80ee8d2f16e890d |
| 编译器 LLVM | 6cce5bca3b901ec32e250fb43e88eb0fe511af93 |
| Coral MPACT | 704b28ce126debd2d951f9c3b36704080d75dc60 |
| MPACT RISC-V | 19f9b3c0c8670d8425ca237c28d2d6bf1079cfff |
| MPACT Sim | 11dfe5a8e841358b41e012bab1fc2fe18a229728 |

编译器 README 指向 Zvt v0.4。主硬件与编译器锁定硬件不是同一提交。数据来源：`CoralNPU/docs/sources.json`、编译器 `.gitmodules` 与 `MODULE.bazel`。只记录提交还不够：编译器的 LLVM、IREE、MPACT 集成另有补丁。

### MPACT 补丁是可执行能力的一部分

原始 Coral MPACT 固定提交含 M4 独立源码，但 `sim/hw_sim/mpact_simulator.cc` 中包装动态库仍使用 `CoralNPUV2State` 和 `CoralNPUM3UserDecoder`。编译器 `MODULE.bazel` 对其应用 `coralnpu-mpact-0001-vme-m4-decoder.patch`，切换到 M4 state/decoder 与 Zvt state，并补充 BF16、v0.4 编码、Tile 几何和运行步进。不能把原始模型的动态库与编译器集成模型等同。

`mpact-riscv-0003-zvt-bf16-altfmt.patch` 匹配此硬件 BF16×BF16 的 altfmt 解释；`mpact-riscv-0004-zvt-bf16-rounding.patch` 用 TwoSum 残差改进窄输入 dot 与 accumulator 的 round-to-odd。简单 double 求和未必与目标位精确一致。本次只读原始源码和补丁文本，没有构建补丁后的模型。

## 关键事实与代码入口

| 事实 | 主要入口 |
| --- | --- |
| JAX 导出与显式累加类型 | `compiler/examples/matmul-aot/export_matmul.py:54–68` |
| Dispatch affinity/算量及搬运代价 | `compiler/compiler/Transforms/CoralNPUAffinityAnnotation.cpp:53–178` |
| Tiling 级别与容量 | `compiler/docs/design/tiling_levels_explained.md` |
| DTCM→Workgroup→Register/向量化→矩阵 Codegen 管线 | `compiler/compiler/Target/CoralNPUTargetBackend.cpp:398–452` |
| 共享 Zvt 类型/形状合法性接口 | `compiler/compiler/Transforms/CoralNPUTileSizeSelectionUtils.h:38–53` |
| Zvt Codegen、初始化与回退规则 | `compiler/docs/design/matrix_codegen.md` |
| 固定 64 字节 dispatch ABI | `compiler/crt/coralnpu_dispatch.h:26–71` |
| 请求状态、顺序 workgroup、halt | `compiler/crt/coralnpu_main.c:28–130` |
| 同步 one-shot command buffer 与 barrier 前提 | `compiler/runtime/driver/coralnpu_command_buffer.c:33–198` |
| ELF、分配、binding table、执行与 copy-back | `compiler/runtime/sim/simulator_inline.c:27–320` |
| 后端选择、模型复用与锁 | `compiler/runtime/sim/simulator_backend.c:74–125` |
| M4 opcode 绑定与权限检查包装 | `mpact/sim/coralnpu_m4.isa`、`mpact/sim/coralnpu_m4_instructions.cc` |
| Zvt 配置与 matmul 语义 | `mpact-riscv/riscv/riscv_zvt_instructions.cc:378–536,854+` |
| 集成模型补丁 | `compiler/MODULE.bazel:167–210` 和对应 `.patch` 文件 |
| AOT Zvt/RVV 与 MPACT/Verilator 比较入口 | `compiler/examples/matmul-aot/test_matmul.sh:60–120` |
| 手写 widening RVV 最小程序 | `hardware/examples/rvv_add_intrinsic.cc:30–36` |

表中的 `compiler`、`hardware`、`mpact`、`mpact-riscv` 分别是 JSON `source.repo` 的逻辑仓库名；对应真实目录由网页源码映射处理。

## 防止误导的边界

1. Compiler README 顶部仍强调 JAX 和 host simulation，后部已列 TFLite/TOSA、MPACT、Spike、Verilator、FPGA。以具体目标与示例确认覆盖，不能用概述一句话宣称所有入口均已验证。
2. IR 中出现 `vector.contract` 不足以证明生成 Zvt；需目标特征、类型/形状、容量、后续转换和最终汇编证据。
3. 文档明确卷积 IGEMM affinity 过滤在真实编译路径未命中。这不能推广为“所有卷积不能用 Zvt”；直接 spatial convolution 另有匹配路径。
4. 文档通用 Tiling 层名 Cache 在这里用于本地 DTCM 容量划分，不证明存在相应硬件多级 Cache。
5. Runtime 只读 binding cache 是跨 dispatch 避免重复搬运的 host/runtime 优化，不是硬件一致性协议，不是 directory controller。
6. HAL barrier 的空实现建立在 inline 同步执行前提上，不能直接迁移到异步 DMA、多核或多队列设计。
7. Host↔模拟器装载/回收、设备内存布局与 Core 本地 DMA 是不同层次，网页内容保持区分。
8. Host 回退、RVV 回退、编译报错属于不同层级。支持矩阵算子不等于任何 shape/type 都使用矩阵阵列。
9. 8 KiB DTCM 工作集来自 Tiling 文档教学例子，不代表当前 RTL 默认容量；教学估算也不能代替实际缓冲布局。
10. MPACT、Spike 是 ISA/功能证据；Verilator 是选定 RTL 构建的行为与周期证据；FPGA 是板级实现证据。它们不能无条件互换，更不能将模型周期当实测硅吞吐。
11. Roofline 常数及文档上游性能不作为此次测量。实验卡描述将来如何测量，未填造结果。
12. INT8→INT32、BF16→FP32 的输入、累加、输出类型分别说明；fast-math、分组和舍入变化单独记录。

## 建议学习路线

先跟踪 RVV widening add，再做一个小 AOT Matmul 的模型→IR→汇编→ELF→ABI→结果链，随后比较 Zvt/RVV 与功能模型/RTL，再扩大形状、尾块、类型和多 dispatch。每个结论保存输入、目标配置、版本/补丁、证据文件、期望与实测差异。故意破坏 ABI 或合法性条件，以验证错误路径的可观察性。

# Gemmini 软件课程核查记录

日期：2026-11-02。作者：software subagent。此记录说明课程依据、关键差异与未运行范围。

## 产物

- `content/software.js`：6 章、26 节、20 道解释性自测、3 条学习路线。
- `research/tools-research.md`：官方开源分析工具研究与本次 Repomix 运行记录。
- 所有源码引用使用项目名、仓库相对路径、1-based 行号；正文没有修改或重排上游源码。

## 固定输入

| 仓库 | commit |
| --- | --- |
| Gemmini | `8c3f9923a44a2fe2c7930587be297d6d4f8c09ca` |
| gemmini-rocc-tests | `7c540b3adf1b86ad93d07f893abe3a73489b568e` |
| libgemmini | `ea8f7ed7afd68e001fb06ddccad9a023c990961d` |
| onnxruntime-riscv | `f6d2fc95463316ec47d7f832f35be03c26887922` |

## 特别核对的事实

1. `gemmini_params.h:17-21`：elem_t/int8、acc_t/int32、full_t/int64。明确区分参考精度与硬件存储精度。
2. `Controller.scala:29` 与 `GemminiConfigs.scala:337-378`：配置生成 C 头；只改软件 DIM 不改变电路。
3. `template.c:33-37`：本地存储按行寻址；mvin 的主存指针与本地地址单位不同。
4. `matmul.c:154-173,363-380`：OS 和 WS 中 preload/compute 地址语义不同。
5. `matmul.c:345-349,387`：累加位与输出地址处理；不把高位控制标记当作纯行索引。
6. `gemmini.h:1201-1211`：高层 API 的合法转置/full_C/low_D 组合，不从底层 transposer 存在推断全部 API 支持。
7. `gemmini.h:1246-1252`：分块行预算；I=2,J=3,K=4,DIM=16 的例子分别为320条scratchpad行、96条accumulator行。
8. `gemmini.h:1286-1328`：WS双缓冲预算和auto启发式；不将auto标为全局优化器。
9. `gemmini.h:807-845`：NULL作为复用、无bias、推迟输出的不同哨兵含义。
10. ONNX `quantize_linear_matmul.cc:42-80`：INT8 QLinearMatMul要求A/B/Y零点均0、scale标量；不宣传任意量化模型支持。
11. `libgemmini/gemmini.cc:1924-1931`：计数器随机更新；Spike不能用于实际性能结论。
12. `template.c:25-42`：输入In未初始化。课程明确复制骨架时应补确定输入，不将原始模板描述为已验证的确定性用例。
13. `gemmini.h:309` 与 `xcustom.h:147-152`：现有inline asm无显式memory clobber。课程只描述代码并强调移植时分开核对编译器、CPU顺序和系统一致性；没有擅自修改上游宏。
14. `Controller.scala:174-185,488-491`：flush面向翻译/重试；不是通用CPU数据缓存写回。

## 验证范围

- 已通过 Node.js 语法检查。
- 已逐项读取上述源代码行并计算分块例子。
- 由主 agent 统一执行数据引用存在性、浏览器交互与公开目录构建验证。
- 未编译运行上游测试、Spike、Chipyard、ONNX、RTL仿真或板级部署；课程中的实验路径和验收条件是后续建议。

## 工具调研边界

官方仓库于本日查阅。Repomix由主agent实际运行并提供日志，本agent核对了日志及本机安装的languageConfig；其余工具只研究未执行。最新CodeWiki README已报告Scala analyzer，不能继续沿用“只支持旧版七语言”的过时描述；但对HDL/Chisel elaboration的适用边界依然保留。

## 交互自测

题目提供确定answer索引和解释；数据初始化阶段按题号稳定轮换选项并同步正确索引，正确答案位置分布在三个选项。渲染必须使用answer字段，不能假定首项正确。题目事实判断应以解释和源码证据为准，不以位置记忆作答。

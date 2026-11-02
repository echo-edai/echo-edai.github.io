# Coral NPU 自动源码分析：实际执行与证据边界

生成日期：2026-11-02。分析对象固定到 `data/source-index.json` 的 `commitMap`，不是对未来主分支的结论。硬件与编译器保持原始仓库结构，网页通过 `repo` 和相对 `path` 定位文件。

本次实际执行了开源语法解析器和一次小范围 RTL 展开，并以源码证据组织教学。没有运行 CodeWiki 或 PocketFlow 的 LLM 文档生成流程，也没有调用付费 LLM API。

## 借鉴的开源项目

[CodeWiki 官方仓库](https://github.com/FSoft-AI4Code/CodeWiki)介绍先建依赖图、分层组织模块，再生成模块页和总览。本网页采用“文件→符号→源码引用→架构章节”的对应关系；每个教学章节保留可跳转的源码位置。它当前列出的语言含 Scala、C/C++，没有列出 SystemVerilog，因此不能直接把它的软件依赖图解释为 RTL 实例网表。其完整写作流程还需要模型提供方、订阅 CLI 或 MCP 接入，本次未执行该部分。

[PocketFlow Codebase Knowledge 官方仓库](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge)采用“核心抽象及其交互→初学者教程”的教学顺序。本网页据此先讲指令、握手、存储、执行单元等概念，再追踪 RTL、编译器与运行时实现。该项目自身支持中文教程与本地目录输入；本次借鉴教学组织方法，没有把手工研读称为它自动生成的结果。

## 实际工具与版本

| 工具 | 本次版本 | 实际用途 |
|---|---|---|
| pyslang | 12.1.0 | SystemVerilog/Verilog 语法树、模块、端口、参数、实例引用、预处理诊断 |
| tree-sitter | 0.25.2 | Scala/C/C++ 的真实语法树遍历 |
| tree-sitter-scala | 0.26.4 | class/object/trait、构造参数、Chisel IO、`Module(new ...)`、`addResource` 引用 |
| tree-sitter-cpp | 0.23.4 | 第一方 C/C++ 类型、函数、命名空间与 include 位置 |
| Python ast | 本机 Python 标准库 | Python 类、函数、导入 |
| Verilator | 5.048，2026-04-26 | 对原始 `RstSync.sv` 和 `ClockGate.sv` 执行 `--json-only` 展开 |
| Yosys | 0.65 | 只核查安装能力，未执行综合 |

[slang 官方仓库](https://github.com/MikePopoloski/slang)提供 `pyslang` Python 绑定；[tree-sitter 官方文档](https://tree-sitter.github.io/py-tree-sitter/)说明了 Parser/Tree/Node API。本次所用 tree-sitter 锁定为 0.25.2；当前在线文档的 0.26.0 版本号不代表本次运行版本。初试 0.26.0 的混合解析流水线出现过本机原生崩溃，已降版并对 SV 逐文件使用独立进程隔离。没有把正则表达式搜索冒充 AST；少量正则仅用于已选中的语法节点文字清理和方向标签。

## 覆盖范围

当前索引含 6,027 条文件元数据、1,408 份可按需加载的文本源码，正文共 12,882,624 字节。模块/类/函数等符号共 5,735 个；154 个 SV module 包括测试顶层，不能称为 154 个生产硬件 IP。

| 解析方法 | 文件数 | 含本文件语法诊断 | 含被包含头文件诊断 |
|---|---:|---:|---:|
| pyslang SyntaxTree | 247 | 84 | 77 |
| tree-sitter Scala | 147 | 0 | 0 |
| tree-sitter C/C++ | 392 | 176 | 0 |
| Python ast | 174 | 0 | 0 |
| 普通文本 | 447 | 不适用 | 不适用 |
| 教程引用的 MPACT 文本 | 1 | 未解析 ISA DSL | 不适用 |

其余文件只保留元数据及固定提交的上游链接。完整硬件第一方 RTL 与 Scala 在 394 份相关源文件中；头文件、测试、软件和文档另行计数。编译器生成的模型/测试 MLIR 语料非常大，因此 `tests/models/` 以及部分较大 MLIR 只保留元数据；`tests/transforms/` 的适量实例仍可直接阅读。

图中 886 条边分为：432 条 SV 实例语法引用、238 条 Chisel Module 构造引用、216 条 BlackBox 资源引用。664 条边在当前索引内唯一解析到目标符号；217 条目标在外部或未收录；5 条存在重名歧义。源代码引用包含条件分支和资源声明，同一硬件功能可能同时出现 Scala 与 SV 表达，不能对边数直接作物理实例统计。

SV 索引显式定义 `ZVT_ON`、`ZVE32F_ON`、`ZVFBFMIN_ON`、`USE_GENERIC`，用于暴露教学相关语法。每份文件单独解析；这些宏不是每种官方构建配置都启用对应功能的证明。外部 UVM、构建宏、include 上下文和 C/C++ 宏会影响独立文件诊断。语法诊断不是类型检查结果，也不证明全芯片不能构建；本次没有尝试全芯片构建。

最初唯一的索引器异常出现在 `hardware:tests/vcs_sim/top.sv`：构建提供的 `DUT_MODULE` 宏未定义，使错误恢复语法节点缺少 `instance.decl`，遍历代码未判空。已修复判空并重新解析，当前 parserFailures 为 0；该文件仍如实保留第 89 行的 `UnknownDirective` 诊断。原始问题、修复与重解析结果保存在 `data/analysis/parser-recovery.json`。

MPACT 三仓 commit 已记录，但仅补充教程明确引用的文件，不扫描整个模拟器框架；目前为 `mpact:sim/coralnpu_m4.isa`。新增教程引用后，可单独运行补充脚本，无需重新扫描 RTL。

## 小范围真实展开

按照 [Verilator 官方参数文档](https://verilator.org/guide/latest/exe_verilator.html)的 JSON 输出接口，实际运行原始 `RstSync` 与 `ClockGate`，退出码 0。输出证明该配置下 `RstSync` 有名为 `icg` 的 `ClockGate` 子实例及 `clk_i / enable / te / clk_o` 端口。默认 generic 分支是本次展开的具体配置，不能据此推断工艺时钟门控单元。

证据文件：`data/analysis/verilator-summary.json`、`data/analysis/verilator/rstsync.tree.json`、`data/analysis/verilator/rstsync.meta.json`。生成 JSON 中的本机绝对路径已移除。没有执行全核 Chisel elaboration、全核 RTL 仿真、综合、时序分析或性能测量。语法引用图和这份展开证据在数据中有不同的 `confidence` 标签。

## 复现

从工作区根目录执行，Python 环境只保存在工具目录，不属于公开网页：

```sh
python3 -m venv web/coralnpu/tools/.venv
web/coralnpu/tools/.venv/bin/pip install -r web/coralnpu/tools/requirements.txt
web/coralnpu/tools/.venv/bin/python web/coralnpu/tools/build_source_index.py
python3 web/coralnpu/tools/elaborate_rstsync.py
python3 web/coralnpu/tools/validate_source_index.py
```

只更新软件教程引用：

```sh
python3 web/coralnpu/tools/supplement_referenced_sources.py
python3 web/coralnpu/tools/validate_source_index.py
```

完整扫描会刷新 `data/sources/`，应在发布复制前完成。前端按 `file.contentPath` 获取源码，不应将仓库路径拼接为本机文件 URL。全局符号 ID 使用 `repo:path#name:line`；行号从 1 开始；`sourceUrl` 指向固定提交。

校验报告 `data/analysis/source-index-validation.json` 核查了全部 1,408 份导出正文与原仓库逐字节相同、字节数与 SHA-256 一致、符号和引用行号有效、图端点存在、生成数据没有工作区绝对路径。它记录到 compiler 的 `third_party/iree` 子模块状态变化，但该目录不在导出范围。该校验验证的是引用与数据完整性，不是硬件功能正确性。

公开包只应复制站点资产、内容 JSON、数据与必要许可证。不得复制 `tools/.venv/`、工具临时目录、Git 元数据、整个 LLVM/IREE 或任何本机配置。第一方原始正文保留了原许可证头与对应仓库 LICENSE；元数据中的未导出文件只提供上游固定提交链接。

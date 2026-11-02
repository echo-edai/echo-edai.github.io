# 开源自动项目分析：实际使用与适用边界

核查日期：2026-11-02。以下仅使用项目官方仓库、代码和文档，不以工具生成的文字作为 Gemmini 电路事实。网页课程依据本地固定源码重新核对。

## 本次实际运行：Repomix 1.18.1

已在 `web/gemmini/tools/.deps` 局部安装并运行，不修改全局配置或上游源码，不调用在线 LLM 服务。硬件包包含 65 个文件，Repomix 计数为 **260,002 tokens**；软件包包含 69 个文件，**218,865 tokens**。两个包都通过了工具自己的 suspicious-file 检查，保留完整文本与行号，没有启用 `--compress`。扫描结果是该工具的输出，不是对所有潜在敏感内容的保证。

原始产物与日志：

- [硬件输入包](repomix-hardware.xml)、[运行日志](repomix-hardware.log)
- [软件输入包](repomix-software.xml)、[运行日志](repomix-software.log)

这不是把所有依赖丢给一个模型。仅两个定向包就接近 48 万 tokens；其中 `gemmini.h` 自身约 5.4 万 tokens。实际阅读按“软件接口—单次搬运—依赖调度—阵列—分块展开”拆成机制，再沿行号回查。完整的主仓库/依赖文件索引用于定位，输入包用于跨文件追踪，两者职责不同。

选择全内容模式的原因：本机安装版本的 `lib/core/treeSitter/languageConfig.d.ts` 支持列表中没有 Scala、Verilog 或 SystemVerilog；官方 [languageConfig.ts](https://github.com/yamadashy/repomix/blob/main/src/core/treeSitter/languageConfig.ts) 同样未列出。Repomix 可以原样打包这些文本，不能由此声称它已经理解 Chisel 硬件语义。其压缩功能主要提取结构，可能丢失解释硬件所需的赋值、握手和状态更新。工具使用方式见 [官方 README](https://github.com/yamadashy/repomix/blob/main/README.md)。

## 其他工具：已研究，未在本次运行生成

| 项目 | 可用能力 | 对 Gemmini 的判断 |
| --- | --- | --- |
| [PocketFlow Codebase to Tutorial](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge) | 采集文件、识别概念和关系、安排教学章节、生成教程 | 教学组织思路合适；默认文件集合会漏掉重要硬件，需要先修过滤 |
| [DeepWiki Open](https://github.com/AsyncFuncAI/deepwiki-open) | 自托管仓库 Wiki、检索问答、图示与深度研究 | 适合长期维护问答入口；检索结果不能代替真实依赖分析和 RTL 展开 |
| [CodeWiki](https://github.com/FSoft-AI4Code/CodeWiki) | 依赖图分层聚类、模块文档、更新、代码/构建工件分析 | 当前 2.0 README 已报告新增 Scala analyzer；可辅助 Chisel 源码导航，仍不等于 elaborated RTL 图 |
| [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) | 可点击的仓库架构概览、Mermaid 导出、远程 MCP 读取 | 适合开局概览与演示；AI 生成的边必须逐条用实例、端口与代码校验 |
| [Tree-sitter](https://github.com/tree-sitter/tree-sitter) | 增量语法解析与查询 | 使用相应 Scala grammar 可提取 class、method、Module(new …) 候选；不能直接解析 Chisel 展开后的连接和时序 |

### PocketFlow：先检查输入，才能讨论输出

官方 [main.py](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/main/main.py) 的默认 include 没有 `.scala`、`.sv`、`.v`；默认 exclude 过滤包含 test、docs、examples 等模式，默认单文件上限 100,000 bytes。Gemmini 的 `gemmini.h` 大于该阈值，而测试正是理解 ISA 的重要材料。因此直接对项目跑默认命令会遗漏关键证据。

若以后使用，显式设置 include、exclude、max-size，并在生成前输出采集清单。推荐先只读一个机制的小集合，例如 Controller、ReservationStation、LoadController、DMA、LocalAddr 和一个 mvin 测试；不要直接递归处理整个 Chipyard 和 ONNX Runtime。以上建议来自读取采集规则，不表示本次已经执行 PocketFlow。

### CodeWiki：区分“支持 Scala”与“理解 Chisel 电路”

当前 [官方 README](https://github.com/FSoft-AI4Code/CodeWiki/blob/main/README.md) 已描述 2.0 的 Scala analyzer、构建工件分析、增量更新和 MCP 模式。它比早期只覆盖少数语言的描述更适合此项目；但 Scala AST 看到的是生成器程序。条件参数、for 生成、LazyModule/Diplomacy 协商、Bundle 方向、Reg/when 的硬件语义，需要额外展开或人工解释。普通方法调用图不能直接标为信号连接图，文档生成成功也不证明协议正确。

### DeepWiki Open：RAG 擅长找解释，不能消除边界

官方 [embedding/retriever 配置](https://github.com/AsyncFuncAI/deepwiki-open/blob/main/api/config/embedder.json) 包含 embedding、分块与 top-k 检索参数。这类工作流可以反复提问“哪里实现了 preload”“bank 冲突在哪里处理”；回答仍要固定提交并引用原始行，尤其防止只取到旧注释、测试期望或功能模型，就推断 RTL 已实现同样行为。该项目还需要模型/embedding 运行环境，本次没有为它启动长期服务。

### GitDiagram：把概览当导航，随后验证每条边

当前 [官方 README](https://github.com/ahmedkhaleel2004/gitdiagram/blob/main/README.md) 提供互动图、Mermaid、远程 MCP 和本地部署说明。完整本地服务需要 Bun、存储/缓存服务和模型凭据，成本高于本任务只读固定源码所需的输入整理。这里没有安装其插件、修改 MCP 配置或使用线上服务生成 Gemmini 图。网页采用人工核对的模块关系，保留源码入口。

## 本任务采用的组合

1. Git 固定版本和完整路径索引，避免把当前 HEAD、软件子模块和教程年代混在一起。
2. Repomix 定向保留全文与行号，辅助跨文件上下文；完整记录其文件集合和大小。
3. 多个 subagent 分别阅读硬件、软件和微架构实现，再由主 agent 整合。
4. Chisel 模块/符号索引用于导航；人工核对实例、端口、依赖与配置。词法/AST 候选不冒充 elaborated netlist。
5. 交互模型标明缩小范围，用定向检查验证其转换规则；不称为完整 Gemmini RTL 仿真。
6. 图片作为导览，精确结构通过可点击代码原生图和源码引用表达。

建议继续深入时，为已固定 Chipyard 配置真正执行 Chisel elaboration，读取生成的 SystemVerilog/FIRRTL 与层次，再选择小测试做 RTL 波形。当前资料收录不包含完整可离线构建的工具与全部平台依赖，因此这一步是后续实验，不是本次已完成的结果。

## 复现本次工具运行

以下命令从工作区根目录运行，安装固定版本到当前教材目录；没有开启结构压缩。

```sh
npm install --prefix web/gemmini/tools/.deps --no-audit --no-fund --ignore-scripts --registry=https://registry.npmjs.org repomix@1.18.1
node web/gemmini/tools/.deps/node_modules/repomix/bin/repomix.cjs gemmini/hardware/gemmini --include 'src/**/*.scala,README.md,build.sbt,CHIPYARD.hash,LICENSE' --output web/gemmini/research/repomix-hardware.xml --style xml --parsable-style --output-show-line-numbers --no-git-sort-by-changes
node web/gemmini/tools/.deps/node_modules/repomix/bin/repomix.cjs gemmini/software/gemmini-rocc-tests --include 'include/*.h,bareMetalC/*.c,README.md,LICENSE' --output web/gemmini/research/repomix-software.xml --style xml --parsable-style --output-show-line-numbers --no-git-sort-by-changes
```

本次工具输入均为公开上游快照；构建网页数据不依赖已安装的Repomix，更新源码索引使用 `tools/build_data.py`。

# 自动项目分析与教学生成开源项目调研

核查日期：**2026-11-02（Asia/Shanghai）**。本次检查官方 GitHub 仓库、README、LICENSE、最近默认分支提交及针对语言覆盖的实现文件；筛选下列五个真实存在的候选。这里的“新”以本次读取的明确提交为准，不把搜索排名、star 数、网页抓取时间或仓库 `updated_at` 当作代码更新时间。

**实际整合方式：方法参考 + 本地实现。没有安装或运行这五个外部项目，没有调用其在线生成、远程 MCP、向量检索或视频服务。** 本网站的源码索引由 [本地生成脚本](../tools/build_source_data.py) 构建；教学内容由子代理阅读 NaplesPU 官方源码后组织与核对。不能把本地结果称作这些引擎的自动生成结果。

## 核查快照

所有日期均为 UTC。`pushed_at` 是 GitHub 仓库推送时间，可能涉及非默认分支；“默认分支提交”则是 `commits?per_page=1` 返回的默认分支头。五个仓库在核查时均未归档。这些时间是观察事实，不构成未来维护承诺。

| 项目 | 许可 | 默认分支最近提交 | 提交时间（UTC） | 仓库最近推送（UTC） |
| --- | --- | --- | --- | --- |
| [PocketFlow Tutorial / Code2Tutorial](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge) | [MIT](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/LICENSE) | [05b24cbbb0](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/commit/05b24cbbb0fe409c5e23c9791f0342f07524ffdc) | 2026-05-31 01:26:41 | 2026-05-31 01:26:41 |
| [DeepWiki-Open](https://github.com/AsyncFuncAI/deepwiki-open) | [MIT](https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/LICENSE) | [cdd19ca055](https://github.com/AsyncFuncAI/deepwiki-open/commit/cdd19ca055aff4985eeb52e8515774471b967d26) | 2026-10-28 15:24:48 | 2026-10-28 15:24:48 |
| [CodeWiki（FSoft-AI4Code）](https://github.com/FSoft-AI4Code/CodeWiki) | [MIT](https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/LICENSE) | [1b4af43d6d](https://github.com/FSoft-AI4Code/CodeWiki/commit/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d) | 2026-11-01 09:32:15 | 2026-11-01 09:32:19 |
| [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) | [MIT](https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/LICENSE) | [7876ab0ca8](https://github.com/ahmedkhaleel2004/gitdiagram/commit/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae) | 2026-10-30 06:51:53 | 2026-10-30 06:52:07 |
| [Repomix](https://github.com/yamadashy/repomix) | [MIT](https://github.com/yamadashy/repomix/blob/fe02ab760f14cc2b22123597cb46b37fc52144e7/LICENSE) | [fe02ab760f](https://github.com/yamadashy/repomix/commit/fe02ab760f14cc2b22123597cb46b37fc52144e7) | 2026-11-01 15:33:19 | 2026-11-01 16:12:32 |

## 候选分析与采用边界

### 1. PocketFlow Tutorial / Code2Tutorial

**官方能力。** 把仓库阅读分为获取文件、识别核心抽象、分析关系、安排章节、撰写和合并教程。 [官方 README](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/README.md)。

**对 NaplesPU 的适用性。** 适合设计从整体概念进入具体文件的教学路线；可用于 C/C++ 工具链说明。已核对 main.py：默认包含模式没有 .sv/.v/.vhdl，且默认排除 examples、misc、tests 等目录，直接套用会漏掉 NaplesPU 关键内容。

**本网站实际采用。** 借鉴“抽象→关系→章节”的组织方式，以本地子代理核对源码后编写课程；未安装或运行 PocketFlow 生成器。

**运行成本与局限。** 生成需要配置 LLM 服务，官方也提供 Ollama 路径。默认单文件上限 100,000 bytes，可能漏掉大型实现。Code2Tutorial 是仓库关联主页，不是另一个已验证的开源引擎；本次访问其主页返回 404。

核查依据：[LICENSE（核查提交）](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/LICENSE)、[GitHub 元数据](https://api.github.com/repos/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge)、[main.py](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/main.py)、[flow.py](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/flow.py)。

### 2. DeepWiki-Open

**官方能力。** 从 GitHub、GitLab 或 Bitbucket 代码构建交互 Wiki、图示和源码导览，并支持检索增强问答。当前英文 README 使用 Grok-Wiki 名称。 [官方 README](https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/README.md)。

**对 NaplesPU 的适用性。** 可作为模块页面、导航和源码上下文关联的参考。没有据其通用仓库分析能力推定它能够完成 SystemVerilog elaboration、端口连线或时序验证。

**本网站实际采用。** 采用“解释与源码相邻”的页面方式，提供关键词检索和行号定位；本地站点不连接其后端，也不把静态搜索标成 RAG 或在线 AI 问答。

**运行成本与局限。** 官方配置支持云端提供商和 Ollama；模型生成与 embedding 都需要相应服务配置。未部署、未生成 NaplesPU DeepWiki，因此没有其在本项目上的效果或覆盖率结论。

核查依据：[LICENSE（核查提交）](https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/LICENSE)、[GitHub 元数据](https://api.github.com/repos/AsyncFuncAI/deepwiki-open)、[README.zh.md](https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/README.zh.md)、[api/config/generator.json](https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/api/config/generator.json)。

### 3. CodeWiki（FSoft-AI4Code）

**官方能力。** 从代码依赖图形成模块层次，由代理分层撰写页面和架构图；当前文档还提供构建配置节点与增量更新工作流。 [官方 README](https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/README.md)。

**对 NaplesPU 的适用性。** 适合借鉴系统→子系统→模块的拆分。核对默认 patterns.py 后，未见 .sv/.v/.vhdl 的默认包含或语言映射，不能将其当作已具备 RTL 信号级分析的工具。此项目与 Google 的同名 Code Wiki 服务应区分。

**本网站实际采用。** 本地内容按系统、core、存储一致性、NoC、部署与软件链分层；关键关系回指真实文件和行号。模块图是经源码核对的教学图，不冒称由 CodeWiki AST 引擎自动生成。

**运行成本与局限。** 依赖 LLM API、支持的订阅 CLI 或 MCP 模型环境，并需要 Python 3.12+、Git、安装时的 Node.js/npm。未运行其依赖分析或增量生成；后续自动化 RTL 图仍需专用 HDL 解析和 elaboration。

核查依据：[LICENSE（核查提交）](https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/LICENSE)、[GitHub 元数据](https://api.github.com/repos/FSoft-AI4Code/CodeWiki)、[codewiki/src/be/dependency_analyzer/utils/patterns.py](https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/codewiki/src/be/dependency_analyzer/utils/patterns.py)、[guides/development.md](https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/guides/development.md)。

### 4. GitDiagram

**官方能力。** 为 GitHub 仓库生成可点击的架构图，将组件链接到文件/目录；当前 README 也提供 Mermaid 导出、远程 MCP 与解说视频功能。 [官方 README](https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/README.md)。

**对 NaplesPU 的适用性。** 很适合参考交互模块地图和“点击节点看源码”的学习体验。仓库概览图无法自动证明 RTL 的实际实例连接、缓存协议正确性或任何周期级行为。

**本网站实际采用。** 本网站自己实现模块点击、关联说明与源码跳转；图示内容来自已收录源码和官方文档，没有调用 GitDiagram 在线生成或 MCP 服务。

**运行成本与局限。** 本地完整运行按当前 README 需要 Bun、Cloudflare R2、Upstash Redis，以及 OpenAI 或 OpenRouter API key；视频还有额外服务配置。本网站没有部署这些依赖，也没有使用其视频生成。

核查依据：[LICENSE（核查提交）](https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/LICENSE)、[GitHub 元数据](https://api.github.com/repos/ahmedkhaleel2004/gitdiagram)、[docs/architecture.md](https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/docs/architecture.md)、[docs/dev-setup.md](https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/docs/dev-setup.md)。

### 5. Repomix

**官方能力。** 把仓库打包为带目录结构的 AI 可读上下文，支持筛选、token 统计、行号与可选 Tree-sitter 结构压缩；打包本身不要求 LLM。 [官方 README](https://github.com/yamadashy/repomix/blob/fe02ab760f14cc2b22123597cb46b37fc52144e7/README.md)。

**对 NaplesPU 的适用性。** 适合借鉴分层索引、按需读文件和保留路径的上下文整理。核对语言配置，当前压缩注册表未列 SystemVerilog/Verilog/VHDL；原文打包与 HDL 语义理解是不同能力。

**本网站实际采用。** 使用本地 Python 按原始 manifest 生成 54,961 文件索引和 340 个精选完整文本；保留路径、大小、Git mode 和校验依据。没有调用 Repomix，也没有复制或运行其压缩器。

**运行成本与局限。** 把全部 LLVM 源码一次性塞入模型上下文并不实用。本网站只为关键 RTL/目标后端/示例嵌入全文，其余完整索引可按需加载；源码行号来自未压缩文本。

核查依据：[LICENSE（核查提交）](https://github.com/yamadashy/repomix/blob/fe02ab760f14cc2b22123597cb46b37fc52144e7/LICENSE)、[GitHub 元数据](https://api.github.com/repos/yamadashy/repomix)、[src/core/treeSitter/languageConfig.ts](https://github.com/yamadashy/repomix/blob/fe02ab760f14cc2b22123597cb46b37fc52144e7/src/core/treeSitter/languageConfig.ts)。

## 为什么没有把通用软件调用图直接当作 RTL 架构

SystemVerilog 的 `module` 实例、参数、宏与 generate 条件决定硬件实例结构；软件工具常分析的函数调用或 import 关系不能直接给出 elaboration 后的端口连接。时钟、reset、valid/ready、缓存事务、虚拟通道和跨流水级状态也不能只靠目录树判断。因此，NaplesPU 的教学图依据模块定义、顶层实例与协议实现解释，并回指行号；涉及逐周期时序、吞吐或协议正确性的结论仍需要相应 HDL 工具与验证。本次没有运行这类验证。

PocketFlow 的默认 include 模式没有 HDL 后缀，还会排除示例和 misc；CodeWiki 当前默认扩展映射没有 `.sv/.v/.vhdl`；Repomix 当前压缩语言注册表也未列这些 HDL。以上是检查指定提交配置得到的有限结论，不等于断言它们永远无法扩展支持 RTL。对 DeepWiki-Open 与 GitDiagram，没有找到已核实的 HDL elaboration 保证，因此不据其“支持任意仓库”的产品描述推导这种能力。

## 本网站可复查的方法

1. 先固定证据：以 source/manifest.json 的精确提交、Git blob 和原始路径为依据；当前分支与历史配对版本明确区分。
2. 先抽象再深入：按系统、处理器核、存储一致性、网络、部署及编译工具链形成课程层次，再用真实文件说明它们如何连接。
3. 全量索引，关键正文离线可读：所有 54,961 个文件可检索，340 个关键 UTF-8 源文件内嵌全文；符号链接保留目标字符串，二进制不伪装成代码。
4. 图与代码联动：模块图、教学步骤和引用可跳到源码行；图中教学关系需由源码证实，静态图不替代 HDL elaboration 或仿真。
5. 以问题检验理解：执行路径推演、配置计算、阅读任务和测验帮助读者把概念映射到具体实现。
6. 明确自动化边界：没有运行这些外部引擎，没有搭建向量检索后端；页面搜索为本地索引检索，流程演示为教学模型，不是 cycle-accurate RTL 仿真。
7. 新鲜度可审计：记录核查日、默认分支最近提交和 pushed_at；它们是查询时快照，不使用 star 数或 updated_at 代替代码活跃度。

上述方法是设计与工作流层面的借鉴，不是引入外部实现代码。五个项目的 MIT 许可证已核查；如果后续实际复制、改造或打包其代码，应随相关代码保留各自的原始许可与版权声明。云端模型 API、订阅和托管服务的使用条件不由 MIT 源码许可代替。

## 额外名称辨析与可用性

- **Code2Tutorial**：PocketFlow 项目 GitHub 元数据中的关联主页为 [code2tutorial.com](https://code2tutorial.com/)；本次直接访问返回 404，因此没有把该在线服务作为交付依赖，也没有将它另计为一个已经验证的开源代码仓库。
- **CodeWiki**：本次开源候选明确指 [FSoft-AI4Code/CodeWiki](https://github.com/FSoft-AI4Code/CodeWiki)。Google 的同名 [Code Wiki 产品介绍](https://developers.googleblog.com/en/introducing-code-wiki-accelerating-your-code-understanding/)是另一来源，未据同名关系混用其许可证、功能或维护状态。
- 外部项目声明支持的通用语言数量会变化，README 内徽标与具体语言列表也可能不同。此处以所链接提交中的实际扩展配置和功能说明为核查依据，没有复述未经验证的“全语言覆盖”说法。

仓库 API 核查入口均已放在每个候选的依据中；页面供展示的数据在 [research.js](../content/research.js)。

window.NPU_RESEARCH = {
  "checkedAt": "2026-11-02",
  "scope": "核查官方 GitHub README、LICENSE、元数据及相关实现；只参考方法并由本项目本地实现，未安装或运行这五个外部工具。",
  "tools": [
    {
      "name": "PocketFlow Tutorial / Code2Tutorial",
      "url": "https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge",
      "license": "MIT",
      "description": "把仓库阅读分为获取文件、识别核心抽象、分析关系、安排章节、撰写和合并教程。",
      "fit": "适合设计从整体概念进入具体文件的教学路线；可用于 C/C++ 工具链说明。已核对 main.py：默认包含模式没有 .sv/.v/.vhdl，且默认排除 examples、misc、tests 等目录，直接套用会漏掉 NaplesPU 关键内容。",
      "adopted": "借鉴“抽象→关系→章节”的组织方式，以本地子代理核对源码后编写课程；未安装或运行 PocketFlow 生成器。",
      "limitation": "生成需要配置 LLM 服务，官方也提供 Ollama 路径。默认单文件上限 100,000 bytes，可能漏掉大型实现。Code2Tutorial 是仓库关联主页，不是另一个已验证的开源引擎；本次访问其主页返回 404。",
      "archived": false,
      "lastCommit": "05b24cbbb0fe409c5e23c9791f0342f07524ffdc",
      "commitDate": "2026-05-31T01:26:41Z",
      "pushedAt": "2026-05-31T01:26:41Z",
      "sources": [
        {
          "label": "README（核查提交）",
          "url": "https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/README.md"
        },
        {
          "label": "LICENSE（核查提交）",
          "url": "https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/LICENSE"
        },
        {
          "label": "GitHub 元数据",
          "url": "https://api.github.com/repos/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge"
        },
        {
          "label": "main.py",
          "url": "https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/main.py"
        },
        {
          "label": "flow.py",
          "url": "https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/blob/05b24cbbb0fe409c5e23c9791f0342f07524ffdc/flow.py"
        }
      ]
    },
    {
      "name": "DeepWiki-Open",
      "url": "https://github.com/AsyncFuncAI/deepwiki-open",
      "license": "MIT",
      "description": "从 GitHub、GitLab 或 Bitbucket 代码构建交互 Wiki、图示和源码导览，并支持检索增强问答。当前英文 README 使用 Grok-Wiki 名称。",
      "fit": "可作为模块页面、导航和源码上下文关联的参考。没有据其通用仓库分析能力推定它能够完成 SystemVerilog elaboration、端口连线或时序验证。",
      "adopted": "采用“解释与源码相邻”的页面方式，提供关键词检索和行号定位；本地站点不连接其后端，也不把静态搜索标成 RAG 或在线 AI 问答。",
      "limitation": "官方配置支持云端提供商和 Ollama；模型生成与 embedding 都需要相应服务配置。未部署、未生成 NaplesPU DeepWiki，因此没有其在本项目上的效果或覆盖率结论。",
      "archived": false,
      "lastCommit": "cdd19ca055aff4985eeb52e8515774471b967d26",
      "commitDate": "2026-10-28T15:24:48Z",
      "pushedAt": "2026-10-28T15:24:48Z",
      "sources": [
        {
          "label": "README（核查提交）",
          "url": "https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/README.md"
        },
        {
          "label": "LICENSE（核查提交）",
          "url": "https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/LICENSE"
        },
        {
          "label": "GitHub 元数据",
          "url": "https://api.github.com/repos/AsyncFuncAI/deepwiki-open"
        },
        {
          "label": "README.zh.md",
          "url": "https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/README.zh.md"
        },
        {
          "label": "api/config/generator.json",
          "url": "https://github.com/AsyncFuncAI/deepwiki-open/blob/cdd19ca055aff4985eeb52e8515774471b967d26/api/config/generator.json"
        }
      ]
    },
    {
      "name": "CodeWiki（FSoft-AI4Code）",
      "url": "https://github.com/FSoft-AI4Code/CodeWiki",
      "license": "MIT",
      "description": "从代码依赖图形成模块层次，由代理分层撰写页面和架构图；当前文档还提供构建配置节点与增量更新工作流。",
      "fit": "适合借鉴系统→子系统→模块的拆分。核对默认 patterns.py 后，未见 .sv/.v/.vhdl 的默认包含或语言映射，不能将其当作已具备 RTL 信号级分析的工具。此项目与 Google 的同名 Code Wiki 服务应区分。",
      "adopted": "本地内容按系统、core、存储一致性、NoC、部署与软件链分层；关键关系回指真实文件和行号。模块图是经源码核对的教学图，不冒称由 CodeWiki AST 引擎自动生成。",
      "limitation": "依赖 LLM API、支持的订阅 CLI 或 MCP 模型环境，并需要 Python 3.12+、Git、安装时的 Node.js/npm。未运行其依赖分析或增量生成；后续自动化 RTL 图仍需专用 HDL 解析和 elaboration。",
      "archived": false,
      "lastCommit": "1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d",
      "commitDate": "2026-11-01T09:32:15Z",
      "pushedAt": "2026-11-01T09:32:19Z",
      "sources": [
        {
          "label": "README（核查提交）",
          "url": "https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/README.md"
        },
        {
          "label": "LICENSE（核查提交）",
          "url": "https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/LICENSE"
        },
        {
          "label": "GitHub 元数据",
          "url": "https://api.github.com/repos/FSoft-AI4Code/CodeWiki"
        },
        {
          "label": "codewiki/src/be/dependency_analyzer/utils/patterns.py",
          "url": "https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/codewiki/src/be/dependency_analyzer/utils/patterns.py"
        },
        {
          "label": "guides/development.md",
          "url": "https://github.com/FSoft-AI4Code/CodeWiki/blob/1b4af43d6d20c8dbd758fe1d5f888cc6947ed11d/guides/development.md"
        }
      ]
    },
    {
      "name": "GitDiagram",
      "url": "https://github.com/ahmedkhaleel2004/gitdiagram",
      "license": "MIT",
      "description": "为 GitHub 仓库生成可点击的架构图，将组件链接到文件/目录；当前 README 也提供 Mermaid 导出、远程 MCP 与解说视频功能。",
      "fit": "很适合参考交互模块地图和“点击节点看源码”的学习体验。仓库概览图无法自动证明 RTL 的实际实例连接、缓存协议正确性或任何周期级行为。",
      "adopted": "本网站自己实现模块点击、关联说明与源码跳转；图示内容来自已收录源码和官方文档，没有调用 GitDiagram 在线生成或 MCP 服务。",
      "limitation": "本地完整运行按当前 README 需要 Bun、Cloudflare R2、Upstash Redis，以及 OpenAI 或 OpenRouter API key；视频还有额外服务配置。本网站没有部署这些依赖，也没有使用其视频生成。",
      "archived": false,
      "lastCommit": "7876ab0ca8b5ee46e836235e23c4886d5cdb79ae",
      "commitDate": "2026-10-30T06:51:53Z",
      "pushedAt": "2026-10-30T06:52:07Z",
      "sources": [
        {
          "label": "README（核查提交）",
          "url": "https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/README.md"
        },
        {
          "label": "LICENSE（核查提交）",
          "url": "https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/LICENSE"
        },
        {
          "label": "GitHub 元数据",
          "url": "https://api.github.com/repos/ahmedkhaleel2004/gitdiagram"
        },
        {
          "label": "docs/architecture.md",
          "url": "https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/docs/architecture.md"
        },
        {
          "label": "docs/dev-setup.md",
          "url": "https://github.com/ahmedkhaleel2004/gitdiagram/blob/7876ab0ca8b5ee46e836235e23c4886d5cdb79ae/docs/dev-setup.md"
        }
      ]
    },
    {
      "name": "Repomix",
      "url": "https://github.com/yamadashy/repomix",
      "license": "MIT",
      "description": "把仓库打包为带目录结构的 AI 可读上下文，支持筛选、token 统计、行号与可选 Tree-sitter 结构压缩；打包本身不要求 LLM。",
      "fit": "适合借鉴分层索引、按需读文件和保留路径的上下文整理。核对语言配置，当前压缩注册表未列 SystemVerilog/Verilog/VHDL；原文打包与 HDL 语义理解是不同能力。",
      "adopted": "使用本地 Python 按原始 manifest 生成 54,961 文件索引和 340 个精选完整文本；保留路径、大小、Git mode 和校验依据。没有调用 Repomix，也没有复制或运行其压缩器。",
      "limitation": "把全部 LLVM 源码一次性塞入模型上下文并不实用。本网站只为关键 RTL/目标后端/示例嵌入全文，其余完整索引可按需加载；源码行号来自未压缩文本。",
      "archived": false,
      "lastCommit": "fe02ab760f14cc2b22123597cb46b37fc52144e7",
      "commitDate": "2026-11-01T15:33:19Z",
      "pushedAt": "2026-11-01T16:12:32Z",
      "sources": [
        {
          "label": "README（核查提交）",
          "url": "https://github.com/yamadashy/repomix/blob/fe02ab760f14cc2b22123597cb46b37fc52144e7/README.md"
        },
        {
          "label": "LICENSE（核查提交）",
          "url": "https://github.com/yamadashy/repomix/blob/fe02ab760f14cc2b22123597cb46b37fc52144e7/LICENSE"
        },
        {
          "label": "GitHub 元数据",
          "url": "https://api.github.com/repos/yamadashy/repomix"
        },
        {
          "label": "src/core/treeSitter/languageConfig.ts",
          "url": "https://github.com/yamadashy/repomix/blob/fe02ab760f14cc2b22123597cb46b37fc52144e7/src/core/treeSitter/languageConfig.ts"
        }
      ]
    }
  ],
  "methodology": [
    "先固定证据：以 source/manifest.json 的精确提交、Git blob 和原始路径为依据；当前分支与历史配对版本明确区分。",
    "先抽象再深入：按系统、处理器核、存储一致性、网络、部署及编译工具链形成课程层次，再用真实文件说明它们如何连接。",
    "全量索引，关键正文离线可读：所有 54,961 个文件可检索，340 个关键 UTF-8 源文件内嵌全文；符号链接保留目标字符串，二进制不伪装成代码。",
    "图与代码联动：模块图、教学步骤和引用可跳到源码行；图中教学关系需由源码证实，静态图不替代 HDL elaboration 或仿真。",
    "以问题检验理解：执行路径推演、配置计算、阅读任务和测验帮助读者把概念映射到具体实现。",
    "明确自动化边界：没有运行这些外部引擎，没有搭建向量检索后端；页面搜索为本地索引检索，流程演示为教学模型，不是 cycle-accurate RTL 仿真。",
    "新鲜度可审计：记录核查日、默认分支最近提交和 pushed_at；它们是查询时快照，不使用 star 数或 updated_at 代替代码活跃度。"
  ]
};

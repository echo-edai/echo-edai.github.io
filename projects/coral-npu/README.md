# Coral NPU 交互源码手册

中文长篇教程、三级架构地图、八种微架构实验、目录与符号源码浏览、80个术语、自测、浏览器学习记录，以及独立可运行的教学 RTL。

## 本地打开

在工作区根目录执行：

```sh
python3 -m http.server 8766 --directory web
```

浏览器访问 `http://127.0.0.1:8766/coralnpu/`。需要通过 HTTP 打开，直接双击 HTML 的 `file://` 方式会限制 JSON/源码加载。前端无构建工具、CDN、外部字体、账号或模型 API 依赖；笔记只存本浏览器，可导出 Markdown。

## 内容与范围

- 12章硬件与9章软件，共95节；每节包含源码位置、实现建议、错误点或练习。
- 实际自动分析索引：6,027个文件元数据、1,408份文本源码、5,735个符号、886条语法引用。大型生成模型测试保留元数据与固定提交链接，未将整个 LLVM/IREE 复制进站点。
- 已实际执行 pyslang、tree-sitter、Python AST；Verilator 只对上游 RstSync / ClockGate 进行了小范围展开。覆盖、诊断与重现方法见 [tooling.md](research/tooling.md)。
- 借鉴 CodeWiki 的分层图谱和 PocketFlow 的核心抽象教学顺序；未运行它们的 LLM 文档生成流程。课程经三个 subagent 分工阅读与交叉核查。
- AI 概念配图的提示词与核查见 [image-generation.md](research/image-generation.md)；SVG 技术图和状态实验由代码实现。

硬件基线 `f79522157fc0f1d7311f44e209fc36c9c8b7a039`，编译器 `d715556c3853719e414182c0bf5f4a10f248f1d9`。编译器自己的硬件 pin 和模拟器补丁构成另一份版本契约，页面专门解释，不能把任意两个仓库 HEAD 当作已验证匹配的组合。

课程区分**源码事实、缩小的教学模型、系统扩展**。Coral 当前被核查的本地 Fabric / TCM / LSU snooping 不表示它内含 coherent NoC 或按缓存行维护 owner/sharers 的 directory_controller。NoC 和目录是明确标记的扩展课程。Bank 教学使用 word-interleaving，而 BankedDtcm 默认按地址区间译码；不将两者混为一个实现。

## 验证与练习

从本目录执行：

```sh
python3 tools/validate_content.py
python3 tools/validate_source_index.py
node tools/test_learning_models.cjs
python3 tools/test_learning_rtl.py
node tools/crosscheck_learning_models.cjs
node tools/test_coral_models.cjs
```

RTL 测试需要 Icarus Verilog（`iverilog` / `vvp`），验证范围仅为独立 FIFO、8寄存器 Scoreboard、两客户端单行目录与其 JavaScript 状态模型，详见 [rtl/README.md](rtl/README.md)。其结果不构成上游全核仿真、形式验证、综合、PPA或模型性能复现。

`downloads/microarchitecture-starter.zip` 包含可独立运行的三个教学模块、参考模型、定向测试和逐周期对照工具。课程中的八个全栈练习是留给学习者执行的任务，未标成已运行结果。

实际结果和浏览器检查见 [verification.md](research/verification.md)。

## 同步到公开门户

在工作区根目录：

```sh
python3 web/coralnpu/tools/publish_to_portal.py
python3 public-web/scripts/build.py
python3 -m http.server 4173 --directory public-web/_site
```

公开路径为 `projects/coral-npu/`。同步脚本复制本站的显式文件集合、更新门户卡片和动态，保留其他项目；不复制 Python 环境、工具临时目录、Git 元数据或工作区其他内容，也不执行 Git push 或远程发布。

## 文件组织

`index.html / style.css / app.js` 为展示；`content/` 为章节；`data/source-index.json` 为语法索引；`data/sources/` 为原始文本；`data/analysis/` 为分析证据；`models.js / logic-models.js` 为教学模型；`rtl/` 为独立教学 RTL；`research/` 为核查与测试记录；`tools/` 为可复现分析、测试与发布脚本。

上游原文与源码保持原始版权和逐文件适用的许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本站是独立学习资料，不是 Google 官方文档。

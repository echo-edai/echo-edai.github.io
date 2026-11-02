# openTPU 自动分析与教学方法

核查日期：2026-11-02。源码固定为 FeSens/openTPU `91df41092f612361c5bc22f83b31d23382ffabb0`。

## 本次实际运行的开源软件

1. **Repomix 1.18.1**。从官方 npm 获取，随后离线运行 CLI。本地打包 71 个核心文件，581,386 tokens、1,683,916 characters；显式包含 `rtl/**/*.sv`、核心 Python、kernels、targets、ISA 与 compiler 文档，排除 `rtl/exp/**`。安全扫描未发现可疑文件。完整结果留在开发目录 `research/repomix-context.md`。这是上下文打包，不是模型生成教程，更不是硬件关系解析。
2. **Verilator 5.048**。实际运行 `--json-only --top-module otpu_top`。源码列表静态读取 `opentpu/rtlsim.py` 的 `RTL_SOURCES`，没有执行上游 Python。两组配置分别为默认仿真参数与 target 中可传入 top 的 YPCB m4 参数。默认得到 118 个专化 module/package、883 个 cell；m4 参数得到 129 个、1,569 个 cell。网页直接使用提取数据，不用文件名猜实例关系。
3. **Python 标准库 ast**。对全部 Python 文本抽取 class/function/import；SystemVerilog module/package 的文件索引用词法扫描补充，实例关系来自 Verilator。路径索引共 856 文件，846 份 UTF-8 原文按需加载，6,425 个类/函数/模块声明，4,229 个 import 节点。import 节点不是已解析的动态调用图。
4. **Icarus Verilog 13.0**。实际编译与仿真本站四个原创教学模块；Node.js 数学/契约检查与 RTL 对照记录见 `rtl-validation.json`、`model-crosscheck.json`。这部分不构成完整 openTPU 验证。

官方能力依据：[Repomix CLI](https://repomix.com/guide/command-line-options)、[Repomix 源码](https://github.com/yamadashy/repomix)、[Verilator 参数](https://verilator.org/guide/latest/exe_verilator.html)、[Python ast](https://docs.python.org/3/library/ast.html)。

## 为什么不直接让通用 Wiki 生成器吞掉仓库

[PocketFlow Tutorial](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge) 的“文件→抽象→关系→章节”适合组织教学，本次实际采用这一顺序，但没有运行它的 LLM 生成器。没有部署 DeepWiki、CodeWiki 或远程 RAG 服务，也没有把源码上传给这些服务。

HDL 的 generate、参数特化、宏、package、端口与时钟语义需要专用前端。Repomix 的结构压缩不能作为 SystemVerilog elaboration 的替代；因此保留注释和原文，不开启压缩。大上下文仍需按模块选择阅读，并交叉核对源码，打包成功不表示每行都已经理解。

## 可复现命令

在工作区根目录：

```sh
python3 web/opentpu/tools/analyze.py --elaborate
python3 web/opentpu/tools/validate.py
python3 web/opentpu/rtl/run.py
node web/opentpu/tools/check_models.cjs
python3 web/opentpu/tools/crosscheck_models.py
```

Repomix 可在安装相同版本后运行：

```sh
repomix openTPU/hardware/openTPU \
  --include 'rtl/**/*.sv,opentpu/*.py,opentpu/kernels/*.py,targets/*.toml,docs/isa.md,docs/compiler.md,LICENSE' \
  --ignore 'rtl/exp/**' --no-git-sort-by-changes \
  --output-show-line-numbers --style markdown \
  --output web/opentpu/research/repomix-context.md
```

## 解析范围与警告

两套 Verilator 结果均使用 **otpu_top、通用器件与 AXI=0 行为 DRAM**。m4 参数配置并不等于解析了真实 FPGA shell、DDR 控制器、DSP48 物理绑定或 PCIe。默认配置有 51 条 width expand/trunc 警告，m4 配置有 54 条，使用 `-Wno-fatal` 后完成解析；不能称作零警告 lint 通过。完整 AST 与日志仅留开发目录 `research/verilator/`，公开网页使用去除本机路径的精简模块/端口数据。

没有进行完整 openTPU RTL 仿真、综合、时序收敛、FPGA 上板或性能复测。软件代理实际运行的最小 ISA/JIT 检查单独记录在 `software-review.md`。教学图是逻辑功能分组；只有下方实例浏览器称为 elaboration 输出。

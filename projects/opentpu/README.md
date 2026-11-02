# openTPU · 从张量到电路

中文长篇交互源码手册，基于 `FeSens/openTPU` 固定提交 `91df41092f612361c5bc22f83b31d23382ffabb0`。

## 打开网页

在工作区根目录运行：

```sh
python3 -m http.server 8876 --bind 127.0.0.1 --directory web/opentpu
```

访问 <http://127.0.0.1:8876/>。也可直接打开 `index.html`：静态 JS 分块不依赖 fetch，课程与源码可离线阅读。网页无第三方运行时、CDN、字体服务或服务器端问答接口。

## 内容

- 28 章、141 小节：12 章真实硬件、8 章软件与 ISA、8 章微架构扩展；70 个概念、20 道自测。
- 3 张交互逻辑地图、26 个可追源码的职责节点、4 条执行旅程。
- 7 个实验：矩阵部分和与行组、量化误差、寄存器依赖、bank 冲突、FIFO 背压、XY 路由、两核单行目录权限。
- 全部 856 个上游文件索引，846 个 UTF-8 文本按原始字节离线内嵌。大源码按需加载，支持符号、行号、全文查找、分页和下载。二进制文件链接到固定上游。
- Verilator 两套真实解析结果，专化实例、参数与端口浏览；Repomix 实际运行记录。
- 内置 image_gen 技能制作的两张教学图，保留提示词、核验与修订原因。
- 4 个原创教学 RTL、testbench、随机模型对照、可下载练习包；阅读进度、笔记与导出均仅存本地。

## 重要范围

openTPU 没有此课展示的 Mesh NoC、通用 coherent cache 或 directory controller；这些属于明确标注的扩展实现教学。KV cache 是模型数据，TMEM 读口副本是同一逻辑存储的实现，都不能混为缓存一致性。

当前 m4 target 启用 WAITC、TMEM_IMPL=3 单副本/子 bank/重放/2×时钟、ACT_ROWS=16、MCOLS=4；YPCB 默认 BAR-only。课程将 target、仿真默认和实验代码分开。不要用模块默认值解释所有板卡。

数学实验不等于周期精确 RTL；独立教学 RTL 不能替换上游模块。完整 openTPU 未做综合、时序或上板验证，详见 `research/`。

## 验证与更新

```sh
python3 web/opentpu/tools/analyze.py --elaborate
python3 web/opentpu/tools/validate.py
python3 web/opentpu/rtl/run.py
node web/opentpu/tools/check_models.cjs
python3 web/opentpu/tools/crosscheck_models.py
python3 web/opentpu/tools/integrate.py
python3 public-web/scripts/build.py
```

分析需要 Verilator；教学 RTL 需要 Icarus；其余只用 Python 与 Node。上游源码未修改。`analyze.py` 不执行上游 build 脚本。

`tools/integrate.py` 仅同步此站到 `public-web/projects/opentpu/`，更新门户中本项目卡片与动态，保留其他项目。原始 AST、工具缓存、个人路径和截图不进入公开站。合并后用 `public-web/scripts/build.py` 检查生成网站的所有本地链接；这一步不提交、不推送远程。

## 文件与许可

`index.html` / `style.css` / `app.js` 为网站，`models.js` 为交互模型，`content/` 为课程，`data/` 为索引、原始源码与精简 elaboration 数据，`rtl/` 为原创教学模块，`research/` 为证据，`tools/` 为可复现脚本。

原始源码、文档保留上游 Apache-2.0 许可及各文件自身声明，见 `UPSTREAM-LICENSE`。原创教学 RTL/模型按 MIT 许可，见 `rtl/LICENSE`。图片为内置 image_gen 生成，具体提示词与边界见 `research/diagram-audit.md`。

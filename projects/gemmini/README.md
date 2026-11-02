# Gemmini 交互架构教材

从 RoCC 命令读到 PE 的中文源码学习站。**22章、90节、40个概念、20道自测、6个实验**，包含架构地图、三条命令追踪、完整归档路径索引和573份源码全文。

## 打开

在工作区根目录运行：

```sh
python3 web/serve.py
```

访问 **http://127.0.0.1:8765/gemmini/**。也可直接打开 [index.html](index.html)，课程、内嵌代码、实验和笔记均不依赖网络。对未内嵌依赖，源码窗口提供固定提交的 GitHub 链接。

独立部署时，在本目录运行 `python3 -m http.server 8765 --bind 127.0.0.1`，访问该服务器根路径。静态站不调用模型 API、没有 CDN、没有分析追踪或服务器数据库；学习笔记仅存于当前浏览器，可导出备份。

## 怎样开始

1. 在架构工作台选择 Controller，跟到 LoopMatmul 和 ReservationStation。
2. 在命令追踪切换 mvin / GEMM / mvout，打开每一步的源文件。
3. 运行理想 OS / WS 推演，解释何时两个操作数相遇、什么数据驻留。
4. 用依赖、Bank、XY 路由和目录事务实验检查自己的预测。
5. 按课程学习真实实现，然后下载 [教学 RTL 练习包](downloads/gemmini-learning-starter.zip)，从小状态机开始写。

## 内容与来源

| 产物 | 用途 |
| --- | --- |
| [content/hardware.js](content/hardware.js) | 硬件10章40节、25模块、3数据流 |
| [content/software.js](content/software.js) | 软件6章26节、API/ABI、分块、量化、驱动、自测 |
| [content/concepts.js](content/concepts.js) | 微架构6章24节、40概念、从零实现路线 |
| [data/source-index.js](data/source-index.js) | 47仓库、33,531文件路径，517个Scala声明、177处候选实例 |
| [data/source-code.js](data/source-code.js) | 573份完整原文，SHA256与归档内容核验 |
| [models.js](models.js) | 独立教学算法及明确简化条件 |
| [rtl/README.md](rtl/README.md) | 独立RTL接口契约、运行与修改练习 |
| [research/tools-research.md](research/tools-research.md) | 开源自动分析工具研究与本次实际使用记录 |
| [research/image-generation.md](research/image-generation.md) | 图片最终提示词、保存路径与审查 |
| [verification.json](verification.json) | 数据、引用、源文件哈希与结构检查 |
| [research/model-tests.json](research/model-tests.json) | 教学算法有界检查 |
| [research/browser-validation.md](research/browser-validation.md) | 真实浏览器交互与视觉检查 |

源码基线：Gemmini `8c3f9923a44a2fe2c7930587be297d6d4f8c09ca`，软件测试 `7c540b3adf1b86ad93d07f893abe3a73489b568e`，Chipyard `e02074414158c85059c1dcb231ff2f8941254b9a`。仓库版本映射内嵌在 source-index 中。核心源码保留上游许可和版权，许可证全文在 [data/licenses.js](data/licenses.js)；独立教学RTL采用其目录下的 MIT 许可。

Gemmini 的 Mesh 是脉动计算阵列；主机 NoC、缓存一致性与 directory_controller 属于系统/扩展教学范围，未被冒充为 Gemmini 内部已实现模块。Chisel 词法实例图也不等于展开后的 RTL 层次。

本次实际运行 **Repomix 1.18.1**，定向整理65份硬件文件和69份软件文件，保留原文、行号与工具日志；没有启用可能丢失硬件赋值的结构压缩，没有调用这些项目的线上教程生成服务。三个 subagent 分别读硬件、软件与微架构，再交叉审阅。工具、来源与建议见研究记录。

## 更新与验证

在工作区根目录执行：

```sh
python3 web/gemmini/tools/build_data.py
node web/gemmini/tools/test_models.cjs
python3 web/gemmini/rtl/run.py
node web/gemmini/tools/validate_site.cjs
python3 web/gemmini/tools/publish.py
python3 public-web/scripts/build.py
```

build_data 只读取本地已归档快照，不下载依赖、不运行上游代码。固定版本 Repomix 的本地安装和命令见研究记录；安装缓存不进入公开站点。

教学 RTL 通过1508项有界定向/随机检查；独立浏览器算法通过129,716项断言（含640组矩阵模式用例、35个目录可达状态、256条XY路线等）。两个模型集职责不同，**没有宣称浏览器与RTL逐拍等价**。检查数量不代表覆盖了完整 Gemmini 或真实缓存协议。

本次没有执行完整 Gemmini elaboration、综合、时序、性能实验或上板；还存在未完整归档的额外 Chipyard 平台依赖。教程中的实验方案与实测结果分别标明。

## 公开网站集成

源版本始终保留在 `web/gemmini/`。发布脚本仅把明确列出的静态内容复制到 `public-web/projects/gemmini/`，更新门户卡片和动态；不复制工具安装包、浏览器会话、父目录、原始完整依赖树或Git数据。运行门户构建后，独立页面进入 `_site/projects/gemmini/`，现有笔记保留。

本地目录合并与构建不等于已经推送远程仓库或上线；请以实际 GitHub Actions 发布记录判断线上状态。

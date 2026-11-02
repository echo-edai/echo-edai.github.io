# NaplesPU 交互源码教材

公开入口：https://echo-edai.github.io/projects/naplespu/

25章、119节、44个实现概念；四条共25步实现路线，五个机制推演、三个逐拍状态实验及45道自测。

源码浏览器保留全部54,961个上游文件的索引，340份核心原文内嵌，346份核心/引用源码及适用许可文件随站点提供。其余文件按需从固定提交的公开上游读取；网络不可用时可打开GitHub原文。没有发布完整LLVM依赖树或离线Git bundle。

硬件提交：02a73a6d94d649f368aecbbc2448f287ea8c8e97。
工具链提交：0dc20431b12eccc5e73ad39e004f7dc735762ffa。
硬件原固定工具链：d2ebbc3a6de62848d397728bbcba6527b6773f30，不能自动视为与当前工具链兼容。

网页无第三方运行时。阅读、笔记、自测只保存在访问者浏览器，不上传到服务器。官方Wiki与完整文档通过官方站点访问，未将离线采集档案整体重新发布。

## 教学RTL

下载 [练习包](downloads/microarchitecture-starter.zip)，接口和修改任务见 [说明](rtl/README.md)。这些是独立编写的小原型，不能替换完整NaplesPU。目录原型没有真实数据/地址/NoC，只演示两client单行权限握手。

在本项目目录运行：

    python3 tools/test_learning_rtl.py
    node tools/test_learning_models.cjs
    node tools/crosscheck_learning_models.cjs

需要Icarus Verilog与Node.js。已有30项RTL检查、23项模型检查和三个模型各300周期对照记录，不构成完整NaplesPU仿真或形式证明。

## 更新

本门户仓库与原工作区web/、source/相邻时，运行：

    python3 scripts/integrate_naplespu.py
    python3 scripts/build.py

整合脚本只导出明确列出的NaplesPU文件并更新门户卡片，不推送远端。其他项目保持原样。发布清单见 [publication-manifest.json](research/publication-manifest.json)；上游许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

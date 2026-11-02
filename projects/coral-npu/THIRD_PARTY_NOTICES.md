# 源码与工具说明

站点按需展示公开仓库的原始第一方文本，并保留原始许可证头。原始文件的版权与逐文件适用的许可证不因教程而改变。

- [google-coral/coralnpu](https://github.com/google-coral/coralnpu)：硬件、软件和文档。固定提交见源码索引；[原始 LICENSE](data/sources/hardware/LICENSE)。
- [google-coral/coralnpu-compiler](https://github.com/google-coral/coralnpu-compiler)：编译器、运行时、示例和文档；[原始 LICENSE](data/sources/compiler/LICENSE)。
- [google-coral/coralnpu-mpact](https://github.com/google-coral/coralnpu-mpact)：教程明确引用的一份 ISA 文件；版权与许可头保留在正文，完整仓库许可见其官方仓库。

其他第三方子模块与大规模生成测试未作为源码正文打包；元数据中的固定提交链接供阅读原始来源。公开包不含 LLVM/IREE 子模块或分析工具的 Python 环境。

实际分析工具为 pyslang/slang、tree-sitter、tree-sitter-scala、tree-sitter-cpp、Python AST 和 Verilator。方法、版本与实际执行范围在 [tooling.md](research/tooling.md) 中列出。

[CodeWiki](https://github.com/FSoft-AI4Code/CodeWiki) 与 [PocketFlow Codebase Knowledge](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge) 提供学习资料组织方法参考，未运行其 LLM 生成器，也未复制其生成的教程。

`rtl/learn_*`、离散状态模型和测试是独立教学材料，复用自本工作区先前的学习工坊，不是 Coral 原始 RTL。概念插画经内置图像生成工具生成，不能作为物理布局或精确网表。

# 交互教材验证记录

日期：2026-11-02。范围是本教材、导出源码、教学原型与本地公开门户构建。

## 已实际执行

| 检查 | 结果 | 能说明什么 |
| --- | --- | --- |
| `validate_content.py` | 21章95节、115处锚点、21代码块，0错误/0警告 | 来源路径、行号、连续摘录及显式教学标记成立 |
| `validate_source_index.py` | 1,408份正文与原仓库逐字节/SHA一致，0失败 | 索引位置、引用端点和源码副本完整 |
| `test_coral_models.cjs` | 20项通过 | 向量、Bank、Tile、地址、全部256组XY路径等有限输入域性质 |
| `test_learning_models.cjs` | 23检查通过 | 三个独立离散状态模型的定向行为 |
| `test_learning_rtl.py` | 30检查通过 | 独立教学 FIFO、Scoreboard、单行目录的定向RTL行为 |
| `crosscheck_learning_models.cjs` | 300周期 × 3模块相符 | 给定种子和有限序列下，教学RTL状态/数据与浏览器模型相符 |
| 练习包独立解压运行 | 12文件，ZIP完整性通过；23检查、30检查、300×3对照均通过 | 下载包不依赖作者的源码文件位置即可运行这三组教学检查 |
| `public-web/scripts/build.py` | 构建成功，本地链接/锚点通过 | 展示可在现有门户的 `projects/coral-npu/` 相对路径下构建 |

测试报告为同目录 `content-validation.json`、`learning-rtl-verification.json`、`learning-model-crosscheck.json` 及 `data/analysis/source-index-validation.json`。端到端的学术或硬件正确性不是这些静态/有限检查可以自动证明的结论。

## 浏览器检查

使用实际浏览器打开本地公开构建，通过界面操作验证：

- 门户卡片可进入项目，品牌链接可返回门户；公开路径下加载21章95节、80个术语及全部索引。
- 三级架构切换；PE内部累加入口打开 `zvt_pe_block.sv:254`，源码窗口显示该行高亮。
- 八个实验均可切换，无重复DOM id、无浏览器错误日志。矩阵输入后立即更新预算不足提示；向量掩码切换可见；Scoreboard 的 RAW 阻塞、Bank同体访问排队均可观察。
- NoC单token在背压时保留当前位置；目录先发送探针、等待正确目标ACK，再更新共享权限并准备响应。
- 软件筛选显示9章；章节关键词与全局 `zvt_ctrl` 搜索有对应结果；自测选择后显示解释。
- 目录导航可进入 Chisel 模块区；Core文件接口/参数面板正常展开，不覆盖后续页面；源码列表、行号与固定提交上游链接可读。
- 已读标记更新计数；笔记刷新后保留；测试结束恢复测试前的笔记和已读状态。
- 390×844手机视口无整页横向溢出；导航抽屉可操作，矩阵输入与实验切换可用。技术图在窄屏内部横向滚动；恢复默认桌面视口后再次检查。

截图：[窄屏首页](screenshots/overview.jpg)、[手机首页](screenshots/mobile.jpg)、[矩阵架构交互](screenshots/architecture.jpg)。截图只是可见界面的证据，不替代模型或RTL验证。

## 修正与范围

交叉核查修正了旧VRF入口、未找到当前实例的 `zvt_acc` 映射、矩阵重复DOM id、向量未激活元素措辞、整数输入、源码面板高度和定位。课程明确区分基础256-bit参数与目标128-bit覆盖、CoreAxi与独立BankedDtcm、LSU内部响应复用与多核一致性、顶层退休与RVV ROB。

上游仅对 RstSync / ClockGate 运行了小范围 Verilator 展开。没有运行整个 Coral NPU 的 Chisel/RTL全核构建、全核仿真、综合、形式验证、PPA测量、FPGA上板或整模型性能复现。NoC和目录教学不表示上游IP已包含相同模块。

公开门户集成只写入本地 `public-web/`。此任务没有执行 Git commit、Git push 或远程部署；外部站点的线上状态不由本记录声明。

# 整合复审与修正

三个subagent分别负责硬件、软件、微架构；完成后再次交叉审阅主页面、算法与引用。

已修正：

- 系统图不再绕过ExecuteController直接把Scratchpad连到阵列；长边绕开SRAM节点，避免视觉上错误串接。
- LD/ST各有DMACommandTracker，Store不误指向读DMA的XactTracker；结构包含、控制与数据的线型分开。
- 学习路线显示章节标题并链接真实第一站；课程的自测选项轮换只做一次。
- xcustom.h引用使用其自己的rocc-software固定提交与内嵌原文，避免跨Git子模块产生失效链接。
- 目录面板标明旧稳定权限与瞬态边界；ACK/数据按钮只代表当前事务有效响应，没有事务ID或跨事务迟到响应防护。
- 源码浏览器保留未内嵌文件的请求行号；能切到已包含该节点的架构视图。
- 门户特色卡片支持项目独立图片，Gemmini不再套用NaplesPU配图；本次修改资源带版本参数以刷新旧脚本缓存。

源码引用509处全部可在573份内嵌原文中定位；字节SHA256校验通过。主仓库与软件/Chipyard/RoCC固定工作树保持清洁。

详细硬件交叉核验见cross-review-hardware.md；微架构状态枚举与主代理保存的正式模型检查见model-tests.json；网页检查见browser-validation.json。

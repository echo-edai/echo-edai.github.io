# 图片生成与核查

日期：2026-11-02。使用 `imagegen` 技能和内置 `image_gen` 工具，未使用需要 API key 的 CLI 回退。

最终网页素材：[assets/silicon-landscape.png](../assets/silicon-landscape.png)。从工具默认 generated_images 输出复制到本项目，网站不依赖默认输出路径。原图1672×941，约1.82MiB。

本图仅作为首屏概念导览：控制区、存储Bank、规则计算格与累加区形成视觉入口。没有文字标签，不把格子数量、端口、线宽或几何位置当作当前defaultConfig事实，也不是物理floorplan。生成图存在抽象连线和简化，不能用它推导真实端口。所有精确关系由可修改的SVG架构图、交互模型和固定源码解释。

审查结果：规则邻接网格、存储分块、独立加法器/累加区域可识别；没有packet router或directory标签，没有不正确的参数文字。网页明确标注AI概念插画与非版图。架构图的Scratchpad/Array输入输出额外核对ExecuteController，避免从插画误推直接端口。

最终提示词原文：

```text
Use case: scientific-educational
Asset type: wide illustrated opening plate for an in-depth Chinese Gemmini architecture learning website; no textual labels (HTML will supply accurate labels).
Primary request: a precise, elegant conceptual cutaway of a systolic matrix accelerator as a silicon architectural landscape. A neat 8 by 8 lattice of tiny compute cells at center-right, luminous activation streams moving horizontally and partial-sum streams vertically through neighboring cells, banked SRAM slabs at lower-left, a distinct accumulator memory with small adder circuits at lower-right, a command queue/control stack at upper-left, the host CPU and external memory separated outside a thin accelerator boundary. Show only conceptual geometric connections, no packet routers, no cache-directory hardware inside accelerator, no claim of physical floorplan.
Style/medium: detailed technical isometric illustration, matte graphite surfaces, fine copper circuit traces, restrained luminous mint and warm amber signals, architectural drawing meets high-end silicon editorial illustration. Deep navy-black background matching #0c1417. Wide landscape composition about 16:9 with generous dark negative space on left/top for webpage type. High visual clarity, rigorously repeated grid cells, clean carved memory banks, sophisticated lighting, no decorative floating sci-fi objects.
Constraints: no text, no letters, no logos, no watermarks, no realistic foundry die claims. This is a conceptual learning illustration; authoritative connection diagrams will be separate code-native SVG.
```

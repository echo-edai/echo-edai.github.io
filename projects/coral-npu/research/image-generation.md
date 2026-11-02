# 概念配图的生成与核查

日期：2026-11-02。使用 `imagegen` 技能和内置 `image_gen.imagegen` 工具生成一次，未使用 CLI、Python 绘图或第三方图片素材。

最终资产：[coral-concept.png](../assets/coral-concept.png)。它是教学概念插画，不是真实晶片照片、物理布局、精确层次图或性能证据。模块尺寸、位置和连线具有艺术表达；源码支持的职责和实际配置在可交互架构图、课程和固定提交引用中解释。

视觉核查：有 Scalar frontend、RVV vector engine、Zvt matrix engine、TCM、AXI 标签；无 Mesh NoC、缓存目录、缓存一致性、性能数字或厂商标识。Zvt 的可选性和 RVV 依赖由正文说明，图片本身不能表示所有构建目标都包含它。

完整英文提示词：

```text
Use case: scientific-educational. Asset type: a wide 16:9 hero illustration for a rigorous Chinese interactive textbook about Google's open-source Coral NPU. Primary request: a beautifully crafted architectural study model, a tactile isometric cutaway of a small neural processor, on warm ivory drafting paper, with fine graphite engineering lines, subtle mint/coral-orange accents and brass-like connectors. Show five clearly separated conceptual regions, with restrained exact English labels: 'Scalar frontend', 'RVV vector engine', 'Zvt matrix engine', 'TCM', 'AXI'. The scalar frontend issues to vector execution; the optional Zvt engine is visually nested beside/within the vector backend; instruction/data TCM blocks connect through a small local interconnect crossbar, and an AXI connector sits at the outer edge. The vector and matrix blocks are made of readable repeated compute cells and register strips, memory looks like dense orderly banks. This is an educational conceptual model, not a physical die photograph or measured floorplan. No mesh NoC, no directory controller, no cache coherence blocks, no vendor logos, no performance numbers, no fabricated transistor details. Composition: most of the model in the right two thirds, generous uncluttered left space and cream margin. Soft studio daylight, delicate shadows, editorial textbook precision, clear hierarchy, sophisticated and calm. No extra labels or tiny unreadable text.
```

精确架构与状态图由 HTML/CSS/SVG 和纯 JavaScript 实现，可以交互、搜索、选择源码，不依赖图片中的细节来推断 RTL。

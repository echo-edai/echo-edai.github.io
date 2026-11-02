# 教学图片：提示词与核验

使用内置 `image_gen`，按 imagegen 技能执行；原图生成后保存到网站 assets/。没有使用 CLI/API fallback。

## 源码依据与阅读范围

- `rtl/top/otpu_slice.sv`：IMEM/seq、DMA、MXU、QUANT、VPU、TMEM、ACT 与 collective 接口。
- `rtl/mxu/otpu_mxu.sv:17–44`：systolic、分组 replay 与 FIFO 整行保留；跨 chunk 更宽整数和与 epilogue。
- `targets/ypcb-00338.toml`：当前 m4 D=128、MCOLS=4、ACT_ROWS=16、LANES=8。
- `boards/ypcb-00338/vivado/create_project.tcl:48`：S=1 生产默认 BAR-only。

第一张是功能分组图，ACT RAM 实际在 slice 中独立实例。QACT/QST 读 TMEM、输出 ACT/DRAM；图省略 A scale、SW、MXU ACC/ASCALE 反读与全部仲裁。不是实例层次或物理 floorplan。第二张的 4×4 PE 只作示意，不能推导真实D128的结构或吞吐；默认绘 INT8 路径，不涵盖全部4-bit格式。

## 已检查与修订

已目视检查英文标签、参数与主要连接。第一版 QUANT↔TMEM 双向箭头错误，已生成并目视确认单向 TMEM→QUANT 的最终修订。矩阵初版“INT32 accumulator”容易把块内与跨chunk累计混淆，最终改为“INTEGER SUMS / wide across chunks”。网站同时用可修订的代码原生图与源码说明补足生成图的抽象范围。

## originalArchitecture

```text
Use case: scientific-educational. Asset type: wide technical plate for a Chinese educational website about the openTPU source project (FeSens/openTPU). Create a precise, polished architecture illustration on near-black charcoal paper with thin mint green, pale blue and warm amber vector-like circuit diagrams, clear cream typography, subtle paper texture, restrained technical editorial style. Wide landscape 3:2. No decorative photoreal chip or fabricated blocks.
Exact main title: "openTPU / ONE SLICE". Subtitle: "Explicit memory. Concurrent engines."
Central framed diagram titled "otpu_slice": top row "IMEM" arrow to "SEQUENCER / WIN + WAITC", dotted control fanout to five separately boxed engines "DMA", "MXU", "QUANT", "VPU", "COLLECTIVE PORT". Below these draw one wide memory bar "TMEM / FP32 / software managed", with bidirectional data connections to DMA, VPU, QUANT, MXU drain, collective port. Inside MXU area show "ACT RAM / INT8 + scales" arrow into a small systolic array labeled "MXU" then arrow "FP32 epilogue" to TMEM. QUANT reads TMEM and writes ACT RAM. Left outside slice draw "DRAM / weights + tensors" and clearly arrow DRAM weights to MXU and bidirectional DRAM to DMA. Use only simplified topology: do not invent a cache on these paths. At right outside slice "otpu_coll / BAR + GATHER" connected to collective port, caption "multi-slice simulation; S=1 board can be BAR only". A small parameter legend bottom: "YPCB m4 target: D=128 · MCOLS=4 · ACT_ROWS=16 · LANES=8". Footer exact "Source-guided abstraction · Not a physical floorplan". Every label legible, no misspellings. No mesh NoC, no directory coherence, no shared LLC, no CPU pipeline, no claims of measured speed. White space and clear routing, arrows show logical data paths not cycle timing.
```

## architectureCorrection

```text
Edit this openTPU / ONE SLICE technical diagram. Preserve all text, all boxes, colors, layout, details and high-quality typography. Correct only one dataflow connector: the vertical mint arrow currently between TMEM and QUANT is double-headed, which is wrong. Make it single-headed UPWARD from TMEM into QUANT, with NO downward arrowhead into TMEM. QACT/QUANT reads TMEM, does not write TMEM. All other diagram arrows and content remain identical.
```

## originalMatrix

```text
Use case: scientific-educational. Asset type: educational diagram for an openTPU RTL learning website. Wide landscape 3:2, charcoal black paper background, large legible cream labels with mint/amber/blue paths, restrained technical editorial design, precision and whitespace, no decoration.
Title "MATRIX MULTIPLY / FOLLOW THE DATA". Three clear panels.
Panel 01 "PREPARE": a blue rectangular FP32 tensor block labeled "A / TMEM" feeds a box "QUANT", then an amber block "ACT RAM / INT8 + scales". Separately a tall weight block "W / DRAM". Annotation "activation quantization is explicit".
Panel 02 "COMPUTE": use a simplified four-column array made of 4 by 4 small PE squares with arrows, activation source from left and weight stream from above. Label "MXU / systolic abstraction", annotate "D=128 · MCOLS=4", "ACT_ROWS=16: replay row groups". This is an explanatory diagram not a literal 128-element physical floorplan. Make this scope explicit below array "drawn array is illustrative". Put an INT32 accumulator box after the array.
Panel 03 "EPILOGUE": INT32 sums through box "scales + optional accumulate" to blue FP32 output "C / TMEM". Formula large and exact "C[M,N] = A[M,K] × W[N,K]ᵀ". Under formula "K blocked by D; M replayed by MCOLS". Footer "Functional dataflow · no cycle-accurate timing claim". Avoid suggesting FP32 matrix multipliers, CPU caches, coherence or a mesh interconnect. All labels exact. Keep matrix formula legible and layout not busy.
```

## matrixCorrection

```text
Edit the most recent MATRIX MULTIPLY / FOLLOW THE DATA diagram. Preserve all layout, colors, arrows, exact existing labels and formula, and quality. Correct ONLY the amber result box at right of the array: replace "INT32 accumulator" with three short readable lines "INTEGER SUMS" / "wide across" / "chunks". This avoids implying that the full openTPU K accumulation has only 32 bits. All other elements must remain unchanged.
```

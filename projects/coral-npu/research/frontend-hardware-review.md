# 前端硬件映射审阅与精确修复建议

审阅基线：硬件提交 `f79522157fc0f1d7311f44e209fc36c9c8b7a039`，当前 `web/coralnpu/app.js`、`models.js`、`logic-models.js`。本次只写此报告，没有修改应用或 JSON。

手写 `modules`、`trace`、实验源码入口的字面路径均在磁盘与 `data/source-index.json` 中找到。主要风险不是文件不存在，而是把存在但未接入当前核的文件当成当前实例。以下按修复优先级列问题。

## P1：矩阵图把未找到实例的 zvt_acc 当成当前独立累加模块

位置：`app.js:43` 的 `modules.accumulator`，以及 `app.js:48` 的 matrix 图 `tile→accumulator` 连线。

`hdl/verilog/rvv/design/Zvt/zvt_acc.sv` 文件真实存在，但当前完整硬件仓库检索只找到模块定义和 overview 文档提及，未找到它被其他模块实例化；其引用的 `NUM_ACC` 定义与 `zvt_acc_reg` 模块实现也未在本仓库找到。这不是证明所有外部集成都绝不使用它，而是当前页面不能把它当成已经连接的 Coral 计算路径。`doc/overview.md:87` 的描述也不足以替代实例关系证据。

当前可直接核查的累加路径是：

- `Zvt/zvt.sv:214` 实例化 `zvt_pe_array`，`:517` 实例化 `zvt_mt`。
- `Zvt/zvt_pe_block.sv:254–287` 从 MT 读取并重排已有累加值。
- `Zvt/zvt_pe_block.sv:302–323` 的 `zvt_pe_adder` 将 MT 操作数与 `mulbulkCmd.res` 相加。
- `Zvt/zvt_pe_block.sv:385–399` 生成 MT tile/subtile 地址、byte enables 与写回数据。

精确建议：保留“矩阵累加”这个概念入口，但将 `path` 改为 `zvt+'zvt_pe_block.sv'`，入口行设为 254 或 302；标签改为“PE 累加路径”，body 改为“PE 从 MT 读取已有累加值，与乘法/归约结果经 adder 相加，再按 subtile 与 byte enable 写回 MT；这不是此目标中已实例化的独立 zvt_acc 存储块”。将图中的 accumulator 方框标成 PE 内部职责，或将它并入 PE，避免暗示 `tile→独立accumulator` 是实际实例连接。若保留 zvt_acc 源文件导航，应明确标“仓库存在但当前路径未发现实例”，不能用“打开实现入口”暗示它是现行数据路径。

## P1：VRF 入口指向旧的 rvv_vrf_reg，而非当前后端实例

位置：`app.js:38`，`modules.vrf.path='hdl/verilog/rvv/rvv_vrf_reg.sv'`。

该文件真实存在，模块定义在第 3 行，但当前硬件仓库未找到 `rvv_vrf_reg` 被实例化。实际后端是 `hdl/verilog/rvv/design/rvv_backend.sv:1309` 实例化 `rvv_backend_vrf`，然后 `design/rvv_backend_vrf.sv:99–108` 实例化 `rvv_backend_vrf_reg`。实际寄存器 byte-enable 循环在 `design/rvv_backend_vrf_reg.sv:25–35`。

精确建议：把模块入口改成 `hdl/verilog/rvv/design/rvv_backend_vrf.sv`，行 6；在详情补第二个链接至 `hdl/verilog/rvv/design/rvv_backend_vrf_reg.sv:8`。前者解释读端口、写回合并和 v0，后者解释实际寄存状态。旧文件只放入源码浏览器，不作为现行架构入口。

## P2：LSU snooping 的前端文案仍不够准确

位置：`app.js:35` 的 LSU body，以及 `app.js:194` 的 fallback “LSU 的 snooping 要按语境理解”。

“用于观察返回及寄存器更新相关路径”容易让读者以为它在观察外部写回或寄存器一致性。源码 `scalar/Lsu.scala:1171–1181` 实际是：非 strict/写请求的允许场景下，让同 row 且 `canAcceptResp` 的更多 cell 消费一次返回；strict 或 write 使用原 `respMask`。这是 LSU 内部响应复用。

精确建议两处统一改为：“这里的 response snooping 指一次总线 row 响应可满足同一 LSU 内多个符合条件的等待 cell；严格模式与写访问限制复用。它不维护多 cache 的 owner/sharers，也不是 MESI 一致性嗅探。”入口跳到 `Lsu.scala:1171`，避免从第 1 行开始找。

## P2：向量实验宣称“保持未激活元素”，但模型没有旧目的值

位置：`app.js:129` 的向量实验说明；`models.js:5–9` 与 `app.js:166`。

当前模型对 mask-off/tail 元素返回 `result:null`，前端显示“—”；没有输入旧目的寄存器，也没有保存该元素旧值。因此它演示的是“不计算/不展示活动结果”，不能据此说已经演示了 undisturbed 保留机制。VLEN=128、SEW 8/16/32、LMUL 1/2/4 和 VLMAX 公式本身与当前教学范围一致；问题在写回策略表述。

最小修复：将说明改为“未激活元素显示‘—’，表示本模型不计算或展示写入值；真实 tail/mask 的 undisturbed/agnostic 策略由指令和 vtype 决定”。若要保留“保持”措辞，则必须增加旧目的向量，并让非活动元素实际返回旧值，同时注明只是其中一种策略。可追加源码入口 `rvv_backend_vrf.sv:61–80`，讲 strobe 进入 byte-enable 的过程。

## P2：Core 图缺少 RVV 与共享 LSU 的数据通路

位置：`app.js:47`，Core 内部图的 `wires`。当前 RVV 只有到 retirement 附近的箭头，LSU 仅由左侧标量区连接，容易让读者以为向量内存直接在 RVV 内部完成。

证据：`hdl/chisel/src/coralnpu/rvv/RvvCore.scala:108–131` 定义双向 RVV/LSU 数据流；`:134–141` 定义可选 VME/LSU 数据流。矩阵层 `zvt.sv:44–51` 也有显式 LSU 端口。

精确建议：为 RVV↔LSU 增加双向职责箭头或请求/返回两条线，标“索引/数据/mask → LSU；元素结果返回”。保留“职责图，非精确连线”说明，但不要遗漏这条关键架构边界。矩阵图则应区分 RVV 命令所携操作数、MT 累加值读写和 LSU tile load/store，不宜只连成 VRF→control→PE→tile→accumulator 的单向链。

## P2：Bank 实验的交织映射需要在源码链接旁明确对照

位置：`app.js:134–136`，word 地址取模实验紧邻 `BankedDtcm.scala:1` 链接。

说明已将其标为教学存储模型，避免直接声称复制 Coral，方向正确。但读者点击链接后可能仍将 `floor(addr/4)%BANKS` 当作上游公式。当前独立 BankedDtcm emitter 用连续区间选择 bank：`BankedDtcm.scala:79–95`，`bankSize=dtcmSize/numBanks`，通过 offset 高位选择 bank；它不是 word-interleaved 映射。CoreAxi 本身使用 TCM128/SRAM/FabricArbiter，也未在该 wrapper 内实例化此独立 BankedDtcm。

精确建议：在公式下加一句“对照：当前 BankedDtcm emitter 按连续地址区间选 bank；本实验使用 word 交织，故相同地址的实际 bank 可能不同”，把源码入口行改为 79；同时把 Fabric 链接设为 22，用来对照固定优先仲裁。无需为教学目的重写模型。

## P2：Scoreboard 需补充 x0 与同拍旁路的抽象边界

位置：`app.js:124–126`、`:176`；`logic-models.js:14–19`。

实验允许 r0 置 busy，hazard 采用边沿前旧 busy，故“本拍写回清除”不会让同拍依赖指令因旁路立即发射。这与教学 RTL 一致，但真实 Coral Regfile 强制 x0 的值与 busy 为零，并同时输出 regd 与去除本拍 clear 的 comb busy；dispatch 对不同消费路径分别使用这些信息。相关证据为 `scalar/Regfile.scala:109–132`、`scalar/Decode.scala:439–462`。现有一句“真实还有旁路”可保留，再加明确差异更易理解。

精确建议追加：“r0–r7 是抽象位，r0 不表示 RISC-V x0；模型只用旧 busy 判 hazard，未实现同拍写回旁路和真实四槽位前缀规则。”不需要为了对齐 Coral 改动已与教学 RTL 对照的状态模型。

## 主代理修复记录

上述入口与抽象边界已在页面修正：VRF 指向现行后端；累加作为 PE 内部职责并指向 zvt_pe_block；LSU 同 row 响应复用、Bank 区间映射差异、r0 与旧 busy 策略均已明确。Core 职责图加入 RVV/共享 LSU 的请求与返回关系。该图仍是阅读地图，不是完整信号级网表。

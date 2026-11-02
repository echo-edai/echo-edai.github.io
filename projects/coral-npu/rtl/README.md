# 可运行的微架构教学原型

这些 SystemVerilog 是本资料库独立编写的最小机制示例，复用自已有的学习工坊，并非 Google Coral NPU 的上游 RTL，不能直接替换其模块。它们帮助你练习接口、状态更新、背压和不变量。

| 模块 | 学习内容 | 明确限制 |
| --- | --- | --- |
| `learn_fifo.sv` | 深度4、8bit 数据的 ready/valid FIFO | 无跨时钟域、无组合穿透；full 时不借同拍 pop 接受新数据 |
| `learn_scoreboard.sv` | 8个抽象寄存器的 busy 位、RAW/WAW、清除与发射 | 无重命名、旁路、真实Coral派发宽度或异常恢复 |
| `learn_directory.sv` | 两个客户端、单条缓存行权限、Probe/ACK/Response | 教学扩展；无行数据、地址、多事务、真实网络或完整一致性协议 |

目录模块不属于 Coral NPU。当前 IP 的 Fabric/TCM 与带目录缓存的一致性系统是不同层面的设计。

在此目录运行（需要 Icarus Verilog）：

```sh
iverilog -g2012 -s tb_learning -o teaching.vvp learn_fifo.sv learn_scoreboard.sv learn_directory.sv tb_learning.sv
vvp teaching.vvp
```

从项目网页根目录运行完整教学对照：

```sh
python3 tools/test_learning_rtl.py
node tools/test_learning_models.cjs
node tools/crosscheck_learning_models.cjs
```

测试只验证教学原型与其离散时钟状态模型，不是整个 Coral NPU 的仿真、综合、时序分析或形式证明。报告位于 `research/`。

修改练习：先改变 FIFO 深度，定义 full+pop 时是否允许 push；再为 Scoreboard 增加明确的写回旁路契约；最后为目录加入事务 ID 并检查迟到 ACK。每项修改均应同步更新参考模型和验证条件。

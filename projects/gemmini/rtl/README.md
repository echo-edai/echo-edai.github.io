# Gemmini 学习用最小 RTL

这里的三个模块是独立编写的教学代码，**不属于 Gemmini 上游源码，不兼容上游端口，也不能替换上游模块**。它们帮助把课程中的握手、驻留和权限事务写成可执行状态机。代码采用 [MIT 许可](LICENSE)。

## 运行

需要 Python 3.10+ 和 Icarus Verilog（`iverilog`、`vvp`）。在本目录运行：

```sh
python3 run.py
```

也可从工作区根目录运行：

```sh
python3 web/gemmini/rtl/run.py
```

脚本在临时目录生成仿真程序，运行测试，并更新本目录的 `verification.json`。不构建或执行上游 Gemmini。手动运行命令：

```sh
iverilog -g2012 -s tb_learning -o /tmp/gemmini-learning.vvp learn_elastic.sv learn_pe.sv learn_directory.sv tb_learning.sv
vvp /tmp/gemmini-learning.vvp
```

## learn_elastic.sv：一格弹性缓冲

状态为 `full` 和 `data`。输入/输出的接受事件分别为 `in_valid && in_ready`、`out_valid && out_ready`。满时若本拍输出可消费，就能同拍换入新数据。阻塞期间输出保持；同步复位丢弃缓存内容。

它有一拍存储延迟、组合 ready 回传路径；它不是切断 ready 路径的完整 skid buffer。输入源应遵守自己约定的握手保持契约。扩展练习：改成两格、注册 ready、明确旁路条件，再重跑顺序与容量守恒测试。

## learn_pe.sv：简化 WS / OS

- INT8 有符号输入，16位乘积显式符号扩展到 INT32。
- OS：`start` 为1时本次累加从零起步，否则累加到 `os_sum`；每个有效运算都输出当前部分和。
- WS：先 `preload` 权重，随后计算 `partial_in + a*weight_reg`，重用权重。
- `preload` 比 `valid` 优先；同拍两者都为1，只预装载，不计算。
- `valid=0` 时算术状态保持，`out_valid=0`；结果每次计算后在寄存器上更新。
- INT32 溢出采用二补码模运算，没有饱和、缩放、舍入、异常。

这里没有 Gemmini 的双缓冲 c1/c2、propagate、matmul ID、transposer 或 Mesh，不能由单 PE 测试通过推断完整矩阵核已通过。扩展练习：先实现2×2 OS阵列的 skew/valid 对齐，再考虑双缓冲与切换。

## learn_directory.sv：两客户端、一条隐含行的权限事务

这是自编 U/S/M 权限教学协议，**不是 MESI、TileLink 或 Gemmini 内部目录实现**。它没有地址/tag、cache line数据、脏数据转发、网络、事务ID、epoch、超时、release/eviction、异常与多个MSHR。客户端必须真实履行 probe：接受失效或降级后，撤销对应权限，才返回 ACK。

稳定元数据含 `stable_state`（U=0、S=1、M=2）、`sharers`、`owner`。M 时 sharers 仅含 owner；S/U 时 owner 标量无语义，应忽略。事务过程中保留旧稳定元数据，`busy` 表示处于瞬态，不应用旧稳定字段直接判断所有客户端的当前权限。

接口契约：

1. 仅 `req_ready=1` 时接受一个客户端读/写请求，直到整个响应被接受前不再收新请求。
2. 写请求失效其他持有者；对别人的独占行发起读请求时，向旧 owner 发降级 probe。
3. `probe_valid && probe_ready` 表示 probe 被对方接收。已被接受的 probe 不重复发送。
4. ACK 只在目标仍待收且对应 probe 已接受时生效；允许 probe 与同一客户端 ACK 在同一个边沿被接收。提前 ACK、错客户端和同事务重复 ACK 不会提前完成。
5. 全部预期 ACK 到齐后产生响应，响应身份/权限保持到 `resp_ready`；在这个接受边沿提交新稳定元数据。
6. **来自已完成旧事务的迟到 ACK 超出接口契约**：没有事务ID就无法区分同一客户端的旧ACK与新ACK。扩展为真实协议时必须补上ID/epoch检查。

该模块只验证“权限完成条件”的控制片段，不能证明真实cache数据一致，也不具备容忍不诚实ACK的能力。扩展练习：先加行地址和事务ID，再加数据位置/dirty回传、GrantAck及取消/错误路径。

## 测试范围

本次 Icarus Verilog 13.0 运行通过 **1508项检查**：

- 弹性缓冲500周期固定种子随机输入/反压，scoreboard检查顺序、无幽灵输出、占用守恒与排空。
- OS、WS各100组有符号数据，插入空拍、预装载优先级、-128乘法与INT32溢出边界。
- 目录U→S0→S01→M1→S01→M0、owner自己读、probe阻塞、probe接受前ACK、错/重复ACK、同拍probe+ACK，以及响应反压保持。

这是有界定向/随机仿真，不是形式证明、完整缓存协议验证、综合、时序分析或 Gemmini 仿真。确切代码哈希和命令见 [verification.json](verification.json)。

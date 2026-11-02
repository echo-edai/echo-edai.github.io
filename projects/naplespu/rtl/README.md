# 从零实现的最小 RTL 练习

这些文件是为课程独立编写的教学原型。它们可以实际编译运行，接口、状态、reset 与并发范围都经过刻意缩小，不能替换上游 NaplesPU 模块。

| 原型 | 实现内容 | 没有实现的部分 |
| --- | --- | --- |
| [learn_fifo.sv](learn_fifo.sv) | 4项环形FIFO、valid/ready接收、head/tail/count、同步reset | 非2次幂深度、空队列旁路、full时同拍回填、异步FIFO |
| [learn_scoreboard.sv](learn_scoreboard.sv) | 一组8位busy、RAW/WAW、资源阻塞、WB/rollback清除、set优先 | 多线程银行、scalar/vector编码、前递、rename、tag身份生命周期 |
| [learn_directory.sv](learn_directory.sv) | 两核单行权限、单事务锁存、失效/降级probe、目标ACK、响应背压 | 地址与数据、L2数据/tag、替换、dirty owner写回、真实NoC、多事务TSHR、乱序消息 |

目录原型的 ACK 表示“远端已完成所需权限/数据处理”的抽象完成事件，但代码没有传输任何数据。真实一致性系统必须保证最新数据不会在 owner 改变时丢失；不能只复制这个权限状态机就宣称实现了完整缓存一致性。

## 运行

已安装 Icarus Verilog 时，在项目根目录运行：

```bash
python3 web/tools/test_learning_rtl.py
```

它编译三个模块与 [tb_learning.sv](tb_learning.sv)，随后用 `vvp` 执行。结果保存在 [learning-rtl-verification.json](../research/learning-rtl-verification.json)。本次运行通过30项检查，覆盖满/空FIFO、环回顺序、同时进出、RAW/WAW、资源回压、清除/分配优先级、目录探针背压、错误ACK、共享到修改、远端M读与reset。它不是 NaplesPU 上游工程的构建/仿真报告。

浏览器状态实验对应 [logic-models.js](../logic-models.js)。独立的浏览器模型检查：

```bash
node web/tools/test_learning_models.cjs
```

还可运行带固定种子的模型/RTL 对照检查：

```bash
node web/tools/crosscheck_learning_models.cjs
```

本次300个输入周期中，三个原型的状态与有效FIFO数据均与浏览器模型一致，包含定期reset与背压/错误ACK输入。结果保存在 [learning-model-crosscheck.json](../research/learning-model-crosscheck.json)。这是有界测试，不是形式等价证明，也不验证上游NaplesPU。日志显示的是边沿前的接收条件及边沿后的状态。

目录原型对不匹配的ACK给出 `ack_ready=0`。如果上游把错误ACK永久放在同一FIFO队头，系统可能无法前进；完整系统需要正确的路由/事务匹配，以及对非法、重复或过期消息的明确定义。本原型用于观察“不能被错误ACK提前完成”的安全条件，不提供完整网络的活性保证。

## 推荐修改任务

1. **FIFO**：先解释满队列同时 pop/push 的现有策略，再修改 `in_ready` 允许 full+pop 同拍回填；补测试验证旧队头仍被正确读取，且生产者/消费者的组合依赖不会引入不想要的环路。
2. **Scoreboard**：从一个上下文扩为两个线程；把寄存器busy改成按thread索引。写一个测试：T0的r3忙，T1的r3仍可用。再加入目的寄存器的完成tag，证明延迟/撤销后不会清错新事务的busy。
3. **目录**：先加入独立的owner-data返回通道及data_ready条件，明确ACK与数据能否乱序到达；再把单行元数据扩为两行，增加地址lookup与同一行冲突阻塞。
4. **并发目录**：在上述版本稳定后再引入事务槽，记录line/requestor/等待ACK集合/数据是否已到达；同一行冲突排队，不同地址能独立前进。
5. **NoC接口**：把probe与response改为带源/目的/事务身份的消息队列。先用2个endpoint模拟网络延迟与背压，再接router；不要在消息尚未被接受时清掉pending状态。

每次只改变一种机制，先写“哪些状态必须保持”的断言或定向检查，再扩展参数和并发。

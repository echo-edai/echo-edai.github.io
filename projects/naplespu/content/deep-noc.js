/* Source-grounded NoC implementation course. Examples marked as teaching models are not drop-in NaplesPU RTL. */
window.NPU_DEEP_NOC = (() => {
  const BASE = 'source/hardware/src/';
  const r = (file, line, label) => ({path:BASE+file,line,label:label||file.split('/').pop()});
  const net = line => r('include/npu_network_defines.sv',line);
  const router = line => r('mc/router/router.sv',line);
  const ip = line => r('mc/router/input_port.sv',line);
  const ni = line => r('mc/network_interface/network_interface_core.sv',line);
  const packet = line => r('mc/network_interface/control_unit_packet_to_flit.sv',line);
  const fifo = line => r('common/sync_fifo.sv',line);
  const chapters = [
    {
      id:'deep-noc-contracts',title:'把 NoC 写出来（一）：消息、队列与背压的契约',eyebrow:'IMPLEMENTATION / NOC 01',
      summary:'NoC 不是若干条漂亮连线。它是有限缓冲、共享链路和受控状态更新构成的传输系统。先决定一次传输何时真正发生，再写 FIFO、flit 和接口，才能避免“仿真偶尔能跑”的丢包网络。',
      sections:[
        {
          title:'为什么需要 NoC：把端点职责与运输职责分开',
          paragraphs:[
            '计算核心发出的不是“去东边”命令，而是读写、取指、同步等具有系统语义的请求。cache controller、directory controller 和服务单元形成结构化消息；NI 将这些消息拆装为 flit；router 只负责按网络目标和 VC 转发。地址由哪个目录负责、谁有写权限，是端点协议；某个 flit 从 EAST 还是 SOUTH 离开，是运输协议。',
            '多个 tile 同时发消息时，共享物理链路需要选择一个发送者，接收队列可能已经接近满。单根组合连线无法保存尚未被接收的消息，也无法自行处理竞争。NoC 的队列保存等待工作，仲裁决定使用权，流控防止有限存储溢出，路由决定下一跳。它并不会凭空制造链路带宽。',
            '自己实现时，先用两个端点和一条点对点链路，明确消息格式、发送发生条件和接收释放条件，再增加队列与一个多输入 router。不要第一步就复制完整的一致性消息、四 VC 和 4×4 mesh，否则无法判断错误来自协议、缓存还是运输。'
          ],
          table:{headers:['层次','在 NaplesPU 中的具体位置','自己先写什么'],rows:[['消息生产/消费','CC、DC、boot/synchronization 等端点','固定格式测试 packet，带 source/destination/sequence'],['拆装和流量分类','network_interface_core 与 virtual_network_*','单目的 packet↔flit 转换'],['运输与竞争','input_port、allocator_core、crossbar、router','一个输入 FIFO + 一次 one-hot 选择'],['系统拓扑','npu_noc 的相邻 tile 连线','2×2、无回绕、明确边界处理']]},
          sources:[ni(35),router(35),r('mc/system/npu_noc.sv',96)]
        },
        {
          title:'先做数据字典：packet、flit、VC 和位宽是四件事',
          paragraphs:[
            'packet 是一次端点消息，例如一个一致性响应；flit 是网络流控与传送的数据单元。此版本 flit_t 由 flit_header_t 和 64-bit payload 组成。header 包含类型、VC、下一跳、最终 tile 坐标和 core_destination。即使 BODY 也使用这个 flit_t 类型，输入端口仍通过队首 packet 的路由记录决定去向。',
            '默认 4×4 时，坐标 x/y 各2 bit，flit_type 为2 bit，vc_id 为2 bit，端口编号为3 bit，core_destination 为2 bit。按 packed 类型相加，header 是13 bit，完整 flit 是77 bit；64 bit 只是 payload。这是该默认宏组合下的类型宽度计算，不是板级引脚数或综合后的存储面积。',
            'HEADER、BODY、TAIL、HT 区分包起点、中间、终点和单 flit 包。packetizer 在 packet_has_data 为假时生成 HT；有数据时按 PACKET_BODY_SIZE 的64-bit片段发送。不要额外假定 HEADER 没有 payload：源码把当前 chunk 和 header 一起组成输出 flit。'
          ],
          code:{language:'systemverilog',text:'// 源码摘录：类型关系；实际字段与宽度见 npu_network_defines.sv\ntypedef struct packed {\n  flit_header_t header;\n  flit_body_t   payload;\n} flit_t;\n// 默认：2(type)+2(VC)+3(port)+4(destination)+2(core destination)+64 = 77 bit'},
          note:{type:'inference',text:'77 bit 只适用于此处默认4×4、4VC、5端口等宏组合。改变网络规模后应重新用 $bits(flit_t) 检查，不能把常数77写死到通用模块。'},
          sources:[net(39),net(66),net(93),packet(135),r('mc/network_interface/virtual_network_core_to_net.sv',162)]
        },
        {
          title:'FIFO 在 RTL 里是什么：存储、两个指针、占用计数与边界断言',
          paragraphs:[
            'sync_fifo 用 mem 保存条目，tail 指向写位置，head 指向读位置，cnt 表示占用量。组合逻辑由 cnt 产生 full/empty/almost_full，value_o 直接读 mem[head]；时钟沿根据 enqueue_en/dequeue_en 更新指针和计数。两者同时为1时两个指针都移动，计数不变。reset/flush 复位指针与计数，不要求把整个数据阵列逐项清零：empty 已使旧内容无效。',
            '此模块的 enqueue_en 是“本周期确实要入队”的命令，不是可以随意长期保持的愿望。它对满队列入队、空队列出队直接 assert/$fatal，并没有自动把非法命令吞掉。上游必须遵守接口契约。尤其 cnt==SIZE 时，即使同周期也 pop，现有断言仍按旧 full 报错；它不是任意 full+pop 可直接接受 push 的通用 FIFO。',
            '默认每个 router input 的每个 VC 有16项，指针宽4 bit，占用计数需能表示0到16，因此是5 bit。SIZE 的2次幂限制使自然溢出实现环绕；若自己支持非2次幂深度，必须显式比较末项并回0。SIZE=1 的 $clog2 边界也要单独处理。'
          ],
          bullets:['最小验证：空读、满写、指针环绕、连续push、连续pop、合法同时push/pop、reset/flush。','用软件队列作期望模型：每次合法pop比较队首，不只比较最终收到多少条。','full/empty 是当前状态；是否接受新操作是接口政策。先写政策，再写组合逻辑和断言。'],
          sources:[fifo(50),fifo(61),fifo(68),fifo(81)]
        },
        {
          title:'input_port 为什么每个 VC 有两只队列',
          paragraphs:[
            'flit_fifo 存全部 flit，按 flit_in.header.vc_id 把本次 wr_en_in 分流到一个 VC。header_fifo 的实际条目不是整颗 header，而是 port_t：仅 HEADER/HT 入队时记录 next_hop_port。队首 port 转为 one-hot 后形成 ip_dest_port。这样一包的 BODY/TAIL 可以沿同一路径前进，不必把每个 BODY 都当成独立新包重新竞争路径。',
            'header_fifo 不是在 HEADER 获准离开时就出队，而是在当前 flit 是 TAIL/HT 且 sa_grant 为1时出队。关键是“尾 flit 真正被发送”，不是“已经看见 TAIL”。flit_fifo 则在 sa_grant 时弹出一个 flit。这两种出队条件共同维持 flit 次序和包级路由信息。',
            'header 队列非空但 flit 队列暂时空是可以理解的：头部已经送出，后续 flit 还没抵达。路径请求仍可维持，但 switch 不能凭这个请求制造不存在的数据，所以 router 的 switch 请求额外与 ~ip_empty 相与。'
          ],
          code:{language:'systemverilog',text:'// 源码摘录的关键条件，保留信号含义\n// flit FIFO：每个有效flit入队，真正获得发送grant才出队\nenqueue_en = wr_en_in & (flit_in.header.vc_id == i);\ndequeue_en = sa_grant[i];\n// 路由记录FIFO：包头入，尾部成功传送后出\nheader_push = wr_en_in & (flit_in.header.vc_id == i)\n            & (flit_type == HEADER || flit_type == HT);\nheader_pop  = (head_flit_type == TAIL || head_flit_type == HT)\n            & sa_grant[i];\n// 上面为说明性摘写，不是可直接替换的完整模块。'},
          sources:[ip(66),ip(84),ip(93),ip(109),router(212)]
        },
        {
          title:'同名 credit 的极性不同：背压是高有效，发送许可也是高有效，但不是同一根线',
          paragraphs:[
            'router 的 on_off_out 直接来自输入 flit FIFO 的 almost_full。值1表示“停，接收侧快满了”。tile_npu 把 LOCAL 端的这些位接成 router_credit；NI 再用 pending & ~router_credit 生成可参与发送的请求。因此这里的 router_credit 不是一个剩余槽位数，也不是 ready=1 的同义词。',
            'packetizer 控制单元的 flit_credit 却接自 NI 仲裁器的 vno_granted，对它来说1表示本周期获得发送许可。两者之间隔着反相、pending 判断和竞争选择。读代码时要给每一根流控线写“谁产生、1代表什么、哪一个状态更新由它触发”，不能只按 credit 名字套教科书公式。',
            'router 的输入 FIFO 在16项中的15项触发 almost_full；接收 NI 的完整 packet FIFO 则在容量减2处触发背压，注释明确为重组与反馈延迟预留空间，防止连续单flit包越界。阈值是整条路径的时序契约。若加寄存器或更改拆包控制，不能不加分析地保留同一阈值。'
          ],
          table:{headers:['信号','1的含义','实际消费方式'],rows:[['input_port.on_off_out / NI.router_credit','接收侧almost_full，阻止发送','pending & ~router_credit 进入仲裁'],['CU.flit_credit','当前VN获得发送机会','GEN_FLIT 状态推进 chunk count'],['ni_*_network_available','端点packet FIFO可接收','发送者据此决定是否产生一次packet_valid'],['core_packet_consumed','端点本次取走完整packet','触发重组packet FIFO出队']]},
          note:{type:'limit',text:'普通 ready/valid 通道可作为自己的第一个教学原型，但必须显式适配 NaplesPU 的 wr_en/on_off、available/consumed 和 flit_credit 契约。这里没有发现数值型 credit 计数器来证明“剩余N格”的语义。'},
          sources:[ip(69),ni(226),ni(289),ni(295),r('mc/tile/tile_npu.sv',466),r('mc/network_interface/virtual_network_net_to_core.sv',89)]
        }
      ]
    },
    {
      id:'deep-noc-router',title:'把 NoC 写出来（二）：路由、仲裁、包保留与交叉开关',eyebrow:'IMPLEMENTATION / NOC 02',
      summary:'沿一个队首 flit 从 input_port 到下游 router，分清三种决定：去哪里、谁暂时拥有某个VC、这一拍谁实际穿过物理端口。用 one-hot、保留状态和数据/选择对齐把这些决定落到 RTL。',
      sections:[
        {
          title:'routing_xy 和 look_ahead_routing 回答的是不同位置的问题',
          paragraphs:[
            'routing_xy 用当前坐标与最终目标坐标相减：X还不相等就 EAST/WEST，X相等后才 SOUTH/NORTH，全部相等为 LOCAL。它用于 NI 初次注入时填 header.next_hop_port。方向是组合决策，不需要在路由函数内部保存一个移动中的坐标。',
            'router 到达时已经拿到当前应走的 next_hop_port；look_ahead_routing 算的则是“走过这一跳后，下一台 router 应选什么”。例如当前位置(0,0)、目标(1,1)：当前应 EAST，提前写入的下一跳是 SOUTH；若目标(1,0)，当前 EAST 后已抵达目标，提前写入 LOCAL。把普通 XY 函数原样当作 lookahead 会多走一步或错误转弯。',
            'router 仅对 HEADER/HT 改写 next_hop_port，再将修改后的 flit 寄存。自己第一版 router 可以每跳本地算路由，确认坐标与转向正确后再做 lookahead；优化级数前先用同一组端到端路径用例证明行为相等。'
          ],
          table:{headers:['当前→目标','普通XY当前输出','lookahead为下一个router准备'],rows:[['(0,0)→(3,1)','EAST','EAST'],['(0,0)→(1,1)','EAST','SOUTH'],['(0,0)→(1,0)','EAST','LOCAL'],['(0,0)→(0,1)','SOUTH','LOCAL']]},
          sources:[r('mc/network_interface/routing_xy.sv',47),r('mc/router/look_ahead_routing.sv',52),router(127)]
        },
        {
          title:'arbiter 是组合选择加优先级状态，不是名字里有 round_robin 就自动公平',
          paragraphs:[
            '基础 round_robin_arbiter 保存最高优先级 one-hot 位。组合部分从该位置按循环顺序寻找请求，形成 decision_oh；时序部分只有 en 且 requests!=0 才把获胜者的下一位设为最高优先级。因此是否轮转取决于连接到 en 的真实值。',
            'grant_hold 包装器额外保存 last，形成 hold=last & hold_in。只要旧获胜者仍要求保留，就输出 hold；否则采用基础仲裁的结果。allocator_core 将 reordered_request 同时接到 requests 和 hold_in，用持续的包路径请求保留资源。',
            '当前 grant_hold 包装器把内部基础仲裁器 en 固定为0。不能据模块名字宣称它在包与包之间严格轮转，或保证某个确定周期内所有竞争者都被服务。连续请求和包保留还可能扩大占用区间。若自己需要有界公平，必须定义何时一次服务完成、何时更新优先级、保留的解除条件，再写长期竞争测试。'
          ],
          code:{language:'systemverilog',text:'// 源码摘录：grant_hold_round_robin_arbiter.sv\nassign decision_oh = anyhold ? hold : grant_arb;\nassign hold        = last & hold_in;\nassign anyhold     = |hold;\nalways_ff @(posedge clk, posedge reset) begin\n  if (reset) last <= 0;\n  else       last <= decision_oh;\nend\n// 内部 round_robin_arbiter 的 .en(1\'b0) 必须一并阅读。'},
          sources:[r('common/round_robin_arbiter.sv',42),r('common/round_robin_arbiter.sv',62),r('mc/router/grant_hold_round_robin_arbiter.sv',44),r('mc/router/allocator_core.sv',64)]
        },
        {
          title:'两次 allocation：先是输出VC的拥有者，再是物理 switch 的本次使用者',
          paragraphs:[
            'input_port 产生形状为 input×VC×output 的 one-hot 路径请求。allocator_core 在组合连线中做转置：reordered_request[output][vc][input] = request[input][vc][output]，为每个输出/VC汇集竞争输入。反向转置 grant 后，再与下游 ~on_off 相与，形成输入/VC 可推进资格。写这类多维数组时，先在纸上为每个下标命名，比试错修改维序更可靠。',
            '获得某个输出VC资格，还不意味着当前输入的多个VC可以同时发送。router 为每个输入用基础轮询从 va_grant & ~ip_empty 选一个VC，得到该输入实际请求的输出 sa_port；第二个 allocator_core 以 M=1 决定各输出竞争。最终 granted_vc_oh 同时要求本输入获准和该VC被选，才能驱动 FIFO pop。',
            '同一输入一次最多传一个flit；同一输出一次最多接收一个输入。不同的输入若目标输出不同，可以并行通过crossbar。VC 是把队列/保留状态分开，不是把一根物理输出复制成4根每拍各发一个flit的链路。'
          ],
          table:{headers:['决定','关键数据','何时数据真正消耗'],rows:[['输出VC资格','ip_dest_port → vc_allocator → va_grant','仍不能仅凭资格pop'],['输入选择哪个VC','va_grant & ~ip_empty → grant_to_mux_ip','选择非空候选'],['输出选择哪个输入','sa_port → switch_allocator → sa_grant','最终 granted_vc_oh 才驱动pop'],['进入crossbar','寄存的flit / grant / valid','下一级观察wr_en_out与相应flit']]},
          sources:[r('mc/router/allocator_core.sv',76),router(185),router(212),router(236),router(249)]
        },
        {
          title:'crossbar 看起来像连线，实际上最怕选择、数据和有效位错拍',
          paragraphs:[
            'crossbar 对每个输出构造一只 mux，并把输入优先的 port_sel 转为输出优先的 mux_sel。flit 数据和 valid 使用同一选择，输出 wr_en_out 表明该输出的内容可被接收。mux_npu 的 onehot 实际先经优先编码器转换成索引；如果上游错误地产生 multi-hot，它可能选出一个值，却不代表竞争合法。因此应在选择产生点验证 one-hot-or-zero，而不是指望mux自动检测争用。',
            'router 已把 flit_in_granted_mod、grant_to_cr 和 valid 分别寄存，再送 crossbar。自己改流水级时，如果只给数据加一拍而选择没有同步，输出会携带另一个输入的flit；只给valid加拍也会造成旧数据被当作新数据。验证时给每个flit加 source/packet/sequence 标记，能够比全0或重复payload更早发现错拍。',
            'HOLD_VALUE 这个参数也不能按字面推断成时序寄存器：mux_npu 的 TRUE 分支仍是 assign o_data=i_data[index]，FALSE 分支才在无有效选择时输出0。数据无效时的电平不构成一次传输，消费者必须看wr_en_out。'
          ],
          bullets:['结构断言：每个输出选择至多一个输入；每个输入只被允许送往其合法目标。','数据断言：有wr_en_out才计数；计数与payload/source/sequence共同比较。','性能测量另做：一个flit在无竞争情况下通过某些寄存级，不代表整个packet永远只要固定两拍。'],
          sources:[r('mc/router/crossbar.sv',49),r('mc/router/mux_npu.sv',45),router(133),router(254),router(265)]
        },
        {
          title:'wormhole 的核心：头部占用的路径，要和尾部的真实离开绑定',
          paragraphs:[
            'wormhole 允许一包的头部已经向前走、尾部还分布在前面的router里。每跳只需小flit缓冲，不必在每个router先收齐整包再转发。但代价是包会沿若干资源形成依赖，头部被阻塞时后续flit和上游空间也可能连锁等待。',
            'NaplesPU 的包路径记录由 header_fifo 保持，allocator 的 grant-hold 利用持续的路径请求排除别的输入对相同输出VC的占用。数据流仍可在不同VC间以flit粒度交织。不能让两个不同packet在同一个接收VC中任意交错，因为接收重组器按该VC的顺序流累加payload，并没有为任意packet ID分别保存独立重组上下文。',
            '自己实现最小包锁时，可先显式保存 owner_valid/owner_input，并只在被选中的tail成功传输后释放。随后再对照本项目“header路由队列 + 持续请求 + grant-hold”的分布实现。不要把见到tail、授予资格、尾部实际pop混为一个事件，也不要要求整个物理端口在包期间绝不能穿插其他VC。'
          ],
          note:{type:'limit',text:'grant_hold保持的是仍然有效的请求，不包含一个显式“收到tail就release”的输入；真实释放由请求队列和消费者共同实现。不能把教学owner寄存器当成与原模块逐拍等价的替代。'},
          sources:[ip(93),r('mc/router/grant_hold_round_robin_arbiter.sv',56),router(170),r('mc/network_interface/control_unit_flit_to_packet.sv',90)]
        }
      ]
    },
    {
      id:'deep-noc-ni-verification',title:'把 NoC 写出来（三）：NI 状态机、多目标发送与系统验证',eyebrow:'IMPLEMENTATION / NOC 03',
      summary:'router 只运输 flit。要成为能服务一致性和同步的网络，还必须把消息分类、可靠拆装、按消费速度背压，并分别审查路由死锁和端点协议死锁。最后用保守最小原型建立可验证的扩展顺序。',
      sections:[
        {
          title:'发送 NI：先锁存完整消息，再让控制器逐片推进',
          paragraphs:[
            'virtual_network_core_to_net 的 packet_in_fifo 保存 packet_body、has_data、destinations 和 destinations_valid 的完整快照。packet_valid 直接接FIFO enqueue_en，vn_packet_fifo_full 实际接almost_full并由NI取反成为端点available。发送者要在许可内产生一次入队，不能把同一笔请求每拍重复压入。',
            'control_unit_packet_to_flit 用 IDLE/GEN_FLIT 两个状态、chunk count、packet_destination_sel 和 dest_served 保存发送进度。IDLE选择尚未服务的目标并锁存目的；GEN_FLIT在得到发送许可时递增chunk。当前包所有目的都完成以后，cu_packet_dequeue 才弹出完整消息，避免发送中途读取到下一包。',
            'NI在CC/DC共享VC1响应和VC2转发时先做源之间的grant-hold选择，再在四种VN之间争用router LOCAL发送口。对packetizer，flit_credit 是最终仲裁许可，而不是单纯“下游还有空间”；permit与payload计数必须一起追踪。'
          ],
          note:{type:'inference',text:'原控制器的cu_flit_valid还受enable门控，而GEN_FLIT中的count更新只检查flit_credit。正常连接中的enable约定必须成立；若自己的设计允许包中途随意停enable，应把“本次真正发送”的条件统一定义，并对这种暂停情形补测试，不能凭静态观察断言原系统一定丢包。'},
          sources:[r('mc/network_interface/virtual_network_core_to_net.sv',104),packet(69),packet(135),packet(147),ni(177),ni(229)]
        },
        {
          title:'多目标消息怎样实现：目标位图、已服务位与重复单播',
          paragraphs:[
            '目录要使多个sharer失效，服务消息也可能要到达多个tile。packetizer并没有让一条flit在router里分叉广播，而是 packet_dest_pending = packet_destinations_valid & ~dest_served，选择一个目标，完成该目标的一整包，再把对应位加入dest_served，重复直到没有待服务目标。',
            'DEST_OH为TRUE时，目标索引直接拆成x/y坐标；为FALSE时，索引选择packet_destinations数组里的明确目标。service的目标位图覆盖TILE_COUNT；request等消息可提供较小目标数组。不要把目的地位图宽度与 flit header 的 core_destination 字段混为一件事：后者还指明到达tile后是CC还是DC等接收责任。',
            '因此一个对k个目标、每份n个flit的消息，网络注入工作大体包含k份完整发送，而不是一份原子广播。自己写时先完成单目标，再加pending mask；测试非连续目标位、空目标集合、两目标之间背压、最后目标完成时的原包出队，尤其检查没有重复发送或提前丢弃。'
          ],
          code:{language:'systemverilog',text:'// 源码摘录：待发送目标与完成记录\nassign packet_dest_pending = packet_destinations_valid & ~dest_served;\nassign packet_has_dest_pending = |packet_dest_pending;\n// 单个目标的最后flit成功推进后：\n// dest_served <= dest_served | destination_grant_oh;\n// 所有目标都服务后才允许 cu_packet_dequeue。'},
          sources:[packet(83),packet(106),packet(118),packet(168),ni(434)]
        },
        {
          title:'接收 NI：按 VC 顺序重组，packet_valid 持续到端点 consumed',
          paragraphs:[
            'virtual_network_net_to_core 先按 vc_id 过滤进入自己的flit。control_unit_flit_to_packet 在有效输入时把payload写入 rebuilt_packet[count]；HEADER/HT锁存core_destination；TAIL/HT令完成脉冲有效并把count归零。重组后的完整消息进入packet FIFO，直到端点assert core_packet_consumed才出队，vn_ntc_packet_valid由非空产生。',
            'VC1既可能送CC也可能送DC，因此NI实例化分别按TYPE过滤的两套接收路径；它们观察同一响应流，用core_destination选择哪一侧入队，ni_credit[VC1]是两侧阻塞信号的OR。任一侧空间紧张就可能阻塞共享VC，这是一种保守资源耦合，不等于两套接收FIFO就有两条独立物理响应网。',
            '自己先只支持一个VC、固定长度、单个接收端，再加入HEADER/BODY/TAIL/HT和最后一片不足64 bit的拼接。推广包宽时要专门测试整除64、N=1和最后片段：当前OUTPUT_COMPOSER用 PACKET_BODY_SIZE%PAYLOAD_W 作为最后片有效宽，余数0的泛化边界必须审查。这里提醒参数化风险，不宣称所有当前消息实例都出错。'
          ],
          bullets:['重组完成与端点消费不是同一个事件；完成可以先入packet FIFO，消费由端点速度决定。','有效flit到来才递增重组索引；包尾完成后下一个包必须从0开始。','端点长时间不消费时，让packet FIFOalmost_full向router传播背压，不能继续无限接包。'],
          sources:[r('mc/network_interface/control_unit_flit_to_packet.sv',59),r('mc/network_interface/control_unit_flit_to_packet.sv',78),r('mc/network_interface/virtual_network_net_to_core.sv',93),r('mc/network_interface/virtual_network_net_to_core.sv',112),ni(498),ni(539)]
        },
        {
          title:'死锁要分层证明：XY 路由不等于整个一致性系统永远能完成',
          paragraphs:[
            '路由层可以把“正在占有一个通道、等待下一个通道”画成依赖图。无回绕mesh中的确定性XY限制先X后Y，不允许转到Y后再回X，目的是消除对应通道依赖中的环。增加自适应转弯、torus回绕或新资源共享后，旧推理不能照搬。look_ahead模块的注释说明了维序路由意图，但代码注释本身不构成对整个系统的形式证明。',
            '协议层还有另一种环：某个请求堵住资源，完成它却需要同样被堵住的响应/转发消息。NaplesPU把 request、response、forward、service 分为四种VN/VC，是为了分开这些通信类的缓冲与依赖；但它们仍共享物理链路、仲裁和端点。仅数出4个VC，不能证明所有有限FIFO、仲裁公平、端点消费与协议瞬态都满足活性。',
            '自己实现时记录每类消息“持有哪种槽位，可能等待哪种消息或槽位”。先做互相独立且能持续排空的请求/响应路径，再加入转发与同步。测试时制造长期背压，检查解除后最终继续完成；若提出“有限时间必完成”的断言，必须写出接收者最终消费、链路最终许可及仲裁公平等环境假设。'
          ],
          table:{headers:['性质','你要证明/检查什么','不能替代它的现象'],rows:[['Safety','无重复、无丢失、不越界、不误投递、选择互斥','一段波形看起来有活动'],['Routing deadlock freedom','对应拓扑/转向规则的通道依赖无环','注释写了deadlock-free'],['Protocol progress','所需消息在缓冲/端点依赖下能完成','有4个VC'],['Fairness / starvation freedom','持续合法请求在声明假设下得到服务','模块名叫round_robin']]},
          sources:[r('mc/router/look_ahead_routing.sv',33),ni(35),r('mc/router/grant_hold_round_robin_arbiter.sv',44),r('mc/network_interface/virtual_network_net_to_core.sv',115)]
        },
        {
          title:'自己写时的验证顺序：功能、守恒、资源竞争，再谈吞吐',
          paragraphs:[
            '最小测试消息带source、最终destination、packet序号、flit序号和payload校验。发送端只在真正接受时登记期望消息；接收端只在packet_valid且本次consumed时从期望队列删除。每个目的端比较完整内容和次序，并分别统计注入、网络在途、接收缓冲和已消费数量。这样即使“收发数量相同”，重复一包又丢另一包也无法蒙混过关。',
            '单模块阶段检查FIFO边界和仲裁one-hot；单router阶段让两个输入争同输出、同一输入多个VC竞争、尾部被背压；2×2阶段再做所有source/destination对、转角、LOCAL、边界端口与持续双向压力。NI阶段加入HT与多flit包、跨VC交织、同VC连续包、多目的和接收端暂停。',
            'reset期间是否允许有未完成packet，是必须预先定义的契约。若允许中途reset丢弃所有在途工作，测试模型也应清除同一epoch的期望；若要求可靠恢复，就需要额外确认/重传机制，不能把清零几个FIFO当成恢复协议。待功能与活性假设明确以后，才量注入率、负载延迟和瓶颈，不从空载路径框数推测所有包的性能。'
          ],
          code:{language:'systemverilog',text:'// 教学断言模板，不是原工程中已运行的证明。\n// 用本模块真实的“接受/传输”事件替换 push/pop/fire。\nassert property (@(posedge clk) disable iff (reset)\n  $onehot0(grant_oh));\nassert property (@(posedge clk) disable iff (reset)\n  !(push && full));\nassert property (@(posedge clk) disable iff (reset)\n  !(pop && empty));\n// 在带ready/valid的自写教学接口，额外要求：\n// valid && !ready |=> valid && $stable(data)\n// 原NaplesPU的wr_en/on_off接口需按实际流控时延重新表述。'},
          note:{type:'limit',text:'本课程完成的是源码静态阅读与实现路线。上述断言与测试计划没有被冒称为已在 NaplesPU 全部 router/NI 实例上通过。使用你的RTL原型时应将“预期性质”转成可运行testbench或形式属性并保留结果。'},
          sources:[fifo(81),router(249),r('mc/network_interface/control_unit_flit_to_packet.sv',90),r('mc/network_interface/virtual_network_net_to_core.sv',89)]
        }
      ]
    }
  ];
  const concepts = [
    {id:'concept-noc-separation',term:'NoC 与端点协议',english:'Network-on-Chip / endpoint contract',category:'noc',definition:'NoC把有限宽度链路上的消息传输组织为可排队、可仲裁、可背压的网络；CC/DC等端点决定消息的架构语义。',why:'把“数据属于哪个目录、谁能写”与“下一跳走哪里”分开，才能独立验证缓存协议和运输网络。',implementation:'network_interface_core接入请求/响应/转发/服务消息，router只消费flit、目标坐标、VC和端口请求。',designSteps:['先定义固定测试packet，至少含源、目的和序号。','实现单链路可靠收发，再加一个router，最后接真实端点消息。'],pitfalls:['让router直接修改cache状态会混淆层次。','多条逻辑消息流不等于多条物理链路。'],invariants:['每个已接受packet必须有明确接收责任。','运输不应悄悄改变消息payload或最终destination。'],sources:[ni(35),router(44)]},
    {id:'concept-noc-flit',term:'Packet、Flit 与包边界',english:'Packet / flow-control unit / HT',category:'noc',definition:'Packet是一笔端点消息；flit是每次网络转发的单位；HEADER/BODY/TAIL/HT描述包边界。',why:'物理链路不必一次携带整条512-bit缓存行及消息元数据，分片可以复用较窄链路。',implementation:'flit_t为header+payload，packetizer用count选择64-bit片段并标注类型，接收器见TAIL/HT才发完成脉冲。',designSteps:['先固定包长与flit宽，写序号化payload。','再支持单flit HT与多flit包，明确最后片的有效位。'],pitfalls:['64-bit payload不等于完整flit总宽。','不要假设HEADER一定没有payload。'],invariants:['每包恰有一个结束标志，且结束后重组索引回0。','同一VC中的包不能未经设计任意交错。'],sources:[net(71),net(93),packet(135),r('mc/network_interface/control_unit_flit_to_packet.sv',90)]},
    {id:'concept-noc-vc',term:'虚拟通道与虚拟网络',english:'Virtual Channel / Virtual Network',category:'noc',definition:'VC在共享物理端口上区分缓冲和流控状态；VN按协议通信类别区分消息流。此工程把四种消息类映射到VC0–3。',why:'分离等待队列与依赖类，减少部分队首耦合，并支持协议消息前进；不能增加超过物理输出的每拍传输宽度。',implementation:'input_port生成4组flit/header FIFO；vc_id选择入队；NI将request、response、forward、service映射到固定VC。',designSteps:['先一个VC验证收发，再复制每VC独立队列和阻塞位。','在共享物理输出处加入选择，验证不同VC可交织而同VC包不混。'],pitfalls:['4VC不是4条物理链路。','有VC不自动证明整个系统无死锁或公平。'],invariants:['flit始终沿其规定VC传输。','同一物理输出在一次传输机会只能选择一个flit。'],sources:[net(39),net(78),ip(63),ni(229)]},
    {id:'concept-noc-fifo',term:'环形 FIFO',english:'Circular FIFO / occupancy',category:'noc',definition:'用存储阵列、读写指针和计数保存尚未被消费的有序条目。',why:'发送者和消费者速度不同且可能突发；队列保存等待，不是无限容量。',implementation:'sync_fifo的head/tail/cnt在时钟沿更新，value_o组合读取mem[head]，empty/full及阈值由cnt产生。',designSteps:['先写清满/空及同时push-pop的接受政策。','为环绕、reset/flush和容量边界写软件队列对照测试。'],pitfalls:['直接复用$clog2指针而声称支持任意SIZE。','以为原FIFO会自动屏蔽满写/空读；实际是断言非法操作。'],invariants:['0≤cnt≤SIZE。','合法pop的顺序与已接受push一致。'],sources:[fifo(50),fifo(61),fifo(81)]},
    {id:'concept-noc-backpressure',term:'背压与两种 credit 极性',english:'On/off backpressure / transmission permit',category:'noc',definition:'接收侧容量紧张时阻止上游继续发送；此工程router_credit/on_off高表示阻塞，而CU.flit_credit高表示获得发送许可。',why:'有限队列必须覆盖信号反馈与在途数据，否则“停”到达之前的flit可能溢出。',implementation:'almost_full连接on_off；NI用pending & ~router_credit形成请求，经仲裁后的grant连接CU.flit_credit。',designSteps:['逐接口写出高/低含义和实际传输事件。','分析反馈延迟与最大在途数，确定almost_full预留，而不是只看full。'],pitfalls:['把router_credit当ready=1。','加流水寄存器后不重算阈值安全余量。'],invariants:['下游阻塞时不能产生不允许的新发送。','被阻塞的发送进度不应在没有真实传输时前移。'],sources:[ip(69),ni(226),ni(289),r('mc/network_interface/virtual_network_net_to_core.sv',89)]},
    {id:'concept-noc-header-fifo',term:'包路径队列',english:'Header-route FIFO / packet reservation',category:'noc',definition:'为每个等待packet保留路由记录，与存全部flit的队列分离。',why:'包头已经离开后，后续BODY/TAIL仍需知道本包的输出方向。',implementation:'header_fifo在HEADER/HT入队next_hop_port，在TAIL/HT且sa_grant时出队；非空路由记录驱动ip_dest_port。',designSteps:['先用显式owner/route寄存器支持一包。','再允许多个包排队，分别验证数据FIFO和路由FIFO的推进条件。'],pitfalls:['包头一离开就删除route。','仅看见尾部就释放，而不等尾部被实际发送。'],invariants:['本包所有flit使用其队首route。','尾部未成功离开前，本包路由记录不能提前弹出。'],sources:[ip(84),ip(93),ip(97),ip(109)]},
    {id:'concept-noc-routing',term:'XY 与前瞻路由',english:'XY dimension-order / lookahead',category:'noc',definition:'普通XY选择当前一步；lookahead在当前router提前计算下一台router要用的方向。',why:'前瞻结果随包头携带，可让下一跳使用已有方向；但正确性必须与普通路径保持一致。',implementation:'NI用routing_xy初始化next_hop；router改写HEADER/HT为look_ahead_routing输出。',designSteps:['先实现普通XY的组合函数并穷举小mesh坐标对。','再加lookahead，检查每条路径中“当前方向”和“下一方向”是否对应。'],pitfalls:['把当前方向函数原样当下一跳函数。','改变拓扑或加入Y→X转向后沿用旧无死锁推理。'],invariants:['先完成X维，再完成Y维；目标位置选LOCAL。','lookahead改写不改变最终destination。'],sources:[r('mc/network_interface/routing_xy.sv',47),r('mc/router/look_ahead_routing.sv',57),router(127)]},
    {id:'concept-noc-arbiter',term:'仲裁、保留与公平',english:'Arbitration / grant hold / fairness',category:'noc',definition:'仲裁在多个合法请求中选一个；保留延续已有拥有者；公平需要明确优先级何时更新及何时允许重新竞争。',why:'两个输入不能同时驱动同一输出，但单纯固定优先可能让长期竞争者饥饿。',implementation:'基础仲裁器的优先级只在en且有请求时更新；grant_hold保存last并优先输出last & hold_in，内部en当前固定0。',designSteps:['先写one-hot组合选择与唯一性断言。','再加入commit驱动的优先级更新和包尾释放，定义环境假设后测试长期竞争。'],pitfalls:['凭round_robin名字声称公平。','在未传输或保留未结束时随意旋转拥有者。'],invariants:['grant至多一位且只能授予合法请求。','若声明有界等待，必须同时规定服务完成与阻塞解除假设。'],sources:[r('common/round_robin_arbiter.sv',42),r('common/round_robin_arbiter.sv',62),r('mc/router/grant_hold_round_robin_arbiter.sv',44)]},
    {id:'concept-noc-vca',term:'VC 资源分配',english:'Virtual-channel allocation / request transpose',category:'noc',definition:'按每个输出VC聚合多个输入的请求，确定谁能占用该资源。',why:'同一输出/同一VC不能同时属于不同输入packet，且下游背压会限制推进。',implementation:'allocator_core把input×VC×output转为output×VC×input，分别仲裁，再转回并与~on_off相与。',designSteps:['先用2输入×1VC×2输出画出每个数组下标。','逐渐扩到5端口4VC，并为每个output/VC验证拥有者唯一。'],pitfalls:['多维数组转置写反仍能通过某些对称流量测试。','把资源资格当成已经传送数据。'],invariants:['同一输出VC最多有一个输入拥有者。','阻塞的下游VC不会产生有效推进grant。'],sources:[r('mc/router/allocator_core.sv',49),r('mc/router/allocator_core.sv',76),router(185)]},
    {id:'concept-noc-switch',term:'Switch 分配与 Crossbar',english:'Switch allocation / crossbar alignment',category:'noc',definition:'决定本次哪个输入flit实际通过哪个物理输出，并把选择、数据和valid保持同拍。',why:'多个VC共享输入与输出，资源资格必须进一步收敛成实际单次传输。',implementation:'每输入从va_grant & ~ip_empty选VC，再做输出竞争；寄存grant/flit/valid后crossbar按输出mux。',designSteps:['先做2×2crossbar并用不同源标记测试。','加入寄存级时把数据、选择、valid作为同一事务元组一起延迟。'],pitfalls:['只延迟payload，不延迟选择。','multi-hot时mux仍给值，就误以为争用合法。'],invariants:['每输出至多选一输入，每输入本次至多pop一个VC。','有效输出的payload来自同拍选择的输入事务。'],sources:[router(212),router(236),router(249),r('mc/router/crossbar.sv',49)]},
    {id:'concept-noc-wormhole',term:'虫孔传输与队首阻塞',english:'Wormhole / head-of-line blocking',category:'noc',definition:'包头可先向前建立依赖，后续flit逐步跟进；整包可能分布在多个router的有限缓冲中。',why:'每跳无需先缓存完整大包，但前方被阻塞时会将等待传播到后方。',implementation:'HEADER/HT路由记录、grant-hold和TAIL/HT实际出队共同维护包路径；不同VC可复用物理链路。',designSteps:['先固定一个VC并锁定packet直到tail成功发送。','再加第二VC，测试一个VC阻塞时另一VC是否能在其规则允许下前进。'],pitfalls:['在同一VC任意交织两个packet。','认为wormhole保证每个包固定低延迟。'],invariants:['保持每VC的合法包序列。','资源释放必须与实际的尾部完成条件一致。'],sources:[router(165),ip(93),r('mc/router/grant_hold_round_robin_arbiter.sv',56)]},
    {id:'concept-noc-ni',term:'NI 拆包与重组',english:'Packetization / reassembly',category:'noc',definition:'把端点完整消息变为一串flit，并在接收端恢复为供端点消费的完整消息。',why:'端点不应直接管理每一跳、每一flit和链路竞争，端点速度也不一定匹配网络。',implementation:'发送端packet FIFO+IDLE/GEN_FLIT/count；接收端按VC重组payload，TAIL/HT完成后进入packet FIFO，consumed才出队。',designSteps:['先固定长度、单VC、单目的端。','再补HT、变长末片、跨VC交织、端点长期暂停和包宽边界测试。'],pitfalls:['重组完成就立即覆盖尚未消费的packet。','忽略PACKET_BODY_SIZE整除64或只有一flit时的参数边界。'],invariants:['输出packet内容与被接受的输入消息相同。','端点未consumed的队首packet不能被后继packet覆盖。'],sources:[r('mc/network_interface/virtual_network_core_to_net.sv',109),packet(147),r('mc/network_interface/control_unit_flit_to_packet.sv',78),r('mc/network_interface/virtual_network_net_to_core.sv',112)]},
    {id:'concept-noc-multicast',term:'多目标位图与重复单播',english:'Destination bitmap / repeated unicast',category:'noc',definition:'用pending目标位图逐个完成同一消息的多个目的，而不是在网络里执行一个原子广播。',why:'目录失效和服务通知可有多目标，先用重复单播复用已有可靠传输机制。',implementation:'dest_pending=dest_valid & ~dest_served；锁存一个目标；发送完整一份后置served位，全部完成后原包才dequeue。',designSteps:['从单目标传输扩展成pending mask循环。','用不连续目标、空mask和目标间背压检查恰好一次完成。'],pitfalls:['发完第一目标就弹出原packet。','把一个目标mask位误当成独立物理广播端口。'],invariants:['每个声明目标恰好收到一份完整packet。','只有全部目标完成才消耗原始消息。'],sources:[packet(83),packet(106),packet(168),ni(434)]},
    {id:'concept-noc-progress',term:'死锁、饥饿与活性假设',english:'Deadlock / starvation / liveness assumptions',category:'noc',definition:'死锁是资源等待形成无法解除的环，饥饿是某请求长期得不到服务；活性结论需要环境最终允许前进等假设。',why:'网络有活动不意味着每笔事务能完成，缓存协议的响应依赖还能跨越纯路由层。',implementation:'XY限制转向，四消息VN隔离部分协议依赖；但缓冲、grant-hold、端点消费和共享VC仍须共同审查。',designSteps:['画通道依赖图与端点消息等待图，分别说明无环或如何打破环。','在有限背压后解除，观察所有旧事务最终完成；若做有界属性要写公平假设。'],pitfalls:['把4VC当成全系统无死锁的证明。','把持续发送总数增长当成每个源都不饥饿。'],invariants:['已接受事务不能无说明地永久悬挂。','声明的活性保证不得强于接收者与仲裁环境假设。'],sources:[r('mc/router/look_ahead_routing.sv',33),ni(35),ni(539),r('mc/router/grant_hold_round_robin_arbiter.sv',44)]}
  ];
  const workshop = {
    id:'noc',title:'从一条可靠通道到可验证的小型 NoC',subtitle:'按可观察的正确性逐级增加结构；每一步先写接口契约、状态和失败测试，再对照 NaplesPU 的优化。',
    prerequisites:['能区分always_comb与always_ff、当前状态与下一状态。','会给消息定义packed字段，并用时钟沿记录一次实际传输。','理解FIFO计数、one-hot选择及source/destination/sequence测试标记。'],
    steps:[
      {title:'1. 点对点消息与传输事件',goal:'两个端点间恰好一次传送固定宽度消息，暂停时不丢不重。',design:'先选择自写ready/valid教学接口，定义fire=valid&&ready；与NaplesPU的wr_en/on_off区别写在接口注释里。发送端保留未接受消息，接收端用序号比较。',state:'发送端pending寄存器及payload；接收端期望序号。暂时不引入router或缓存协议。',exercise:'让接收端每隔几拍暂停；输入十条不同序号消息，再验证一条不多一条不少且内容相同。',checks:['valid且未ready时payload和valid保持。','仅fire更新发送序号和接收计数。','reset的epoch政策一致，不拿reset前被取消消息作reset后期望。'],sources:[router(48),ni(226)]},
      {title:'2. 可独立验证的环形 FIFO',goal:'用有限缓冲解耦突发生产与间歇消费。',design:'画head、tail、count、mem与full/empty组合关系，规定满时同时pop/push是否接受，不偷换为别的FIFO政策。',state:'读写指针、占用计数、存储阵列；数据有效性由占用状态决定。',exercise:'做4项FIFO并与软件队列对照；跑过两次以上指针环绕，覆盖合法push/pop组合和非法边界。',checks:['count永不超出0..DEPTH。','pop顺序与已接受push一致。','reset/flush后队列为空；不依赖旧mem内容是否清零。'],sources:[fifo(50),fifo(61),fifo(81)]},
      {title:'3. 两个输入争一个输出',goal:'实现唯一选择、背压和明确的公平政策。',design:'先用组合one-hot grant；若采用轮询，仅在定义的服务完成事件更新优先级。将包保留和优先级旋转分别描述。',state:'优先级指针；若需要跨flit保留，再增加owner_valid/owner_input。',exercise:'让两源持续请求，分别测试接收侧一直可用、间歇阻塞、拥有者暂时无新flit。记录每个源等待而不是只看总吞吐。',checks:['grant只能来自合法请求且onehot0。','未完成传输不能误弹出输入FIFO。','若声称有界公平，计数上界只在接收最终许可等假设下断言。'],sources:[r('common/round_robin_arbiter.sv',42),r('mc/router/grant_hold_round_robin_arbiter.sv',44)]},
      {title:'4. 一个五端口、单 VC 的 router',goal:'把FIFO、XY、输出仲裁和crossbar组合成可追踪数据路径。',design:'先普通XY，不做lookahead。为每个输出汇集请求、选一个输入，用相同选择驱动payload和valid；输入只在真实获准时pop。',state:'每输入FIFO；必要的输出流水寄存器；所有事务标记与选择同拍保存。',exercise:'同输出竞争、不同输出并行、LOCAL投递、非法边界方向、尾部被阻塞逐项测试，再对照本项目双层allocation。',checks:['每输出至多一个输入，每输入本次最多pop一个条目。','有效输出destination不变，payload来自对应输入。','新增寄存级后data/valid/selection没有错拍。'],sources:[router(185),router(212),router(249),r('mc/router/crossbar.sv',49)]},
      {title:'5. 2×2 网络与端到端守恒',goal:'证明跨router的路径、连接与背压传播正确。',design:'定义ID=y*2+x，明确东西南北互连和边界。先测试固定长度packet，目标端按source/sequence比较。',state:'每router/链路缓冲，加系统级期望消息队列；没有全局中央移动packet的隐藏捷径。',exercise:'遍历16组源/目的组合，包含自身；同时注入双向流量，暂停一个接收端后解除，检查旧事务全部完成。',checks:['消息不误投递、不重复、不丢失。','暂停端点的在途数量有界且不溢出。','计入在途和接收缓冲后，已接受消息数量满足守恒。'],sources:[r('mc/system/npu_noc.sv',96),r('mc/network_interface/routing_xy.sv',52),ip(69)]},
      {title:'6. 包保留、第二 VC 与 NI',goal:'逐项增加wormhole、消息类别、重组与多目的，保持之前的性质。',design:'先HEADER/TAIL+owner保留，再分VC队列和流控；接着加packetizer/reassembly，最后加dest_pending多目标。随后才比较NaplesPU的header_fifo、grant-hold与lookahead实现。',state:'每VC flit FIFO与route/owner、拆包chunk、重组count、已服务目标mask、完整packet FIFO。',exercise:'交织两个VC，阻塞一个VC，发送连续HT和多flit包；对多目标消息在不同目标之间停顿；最后加入CC/DC消息等待图审查。',checks:['同一接收VC没有未设计的包交织，尾部实际发送后才释放相应拥有关系。','完整packet保持到consumed，所有目标恰好收到一份。','almost_full预留覆盖当前流水时延；路由无环与协议活性分别论证。'],sources:[ip(84),packet(147),r('mc/network_interface/control_unit_flit_to_packet.sv',78),r('mc/network_interface/virtual_network_net_to_core.sv',89)]}
    ]
  };
  const quizzes = [
    {id:'q-deep-noc-polarity',chapter:'deep-noc-contracts',question:'router_credit[VC0] 为1，而 VC0 有pending packet，当前NI应怎样理解？',options:['表示空闲槽位充足，立即推进chunk','该位来自almost_full，高表示阻塞，VC0不能据此获得发送请求','表示该VC已经传完所有目标'],answer:1,explanation:'NI在network_interface_core中使用pending & ~router_credit形成vno_requests；CU的flit_credit则是另一个高有效发送许可，二者不能混同。'},
    {id:'q-deep-noc-header-pop',chapter:'deep-noc-contracts',question:'input_port 的 header_fifo 何时弹出当前packet的路由记录？',options:['HEADER第一次被看见时','HEADER离开flit FIFO时','队首是TAIL/HT且该VC实际获得sa_grant时'],answer:2,explanation:'路由信息要保留给BODY/TAIL；源码dequeue条件同时要求TAIL/HT和sa_grant，不仅是看见尾部或拥有资格。'},
    {id:'q-deep-noc-lookahead',chapter:'deep-noc-router',question:'当前位置(0,0)，目标(1,1)：普通XY当前输出与lookahead准备的下一方向分别是什么？',options:['EAST、SOUTH','SOUTH、EAST','EAST、EAST'],answer:0,explanation:'当前先完成X维走EAST，抵达(1,0)后才走SOUTH。lookahead的xdiff==1分支已经为后一台router准备Y方向。'},
    {id:'q-deep-noc-fairness',chapter:'deep-noc-router',question:'为什么不能只凭 grant_hold_round_robin_arbiter 的名字承诺严格轮转公平？',options:['因为所有仲裁都不能有状态','因为内部基础仲裁器en固定0，且持续hold请求会保留拥有者；公平必须结合连接与服务完成定义','因为4个VC必然对应4个固定周期'],answer:1,explanation:'基础round_robin只有en且requests非零时才更新优先级；包装器的真实en连接与last&hold_in必须一起读。'},
    {id:'q-deep-noc-multicast',chapter:'deep-noc-ni-verification',question:'一条消息有3个目标，当前packetizer怎样完成？',options:['网络自动把一个flit原子复制到全部目标','每个目标发送完整单播，更新dest_served，所有目标完成后才弹出原packet','只要第一个目标收到，就可以覆盖原packet'],answer:1,explanation:'pending=dest_valid&~dest_served；该实现复用多次单播，不是router中的原子广播。'},
    {id:'q-deep-noc-deadlock',chapter:'deep-noc-ni-verification',question:'四个VC与XY路由足以证明整个缓存一致性系统永不死锁吗？',options:['足以，VC数量就是证明','不够，还要审查端点/消息依赖、有限缓冲、资源保留和进展/公平假设','只有把所有FIFO无限增大才可写验证'],answer:1,explanation:'XY针对特定通道依赖，VN隔离消息类别；协议层等待、接收消费和仲裁都可能影响活性。安全与活性也应分别验证。'}
  ];
  return {chapters,concepts,workshop,quizzes};
})();

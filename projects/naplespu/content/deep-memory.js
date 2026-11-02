/* Source-linked cache, coherence and directory implementation course.
 * Official RTL is unmodified; design exercises are deliberately smaller models.
 */
window.NPU_DEEP_MEMORY = (() => {
  const ROOT='source/hardware/src/';
  const CC=ROOT+'mc/cache_controller/', DC=ROOT+'mc/directory_controller/', INC=ROOT+'include/';
  const ref=(path,line,label)=>({path,line,label});
  const sources=(...items)=>items;
  const chapters=[
    {
      id:'impl-cache',title:'把一个缓存拆成可写出的 RTL',eyebrow:'IMPLEMENTATION / CACHE DATAPATH',
      summary:'缓存不是一块“更快的 RAM”：地址定位、tag 比较、读写权限、数据更新、替换和未完成事务共同决定一条请求能否完成。先实现阻塞式最小版本，再理解 NaplesPU 为什么将这些职责拆开。',
      sections:[
        {title:'先算地址位段，再决定真正存什么',paragraphs:[
          '一个字节地址先被拆成 tag、set index、line offset。offset 选缓存行内部的字节；index 选一组候选 way；tag 证明这条物理地址是否就是候选行所代表的地址。way 不占原始地址中的独立位段，它是查找后选出的缓存存放位置。',
          'NaplesPU 的 dcache_address_t 按 tag/index/offset 打包。默认 L1 为32 sets、4 ways、64-byte line，因此 offset=6 bit、index=5 bit、tag=21 bit。L2 默认128 sets、8 ways，同样64-byte line，index=7 bit、tag=19 bit。地址 home 取高位是另一个映射问题，不能把 home ID、L1 index 和 line offset 当同一个字段。',
          '自己从零写时先固定很小的参数，例如4个set、1个way、16-byte line、32-bit地址。写一张布局表，先用软件函数把每个地址还原为 {tag,index,offset}，再写RTL位选。必须保证拼回的行地址正确，特别是 dirty victim 写回时使用的是旧 tag 加当前 set，而不是新请求地址。'
        ],table:{headers:['信息','解决的问题','最小实现的保存位置'],rows:[['tag + valid','这一槽是否保存目标行','每set/way一项tag RAM或寄存器'],['data line','读取和更新字节','每set/way一条数据阵列'],['read/write permission','有数据是否也有访问权限','状态/权限位'],['dirty / byte mask','哪些内容比下层存储新','单bit起步，随后扩展字节位图'],['replacement metadata','组内冲突时选谁','直接映射先不需要，多way后增加PLRU']]},sources:sources(ref(INC+'npu_coherence_defines.sv',43,'L1地址与请求结构'),ref(INC+'npu_defines.sv',83,'L1位宽由来'),ref(INC+'npu_user_defines.sv',68,'默认set/way参数'),ref(INC+'npu_coherence_defines.sv',85,'L2位宽'))},
        {title:'命中不是只比较 tag：数据阵列与权限阵列要协作',paragraphs:[
          'NaplesPU 的数据 L1 并不全部放在 cache_controller.sv 文件里。load_store_unit_stage2 为每个way实例化tag存储，并保存can_read/can_write权限和dirty mask；stage3完成命中判断和数据阵列访问。cache_controller通过专门的snoop和update通道查看、修改这些信息。l1d_cache是把core_interface与控制器连起来的包装。',
          'CC stage2 的 snoop hit 要求 tag 相等，而且 can_read 或 can_write 至少一个为1。LSU stage3又按操作检查所需权限，并处理字节mask与特殊状态。因此“tag匹配”“有可读副本”“有写权限”“load已完成”是不同谓词，不能用一个hit变量替代全部。',
          '自己写单核原型时可从valid/tag命中起步，先不引入一致性。若数据RAM是同步读，响应至少要带一个明确的valid或状态位；把请求地址、操作类型和返回身份在接受请求时锁存。以后加入权限时，将load_hit与store_hit分开，让协议控制器只发受控的元数据更新命令。'
        ],code:{language:'systemverilog',text:`// 官方 cache_controller_stage2.sv:175–176 的命中条件
assign snoop_tag_way_oh[dcache_way] =
    (ldst_snoop_tag[dcache_way] == cc1_request_address.tag) &
    (ldst_snoop_privileges[dcache_way].can_read |
     ldst_snoop_privileges[dcache_way].can_write);`},sources:sources(ref(ROOT+'core/load_store_unit_stage2.sv',339,'tag/权限阵列'),ref(ROOT+'core/load_store_unit_stage3.sv',188,'load命中与权限'),ref(CC+'cache_controller_stage2.sv',173,'snoop比较'),ref(CC+'l1d_cache.sv',143,'L1包装的模块连接'))},
        {title:'store 与 refill 是不同写入来源，字节使能决定不能覆盖什么',paragraphs:[
          '部分store不能改掉同一缓存行里的其他字节。NaplesPU 的 dcache_store_mask_t 每字节一个位，默认一行64个字节对应64位mask。LSU stage3将普通store的使能与is_store_hit相与；数据回填时又根据已有dirty mask决定哪些字节允许从返回行写入。不能简单地把整行返回数据覆盖到可能已被本地写过的字节上。',
          '自己写时最容易理解的第一版是阻塞式缓存：miss期间完全不接受新CPU请求，所以不会有refill与后来的store并发。即便如此，普通store的 byte_enable 仍应逐字节更新。只有在这个版本通过对齐、部分写和load后，才放开并发，并明确“旧脏字节与新回填数据冲突时谁优先”的规则。',
          'RAM的同地址读写语义也必须是接口的一部分。READ_FIRST、WRITE_FIRST、NO_CHANGE不是同一个行为；NaplesPU对不同memory_bank实例的参数和旁路有明确安排。行为仿真寄存器数组跑对，不代表换成FPGA RAM之后时序与读写冲突语义仍然相同。'
        ],bullets:['测试8-bit/16-bit store后整行其他字节保持不变。','测试同一地址读写、不同way同set、refill与元数据更新相邻到达。','先写清RAM读延迟和冲突行为，再决定在哪一级锁存hit、way和data。'],sources:sources(ref(INC+'npu_coherence_defines.sv',47,'字节mask位宽'),ref(ROOT+'core/load_store_unit_stage3.sv',230,'数据阵列写使能'),ref(ROOT+'core/load_store_unit_stage3.sv',285,'dirty mask更新'),ref(ROOT+'core/load_store_unit_stage2.sv',365,'tag旁路说明'))},
        {title:'替换不是把valid清零：先保存 victim 的身份与责任',paragraphs:[
          '组相联缓存需要在未命中时选择空way或victim。NaplesPU 的CC stage2调用tree_plru选择候选；stage3结合候选的权限判断它是否有效，并用旧tag、当前index和offset=0形成被替换行地址。若victim本身还被一个未完成事务占用，不能就地覆盖它。',
          'CC stage3检查 replacement collision：需要填入新行却与在途victim发生冲突时，屏蔽本次请求的更新和唤醒，构造返回消息放进response recycle buffer，再由stage1重排。这里的“重放”是保留事务后再尝试，不是把响应丢掉让网络重传。',
          '自己写write-back缓存时，先锁存victim的旧地址与整行数据，直到下层接收写回。若下层还需要完成确认，再等确认后允许重用槽。一个可验证的阻塞FSM可以是LOOKUP→WRITEBACK（如需）→REFILL→RESP。这个FSM是最小教学设计，不能直接替换NaplesPU四级CC或其一致性协议。'
        ],note:{type:'fact',text:'CC的4个stage表示模块职责分工，不意味着一次miss固定4周期完成。网络、ACK、替换冲突和重放都会延长事务生命周期。'},sources:sources(ref(CC+'cache_controller_stage2.sv',149,'PLRU及碰撞候选'),ref(CC+'cache_controller_stage3.sv',213,'victim地址/替换判断'),ref(CC+'cache_controller_stage3.sv',302,'冲突抑制副作用'),ref(CC+'cache_controller.sv',228,'response recycle buffer'))},
        {title:'MSHR是事务账本：从一个pending寄存器扩展，而不是从并发开始',paragraphs:[
          '阻塞式缓存只需一个pending记录；非阻塞式缓存要让多个miss共存，就需要MSHR把地址、等待线程、协议瞬态、数据/ACK进度保存到响应回来以后。NaplesPU 的mshr_entry_t有valid、地址、thread_id、wakeup_thread、state、waiting_for_eviction、ack_count、inv_ack_received和ack_count_received，数据则放在独立SRAM中。',
          '这里MSHR_SIZE默认是2×THREAD_NUMB，即默认16条；存在9个lookup端口，服务load/store、response、forward、replacement等不同来源。多个查找端口不等于同一时刻能任意写多个条目：更新接口仍带单一update_index和update_entry，冲突由调度与资源规则处理。',
          '尤其不能把mshr_cc的full按名字读成“所有物理slot均用完”。本文件的full来自各set计数的归约或：某个set的pending达到FULL_THRESHOLD（默认3）就限制新分配，以为该set留出替换进展的空间。empty_index另由valid位的priority encoder产生。自己实现时应分别暴露no_free_entry和set_conflict，明确准入策略，并单独测试“所有slot用尽但请求分散在不同set”这种边界，而不是照搬变量名字。'
        ],sources:sources(ref(INC+'npu_coherence_defines.sv',117,'MSHR容量/端口'),ref(INC+'npu_coherence_defines.sv',231,'MSHR记录字段'),ref(CC+'mshr_cc.sv',52,'阈值参数'),ref(CC+'mshr_cc.sv',118,'同set进展约束'),ref(CC+'mshr_cc.sv',179,'full实际表达式'),ref(CC+'cache_controller_stage2.sv',261,'独立MSHR数据SRAM'))}
      ]
    },
    {
      id:'impl-coherence',title:'把一致性协议写成事件、动作与可检查的不变量',eyebrow:'IMPLEMENTATION / COHERENCE PROTOCOL',
      summary:'MSI几个字母只描述稳定权限。真正RTL还要保存正在等待什么、消息可能以什么顺序到达、哪些动作已经执行。以NaplesPU的ROM与MSHR为例，把协议表变成组合决策、时序存储和握手副作用。',
      sections:[
        {title:'先写安全目标：同一行的写权限必须具有排他性',paragraphs:[
          '缓存一致性协调的是同一缓存行在多个私有缓存中的副本与写权限。一个核心若要修改被其他核心共享的行，就必须通过协议处理其他副本；如果最新数据在远端owner的M副本里，读者不能只从旧内存副本拿数据。',
          '先用两个client、一条line写出稳定权限模型：可有多个共享读者；至多一个修改owner；另一个client申请读或写时，必须按规则降级或失效旧owner/其他sharer。再用一个单调递增的“数据版本号”作为参考模型，检查最终拿到的数据是否为允许观察到的最新版本。只检查permission字母不会发现把旧数据送给新owner的错误。',
          'NaplesPU还有U/UW及面向uncached/uncoherent操作的路径，不是只有教科书I/S/M。dir端的STATE_I与L1端I也不能混为一谈：目录的I表示该行仍在目录/L2但不在任何L1；STATE_N表示目录不保存该块，需要向主存取回。'
        ],table:{headers:['观察层次','核心问题','不能推出的结论'],rows:[['Coherence','同一行的副本/权限及消息顺序','所有地址的程序次序和跨地址内存模型'],['Synchronization','参与者是否到达约定同步点','所有脏行自动写回外部存储'],['Flush / visibility','指定行相关写回与外部可见性流程','另一个线程已完成所有计算']]},sources:sources(ref(INC+'npu_coherence_defines.sv',189,'L1实际状态全集'),ref(DC+'directory_protocol_rom.sv',33,'目录I与N的含义'),ref(ROOT+'core/core_interface.sv',38,'flush接口说明'),ref('source/software/examples/kernels/mmsc/mmsc.cpp',32,'barrier与flush分别使用'))},
        {title:'ROM不是神秘存储器：它是一张组合的“状态×事件→动作”表',paragraphs:[
          'cc_protocol_rom以current_state、current_request为输入，always_comb首先为动作包赋默认值，再在unique case中选择规则。输出不只是next_state，还包含分配/释放MSHR、保存返回数据、更新权限、唤醒条件和发送哪类消息。此处的ROM是表驱动控制逻辑写法，不表示必须综合成一块只读RAM。',
          '例如(I,load)发GETS并进入ISd、分配MSHR；ISd收到DATA才转S并释放MSHR/填行。(I,store)发GETM并进入IMad。相同网络DATA会根据来源和剩余ACK进度先翻译成不同内部事件，因此协议表的事件集合比网络packet_type更细。',
          '自己写时分三层：①协议表产生动作；②动作实现层组合出更新条目和出站消息；③只有被接受的事件才在时钟沿提交状态。为每个输出给默认值，避免锁存器；把非法组合显式标为错误或阻塞，不要无声地当成功。先手工覆盖稳定状态，再补每种等待状态下可能到达的事件。'
        ],code:{language:'systemverilog',text:`// 官方 cc_protocol_rom.sv:189–198，I + load 分支摘录
pr_output.send_request        = 1\'b1;
pr_output.is_receiver_dir     = 1\'b1;
pr_output.request             = GETS;
pr_output.next_state          = ISd;
pr_output.allocate_mshr_entry = 1\'b1;`},sources:sources(ref(CC+'cc_protocol_rom.sv',136,'完整默认动作'),ref(CC+'cc_protocol_rom.sv',189,'I+load规则'),ref(CC+'cc_protocol_rom.sv',260,'ISd收到DATA'),ref(INC+'npu_coherence_defines.sv',278,'协议动作包'))},
        {title:'为什么DATA到了还不能写：IMad、IMa、IMd记录不同缺项',paragraphs:[
          '申请M权限需要的数据与失效确认可能走不同通道、以不同次序到达。NaplesPU的IMad表示尚在处理data/ack条件；先收到带非零sharer计数的目录DATA，会保存数据并转IMa等待ACK；若最后ACK先到，会转IMd等待DATA。只有所需条件满足，才转稳定M、填数据并释放MSHR。',
          '这不是在一个变量里反复“减剩余ACK”。实际mshr_entry有期望ack_count、实际inv_ack_received和ack_count_received标志。res_2_creq将DATA与ACK分类；CC stage3的incr_ack_count动作增加inv_ack_received。ROM中的某些旧注释写“Decrement ack count”，应以赋值表达式和比较为准。',
          '自己实现时先用data_received、expected_acks、received_acks三个寄存器和complete谓词，再决定是否编码为多个瞬态。必须覆盖DATA先到、ACK先到、最后ACK与DATA相邻到达、错误来源或重复ACK等情况。对于同一条transaction，不应因为观察到一次DATA就提前开放store。'
        ],code:{language:'systemverilog',text:`// 教学谓词，概念示意；不是NaplesPU直接端口
complete = data_received && expected_acks_known &&
           (received_acks == expected_acks);
// 接收事件时更新各进度，再依据完整规则提交权限。
// 需定义重复ACK、错误transaction以及同拍多个事件的处理。`},note:{type:'fact',text:'目录端可以已记录新的owner，而请求方仍处于等待确认的瞬态。目录更新为M，不能单独证明请求核心已安全完成写入。'},sources:sources(ref(CC+'cc_protocol_rom.sv',288,'IMad的DATA/ACK次序'),ref(CC+'cc_protocol_rom.sv',341,'IMd等待数据'),ref(CC+'cc_protocol_rom.sv',398,'IMa最后ACK完成'),ref(INC+'npu_coherence_defines.sv',331,'响应事件细分'),ref(CC+'cache_controller_stage3.sv',259,'ACK记录实际更新'))},
        {title:'权限、数据与唤醒：三个副作用必须属于同一事务',paragraphs:[
          'CC stage3优先从MSHR取当前状态，因为未完成事务的最新信息在账本里；若没有MSHR命中，才使用缓存稳定状态；再没有则视为I。协议动作随后决定写入哪个way、是否更新LDST权限、是否保存数据、是否释放条目和唤醒哪个thread_id。',
          '这里存在重要的提交门控：replacement collision时request_is_valid为0，MSHR更新、权限更新、稳定状态更新和唤醒都被抑制；响应被重放。若你只让数据写入失败而仍然唤醒线程，就会把“收到一个消息”错误地当成“load得到正确结果”。',
          '自己写最小控制器时把transaction_id、line_addr、requester、op类型锁存为一份pending记录；让响应、数据RAM写使能和权限提交全部引用这份记录，不引用可能已经变化的上游输入。先只允许一个请求在途，响应valid必须保持到被接收，确认其他请求不会改写这份pending，再考虑多slot。'
        ],sources:sources(ref(CC+'cache_controller_stage3.sv',154,'状态选择优先级'),ref(CC+'cache_controller_stage3.sv',280,'LDST数据/权限/唤醒身份'),ref(CC+'cache_controller_stage3.sv',302,'有效事件门控'),ref(CC+'cache_controller_stage4.sv',98,'网络目标与消息构造'))},
        {title:'自己验证协议：从事件矩阵开始，不只跑一次矩阵乘法',paragraphs:[
          '先为每个稳定与瞬态列出允许事件、必须阻塞的事件和可能发出的消息。用小参考模型检查单writer、多reader、数据版本、响应唯一性和事务最终可释放。把backpressure独立随机化：请求方、probe接收方、ACK方与响应接收方都可能暂时停下。',
          '两client单行原型可以先覆盖A读、B读、A写；再覆盖A持M时B读需要downgrade探针，以及A持M时B写需要失效与owner数据交接。web/rtl/learn_directory.sv只实现权限握手，并把probe ACK抽象成“所需owner数据/降级/失效都处理完”；它没有真实数据传送，因此不能用它证明读到了最新值。',
          '加入真实数据后，要专门验证旧owner提供最新行，不能把一个permission-only ACK当成数据本身。扩展到多行、多client和乱序网络时，ACK还要有line/transaction身份，或由协议严格保证唯一的隐式匹配。性能优化必须保持原来已写出的安全和进展约束。'
        ],bullets:['安全：不同时授予两个client可修改同一行的权限。','数据：owner数据传送完成后，新读者/新owner才能使用结果。','握手：未接受请求不改账本；未消费响应时payload与身份保持。','进展：在对方最终响应的假设下，pending不能永久卡住；错误ACK不能冒充完成。'],note:{type:'limit',text:'有限测试和事件模型只能覆盖声明的边界；不证明NaplesPU全协议、所有消息交错或其内存一致性模型。'},sources:sources(ref('web/rtl/learn_directory.sv',1,'权限原型的明确边界'),ref('web/rtl/learn_directory.sv',27,'各通道握手'),ref('web/rtl/learn_directory.sv',41,'锁存请求与探针'),ref(DC+'directory_controller_stage3.sv',428,'真实竞态处理示例'))}
      ]
    },
    {
      id:'impl-directory',title:'directory_controller：从一条行记录到三阶段事务引擎',eyebrow:'IMPLEMENTATION / DIRECTORY CONTROLLER',
      summary:'Directory不是广播器，也不是普通地址译码器。它维护某行的共享者、owner、数据位置与在途责任，决定请求应找谁，并在冲突、替换和返回交错中保留协议进展。',
      sections:[
        {title:'先读顶层账本：L2稳定记录、TSHR瞬态记录与三个入口队列',paragraphs:[
          'directory_controller顶层实例化l2_tshr与三个处理stage，另有instruction request FIFO、replacement/sleep queue和WB generated FIFO。普通网络请求/响应来自NI；取指请求有独立FIFO；替换与某些writeback竞态会产生内部重新调度的工作。接口不是一个简单的CPU request→memory response直连。',
          '稳定的目录state/tag在stage1存储，stage2的数据阵列一起存sharers_list、owner和整行data；瞬态条目在TSHR保存valid、state、address、sharers_list、owner。stage3用“TSHR命中优先、L2命中其次、replacement快照再次、否则N”的次序恢复当前责任。',
          '先把每项字段的作用写成表格：tag/index区分行；sharers位图记录多个共享持有者；owner编号标识当前修改责任；valid说明slot是否分配；state区分稳定和等待；pending身份让后来响应能找到原事务。没有数据阵列也能写权限演示，但不能宣称写出完整目录/L2。'
        ],table:{headers:['模块/结构','保存或处理什么','阅读入口'],rows:[['stage1','选事件、读tag/state、限制发射、发consumed','directory_controller_stage1'],['stage2','tag命中、选择way、读L2 data+sharers+owner','directory_controller_stage2'],['stage3','协议动作、元数据更新、消息/替换生成','directory_controller_stage3'],['l2_tshr','尚未稳定的行及其目录状态','16条、3个lookup端口的瞬态表'],['内部FIFO','独立取指、被替换行、竞态生成WB','顶层明确保留并重调度']]},sources:sources(ref(DC+'directory_controller.sv',143,'顶层队列与TSHR'),ref(DC+'directory_controller.sv',186,'取指FIFO'),ref(DC+'directory_controller.sv',222,'WB竞态FIFO'),ref(INC+'npu_coherence_defines.sv',413,'TSHR记录'))},
        {title:'stage1：仲裁之前先判断，这个事件现在能不能安全处理',paragraphs:[
          'stage1为request、response、replacement分别查TSHR，并用dc_stall_protocol_rom判断当前瞬态是否允许该类请求。request准入还要求TSHR资源和NI输出能力，而且当前实现对dc2_pending或dc3_pending采用保守的整体阻塞；response则检查是否与在途事件同一个set。不能把它概括成“任何不同地址都可以满流水”。',
          '真正的选择顺序以if/else链为准：WB_GEN → replacement → response → request。代码附近有“replacement最高优先级”的旧注释，但WB_GEN分支出现在它之前。consumed/dequeue只对被选中的源置1；未选源必须保留自己的消息，不能因为valid出现过一次就丢弃。',
          '自己实现时先一个入口FIFO、一个事务FSM，弄清accept条件。加入第二种消息后，把“协议允许处理”“资源足够”“仲裁获胜”“消息被消费”分为独立谓词。响应常常是释放资源所必需的工作，必须考虑若新请求占满资源、响应又无法前进是否形成死锁；优先级与公平性也要通过持续竞争测试。'
        ],code:{language:'systemverilog',text:`// 官方stage1调度分支的顺序摘要，不是完整RTL
if      (can_issue_wb_request)          select WB_GEN;
else if (can_issue_replacement_request) select REPLACEMENT;
else if (can_issue_response)            select RESPONSE;
else if (can_issue_request)             select REQUEST;
// select为教学短写；实际同时构造message并发出对应consumed。`},sources:sources(ref(DC+'directory_controller_stage1.sv',176,'三个TSHR查询口'),ref(DC+'directory_controller_stage1.sv',199,'stall ROM'),ref(DC+'directory_controller_stage1.sv',214,'准入条件'),ref(DC+'directory_controller_stage1.sv',263,'真正仲裁次序'))},
        {title:'stage2：先选way，再把数据和目录元数据按同一地址读出来',paragraphs:[
          'stage2比较所有way的valid和tag，形成hit_oh，再编码hit_idx；命中用hit way，未命中用PLRU返回的候选way。memory_bank_1r1w以{index,selected_way}读出一个打包字，其中包含sharers、owner与data。它不是先读数据、再随便找一项owner记录：三者必须对应同一行和同一way。',
          'stage1中tag/state、stage2中data/metadata、stage3反馈写入，使同地址相邻事件出现读写相关。源码用pending和同set限制保护这些关系，memory_bank实例也明确WRITE_FIRST="FALSE"。自己重构时若删除一个stall以提高吞吐，就必须同时补足前递或冲突处理，不能只看到仿真波形“更快”。',
          '最小原型可以把tag/state/owner/sharers/data放在同一个寄存器数组并组合读，降低理解成本。要换同步SRAM时，锁存地址和selected_way，把消息身份与RAM读延迟对齐；然后测试同set不同tag连续请求、回写和查询同拍、填入victim后的第一条访问。'
        ],sources:sources(ref(DC+'directory_controller_stage2.sv',117,'tag命中与way选择'),ref(DC+'directory_controller_stage2.sv',155,'hit或PLRU候选'),ref(DC+'directory_controller_stage2.sv',161,'data/owner/sharers同一RAM字'),ref(DC+'directory_controller_stage2.sv',184,'身份随流水寄存'))},
        {title:'stage3：协议表说“做什么”，更新器决定写哪份状态',paragraphs:[
          'stage3先选当前state/sharers/owner，统计sharer数量，向directory_protocol_rom输入state、事件类型、来源是否owner、是否只有一个sharer等条件。动作位控制下一owner、sharers增加/删除/清空、是否存数据、应发response还是forward、目的地是requestor/owner/sharers/memory。',
          '稳定→瞬态时分配TSHR；瞬态→瞬态且责任改变时更新原TSHR；瞬态→稳定时释放TSHR，再依据动作和有效性决定是否更新或分配L2项。进入瞬态还可能让原稳定缓存项退让，避免同一行同时用过时的稳定信息与新的在途状态各自处理请求。',
          '一个重要例子是目录S收到GETM：ROM可同时发DATA给requestor、发INV给sharers、清共享者并设置新owner。requestor收到的DATA携带sharers_count，而请求方CC的IMad/IMa等状态负责等待足够确认。不要把“目录已经置M”简化成“全部失效ACK已经回到目录且CPU store完成”。'
        ],code:{language:'systemverilog',text:`// 官方 directory_controller_stage3.sv:314–316
assign tshr_allocate   = current_state_is_stable && !next_state_is_stable,
       tshr_update     = !current_state_is_stable & !next_state_is_stable & coherence_update_info_en,
       tshr_deallocate = !current_state_is_stable && next_state_is_stable;`},sources:sources(ref(DC+'directory_controller_stage3.sv',179,'当前状态优先选择'),ref(DC+'directory_controller_stage3.sv',249,'协议ROM输入'),ref(DC+'directory_controller_stage3.sv',269,'owner/sharers组合更新'),ref(DC+'directory_controller_stage3.sv',314,'TSHR生命周期'),ref(DC+'directory_protocol_rom.sv',256,'S+GETM具体动作'),ref(DC+'directory_controller_stage3.sv',391,'DATA与sharers_count'))},
        {title:'替换、取指与竞态：主路径之外也必须保持责任不丢',paragraphs:[
          'L2准备把新块放入一个有效victim way时，stage3将旧tag、state、data、owner和sharers打包成replacement_request，进入sleep/replacement queue以后重新作为协议事件处理。丢掉这份旧记录可能丢掉需要召回的owner或仍有效的共享者，因此inclusive目录的替换不只是清valid。',
          'WB generated队列专门处理PutM/PutAck与recall交错的竞态。源码说明：某些M→I/N的并发转换中，若CC先收到PutAck再收到recall，可能不再产生目录正在等待的WB，于是目录重排PutM以生成后续工作。读这类修补路径时，应画出双方的等待条件和消息到达顺序，而不是把它当成无关例外。',
          '取指FIFO则共享部分发包设施，但stage3构造的是requestor=ICACHE、req_is_uncoherent=1、发给memory的FWD_GETS。普通一致性forward优先；NI可接收时才将取指请求出队。回填在CC stage1按requestor分派给Thread Controller，不访问数据L1阵列。自己写目录时可先不支持取指和替换，但必须把这些缺项写进接口边界与测试说明。'
        ],note:{type:'limit',text:'本课分析的是保存的master源码，不声称所有竞态已正确或已形式证明。新增并发能力前，应先把原先的责任保存与完成条件写成检查器。'},sources:sources(ref(DC+'directory_controller_stage3.sv',410,'victim快照/重调度'),ref(DC+'directory_controller_stage3.sv',428,'PutM/recall竞态说明'),ref(DC+'directory_controller_stage3.sv',366,'取指专用forward消息'),ref(CC+'cache_controller_stage1.sv',469,'ICACHE响应分派'))}
      ]
    }
  ];

  const concepts=[
    {id:'cache-line-address',term:'缓存行与地址切分',english:'Cache line / tag / index / offset',category:'cache',definition:'缓存以行搬运数据，以set定位候选，以tag验证身份，以offset选择行内字节。',why:'若行身份与字节位置混淆，数据看似命中却可能来自另一个地址，victim写回也会写错位置。',implementation:'dcache_address_t是packed struct；默认64-byte line提供6-bit offset，32-set L1提供5-bit index。dirty victim地址由旧tag与当前index重建。',designSteps:['固定小参数并画出地址位段。','写pack/unpack参考函数，测试组内/跨组/跨行边界。','将请求地址和选中的way随RAM读延迟锁存。'],pitfalls:['把way当成原始地址字段。','用新请求tag构造被替换块的写回地址。'],invariants:['同一行的不同offset得到相同tag/index。','重建line_addr后低offset位全为0。'],sources:sources(ref(INC+'npu_coherence_defines.sv',51,'地址结构'),ref(CC+'cache_controller_stage3.sv',216,'victim地址'))},
    {id:'cache-associativity',term:'组相联与way命中',english:'Set associativity / way hit',category:'cache',definition:'一个set提供多个候选槽；同一请求的tag并行比较各way，选出有效命中的位置。',why:'多个热点地址可能映射同一set，增加way降低固定冲突，但增加比较、选择和元数据成本。',implementation:'CC snoop hit同时检查tag与权限，DC stage2形成hit_oh并用oh_to_idx编码；未命中才选择PLRU候选。',designSteps:['先写直接映射cache。','扩展成2-way并实现one-hot hit与数据mux。','加入空way优先和明确的victim策略。'],pitfalls:['默认两个way不可能有相同有效tag，却没有检查。','将tag匹配直接等同于可写权限。'],invariants:['同一set目标tag的有效命中至多一个。','响应数据与命中的way一致。'],sources:sources(ref(CC+'cache_controller_stage2.sv',173,'L1命中'),ref(DC+'directory_controller_stage2.sv',117,'L2各way比较'))},
    {id:'cache-permission',term:'有效性与读写权限',english:'Validity / read-write permission',category:'cache',definition:'一条槽保存数据，不代表它可以被当前load/store使用；协议决定读/写授权。',why:'有副本但未完成失效确认时提前store，会违背单writer约束。',implementation:'dcache_privileges_t分can_read与can_write；LSU与CC通过专用更新通路维持权限、tag和数据关联。',designSteps:['单核用valid区分空槽。','加入readable/writable两个谓词。','使权限提交受完成条件与接受事件门控。'],pitfalls:['只清tag而不撤销访问资格。','把暂存DATA当成已获得M权限。'],invariants:['不可读行不返回成功load。','不可写行不执行普通store命中更新。'],sources:sources(ref(INC+'npu_coherence_defines.sv',66,'权限结构'),ref(ROOT+'core/load_store_unit_stage3.sv',188,'实际load条件'))},
    {id:'cache-byte-mask',term:'字节写使能与dirty mask',english:'Byte enable / dirty mask',category:'cache',definition:'分别描述本次store修改哪些字节，以及缓存行哪些字节具有本地更新。',why:'部分写、返回填充和写回必须保护其他字节，不能随意整行覆盖。',implementation:'默认每64-byte行有64位mask；stage3普通store及refill数据写使能使用不同表达式，并更新dirty记录。',designSteps:['先为每字节写入实现mask。','对照软件数组验证部分store。','再加入回填/旧dirty字节合并策略。'],pitfalls:['把lane mask和byte mask当同一位宽。','refill覆盖本地已经写过的字节。'],invariants:['关闭写使能的字节保持原值。','写回/合并后的非修改字节与参考模型一致。'],sources:sources(ref(INC+'npu_coherence_defines.sv',47,'mask类型'),ref(ROOT+'core/load_store_unit_stage3.sv',230,'写数据控制'))},
    {id:'cache-ram-timing',term:'SRAM读延迟与旁路',english:'SRAM latency / read-during-write',category:'cache',definition:'同步RAM的数据到达周期及同地址读写返回旧值/新值，是流水线接口的一部分。',why:'hit、way、thread与data若没有按相同延迟对齐，单个算式正确也会写错请求。',implementation:'LSU tag使用双读单写memory_bank和旁路；DC stage2的data/metadata RAM声明WRITE_FIRST="FALSE"并配合pending限制。',designSteps:['给RAM wrapper写清读延迟。','锁存地址、操作与身份到响应拍。','为同地址读写选择旁路或stall并写测试。'],pitfalls:['行为数组组合读正确就认为BRAM也正确。','变更RAM模式却不改hazard处理。'],invariants:['响应的身份对应产生该次RAM读的请求。','同地址冲突的行为与接口约定一致。'],sources:sources(ref(ROOT+'core/load_store_unit_stage2.sv',342,'tag RAM'),ref(DC+'directory_controller_stage2.sv',161,'DC RAM模式'))},
    {id:'cache-writeback-victim',term:'write-back与victim责任',english:'Dirty eviction / victim buffer',category:'cache',definition:'替换一个仍保存最新数据或仍有协议责任的行，必须先保存并完成旧块的后续动作。',why:'覆盖旧data/tag后才想起写回，已经无法恢复正确的旧地址和内容。',implementation:'CC stage3构造replaced_way_address；DC stage3将旧state/data/owner/sharers打包到replacement队列。',designSteps:['先阻塞式保存victim地址与数据。','让writeback保持valid直到被接收。','明确写回确认后何时允许复用way。'],pitfalls:['用新地址写回旧数据。','认为只要发出一次valid就完成下层写入。'],invariants:['未移交责任的victim快照不被覆盖。','每个dirty替换的数据被下层正确接收。'],sources:sources(ref(CC+'cache_controller_stage3.sv',213,'CC victim'),ref(DC+'directory_controller_stage3.sv',410,'目录victim快照'))},
    {id:'cache-plru',term:'替换策略与PLRU',english:'Replacement policy / tree PLRU',category:'cache',definition:'元数据近似记录组内使用情况，为缺失的新行选择候选位置。',why:'它影响冲突行为，但不能越过“候选正在参与未完成事务”的安全限制。',implementation:'两级控制都实例化tree_plru；CC的replacement collision还会反馈更新候选，使重试有机会选择别的way。',designSteps:['先用固定或轮询victim策略验证功能。','增加每set替换状态。','把不可替换way从候选规则或重试机制中处理掉。'],pitfalls:['把PLRU近似当严格LRU。','选中victim后不检查在途冲突。'],invariants:['选择的way编号合法。','不能通过替换丢掉仍有责任的行。'],sources:sources(ref(CC+'cache_controller_stage2.sv',149,'PLRU更新'),ref(DC+'directory_controller_stage2.sv',128,'目录PLRU'))},
    {id:'cache-mshr',term:'未完成事务账本',english:'MSHR / Miss Status Holding Register',category:'cache',definition:'保留miss及协议操作的身份、进度和暂存状态，使响应回来后能恢复原请求。',why:'网络延迟与其他线程工作可以重叠，不能靠一根busy信号描述所有在途事务。',implementation:'MSHR保存thread_id、line地址、state和ACK进度，返回数据在独立SRAM；多个lookup来源共享单一更新端口。',designSteps:['从一个pending寄存器起步。','扩为小slot表并定义分配/查找/释放。','验证同一行重复请求、表满、乱序响应和错误匹配。'],pitfalls:['slot释放早于权限/数据完成。','把多个查找端口误认为多个更新端口。'],invariants:['每个返回事件只能匹配相应在途责任。','分配数减释放数与valid条目计数一致。'],sources:sources(ref(INC+'npu_coherence_defines.sv',231,'MSHR字段'),ref(CC+'cache_controller_stage2.sv',209,'MSHR实例'))},
    {id:'cache-transient',term:'协议瞬态与完成条件',english:'Transient state / completion predicate',category:'cache',definition:'记录某条行事务还缺data、ACK、回写确认或其他动作，而非普通程序执行阶段。',why:'网络消息能乱序到达；只用I/S/M无法区分先DATA还是先ACK的等待。',implementation:'IMad、IMa、IMd分别保留不同进度；当前状态优先从MSHR取得，完成后才写稳定状态并释放记录。',designSteps:['列出需要等待的条件。','给每个条件存储位或计数。','穷举事件先后，写状态表与完成谓词。'],pitfalls:['以框图阶段数推导事务周期数。','收到DATA即认为store可完成。'],invariants:['缺少任何必要条件时不能授予完成。','同一事件不能重复完成同一事务。'],sources:sources(ref(CC+'cc_protocol_rom.sv',288,'IMad事件规则'),ref(CC+'cache_controller_stage3.sv',159,'最新状态选择'))},
    {id:'cache-protocol-actions',term:'协议ROM动作包',english:'Protocol action bundle',category:'cache',definition:'组合表把状态与事件映射为下一状态和分配、更新、发包等副作用。',why:'将协议语义与数据选择/存储时序拆开，才能分别检查决策与执行。',implementation:'protocol_rom_entry_t包含allocate/deallocate、权限、消息类型/目标/数据来源；stage3将动作变成更新通道。',designSteps:['先写自然语言状态转移表。','always_comb默认所有动作无副作用。','每个动作增加适用条件与验证覆盖。'],pitfalls:['不赋默认值造成锁存。','只更新next_state却忘了同步保存owner或数据。'],invariants:['非法事件没有意外写使能。','动作与选中的请求身份保持对应。'],sources:sources(ref(INC+'npu_coherence_defines.sv',278,'动作结构'),ref(CC+'cc_protocol_rom.sv',136,'默认组合赋值'))},
    {id:'directory-home',term:'home目录与地址责任',english:'Home directory / address ownership',category:'directory',definition:'每条行通过固定地址映射找到负责协调其副本的目录节点；home不等于当前最新数据owner。',why:'请求方必须知道先问谁，而最新数据又可能在另一个核心中。',implementation:'CC stage4取地址最高clog2(TILE_COUNT)位；默认16位置需要4位，逻辑注释限制方形NoC。',designSteps:['最小设计先统一一个目录。','多目录时写唯一映射函数。','用相同函数驱动硬件、模型和路由测试。'],pitfalls:['把home与L1 set index混淆。','假设所有地址都由memory tile目录处理。'],invariants:['所有参与者对同一行算出同一home。','home与数据来源可以不同而不丢责任。'],sources:sources(ref(CC+'cache_controller_stage4.sv',91,'home映射'),ref(DC+'directory_controller_stage3.sv',249,'owner判定'))},
    {id:'directory-sharers-owner',term:'共享者位图与owner',english:'Sharers bitmap / modified owner',category:'directory',definition:'位图可表示多个读副本持有者；owner编号表示协议当前指定的修改/数据责任方。',why:'写升级需要找到该失效谁；远端修改副本上的最新数据需要找到正确提供方。',implementation:'L2 RAM与TSHR都保存owner和sharers；stage3生成one-hot requestor/owner并按动作增删位图。',designSteps:['两个client用2-bit sharers与1-bit owner。','分别定义S、M时每个字段的合法含义。','扩client数后检查popcount与owner编码边界。'],pitfalls:['owner无效时仍按编号发消息。','误把sharers_list称为只能有一位的one-hot选择。'],invariants:['稳定M下不出现两个修改者。','共享者集合与被授予的读副本责任一致。'],sources:sources(ref(INC+'npu_coherence_defines.sv',413,'字段结构'),ref(DC+'directory_controller_stage3.sv',269,'集合更新'))},
    {id:'directory-n-versus-i',term:'目录N与I的区别',english:'Directory absent vs directory-only resident',category:'directory',definition:'本实现N是目录没有该行信息；I是行仍在目录/L2、但不在任何L1。它们不是同一个“无效”。',why:'N需要向主存取数据，I可使用目录缓存中的数据；替换与回写责任不同。',implementation:'directory_protocol_rom注释明确说明扩展N的原因；找不到TSHR/L2记录时stage3默认STATE_N。',designSteps:['先区分元数据记录存在与否。','分别定义有数据无私有副本、完全缺失两种情况。','逐一写GETS/GETM与replacement的动作。'],pitfalls:['把目录I直接等同L1的I。','目录查无记录却返回未初始化L2数据。'],invariants:['缺失行的请求不能使用无效RAM槽的数据。','状态语义在模型与RTL中一致。'],sources:sources(ref(DC+'directory_protocol_rom.sv',33,'N与I说明'),ref(DC+'directory_controller_stage3.sv',197,'无命中默认N'))},
    {id:'directory-tshr',term:'目录瞬态表',english:'TSHR / transaction state holding register',category:'directory',definition:'保存正在进行目录事务的地址、状态、共享者和owner，使稳定L2记录暂时退让。',why:'等待远端数据或确认时，后续事件必须找到最新责任，不能读取旧的稳定信息。',implementation:'默认16条、3个查找口；稳定转瞬态分配，瞬态完成释放。lookup比较tag+index+valid，不比较行内offset。',designSteps:['先只允许一条pending。','加入按line匹配的slot表。','检查full、同line冲突、释放与新分配同拍的规则。'],pitfalls:['TSHR与L2同时被当成同一行的独立当前状态。','把3个读口解释为可同时更新3条事务。'],invariants:['同一行的当前事务责任唯一。','瞬态信息不能因替换稳定L2槽而丢失。'],sources:sources(ref(DC+'l2_tshr.sv',67,'表阵列'),ref(DC+'l2_tshr.sv',148,'按行查找'),ref(DC+'directory_controller_stage3.sv',314,'分配/释放规则'))},
    {id:'directory-probe-ack',term:'探针、失效与确认',english:'Probe / invalidation / acknowledgement',category:'directory',definition:'目录要求持有者降级或失效；确认是该责任完成的证据，而非一个随意收到的脉冲。',why:'新修改者安全使用权限前，旧副本和最新数据必须按协议完成交接。',implementation:'真实协议使用FWD_GETS/FWD_GETM/INV、DATA、INV_ACK等消息；CC用期望/已收计数判断最后确认。',designSteps:['两client单事务先存pending请求与probe目标。','probe接受后等待匹配目标的ACK。','加入数据传送、事务身份和重复ACK处理再扩并发。'],pitfalls:['响应没有匹配目标/line就当完成。','permission-only ACK被误当作已传回真实数据。'],invariants:['必需数据/确认条件未满足前，请求核心不得用新写权限完成冲突访问。','响应backpressure时保持身份与payload稳定。'],sources:sources(ref(INC+'npu_coherence_defines.sv',215,'网络事件'),ref(INC+'npu_coherence_defines.sv',347,'最后ACK判断'),ref('web/rtl/learn_directory.sv',31,'原型只接受目标ACK'))},
    {id:'directory-replay-progress',term:'重放与资源进展',english:'Replay / resource progress',category:'directory',definition:'暂时无法安全提交的事件被保留并在条件变化后重新调度，避免责任丢失。',why:'替换、同set冲突、瞬态、网络背压和返回交错都会阻止立即执行；丢消息不是解决冲突。',implementation:'DC有replacement与WB_GEN队列；CC有response recycle buffer。MSHR还有同set计数阈值以限制可能互相阻塞的pending。',designSteps:['先用单事务阻塞控制消除重放。','增加有限队列并记录每个事件是否已接受。','加入公平性与最终释放检查，检测无限重放。'],pitfalls:['重放一次就重复发出不可幂等副作用。','资源全给新请求，释放资源的响应却永远无法被处理。'],invariants:['每个已接受事件有且仅有一个完成或明确定义的撤销。','在外部最终响应的假设下，事务最终能前进。'],sources:sources(ref(DC+'directory_controller.sv',222,'WB_GEN队列'),ref(DC+'directory_controller_stage3.sv',410,'replacement重调度'),ref(CC+'cache_controller.sv',228,'响应重放'),ref(CC+'mshr_cc.sv',118,'同set进展约束'))}
  ];

  const workshops=[
    {id:'cache',title:'从零写一个阻塞式cache，再增加并发',subtitle:'先对单核请求与数据正确性负责，再加入协议。此路线是教学构建顺序，不是NaplesPU现有代码的替换补丁。',prerequisites:['同步时序逻辑与组合逻辑分工','valid/ready或request/response握手','字节寻址、RAM读写延迟'],steps:[
      {title:'1 · 写接口契约与无缓存参考模型',goal:'让每个接受的请求恰好得到一个正确响应。',design:'定义CPU侧地址、读写、byte_enable、写数据、request_valid/ready和response_valid/ready；下层先使用固定延迟RAM。',state:'单一pending请求：address、op、data、mask；响应保持寄存器。',exercise:'先写旁路memory adapter，不实现tag。改变请求/响应ready，检查未接受输入不会改变pending。',checks:['请求只在valid&&ready时被接受。','响应被阻塞时data与身份稳定。','reset后没有虚假的有效响应。'],sources:sources(ref(ROOT+'core/core_interface.sv',42,'真实接口责任'))},
      {title:'2 · 加直接映射、只读缓存',goal:'区分hit与miss，并正确取出行内字节。',design:'固定4个set、16-byte line；valid/tag/data数组；hit返回字，miss向下层读整行。',state:'LOOKUP→REFILL→RESP；接受请求后锁存地址。',exercise:'写顺序访问、跨行、同set不同tag冲突；每个结果对照无缓存模型。',checks:['offset与index/tag位段正确。','miss等待期间不接收第二条请求。','同步RAM返回与请求身份对齐。'],sources:sources(ref(INC+'npu_coherence_defines.sv',51,'真实地址分解'),ref(DC+'directory_controller_stage2.sv',120,'有效tag比较'))},
      {title:'3 · 加store与逐字节更新',goal:'部分写不破坏同一行其他字节。',design:'先选write-through或write-back其中一种并写清策略；实现每字节mask和读后写参考检查。',state:'每行增加dirty；写回式miss保留victim副本。',exercise:'对同一行交错8/16/32-bit写，再读取整行；故意让下层停顿。',checks:['mask为0的字节不变。','store命中条件包含所需权限/valid。','写入只在约定提交点发生一次。'],sources:sources(ref(ROOT+'core/load_store_unit_stage3.sv',230,'byte enable'),ref(ROOT+'core/load_store_unit_stage3.sv',285,'dirty更新'))},
      {title:'4 · 加dirty eviction与组相联',goal:'旧行地址/数据在移交责任前不会丢失。',design:'write-back miss时先保存victim并写回，再refill；2-way先用轮询替换，验证后再替换为PLRU。',state:'LOOKUP→WB_REQ→WB_WAIT（若需要）→REFILL→RESP。',exercise:'用多个同set地址反复替换，检查下层内存最终内容；覆盖所有way都有效时的路径。',checks:['写回地址使用旧tag。','writeback未接受时victim保持。','命中way至多一个且选出的victim合法。'],sources:sources(ref(CC+'cache_controller_stage3.sv',213,'victim识别'),ref(ROOT+'common/tree_plru.sv',40,'PLRU组件'))},
      {title:'5 · 将pending扩为小MSHR表',goal:'允许多个独立miss，但不覆盖等待状态。',design:'先2条MSHR，每条line_addr、request_id、state、data_received；明确同line合并或阻塞策略，以及表满行为。',state:'全局调度+每slot状态；单独跟踪free slot与set冲突。',exercise:'乱序返回两个不同line的数据，再注入同line重复请求与表满请求。',checks:['返回按transaction/line匹配正确slot。','释放发生在数据和权限完成以后。','同set不能因全部victim在途而永久互相等待。'],sources:sources(ref(CC+'mshr_cc.sv',52,'MSHR表'),ref(CC+'mshr_cc.sv',118,'同set限制'))},
      {title:'6 · 最后接入两核一致性接口',goal:'把缓存数据面与协议控制面分开验证。',design:'从I/S/M稳定权限与单事务目录开始，增加probe、降级/失效与ACK；再增加真实数据交接和瞬态。',state:'缓存稳定阵列+MSHR瞬态+动作提交门控。',exercise:'跑A读/B读/A写/B读及owner远端读场景，对每次读检查数据版本。',checks:['单writer不变量始终成立。','旧owner最新数据不被下层旧值替代。','barrier和flush分别测试。'],sources:sources(ref(CC+'cc_protocol_rom.sv',169,'状态事件表'),ref(CC+'cache_controller_stage3.sv',302,'副作用门控'))}
    ]},
    {id:'directory',title:'从零写一个两client、单行目录',subtitle:'先完成可观察的权限责任和背压，再逐项增加数据、地址与并发。现有learn_directory只覆盖权限握手，不实现NaplesPU完整协议或二进制接口。',prerequisites:['缓存行、共享读者与修改owner','有限状态机和握手提交','请求身份锁存与不变量检查'],steps:[
      {title:'1 · 先限定模型，不急着加入NoC',goal:'明确每个字段和省略能力。',design:'两个client、一条line、一次只接受一笔事务；I/S/M权限、2-bit sharers、1-bit owner。请求带core与read/write。',state:'权限状态与事务phase分开：permission回答谁可读写，phase回答正在等什么。',exercise:'阅读learn_directory文件头并列出它没有地址、data、L2、replacement、网络等能力。',checks:['不将原型I/S/M数值当NaplesPU编码。','ACK抽象的owner数据责任写入接口说明。','reset后无owner授权、无在途事务。'],sources:sources(ref('web/rtl/learn_directory.sv',1,'教学边界'),ref('web/rtl/learn_directory.sv',21,'两个状态维度'))},
      {title:'2 · 无冲突请求直接返回',goal:'实现I下读、I下写、共享读者加入、owner自身访问。',design:'只在req_valid&&req_ready锁存pending_core/pending_write；无须probe的请求更新权限并进入RESP。',state:'IDLE→RESP→IDLE；RESP在接收端ready前保持。',exercise:'A读再B读，观察sharers=11；A写无其他副本时观察单owner。',checks:['未接受的req不改变账本。','响应core来自锁存值，不是实时req输入。','resp_ready=0时输出稳定且第二请求不被接受。'],sources:sources(ref('web/rtl/learn_directory.sv',27,'请求/响应握手'),ref('web/rtl/learn_directory.sv',41,'锁存请求'))},
      {title:'3 · 写升级需要INV，远端读M需要降级',goal:'不会跳过其他client尚未完成的责任。',design:'若A要写而B有副本，对B发失效probe；若B读而A持M，对A发downgrade probe。',state:'IDLE→PROBE→WAIT_ACK→RESP；pending保存申请者、操作与target。',exercise:'S(A,B)下A写，再M(A)下B读；分别观察probe_downgrade=0与1。',checks:['probe未被接受前不进入等待ACK。','错误core的ACK不能被consume。','匹配ACK前不能把冲突请求完成给新owner。'],sources:sources(ref('web/rtl/learn_directory.sv',44,'冲突识别'),ref('web/rtl/learn_directory.sv',57,'probe/ACK提交'))},
      {title:'4 · 给权限模型补上真实data和版本',goal:'不仅权限互斥，还能读到正确内容。',design:'增加line data与版本参考值；M owner的probe必须返回最新数据。失效/降级确认与数据传送完成条件分开描述。',state:'data_received、probe_done、expected_source；不能用无payload ACK替代data。',exercise:'A写入版本1后B读，故意让内存仍为旧版本0，检查必须取owner最新值。',checks:['授予响应前所需data存在。','正确来源/transaction才能更新数据。','发送路径受背压时不覆盖暂存行。'],sources:sources(ref(INC+'npu_coherence_defines.sv',262,'真实响应带data'),ref(DC+'directory_protocol_rom.sv',368,'M下GETS转发owner'))},
      {title:'5 · 从一行扩展到少量地址与目录RAM',goal:'每个地址保留独立稳定记录，事务仍可先全局阻塞。',design:'加入tag/index、valid、owner、sharers和data；明确N与目录I的差别。同步RAM需要把request身份延迟到读出拍。',state:'LOOKUP加事务FSM；先不用TSHR，每次只处理一行。',exercise:'交错访问同set不同tag，替换时保存victim全部责任；检查两行状态不串。',checks:['命中元数据与data来自同一way。','无命中不读取未初始化数据。','替换被其他client持有的行时执行所需召回。'],sources:sources(ref(DC+'directory_controller_stage2.sv',161,'L2存储布局'),ref(DC+'directory_protocol_rom.sv',33,'N与I'),ref(DC+'directory_controller_stage3.sv',410,'替换快照'))},
      {title:'6 · 最后加入TSHR、消息类别与并发',goal:'让新吞吐不破坏事务身份、响应进展和替换安全。',design:'按line分配少量TSHR；把request/response/replacement的准入分开；增加ACK计数、replay和输出队列，逐项定义资源上限。',state:'稳定RAM+TSHR瞬态；每类消息有明确接受、阻塞、释放和优先级。',exercise:'构造DATA先/ACK先、PutM与recall交错、同set冲突、TSHR满和随机输出背压。',checks:['同一行当前责任唯一。','资源不足时已接受的消息不丢失。','在公平网络与最终响应假设下不会无限重放或永久卡住。'],sources:sources(ref(DC+'directory_controller_stage1.sv',214,'真实准入'),ref(DC+'directory_controller_stage3.sv',314,'TSHR生命周期'),ref(DC+'directory_controller_stage3.sv',428,'竞态责任保留'))}
    ]}
  ];

  const quizzes=[
    {id:'q-impl-cache-bits',chapter:'impl-cache',question:'默认L1的32sets、64-byte line、32-bit地址，对应index/offset/tag分别是多少？',options:['5 / 6 / 21 bit','2 / 6 / 24 bit，因为4way占2位地址','7 / 6 / 19 bit'],answer:0,explanation:'index=log2(32)=5，offset=log2(64)=6，tag=32−5−6=21；way是候选存放位置，不是独立原始地址位段。'},
    {id:'q-impl-cache-victim',chapter:'impl-cache',question:'替换脏victim时，应使用哪个地址向下层写回旧数据？',options:['新请求的完整地址','旧victim的tag + 该set index + offset=0','仅使用way编号'],answer:1,explanation:'同set冲突的两个地址有不同tag。CC stage3用snoop旧tag和当前index构造replaced_way_address，不能把旧数据写到新请求块。'},
    {id:'q-impl-data-acks',chapter:'impl-coherence',question:'GETM请求先收到DATA但仍有失效确认未到，能否立即当成稳定M完成？',options:['能，DATA一定意味着所有ACK已到','不能，保存数据并等待所需ACK条件，源码存在IMa等瞬态','只能通过清空所有线程解决'],answer:1,explanation:'cc_protocol_rom将带未完成确认的DATA映射到IMa等等待状态；只有数据和确认条件都满足才释放MSHR并稳定提交权限。'},
    {id:'q-impl-dc-state',chapter:'impl-directory',question:'NaplesPU目录端STATE_I与STATE_N有什么区别？',options:['完全相同，都是L1没有数据','I表示行仍在目录/L2但无L1副本；N表示目录没有该行信息','N专门表示有多个修改owner'],answer:1,explanation:'directory_protocol_rom文件头明确解释了新增N的原因；目录I不能套用私有L1的I语义。'},
    {id:'q-impl-dc-priority',chapter:'impl-directory',question:'保存版本DC stage1实际if/else仲裁顺序是什么？',options:['request→response→replacement→WB_GEN','WB_GEN→replacement→response→request','所有来源同时被consume'],answer:1,explanation:'应读263行开始的分支链。附近“replacement最高”的旧注释没有覆盖前面的WB_GEN分支；未获选的源不被consume。'},
    {id:'q-impl-tshr',chapter:'impl-directory',question:'目录有TSHR命中时，为什么stage3优先使用它而不是L2里的稳定记录？',options:['因为TSHR保留正在进行事务的最新责任/瞬态','因为TSHR是所有数据的唯一存储位置','因为L2从不保存owner与sharers'],answer:0,explanation:'TSHR保存正在等待的state、address、owner、sharers；稳定记录在进入瞬态时可能已退让，旧状态不能与在途责任各自独立处理同一行。'},
    {id:'q-impl-msi-ack',chapter:'impl-coherence',question:'learn_directory的probe ACK足以证明真实系统拿到了最新数据吗？',options:['足以，它已实现完整owner数据传送','不够；此权限原型把所需数据/失效工作抽象成ACK，真实数据路径需另外实现验证','只要图中显示M就不需要数据'],answer:1,explanation:'文件头明确无地址、无payload、无L2和网络。它可教权限责任与握手，但数据版本与传送完成必须在扩展后单独验证。'},
    {id:'q-impl-cache-full',chapter:'impl-cache',question:'读到mshr_cc.full，能否仅凭名字认定所有物理slot都用完？',options:['可以，full从来只有这一种含义','不能；这里full由同set计数达到阈值的归约或形成，free slot编码另有逻辑','它表示所有NoC队列为空'],answer:1,explanation:'mshr_cc:155–179检查set_counter与FULL_THRESHOLD，并assign full=|is_set_full；读者还需核对empty_index等独立逻辑和资源准入边界。'}
  ];
  return {chapters,concepts,workshops,quizzes};
})();

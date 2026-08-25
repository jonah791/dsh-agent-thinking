/**
 * 思维模块库（提示词层面 MoE）。
 *
 * 每个模块是一段精炼的思维方式指令：激活时注入 system prompt，改变模型对当前任务的
 * 处理姿态（对应 MoE 中「提示词激活不同专家」）。模块按认知流分五层：
 *   感知（输入）→ 推演（处理）→ 执行（行动）→ 交付（输出）→ 反馈（迭代）
 *
 * 组合拳原则（主人 2026-08-21 定稿）：
 * - 拒绝全量加载：单次最多建议 3 个嵌套模块（store 层软警告）
 * - critical 强制后置：plan/design 通过 autoPair 自动附带 critical（方案生成后必过审查）
 */

/** 认知流分层 */
export type ThinkingLayer = 'perceive' | 'reason' | 'act' | 'deliver' | 'feedback'

/** 分层显示名 */
export const LAYER_LABEL: Record<ThinkingLayer, string> = {
  perceive: '感知层（输入）',
  reason: '推演层（处理）',
  act: '执行层（行动）',
  deliver: '交付层（输出）',
  feedback: '反馈层（迭代）',
}

/** 一个思维模块定义 */
export interface ThinkingModule {
  /** 稳定 id（think_load/unload 用；kebab-case） */
  id: string
  /** 中文名 */
  name: string
  /** 所属认知流分层 */
  layer: ThinkingLayer
  /** 一句话用途（think_list / think_suggest 展示） */
  summary: string
  /** 触发关键词（think_suggest 匹配用；小写） */
  triggers: string[]
  /** 加载本模块时自动附带的模块 id（组合拳：critical 强制后置） */
  autoPair?: string[]
  /** 注入 system prompt 的指令正文（精炼、直接、可执行） */
  body: string
}

/**
 * 14 模块库（感知 3 / 推演 3 / 执行 3 / 交付 3 / 反馈 2）。
 * body 用第二人称直陈句式，聚焦「改变思维姿态」，不重复任务内容。
 */
export const MODULES: readonly ThinkingModule[] = [
  // ---------- 感知层（输入） ----------
  {
    id: 'research',
    name: '取证思维',
    layer: 'perceive',
    summary: '带着问题主动调查：先取证再行动，证据纪律，不猜',
    triggers: ['调查', '取证', '查', '核实', '确认', '研究', '找', '搜索', '定位信息'],
    body: '以取证姿态处理当前任务：先收集证据再下结论，不凭印象猜测。每条关键判断标注依据来源；证据不足时明确说「未验证」，不虚构。遇到不确定的行为，先查本地实现、官方仓库、文档，再行动。',
  },
  {
    id: 'distill',
    name: '萃取思维',
    layer: 'perceive',
    summary: '海量/杂音/矛盾信息降维：去噪、锚定矛盾、提取变量、一句话本质',
    triggers: ['分析文档', '提炼', '总结', '阅读', '理解', '文档很长', '信息过载', '整理'],
    body: '当前输入是庞杂或矛盾的原始信息：先剔除噪音与重复，锚定相互矛盾的点（矛盾处往往藏着真相），提取核心变量与第一性原理，最后用一句话概括本质。提炼出的结论标注置信度，不把二手信息当一手事实。',
  },
  {
    id: 'empathize',
    name: '共情思维',
    layer: 'perceive',
    summary: '从利益相关者视角评估：立场、隐性需求、人性阻力',
    triggers: ['用户', '需求', '老板', '同事', '协作', '沟通', '团队', '利益', '接受度'],
    body: '切换视角看当前问题：相关方（用户/老板/同事/客户）各自的立场、隐性需求与情绪。评估方案的接受度与落地阻力——哪些人会反对、为什么、阻力点在哪。标注非理性风险（习惯、面子、利益冲突），不假设「方案好就有人用」。',
  },
  // ---------- 推演层（处理） ----------
  {
    id: 'design',
    name: '设计思维',
    layer: 'reason',
    summary: '架构与方案设计：接口、权衡、扩展点，先画边界再填细节',
    triggers: ['设计', '架构', '方案', '接口', '模块', '系统', '实现', '架构设计'],
    autoPair: ['critical'],
    body: '按系统设计姿态处理：先明确边界与接口（输入/输出/契约），再谈实现细节。列出关键权衡（每个取舍注明代价与理由），预留扩展点但不过度设计。设计完成后必须用批判思维自我审查一遍。',
  },
  {
    id: 'plan',
    name: '规划思维',
    layer: 'reason',
    summary: '多步任务拆解：里程碑、依赖、风险、验收标准',
    triggers: ['计划', '规划', '任务', '步骤', '分步', 'todo', '里程碑', '执行计划'],
    autoPair: ['critical'],
    body: '把任务拆成可执行的步骤：明确先后依赖、里程碑与每步的验收标准。标注风险点与备选路径，估算每步成本。规划完成后必须用批判思维检查假设与盲区。',
  },
  {
    id: 'inversion',
    name: '逆向思维',
    layer: 'reason',
    summary: '从失败反推：墨菲预演、反向假设、防患于未然',
    triggers: ['风险', '失败', '反推', '最坏', '预演', '隐患', '会出问题', '防御'],
    body: '从反面审视：如果这件事注定失败，最可能的原因是什么？做一次墨菲预演——列出会出问题的点、会被忽视的假设、会失效的依赖。为高风险点设计兜底，不只做「正向正确」，更做「反向不崩」。',
  },
  // ---------- 执行层（行动） ----------
  {
    id: 'debug',
    name: '调试思维',
    layer: 'act',
    summary: '排障：复现、二分、根因定位，对症一次到位',
    triggers: ['报错', 'bug', '故障', '失败', '异常', '修复', '排查', '错误'],
    body: '以排障姿态处理：先复现问题并缩小范围（二分定位），再读错误定位根因类别（语法/路径/权限/时序）。每次修改对症根因、一次到位，不无脑重试同一失败。验证修复时覆盖边界场景，确认根因真的消除而非掩盖。',
  },
  {
    id: 'focus',
    name: '专注思维',
    layer: 'act',
    summary: '深任务：单目标、排除干扰、深度工作',
    triggers: ['深入', '专注', '长期', '复杂', '难', '深度', '攻坚'],
    body: '进入深度工作状态：锁定唯一目标，排除无关分支与完美主义杂音。遇到分叉先记录不展开，保持主线推进。复杂问题允许慢，但每一步都让系统更接近完成，不原地打转。',
  },
  {
    id: 'adapt',
    name: '应变思维',
    layer: 'act',
    summary: '计划失效的中间态：识别硬约束、舍弃沉没成本、次优解、补丁排序',
    triggers: ['变化', '意外', '突发', '失效', '止损', '变更', '紧急', '计划变了', '依赖断了'],
    body: '当前计划正在执行但现实已变：先识别不可变约束（哪些必须保住），果断舍弃沉没成本（不纠结已投入），在残局中找最小成本路径的次优解。按风险排序打补丁：先止血、再恢复、后优化，每步验证。',
  },
  // ---------- 交付层（输出） ----------
  {
    id: 'write',
    name: '写作思维',
    layer: 'deliver',
    summary: '文档与汇报：结构清晰、密度克制、直达要点',
    triggers: ['文档', '报告', '写', '汇报', '说明', '记录', 'markdown'],
    body: '以写作姿态输出：先定结构再落笔，标题即结论。保持信息密度克制——每句话都有信息量，删除修饰与废话。精确数字与路径原文保留，不模糊化。面向读者组织，不面向自己。',
  },
  {
    id: 'persuade',
    name: '说服思维',
    layer: 'deliver',
    summary: '推动采纳：受众画像、抓手前置、损失厌恶、行动召唤',
    triggers: ['说服', '推销', '推动', '申请', '汇报', '评审', '争取', '提案', '对外'],
    body: '目标是让对方采纳并行动：先画像受众（技术派/业务派/决策者关注点不同），把最有力的抓手前置（先给结论与收益）。善用损失厌恶（不做的代价）与具体行动召唤（下一步是什么）。语气服务于说服力，不堆术语。',
  },
  {
    id: 'decision',
    name: '决策思维',
    layer: 'deliver',
    summary: '定案：选项、成本收益、机会成本，明确取舍并留痕',
    triggers: ['选择', '决定', '决策', '选型', '方案对比', '权衡', '定夺', '敲定'],
    body: '面对多个选项时做显式决策：列出选项与各自成本/收益/风险，标注机会成本（选了 A 放弃了什么）。给出明确取舍理由并留痕（为什么是这个不是那个），不模糊两可。决策后锁定执行，不反复横跳。',
  },
  // ---------- 反馈层（迭代） ----------
  {
    id: 'critical',
    name: '批判思维',
    layer: 'feedback',
    summary: '审查：挑战假设、找盲区、防自证偏差（plan/design 强制后置）',
    triggers: ['审查', '检查', '复核', '验证', '挑错', '审视', '自检', 'review'],
    body: '以审查者姿态审视当前成果：主动挑战自己方案的假设，找被忽视的盲区与边界情况，警惕自证偏差（只想证明自己对）。逐条问「什么情况下这个会错」。发现问题直接指出并修正，不为了显得顺利而跳过。',
  },
  {
    id: 'review',
    name: '复盘思维',
    layer: 'feedback',
    summary: '交付后沉淀：经验、教训、可复用模式，落盘闭环',
    triggers: ['复盘', '总结', '经验', '教训', '沉淀', '反思', '回顾', '收尾'],
    body: '为刚完成的工作做复盘：哪些有效（可复用模式）、哪些失败（根因与教训）、哪些下次要改。把结论落成可检索的沉淀（记忆/技能/文档），不留在对话里。区分事实与归因，教训要具体到可执行。',
  },
]

/** id → 模块 索引 */
export const MODULE_BY_ID: ReadonlyMap<string, ThinkingModule> = new Map(
  MODULES.map((module) => [module.id, module]),
)

/** 按认知流分组（层 → 模块列表） */
export function groupByLayer(): Map<ThinkingLayer, ThinkingModule[]> {
  const groups = new Map<ThinkingLayer, ThinkingModule[]>()
  for (const layer of Object.keys(LAYER_LABEL) as ThinkingLayer[]) groups.set(layer, [])
  for (const module of MODULES) groups.get(module.layer)?.push(module)
  return groups
}

/** 渲染激活模块为注入文本（空激活返回空串——section 装配时被 drop，零上下文成本） */
export function renderActiveModules(modules: readonly ThinkingModule[]): string {
  if (modules.length === 0) return ''
  const header = modules.map((m) => `${m.id}（${m.name}）`).join(' · ')
  const bodies = modules.map((m) => `## ${m.name}（${m.id}）\n${m.body}`).join('\n\n')
  return `【思维模块·已激活 ${modules.length} 个】${header}\n请按以下思维模块处理当前任务：\n\n${bodies}`
}

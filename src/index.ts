/**
 * dsh-agent-thinking：思维插件（提示词层面 MoE，主人 2026-08-21 定稿）。
 *
 * 核心思想（MoE 类比）：不同提示词激活模型中不同的「专家」回路。本插件把 14 种思维方式
 * 模块化，任务相关时通过工具动态加载对应模块，注入 system prompt——等价于在提示词层面
 * 「切换专家」，且不用的模块零成本（未激活时动态段返回空串，装配时被 drop）。
 *
 * 机制：
 * - `ctx.systemPrompt.section` 注册动态段（text 为函数，每次装配求值）→ 渲染当前激活模块
 * - 工具控制激活状态（think_load/unload/clear），think_suggest 辅助判断，注入与否归 agent
 * - 组合拳：plan/design 加载时 autoPair 自动附带 critical；激活超上限给软警告
 *
 * 认知流五层：感知（research/distill/empathize）→ 推演（design/plan/inversion）
 * → 执行（debug/focus/adapt）→ 交付（write/persuade/decision）→ 反馈（critical/review）
 *
 * 决策自证轨迹（2026-09-14 S4 证据层）：每次决策落一行 `<DSH_HOME>/thinking-trace.jsonl`
 * （阶段 boot/load/unload/clear/suggest/inject），纯逻辑与 IO 见 ./trace.ts。
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { fileURLToPath } from 'node:url'
import { LAYER_LABEL, MODULES, groupByLayer, renderActiveModules, type ThinkingModule } from './modules.ts'
import { ThinkingStore, suggestForTask, type SuggestHit } from './store.ts'
import {
  buildStamp,
  describeLoadBasis,
  describeSuggestBasis,
  injectSignature,
  layersOf,
  readPackageVersion,
  thinkingTrace,
  type ThinkingTraceEntry,
} from './trace.ts'

export const name = 'agent-thinking'
export const inject = ['systemPrompt', 'tools'] as const

// 构建自证（Q1）：<version>@<index 模块 mtime ms>——版本号会说谎，mtime 不会。
const OWN_FILE = fileURLToPath(import.meta.url)
const BUILD = buildStamp(OWN_FILE, readPackageVersion(OWN_FILE))

/** 记一笔思维决策轨迹（吞错：观测绝不反噬决策——写不进去也照常思考）。 */
function recordDecision(entry: Omit<ThinkingTraceEntry, 'atMs' | 'build'>): void {
  thinkingTrace({ build: BUILD, ...entry })
}

/** 插件配置 */
export interface Config {
  /** 注入开关（false 关闭动态段，工具仍可用仅预览） */
  injectEnabled: boolean
  /** 激活模块软上限（组合拳原则：拒绝全量加载） */
  maxActiveModules: number
  /** autoPair 组合拳（plan/design 自动附带 critical） */
  autoPairEnabled: boolean
  /** 动态段在 system prompt 中的排序（0=persona，100=工具指导；取 50 在人格后工具前） */
  sectionOrder: number
}

export const Config: z<Config> = z.object({
  injectEnabled: z.boolean().default(true),
  maxActiveModules: z.number().default(3),
  autoPairEnabled: z.boolean().default(true),
  sectionOrder: z.number().default(50),
})

/** 模块列表渲染（think_list 用）：按认知流分组 */
function renderModuleList(activeIds: Set<string>): string {
  const lines: string[] = []
  for (const [layer, modules] of groupByLayer()) {
    lines.push(`## ${LAYER_LABEL[layer]}`)
    for (const module of modules) {
      const marker = activeIds.has(module.id) ? '●' : '○'
      lines.push(`- ${marker} ${module.id}（${module.name}）：${module.summary}`)
    }
  }
  return lines.join('\n')
}

/** 激活列表渲染（think_status 用） */
function renderActiveList(modules: ThinkingModule[]): string {
  if (modules.length === 0) return '（未激活任何思维模块）'
  return modules.map((m, index) => `${index + 1}. ${m.id}（${m.name}）· ${m.summary}`).join('\n')
}

/** 建议渲染（think_suggest 用） */
function renderSuggestions(task: string, hits: SuggestHit[]): string {
  if (hits.length === 0) return `任务「${task}」未命中任何思维模块关键词（可手动 think_load 指定）`
  const lines = hits.map((hit, index) =>
    `${index + 1}. ${hit.id}（${hit.name}）· 命中 ${hit.score} 词 [${hit.matched.join(', ')}]：${hit.summary}`)
  return `任务「${task}」推荐思维模块：\n${lines.join('\n')}`
}

/** 工具注册（决策即落轨迹：每次 load/unload/clear/suggest 一行，见 trace.ts）。 */
function registerThinkingTools(ctx: Context, store: ThinkingStore, autoPairEnabled: boolean): void {
  const definitions: ToolDefinition[] = [
    defineTool({
      name: 'think_list',
      description: '列出全部思维模块（按认知流五层分组，●=已激活）——选模块前先看清单',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
        render: (args, value) => [{ type: 'text', text: value.text ?? '' }],
      },
      async execute() {
        const activeIds = new Set(store.activeList().map((m) => m.id))
        return { text: renderModuleList(activeIds) }
      },
    }),
    defineTool({
      name: 'think_status',
      description: '查看当前已激活的思维模块（含组合拳附带）',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
        render: (args, value) => [{ type: 'text', text: value.text ?? '' }],
      },
      async execute() {
        return { text: `已激活 ${store.activeList().length} 个思维模块：\n${renderActiveList(store.activeList())}` }
      },
    }),
    defineTool({
      name: 'think_load',
      description: '加载思维模块（任务相关时调用，注入 system prompt 改变思维方式）。plan/design 会自动附带 critical 审查；激活超过上限会警告（决策归你，不强制）',
      parameters: {
        module: { type: 'string', required: true, description: '思维模块 id（think_list 查看，如 plan/debug/critical）' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            loaded: { type: 'array', items: { type: 'string' }, required: true },
            warnings: { type: 'array', items: { type: 'string' }, required: true },
          },
        },
        render: (args, value) => [{
          type: 'text',
          text: `已激活：${(value.loaded ?? []).join(', ') || '（无）'}${(value.warnings ?? []).length > 0 ? `\n⚠ ${(value.warnings ?? []).join('\n⚠ ')}` : ''}`,
        }],
      },
      async execute(args) {
        const startedAt = Date.now()
        const before = store.activeList().map((module) => module.id)
        const result = store.load(args.module)
        const after = store.activeList().map((module) => module.id)
        recordDecision({
          phase: 'load',
          action: 'think_load',
          durationMs: Date.now() - startedAt,
          layers: layersOf(after),
          modules: result.loaded,
          basis: describeLoadBasis({ requested: args.module, before, after, autoPairEnabled }),
          activeCount: after.length,
          ok: result.ok,
          ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
          ...(result.ok ? {} : { error: '未知思维模块：' + args.module }),
        })
        return result
      },
    }),
    defineTool({
      name: 'think_unload',
      description: '卸载思维模块（任务切换时清理，防止思维污染）',
      parameters: {
        module: { type: 'string', required: true, description: '要卸载的思维模块 id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            removed: { type: 'boolean', required: true },
          },
        },
        render: (args, value) => [{ type: 'text', text: value.removed === true ? `已卸载 ${args.module ?? ''}` : `未激活 ${args.module ?? ''}（无需卸载）` }],
      },
      async execute(args) {
        const startedAt = Date.now()
        const removed = store.unload(args.module)
        const after = store.activeList().map((module) => module.id)
        recordDecision({
          phase: 'unload',
          action: 'think_unload',
          durationMs: Date.now() - startedAt,
          layers: layersOf(after),
          modules: [args.module],
          basis: removed ? 'explicit:think_unload(' + args.module + ')' : 'noop:未被激活(' + args.module + ')',
          activeCount: after.length,
          ok: removed,
        })
        return { removed }
      },
    }),
    defineTool({
      name: 'think_clear',
      description: '清空全部激活的思维模块（新任务开始/回归默认状态时用）',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { cleared: { type: 'boolean', required: true } } },
        render: (args, value) => [{ type: 'text', text: value.cleared ? '已清空全部思维模块' : '本来就没有激活模块' }],
      },
      async execute() {
        const startedAt = Date.now()
        const had = store.activeList().map((module) => module.id)
        store.clear()
        recordDecision({
          phase: 'clear',
          action: 'think_clear',
          durationMs: Date.now() - startedAt,
          layers: layersOf(had),
          modules: had,
          basis: 'explicit:think_clear',
          activeCount: 0,
          ok: had.length > 0,
        })
        return { cleared: had.length > 0 }
      },
    }),
    defineTool({
      name: 'think_suggest',
      description: '任务描述 → 推荐思维模块（按关键词命中打分；仅建议，加载与否由你决策）',
      parameters: {
        task: { type: 'string', required: true, description: '任务描述（当前要做什么）' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true },
            hits: { type: 'array', items: { type: 'string' }, required: true },
          },
        },
        render: (args, value) => [{ type: 'text', text: value.text ?? '' }],
      },
      async execute(args) {
        const startedAt = Date.now()
        const task = args.task ?? ''
        const hits = suggestForTask(task, 5)
        recordDecision({
          phase: 'suggest',
          action: 'think_suggest',
          durationMs: Date.now() - startedAt,
          layers: layersOf(hits.map((hit) => hit.id)),
          modules: hits.map((hit) => hit.id),
          basis: describeSuggestBasis(hits),
          activeCount: store.activeList().length,
          ok: true,
          task: task.slice(0, 120),
        })
        return { text: renderSuggestions(task, hits), hits: hits.map((h) => h.id) }
      },
    }),
  ]
  for (const definition of definitions) ctx.tools.register(definition)
}

export function apply(ctx: Context, config: Config): void {
  console.log('[dsh-agent-thinking] apply', new Date().toISOString(), '(HMR probe)')
  const store = new ThinkingStore(config.maxActiveModules, config.autoPairEnabled)

  // 进程级自报（Q1）：配置快照落一行，排障时先看「线上跑的是哪套配置」
  recordDecision({
    phase: 'boot',
    action: 'apply',
    durationMs: 0,
    layers: [],
    modules: [],
    basis: `boot: inject=${String(config.injectEnabled)} maxActive=${String(config.maxActiveModules)} autoPair=${String(config.autoPairEnabled)} order=${String(config.sectionOrder)}`,
    activeCount: 0,
    ok: true,
  })

  // 动态段：渲染当前激活模块；未激活返回空串（装配时被 drop，零上下文成本）
  if (config.injectEnabled) {
    // 注入状态变化才记一行（同一激活集合重复装配不写——避免每步噪音）
    let lastInjectSignature = ''
    const disposeSection = ctx.systemPrompt.section({
      name: 'thinking-modules',
      order: config.sectionOrder,
      text: () => {
        const active = store.activeList()
        const ids = active.map((module) => module.id)
        const text = renderActiveModules(active)
        if (text === '') {
          lastInjectSignature = '' // 空激活 = 注入归零，下次同集合重新记
          return text
        }
        const signature = injectSignature(ids)
        if (signature !== lastInjectSignature) {
          lastInjectSignature = signature
          recordDecision({
            phase: 'inject',
            action: 'systemPrompt.section',
            durationMs: 0,
            layers: layersOf(ids),
            modules: ids,
            basis: `section:thinking-modules order=${String(config.sectionOrder)}`,
            activeCount: ids.length,
            ok: true,
            chars: text.length,
          })
        }
        return text
      },
    })
    ctx.effect(() => disposeSection, 'agent-thinking.section')
  }

  registerThinkingTools(ctx, store, config.autoPairEnabled)
  ctx.logger('agent-thinking').info(`ready: ${MODULES.length} modules, inject=${config.injectEnabled}`)
}

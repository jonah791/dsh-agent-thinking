/**
 * 思维决策自证轨迹（可维护性 S4 证据层 · 2026-09-14）。
 *
 * 动机：本插件的**决策**（这次任务选了哪个思维姿态 / 哪一层认知流 / 凭什么选、注入有没有生效）
 * 完全不可见——只写 `ctx.logger`，而宿主 logger **不落盘**（AGENTS.md §5.22 规则 1）。
 * 于是「昨晚那次为什么注入了 critical 却没注入 plan」「注入到底生效过没有」这类问题
 * 只能靠外部脚本反解会话事件流。
 *
 * 修法：每次决策落一行 JSONL 侧车——`<DSH_HOME>/thinking-trace.jsonl`。
 * 阶段枚举：`boot`（进程级自报）→ `load` / `unload` / `clear`（激活决策）
 * → `suggest`（推荐决策）→ `inject`（动态段**注入状态变化**，同一激活集合只记一次）。
 *
 * 轨迹回答的五问（技能 plugin-maintainability 判据）：
 *   Q1 线上跑哪个构建 → `build`（`<version>@<模块 mtime ms>`）
 *   Q2 谁发起         → `phase` + `action`（哪个工具）+ `task`（suggest 的输入摘要）
 *   Q3 断在哪一段      → `ok` / `error` / `warnings`（未知模块 = 明确失败，不是静默）
 *   Q4 结果质量        → `modules[]`（选中的姿态）/ `layers[]`（认知流层）/ `activeCount` / `chars`
 *   Q5 耗时与预算      → `durationMs` + （load 超上限时）`warnings` 里的上限值
 *
 * 观测绝不反噬主流程（技能 C4）：全部 IO 失败吞错并返回 `false`——写不进去也不影响思维决策。
 *
 * @module dsh-agent-thinking/trace
 */
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { MODULE_BY_ID } from './modules.ts'

/** 阶段枚举：一次进程从 boot 起，每次决策一行。 */
export type ThinkingTracePhase = 'boot' | 'load' | 'unload' | 'clear' | 'suggest' | 'inject'

/** 一行思维轨迹。 */
export interface ThinkingTraceEntry {
  /** 写入时刻（ms epoch）。 */
  atMs: number
  phase: ThinkingTracePhase
  /** 构建标识 `<version>@<模块 mtime ms>`（Q1）。 */
  build: string
  /** 决策动作（工具名 `think_load` / `apply` / `systemPrompt.section`）。 */
  action: string
  /** 决策耗时（ms；boot=0）。 */
  durationMs: number
  /** 认知流层（选了什么层：perceive/reason/act/deliver/feedback）。 */
  layers: string[]
  /** 相关模块 id（选了什么姿态）。 */
  modules: string[]
  /** 决策依据（人可读：`explicit:think_load(plan) + autoPair:critical` / 命中关键词 / 配置）。 */
  basis: string
  /** 决策后激活模块总数（对照 `maxActiveModules` 软上限）。 */
  activeCount: number
  /** 结果：load/unload/clear 是否成功；inject 是否真的注入了非空文本。 */
  ok: boolean
  /** 警告（超上限、未知模块提示等）。 */
  warnings?: string[]
  /** 失败原因。 */
  error?: string
  /** suggest 的任务摘要（截断，Q2 输入侧）。 */
  task?: string
  /** inject 的注入文本字符数（Q4 量级）。 */
  chars?: number
}

/** 解析 DSH_HOME：环境变量优先，缺省 `<homedir>/.dsh`（单一真源，与既有插件同约定）。 */
export function resolveHome(
  env: Record<string, string | undefined> = process.env,
  fallback = homedir(),
): string {
  const raw = env['DSH_HOME']
  return raw !== undefined && raw.trim() !== '' ? raw : join(fallback, '.dsh')
}

/** 轨迹文件路径（纯函数）。 */
export function thinkingTracePath(home: string): string {
  return join(home, 'thinking-trace.jsonl')
}

/** 文件 mtime（ms；不可得为 0）。 */
export function mtimeOf(file: string): number {
  try {
    return Math.round(statSync(file).mtimeMs)
  } catch {
    return 0
  }
}

/** 从 `<file>` 所在包的 package.json 读版本（读不到返回空串，不抛）。 */
export function readPackageVersion(file: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(file), '..', 'package.json'), 'utf8')) as {
      version?: string
    }
    return typeof pkg.version === 'string' ? pkg.version : ''
  } catch {
    return ''
  }
}

/** 构建标识 `<version>@<模块 mtime ms>`（版本缺失退化为 `unknown@<mtime>`）。 */
export function buildStamp(file: string, version = ''): string {
  return version !== '' ? `${version}@${String(mtimeOf(file))}` : `unknown@${String(mtimeOf(file))}`
}

/** 模块 id → 认知流层（未知 id 归入 `unknown`，让账本暴露漂移而不是静默丢弃）。 */
export function layersOf(ids: readonly string[]): string[] {
  const seen: string[] = []
  for (const id of ids) {
    const layer = MODULE_BY_ID.get(id)?.layer ?? 'unknown'
    if (!seen.includes(layer)) seen.push(layer)
  }
  return seen
}

/**
 * 加载决策的依据文本（纯函数）：显式请求 + 组合拳自动附带 + 是否已激活。
 * 例：`explicit:think_load(plan) + autoPair:critical`。
 */
export function describeLoadBasis(input: {
  requested: string
  before: readonly string[]
  after: readonly string[]
  autoPairEnabled: boolean
}): string {
  const autoAdded = input.after.filter((id) => id !== input.requested && !input.before.includes(id))
  const already = input.before.includes(input.requested) ? '（已激活，重复加载）' : ''
  const pair = autoAdded.length > 0 ? ` + autoPair:${autoAdded.join(',')}` : ''
  const off = input.autoPairEnabled ? '' : '（autoPair 关闭）'
  return `explicit:think_load(${input.requested})${already}${pair}${off}`
}

/** 推荐决策的依据文本（纯函数）：命中关键词明细。 */
export function describeSuggestBasis(hits: readonly { id: string; matched: readonly string[]; score: number }[]): string {
  if (hits.length === 0) return 'keyword-match:none'
  return 'keyword-match:' + hits.map((h) => `${h.id}(${h.score}:${h.matched.join('|')})`).join(',')
}

/** 注入签名（纯函数）：同一激活集合只记一次 `inject` 行（注入状态变化，不是装配次数）。 */
export function injectSignature(ids: readonly string[]): string {
  return [...ids].sort().join(',')
}

/** 稳定序列化（键序固定 + 单行 JSON）。 */
export function serializeTraceEntry(entry: ThinkingTraceEntry): string {
  const ordered: ThinkingTraceEntry = {
    atMs: entry.atMs,
    phase: entry.phase,
    build: entry.build,
    action: entry.action,
    durationMs: entry.durationMs,
    layers: entry.layers,
    modules: entry.modules,
    basis: entry.basis,
    activeCount: entry.activeCount,
    ok: entry.ok,
    ...(entry.warnings !== undefined ? { warnings: entry.warnings } : {}),
    ...(entry.error !== undefined ? { error: entry.error } : {}),
    ...(entry.task !== undefined ? { task: entry.task } : {}),
    ...(entry.chars !== undefined ? { chars: entry.chars } : {}),
  }
  return JSON.stringify(ordered)
}

/** 容错解析：坏行/半行/空行跳过，不抛。 */
export function parseTraceEntries(text: string): ThinkingTraceEntry[] {
  const out: ThinkingTraceEntry[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    try {
      const parsed = JSON.parse(line) as ThinkingTraceEntry
      if (typeof parsed.atMs === 'number' && typeof parsed.phase === 'string') out.push(parsed)
    } catch {
      continue
    }
  }
  return out
}

/** 读轨迹文件；缺失/不可读返回空数组（诊断工具的安全入口）。 */
export function readTraceEntries(path: string): ThinkingTraceEntry[] {
  try {
    return parseTraceEntries(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

/** 追加一行（失败即吞并返回 false：观测绝不反噬思维决策）。 */
export function appendTraceEntry(path: string, entry: ThinkingTraceEntry): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, serializeTraceEntry(entry) + '\n', 'utf8')
    return true
  } catch {
    return false
  }
}

/** 记一笔思维轨迹（薄接线：补 atMs，路径缺省 `<DSH_HOME>/thinking-trace.jsonl`）。 */
export function thinkingTrace(
  entry: Omit<ThinkingTraceEntry, 'atMs'>,
  opts: { path?: string; home?: string; now?: number } = {},
): boolean {
  const path = opts.path ?? thinkingTracePath(opts.home ?? resolveHome())
  return appendTraceEntry(path, { atMs: opts.now ?? Date.now(), ...entry })
}

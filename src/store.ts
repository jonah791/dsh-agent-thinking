/**
 * 思维激活状态管理：加载/卸载/清空 + 组合拳（autoPair 附带 + 上限软警告）+ 任务匹配建议。
 * 纯逻辑层（不依赖 Cordis 运行时），便于离线单测。
 */

import { MODULE_BY_ID, type ThinkingModule } from './modules.ts'

/** 加载结果 */
export interface LoadResult {
  ok: boolean
  /** 实际激活的模块 id 列表（含 autoPair 附带） */
  loaded: string[]
  /** 警告（超上限、未知模块等） */
  warnings: string[]
}

/** 任务匹配建议 */
export interface SuggestHit {
  id: string
  name: string
  layer: string
  summary: string
  /** 命中关键词数（多命中优先级更高） */
  score: number
  /** 命中的关键词 */
  matched: string[]
}

/** 匹配建议输入（任务描述 → 命中关键词打分） */
export function suggestForTask(task: string, max: number): SuggestHit[] {
  const lower = task.toLowerCase()
  const hits: SuggestHit[] = []
  for (const module of MODULE_BY_ID.values()) {
    const matched = module.triggers.filter((keyword) => lower.includes(keyword.toLowerCase()))
    if (matched.length === 0) continue
    hits.push({
      id: module.id,
      name: module.name,
      layer: module.layer,
      summary: module.summary,
      score: matched.length,
      matched,
    })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, max)
}

/**
 * 思维激活状态机。组合拳：
 * - autoPair：加载带 autoPair 的模块时自动附带（如 plan/design → critical）
 * - 上限：激活数超过 maxActive 时返回警告（软限制，不阻止——决策归 agent）
 */
export class ThinkingStore {
  /** 当前激活模块（插入序） */
  private readonly active = new Map<string, ThinkingModule>()

  constructor(
    private readonly maxActive: number,
    private readonly autoPairEnabled: boolean,
  ) {}

  /** 当前激活模块列表（插入序） */
  activeList(): ThinkingModule[] {
    return [...this.active.values()]
  }

  /** 是否已激活 */
  isActive(id: string): boolean {
    return this.active.has(id)
  }

  /**
   * 加载模块（含组合拳）。未知 id 返回 ok=false。
   * @returns 加载结果（loaded=实际激活列表，含附带）
   */
  load(id: string): LoadResult {
    const module = MODULE_BY_ID.get(id)
    if (module === undefined) {
      return { ok: false, loaded: [...this.active.keys()], warnings: [`未知思维模块：${id}`] }
    }
    this.active.set(id, module)
    const warnings: string[] = []

    // 组合拳：autoPair 自动附带（如 plan → critical）
    if (this.autoPairEnabled && module.autoPair !== undefined) {
      for (const pairId of module.autoPair) {
        const pair = MODULE_BY_ID.get(pairId)
        if (pair !== undefined && !this.active.has(pairId)) {
          this.active.set(pairId, pair)
        }
      }
    }

    // 上限软警告（决策仍归 agent，不强制卸载）
    if (this.active.size > this.maxActive) {
      warnings.push(`已激活 ${this.active.size} 个思维模块（建议 ≤${this.maxActive}，防止思维相互干扰）`)
    }

    return { ok: true, loaded: [...this.active.keys()], warnings }
  }

  /** 卸载模块；不存在返回 false */
  unload(id: string): boolean {
    return this.active.delete(id)
  }

  /** 清空全部激活 */
  clear(): void {
    this.active.clear()
  }
}

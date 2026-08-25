import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LAYER_LABEL, MODULES, MODULE_BY_ID, groupByLayer, renderActiveModules } from '../lib/modules.js'
import { ThinkingStore, suggestForTask } from '../lib/store.js'

test('模块库：14 个模块，id 唯一，五层分布 3/3/3/3/2', () => {
  assert.equal(MODULES.length, 14)
  assert.equal(new Set(MODULES.map((m) => m.id)).size, 14)
  assert.equal(MODULE_BY_ID.size, 14)
  const groups = groupByLayer()
  assert.equal(groups.get('perceive')?.length, 3)
  assert.equal(groups.get('reason')?.length, 3)
  assert.equal(groups.get('act')?.length, 3)
  assert.equal(groups.get('deliver')?.length, 3)
  assert.equal(groups.get('feedback')?.length, 2)
  for (const layer of Object.keys(LAYER_LABEL)) assert.ok(groups.has(layer as keyof typeof LAYER_LABEL))
})

test('模块库：plan/design 带 autoPair=critical（组合拳强制后置）', () => {
  assert.deepEqual(MODULE_BY_ID.get('plan')?.autoPair, ['critical'])
  assert.deepEqual(MODULE_BY_ID.get('design')?.autoPair, ['critical'])
})

test('renderActiveModules：空激活返回空串（装配时被 drop，零成本）', () => {
  assert.equal(renderActiveModules([]), '')
})

test('renderActiveModules：激活时输出引导块含模块正文', () => {
  const text = renderActiveModules([MODULE_BY_ID.get('plan')!, MODULE_BY_ID.get('critical')!])
  assert.ok(text.includes('【思维模块·已激活 2 个】'))
  assert.ok(text.includes('plan（规划思维）'))
  assert.ok(text.includes('critical（批判思维）'))
  assert.ok(text.includes(MODULE_BY_ID.get('plan')!.body))
})

test('store.load：加载基础 + 未知 id fail', () => {
  const store = new ThinkingStore(3, true)
  const result = store.load('debug')
  assert.equal(result.ok, true)
  assert.ok(store.isActive('debug'))
  assert.deepEqual(store.activeList().map((m) => m.id), ['debug'])

  const bad = store.load('nonexistent')
  assert.equal(bad.ok, false)
  assert.ok(bad.warnings.some((w) => w.includes('未知思维模块')))
})

test('store.load：autoPair 自动附带 critical（plan → plan + critical）', () => {
  const store = new ThinkingStore(3, true)
  store.load('plan')
  assert.ok(store.isActive('plan'))
  assert.ok(store.isActive('critical'))
})

test('store.load：autoPairEnabled=false 时不附带', () => {
  const store = new ThinkingStore(3, false)
  store.load('plan')
  assert.ok(store.isActive('plan'))
  assert.equal(store.isActive('critical'), false)
})

test('store.load：超过上限给软警告但不阻止', () => {
  const store = new ThinkingStore(3, false)
  store.load('research')
  store.load('distill')
  store.load('empathize')
  const result = store.load('design')
  assert.equal(result.ok, true)
  assert.equal(store.activeList().length, 4)
  assert.ok(result.warnings.some((w) => w.includes('建议 ≤3')))
})

test('store.unload / clear', () => {
  const store = new ThinkingStore(3, true)
  store.load('plan')
  assert.equal(store.unload('plan'), true)
  assert.equal(store.unload('plan'), false)
  store.load('debug')
  store.load('focus')
  store.clear()
  assert.equal(store.activeList().length, 0)
})

test('suggestForTask：关键词命中打分排序 + 上限截断', () => {
  const hits = suggestForTask('我需要排查这个 bug 并修复报错', 5)
  assert.ok(hits.length > 0)
  assert.equal(hits[0]!.id, 'debug') // debug 命中「排查/bug/修复/报错」多词，应排最前
  assert.ok(hits.every((h) => h.score >= 1))

  const capped = suggestForTask('设计架构方案并评估风险', 2)
  assert.ok(capped.length <= 2)
})

test('suggestForTask：无命中返回空', () => {
  assert.deepEqual(suggestForTask('zzz 无关内容 qqq', 5), [])
})

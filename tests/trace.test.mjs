/**
 * 思维决策轨迹单测（跑 lib 产物，不拉 cordis 依赖树）。
 *
 * 覆盖：纯函数（路径/依据文本/层级映射/注入签名/序列化/解析）+ 真实落盘与回读
 * + 退化路径（坏行/半行/空文件/缺失文件）+ **尸体测试**（父路径是普通文件 → false 且不抛）
 * + 一条离线「决策 → 轨迹」组合（`ThinkingStore` + `describeLoadBasis` 真写出证据行）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ThinkingStore } from '../lib/store.js'
import {
  appendTraceEntry,
  buildStamp,
  describeLoadBasis,
  describeSuggestBasis,
  injectSignature,
  layersOf,
  mtimeOf,
  parseTraceEntries,
  readPackageVersion,
  readTraceEntries,
  resolveHome,
  serializeTraceEntry,
  thinkingTrace,
  thinkingTracePath,
} from '../lib/trace.js'

const tmp = mkdtempSync(join(tmpdir(), 'thinking-trace-test-'))
const base = (entry) => ({
  atMs: 1_700_000_000_000,
  phase: 'load',
  build: '0.1.0@123',
  action: 'think_load',
  durationMs: 0,
  layers: ['reason'],
  modules: ['plan'],
  basis: 'explicit:think_load(plan)',
  activeCount: 1,
  ok: true,
  ...entry,
})

test('resolveHome：DSH_HOME 优先，空白/缺失回退 <homedir>/.dsh', () => {
  assert.equal(resolveHome({ DSH_HOME: 'E:/alice/.dsh' }, '/home/x'), 'E:/alice/.dsh')
  assert.equal(resolveHome({ DSH_HOME: '  ' }, '/home/x'), join('/home/x', '.dsh'))
  assert.equal(resolveHome({}, '/home/x'), join('/home/x', '.dsh'))
})

test('thinkingTracePath：锚定 DSH_HOME 下的单一文件名', () => {
  assert.equal(thinkingTracePath('/h/.dsh'), join('/h/.dsh', 'thinking-trace.jsonl'))
})

test('layersOf：模块 → 认知流层；未知 id 暴露为 unknown（不静默丢弃）', () => {
  assert.deepEqual(layersOf(['plan']), ['reason'])
  assert.deepEqual(layersOf(['plan', 'critical']), ['reason', 'feedback'])
  assert.deepEqual(layersOf(['critical', 'research']), ['feedback', 'perceive'])
  assert.deepEqual(layersOf(['不存在的模块']), ['unknown'])
  assert.deepEqual(layersOf([]), [])
})

test('describeLoadBasis：显式 / 组合拳 / 重复加载 / autoPair 关闭四种依据可辨', () => {
  assert.equal(
    describeLoadBasis({ requested: 'plan', before: [], after: ['plan'], autoPairEnabled: true }),
    'explicit:think_load(plan)',
  )
  assert.equal(
    describeLoadBasis({ requested: 'plan', before: [], after: ['plan', 'critical'], autoPairEnabled: true }),
    'explicit:think_load(plan) + autoPair:critical',
  )
  assert.equal(
    describeLoadBasis({ requested: 'plan', before: ['plan'], after: ['plan'], autoPairEnabled: true }),
    'explicit:think_load(plan)（已激活，重复加载）',
  )
  assert.equal(
    describeLoadBasis({ requested: 'plan', before: [], after: ['plan'], autoPairEnabled: false }),
    'explicit:think_load(plan)（autoPair 关闭）',
  )
})

test('describeSuggestBasis：无命中 vs 命中明细（含分数与关键词）', () => {
  assert.equal(describeSuggestBasis([]), 'keyword-match:none')
  assert.equal(
    describeSuggestBasis([{ id: 'debug', matched: ['报错', 'bug'], score: 2 }]),
    'keyword-match:debug(2:报错|bug)',
  )
})

test('injectSignature：与顺序无关（同一激活集合 = 同一签名）', () => {
  assert.equal(injectSignature(['plan', 'critical']), injectSignature(['critical', 'plan']))
  assert.notEqual(injectSignature(['plan']), injectSignature(['plan', 'critical']))
  assert.equal(injectSignature([]), '')
})

test('serializeTraceEntry：单行 + 键序固定 + 缺省字段不污染', () => {
  const line = serializeTraceEntry(base({}))
  assert.equal(line.includes('\n'), false)
  assert.deepEqual(Object.keys(JSON.parse(line)), [
    'atMs', 'phase', 'build', 'action', 'durationMs', 'layers', 'modules', 'basis', 'activeCount', 'ok',
  ])
  const full = JSON.parse(serializeTraceEntry(base({
    warnings: ['超上限'], error: '未知思维模块：x', task: '任务摘要', chars: 123,
  })))
  assert.deepEqual(Object.keys(full).slice(10), ['warnings', 'error', 'task', 'chars'])
})

test('parseTraceEntries：坏行/半行/空行/null 全部跳过，不抛', () => {
  const good = serializeTraceEntry(base({}))
  const text = ['', good, '  ', '{"atMs":1,"phase":"load"', '{"phase":"load"}', 'null', '"str"', '###'].join('\n')
  const parsed = parseTraceEntries(text)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].phase, 'load')
})

test('readTraceEntries：缺失文件/目录误当文件 → 空数组（不抛）', () => {
  assert.deepEqual(readTraceEntries(join(tmp, 'nope', 'thinking-trace.jsonl')), [])
  assert.deepEqual(readTraceEntries(tmp), [])
})

test('appendTraceEntry：正常追加可回读；空文件读回空数组', () => {
  const path = join(tmp, 'ok', 'thinking-trace.jsonl')
  const emptyPath = join(tmp, 'empty-trace.jsonl')
  writeFileSync(emptyPath, '', 'utf8')
  assert.deepEqual(readTraceEntries(emptyPath), [])
  assert.equal(appendTraceEntry(path, base({ phase: 'boot', action: 'apply' })), true)
  assert.equal(appendTraceEntry(path, base({ phase: 'inject', action: 'systemPrompt.section', chars: 9 })), true)
  const back = readTraceEntries(path)
  assert.deepEqual(back.map((e) => e.phase), ['boot', 'inject'])
  assert.equal(readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').length, 2)
})

test('尸体测试：父路径是普通文件 → 返回 false 且不抛（观测不反噬决策）', () => {
  const blocker = join(tmp, 'blocker')
  writeFileSync(blocker, 'not a dir', 'utf8')
  assert.doesNotThrow(() => {
    assert.equal(appendTraceEntry(join(blocker, 'thinking-trace.jsonl'), base({})), false)
    assert.equal(thinkingTrace(base({}), { path: join(blocker, 'thinking-trace.jsonl'), now: 1 }), false)
  })
})

test('thinkingTrace：注入 now/路径落一行；不可写路径返回 false', () => {
  const path = join(tmp, 'thin', 'thinking-trace.jsonl')
  // 契约：atMs 由 thinkingTrace 注入（entry 里传的 atMs 会被覆盖——base() 是给纯序列化用的夹具）
  const { atMs, ...withoutAt } = base({ phase: 'suggest', task: '调查一下' })
  assert.equal(atMs, 1_700_000_000_000)
  assert.equal(thinkingTrace(withoutAt, { path, now: 42 }), true)
  const [line] = readTraceEntries(path)
  assert.equal(line.atMs, 42)
  assert.equal(line.task, '调查一下')
  assert.equal(thinkingTrace(withoutAt, { path: join(tmp, 'blocker', 'thinking-trace.jsonl'), now: 43 }), false)
})

test('构建自证：buildStamp/readPackageVersion/mtimeOf（版本读不到退化为 unknown@mtime）', () => {
  const root = join(tmp, 'pkg')
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }), 'utf8')
  const self = join(root, 'lib', 'index.js')
  writeFileSync(self, '// x', 'utf8')
  assert.equal(readPackageVersion(self), '1.2.3')
  assert.ok(mtimeOf(self) > 0)
  assert.equal(buildStamp(self, '1.2.3'), '1.2.3@' + String(mtimeOf(self)))
  assert.equal(buildStamp(join(root, 'missing.js'), ''), 'unknown@0')
})

test('离线组合：真实决策（plan 触发 autoPair）→ 轨迹行能回答「选了什么层/姿态/依据」', () => {
  const path = join(tmp, 'decision', 'thinking-trace.jsonl')
  const store = new ThinkingStore(3, true)
  const before = store.activeList().map((m) => m.id)
  const result = store.load('plan')
  const after = store.activeList().map((m) => m.id)
  const entry = base({
    phase: 'load',
    modules: result.loaded,
    layers: layersOf(after),
    basis: describeLoadBasis({ requested: 'plan', before, after, autoPairEnabled: true }),
    activeCount: after.length,
    ok: result.ok,
  })
  assert.equal(thinkingTrace(entry, { path, now: 7 }), true)
  const [line] = readTraceEntries(path)
  assert.deepEqual(line.modules, ['plan', 'critical'])       // 选了什么姿态
  assert.deepEqual(line.layers, ['reason', 'feedback'])      // 选了什么层
  assert.equal(line.basis, 'explicit:think_load(plan) + autoPair:critical') // 依据
  assert.equal(line.ok, true)
  // 未知模块：决策失败也要留证（不是静默）
  const bad = store.load('没有这个模块')
  assert.equal(bad.ok, false)
  assert.equal(bad.warnings.length, 1)
})

test('cleanup', () => {
  rmSync(tmp, { recursive: true, force: true })
})

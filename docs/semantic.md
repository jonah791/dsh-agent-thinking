# dsh-agent-thinking · 语义文档

> 版本 v0.1.0 · 2026-09-14 · 作者：爱丽丝 · 状态：**draft**（补课文档；README 已声明本插件弃用并归档）

| 字段 | 值 |
|------|-----|
| 能力名 | `dsh-agent-thinking`（组合行名 `agent-thinking`，见 `src/index.ts:name`） |
| 主副本路径 | `self-plugins/dsh-agent-thinking/docs/semantic.md`（本文件） |
| 实现落点 | `package.json`；`README.md`；`src/index.ts`；`src/modules.ts`；`src/store.ts`（构建产物 `lib/index.js`、`lib/modules.js`、`lib/store.js` + `lib/types/*.d.ts`） |
| 版本 | `0.1.0`（逐字取自 `package.json` 的 `version`） |
| 状态 | **draft** |
| 作者 | 爱丽丝 |
| 日期 | 2026-09-14 |

## 1 · 定位与反定位

**定位**：提示词层面的 MoE——14 种思维方式做成可动态加载/卸载的模块；`think_load` 激活后，模块正文经 `ctx.systemPrompt.section` 注入 system prompt，模型以对应思维姿态处理当前任务；未激活时动态段返回空串，装配时被 drop，零上下文成本。

- 认知流五层（`src/modules.ts:LAYER_LABEL`）：感知（`research`/`distill`/`empathize`）→ 推演（`design`/`plan`/`inversion`）→ 执行（`debug`/`focus`/`adapt`）→ 交付（`write`/`persuade`/`decision`）→ 反馈（`critical`/`review`），共 14 模块。
- 决策权归 agent：`think_load` 是**工具**而非自动触发器；`think_suggest` 只做关键词打分给建议；超上限只给软警告，不强制卸载（源码注释「决策归你，不强制」）。

**反定位（不做什么）**：

- 不是自动思维切换器，也不是持久化人格/记忆：无关键词自动加载、无 `turn` 钩子、无按任务类型自动挂载；激活态是**进程内 `Map`**（`src/store.ts:ThinkingStore.active`），重启清空（有意设计，见 §3 I3）。
- 不是技能体系、也不是安全边界：本插件正是**被技能体系取代**的形态（README 弃用说明 2026-08-21：思维内容迁移至技能 `thinking-frameworks`，源码归档）；模块正文是提示词文本，不构成权限/沙箱约束。现状：`plugin_list(source=self, status=mounted)` 的 44 项中无本插件（2026-09-14 实测）——web 组合未挂载。

## 2 · 术语表

| 术语 | 含义 |
|------|------|
| 思维模块（module） | `src/modules.ts:ThinkingModule`：稳定 `id`（kebab-case）+ 中文 `name` + `layer` + `summary` + `triggers` + 可选 `autoPair` + `body`（注入正文） |
| 层 / 激活（layer / active） | 层值域 `'perceive' \| 'reason' \| 'act' \| 'deliver' \| 'feedback'`；激活 = 模块进入 `ThinkingStore.active`（插入序 `Map`），成为动态段渲染来源 |
| 组合拳（autoPair） | 加载带 `autoPair` 的模块时自动附带配对模块；本插件仅 `design`/`plan` → `['critical']` |
| 上限软警告 | 激活数 > `maxActiveModules` 时在 `warnings` 返回提示，**不阻止**加载 |
| 动态段 / 注入开关 | `ctx.systemPrompt.section({ name: 'thinking-modules', order: config.sectionOrder, text })`；`injectEnabled=false` 时不注册（工具仍可用，仅预览） |

## 3 · 概念模型

模型：**模块库（静态 14 条）** → 激活集（进程内 `Map`，插入序） → `renderActiveModules` 渲染 → 动态段注入 system prompt。

- **I1 零成本空段**：`renderActiveModules([])` 返回 `''`（首行 `if (modules.length === 0) return ''`）；空段装配时被 drop。
- **I2 插入序稳定 + 组合拳幂等**：`activeList()` = `[...active.values()]`（渲染顺序与 `think_status` 编号依此）；`autoPair` 附带前检查 `!this.active.has(pairId)`，重复加载不产生重复项，`autoPairEnabled=false` 时整段跳过。
- **I3 不持久化**：无任何落盘（`src/` 三文件无 `node:fs` 导入，2026-09-14 grep 实测 0 命中）；重启后激活集清空——思维模块是「当前任务」姿态，不是长期配置。
- **I4 软限制 + fail-soft**：超限只 push 警告串、激活集不变；`load` 未知 id 返回 `{ ok: false, loaded: <当前激活键>, warnings: ['未知思维模块：<id>'] }`，不改变状态、不抛错。

## 4 · 契约

### 4.1 工具契约（6 个，`src/index.ts:registerThinkingTools` → `ctx.tools.register`）

| 工具名 | 入参 | 出参（output.schema） |
|--------|------|----------------------|
| `think_list` | 无 | `{ text: string }`——按五层分组的清单，`●`=已激活 / `○`=未激活 |
| `think_status` | 无 | `{ text: string }`——`已激活 N 个思维模块：` + 编号列表（无激活时 `（未激活任何思维模块）`） |
| `think_load` | `module: string`（必填） | `{ ok: boolean, loaded: string[], warnings: string[] }` |
| `think_unload` | `module: string`（必填） | `{ removed: boolean }`（未激活返回 false） |
| `think_clear` | 无 | `{ cleared: boolean }`（= 清空前是否有激活） |
| `think_suggest` | `task: string`（必填） | `{ text: string, hits: string[] }`（`hits` = 命中模块 id；`max = 5`） |

### 4.2 配置契约（`src/index.ts:Config` / `export const Config`，schemastery）

| 字段 | 类型 | 默认 | 语义 |
|------|------|------|------|
| `injectEnabled` | boolean | `true` | 注册/不注册动态段 |
| `maxActiveModules` | number | `3` | 激活软上限（超限警告，不阻止） |
| `autoPairEnabled` | boolean | `true` | 组合拳附带开关 |
| `sectionOrder` | number | `50` | 动态段位置（0=persona，100=工具指导） |

`inject` 声明（`src/index.ts:inject`，逐字）：`['systemPrompt', 'tools']`。**无自定义事件**；落盘面自 2026-09-14 起为**一条侧车轨迹** `<DSH_HOME>/thinking-trace.jsonl`（见 §4.4，宿主 logger 不落盘，故不依赖 `ctx.logger`）；另有两条日志：`console.log('[dsh-agent-thinking] apply', new Date().toISOString(), '(HMR probe)')` 与 `ctx.logger('agent-thinking').info('ready: <N> modules, inject=<bool>')`（宿主 logger 不落盘）。

### 4.3 调用点清单

| 调用方 | 调用点（文件:符号） | 时机 |
|--------|---------------------|------|
| 宿主组合装配器（profile 预设行 `agent-thinking`） | `src/index.ts:apply(ctx, config)` | 该行被加载时（web 启动 / preset 装配）；打印 `(HMR probe)` 与 `ready:` 两行 |
| system prompt 装配器 | `src/index.ts:apply` → `ctx.systemPrompt.section({ name: 'thinking-modules', order: config.sectionOrder, text })`，求值体 `src/modules.ts:renderActiveModules` | **每次 system prompt 装配**（`text` 为函数逐次求值）；`injectEnabled=false` 时不注册 |
| ctx 生命周期 | `src/index.ts:apply` → `ctx.effect(() => disposeSection, 'agent-thinking.section')` | ctx 卸载 / reload 时释放动态段 |
| 模型（工具调用） | `src/index.ts:registerThinkingTools` 的 `defineTool` → `ctx.tools.register`（6 个 `think_*`） | 模型按需调用，**无自动触发** |
| `think_load` 执行体 | `src/index.ts:think_load.execute` → `src/store.ts:ThinkingStore.load(id)` | 每次 `think_load` 调用 |
| `think_unload` / `think_clear` 执行体 | `src/index.ts:think_unload.execute` → `ThinkingStore.unload`；`think_clear.execute` → `ThinkingStore.clear` | 每次对应工具调用 |
| `think_list` / `think_status` 读取 | `src/index.ts:renderModuleList` / `renderActiveList` ← `ThinkingStore.activeList()`；分组经 `src/modules.ts:groupByLayer` + `LAYER_LABEL` | 每次对应工具调用 |
| `think_suggest` 打分 | `src/index.ts:think_suggest.execute` → `src/store.ts:suggestForTask(task, 5)` | 每次 `think_suggest` 调用（命中词数降序 → `slice(0, max)`） |
| 轨迹写入（决策留痕） | `src/index.ts:recordDecision` → `src/trace.ts:thinkingTrace` → `appendTraceEntry` | `apply` 时 1 行 `boot`；每次 `think_load`/`think_unload`/`think_clear`/`think_suggest` 各 1 行；动态段 `inject` 行仅在**激活集合变化**时写（见 §4.4） |

### 4.4 自证轨迹契约 `<DSH_HOME>/thinking-trace.jsonl`（2026-09-14 S4 证据层）

**动机**：决策（这次选了哪个思维姿态 / 哪一层认知流 / 凭什么、注入有没有生效）此前只写 `ctx.logger`——**宿主 logger 不落盘**（AGENTS.md §5.22 规则 1）⇒ 「昨晚为什么注入了 critical 却没注入 plan」只能外部反解会话流。

| 项 | 契约 |
|---|---|
| 落盘路径 | `<DSH_HOME>/thinking-trace.jsonl`（解析**单一真源** `trace.ts:resolveHome`：环境变量 → 回退 `<homedir>/.dsh`） |
| 行格式 | 单行 JSONL，键序固定（`tail`/`grep`） |
| 阶段枚举 | `boot`（`apply` 自报配置快照）· `load` · `unload` · `clear` · `suggest` · `inject`（动态段注入状态变化） |
| 行 schema | `{atMs, phase, build, action, durationMs, layers[], modules[], basis, activeCount, ok, warnings[]?, error?, task?, chars?}` |
| `build` | `Q1` `<version>@<index 模块 mtime ms>`（版本号会说谎，mtime 不会） |
| `action` / `task` | `Q2` 哪个工具（`think_load` / `apply` / `systemPrompt.section`）+ `suggest` 的任务摘要（截 120 字符） |
| `layers[]` / `modules[]` | `Q4` **选了什么层**（认知流层，未知 id 记为 `unknown` 而非静默丢弃）/ **选了什么姿态**（模块 id） |
| `basis` | **决策依据**（人可读）：`explicit:think_load(plan) + autoPair:critical` / `keyword-match:debug(2:报错|bug)` / `boot: inject=true …` / `noop:未被激活(x)` |
| `ok` / `warnings[]` / `error` | `Q3` 断点：未知模块 `ok=false` + `error`（不是静默）；超上限进 `warnings`（含上限值） |
| `activeCount` | `Q4` 决策后激活总数（对照配置 `maxActiveModules` 判「吃满软上限」） |
| `chars` | `Q4` `inject` 行的注入文本字符数（**注入真的发生了**的量级证据，不是「被调用过」） |
| `durationMs` | `Q5` 决策耗时（状态机为纯内存操作，实测 ~0ms——这本身是「无 IO 阻塞」的证据） |

**`inject` 行的粒度语义（显式）**：**注入状态变化事件**，不是装配次数——同一激活集合重复装配**不写**（避免每步噪音）；激活集合清空后再出现同集合会重新记一行（`lastInjectSignature` 归零）。判「注入生效」= `inject` 行存在且 `chars > 0`。

**观测绝不反噬（技能 C4）**：`thinkingTrace`/`appendTraceEntry` 一律 try/catch 吞错并返回 `bool`——路径不可写、目录缺失、序列化失败**都不得改变思维决策**，也不得抛。

**不记录的东西（反膨胀）**：`think_list` / `think_status`（只读，不是决策）、模块 `body` 全文（体积大且静态可查）、`task` 全文（只留 120 字符摘要）。

## 5 · 边界与信任

- **授权边界**：无特殊授权——不读文件、不写文件、不发网络请求、不碰凭据（`README.md` 头部声明 `boundary: 无特殊授权边界`、`envDeps: 无（纯逻辑/标准 Node）`）。
- **信任面**：模块 `body` 是包内静态可信文本；唯一外部输入是 `think_suggest` 的 `task`，只做 `lower.includes(keyword.toLowerCase())` 匹配，**不执行、不求值、不拼命令**。模型可自行 `think_load` 改写自己后续的 system prompt——这是设计意图（姿态切换），模块库封闭（14 条），无外部数据污染入口。
- **反向缺口（诚实声明，2026-09-14 收窄）**：**曾**无审计轨迹（`think_status` 是唯一观测面 ⇒ §5.22 第 1 条不达标）。现补 `thinking-trace.jsonl`（§4.4）与离线单测（`tests/trace.test.mjs` 15 条）。**仍未消除的缺口**：本插件**未挂载**（README/§9 记录：思维内容已迁移至技能 `thinking-frameworks`），故线上**没有任何一行真实轨迹**——证据层是「就绪但未被使用」（见 §10 第 2 条）。

## 6 · 与既有机制的关系

- `systemPrompt` 服务：本插件是**动态段贡献者**（段名 `thinking-modules`，order 默认 50），空串段被装配器 drop。
- `tools` 服务：6 个 `think_*` 经 `defineTool` 注册进全局工具面；工具面收窄（如 `dsh-agent-toolface`）会连带掩蔽它们。
- **技能系统（替代关系）**：思维内容已迁移至技能 `thinking-frameworks`（认知流思维框架，按基准实证校准）——技能体系是本线继任者，本插件仅作源码归档参考；挂载态/构建态可经 `plugin_list` / `dsh-plugin-bootreport` 判读，文档侧归 `dsh-semantic-docs`（本文件即补课产物）。

## 7 · 可证伪验收清单

| # | 可证伪命题 | 证据（单测名或命令或日志行或落盘产物） | 状态 |
|---|-----------|--------------------------------------|------|
| 1 | 模块库恰为 14 条、分 5 层 | 源码通读 `src/modules.ts:MODULES`（3+3+3+3+2=14）+ `LAYER_LABEL` 5 键 | 已验证（静态，2026-09-14） |
| 2 | `src/` 落盘写入**有且仅有**轨迹一处（`trace.ts` 的 `appendFileSync`），无其他副作用 | `grep -rn "writeFileSync\|appendFileSync\|createWriteStream\|mkdirSync" src/` → 仅 `src/trace.ts` 命中；`grep -n "node:fs" src/` 同上 | 已验证（2026-09-14 实测） |
| 3 | 未激活时动态段为零成本（空串） | `node --test tests/store.test.ts` → `renderActiveModules：空激活返回空串（装配时被 drop，零成本）` **通过**（Node 24 原生跑 TS） | ✔ 已验证（2026-09-14 离线 11/11） |
| 4 | 工具面恰为 6 个 `think_*`，入参/出参如 §4.1 | 挂载后查会话工具列表或 `toolface` 输出 | 待验收（当前未挂载） |
| 5 | `think_load('plan')` 自动附带 `critical`；超上限只警告不阻止 | `node --test tests/store.test.ts` → `autoPair 自动附带 critical（plan → plan + critical）`、`超过上限给软警告但不阻止` 两例**通过**；`tests/trace.test.mjs` 另有一条「离线组合」把该事实写进轨迹行 | ✔ 已验证（2026-09-14 离线） |
| 6 | 未知模块 fail-soft 且状态不变 | `node --test tests/store.test.ts` → `store.load：加载基础 + 未知 id fail` **通过**；`tests/trace.test.mjs` 断言 `ok=false` 且 `warnings.length===1`（**失败决策也留证**） | ✔ 已验证（2026-09-14 离线） |
| 7 | 激活态不持久化 | 挂载态重启后 `think_status` 返回 `已激活 0 个思维模块` | 待验收 |
| 8 | `think_suggest` 打分与排序正确 | `node --test tests/store.test.ts` → `suggestForTask：关键词命中打分排序 + 上限截断`、`无命中返回空` **通过** | ✔ 已验证（2026-09-14 离线） |
| 9 | `injectEnabled=false` 时动态段不注册、工具仍可用 | 配置该值挂载后：system prompt 无 `【思维模块·已激活` 字样，`think_list` 仍可答 | 待验收 |
| 10 | 线上进程确实在跑本构建 | `lib/index.js` mtime vs web 进程启动时间（§8.1 第 ① 步） | 待验收（当前未挂载） |
| 11 | 每次决策**自己落盘**一行：`load` 行含 `modules`（姿态）/`layers`（认知流层）/`basis`（依据），`boot` 行含配置快照 | `tests/trace.test.mjs`（15/15）+ 「离线组合」用例真实写出并回读该行；`npm test` 全绿 | ✔ 已验证（2026-09-14 离线） |
| 12 | 轨迹写失败**不反噬决策**（不可写路径 → `false` 且不抛） | `tests/trace.test.mjs` 尸体测试（父路径是普通文件）+ 坏行/半行/空行/`null` 容错 + 缺失文件返回 `[]` + 空文件返回 `[]` | ✔ 已验证（2026-09-14 离线） |
| 13 | `inject` 行 = **注入状态变化**（同集合重复装配不写、清空后再出现重写），且带 `chars` 量级 | `tests/trace.test.mjs` 的 `injectSignature` 用例（顺序无关/集合敏感/空集） | ✔ 已验证（2026-09-14 离线；**线上无行**——插件未挂载） |

> 计数：13 条 · 已验证 9（1、2、3、5、6、8、11、12、13）· 待验收 4（4、7、9、10，均因**当前未挂载**）。
> 运行方式：`npm test`（=`node --test "tests/*.test.mjs"`，15 例）；TS 套件另跑 `node --test tests/store.test.ts`（11 例，Node 24 原生跑 TS；**不在 npm test 的 glob 内**）。

## 8 · 与实现的关系

| 文件 | 职责 |
|------|------|
| `package.json` | 包名 `dsh-agent-thinking`、版本 `0.1.0`、`main: lib/index.js`；peer 依赖 `@deepseek-ai/cordis` ^4.0.1、`@deepseek-ai/schemastery` ^3.18.1-rc.1、`@deepseek-ai/dsh-tools` ^0.1.0-rc.6、`@deepseek-ai/dsh-system-prompt` ^0.1.0-rc.6；脚本 `build`/`typecheck` = `tsc -p tsconfig.json` |
| `src/index.ts` | `name`/`inject`/`Config` 声明、动态段注册、6 个工具定义与注册、渲染辅助函数 |
| `src/modules.ts` | 14 模块库 + `LAYER_LABEL` + `MODULE_BY_ID` + `groupByLayer` + `renderActiveModules`（纯数据/纯函数） |
| `src/store.ts` | `ThinkingStore`（`activeList`/`isActive`/`load`/`unload`/`clear`）+ `suggestForTask`（纯逻辑，注释明示「不依赖 Cordis 运行时，便于离线单测」） |
| `src/trace.ts` | 决策自证轨迹（2026-09-14 新增）：纯函数（`resolveHome`/`thinkingTracePath`/`layersOf`/`describeLoadBasis`/`describeSuggestBasis`/`injectSignature`/`serializeTraceEntry`/`parseTraceEntries`/`buildStamp`）+ 薄 IO（`appendTraceEntry`/`thinkingTrace`，吞错返回 bool）；`src/index.ts` 只做接线（`recordDecision`） |
| `tests/trace.test.mjs` | 轨迹单测 15 例（正常/退化/**尸体**/离线决策组合）；`tests/store.test.ts` 11 例（模块库与状态机，Node 24 原生跑） |

### 8.1 生效判据

改了代码后**「重建 ≠ 生效」**，按序取证，缺一不可：① `lib/index.js` 的 mtime **晚于** web 进程启动时间 = 改动没进当前进程，需重启（§5.11 规则 6）；② 进程日志出现 `[dsh-agent-thinking] apply <ISO> (HMR probe)` 与 `ready: 14 modules, inject=<bool>`；③ 工具可答——`think_list` 列出 14 条、`think_status` 报激活数（工具存在即证明 `ctx.tools.register` 跑过）；④ 行为生效——`think_load('debug')` 后下一次 system prompt 装配应含 `【思维模块·已激活 N 个】` 与 `## 调试思维（debug）` 正文；⑤ 配置生效——`injectEnabled=false` 时段消失但工具仍在；⑥ **证据层生效（2026-09-14 新增，用落盘产物判，不看「有没有被调用」）**——`tail -n 20 <DSH_HOME>/thinking-trace.jsonl` 出现 `boot` 行（含 `build` 与配置快照），且每次 `think_load` 追加一行 `load`（含 `layers`/`basis`）；`think_load` 后第一次装配出现 `inject` 行且 `chars > 0`。未挂载时该文件**不存在**——「文件不存在」本身就是「插件没在跑」的证据（§5.11 规则 6 反向用法）。

### 8.2 回退

- **停用（最快、无代码改动）**：`plugin_stop`（写 patch `disabled`）或 `plugin_unmount`——本插件当前本就未挂载，回退面为零。
- **代码/文档回滚**：`git revert <commit>` 或 `git checkout <旧 commit> -- src/` 后 `pnpm build`；因无状态落盘，回退**不涉及数据迁移**、无残留（激活态随进程消失）。本文件纯新增，删除即回到「无语义文档」原状。
- **轨迹回退（2026-09-14）**：删 `src/trace.ts` + 撤 `src/index.ts` 的 6 处接线 + 删 `tests/trace.test.mjs` 即可（`git revert` 本次提交最省事）。**回退代价**：`<DSH_HOME>/thinking-trace.jsonl` 变成孤儿文件（只追加、无人读、无裁决影响）——**可直接删**，无迁移、无其他机制依赖它。

## 9 · 实践修订记录

- 2026-09-14 补课：本插件此前无语义文档（可维护性工程）
- 2026-08-21 弃用（README 记录）：主人定调「技能体系比思维模块插件更好」→ 思维内容迁移至技能 `thinking-frameworks`，插件从 web 组合 unmount，源码归档
- 2026-09-14 实测：`plugin_list(source=self, status=mounted)` 44 项中无本插件，确认「未挂载」为当前事实
- 2026-09-14 可维护性补课（批次 W4，S4/S6 判据；主人判「可维护性很差」定调 §5.22）：
  - **语义被补充**：新增 `src/trace.ts` + `<DSH_HOME>/thinking-trace.jsonl`（§4.4）——阶段 `boot`/`load`/`unload`/`clear`/`suggest`/`inject`；字段 `build`（Q1 构建自证）/`layers`+`modules`（选了什么层与姿态）/`basis`（**依据**）/`durationMs`（耗时）/`ok`+`warnings`+`error`（断点）/`activeCount`（结果质量）。
  - **语义被补充**：`inject` 行的粒度 = **注入状态变化事件**（同集合重复装配不写，避免每步噪音）——这是「注入生效」与「装配过」的区分（技能 C3 窗口语义的简版）。
  - **语义被修正**：§4.2 旧文「**无自定义事件、无落盘路径**」已过期（本插件现在有一条侧车轨迹）；§5「反向缺口：没有审计轨迹」收窄为「轨迹已补，但**未挂载 ⇒ 线上无行**」。
  - **语义被修正**：§7 第 2 条旧断言「`src/` 无任何落盘写入」在补课后**变为假**——改写为「落盘**有且仅有** `trace.ts` 一处」，并给出 grep 命令；这类「文档写着旧事实」正是 D2 drift 的形状。
  - 教训：**纯逻辑插件（不落盘、无状态）同样需要证据层**——它的「决策」如果不在账本里，就只剩模型自己的记忆；而**未挂载的插件补证据层是预防性投入**（重启本线时立刻可用），必须在文档里如实标注「未产生线上证据」。

## 10 · 未决问题

1. **多会话作用域未取证**：`ThinkingStore` 实例由 `apply` 闭包持有，而 `ctx.systemPrompt.section` 注册在 ctx 作用域——同进程多会话/子代理是否**共享同一激活集**（互相污染）？未读宿主 `systemPrompt`/`tools` 实现，不下结论。
2. **可维护性缺口（2026-09-14 部分收口）**：`tests/trace.test.mjs`（15 例）+ `tests/store.test.ts`（11 例）+ `<DSH_HOME>/thinking-trace.jsonl`（§4.4）已补齐 S3/S4/S6 缺口；**仍未消除**：插件未挂载 ⇒ 轨迹无真实行、`console.log('... (HMR probe)')` 调试探针是否清理未定、TS 套件不在 `npm test` glob 内（需单独 `node --test tests/store.test.ts`）。若重启本线，宜把 TS 套件并入 `npm test` 并做首次线上轨迹验收。
3. **注册表归属**：`docs/semantics/registry.json` 无本插件条目（2026-09-14 grep 无命中）；本次任务限定只写本文件，未登记——若登记，`status` 宜为 `deprecated` 以对齐 README，待主人/队长裁决。
4. **语义重叠**：`thinking-frameworks` 技能与本插件 14 模块内容重叠，是否保留 `think_*` 工具面（而非纯归档）尚无结论。
5. **轨迹无轮转上限（2026-09-14 新增）**：`thinking-trace.jsonl` 只追加、无 `keepLines`——`inject` 行已按「状态变化」降噪，量级本就低，故**先要证据再加机制**（等真实行数/体积可观测；若加，复用 bootreport 的「旁车 + rename 原子替换」）。
6. **`inject` 去重是进程内内存状态（2026-09-14 新增）**：`lastInjectSignature` 随进程重启归零 ⇒ 重启后同激活集合会再记一行（**多记不是漏记**，可接受但需知）；未被观测到的第三种可能（同一集合在**不同会话**被注入）在单实例多会话下无法区分——留待 U1（多会话作用域）落地后重判。

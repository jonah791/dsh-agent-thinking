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

`inject` 声明（`src/index.ts:inject`，逐字）：`['systemPrompt', 'tools']`。**无自定义事件、无落盘路径**——仅两条日志：`console.log('[dsh-agent-thinking] apply', new Date().toISOString(), '(HMR probe)')` 与 `ctx.logger('agent-thinking').info('ready: <N> modules, inject=<bool>')`（宿主 logger 不落盘）。

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

## 5 · 边界与信任

- **授权边界**：无特殊授权——不读文件、不写文件、不发网络请求、不碰凭据（`README.md` 头部声明 `boundary: 无特殊授权边界`、`envDeps: 无（纯逻辑/标准 Node）`）。
- **信任面**：模块 `body` 是包内静态可信文本；唯一外部输入是 `think_suggest` 的 `task`，只做 `lower.includes(keyword.toLowerCase())` 匹配，**不执行、不求值、不拼命令**。模型可自行 `think_load` 改写自己后续的 system prompt——这是设计意图（姿态切换），模块库封闭（14 条），无外部数据污染入口。
- **反向缺口（诚实声明）**：因无落盘，本插件**没有审计轨迹**，`think_status` 返回是唯一观测面；按 §5.22「机制必须自证」此项不达标（见 §10）。

## 6 · 与既有机制的关系

- `systemPrompt` 服务：本插件是**动态段贡献者**（段名 `thinking-modules`，order 默认 50），空串段被装配器 drop。
- `tools` 服务：6 个 `think_*` 经 `defineTool` 注册进全局工具面；工具面收窄（如 `dsh-agent-toolface`）会连带掩蔽它们。
- **技能系统（替代关系）**：思维内容已迁移至技能 `thinking-frameworks`（认知流思维框架，按基准实证校准）——技能体系是本线继任者，本插件仅作源码归档参考；挂载态/构建态可经 `plugin_list` / `dsh-plugin-bootreport` 判读，文档侧归 `dsh-semantic-docs`（本文件即补课产物）。

## 7 · 可证伪验收清单

| # | 可证伪命题 | 证据（单测名或命令或日志行或落盘产物） | 状态 |
|---|-----------|--------------------------------------|------|
| 1 | 模块库恰为 14 条、分 5 层 | 源码通读 `src/modules.ts:MODULES`（3+3+3+3+2=14）+ `LAYER_LABEL` 5 键 | 已验证（静态，2026-09-14） |
| 2 | `src/` 无任何落盘写入 | `grep -n "node:fs\|writeFile\|appendFile\|mkdir" src/` → 0 命中 | 已验证（2026-09-14 实测） |
| 3 | 未激活时动态段为零成本（空串） | 单测：`renderActiveModules([])` 返回 `''` | 待验收（仓库无 `tests/` 目录） |
| 4 | 工具面恰为 6 个 `think_*`，入参/出参如 §4.1 | 挂载后查会话工具列表或 `toolface` 输出 | 待验收（当前未挂载） |
| 5 | `think_load('plan')` 自动附带 `critical`；超上限只警告不阻止 | 单测：`new ThinkingStore(3, true).load('plan').loaded` 含 `plan`+`critical`；`maxActive=3` 时第 4 次 `load` 返回 `ok:true` 且 `warnings` 含 `建议 ≤3` | 待验收 |
| 6 | 未知模块 fail-soft 且状态不变 | 单测：`load('nope')` → `{ ok:false, warnings:['未知思维模块：nope'] }` | 待验收 |
| 7 | 激活态不持久化 | 挂载态重启后 `think_status` 返回 `已激活 0 个思维模块` | 待验收 |
| 8 | `think_suggest` 打分与排序正确 | 单测：`suggestForTask('修复这个 bug', 5)` 首项为 `debug`，`score` = 命中词数 | 待验收 |
| 9 | `injectEnabled=false` 时动态段不注册、工具仍可用 | 配置该值挂载后：system prompt 无 `【思维模块·已激活` 字样，`think_list` 仍可答 | 待验收 |
| 10 | 线上进程确实在跑本构建 | `lib/index.js` mtime vs web 进程启动时间（§8.1 第 ① 步） | 待验收（当前未挂载） |

## 8 · 与实现的关系

| 文件 | 职责 |
|------|------|
| `package.json` | 包名 `dsh-agent-thinking`、版本 `0.1.0`、`main: lib/index.js`；peer 依赖 `@deepseek-ai/cordis` ^4.0.1、`@deepseek-ai/schemastery` ^3.18.1-rc.1、`@deepseek-ai/dsh-tools` ^0.1.0-rc.6、`@deepseek-ai/dsh-system-prompt` ^0.1.0-rc.6；脚本 `build`/`typecheck` = `tsc -p tsconfig.json` |
| `src/index.ts` | `name`/`inject`/`Config` 声明、动态段注册、6 个工具定义与注册、渲染辅助函数 |
| `src/modules.ts` | 14 模块库 + `LAYER_LABEL` + `MODULE_BY_ID` + `groupByLayer` + `renderActiveModules`（纯数据/纯函数） |
| `src/store.ts` | `ThinkingStore`（`activeList`/`isActive`/`load`/`unload`/`clear`）+ `suggestForTask`（纯逻辑，注释明示「不依赖 Cordis 运行时，便于离线单测」） |

### 8.1 生效判据

改了代码后**「重建 ≠ 生效」**，按序取证，缺一不可：① `lib/index.js` 的 mtime **晚于** web 进程启动时间 = 改动没进当前进程，需重启（§5.11 规则 6）；② 进程日志出现 `[dsh-agent-thinking] apply <ISO> (HMR probe)` 与 `ready: 14 modules, inject=<bool>`；③ 工具可答——`think_list` 列出 14 条、`think_status` 报激活数（工具存在即证明 `ctx.tools.register` 跑过）；④ 行为生效——`think_load('debug')` 后下一次 system prompt 装配应含 `【思维模块·已激活 N 个】` 与 `## 调试思维（debug）` 正文；⑤ 配置生效——`injectEnabled=false` 时段消失但工具仍在。

### 8.2 回退

- **停用（最快、无代码改动）**：`plugin_stop`（写 patch `disabled`）或 `plugin_unmount`——本插件当前本就未挂载，回退面为零。
- **代码/文档回滚**：`git revert <commit>` 或 `git checkout <旧 commit> -- src/` 后 `pnpm build`；因无状态落盘，回退**不涉及数据迁移**、无残留（激活态随进程消失）。本文件纯新增，删除即回到「无语义文档」原状。

## 9 · 实践修订记录

- 2026-09-14 补课：本插件此前无语义文档（可维护性工程）
- 2026-08-21 弃用（README 记录）：主人定调「技能体系比思维模块插件更好」→ 思维内容迁移至技能 `thinking-frameworks`，插件从 web 组合 unmount，源码归档
- 2026-09-14 实测：`plugin_list(source=self, status=mounted)` 44 项中无本插件，确认「未挂载」为当前事实

## 10 · 未决问题

1. **多会话作用域未取证**：`ThinkingStore` 实例由 `apply` 闭包持有，而 `ctx.systemPrompt.section` 注册在 ctx 作用域——同进程多会话/子代理是否**共享同一激活集**（互相污染）？未读宿主 `systemPrompt`/`tools` 实现，不下结论。
2. **可维护性缺口**：无 `tests/` 目录、无落盘轨迹、`ctx.logger` 不落盘（§5.22 第 1、2 条不达标）；`console.log('... (HMR probe)')` 是调试期遗留探针，是否清理未定。若日后重启本线，宜先补侧车轨迹与离线单测（`src/store.ts` 已是纯逻辑，成本低）。
3. **注册表归属**：`docs/semantics/registry.json` 无本插件条目（2026-09-14 grep 无命中）；本次任务限定只写本文件，未登记——若登记，`status` 宜为 `deprecated` 以对齐 README，待主人/队长裁决。
4. **语义重叠**：`thinking-frameworks` 技能与本插件 14 模块内容重叠，是否保留 `think_*` 工具面（而非纯归档）尚无结论。

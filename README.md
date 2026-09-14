<!--
  DSH 插件生态公约声明（plugin-ecosystem-convention · 组合优先/声明清晰/兼容优先）
  purpose: 思维插件（提示词层面 MoE）：14 个思维模块按需动态加载进 system prompt，任务相关时切换思维方式（感知/推演/执行/交付/反馈五层认知流）
  inject: 'systemPrompt','tools'
  tools: think_list,think_status,think_load,think_unload,think_clear,think_suggest
  runtime: host-only
  envDeps: 无（纯提示词层，不调外部服务）
  boundary: 只改提示词（system prompt 段），不改变工具面/权限/沙箱；模块加载与否始终由 agent 决策，不强制
  compat: cordis ^4.0.1 / dsh-tools ^0.1.0-rc.6 / dsh-system-prompt ^0.1.0-rc.6
  部署状态（2026-08-21 起）：已弃用并卸载（unmount），源码归档；本机 ${DSH_HOME} 无 thinking-trace.jsonl 可佐证
-->
# dsh-agent-thinking（已弃用，源码归档）

<p align="center">
  <a href="https://github.com/jonah791/dsh-agent-thinking"><img src="https://img.shields.io/badge/version-0.1.0-blue" alt="version"></a>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/TypeScript-3178C6" alt="TypeScript">
  <img src="https://img.shields.io/badge/tests-15%20passed-brightgreen" alt="tests">
</p>

> **弃用说明（2026-08-21）**：主人定调「技能体系比思维模块插件更好」。本插件已从 web 组合卸载（unmount），源码归档保留供参考。**思维内容已迁移至技能 `thinking-frameworks`**——按基准实证校准的认知流思维框架，改用技能体系承载（更丰富、单一来源、可积累）。基准数据与复现脚本保留在 `<工作区>/_tmp_review/think-bench/`。

**一句话**：把「思维方式」做成可加载的提示词模块——14 个模块按**认知流五层**分组，任务相关时 `think_load` 注入 system prompt，用完 `think_unload` 卸掉。

**为什么当年用它**：不动工具面、不加重权限，只改**当前思考的姿态**——同一套工具下，排障加载 `debug`、设计加载 `design`（自动后置 `critical` 审查）；未加载的模块零上下文成本，卸载即回默认，不留污染。这条「按任务姿态取用思维框架」的结论被后续技能体系完整继承。

## 能力

| 工具 | 用途 |
|------|------|
| `think_list` | 列出全部思维模块（按认知流五层分组，`●`=已激活）——选模块前先看清单 |
| `think_status` | 查看当前已激活的思维模块（含组合拳附带） |
| `think_load` | 加载思维模块（任务相关时调用，注入 system prompt 改变思维方式）。`plan`/`design` 会自动附带 `critical` 审查；激活超过上限会警告（决策归你，不强制） |
| `think_unload` | 卸载思维模块（任务切换时清理，防止思维污染） |
| `think_clear` | 清空全部激活的思维模块（新任务开始/回归默认状态时用） |
| `think_suggest` | 任务描述 → 推荐思维模块（按关键词命中打分；仅建议，加载与否由你决策） |

### 14 个思维模块（认知流五层）

| 层 | 模块（id · 名） |
|----|-----------------|
| 感知 `perceive` | `research` 取证思维 · `distill` 萃取思维 · `empathize` 共情思维 |
| 推演 `reason` | `design` 设计思维 · `plan` 规划思维 · `inversion` 逆向思维 |
| 执行 `act` | `debug` 调试思维 · `focus` 专注思维 · `adapt` 应变思维 |
| 交付 `deliver` | `write` 写作思维 · `persuade` 说服思维 · `decision` 决策思维 |
| 反馈 `feedback` | `critical` 批判思维 · `review` 复盘思维 |

组合拳：`plan` / `design` 激活时**自动附带** `critical`（`autoPairEnabled`），堵住「规划完不自审」这一高频失效模式。

## 快速开始

**1) 装依赖**（自研插件家园 `self-plugins/`，在目标 profile 的 `package.json` 加 link 依赖）：

```jsonc
"dsh-agent-thinking": "link:<工作区>/self-plugins/dsh-agent-thinking"
```

**2) 挂组合**（agent 预设行）：

```yaml
- id: agent-thinking
  name: dsh-agent-thinking
  config:
    maxActiveModules: 3
```

**3) 30 秒验证**：调 `think_list` → 应返回五层分组的 14 个模块（全部 `○`）；再调 `think_load { module: "plan" }` → `think_status` 应同时列出 `plan` **与** `critical`（组合拳生效）。

## 配置

| 项 | 默认 | 说明 |
|----|------|------|
| `injectEnabled` | `true` | 是否把已激活模块注入 system prompt（关掉则退化为纯查询工具） |
| `maxActiveModules` | `3` | 同时激活上限（超过只警告，不强制卸载——决策归 agent） |
| `autoPairEnabled` | `true` | 组合拳开关（`plan`/`design` 自动附带 `critical`） |
| `sectionOrder` | `50` | 注入段在 system prompt 中的排序权重（0=persona 附近，100=工具指导附近） |

## 落盘与自证（出问题时先看这里）

每次决策落一行 JSONL 到 **`<DSH_HOME>/thinking-trace.jsonl`**（`DSH_HOME` 缺省 `~/.dsh`）：

| 阶段 | 含义 |
|------|------|
| `boot` | 插件装载（含配置快照） |
| `load` | 加载模块（模块 id + 激活后列表） |
| `unload` | 卸载模块 |
| `clear` | 清空全部激活 |
| `suggest` | 任务描述 → 推荐建议 |
| `inject` | 注入 system prompt（含注入签名——签名不变即注入内容没变） |

**一条命令答五问**：

```bash
tail -3 "$DSH_HOME/thinking-trace.jsonl"
# ① 跑的是哪个构建   → build = "<版本>@<模块 mtime ms>"
# ② 谁发起 / 调了什么 → phase + action（哪个工具）+ task（suggest 的输入摘要）
# ③ 断在哪一段       → phase 枚举（boot/load/unload/clear/suggest/inject）
# ④ 结果质量         → 激活模块列表 / 注入签名
# ⑤ 耗时与预算       → 各阶段 durationMs
```

写盘失败一律吞错返回 `false`，**绝不影响模块加载与注入**。

## 生效判据与回退

**生效判据**（三选一，按可靠性排序）：
1. `tail -1 "$DSH_HOME/thinking-trace.jsonl"` 里 `build` 的 mtime **等于** `lib/index.js` 的 mtime ⇒ 进程在跑当前构建；
2. 生态级：`plugin_boot_status`（`dsh-plugin-bootreport`）返回 `liveNow` 含本插件 ⇒ 同上；
3. 行为级：工具面出现 `think_list` / `think_load`，且 `think_load` 后 `think_status` 列表真变化。

**当前实际状态**：本机 `${DSH_HOME}` **无** `thinking-trace.jsonl` ⇒ 未挂载运行（源码归档）。上述判据用于重新挂载后的验收。

> 注意：**重新构建 ≠ 生效**——产物 mtime 新只证明「构建过」，进程启动时间晚于产物 mtime 才算「在跑它」。

**回退**：
- 源码级：`git -C self-plugins/dsh-agent-thinking revert <commit>` → 重新构建 → 预检 → 重启；
- 组合级：预设里给 `agent-thinking` 行加 `disabled: true`（或移除该行）→ 哨兵重启；
- 运行期：`think_clear` 清空全部激活模块即回默认姿态；轨迹文件可随时删除（无业务状态）。

## 测试

```bash
npm test        # = node --test "tests/*.test.mjs"
```

**15 例离线测试**：
- `tests/trace.test.mjs` — 轨迹层：路径解析、序列化稳定、容错解析（坏行/半行跳过）、**尸体测试**（不可写路径 → 返回 `false` 且不抛）、端到端接线
- `tests/store.test.ts` — 模块存储与激活集合的状态迁移（随 `tsc` 构建类型检查覆盖）

无网络、无外部依赖：`think_suggest` 的关键词打分与模块表全在进程内。

## 设计要点

- **提示词层面 MoE**：模块正文只在 `think_load` 时进 system prompt——未加载的模块**零 token 成本**。动态段以 `text: () => renderActiveModules(...)` 函数注册，每次装配求值；未激活返回空串（装配时被 drop）。
- **决策权不下放给插件**：超过 `maxActiveModules` 只**警告**不卸载；`think_suggest` 只**建议**不加载——插件给菜单，选哪个归 agent。
- **组合拳是唯一硬规则**：`plan`/`design` → `critical` 的自动附带，只针对一种已被反复验证的失效模式；其余组合一律留给决策者。
- **卸载即还原**：`think_unload` / `think_clear` 后注入段消失，不残留——防思维污染靠「卸」而不是靠「覆盖」。
- **激活状态不持久化**：进程内、会话级，重启即清空——思维模块是「当前任务」的姿态，不是长期配置。

## 相关文档

| 文档 | 内容 |
|------|------|
| [`docs/semantic.md`](docs/semantic.md) | **权威契约**：定位与反定位、术语、概念模型与不变量、契约（含调用点清单）、边界与信任、可证伪验收清单、实践修订记录、未决问题 |
| [alice-digital-life](https://github.com/jonah791/alice-digital-life) | 本插件所属生态的中心索引（全部自研插件） |
| 技能 `thinking-frameworks` | 本插件思维内容的**继任实现**：认知流五层 + 按任务姿态取用的实证纪律 |
| 技能 `plugin-maintainability` | 插件可维护性工程（自证轨迹 / 五问可取 / 观测不反噬） |

## License

MIT © jonah791

---

本插件属于我的数字生命爱丽丝（[alice-digital-life](https://github.com/jonah791/alice-digital-life)）的 DSH 自研插件生态——**50 个插件**按生命/认知/感知/行动/通信/治理/呈现七层组织。

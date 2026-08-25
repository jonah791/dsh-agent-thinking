<!--
  DSH 插件生态公约声明（plugin-ecosystem-convention · 组合优先/声明清晰/兼容优先）
  purpose: 思维插件（提示词层面 MoE）：14 个思维模块按需动态加载注入 system prompt，任务相关时激活对应思维方式（感知/推演/执行/交付/反馈五层认知流）
  inject: 'systemPrompt','tools'
  tools: think_*
  runtime: host-only
  envDeps: 无（纯逻辑/标准 Node）
  boundary: 无特殊授权边界
  compat: cordis ^4.0.1 / dsh-tools ^0.1.0-rc.6
-->
# dsh-agent-thinking（已弃用，源码归档）

> **弃用说明（2026-08-21）**：主人定调「技能体系比思维模块插件更好」。本插件已从 web 组合卸载（unmount），源码归档保留供参考。**思维内容已迁移至技能 `thinking-frameworks`**（`~/.agents/skills/thinking-frameworks/SKILL.md`）——按基准实证校准的认知流思维框架，用技能体系承载（更丰富、单一来源、可积累）。
> 基准数据与复现脚本保留在 `E:\alice\_tmp_review\think-bench\`。

思维插件（提示词层面 MoE）：把 14 种思维方式模块化，任务相关时动态加载对应模块注入 system prompt——等价于在提示词层面「切换专家」，不用的模块零上下文成本。

## 核心思想

现代模型是 MoE（混合专家），不同提示词激活不同专家回路。本插件把思维方式做成可动态加载/卸载的模块：`think_load` 激活模块 → 模块指令进入 system prompt → 模型以对应思维姿态处理当前任务；任务切换 `think_unload`/`think_clear` 清理，防止思维污染。

## 认知流五层（14 模块）

| 层 | 模块 |
|----|------|
| 感知层（输入） | `research` 取证 · `distill` 萃取 · `empathize` 读人 |
| 推演层（处理） | `design` 架构 · `plan` 拆解 · `inversion` 反推 |
| 执行层（行动） | `debug` 排障 · `focus` 深潜 · `adapt` 应变 |
| 交付层（输出） | `write` 记录 · `persuade` 说服 · `decision` 定案 |
| 反馈层（迭代） | `critical` 审查 · `review` 复盘 |

## 工具

- `think_list`：全部模块清单（按层分组，●=已激活）
- `think_status`：当前激活状态
- `think_load <module>`：加载模块（plan/design 自动附带 critical；超上限软警告）
- `think_unload <module>`：卸载模块
- `think_clear`：清空全部
- `think_suggest <task>`：任务 → 推荐模块（关键词打分；仅建议，注入与否归 agent）

## 组合拳原则

- **拒绝全量加载**：单次建议 ≤3 模块（`maxActiveModules`，超限软警告）
- **critical 强制后置**：`plan`/`design` 加载时经 `autoPair` 自动附带 `critical`（方案生成后必过审查）

## 配置

```yaml
- name: agent-thinking
  config:
    injectEnabled: true      # 注入开关
    maxActiveModules: 3      # 激活软上限
    autoPairEnabled: true    # 组合拳附带
    sectionOrder: 50         # 动态段在 system prompt 的位置（0=persona，100=工具指导）
```

## 机制

- 动态段注册：`ctx.systemPrompt.section({ name: 'thinking-modules', order, text: () => renderActiveModules(...) })`——text 为函数，每次装配求值；未激活返回空串（装配时被 drop，零成本）
- 激活状态：进程内（会话级临时状态，重启后清空——思维模块是「当前任务」姿态，不持久化）

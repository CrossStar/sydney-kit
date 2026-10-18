# 宿主补丁（已归档）

这里保存 sydney-kit 曾经默认执行的三份 Pi 宿主补丁，以及依赖它们的代码块渲染器。插件不再加载、维护或测试这些代码；`npm test` 也不运行这里的测试。

| 补丁 | 作用 | 脚本 |
| --- | --- | --- |
| 代码块钩子 | 在 pi-tui 的 Markdown 渲染器中插入钩子，由 sydney-kit 绘制带语言标题和竖线的 Shiki 代码块 | `patches/apply.mjs` |
| 上下文压缩卡片 | 替换压缩摘要组件为单行卡片 | `patches/compaction-card.mjs` |
| Tern 图片绘制顺序 | 在 Tern 中最后绘制 Kitty 图片，避免滚动闪烁 | `patches/tern-images.mjs` |

## 归档原因

- 补丁修改的是 Pi 安装包中未打包的 `dist/` 文件。Pi 1.3.0 的 `pi` 命令运行的是 `dist/bundle/`，其中自带一份打包好的 pi-tui，不会读取这些文件。因此用 `pi` 启动时补丁不生效，而状态检查仍显示已应用，也没有任何提示。
- 修改宿主安装文件只适配 1.3.0 的已验证哈希，每次 Pi 升级都要重新适配，且在启动时自动写入安装目录的风险与收益不成比例。

## 已应用补丁的安装

归档前应用过的补丁会留在 Pi 安装目录中，直到 Pi 更新或重装覆盖这些文件。插件不再自动撤销，需要时在插件目录手动运行：

```bash
node archive/host-patches/patches/apply.mjs status --root <包含 pi-coding-agent 和 pi-tui 的目录>
node archive/host-patches/patches/apply.mjs revert --root <同上>
node archive/host-patches/patches/compaction-card.mjs revert --root <同上>
node archive/host-patches/patches/tern-images.mjs revert --root <同上>
```

`--root` 默认是当前用户的 Bun 全局安装目录（`~/.bun/install/global/node_modules/@earendil-works`），也可以用环境变量 `SYDNEY_KIT_PI_ROOT` 指定。revert 只在文件与记录的原始哈希或补丁结果一致时才写入，并保留 `.bak` 备份；撤销后需完整重启 Pi。

已打补丁的宿主文件不引用插件目录中的任何文件，所以即使不撤销，更新插件也不会导致 Pi 出错。

## 目录

| 路径 | 内容 |
| --- | --- |
| `patches/` | 补丁引擎（版本、哈希、备份、原子写入）、三份补丁脚本及对应 diff。仍可手动运行 |
| `src/` | 启动时自动维护补丁的逻辑、代码块渲染器及钩子约定。保留原样供参考，引用的配置项已从 `config.ts` 删除，不能直接加载 |
| `tests/` | 补丁和钩子的测试，保留原样，不再运行 |
| `docs/` | 压缩卡片、Tern 补丁说明，以及包含代码块钩子章节的 `HIGHLIGHT.md` 原文 |

要查看这些功能集成在插件中的完整状态，检出归档前的提交 `ab9b882`。

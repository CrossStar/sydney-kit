# Sydney Kit

为 [Pi Coding Agent](https://github.com/earendil-works/pi) 提供紧凑工具输出、代码高亮、文件差异预览、自定义输入框和图片粘贴的界面扩展。

目前主要在 **Windows + Pi 1.3.0** 上使用和验证。各项功能可单独开启或关闭。

## 功能

| 功能 | 使用体验 |
| --- | --- |
| 紧凑工具输出 | 用状态图标、工具名和摘要展示调用结果，展开后查看完整输出。 |
| 文件差异预览 | edit / write 显示行号和单词级改动，默认上下排列，也可切换双栏。 |
| 代码块高亮 | 使用 Shiki，为代码块添加语言标题、左侧竖线和较长代码块的行数信息。 |
| 输入框与运行状态 | 圆角边框、`❯` 提示符，以及跟随实际事件变化的工作状态。 |
| 用户消息分隔 | 用细线区分消息，不添加时间戳，保留原始正文。 |
| 状态栏 | 查看模型、思考等级、上下文使用量、当前路径和 Git 分支等信息。 |
| 图片粘贴 | Windows 下按 `Alt+V` 添加真实图片附件，支持连续粘贴多张和整段删除图片占位。 |
| 网页与后台任务摘要 | 为已有的搜索、抓取和后台任务工具提供易读摘要；后台工具名称保留 `bg` 标识。 |
| 补丁维护 | 自动检查代码块钩子，以及 Tern 的图片滚动兼容补丁；通过版本和文件校验后才应用。 |

插件只为已有网页、后台任务和 Fusion 工具优化显示，不负责安装这些工具。

## 下载与安装

### 获取源码包

当前以 **`sydney-kit.zip` 源码压缩包**提供，尚未配置公开下载地址或发布到 npm。请从维护者提供的附件获取源码包；不要使用 `npm install sydney-kit` 作为本插件的安装命令。

安装包包含一个 `sydney-kit/` 文件夹。将它解压到 Pi 的用户扩展目录：

```text
~/.pi/agent/extensions/sydney-kit/
├── index.ts
├── config.ts
├── package.json
├── package-lock.json
├── patches/
├── scripts/
└── vendor/
```

Windows 对应目录为 `%USERPROFILE%\.pi\agent\extensions\sydney-kit\`。确认 `index.ts` 位于这一层，避免解压成两层同名目录。

### 安装依赖

准备好可用的 Node.js 和 npm，然后在 PowerShell 中运行：

```powershell
cd "$env:USERPROFILE\.pi\agent\extensions\sydney-kit"
npm ci
```

源码包不包含 `node_modules`，需要这一步安装 Shiki 等依赖。

### 设置补丁安装路径

**首次加载前**，打开 `config.ts`，将以下两项的 `packageRoot` 改为本机 Pi 的实际安装位置：

- `codeblockPatch.packageRoot`
- `ternImagePatch.packageRoot`

这个目录应同时包含 `pi-coding-agent/` 和 `pi-tui/`，通常是安装目录中的 `node_modules/@earendil-works/`。源码当前保留维护者机器的路径，需要自行调整。

如果暂时不使用宿主补丁，可以先设置：

```ts
features.codeblock = false;
features.codeblockPatch = false;
features.ternImagePatch = false;
```

其他界面功能可以继续使用。补丁目前只适配 **Pi / pi-tui 1.3.0** 的已验证文件，新版本需要重新适配。

### 加载插件

启动 Pi，或在已打开的 Pi 中执行：

```text
/reload
```

Pi 会自动发现扩展目录中的 `index.ts`。首次安装若自动应用了代码块或 Tern 补丁，**需要完整退出并重启 Pi**，才能加载修改后的宿主代码。代码块补丁成功处理时保持静默。

## 日常使用

- **查看工具详情**：使用 Pi 的 `Ctrl+O` 展开或折叠工具结果。默认隐藏原始参数 JSON，保留结果与错误。
- **查看改动**：edit / write 默认预览最多 6 行改动，展开后查看完整差异。
- **粘贴图片**：复制图片或资源管理器中的图片文件，按 `Alt+V`。编辑器会出现 `[图片 1]`，发送后保留带尺寸的标记，并附加实际图片数据。
- **删除图片**：光标位于图片占位内或末尾时，按 Backspace 删除整个占位。
- **修改配置**：编辑 `config.ts` 后执行 `/reload`；修改宿主补丁后则需要完整重启。

图片粘贴要求 Windows 剪贴板环境和支持图片输入的模型。默认将图片长边限制为 2000 像素。未发送图片的关联保存在内存中，执行 `/reload` 或切换会话后，需要重新粘贴草稿中的图片。

## 配置

所有功能开关集中在 `config.ts`：

```ts
export const features = {
  footer: true,          // 状态栏
  compact: true,         // 紧凑工具输出
  userMessage: true,     // 用户消息分隔线
  appearance: true,      // 输入框与运行状态
  codeblock: true,       // 代码块样式与高亮
  diff: true,            // 文件差异预览
  pasteImage: true,      // Windows 图片粘贴
  ternImagePatch: true,  // Tern 图片补丁维护
  codeblockPatch: true,  // 代码块钩子补丁维护
};
```

常用调整：

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `diffs.sideBySide` | `false` | 开启双栏 diff；终端宽度不足时回退上下排列。 |
| `compact.showExpandedArgs` | `false` | 展开工具时显示原始参数，便于调试。 |
| `compact.webPreviewLines` | `4` | 网页工具的折叠预览行数。 |
| `pasteImage.shortcut` | `alt+v` | 图片粘贴快捷键。 |
| `pasteImage.maxEdge` | `2000` | 图片最长边像素数。 |
| `highlighting.theme` | `github-dark-dimmed` | Shiki 代码高亮主题。 |

输入框、分隔线和正文颜色还会受到当前 Pi 主题影响。本插件不自动切换主题；维护者使用的自定义 `tokyo-night` 主题不包含在源码包中。

## 补丁、更新与停用

两份补丁均修改 Pi 安装目录中的文件，并保留原文件备份：

| 补丁 | 自动维护条件 | 管理脚本 |
| --- | --- | --- |
| 代码块渲染钩子 | TUI 模式，`codeblock` 与 `codeblockPatch` 均开启 | `patches/apply.mjs` |
| Tern 图片绘制顺序 | TUI 模式，`TERM_PROGRAM=tern`，`ternImagePatch` 开启 | `patches/tern-images.mjs` |

Pi 更新或重装可能覆盖补丁。同一受支持版本的原文件被覆盖后，插件可以自动补回；未知版本、未知文件修改或损坏的备份会使自动处理停止并提示。成功补回后仍需完整重启 Pi。

手动管理时，在插件目录运行下列命令，并把路径替换为实际安装根目录：

```powershell
node patches/apply.mjs status --root "D:/path/to/node_modules/@earendil-works"
node patches/tern-images.mjs status --root "D:/path/to/node_modules/@earendil-works"
```

将 `status` 替换为 `apply` 或 `revert`，可以手动应用或撤销。**手动脚本不会读取 `config.ts` 中的路径，请显式传入 `--root`。**

关闭补丁开关只停止自动维护，不撤销已经写入的补丁。要完全停用：先关闭两个补丁维护开关并 `/reload`，待已有检查结束后执行各自的 `revert`，完整退出 Pi，再移除插件文件夹。

更新 Sydney Kit 前，建议保留自己的 `config.ts` 设置。替换源码、安装依赖后再对照新配置合并设置，避免直接覆盖掉新增选项。

## 更多说明

- [代码高亮、diff 与代码块钩子](HIGHLIGHT.md)
- [图片粘贴与附件行为](PASTE-IMAGE.md)
- [Tern 图片兼容补丁](TERN-IMAGE-PATCH.md)
- [渲染性能与缓存](INTERACTION-PERFORMANCE.md)
- [界面模块与迁移说明](MIGRATION.md)

使用其他会替换输入框、工具渲染器或状态栏的扩展时，可能需要关闭重叠功能。终端图片是否正常显示，还取决于终端支持的图片协议和 Pi 的对应设置。

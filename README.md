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

聊天历史中的上下文压缩卡片采用单行摘要，展开后显示精确压缩前 token 数和可读摘要；不显示加密元数据。Pi 1.3.0 宿主补丁需完整重启生效，详见 [压缩卡片说明](docs/COMPACTION-CARD.md)。

## 下载与安装

### 使用 Pi 安装（推荐）

```powershell
pi install git:github.com/CrossStar/sydney-kit
```

也可以使用完整仓库地址：

```powershell
pi install https://github.com/CrossStar/sydney-kit.git
```

Pi 会克隆仓库、安装运行依赖并登记扩展入口，不需要手动复制文件或运行 `npm ci`。安装后在 Pi 中执行 `/reload`，或重新启动 Pi。若首次应用了宿主补丁，需要完整重启才能生效。

如果此前已经手动安装过本插件，请先通过 `pi config` 停用旧副本，避免同一功能被注册两次。宿主补丁的版本和安装路径要求见下文。

更新插件：

```powershell
pi update git:github.com/CrossStar/sydney-kit
```

仅运行 `pi update` 会更新 Pi 本身。修改过插件配置时，更新前请保存自己的设置。

### 手动下载与安装

从 [GitHub Releases](https://github.com/CrossStar/sydney-kit/releases/latest) 下载 `sydney-kit-0.1.0.zip`，或在 [仓库页面](https://github.com/CrossStar/sydney-kit) 选择 **Code → Download ZIP** 获取源码。

也可以克隆仓库：

```powershell
git clone https://github.com/CrossStar/sydney-kit.git
```

本插件尚未发布到 npm，不要使用 `npm install sydney-kit` 作为安装命令。GitHub 自动生成的源码包可能解压为 `sydney-kit-main/`，安装前请将目录重命名为 `sydney-kit/`。

安装包包含一个 `sydney-kit/` 文件夹。将它解压到 Pi 的用户扩展目录：

```text
~/.pi/agent/extensions/sydney-kit/
├── index.ts
├── config.ts
├── package.json
├── package-lock.json
├── src/                       # 功能代码
├── patches/
├── scripts/
├── docs/
├── themes/                    # Tokyo Night 主题
├── tests/
└── vendor/
```

Windows 对应目录为 `%USERPROFILE%\.pi\agent\extensions\sydney-kit\`。确认 `index.ts` 位于这一层，避免解压成两层同名目录。

### 手动安装依赖

使用上面的 `pi install` 时跳过本步骤。手动安装需要准备好可用的 Node.js 和 npm，然后在 PowerShell 中运行：

```powershell
cd "$env:USERPROFILE\.pi\agent\extensions\sydney-kit"
npm ci
```

源码包不包含 `node_modules`，需要这一步安装 Shiki 等依赖。

### 设置补丁安装路径

**首次加载前确认路径**。若不是默认的 Bun 全局安装，可设置环境变量 `SYDNEY_KIT_PI_ROOT`，或在插件的 `config.ts` 中修改 `hostPatches.packageRoot`（三份补丁共用）。

这个目录应同时包含 `pi-coding-agent/` 和 `pi-tui/`，通常是安装目录中的 `node_modules/@earendil-works/`。默认使用当前用户的 Bun 全局安装目录，也可以通过环境变量 `SYDNEY_KIT_PI_ROOT` 指定；其他安装方式需确认路径。

如果暂时不使用宿主补丁，可以先设置：

```ts
features.codeblock = false;
features.codeblockPatch = false;
features.ternImagePatch = false;
features.compactionCard = false;
```

其他界面功能可以继续使用。补丁目前只适配 **Pi / pi-tui 1.3.0** 的已验证文件，新版本需要重新适配。

### 加载插件

启动 Pi，或在已打开的 Pi 中执行：

```text
/reload
```

Git 安装通过 `package.json` 中声明的 `index.ts` 加载；手动安装则由扩展目录发现入口。首次安装若自动应用了代码块或 Tern 补丁，**需要完整退出并重启 Pi**，才能加载修改后的宿主代码。代码块补丁成功处理时保持静默。

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
  compactionCard: true,  // 上下文压缩卡片补丁维护
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

输入框、分隔线和正文颜色还会受到当前 Pi 主题影响。本插件附带 `themes/tokyo-night.json`，保留现有测试样本中的配色。使用 `pi install` 安装后，启动或执行 `/reload` 时会默认应用 `tokyo-night`。可在 `/settings` → **Theme** 中选择其他主题；Pi 保存该选择后，插件在后续启动和重载时不再覆盖。此默认值只在终端交互模式应用。

手动安装的用户需将 `themes/tokyo-night.json` 复制到 `~/.pi/agent/themes/tokyo-night.json`（Windows 为 `%USERPROFILE%\.pi\agent\themes\tokyo-night.json`），再执行 `/reload` 即可应用默认主题。`tests/fixtures/tokyo-night.json` 仍为固定测试样本。Shiki 代码高亮继续由 `highlighting.theme` 单独配置。

## 补丁、更新与停用

三份补丁均修改 Pi 安装目录中的文件，并保留原文件备份。它们共用 `patches/engine.mjs` 中的版本、哈希、备份与原子写入逻辑：

| 补丁 | 自动维护条件 | 管理脚本 |
| --- | --- | --- |
| 代码块渲染钩子 | TUI 模式，`codeblock` 与 `codeblockPatch` 均开启 | `patches/apply.mjs` |
| Tern 图片绘制顺序 | TUI 模式，`TERM_PROGRAM=tern`，`ternImagePatch` 开启 | `patches/tern-images.mjs` |
| 上下文压缩卡片 | TUI 模式，`compactionCard` 开启 | `patches/compaction-card.mjs` |

Pi 更新或重装可能覆盖补丁。同一受支持版本的原文件被覆盖后，插件可以自动补回；未知版本、未知文件修改或损坏的备份会使自动处理停止并提示。成功补回后仍需完整重启 Pi。

手动管理时，在插件目录运行下列命令，并把路径替换为实际安装根目录：

```powershell
node patches/apply.mjs status --root "D:/path/to/node_modules/@earendil-works"
node patches/tern-images.mjs status --root "D:/path/to/node_modules/@earendil-works"
node patches/compaction-card.mjs status --root "D:/path/to/node_modules/@earendil-works"
```

将 `status` 替换为 `apply` 或 `revert`，可以手动应用或撤销。**手动脚本不会读取 `config.ts` 中的路径，请显式传入 `--root`。**

关闭补丁开关只停止自动维护，不撤销已经写入的补丁。要完全停用：先关闭三个补丁维护开关并 `/reload`，待已有检查结束后执行各自的 `revert`，完整退出 Pi，再移除插件文件夹。

更新 Sydney Kit 前，建议保留自己的 `config.ts` 设置。替换源码、安装依赖后再对照新配置合并设置，避免直接覆盖掉新增选项。

## 项目开发

源码按职责放在 `src/ui`、`src/tools`、`src/rendering`、`src/clipboard` 和 `src/host`。根目录的 `index.ts` 只负责注册，`config.ts` 保留为统一配置入口。

```powershell
npm test
npm run package
npm run patch:status
```

`npm test` 运行独立验证脚本，不启动 Pi 或模型会话；当前完整套件包含 Windows 和已应用宿主钩子的集成测试。`npm run package` 在 `dist/` 生成源码 ZIP 和文件哈希清单，不包含 `node_modules`。开发环境、安装同步及回退见 [开发指南](docs/DEVELOPMENT.md)。

## 更多说明

- [代码高亮、diff 与代码块钩子](docs/HIGHLIGHT.md)
- [图片粘贴与附件行为](docs/PASTE-IMAGE.md)
- [Tern 图片兼容补丁](docs/TERN-IMAGE-PATCH.md)
- [渲染性能与缓存](docs/INTERACTION-PERFORMANCE.md)
- [界面模块与迁移说明](docs/archive/MIGRATION.md)

使用其他会替换输入框、工具渲染器或状态栏的扩展时，可能需要关闭重叠功能。终端图片是否正常显示，还取决于终端支持的图片协议和 Pi 的对应设置。

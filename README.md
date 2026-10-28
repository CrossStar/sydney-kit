# Sydney Kit

为 [Pi Coding Agent](https://github.com/earendil-works/pi) 提供紧凑工具输出、带语法高亮的文件差异预览、自定义输入框和图片粘贴的界面扩展。

目前主要在 **Windows + Pi 1.3.0** 上使用和验证。各项功能可单独开启或关闭。

## 功能

| 功能 | 使用体验 |
| --- | --- |
| SSH 远程工作区 | 通过 `/remote` 连接服务器，read / write / edit / bash 和 `!` 命令在远端执行，保留文件差异预览。 |
| 紧凑工具输出 | 用状态图标、工具名和摘要展示调用结果，展开后查看完整输出。 |
| 文件差异预览 | edit / write 显示行号和单词级改动，默认上下排列，也可切换双栏。 |
| 输入框与运行状态 | 圆角边框、`❯` 提示符，以及跟随实际事件变化的工作状态。 |
| 用户消息分隔 | 用细线区分消息，不添加时间戳，保留原始正文。 |
| 状态栏 | 查看模型、思考等级、上下文使用量、当前路径和 Git 分支等信息。 |
| 图片粘贴 | 按 `Alt+V` 添加真实图片附件（Windows、macOS、Linux，以及通过 SSH 的远端会话），支持连续粘贴多张和整段删除图片占位。 |
| 网页与后台任务摘要 | 为已有的搜索、抓取和后台任务工具提供易读摘要；后台工具名称保留 `bg` 标识。 |

插件只为已有网页、后台任务和 Fusion 工具优化显示，不负责安装这些工具。

插件不修改 Pi 安装目录中的任何文件。早期版本的代码块样式、上下文压缩卡片和 Tern 图片补丁需要修改 Pi 安装文件，已归档到 [archive/host-patches](archive/host-patches/README.md)，不再默认执行。

## 下载与安装

### 使用 Pi 安装（推荐）

```powershell
pi install git:github.com/CrossStar/sydney-kit
```

也可以使用完整仓库地址：

```powershell
pi install https://github.com/CrossStar/sydney-kit.git
```

Pi 会克隆仓库、安装运行依赖并登记扩展入口，不需要手动复制文件或运行 `npm ci`。安装后在 Pi 中执行 `/reload`，或重新启动 Pi。

如果此前已经手动安装过本插件，请先通过 `pi config` 停用旧副本，避免同一功能被注册两次。

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
├── archive/                   # 已归档的宿主补丁
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
npm ci --legacy-peer-deps
```

源码包不包含 `node_modules`，需要这一步安装 Shiki 等依赖。`package-lock.json` 目前不记录 Pi 自身的 peer 依赖，因此需要加 `--legacy-peer-deps`；Pi 的包由宿主提供，不会重复安装。

### 加载插件

启动 Pi，或在已打开的 Pi 中执行：

```text
/reload
```

Git 安装通过 `package.json` 中声明的 `index.ts` 加载；手动安装则由扩展目录发现入口。

## 日常使用

- **查看工具详情**：使用 Pi 的 `Ctrl+O` 展开或折叠工具结果。默认隐藏原始参数 JSON，保留结果与错误。
- **查看改动**：edit / write 默认预览最多 6 行改动，展开后查看完整差异。
- **粘贴图片**：复制图片或文件管理器中的图片文件，按 `Alt+V`。编辑器会出现 `[图片 1]`，发送后保留带尺寸的标记，并附加实际图片数据。
- **删除图片**：光标位于图片占位内或末尾时，按 Backspace 删除整个占位。
- **修改配置**：编辑 `config.ts` 后执行 `/reload`。

图片粘贴需要支持图片输入的模型。Windows 使用 PowerShell，macOS 使用 Pi 自带的原生剪贴板组件；在 macOS 上需要把终端的 Option 键设为 Meta，`Alt+V` 才能生效，也可以把 `pasteImage.shortcut` 改为 `ctrl+v`。Linux 在 Wayland 下需要 `wl-clipboard`，在 X11 下需要 `xclip`；WSL 读取不到图片时，会改从 Windows 剪贴板读取。通过 SSH 运行时，在本地运行 `npm run clipboard-bridge`，并在 SSH 配置中加一行 `RemoteForward`，远端 Pi 就能粘贴本地剪贴板中的图片，配置步骤见 [SSH 图片粘贴](docs/PASTE-IMAGE.md#ssh)。默认将图片长边限制为 2000 像素。未发送图片的关联保存在内存中，执行 `/reload` 或切换会话后，需要重新粘贴草稿中的图片。

## 配置

所有功能开关集中在 `config.ts`：

```ts
export const features = {
  ssh: true,            // SSH 连接和远程工具路由
  footer: true,          // 状态栏
  compact: true,         // 紧凑工具输出
  userMessage: true,     // 用户消息分隔线
  appearance: true,      // 输入框与运行状态
  diff: true,            // 文件差异预览
  pasteImage: true,      // 剪贴板图片粘贴
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
| `pasteImage.bridgeSocket` | `/tmp/sydney-kit-{user}.sock` | SSH 剪贴板桥接在服务器上使用的 socket 路径，需要与 `RemoteForward` 一致。 |
| `highlighting.theme` | `github-dark-dimmed` | diff 使用的 Shiki 高亮主题。 |

输入框、分隔线和正文颜色还会受到当前 Pi 主题影响。本插件附带 `themes/tokyo-night.json`，保留现有测试样本中的配色。使用 `pi install` 安装后，启动或执行 `/reload` 时会默认应用 `tokyo-night`。可在 `/settings` → **Theme** 中选择其他主题；Pi 保存该选择后，插件在后续启动和重载时不再覆盖。此默认值只在终端交互模式应用。

手动安装的用户需将 `themes/tokyo-night.json` 复制到 `~/.pi/agent/themes/tokyo-night.json`（Windows 为 `%USERPROFILE%\.pi\agent\themes\tokyo-night.json`），再执行 `/reload` 即可应用默认主题。`tests/fixtures/tokyo-night.json` 仍为固定测试样本。diff 的 Shiki 高亮继续由 `highlighting.theme` 单独配置。

## 更新与停用

更新 Sydney Kit 前，建议保留自己的 `config.ts` 设置。替换源码、安装依赖后再对照新配置合并设置，避免直接覆盖掉新增选项。

从带宿主补丁的版本更新时：`codeblock`、`codeblockPatch`、`ternImagePatch`、`compactionCard` 开关和 `codeblocks`、`hostPatches` 配置已删除，合并配置时去掉即可。此前已应用到 Pi 安装目录的补丁不会自动撤销，可按 [归档说明](archive/host-patches/README.md#已应用补丁的安装) 手动 revert，或等 Pi 更新时被覆盖；不撤销也不影响插件运行。手动安装的副本应删除旧的 `patches/` 目录、`src/host/host-patches.ts`、`src/host/globals.ts`、`src/host/version.mjs` 和 `src/rendering/codeblock.ts`，避免残留两套实现。

停用插件：通过 `pi config` 停用，或删除插件目录后执行 `/reload`。

## 项目开发

根目录的 `index.ts` 只负责按开关注册和组装，`config.ts` 是统一配置入口。源码按职责划分：

| 目录 | 职责 | 扩展方式 |
| --- | --- | --- |
| `src/ui` | 状态栏、用户消息、运行状态；`editor.ts` 统一组装输入框 | 输入框功能以“底座”或“装饰器”加入 `EditorPipeline`，不直接调用 `setEditorComponent` |
| `src/tools` | 紧凑工具输出：`catalog.ts` 记录工具名，`presenters/` 按工具类别生成摘要，`status` / `layout` / `body` 负责表头与正文 | 新工具类别新增一个 presenter，并登记到 `presenters/index.ts` |
| `src/rendering` | Shiki 高亮、`diff/`（行模型与上下 / 双栏视图） | 视图只消费 `diff/model.ts` 的行模型 |
| `src/clipboard` | 剪贴板进程、图片附件、占位删除 | 占位格式集中在 `image-token.ts` |
| `src/ssh` | SSH 注册入口及按执行后端捕获的写入快照 | SSH 实现及许可证位于 `vendor/pi-ssh-remote` |
| `src/host` | 定位 Pi 安装目录，供测试加载宿主 SDK | 非默认安装设置 `SYDNEY_KIT_PI_ROOT` |
| `archive/host-patches` | 已归档的宿主补丁、代码块渲染器及其测试和文档 | 不被入口加载，`npm test` 不运行 |

```powershell
npm test
npm run package
```

`npm test` 运行独立验证脚本，不启动 Pi 或模型会话。装有 Xvfb 和 xclip 时，剪贴板测试会额外跑一次真实 X11 读取。`npm run package` 在 `dist/` 生成源码 ZIP 和文件哈希清单，不包含 `node_modules`。开发环境、安装同步及回退见 [开发指南](docs/DEVELOPMENT.md)。

## 更多说明

- [Shiki 高亮与 diff](docs/HIGHLIGHT.md)
- [图片粘贴与附件行为](docs/PASTE-IMAGE.md)
- [默认主题](docs/THEME.md)
- [渲染性能与缓存](docs/INTERACTION-PERFORMANCE.md)
- [开发与目录维护](docs/DEVELOPMENT.md)
- [界面模块与迁移说明（历史）](docs/archive/MIGRATION.md)
- [已归档的宿主补丁](archive/host-patches/README.md)

使用其他会替换输入框、工具渲染器或状态栏的扩展时，可能需要关闭重叠功能。终端图片是否正常显示，还取决于终端支持的图片协议和 Pi 的对应设置。

## SSH 远程工作区

默认启用 `features.ssh`。使用 `/remote ssh user@host` 连接、`/remote cd /srv/project` 切换远端目录、`/remote disconnect` 返回本地；`features.diff` 控制写入差异。四个标准工具及 user_bash 自动路由；`bg_run` 和 Agent/工作流子代理可通过配套适配补丁接入远端。不要同时安装上游扩展。认证、主机密钥与依赖说明见 [SSH 使用指南](docs/SSH.md)。已通过 `raspi` 的真实连接、远端命令、文件读取和断开验证。后台任务与 Agent 的远端适配需要安装配套补丁并重新加载 Pi，步骤和范围见 [SSH 使用指南](docs/SSH.md)。

# Changelog

## Unreleased

- 剪贴板图片粘贴支持 macOS（Pi 自带原生模块）、Linux（wl-paste / xclip）和 WSL，不再仅限 Windows；支持文件管理器复制的图片文件。BMP/TIFF 改用 SDK 的 `convertToPng` 转换，删除 `image-to-png.ps1`。
- 通过 SSH 粘贴本地剪贴板图片：本地运行 `npm run clipboard-bridge`，配合 `RemoteForward /tmp/sydney-kit-%r.sock 127.0.0.1:7395`。新增配置 `pasteImage.bridgePort` / `bridgeSocket` / `bridgeTimeoutMs`。
- 图片粘贴测试改用纯 JS 生成的样本，可在非 Windows 平台运行；删除 `verify-image-fixtures.ps1`。
- **归档宿主补丁，不再默认执行**：代码块钩子、上下文压缩卡片和 Tern 图片补丁连同代码块渲染器移至 `archive/host-patches/`，插件不再修改 Pi 安装目录。原因：Pi 1.3.0 的 `pi` 命令运行 `dist/bundle`，补丁修改的未打包文件不会被加载，补丁实际上没有生效且没有提示。
  - **配置变更**：删除 `features.codeblock`、`codeblockPatch`、`ternImagePatch`、`compactionCard` 以及 `codeblocks`、`hostPatches`；删除 `npm run patch:status`。
  - 助手回复中的代码块改由 Pi 自带渲染器显示；diff 的 Shiki 高亮不受影响。
  - 已应用的补丁不会自动撤销，可用归档目录中的脚本手动 revert。
- 重设计聊天历史压缩卡片：单行折叠、主题语义色、精确压缩前 token 数和可读摘要；保留宿主展开行为及窄终端宽度边界。
- 增加 Pi 1.3.0 可逆宿主补丁、渲染与补丁回归测试及重启说明。
- 架构整理（渲染输出、补丁产物与备份格式不变）：
  - 三份宿主补丁共用 `patches/engine.mjs` 与 `src/host/host-patches.ts`；支持版本集中在 `src/host/version.mjs`。
  - **配置变更**：`codeblockPatch` / `ternImagePatch` / `compactionCardPatch` 合并为 `hostPatches`；`codeblocks.patchVersion` 与 `compact` 中的内部正则移出配置。
  - `npm run patch:status` 增加压缩卡片补丁。
  - diff 拆为模型与视图（`src/rendering/diff/`），write 快照移至 `src/tools/write-snapshot.ts`。
  - 输入框由 `src/ui/editor.ts` 统一组装，不再依赖事件注册顺序。
  - 工具输出按类别拆分为 presenters，工具名集中在 `catalog.ts`。
  - 修正 README 中的补丁数量、`compactionCard` 开关，删除不存在的 `themeConfig` 说明。

## 0.1.0

- 首次发布到 CrossStar/sydney-kit，支持通过 Pi 的 Git 包安装命令加载。

- 功能代码按 UI、工具输出、渲染、剪贴板、宿主维护归类到 src。
- 独立测试迁入 tests，集中宿主 SDK 与项目路径解析。
- 固定旧状态栏和主题测试样本，移除测试对维护者配置文件的依赖。
- 文档移入 docs，历史迁移记录放入 docs/archive。
- 增加统一测试、补丁状态检查和源码 ZIP 打包命令。
- 宿主默认路径改为基于当前用户目录，并支持 SYDNEY_KIT_PI_ROOT。
- 保留根入口、配置开关、现有补丁格式与静默维护行为。

# 开发与目录维护

根入口 index.ts 保持 Pi 的目录发现方式；config.ts 保留所有功能开关和配置常量。源码调整不改变功能默认值和注册顺序。

| 目录 | 职责 |
| --- | --- |
| src/ui | 输入框、用户消息、状态栏；editor.ts 是唯一调用 setEditorComponent 的位置，按“底座 + 装饰器”固定顺序组装 |
| src/tools | 工具输出：catalog（工具名知识）、presenters（按工具类别的摘要）、status/layout/body（表头与正文）、名称关联、渲染缓存、write 前快照 |
| src/rendering | Shiki、代码块、diff（模型与视图分离） |
| src/clipboard | 剪贴板进程、图片附件、占位编辑 |
| src/host | 补丁维护和宿主安装路径 |
| patches | 已验证的补丁脚本及差异；保留现有 CLI 与备份格式 |
| scripts/windows | 运行时 PowerShell 和图片测试样本生成 |
| tests | 独立测试脚本、共享路径辅助模块、固定测试主题和旧状态栏对照样本 |
| benchmarks | 历史基准数据；不得解释为终端实际帧率 |
| docs/archive | 历史实现和迁移记录，不代表当前安装步骤 |
| vendor | 第三方代码及原许可证 |

## 环境

安装依赖：npm ci --legacy-peer-deps（锁文件未记录 Pi 的 peer 依赖）。宿主根目录默认按当前用户的 Bun 全局安装位置计算。非默认安装可设置 SYDNEY_KIT_PI_ROOT，或在 config.ts 显式设置 hostPatches.packageRoot；手动补丁命令支持 --root。测试始终通过 tests/helpers/paths.mjs 加载所选宿主 SDK。完整测试目前面向 Windows / Pi 1.3.0，实际 Markdown 集成测试要求对应宿主钩子已经应用。

测试中的 F:/Workspace 等字符串是路径格式测试样本，不是测试文件的存储位置。临时写入使用操作系统临时目录。历史文档中可能仍有维护者机器的记录路径。

## 命令

- npm test：全部独立脚本，遇到失败停止。
- node scripts/test.mjs codeblock：仅匹配名称的测试。
- npm run patch:status：检查三份补丁。
- npm run package：生成 dist/sydney-kit-0.1.0.zip 和 manifest.json。

测试不会启动新的 Pi 或模型会话。补丁维护测试在隔离副本中修改文件，实际宿主只做状态检查；Windows 图片测试生成自己的样本。

## 当前工作区与安装位置

本机源码工作区是 F:/Workspace/B__Projects/sydney-kit；Pi 加载副本仍在 ~/.pi/agent/extensions/sydney-kit。两个目录分开维护，源码修改经过测试后再同步到加载副本，并执行 /reload。新工作区初始的 node_modules 是指向现有安装依赖目录的本地 junction；不随 Git 或 ZIP 分发。在另一台机器上使用 npm ci --legacy-peer-deps 安装依赖。

整理前的源码已建立 Git 基线，并在工作区外备份。目录迁移后，旧根目录功能文件不应继续保留，避免出现两套实现。部署时保留安装目录的 node_modules，并复制根入口、配置和运行所需目录；删除前应先确认对应文件在备份中。

配置开关修改后 /reload；宿主补丁变化后完整重启。代码块补丁成功维护时静默，不恢复已经移除的重启警告。

## 宿主补丁

- patches/engine.mjs 统一负责版本检查、哈希校验、备份、原子写入和 status/apply/revert CLI。各补丁脚本只声明 target、backupSuffix、originalSha256 和 transform。
- 支持的 Pi 版本只在 src/host/version.mjs 中定义；补丁、备份文件名和代码块钩子检查都引用它。适配新版本时，还需要核对各脚本中的原文件哈希和锚点。
- src/host/host-patches.ts 声明三份补丁的启动维护（脚本、提示文案、触发条件），并共用同一套去重、重启提示和失败提示逻辑。
- CLI 参数、status 输出字段和备份文件名属于对外格式，修改时需要保持兼容。

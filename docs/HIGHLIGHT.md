# Shiki 与增强 diff

## 当前安装

Pi / pi-tui 1.3.0；扩展自身依赖 `diff@9.0.0`、`shiki@4.5.0`、`@shikijs/cli@4.5.0`，锁定于 package-lock.json。CLI 的 Shiki 依赖已 dedupe，使用同一个 singleton。pi-diff 与 pi-pretty 均未安装、未配置启用。

完整代码在 src/rendering 的 highlight.ts 和 diff/（model 行模型与词级范围、split/unified 两种视图、emphasize 强调层），write 工具快照在 src/tools/write-snapshot.ts；入口与开关分别在 index.ts、config.ts。已有 footer、compact、userMessage、appearance 开关保留。

## 调研与实现选择

Pi 的公开接口可以转换 Markdown 文本，但没有普通助手代码块的组件 renderer；自带 Markdown 使用 theme.highlightCode，最终由 cli-highlight 着色。没有采用 Markdown 文本改写或起草上游 issue。

npm 临时下载目录为 `C:/Users/Sydney/AppData/Local/Temp/sydney-diff-reference`。参考包 `@heyhuynhgiabuu/pi-diff@0.9.3`，MIT / Copyright (c) 2025 huynhgiabuu：core/diff.js 使用 structuredPatch 生成上下文块；index.js 用 diffWords 求双方字符范围，codeToANSI 生成前景色，再按范围注入背景强调。它在模块加载时预热高亮器，缓存主题/语言/内容。本实现重新编写，借鉴补丁、字符范围、ANSI 叠加及缓存思路，没有移植其源文件或背景色算法。

highlight.ts 首次请求时动态 import Shiki 和 CLI。预载语言、别名、低饱和主题 github-dark-dimmed、缓存条目和长度限制均在 config.ts。CLI 失败时用 token 转真彩色；任何初始化/语言/高亮失败均返回纯文本。同步接口立即返回缓存或纯文本，异步完成后由调用方使组件缓存失效并请求重绘。diff 使用模块内的单一初始化 Promise、Shiki singleton 和缓存。没有 read 的新渲染路径；接口可供以后复用。


Diff：默认折叠和展开均使用上下排列（`diffs.sideBySide=false`）。可选双栏中，左为修改前、右为修改后；各自保留行号，替换行对齐，新增/删除时另一侧留空。长行在各自列内换行，展示改动及上下文。`diffs.sideBySide=true` 可启用双栏；实际内容区域小于 `diffs.sideBySideMinWidth`（默认 72 列）自动使用统一布局。edit 读取工具实际返回的 patch，通过 diff 库解析；write 使用 diff 库生成 patch。成对删除/新增行用 diffWordsWithSpace 计算真实字符范围，词变化采用红/绿前景与下划线，无整行背景。未配对行全部视为变化。折叠 edit/write 默认只显示最多 6 行改动，超过时提示展开；可选双栏最多 6 行对比，另有表头。展开保留上下文及全部改动。

write 注册的是原 SDK write 定义的薄封装，只注入 operations：在 SDK 已进入同文件修改队列后读取旧内容，然后调用正常 mkdir/writeFile。结果附加 patch 元数据，使历史重绘不必读取已经修改的文件。无法读取旧内容、非 UTF-8 或超过 2 MB 时保留正常写入并跳过差异捕获。旧历史记录缺少新元数据时使用原 compact 展示。关闭 diff 会恢复原 SDK write 注册和 compact 显示。

## 回退配色

助手回复中的代码块由 Pi 自带渲染器显示；sydney-kit 原先基于宿主补丁的代码块样式已归档，见 [archive/host-patches](../archive/host-patches/README.md)。

`themes/tokyo-night.json` 的 cli-highlight 语法颜色对齐 github-dark-dimmed：comment #768390、keyword/operator #f47067、function #dcbdfb、variable/punctuation/code #adbac7、string #96d0ff、number #6cb6ff、type #f69d50。mdCodeBlockBorder 仍为原 dim #b4bddd。Pi 自带的代码块由 cli-highlight 使用这套颜色着色。不修改其他主题，不自动切换主题。两种引擎的 token 分类不同，因此是同一套调色板，不能保证逐 token 完全相同。

## 验收结果与边界

- verify-enhancements.mjs：ts/python/powershell/json/无语言/ahk/未知语言、单行与中文超长行、未闭合长块；单行/多处修改、新文件 write、大段替换、中文/未知语言 diff；无背景、折叠上限、实际写入成功、共享初始化次数为 1。
- verify-enhancements.mjs --failure：初始化前故意改错主题，返回原始文本，无异常。
- 双栏附加验证：72/80/120/160 列、新增/删除/不等长替换、中文长行内容不丢失、左右上下文独立行号、窄屏回退、折叠双栏及 edit/write 默认 compact 实际渲染路径、6/7 行预览边界。
- 原 verify.mjs、verify-cache.mjs 通过，包含工具执行/呈现、42 组 footer 输出相等和缓存失效检查。

更新测试是对安装文件替换行为的实测模拟，**没有实际升级当前 Pi，也不声称兼容未发布/未检查的新版本**。真实终端字体、鼠标滚动和主观样式仍需重启后查看。

5 次独立进程的扩展模块加载与注册测量（原始数据 startup-measurements.json）：关闭 codeblock/diff 中位数 24.41 ms；开启中位数 24.68 ms；两组 Shiki 初始化次数均为 0。首次高亮观察值为 131–186 ms。该测量是扩展加载开销，**不是整个 Pi TUI 的启动耗时**；没有为测速启动新的 Pi/模型会话。

## 预览性能修复

默认恢复上下布局，双栏保留为可选配置。补丁解析采用有上限的 LRU 缓存（16 个），词级范围按可见行对惰性计算并复用。折叠态只提交预览行进行高亮，每行最多 300 个 UTF-16 单元，省略号表示预览截短，展开保留全文。变化样式按连续片段生成，不再逐字符生成控制码。高亮缓存按 LRU 更新；同一组件使用稳定通知函数，等待中的订阅去重并合并完成通知。

共享高亮模块对单行超过 2000 字符的输入直接返回完整纯文本（仍可叠加 diff 标记），避免长行语法解析阻塞。不截断显示内容。配置为 highlighting.maxLineChars；预览限制为 diffs.previewLineChars。

使用 `F:/Workspace/Pi_Space/benchmark-sydney-split.mjs` 的同类样例复测：5000 字符长行的双栏预览生成约 57.11 → 0.48 ms，默认上下布局约 0.02 ms；预览高亮等待约 1198 → 1.33 ms（不含首次初始化）；最终预览 ANSI 字符串由 21882 → 2337 字符。同一回调连续等待 12 次、两份高亮输入的完成通知由 24 → 1 次。500 行替换的预览高亮等待约 58 → 3 ms。以上为合成组件测试，不是终端实际帧率测量。Shiki 首次初始化仍约 140–150 ms。

verify-enhancements.mjs 验证默认上下、可选双栏、长行高亮降级不丢全文、通知去重和预览边界；verify.mjs、verify-cache.mjs 均通过。

## 示例（可选双栏，实际显示带语法色）

```text
修改前                       │ 修改后
@@ -1,1 +1,1 @@
− 1 const count = 1;          │ + 1 const count = 2;
```

仅变化的数字分别加红/绿下划线，其他内容维持语法色。

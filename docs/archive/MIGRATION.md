# 视觉迁移说明

最初迁移范围为视觉功能，不迁移 FFF 或 apply_patch。后续共享 Shiki、write 差异捕获与经授权的代码块宿主钩子见 [HIGHLIGHT.md](../HIGHLIGHT.md)。

## 已迁移/保留

- 用户消息单个 ❯、品红色、透明背景、续行两格缩进。
- 每条用户消息上下 dim 分隔线铺满可用宽度；按后续要求移除了发送时间及记录逻辑。
- 独立输入框 ❯，使用 Pi CustomEditor 保留输入、粘贴、快捷键及补全。无边框盒子，使用普通横线。实现借鉴并内置 pi-pretty 的 MIT prompt-editor.ts，许可证见 vendor/pi-pretty-LICENSE.txt。
- 状态由真实公开事件驱动：等待/准备工具参数 Working，思考增量 Thinking，正文增量 Responding，工具执行 Running tools。并行工具全部结束前保留工具状态；高亮动画只在当前标签内部播放，不再轮播词语。只反映宿主收到的事件，不推测服务端隐藏状态。
- read 展开时语法高亮；write 成功展开时显示提交内容的高亮预览。
- edit/write 默认使用上下排列，双栏作为可选配置。共享 Shiki，词级变化采用前景色及下划线；折叠最多六行改动，展开保留上下文。预览计算已按可见范围限制，解析/词级范围缓存，通知去重；详见 HIGHLIGHT.md 的性能修复记录。关闭 features.diff 恢复原 compact 显示。
- 保留紧凑工具标题、网页工具专用预览、原 footer。

## 有意未迁移

- FFF 搜索引擎/维护命令；卸载后 find/grep 使用 Pi 内置实现。
- apply_patch 多文件写入工具；卸载 pi-diff 后它将不可用，内置 edit/write 仍可用。
- 私有 API 的逐行 Thinking 动画、Claude Code 工具分组。
- pi-diff 的 /review-diff 浮层；当前双栏由 sydney-kit 独立实现。后续已实现共享 Shiki 和 write 覆盖差异：委托 SDK write，在其队列内尽力捕获旧内容。
- ls Nerd Font 文件树等专用格式，继续使用 compact 通用呈现。

这不是两个插件的逐项复刻。迁移强调当前用户选择的紧凑、透明呈现和公开 API。没有运行时引用两个 npm 插件，卸载不会删除 sydney-kit/vendor 的独立源码。

## 开关和验证

config.features.appearance 控制输入框/Working；userMessage 控制消息装饰；compact 控制工具呈现；footer 保持独立。appearance 下可调整 boxedEditor、statusLabels、frameIntervalMs 和 maxHighlightChars。

verify.mjs、verify-user-message.mjs 和 verify-appearance.mjs 为本地验证。真实交互里的光标、补全、粘贴、展开操作仍需 /reload 后确认。

当前已核查两个旧插件均未安装或配置启用。原 pi-pretty.json 可保留作配置备份。此前 SDK 目录联接不属于插件本体，不影响独立运行。

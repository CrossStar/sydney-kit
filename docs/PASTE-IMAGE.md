# 剪贴板图片粘贴

入口为 paste-image.ts，features.pasteImage 默认 true。快捷键及目录、保留天数、缩放阈值在 config.ts 的 pasteImage 中。加载扩展后，复制图片或资源管理器中的图片文件，按 Alt+V；剪贴板读取成功后，编辑器立即出现 `[图片 1]`，不等待缩放完成，可连续粘贴多张。按 Enter 时等待附件准备完成，通过公开 input 事件的 images 字段附加真实图片字节，并在已发送文本中保留 `[图片 1 · 1280×720]` 标记。不自动提交。Backspace 在占位末尾或内部时一次删除整个占位；普通文本、其他粘贴标记和编辑器外观保持原有处理。

## 调研结论

- Pi 1.3.0 Windows 默认 app.clipboard.pasteImage 已绑定 alt+v。内置操作最终插入临时图片路径，没有公开的直接挂载编辑器附件的方法。
- registerShortcut 可以覆盖此非保留快捷键；CustomEditor 优先分派扩展快捷键，再处理内置粘贴。启用本模块时可能出现内置快捷键冲突的诊断，表示采用扩展处理器。关闭开关并 /reload 后恢复 Pi 原处理器，而非把 Alt+V 变为空键。
- 公开 input 事件允许返回 {action:'transform',text,images}。本模块采用它接入真正的附件，因此不使用 @路径 回退，也不需要宿主钩子。
- 复用 SDK 公开 resizeImage，通常在 worker 中解码和缩放，保持长宽比。BMP 先用 .NET 转成 PNG。PNG/JPEG/GIF/WebP 使用 SDK 支持的处理链；动画文件不保证保留动画。
- Pi 用 model.input.includes('image') 声明图片能力。模块在按键、图片处理完成及提交前检查 ctx.model，能力未声明时也阻止图片提交。环境中的模型标识为 openai/gpt-6-astra；其运行时能力须在真实会话加载后检查，不能从名称推断。
- 检查过本机两处 Windows Terminal settings.json，未发现显式 alt+v 绑定。没有修改任何终端配置；模块只注册一个快捷键，不注册 Ctrl+V、Ctrl+Shift+V，也不拦截普通文本粘贴。

## 文件和生命周期

PowerShell 以 -STA、-NoProfile、-NonInteractive 运行。clipboard-client.ts 在 TUI session_start 异步预热一个专属进程，按键时通过 stdin/stdout 请求读取，避免每次加载 CLR 和 Forms；启动及单次读取超时默认 8 秒，进程失败后允许重建，session_shutdown/关闭功能时终止。预热不读取剪贴板。ExecutionPolicy Bypass 仅作用于该子进程，不更改系统执行策略。scripts/clipboard-image.ps1 使用 System.Windows.Forms.Clipboard：优先读取图片并保存 PNG，否则筛选文件列表的 png/jpg/jpeg/gif/webp/bmp；文本或空剪贴板返回空列表。

目录默认 `~/.pi/agent/sydney-kit/clipboard/`。文件名含时间戳和随机 ID。图片文件会制作独立附件快照，原文件不修改；长边默认限制 2000 px。SDK 可能在缩放时选用 PNG 或 JPEG。单个源文件默认上限 50 MiB。

清理在图片粘贴活动中按一小时间隔异步执行，不阻塞占位显示，只清理专属目录中超过 7 天且符合 clipboard-* 命名的图片；当前编辑器仍引用的待发送附件受保护。不启动常驻清理进程，不删除源目录图片。

占位与附件的关联保存在当前扩展运行时内存中，仅存文件路径和尺寸，不长驻保存 base64。切换会话、关闭会话或 /reload 会清除关联并取消尚未完成的剪贴板子进程；这些操作前应发送草稿，或操作后重新粘贴图片。删除占位即可不附加对应图片。多个占位按输入文本中的顺序附加。

输入处理失败或模型不支持图片时阻止这一条消息提交，给出单行提示，并在编辑器为空时恢复输入文本。不会为了发送图片而替换模型或自动开始新的模型请求。

## 验证范围

自动测试脚本 verify-paste-image.mjs 已通过，使用独立临时目录、生成的图片和注入的剪贴板结果，不覆盖现有系统剪贴板。实际解码验证了 PNG/JPEG/GIF/BMP/WebP，并确认 4000×1000 图像等比缩小为 2000×500；同时验证占位重排后的附件顺序。覆盖实际图片解码/缩放、BMP 转换、保留期、单图/多图、文本/空结果、读写失败、模型不支持与提交前模型切换、input 返回真实 image/base64 数据，以及开关关闭后不注册快捷键。

已另外执行真实 PowerShell -STA 剪贴板读取，返回 imageCount=0；没有修改剪贴板。

仍需真实 TUI 端到端验收：截图工具截图、浏览器复制图片、资源管理器单图/多图、超大截图；Alt+V 后占位和光标行为；Ctrl+Shift+V 多行文本；按 Enter 后服务端模型实际看到图片。模拟 input 返回值只能证明正确构造了图片附件，不能替代服务端收图验证。本会话随后已收到用户实际发送的终端截图并成功描述内容，真实图片接收得到确认；该消息本身无法独立证明用户采用的是哪一种粘贴入口。没有为测试启动新的 Pi/模型会话。

## 使用与关闭

执行 /reload 加载模块，然后 Alt+V。无需宿主补丁或完整重启。

设置 features.pasteImage=false 并 /reload 可关闭；pasteImage.shortcut 可更改快捷键。修改时应避开 Pi 的保留键及 Windows Terminal 已占用的快捷键。

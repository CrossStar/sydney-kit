# 剪贴板图片粘贴

入口为 paste-image.ts，features.pasteImage 默认 true。快捷键及目录、保留天数、缩放阈值在 config.ts 的 pasteImage 中。加载扩展后，复制图片或文件管理器中的图片文件，按 Alt+V；剪贴板读取成功后，编辑器立即出现 `[图片 1]`，不等待缩放完成，可连续粘贴多张。按 Enter 时等待附件准备完成，通过公开 input 事件的 images 字段附加真实图片字节，并在已发送文本中保留 `[图片 1 · 1280×720]` 标记。不自动提交。Backspace 在占位末尾或内部时一次删除整个占位；普通文本、其他粘贴标记和编辑器外观保持原有处理。

## 调研结论

- Pi 1.3.0 Windows 默认 app.clipboard.pasteImage 已绑定 alt+v。内置操作最终插入临时图片路径，没有公开的直接挂载编辑器附件的方法。
- registerShortcut 可以覆盖此非保留快捷键；CustomEditor 优先分派扩展快捷键，再处理内置粘贴。启用本模块时可能出现内置快捷键冲突的诊断，表示采用扩展处理器。关闭开关并 /reload 后恢复 Pi 原处理器，而非把 Alt+V 变为空键。
- 公开 input 事件允许返回 {action:'transform',text,images}。本模块采用它接入真正的附件，因此不使用 @路径 回退，也不需要宿主钩子。
- 复用 SDK 公开 resizeImage，通常在 worker 中解码和缩放，保持长宽比。resizeImage 对无需缩放的图片原样返回，因此 BMP/TIFF 先经 SDK 公开的 convertToPng 转成 PNG（各平台一致，不再依赖 .NET）。PNG/JPEG/GIF/WebP 使用 SDK 支持的处理链；动画文件不保证保留动画。
- Pi 用 model.input.includes('image') 声明图片能力。模块在按键、图片处理完成及提交前检查 ctx.model，能力未声明时也阻止图片提交。环境中的模型标识为 openai/gpt-6-astra；其运行时能力须在真实会话加载后检查，不能从名称推断。
- 检查过本机两处 Windows Terminal settings.json，未发现显式 alt+v 绑定。没有修改任何终端配置；模块只注册一个快捷键，不注册 Ctrl+V、Ctrl+Shift+V，也不拦截普通文本粘贴。

## 平台

读取逻辑在 clipboard-reader.ts，统一返回图片文件路径；剪贴板中的原始图片字节先写入专属目录再进入同一处理链。

| 平台 | 读取方式 | 依赖 |
| --- | --- | --- |
| Windows | 常驻 PowerShell -STA 进程（见下文） | 系统自带 |
| macOS | pi-tui 公开的 getNativeClipboard：Finder 复制的图片文件优先，其次是截图等图片数据（PNG/TIFF） | Pi 自带原生模块 |
| Linux Wayland | wl-paste：优先 image/png、jpeg、webp、gif、bmp、tiff，否则读取 text/uri-list 或 x-special/gnome-copied-files 中的图片文件 | wl-clipboard |
| Linux X11 | xclip，规则同上；缺少 xclip 时退回 Pi 自带的 X11 原生模块 | xclip（推荐） |
| WSL | 先读取 WSLg；没有图片时通过 interop 调用 powershell.exe 运行同一脚本，并用 wslpath 转换路径 | Windows interop |

顺序与 Pi 内置的图片粘贴一致：Wayland 工具不可用时退回 X11，空的 Wayland 剪贴板不会误读旧的 X11 内容。找不到任何可用后端时给出单行提示，说明需要安装的工具；SSH 会话见下文。WSL 分支已用模拟进程测试，尚未在 WSL 实机上验证。

macOS 终端默认把 Option+V 当作字符输入；需要在终端设置中把 Option 作为 Meta 键，或将 pasteImage.shortcut 改为 ctrl+v（会覆盖 Pi 内置的 Ctrl+V 粘贴）。

<a id="ssh"></a>

## SSH

Pi 通过 SSH 运行在远端时，按 Alt+V 读取的是服务器的剪贴板，而图片在你本地电脑上。剪贴板桥接解决这个问题：本地运行一个小进程，在你按下 Alt+V 时读取本地剪贴板，通过 SSH 转发的 Unix socket 把图片交给远端 Pi。插入的是真正的图片附件，与本地粘贴完全一致。本地是 Windows、macOS 或 Linux 均可，读取方式与上文的平台表相同。

```
本地电脑                                    服务器
clipboard-bridge  ◀── ssh RemoteForward ──  /tmp/sydney-kit-<用户名>.sock  ◀──  Pi（Alt+V）
127.0.0.1:7395
```

### 配置

1. **本地运行桥接**（本地需已安装 Pi 和 sydney-kit），保持窗口开启：

   ```bash
   cd ~/.pi/agent/git/github.com/CrossStar/sydney-kit   # Windows: %USERPROFILE%\.pi\agent\git\github.com\CrossStar\sydney-kit
   npm run clipboard-bridge                               # 或 node scripts/clipboard-bridge.mjs --port 7395
   ```

2. **本地 SSH 配置** `~/.ssh/config`（Windows 为 `%USERPROFILE%\.ssh\config`）中，为服务器加一行转发：

   ```
   Host devbox
     HostName example.com
     RemoteForward /tmp/sydney-kit-%r.sock 127.0.0.1:7395
   ```

   `%r` 是远端用户名，与插件默认的 `pasteImage.bridgeSocket`（`/tmp/sydney-kit-{user}.sock`）对应。也可以临时用 `ssh -R /tmp/sydney-kit-$USER.sock:127.0.0.1:7395 devbox`。

3. **服务器 sshd 配置**（有 sudo 权限时）：在 `/etc/ssh/sshd_config` 中加入下面一行，然后执行 `sudo systemctl reload ssh`（部分发行版服务名为 `sshd`）。没有 sudo 权限可跳过这一步，使用下方的清理方式：

   ```
   StreamLocalBindUnlink yes
   ```

   SSH 连接关闭后（包括正常退出），socket 文件可能仍留在服务器上。没有这一项，下次连接会提示 `remote port forwarding failed for listen path` 并且无法转发；需要在建立新转发之前删除遗留的 socket。开启后，新连接会自动替换旧的 socket；同时打开多个连接时，以最新的连接为准。

4. 重新 SSH 登录，在远端 Pi 中照常按 Alt+V。

### 没有 sudo 权限

不需要修改 sshd 配置：保留本地桥接和 `RemoteForward` 配置，每次重新连接前先清理自己账号的旧 socket。先关闭原来使用此 socket 的 SSH 连接，再在**本地终端**依次运行：

```bash
ssh -o ClearAllForwardings=yes -o ControlPath=none devbox "rm -f -- /tmp/sydney-kit-REMOTE_USER.sock"
ssh -o ControlPath=none -o ExitOnForwardFailure=yes devbox
```

把 `devbox` 换成 SSH 配置中的主机别名，把 `REMOTE_USER` 换成**服务器上的用户名**（即 `%r`，不一定等于本地用户名）。如果自定义了 socket 路径，清理路径也要相应修改。命令适用于本地 Bash、zsh 和 PowerShell。

第一条命令临时禁用转发，只删除自己遗留的 socket，不需要 sudo；成功后再执行第二条，建立新的转发并登录。`ControlPath=none` 避免复用旧 SSH 连接，`ExitOnForwardFailure=yes` 让转发失败时直接退出。清理命令失败时先处理报错，不要继续连接。

不要删除仍由其他会话使用的 socket，否则那些会话将无法继续通过该路径读取剪贴板。若已经出现转发失败提示，仅在当前会话里删除 socket 不会自动重建转发，需要退出后重新连接。

此方法要求服务器本来就允许远程 Unix socket 转发；如果管理员禁用了转发，清理 socket 无法绕过限制，需要联系管理员开启。

### 行为

- 存在 SSH 环境变量，或在 Linux 上没有图形显示（例如 SSH 变量已失效的 tmux 会话）时，先尝试桥接；没有转发的 socket 时，再尝试本机的剪贴板工具。
- 已建立转发但本地桥接没有运行：提示在本地启动桥接，不插入占位。
- 没有转发：提示按本文配置 RemoteForward。
- 本地剪贴板中是文件管理器复制的图片文件时，会一并传输，最多 50 MiB；超时时间由 `pasteImage.bridgeTimeoutMs` 控制，默认 30 秒。
- 桥接只在请求时读取一次剪贴板，不会主动推送，也不保存图片；为传输生成的临时文件在发送后立即删除。

### 安全

- 本地桥接只监听 `127.0.0.1`，只响应固定的请求行，浏览器或端口扫描发来的 HTTP 请求会被直接断开。本机其他进程可以通过该端口读取剪贴板图片，这与它们直接读取剪贴板的能力相同。
- 服务器上的 socket 由 sshd 创建，默认权限只允许你的账号连接（`StreamLocalBindMask` 默认 `0177`），服务器上的其他用户无法读取你的剪贴板。若服务器管理员修改过该项，请确认 socket 权限。
- 不要把 RemoteForward 改为 TCP 端口：服务器上的任何用户都能连接 TCP 端口。

### 其他方式

- `ssh -X`（或 `-Y`）转发 X11，并在远端安装 xclip：DISPLAY 指向本地 X 服务器时，xclip 读取的就是本地剪贴板。需要本地有 X 服务器（Linux 桌面、macOS 的 XQuartz、Windows 的 VcXsrv 等）。
- 终端剪贴板协议（kitty 的 OSC 5522）可以经由终端直接读取本地剪贴板，无需桥接，但目前支持的终端很少；Tern 实测不支持。

## 文件和生命周期

Windows 上 PowerShell 以 -STA、-NoProfile、-NonInteractive 运行。clipboard-client.ts 在 TUI session_start 异步预热一个专属进程，按键时通过 stdin/stdout 请求读取，避免每次加载 CLR 和 Forms；启动及单次读取超时默认 8 秒，进程失败后允许重建，session_shutdown/关闭功能时终止。预热不读取剪贴板。ExecutionPolicy Bypass 仅作用于该子进程，不更改系统执行策略。scripts/clipboard-image.ps1 使用 System.Windows.Forms.Clipboard：优先读取图片并保存 PNG，否则筛选文件列表的 png/jpg/jpeg/gif/webp/bmp；文本或空剪贴板返回空列表。

目录默认 `~/.pi/agent/sydney-kit/clipboard/`。文件名含时间戳和随机 ID。图片文件会制作独立附件快照，原文件不修改；长边默认限制 2000 px。SDK 可能在缩放时选用 PNG 或 JPEG。单个源文件默认上限 50 MiB。

清理在图片粘贴活动中按一小时间隔异步执行，不阻塞占位显示，只清理专属目录中超过 7 天且符合 clipboard-* 命名的图片；当前编辑器仍引用的待发送附件受保护。不启动常驻清理进程，不删除源目录图片。

占位与附件的关联保存在当前扩展运行时内存中，仅存文件路径和尺寸，不长驻保存 base64。切换会话、关闭会话或 /reload 会清除关联并取消尚未完成的剪贴板子进程；这些操作前应发送草稿，或操作后重新粘贴图片。删除占位即可不附加对应图片。多个占位按输入文本中的顺序附加。

输入处理失败或模型不支持图片时阻止这一条消息提交，给出单行提示，并在编辑器为空时恢复输入文本。不会为了发送图片而替换模型或自动开始新的模型请求。

## 验证范围

自动测试 tests/paste-image.test.mjs 与 tests/clipboard-reader.test.mjs 可在 Windows、macOS 和 Linux 上运行。它们使用独立临时目录和纯 JS 生成的图片，注入剪贴板结果，不覆盖现有系统剪贴板。clipboard-bridge 测试用模拟的 sshd 转发（Unix socket 转到本地 TCP 端口）验证桥接协议、忙碌保护、错误与提示，并启动真实的桥接脚本读取 Xvfb 上的剪贴板；另外用临时 sshd 和真实的 ssh -R 做过一次端到端验证。clipboard-reader 测试用模拟进程覆盖 wl-paste、xclip、文件列表、空剪贴板、后端回退、缺少工具、SSH 和 WSL；装有 Xvfb 与 xclip 时，还会在临时 X 服务器上执行一次真实的剪贴板读取。实际解码验证了 PNG/JPEG/GIF/BMP/TIFF/WebP，并确认 4000×1000 图像等比缩小为 2000×500；同时验证占位重排后的附件顺序。覆盖实际图片解码/缩放、BMP 转换、保留期、单图/多图、文本/空结果、读写失败、模型不支持与提交前模型切换、input 返回真实 image/base64 数据，以及开关关闭后不注册快捷键。

已另外执行真实 PowerShell -STA 剪贴板读取，返回 imageCount=0；没有修改剪贴板。

仍需真实 TUI 端到端验收：截图工具截图、浏览器复制图片、资源管理器单图/多图、超大截图；Alt+V 后占位和光标行为；Ctrl+Shift+V 多行文本；按 Enter 后服务端模型实际看到图片。模拟 input 返回值只能证明正确构造了图片附件，不能替代服务端收图验证。本会话随后已收到用户实际发送的终端截图并成功描述内容，真实图片接收得到确认；该消息本身无法独立证明用户采用的是哪一种粘贴入口。没有为测试启动新的 Pi/模型会话。

## 使用与关闭

执行 /reload 加载模块，然后 Alt+V。无需宿主补丁或完整重启。

设置 features.pasteImage=false 并 /reload 可关闭；pasteImage.shortcut 可更改快捷键。修改时应避开 Pi 的保留键及 Windows Terminal 已占用的快捷键。

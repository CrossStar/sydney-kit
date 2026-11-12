# 后台 SSH 集成

需要原生支持 execution provider 与 readiness hook 的 pi-background-tasks。加载该版本并重新加载 Pi。可选的只读源码兼容检查：

```powershell
D:\nodejs\node.exe integrations/background/install.mjs C:/Users/PC/.pi/agent/git/github.com/CrossStar/pi-background-tasks
```

历史 install.mjs 入口仅检查原生源码契约，不写入依赖源码、不生成备份，也不支持 --record。旧版本需升级；源码检查不能替代运行时 readiness 检查。已有旧补丁请通过重新安装上游版本迁移，不要把旧备份覆盖到新版本。持久化能力与部署要求见 [PERSISTENT.md](PERSISTENT.md)。下述进程行为描述保留的 spawn 兼容路径。

事件 `sydney-kit:bg-execution:v1` 在 registry.startTask 接纳时同步发现 provider。请求为 `{provider?, error?}`；provider 的 `spawn(command,isAgent)` 返回异步启动的进程接口（stdout/stderr、error/close、kill）。没有 provider 时保留原本地路径；有 provider 的任何失败都不会回退本地。

Sydney 在发现时复制已解析 SSH 路由和 cwd，通过私有认证工厂创建任务独占连接。凭据不序列化。后台扩展仍拥有日志、状态、通知、超时与 kill 工具。远端需要 Linux /proc、bash、setsid、base64、awk、kill、sleep。启动先检查执行依赖；进程身份包含 PGID 和 /proc starttime。取消先校验 starttime，再发送进程组 SIGKILL，并等待进程组消失验证，整个停止验证有 6 秒截止时间；网络错误以 failed 和 `Remote outcome unknown` 标记，不能据此断言远端命令已停止。不会重连或重放命令。自行 setsid 脱离任务进程组的进程不在取消保证范围内。

远端只支持 `bg_run isAgent:false`；远端 agent telemetry 尚未支持。此集成不改变 Fusion 或 Agent。

验证：`node scripts/test.mjs ssh-bg` 直接导入原生 registry。`node tests/ssh-bg-live.mjs` 使用可信系统 SSH 核对 raspi 主机密钥、独立临时 PI_CODING_AGENT_DIR，验证输出、kill、超时和父会话断开隔离；不接触主会话 moon 配置。可通过 SYDNEY_BG_ROOT 指定依赖工作区。

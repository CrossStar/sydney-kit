# 后台 SSH 集成

安装（Pi 关闭或随后重新加载扩展）：

```powershell
D:\nodejs\node.exe integrations/background/install.mjs C:/Users/PC/.pi/agent/git/github.com/CrossStar/pi-background-tasks
```

安装器核对 package version 和两个源码文件的 SHA-256，写入前保存 `.sydney-original`。升级上游后不要绕过校验：重新审阅补丁并更新 manifest。恢复时将两个备份复制回原路径。不会修改 Pi 宿主。

事件 `sydney-kit:bg-execution:v1` 在 registry.startTask 接纳时同步发现 provider。请求为 `{provider?, error?}`；provider 的 `spawn(command,isAgent)` 返回异步启动的进程接口（stdout/stderr、error/close、kill）。没有 provider 时保留原本地路径；有 provider 的任何失败都不会回退本地。

Sydney 在发现时复制已解析 SSH 路由和 cwd，通过私有认证工厂创建任务独占连接。凭据不序列化。后台扩展仍拥有日志、状态、通知、超时与 kill 工具。远端需要 Linux /proc、bash、setsid、base64、awk、kill、sleep。启动先检查执行依赖；进程身份包含 PGID 和 /proc starttime。取消先校验 starttime，再发送进程组 SIGKILL，并等待进程组消失验证，整个停止验证有 6 秒截止时间；网络错误以 failed 和 `Remote outcome unknown` 标记，不能据此断言远端命令已停止。不会重连或重放命令。自行 setsid 脱离任务进程组的进程不在取消保证范围内。

远端只支持 `bg_run isAgent:false`；远端 agent telemetry 尚未支持。此补丁不改变 Fusion 或 Agent。

验证：`node scripts/test.mjs ssh-bg` 直接导入已打补丁 registry。`node tests/ssh-bg-live.mjs` 使用可信系统 SSH 核对 raspi 主机密钥、独立临时 PI_CODING_AGENT_DIR，验证输出、kill、超时和父会话断开隔离；不接触主会话 moon 配置。可通过 SYDNEY_BG_ROOT 指定依赖工作区。

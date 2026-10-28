# SSH 远程工作区

默认启用 `config.ts` 的 `features.ssh`；设为 `false` 可恢复原本地工具。`features.diff` 控制写入前快照及差异展示。不要同时安装 pi-ssh-remote 上游扩展，否则会重复注册工具和生命周期处理器。

```text
/remote ssh user@host -p 22
/remote cd /srv/project
/remote status
/remote disconnect
/remote forget
```

支持 ~/.ssh/config 别名、`-i` 私钥和 `-J` 跳板。认证尝试 SSH agent 和私钥，也可交互输入密码/密钥口令；口令仅缓存在进程内。首次连接及主机密钥变化需要核对指纹并确认，信任记录位于 Pi agent 目录的 `ssh-remote-known-hosts.json`。不要在命令参数中提供密码。配置存于同目录 `ssh-remote-config.json`，`/remote config` 查看；`/remote config cwd /srv/project` 设置默认目录。

远端需要 SSH/SFTP、bash、GNU timeout，以及所用命令（文件检测需要 file）。仅 read/write/edit/bash 和用户 `!` shell 命令路由到远端；后台工具、委派代理及其他扩展仍使用自身执行环境。服务端记忆 JSON 的精确本地路径是明确的本地例外；完整超限命令输出也保存本地。底栏显示 SSH 目标和本地 cwd，避免混淆。

断开后恢复本地工具。连接错误不会自动重放工具操作：失败时变更可能已经发生，先检查目标状态再决定是否重试。连接恢复本身仍可进行。写入快照最多读取 `diffs.maxSnapshotBytes`，二进制、超限或不可读文件不展示前后差异；快照失败不会阻止写入。

已通过 `raspi` 实机只读验证：使用本机 SSH 配置和私钥连接，核对主机密钥，执行远端 bash，读取 `/etc/os-release`（符号链接），断开并恢复本地工具路由。远端为 Debian GNU/Linux 13.3。类型检测使用 `file -L` 跟随符号链接。远端 write/edit、跳板、转发和网络断连恢复尚未实机验证；写入快照与后端隔离由模拟测试覆盖。

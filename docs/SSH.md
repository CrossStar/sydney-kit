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

远端需要 SSH/SFTP、bash、GNU timeout，以及所用命令（文件检测需要 file）。read/write/edit/bash 和用户 `!` shell 命令路由到远端。`bg_run` 需要先安装 [后台集成补丁](../integrations/background/README.md)，然后重新加载 Pi：

```text
node integrations/background/install.mjs <pi-background-tasks-package-root>
```

本机 Windows 安装示例：

```powershell
D:\nodejs\node.exe integrations/background/install.mjs C:/Users/PC/.pi/agent/git/github.com/CrossStar/pi-background-tasks
```

补丁保留后台扩展的日志、状态和通知；每个任务固定接纳时的 SSH 路由与 cwd，独占连接，父会话断开不改变运行中任务。远端必须使用 `isAgent:false`。未安装补丁时远端 bg_run 被阻止；远端独立进程 bg_delegate 与 attested agent 暂不支持。服务端记忆 JSON 的精确本地路径是明确的本地例外；完整超限命令输出也保存本地。底栏显示 SSH 目标和本地 cwd，避免混淆。

Agent/SubagentWorkflow 另需安装版本校验补丁：

```text
node integrations/subagents/install.mjs <pi-subagents-package-root> apply
```

本机 Windows 安装示例：

```powershell
D:\nodejs\node.exe integrations/subagents/install.mjs C:/Users/PC/.pi/agent/npm/node_modules/@tintinweb/pi-subagents apply
```

随后重新加载 Pi。provider 独占 SSH 连接并仅构造 scope 请求的工具，支持 read/bash/write/edit/grep/find/ls。搜索使用远端 GNU grep/find/ls，受输出上限约束；与本地搜索的忽略文件和 glob 语义不完全相同。remote child 禁用 ambient 扩展，worktree、嵌套委派等限制见 [子代理补丁说明](../integrations/subagents/README.md)。

断开后恢复本地工具。连接错误不会自动重放工具操作：失败时变更可能已经发生，先检查目标状态再决定是否重试。连接恢复本身仍可进行。写入快照最多读取 `diffs.maxSnapshotBytes`，二进制、超限或不可读文件不展示前后差异；快照失败不会阻止写入。

已在 Debian raspi 使用独立临时 Pi 配置验证主工具的连接、主机密钥核对、bash、读取 `/etc/os-release` 和断开恢复本地。child binding 的 read/bash/write/edit/grep/find/ls 已在唯一 `/tmp` 目录实机验证并清理；这不等同于完整模型驱动 Agent 会话验证。patched bg registry 的远端输出、进程组 kill、timeout、父会话断开隔离通过实机测试。相同扩展实例 shutdown/new/startup 后 provider 重新绑定、快照异常失败关闭也已验证。跳板、转发和真实网络故障恢复未实机验证。

后台取消要求 Linux `/proc`、setsid、bash、base64、awk，校验进程 starttime 后取消同一进程组。自行脱离该组的进程不在取消保证内；连接丢失或停止验证失败只报告结果未知，不声称已终止。

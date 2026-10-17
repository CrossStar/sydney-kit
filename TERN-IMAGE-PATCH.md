# Tern 图片补丁自动维护

用户已在 Tern 中确认图片最后绘制的补丁解决滚动闪烁。该补丁现由 sydney-kit 的 tern-image-patch.ts 在启动时维护。

## 行为

features.ternImagePatch 默认 true。仅在 TUI 模式且 TERM_PROGRAM=tern 时检查；不在模块工厂中启动进程，也不在 JSON/RPC 等模式修改宿主。session_start 发起异步检查，不阻塞输入框。

- 已应用：静默跳过。
- 未应用且版本/文件哈希受支持：执行 patches/tern-images.mjs apply，然后再次验证状态，提示完整重启 Pi。
- 未适配版本、文件存在未知修改、备份损坏或执行失败：停止自动处理，并显示一行提示。
- 同一进程中重载扩展时，进行中的检查共享一个 Promise，避免并发写同一文件；已自动应用但未重启的状态会继续提醒。

仍然只适配 Pi / pi-tui **1.3.0** 和脚本内记录的原文件 SHA-256。更新到新版本不会盲目应用旧补丁，需要核对源码并更新适配。插件无法让已经加载的宿主 JS 在 /reload 后换成新版本：自动补回后仍需完整重启一次。

这项维护只管理 Tern 图片绘制顺序补丁。代码块钩子现在也有独立启动维护（features.codeblockPatch、codeblock-patch.ts），复用原有 patches/apply.mjs；详见 HIGHLIGHT.md。

## 配置

config.ts：

```ts
features.ternImagePatch = true;
ternImagePatch = {
  nodeCommand: 'node',
  timeoutMs: 6000,
  packageRoot: 'C:/Users/Sydney/.bun/install/global/node_modules/@earendil-works',
};
```

packageRoot 是同时包含 pi-coding-agent 和 pi-tui 的安装目录；安装位置改变时需同步修改。脚本不放宽原有版本、哈希、幂等和备份校验。

## 手动检查与停用

在 sydney-kit 目录运行：

```powershell
node patches/tern-images.mjs status
node patches/tern-images.mjs apply
node patches/tern-images.mjs revert
```

**关闭 features.ternImagePatch 只停止自动维护，不撤销已经写入的补丁。** 要完全移除：先设为 false 并 /reload，让正在进行的检查结束，再执行 revert，最后完整重启 Pi。否则下一次启动会按启用配置重新应用。

## 验证

verify-tern-image-patch.mjs 在临时安装副本测试：自动 apply、再次启动幂等、原文件覆盖后自动恢复、模拟 1.3.1 拒绝、未知文件修改拒绝、仅 Tern/TUI 检查、重启提示、关闭会话不再发提示、feature 开关。全部通过。原 verify.mjs 回归通过。

真实安装仅运行 status 确认仍为 applied；集成过程中未再次修改宿主文件。

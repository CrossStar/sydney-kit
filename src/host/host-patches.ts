import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { hostPatches as config } from '../../config';

export type PatchCommand = 'status' | 'apply';
export type PatchRunner = (command: PatchCommand) => Promise<string>;
export interface HostPatch {
  /** Keys the process-wide operation/restart symbols; stable across /reload. */
  id: string;
  script: string;
  label: string;
  /** Code-block maintenance is silent: its renderer warns separately when the hook is missing. */
  restartNotice: boolean;
  when?: () => boolean;
}

export const codeblockPatch: HostPatch = { id: 'codeblockPatch', script: 'apply.mjs', label: '代码块钩子补丁', restartNotice: false };
export const ternImagePatch: HostPatch = {
  id: 'ternImagePatch', script: 'tern-images.mjs', label: 'Tern 图片补丁', restartNotice: true,
  when: () => process.env.TERM_PROGRAM?.toLowerCase() === 'tern',
};
export const compactionCardPatch: HostPatch = { id: 'compactionCardPatch', script: 'compaction-card.mjs', label: '上下文压缩卡片补丁', restartNotice: true };

export function runPatchScript(script: string, command: PatchCommand, root = config.packageRoot): Promise<string> {
  const path = fileURLToPath(new URL(`../../patches/${script}`, import.meta.url));
  return new Promise((resolve, reject) => execFile(
    config.nodeCommand, [path, command, '--root', root],
    { encoding: 'utf8', windowsHide: true, timeout: config.timeoutMs, maxBuffer: 64 * 1024 },
    (error, stdout, stderr) => { if (error) reject(Error(stderr.trim() || error.message)); else resolve(stdout); },
  ));
}

export async function ensurePatch(run: PatchRunner): Promise<'present' | 'applied'> {
  const status = JSON.parse(await run('status')).status;
  if (status === 'applied') return 'present';
  if (status !== 'not applied') throw Error('Unknown patch status');
  await run('apply');
  if (JSON.parse(await run('status')).status !== 'applied') throw Error('Patch verification failed');
  return 'applied';
}

export function registerHostPatch(pi: ExtensionAPI, patch: HostPatch, run: PatchRunner = command => runPatchScript(patch.script, command)) {
  const operationKey = Symbol.for(`sydney-kit.${patch.id}.operation`);
  const restartKey = Symbol.for(`sydney-kit.${patch.id}.restartRequired`);
  let active = false;
  pi.on('session_start', (_event, ctx) => {
    active = true;
    if (ctx.mode !== 'tui' || (patch.when && !patch.when())) return;
    const global = globalThis as any;
    // /reload re-registers the extension while a previous check may still be running; share it.
    let operation = global[operationKey] as Promise<void> | undefined;
    if (!operation) {
      const current: Promise<void> = ensurePatch(run).then(result => { if (result === 'applied') global[restartKey] = true; });
      operation = current;
      global[operationKey] = current;
      const release = () => { if (global[operationKey] === current) delete global[operationKey]; };
      void current.then(release, release);
    }
    void operation.then(() => {
      if (active && patch.restartNotice && global[restartKey]) ctx.ui.notify(`${patch.label}已应用：请完整重启 Pi，/reload 不会重新加载宿主渲染器`, 'warning');
    }).catch(error => {
      if (active) ctx.ui.notify(`${patch.label}检查未通过，已停止自动处理：${String(error.message).replace(/\s+/g, ' ').slice(0, 160)}`, 'warning');
    });
  });
  pi.on('session_shutdown', () => { active = false; });
}

import { createHash } from 'node:crypto';
export const hash = text => createHash('sha256').update(text).digest('hex');
export function patch(source) {
  const replace = (a,b) => { if (source.split(a).length !== 2) throw new Error('Unsupported runner anchor: '+a); source = source.replace(a,b); };
  replace('import { readFileSync }', 'import { capture as captureSSH, guard as guardSSH, prepare as prepareSSH } from "./sydney-ssh-child.mjs";\nimport { readFileSync }');
  replace('  const config = getConfig(type);', '  const sshBinding = captureSSH(options.pi.events);\n  let sshPrepared;\n  let sshOwned = false;\n  try {\n  const config = getConfig(type);');
  replace('  const env = await detectEnv(options.pi, effectiveCwd);', '  guardSSH(sshBinding, options, agentConfig);\n  const env = sshBinding ? { isGitRepo: false, branch: "", platform: sshBinding.metadata.platform } : await detectEnv(options.pi, effectiveCwd);');
  replace('  const extensions = isolated ? false : config.extensions;', '  const extensions = sshBinding || isolated ? false : config.extensions;');
  replace('  let systemPrompt: string;', '  const promptCwd = sshBinding?.metadata.cwd ?? effectiveCwd;\n  let systemPrompt: string;');
  replace('buildAgentPrompt(agentConfig, effectiveCwd,', 'buildAgentPrompt(agentConfig, promptCwd,');
  replace('buildAgentPrompt({ ...fallback, name: type }, effectiveCwd,', 'buildAgentPrompt({ ...fallback, name: type }, promptCwd,');
  replace('  const skills = isolated ? false : config.skills;', '  const skills = sshBinding || isolated ? false : config.skills;');
  replace('  const parentModelRuntime =', '  if (sshBinding) {\n    if (nestedTools.length) throw new Error("Nested SSH child scope unsupported");\n    sshPrepared = await prepareSSH(sshBinding, toolNames.filter(t => !disallowedSet?.has(t) && !EXCLUDED_TOOL_NAMES.includes(t)));\n    systemPrompt += `\\nSSH working directory: ${sshBinding.metadata.cwd}`;\n  }\n  const parentModelRuntime =');
  replace('customTools: [...nestedTools, ...structuredTools]', 'customTools: [...nestedTools, ...structuredTools, ...(sshPrepared?.tools ?? [])]');
  replace('  const baseSessionName =', '  if (sshPrepared) {\n    const dispose = session.dispose.bind(session);\n    const cleanup = sshPrepared.cleanup;\n    let cleaned = false;\n    session.dispose = () => { try { return dispose(); } finally { if (!cleaned) { cleaned = true; void cleanup(); } } };\n  }\n  const baseSessionName =');
  replace('  options.onSessionCreated?.(session);', '  options.onSessionCreated?.(session);');
  replace('  return {\n    responseText,', '  sshOwned = true;\n  return {\n    responseText,');
  replace('\n/**\n * Send a new prompt', '\n/**\n * Send a new prompt');
  replace('    ...(structuredRetried ? { structuredRetried } : {}),\n  };\n}', '    ...(structuredRetried ? { structuredRetried } : {}),\n  };\n  } finally { if (sshPrepared && !sshOwned) await sshPrepared.cleanup(); }\n}');
  return source;
}

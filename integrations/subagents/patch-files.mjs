import { patch } from './patch.mjs';
export function patchFile(name, source) {
 if(name==='src/agent-runner.ts') return patch(source).replace('captureSSH(options.pi.events)', 'Object.hasOwn(options, "sshBinding") ? (options as any).sshBinding : captureSSH(options.pi.events)');
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Unsupported anchor '+name+': '+a);source=source.replace(a,b)};
 if(name==='src/agent-manager.ts') {
 source='import { admit as admitSSH } from "./sydney-ssh-child.mjs";\n'+source;
 replace('    // Validate before the queue branch', '    options = admitSSH(pi.events, options, getAgentConfig(type));\n    // Validate before the queue branch');
 replace('    const promise = runAgent(ctx, type, prompt, {','    const promise = runAgent(ctx, type, prompt, {\n      ...({ sshBinding: (options as any).sshBinding } as any),');
 } else if(name==='src/index.ts') {
 source='import { capture as captureSSH } from "./sydney-ssh-child.mjs";\n'+source;
 replace('  const workflowTasks = new Map<string, WorkflowTask>();','  const workflowTasks = new Map<string, WorkflowTask>();\n  pi.events.on("sydney-kit:ssh-child-hook:v1", (request: any) => { request.available = true; });\n  const sshWorkflowBindings = new WeakMap<WorkflowTask, any>();');
 replace('          workflowId: task.id,','          workflowId: task.id,\n          ...({ sshBinding: sshWorkflowBindings.get(task) } as any),');
 replace('      const runId = workflowRunId();','      const sshBinding = captureSSH(pi.events) ?? null;\n      const runId = workflowRunId();');
 replace('      workflowTasks.set(runId, task);','      sshWorkflowBindings.set(task, sshBinding);\n      workflowTasks.set(runId, task);');
 replace('    const task = createWorkflowTask({ id: workflowRunId(), script, scriptPath: path, meta });','    const sshBinding = captureSSH(pi.events) ?? null;\n    const task = createWorkflowTask({ id: workflowRunId(), script, scriptPath: path, meta });\n    sshWorkflowBindings.set(task, sshBinding);');
 } else if(name==='src/workflow/host.ts') {
 replace('  const { pi, ctx, manager } = deps;','  const { pi, ctx, manager } = deps;\n  const sshBinding = (deps as any).sshBinding;');
 replace('    const result = await pi.exec(GATE_SHELL[0]', '    if (sshBinding) throw new Error("SSH workflow shell gates unsupported");\n    const result = await pi.exec(GATE_SHELL[0]');
 replace('...(deps.workflowId !== undefined ? { workflowId: deps.workflowId } : {}),','...(deps.workflowId !== undefined ? { workflowId: deps.workflowId } : {}),\n            ...({ sshBinding } as any),');
 } else throw Error('Unknown patch file');
 return source;
}

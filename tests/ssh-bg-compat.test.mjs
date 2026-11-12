import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const installer = fileURLToPath(new URL('../integrations/background/install.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-native-check-'));
const run = (...args) => spawnSync(process.execPath, [installer, ...args], {encoding:'utf8'});
const snapshot = () => fs.readdirSync(root, {recursive:true}).sort().map(name => {
 const target=path.join(root,name); return [name,fs.statSync(target).isFile()?fs.readFileSync(target,'utf8'):null];
});
try {
 fs.mkdirSync(path.join(root,'src/core'), {recursive:true});
 fs.writeFileSync(path.join(root,'src/extension.ts'),'legacy hook only');
 let before=snapshot();
 assert.equal(run(root).status,1); assert.deepEqual(snapshot(),before);
 fs.writeFileSync(path.join(root,'src/core/execution-backend.ts'),'BackgroundExecutionProvider sydney-kit:bg-execution:v1 sydney-kit:bg-hook:v1');
 fs.writeFileSync(path.join(root,'src/extension.ts'),'BG_EXECUTION_CHANNEL BG_EXECUTION_HOOK_CHANNEL resolveExecution');
 fs.writeFileSync(path.join(root,'src/core/registry.ts'),'resolveExecution');
 before=snapshot();
 assert.equal(run(root).status,0); assert.deepEqual(snapshot(),before);
 assert.equal(run(root,'--record').status,1); assert.deepEqual(snapshot(),before);
 assert.equal(run().status,1);
 fs.writeFileSync(path.join(root,'src/extension.ts'),'resolveExecution');
 before=snapshot();
 assert.equal(run(root).status,1); assert.deepEqual(snapshot(),before);
 console.log('PASS native compatibility check: success, legacy rejection, missing hook, arguments, no writes');
} finally {fs.rmSync(root,{recursive:true,force:true});}

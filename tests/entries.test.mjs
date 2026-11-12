import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { hostImport, projectRoot } from './helpers/paths.mjs';
const { createJiti } = await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const { createEventBus } = await hostImport('pi-coding-agent/dist/core/event-bus.js');
const jiti = createJiti(import.meta.url);
const { claim, isInstalled, deferLocalSnapshot } = await jiti.import(path.join(projectRoot, 'entries/shared/registration.ts'));
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json')));
assert.deepEqual(manifest.pi.extensions, ['interface', 'tool-view', 'ssh-workspace'].map(n => `./entries/${n}.ts`));
for (const order of [['tool-view'], ['tool-view', 'ssh-workspace'], ['ssh-workspace', 'tool-view']]) {
  const bus = createEventBus();
  // Deliberately distinct API and event facade objects sharing the real host bus.
  const make = () => {
    const handlers = new Map();
    return { events: { on: bus.on, emit: bus.emit }, on(n, f) { const a = handlers.get(n) ?? []; a.push(f); handlers.set(n, a); }, fire(n) { for (const f of handlers.get(n) ?? []) f(); } };
  };
  for (let reload = 0; reload < 2; reload++) {
    const apis = order.map(make);
    let snapshots = 0;
    order.forEach((name, i) => {
      assert.equal(claim(apis[i], name), true);
      assert.equal(claim(apis[i], name), false);
      assert.equal(claim(make(), name), false, 'deduplicate across APIs');
      if (name === 'tool-view') deferLocalSnapshot(apis[i], () => snapshots++);
    });
    apis.forEach(pi => pi.fire('session_start'));
    apis.forEach(pi => pi.fire('session_start'));
    assert.equal(snapshots, order.includes('ssh-workspace') ? 0 : 1);
    apis.forEach(pi => pi.fire('session_shutdown'));
    assert.equal(isInstalled(make(), 'ssh-workspace'), false);
    assert.equal(isInstalled(make(), 'tool-view'), false);
  }
}
console.log('PASS entry coordination: distinct APIs, both orders, standalone, duplicates, reload');

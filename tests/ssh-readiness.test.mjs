import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { hostImport } from './helpers/paths.mjs';
const { createEventBus } = await hostImport('pi-coding-agent/dist/core/event-bus.js');

// Execute the actual provider closure from the extension with a remote fixture.
// No SSH connection is made; the real Pi bus drives its readiness hook.
const source = readFileSync(new URL('../vendor/pi-ssh-remote/index.ts', import.meta.url), 'utf8');
const begin = source.indexOf('  const backgroundProvider =');
const end = source.indexOf('  const establish =', begin);
assert.ok(begin >= 0 && end > begin);
const body = stripTypeScriptTypes(source.slice(begin, end), { mode: 'transform' });
let spawns = 0;
const makeProvider = new Function('pi', 'remoteBackgroundChild', `
  const restoringSessionState = false, routeRemoteTools = true;
  const remote = { client: {}, host: 'example', username: 'user', port: 22, cwd: '/work' };
  const persistentRouteId = () => 'ssh:fixture';
  const persistentBackground = () => { throw Error('unexpected persistent construction'); };
  const connectRoute = () => { throw Error('unexpected connection'); };
  ${body}
  return backgroundProvider;
`);
for (const error of [new Error('runtime read failed'), 'runtime unavailable']) {
  const events = createEventBus();
  events.on('sydney-kit:bg-hook:v1', probe => { probe.available = true; probe.error = error; });
  const provider = makeProvider({ events }, () => { spawns++; });
  const request = {};
  provider(request);
  assert.equal(request.error, error);
  assert.equal(request.provider, undefined);
}
const events = createEventBus();
events.on('sydney-kit:bg-hook:v1', probe => { probe.available = true; });
const request = {};
makeProvider({ events }, () => { spawns++; })(request);
assert.equal(request.error, undefined);
assert.equal(request.provider.persistent, undefined);
request.provider.spawn('true', false);
assert.equal(spawns, 1);
console.log('PASS actual extension provider readiness errors fail closed; legacy hook remains supported');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hostImport, hostPath, projectRoot } from './helpers/paths.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
assert.ok(manifest.pi.themes.includes('./themes/tokyo-night.json'));
const themePath = path.join(projectRoot, 'themes/tokyo-night.json');
const palette = JSON.parse(fs.readFileSync(themePath, 'utf8'));
assert.equal(palette.name, 'tokyo-night');
assert.equal(palette.vars.bg, '#1a1b26');
const resolveColor = value => palette.vars[value] ?? value;
for (const [role, expected] of Object.entries({
  text: '#d5defa', syntaxComment: '#8993b8', syntaxKeyword: '#bb9af7',
  syntaxFunction: '#7aa2f7', syntaxVariable: '#c0caf5', syntaxString: '#9ece6a',
  syntaxNumber: '#ff9e64', userMessageBg: '', customMessageBg: '',
  toolPendingBg: '', toolSuccessBg: '', toolErrorBg: '',
})) assert.equal(resolveColor(palette.colors[role]), expected, role);
assert.equal(resolveColor(palette.export.pageBg), '#1a1b26');
const { loadThemeFromPath } = await hostImport('pi-coding-agent/dist/modes/interactive/theme/theme.js');
assert.ok(loadThemeFromPath(themePath));

// Exercise Pi's real package discovery without loading extensions or user settings.
const { DefaultPackageManager } = await hostImport('pi-coding-agent/dist/core/package-manager.js');
const { SettingsManager } = await hostImport('pi-coding-agent/dist/core/settings-manager.js');
const packages = new DefaultPackageManager({
  cwd: projectRoot,
  agentDir: projectRoot,
  settingsManager: SettingsManager.inMemory(),
});
const resources = await packages.resolveExtensionSources([projectRoot], { temporary: true });
assert.ok(resources.themes.some(resource =>
  resource.enabled && path.resolve(resource.path) === path.resolve(themePath)
), 'Pi must discover the bundled theme as an enabled package resource');

const { createJiti } = await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const jiti = createJiti(import.meta.url, { alias: {
  '@earendil-works/pi-coding-agent': hostPath('pi-coding-agent/dist/index.js'),
} });
const { default: install } = await jiti.import(path.join(projectRoot, 'src/ui/theme.ts'));
let start;
let preference = false;
install({ on(name, handler) { assert.equal(name, 'session_start'); start = handler; } }, () => preference);
const selections = [];
const warnings = [];
const ctx = {
  cwd: projectRoot,
  mode: 'tui',
  ui: {
    theme: { name: 'system' },
    setTheme(name) { selections.push(name); return { success: true }; },
    notify(message, level) { warnings.push({ message, level }); },
  },
};
await start({}, ctx);
assert.deepEqual(selections, ['tokyo-night']);
assert.deepEqual(warnings, []);
// Non-terminal contexts need no UI methods at all.
for (const mode of ['json', 'print', 'rpc']) await start({}, { mode });
assert.equal(selections.length, 1);
// Explicit saved choices and active CLI/extension choices survive startup/reload.
preference = true;
await start({}, ctx);
assert.equal(selections.length, 1);
preference = false;
ctx.ui.theme.name = 'light';
await start({}, ctx);
assert.equal(selections.length, 1);
ctx.ui.theme.name = 'system';
// Without a preference, reloading the host default reapplies Tokyo Night.
await start({}, ctx);
assert.deepEqual(selections, ['tokyo-night', 'tokyo-night']);
ctx.ui.setTheme = () => ({ success: false, error: 'Theme not found' });
await start({}, ctx);
assert.equal(warnings.length, 1);
assert.equal(warnings[0].level, 'warning');
assert.match(warnings[0].message, /tokyo-night.*Theme not found/);
console.log('PASS: bundled theme validation, package declaration, startup/reload selection, non-TUI guard, failure warning');

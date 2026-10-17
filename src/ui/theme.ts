import { SettingsManager, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

const defaultTheme = 'tokyo-night';

export default function theme(
  pi: ExtensionAPI,
  hasThemePreference = (cwd: string): boolean => {
    const settings = SettingsManager.create(cwd);
    // Conservatively preserve even project preferences that Pi has not applied yet.
    // Reading preferences here never writes settings or grants project trust.
    return settings.drainErrors().length > 0
      || settings.getGlobalSettings().theme !== undefined
      || settings.getProjectSettings().theme !== undefined;
  },
) {
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui' || hasThemePreference(ctx.cwd)) return;
    // Preserve a theme already selected by the CLI or another extension.
    if (ctx.ui.theme.name && ctx.ui.theme.name !== 'system') return;
    const result = ctx.ui.setTheme(defaultTheme);
    if (!result.success) {
      ctx.ui.notify(`Sydney Kit: could not apply ${defaultTheme}: ${result.error}`, 'warning');
    }
  });
}

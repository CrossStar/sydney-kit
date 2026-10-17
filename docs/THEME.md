# Tokyo Night

Sydney Kit bundles a Pi adaptation of Enkia's authentic **Tokyo Night (Night)** palette in `themes/tokyo-night.json`.

## Provenance

Palette and semantic color references:

- [Enkia's original palette table](https://github.com/enkia/tokyo-night-vscode-theme/blob/master/README.md#color-palette)
- [Original Night theme](https://github.com/enkia/tokyo-night-vscode-theme/blob/master/themes/tokyo-night-color-theme.json)
- [Original MIT license](https://github.com/enkia/tokyo-night-vscode-theme/blob/master/LICENSE.txt), reproduced below.

Sydney Kit retains Night's `#1a1b26` export background and uses a brighter `#d5defa` text foreground. User messages use teal `#73daca`; message rules and editor borders use `#b4bddd`. Message and tool panel backgrounds use the terminal default (no filled color blocks). Comments and muted text use `#8993b8`, and dim text uses `#7b85ad`. Keywords use `#bb9af7`, functions `#7aa2f7`, strings `#9ece6a`, and numbers `#ff9e64`. This is a readability-focused adaptation, not an official upstream Pi port.

The initial bundled copy came from `tests/fixtures/tokyo-night.json`, which matched the existing local user theme byte-for-byte (SHA-256 `d93df2658fc32de775db065d074fce99bfb1db84d07ecdf1d6f1328677081571`). That local adaptation included GitHub Dark Dimmed syntax colors and custom contrast changes. The bundled theme uses the upstream hue palette with brighter secondary text for terminal readability. The test fixture is unchanged; the previous user theme was backed up outside theme discovery when the bundled theme was enabled.

## Installation and default behavior

With `pi install git:github.com/CrossStar/sydney-kit`, Pi discovers the theme through the package resource declaration. Restart Pi or run `/reload` to apply it.

For manual extension installations, copy the bundled JSON to `~/.pi/agent/themes/tokyo-night.json` (Windows: `%USERPROFILE%\.pi\agent\themes\tokyo-night.json`), then reload. The distribution ZIP includes `themes/tokyo-night.json` and this document with its upstream license. If a user theme named `tokyo-night` already exists, resolve the duplicate resource before expecting the bundled palette to load; Pi reports theme-name collisions.

`src/ui/theme.ts` uses `ctx.ui.setTheme()` on `session_start`, wired by one import and call in `index.ts`. Tokyo Night is a fallback only when no user or project theme preference exists and Pi is still using its `system` theme. Explicit saved preferences (including `system` and automatic light/dark pairs) are preserved. An active non-system theme selected by the CLI or another extension is also preserved. Settings read errors conservatively skip the fallback.

Users can switch through `/settings` → **Theme**; Pi saves that preference and Sydney Kit respects it on later startups and reloads. The setup skips non-interactive modes, reports selection failures, and never writes settings files. There is no `themeConfig` option in `config.ts`. An explicit CLI selection of `system` cannot be distinguished from the host default through the active theme name alone when no saved theme preference exists.

Shiki highlighting remains independently configured by `highlighting.theme` in `config.ts`; changing the Pi theme does not change that renderer's palette. Terminal areas outside Pi's painted components retain the terminal's background.

## Verification

Run `node tests/theme.test.mjs` from the repository root. The test validates the theme with the installed Pi loader and checks the palette, resource declaration, startup selection, non-interactive guard, and failure reporting without starting a model session.

## Upstream license

The MIT License (MIT)

Copyright (c) 2018-present Enkia

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

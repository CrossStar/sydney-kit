// Tern compatibility: draw Kitty images last, as Pi already does for WezTerm.
import { replaceOnce, runPatchCli } from './engine.mjs';
runPatchCli({
  target: 'pi-tui/dist/tui-alt-screen.js',
  backupSuffix: 'sydney-tern-images',
  originalSha256: 'aa0b953c0158357d20a1d6f868cd4d7b667fd6646848a788ffded9808c9ef720',
  transform: replaceOnce(
    '        const drawKittyImagesLast = redrawImages && this.imageProtocol === "kitty" && screen.some(isImageLine) && isWezTerm;',
    '        const drawKittyImagesLast = redrawImages && this.imageProtocol === "kitty" && screen.some(isImageLine) && (isWezTerm || process.env.TERM_PROGRAM?.toLowerCase() === "tern"); // sydney-kit Tern ordering',
  ),
});

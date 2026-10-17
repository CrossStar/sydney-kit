import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { resolveHostRoot } from '../../src/host/paths.mjs';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g,'/').replace(/\/$/,'');
export const hostRoot = resolveHostRoot().replace(/\\/g,'/');
export const hostPath = relative => path.join(hostRoot, relative).replace(/\\/g,'/');
export const hostImport = relative => import(pathToFileURL(hostPath(relative)).href);

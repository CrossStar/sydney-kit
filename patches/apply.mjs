import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const command=process.argv[2]??'status';
const i=process.argv.indexOf('--root');
const root=i>=0?path.resolve(process.argv[i+1]):'C:/Users/Sydney/.bun/install/global/node_modules/@earendil-works';
const target=path.join(root,'pi-tui/dist/components/markdown.js');
const backup=target+'.sydney-kit-1.3.0.bak';
const originalHash='43185f806cc13c2adbe7f30b30be35bba4fce7a5ead4da81f53fe62b9bbbdc3d';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const anchor='            case "code": {\n';
const marker='// sydney-kit markdown hook v1 (Pi 1.3.0)\nglobalThis.__sydneyKitMarkdownHookVersion = "1.3.0";\n';
const hook=`                // sydney-kit: presentation only; any failure preserves the stock renderer.
                try {
                    const custom = globalThis.__sydneyKit?.renderCodeBlock?.(token.text, token.lang, width, {
                        raw: token.raw, styled: !!this.defaultTextStyle,
                        invalidate: () => this.invalidate()
                    });
                    if (Array.isArray(custom) && custom.every(line => typeof line === "string")) {
                        lines.push(...custom);
                        if (nextTokenType && nextTokenType !== "space") lines.push("");
                        break;
                    }
                } catch { /* Fall back to Pi's original cli-highlight renderer. */ }
`;
function patched(original){if(original.split(anchor).length!==2)throw Error('Expected exactly one code-token anchor');return marker+original.replace(anchor,anchor+hook);}
function atomic(data){const temp=target+'.sydney-tmp';fs.writeFileSync(temp,data,{flag:'wx'});try{fs.renameSync(temp,target);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
try{
 if(!['apply','revert','status'].includes(command))throw Error('Usage: node apply.mjs apply|revert|status [--root package-parent]');
 for(const pkg of ['pi-coding-agent','pi-tui']){const version=JSON.parse(fs.readFileSync(path.join(root,pkg,'package.json'),'utf8')).version;if(version!=='1.3.0')throw Error(`Unsupported ${pkg} ${version}; expected 1.3.0. No files changed.`);}
 const current=fs.readFileSync(target,'utf8');
 let original;
 if(hash(current)===originalHash)original=current;
 else if(fs.existsSync(backup)){original=fs.readFileSync(backup,'utf8');if(hash(original)!==originalHash||current!==patched(original))throw Error('Target or backup differs from verified original/patched file. Refusing changes.');}
 else throw Error('Unknown target hash and no verified backup. Refusing changes.');
 const applied=current===patched(original);
 if(command==='status'){console.log(JSON.stringify({version:'1.3.0',target,status:applied?'applied':'not applied',originalSha256:originalHash},null,2));}
 if(command==='apply'){
  if(applied)console.log('Already applied; skipped.');
  else {if(fs.existsSync(backup)){if(hash(fs.readFileSync(backup))!==originalHash)throw Error('Backup hash mismatch');}else fs.writeFileSync(backup,original,{flag:'wx'});atomic(patched(original));console.log('Applied. Restart Pi to load the patched Markdown module.');}
 }
 if(command==='revert'){if(!applied)console.log('Already original; skipped.');else{atomic(original);console.log('Restored verified original. Restart Pi. Backup retained.');}}
}catch(error){console.error(error.message);process.exitCode=1;}

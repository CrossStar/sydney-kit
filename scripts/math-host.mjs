import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function patch(text, kind) {
  const once = (a, b) => {
    if (text.split(a).length !== 2) throw Error(`Incompatible host signature: ${a}`);
    text = text.replace(a, () => b);
  };
  const hook = `if(this.options.sydneyMath){let result;try{result=token===this.sydneyTopToken?globalThis[Symbol.for('sydney-kit.math-block')]?.(this,token,width,()=>{this.invalidate();globalThis[Symbol.for('sydney-kit.math-tui')]?.requestRender();}):undefined;}catch{}if(result)return result;return token.raw.trim().split('\\n').flatMap(line=>wrapTextWithAnsi(line,width));}`;
  if (kind === 'markdown') {
    const blockAnchor = text.includes('renderBlock(block, token, nextTokenType, width, contentWidth) {') ? 'renderBlock(block, token, nextTokenType, width, contentWidth) {' : 'renderBlock(block,token,nextTokenType,width,contentWidth){';
    once(blockAnchor, blockAnchor + 'this.sydneyTopToken=token;');
    const anchor = text.includes('case "latexBlock": {') ? 'case "latexBlock": {' : 'case"latexBlock":{';
    once(anchor, anchor + hook);
  }
  if (kind === 'assistant') {
    const anchor = text.includes('transform: createMarkdownTransform("assistant",') ? 'transform: createMarkdownTransform("assistant",' : 'transform:createMarkdownTransform("assistant",';
    once(anchor, 'sydneyMath:true,' + anchor);
  }
  if (kind === 'tui') {
    const anchor = text.includes('this.terminal = terminal;') ? 'this.terminal = terminal;' : 'this.terminal=terminal,';
    once(anchor, anchor + (anchor.endsWith(',') ? "globalThis[Symbol.for('sydney-kit.math-tui')]=this," : "globalThis[Symbol.for('sydney-kit.math-tui')]=this;"));
  }
  return text;
}

export function install(source, destination) {
  source = fs.realpathSync(source);
  for (const name of ['pi-coding-agent','pi-tui']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(source,name,'package.json')));
    if (pkg.version !== '1.5.0') throw Error(`Unsupported ${name} ${pkg.version}; expected 1.5.0`);
  }
  // Validate every edit before creating the isolated installation.
  const changes = new Map();
  const edit = (name, kind) => changes.set(name, patch(changes.get(name) ?? fs.readFileSync(path.join(source,name),'utf8'),kind));
  edit('pi-tui/dist/components/markdown.js','markdown');
  edit('pi-coding-agent/dist/modes/interactive/components/assistant-message.js','assistant');
  edit('pi-tui/dist/tui.js','tui');
  const bundle = 'pi-coding-agent/dist/bundle/chunks';
  for (const [kind, signature] of [['markdown','case"latexBlock":{'],['assistant','transform:createMarkdownTransform("assistant",'],['tui','constructor(terminal,showHardwareCursor,logDirectory)']]) {
    const matches = fs.readdirSync(path.join(source,bundle)).filter(n=>n.endsWith('.js') && fs.readFileSync(path.join(source,bundle,n),'utf8').includes(signature));
    if(matches.length!==1) throw Error(`Expected one bundled ${kind}, found ${matches.length}`);
    edit(`${bundle}/${matches[0]}`,kind);
  }
  const modules = path.join(destination,'node_modules');
  const cli = path.join(modules,'@earendil-works/pi-coding-agent/dist/bundle/cli.js');
  if (fs.existsSync(destination)) {
    const manifest=JSON.parse(fs.readFileSync(path.join(destination,'manifest.json'),'utf8'));
    if(manifest.source!==source || manifest.version!=='1.5.0') throw Error('Existing destination belongs to another installation');
    for(const [name,text] of changes) if(fs.readFileSync(path.join(modules,'@earendil-works',name),'utf8')!==text) throw Error('Isolated patch differs; use a new destination');
    return cli;
  }
  fs.mkdirSync(path.join(modules,'@earendil-works'),{recursive:true});
  for(const name of fs.readdirSync(path.dirname(source))) {
    if(name==='@earendil-works') continue;
    fs.symlinkSync(path.join(path.dirname(source),name),path.join(modules,name),'junction');
  }
  for(const name of fs.readdirSync(source)) {
    const target=path.join(modules,'@earendil-works',name);
    if(['pi-coding-agent','pi-tui'].includes(name)) fs.cpSync(path.join(source,name),target,{recursive:true});
    else fs.symlinkSync(path.join(source,name),target,'junction');
  }
  for(const [name,text] of changes) fs.writeFileSync(path.join(modules,'@earendil-works',name),text);
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({source,version:'1.5.0',files:[...changes.keys()]},null,2));
  return path.join(modules,'@earendil-works/pi-coding-agent/dist/bundle/cli.js');
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  const [source,dest,...args]=process.argv.slice(2);
  if(!source||!dest) throw Error('Usage: node scripts/math-host.mjs <package-parent> <new-isolated-directory> [Pi arguments]');
  const cli=install(source,path.resolve(dest));
  if(args.length) process.exitCode=spawnSync(process.execPath,[cli,...args],{stdio:'inherit'}).status??1;
  else console.log(cli);
}

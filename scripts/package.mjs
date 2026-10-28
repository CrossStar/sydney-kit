import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const files=['index.ts','config.ts','package.json','package-lock.json','README.md','CHANGELOG.md','.gitignore','.gitattributes'];
function collect(relative){for(const item of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const name=relative+'/'+item.name;if(item.isSymbolicLink())throw Error('Symlink in distribution: '+name);if(item.isDirectory())collect(name);else files.push(name);}}
for(const directory of ['src','archive','scripts','vendor','docs','tests','benchmarks','themes','integrations'])collect(directory);
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
let offset=0;const local=[],central=[],manifest=[];
for(const relative of files.sort()){
 const data=fs.readFileSync(path.join(root,relative)),compressed=deflateRawSync(data),name=Buffer.from('sydney-kit/'+relative),crc=crc32(data);
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
 const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);header.copy(record,6,4,28);record.writeUInt32LE(offset,42);
 local.push(header,name,compressed);central.push(record,name);offset+=header.length+name.length+compressed.length;
 manifest.push({path:relative,sha256:createHash('sha256').update(data).digest('hex')});
}
const centralSize=central.reduce((sum,b)=>sum+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
const out=path.join(root,'dist');fs.mkdirSync(out,{recursive:true});
const archive=path.join(out,`sydney-kit-${version}.zip`);fs.writeFileSync(archive,Buffer.concat([...local,...central,end]));fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Created ${archive} (${files.length} files)`);

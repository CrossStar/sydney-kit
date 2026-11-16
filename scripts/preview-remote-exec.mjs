#!/usr/bin/env node
// Visual proposal v2 for shell command cards. Static mock data: nothing is executed, no SSH.
const argv = process.argv.slice(2);
const HOST_COLORS = { violet: '1;38;5;177', blue: '1;38;5;111', orange: '1;38;5;215', teal: '1;38;5;79' };
const opt = { plain: false, width: undefined, hostColor: 'violet', palette: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help') {
    console.log(`Usage: node scripts/preview-remote-exec.mjs [--host-color NAME] [--palette] [--width N] [--plain]\n  --host-color  ${Object.keys(HOST_COLORS).join(' | ')} (default violet)\n  --palette     compare all host colours side by side\nStatic mock-up; no commands or SSH connections are executed.`);
    process.exit(0);
  } else if (a === '--plain') opt.plain = true;
  else if (a === '--palette') opt.palette = true;
  else if (a === '--host-color') {
    opt.hostColor = argv[++i];
    if (!HOST_COLORS[opt.hostColor]) throw Error(`--host-color must be one of: ${Object.keys(HOST_COLORS).join(', ')}`);
  }
  else if (a === '--width') {
    opt.width = Number(argv[++i]);
    if (!Number.isInteger(opt.width) || opt.width < 40 || opt.width > 200) throw Error('--width must be an integer from 40 to 200');
  } else throw Error(`Unknown option: ${a}`);
}

const W = opt.width ?? Math.max(40, Math.min(process.stdout.columns || 90, 100));
const color = process.stdout.isTTY && !opt.plain && !process.env.NO_COLOR;
const sgr = code => s => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { dim: sgr('2'), bold: sgr('1'), green: sgr('32'), red: sgr('31'), yellow: sgr('33'), cyan: sgr('36'), host: sgr(HOST_COLORS[opt.hostColor]) };
const ANSI = /\x1b\[[0-9;]*m/g;
const vis = s => [...s.replace(ANSI, '')].reduce((n, ch) => n + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uff00-\uff60]/.test(ch) ? 2 : 1), 0);
const clip = (s, w) => (vis(s) <= w ? s : [...s].slice(0, Math.max(0, w - 1)).join('') + '…');

const NAME = 7, INDENT = '  ', BODY = '    ';
const ICON = { ok: ['✓', c.green], fail: ['✗', c.red], run: ['…', c.dim] };

/**
 * Same left side as the local card: icon, executable, arguments.
 * Remote cards add one coloured host chip at the start of the right-hand status zone.
 * Width priority: executable > host > exit status > arguments > duration.
 */
function card({ cmd, host, state = 'ok', status, duration, arrow, body = [], width = W }) {
  const [exe, ...rest] = cmd.split(' ');
  const args = rest.join(' ');
  const [icon, paint] = ICON[state];
  const label = exe.padEnd(NAME);
  const avail = width - INDENT.length;
  const leftFixed = vis(icon) + 1 + vis(label) + 1;
  const parts = (withDuration) => [host && c.host(host), status && c.dim(status), withDuration && duration && c.dim(duration)].filter(Boolean).join(c.dim(' · ')) + (arrow ? c.dim(' ' + arrow) : '');
  let right = parts(true);
  if (avail - leftFixed - vis(right) - 2 < vis(args)) right = parts(false);
  const room = Math.max(0, avail - leftFixed - vis(right) - 2);
  const shownArgs = clip(args, room);
  const left = paint(icon) + ' ' + c.cyan(label) + ' ' + shownArgs;
  console.log(INDENT + left + ' '.repeat(Math.max(2, avail - vis(left) - vis(right))) + right);
  for (const [text, f, wrap] of body) {
    const room = avail - BODY.length;
    if (!wrap) { console.log(INDENT + BODY + (f ?? (s => s))(clip(text, room))); continue; }
    // Wrap long prompt lines on spaces; continuation lines are indented under the command.
    let line = '';
    const lines = [];
    for (const word of text.split(' ')) {
      if (line && vis(line + ' ' + word) > room) { lines.push(line); line = '  ' + word; }
      else line = line ? line + ' ' + word : word;
    }
    lines.push(line);
    for (const l of lines) console.log(INDENT + BODY + l);
  }
}
const out = t => [t];
const err = t => [t, c.red];
const note = t => [t, c.dim];
/** Expanded view: a shell-prompt line carries host and cwd, then the full command. */
const prompt = (host, cwd, cmd) => {
  const [exe, ...rest] = cmd.split(' ');
  const where = host ? c.host(host) + c.dim(':' + cwd) : c.dim(cwd);
  return [`${where} ${c.dim('$')} ${c.cyan(exe)} ${rest.join(' ')}`, undefined, true];
};
const section = t => console.log('\n' + c.bold(t) + ' ' + c.dim('─'.repeat(Math.max(0, Math.min(W, 76) - vis(t) - 1))));
const caption = t => console.log(c.dim(`  ${t}`));

console.log(c.bold('命令卡片方案 v2') + c.dim(` · ${W} 列 · 模拟数据，不执行命令`));
console.log(c.dim('  原则：命令保持完整、与本地同样高亮；主机只是一枚固定位置的彩色标签。'));

if (opt.palette) {
  section('主机颜色对比');
  for (const name of Object.keys(HOST_COLORS)) {
    c.host = sgr(HOST_COLORS[name]);
    caption(name);
    card({ cmd: 'uname -a', host: 'raspi', status: 'exit 0', duration: '0.1s' });
    card({ cmd: 'python app.py', host: 'moon', state: 'fail', status: 'exit 1', duration: '0.2s' });
  }
  console.log('\n' + c.dim('用 --host-color NAME 以某种颜色查看完整示例。'));
  process.exit(0);
}

section('1. 同一会话中本地与远端交替执行');
card({ cmd: 'git status --short', status: 'exit 0', duration: '0.1s' });
card({ cmd: 'uname -a', host: 'raspi', status: 'exit 0', duration: '0.1s', body: [out('Linux raspi 6.12.25 aarch64 GNU/Linux')] });
card({ cmd: 'python app.py --port 8080', host: 'raspi', state: 'run', status: 'running', body: [out('Serving on http://0.0.0.0:8080')] });
card({ cmd: 'npm run build', status: 'exit 0', duration: '1.4s', body: [out('Build completed.')] });
card({ cmd: 'nvidia-smi --query-gpu=name --format=csv', host: 'moon', status: 'exit 0', duration: '0.4s', body: [out('NVIDIA A100-SXM4-80GB')] });
caption('左侧完全沿用本地卡片，扫读时只看命令；右侧彩色主机名说明执行位置。');

section('2. 两种调用入口，外观一致');
caption('bash(command: "uname -a")，SSH 自动路由');
card({ cmd: 'uname -a', host: 'raspi', status: 'exit 0', duration: '0.1s' });
caption('remote(action: "exec", remoteCommand: "uname -a")');
card({ cmd: 'uname -a', host: 'raspi', status: 'exit 0', duration: '0.1s' });

section('3. 失败与断连');
card({ cmd: 'python app.py', host: 'raspi', state: 'fail', status: 'exit 1', duration: '0.2s', body: [err("ModuleNotFoundError: No module named 'torch'")] });
card({ cmd: 'python train.py', host: 'moon', state: 'fail', status: 'connection lost', body: [note('Remote command outcome unknown; check the process on moon.')] });
caption('connection lost 不是远端进程的退出码，单独表达。');

section('4. 长命令：参数截断，主机与状态保留');
card({ cmd: 'python scripts/evaluate.py --model checkpoints/latest --dataset data/test.json --batch-size 32', host: 'raspi', state: 'run', status: 'running', body: [out('Evaluating 128 samples…')] });

section('5. 窄屏（48 列）：先省略耗时，再截断参数，主机名始终保留');
for (const x of [
  { cmd: 'python scripts/evaluate.py --dataset data/test.json', host: 'raspi', status: 'exit 0', duration: '12.8s' },
  { cmd: 'npm run build', status: 'exit 0', duration: '1.4s' },
]) card({ ...x, width: 48 });

section('6. 展开（▾）：用 shell 提示符给出主机与实际工作目录');
card({ cmd: 'python scripts/evaluate.py --model checkpoints/latest --dataset data/test.json', host: 'raspi', status: 'exit 0', duration: '12.8s', arrow: '▾', body: [
  prompt('raspi', '~/app', 'python scripts/evaluate.py --model checkpoints/latest --dataset data/test.json'),
  out(''), out('Loading checkpoint…'), out('Accuracy: 92.4%'), out('Results saved to outputs/evaluation.json'),
] });
card({ cmd: 'npm run build', status: 'exit 0', duration: '1.4s', arrow: '▾', body: [prompt(undefined, '~/Workspace/projects/sydney-kit', 'npm run build'), out(''), out('Build completed.')] });

section('7. 连接管理操作保持 remote 原样');
console.log(INDENT + c.cyan('remote') + c.dim(' connect') + '  ssh raspi');
console.log(INDENT + c.cyan('remote') + c.dim(' chdir') + '    ~/app');

console.log('\n' + c.dim('▾ 为视觉占位，不可交互。--palette 对比主机颜色，--host-color NAME 切换，--width N 指定列宽。'));

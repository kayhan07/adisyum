import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  NEXT_PUBLIC_POS_DIAGNOSTICS: '1',
  NEXT_PUBLIC_POS_DEBUG: '1',
};

console.log('[pos:debug-click-pipeline] diagnostics enabled');
console.log('[pos:debug-click-pipeline] open the POS screen and watch [adisyon-flow] console events');

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev'], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

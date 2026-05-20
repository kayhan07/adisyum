import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  NEXT_PUBLIC_POS_DIAGNOSTICS: '1',
  NEXT_PUBLIC_POS_DEBUG: '1',
  NEXT_PUBLIC_POS_RECONCILIATION_TRACE: '1',
  POS_DIAGNOSTICS: '1',
};

console.log('[pos:trace-reconciliation] reconciliation trace enabled');
console.log('[pos:trace-reconciliation] watch [adisyon-flow] and [pos-table-orders] events');

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

#!/usr/bin/env node
const { execFileSync, execSync } = require('node:child_process');

const portArg = process.argv[2] || '3000';
const port = Number.parseInt(portArg, 10);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`[kill-port] Invalid port: ${portArg}`);
  process.exit(1);
}

const isWindows = process.platform === 'win32';

try {
  if (isWindows) {
    const command =
      `$conns = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue; ` +
      `if (-not $conns) { Write-Output ('[kill-port] Port ${port} already free.'); exit 0 }; ` +
      `$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }; ` +
      `if (-not $pids) { Write-Output ('[kill-port] No killable processes on ${port}.'); exit 0 }; ` +
      `foreach ($procId in $pids) { ` +
      `try { ` +
      `Stop-Process -Id $procId -Force -ErrorAction Stop; ` +
      `Write-Output ("[kill-port] Stopped PID {0} on ${port}." -f $procId) ` +
      `} catch { ` +
      `Write-Output ("[kill-port] Failed to stop PID {0}: {1}" -f $procId, $_.Exception.Message) ` +
      `} }`;
    execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { stdio: 'inherit' },
    );
  } else {
    execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: 'inherit' });
    console.log(`[kill-port] Cleared port ${port}.`);
  }
} catch (error) {
  console.warn(`[kill-port] Failed to clear port ${port}:`, error.message);
}

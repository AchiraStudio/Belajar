const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8080/api/v1/health', { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const isAlive = await checkHealth();
  if (isAlive) {
    console.log('[stuby] Server is already running on http://127.0.0.1:8080');
    // Keep alive until killed by parent so devUrl watcher doesn't see early process termination
    await new Promise(() => {});
    return;
  }

  console.log('[stuby] Starting stuby-server on http://127.0.0.1:8080...');
  const rootDir = path.resolve(__dirname, '..');
  const server = spawn('cargo', ['run', '-p', 'stuby-server'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  server.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => server.kill());
  process.on('SIGTERM', () => server.kill());
}

main().catch((err) => {
  console.error('[stuby] Error checking/starting server:', err);
  process.exit(1);
});

import { spawn } from 'node:child_process';

const vite = spawn('npm', ['exec', 'vite', '--', '--host', '127.0.0.1'], {
  stdio: 'inherit',
  shell: false
});

let electron = null;

function startElectron() {
  electron = spawn('npm', ['exec', 'electron', '--', '.'], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      ELECTRON_START_URL: 'http://127.0.0.1:5173'
    }
  });

  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
}

setTimeout(startElectron, 1200);

process.on('SIGINT', () => {
  electron?.kill();
  vite.kill();
});

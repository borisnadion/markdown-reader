import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildDir = path.join(repoRoot, 'build');
const svgPath = path.join(buildDir, 'icon.svg');
const pngPath = path.join(buildDir, 'icon.png');
const iconsetDir = path.join(buildDir, 'icon.iconset');
const icnsPath = path.join(buildDir, 'icon.icns');

const icons = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
];

mkdirSync(buildDir, { recursive: true });
rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

rasterizeSvg();

for (const [fileName, size] of icons) {
  execFileSync('sips', ['-z', String(size), String(size), pngPath, '--out', path.join(iconsetDir, fileName)], {
    stdio: 'ignore'
  });
}

try {
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath], {
    stdio: 'inherit'
  });

  console.log(`Created ${path.relative(repoRoot, icnsPath)}`);
} catch (error) {
  if (!existsSync(icnsPath)) throw error;

  console.warn(`Keeping existing ${path.relative(repoRoot, icnsPath)} because iconutil rejected the generated iconset.`);
}

function rasterizeSvg() {
  if (commandExists('rsvg-convert')) {
    execFileSync('rsvg-convert', ['-w', '1024', '-h', '1024', '-o', pngPath, svgPath], {
      stdio: 'inherit'
    });
    return;
  }

  if (commandExists('magick')) {
    execFileSync('magick', [svgPath, '-resize', '1024x1024', pngPath], {
      stdio: 'inherit'
    });
    return;
  }

  if (commandExists('convert')) {
    execFileSync('convert', [svgPath, '-resize', '1024x1024', pngPath], {
      stdio: 'inherit'
    });
    return;
  }

  throw new Error('Install librsvg or ImageMagick to generate build/icon.icns from build/icon.svg.');
}

function commandExists(command) {
  const result = spawnSync('which', [command], { stdio: 'ignore' });
  return result.status === 0;
}

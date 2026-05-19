import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { arch } from 'node:process';
import { execFileSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(projectRoot, 'macos', 'QuickLookPreview');
const outputRoot = join(projectRoot, 'build', 'quicklook');
const appexRoot = join(outputRoot, 'MarkdownQuickLook.appex');
const contentsRoot = join(appexRoot, 'Contents');
const macOSRoot = join(contentsRoot, 'MacOS');
const resourcesRoot = join(contentsRoot, 'Resources');
const moduleCacheRoot = join(outputRoot, 'ModuleCache');
const executablePath = join(macOSRoot, 'MarkdownQuickLook');
const infoPlistPath = join(sourceRoot, 'Info.plist');
const entitlementsPath = join(sourceRoot, 'QuickLookPreview.entitlements');
const swiftSource = join(sourceRoot, 'Sources', 'PreviewViewController.swift');

const swiftArchitecture = arch === 'x64' ? 'x86_64' : 'arm64';
const deploymentTarget = '26.5';
const moduleName = 'MarkdownQuickLook';

function run(command, args) {
  execFileSync(command, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCacheRoot,
      SWIFT_MODULE_CACHE_PATH: moduleCacheRoot
    },
    stdio: 'inherit'
  });
}

function ensureFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Required file is missing: ${path}`);
  }
}

ensureFile(infoPlistPath);
ensureFile(entitlementsPath);
ensureFile(swiftSource);
ensureFile(join(projectRoot, 'node_modules', 'marked', 'marked.min.js'));
ensureFile(join(projectRoot, 'node_modules', 'dompurify', 'dist', 'purify.min.js'));

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(macOSRoot, { recursive: true });
mkdirSync(resourcesRoot, { recursive: true });
mkdirSync(moduleCacheRoot, { recursive: true });

copyFileSync(infoPlistPath, join(contentsRoot, 'Info.plist'));
copyFileSync(
  join(projectRoot, 'node_modules', 'marked', 'marked.min.js'),
  join(resourcesRoot, 'marked.min.js')
);
copyFileSync(
  join(projectRoot, 'node_modules', 'dompurify', 'dist', 'purify.min.js'),
  join(resourcesRoot, 'purify.min.js')
);

const sdkPath = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], {
  cwd: projectRoot,
  encoding: 'utf8'
}).trim();

run('swiftc', [
  '-sdk',
  sdkPath,
  '-target',
  `${swiftArchitecture}-apple-macosx${deploymentTarget}`,
  '-module-name',
  moduleName,
  '-emit-executable',
  '-parse-as-library',
  '-module-cache-path',
  moduleCacheRoot,
  '-application-extension',
  '-O',
  '-framework',
  'Cocoa',
  '-framework',
  'QuickLookUI',
  '-Xlinker',
  '-e',
  '-Xlinker',
  '_NSExtensionMain',
  '-Xlinker',
  '-rpath',
  '-Xlinker',
  '@executable_path/../Frameworks',
  '-o',
  executablePath,
  swiftSource
]);

run('codesign', [
  '--force',
  '--sign',
  '-',
  '--timestamp=none',
  '--entitlements',
  entitlementsPath,
  appexRoot
]);

console.log(`Built ${appexRoot}`);

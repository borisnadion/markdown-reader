import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import './styles.css';

const themes = [
  { id: 'github-light', label: 'GitHub Light', mode: 'light' },
  { id: 'vscode-light', label: 'VS Code Light+', mode: 'light' },
  { id: 'solarized-light', label: 'Solarized Light', mode: 'light' },
  { id: 'clean-paper', label: 'Clean Paper', mode: 'light' },
  { id: 'github-dark', label: 'GitHub Dark', mode: 'dark' },
  { id: 'dracula', label: 'Dracula', mode: 'dark' },
  { id: 'nord', label: 'Nord', mode: 'dark' },
  { id: 'one-dark', label: 'One Dark', mode: 'dark' },
  { id: 'solarized-dark', label: 'Solarized Dark', mode: 'dark' }
];

const state = {
  fileName: '',
  filePath: '',
  markdown: sampleMarkdown(),
  theme: localStorage.getItem('theme') || 'github-light',
  zoom: Number(localStorage.getItem('zoom') || '1')
};

marked.setOptions({
  gfm: true,
  breaks: false,
  highlight(code, language) {
    const normalizedLanguage = hljs.getLanguage(language) ? language : 'plaintext';
    return hljs.highlight(code, { language: normalizedLanguage }).value;
  }
});

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="shell">
    <header class="toolbar">
      <div class="window-drag"></div>
      <div class="file-meta">
        <div class="file-name" id="file-name">Untitled Preview</div>
        <div class="file-path" id="file-path">Open or drop a Markdown file</div>
      </div>
      <div class="toolbar-actions">
        <button class="icon-button" id="open-file" title="Open Markdown" aria-label="Open Markdown">
          <span aria-hidden="true">⌘O</span>
        </button>
        <label class="select-wrap" title="Theme">
          <span class="sr-only">Theme</span>
          <select id="theme-select"></select>
        </label>
        <div class="zoom-group" aria-label="Zoom controls">
          <button class="icon-button" id="zoom-out" title="Zoom Out" aria-label="Zoom Out">−</button>
          <button class="zoom-value" id="zoom-reset" title="Actual Size" aria-label="Actual Size">100%</button>
          <button class="icon-button" id="zoom-in" title="Zoom In" aria-label="Zoom In">+</button>
        </div>
      </div>
    </header>
    <section class="drop-overlay" id="drop-overlay">Drop Markdown file to open</section>
    <section class="viewer-frame">
      <article class="markdown-body" id="preview"></article>
    </section>
  </main>
`;

const fileNameEl = document.querySelector('#file-name');
const filePathEl = document.querySelector('#file-path');
const previewEl = document.querySelector('#preview');
const themeSelect = document.querySelector('#theme-select');
const zoomValue = document.querySelector('#zoom-reset');
const dropOverlay = document.querySelector('#drop-overlay');

themeSelect.innerHTML = themes
  .map((theme) => `<option value="${theme.id}">${theme.label}</option>`)
  .join('');

themeSelect.value = state.theme;

document.querySelector('#open-file').addEventListener('click', async () => {
  const file = await window.markdownReader.openMarkdown();
  if (file) openFile(file);
});

themeSelect.addEventListener('change', () => {
  state.theme = themeSelect.value;
  localStorage.setItem('theme', state.theme);
  render();
});

document.querySelector('#zoom-out').addEventListener('click', zoomOut);
document.querySelector('#zoom-in').addEventListener('click', zoomIn);
document.querySelector('#zoom-reset').addEventListener('click', resetZoom);

window.markdownReader.onFileOpen(openFile);
window.markdownReader.onZoomIn(zoomIn);
window.markdownReader.onZoomOut(zoomOut);
window.markdownReader.onZoomReset(resetZoom);

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropOverlay.classList.add('is-visible');
});

window.addEventListener('dragleave', (event) => {
  if (event.clientX === 0 && event.clientY === 0) {
    dropOverlay.classList.remove('is-visible');
  }
});

window.addEventListener('drop', async (event) => {
  event.preventDefault();
  dropOverlay.classList.remove('is-visible');

  const file = [...event.dataTransfer.files].find((candidate) =>
    /\.(md|markdown|mdown|mkd)$/i.test(candidate.name)
  );

  if (!file) return;

  openFile({
    name: file.name,
    path: file.path || '',
    content: await file.text()
  });
});

function openFile(file) {
  state.fileName = file.name;
  state.filePath = file.path;
  state.markdown = file.content;
  render();
}

function zoomIn() {
  setZoom(state.zoom + 0.1);
}

function zoomOut() {
  setZoom(state.zoom - 0.1);
}

function resetZoom() {
  setZoom(1);
}

function setZoom(value) {
  state.zoom = Math.min(2.5, Math.max(0.5, Number(value.toFixed(2))));
  localStorage.setItem('zoom', String(state.zoom));
  renderZoom();
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.mode = themes.find((theme) => theme.id === state.theme)?.mode || 'light';

  fileNameEl.textContent = state.fileName || 'Untitled Preview';
  filePathEl.textContent = state.filePath || 'Open or drop a Markdown file';
  themeSelect.value = state.theme;

  const html = marked.parse(state.markdown);
  previewEl.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel']
  });

  for (const link of previewEl.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    if (/^https?:\/\//i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  }

  renderZoom();
}

function renderZoom() {
  previewEl.style.zoom = state.zoom;
  zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

function sampleMarkdown() {
  return `# Markdown Reader

Open a Markdown file with **Command+O** or drop one into this window.

## Features

- GitHub-flavored Markdown
- Light and dark themes
- Syntax highlighting
- Browser-style zoom for text, tables, and images

\`\`\`js
const message = 'Markdown rendering is ready.';
console.log(message);
\`\`\`

> The Quick Look extension has been intentionally removed from this phase.
`;
}

render();

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import 'highlight.js/styles/github.css';
import './styles.css';

const themes = [
  { id: 'system', label: 'System', mode: 'system' },
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
  documents: [],
  activeDocumentId: '',
  themePreference: localStorage.getItem('theme') || 'system',
  zoom: Number(localStorage.getItem('zoom') || '1'),
  tabSidebarWidth: Number(localStorage.getItem('tabSidebarWidth') || '220'),
  searchQuery: '',
  searchMatches: [],
  activeSearchIndex: -1
};

const BASE_CONTENT_WIDTH = 900;
const TAB_SIDEBAR_MIN_WIDTH = 128;
const TAB_SIDEBAR_MAX_WIDTH = 420;
const PREVIEW_MIN_WIDTH = 320;
const ZOOM_LEVELS = Array.from({ length: 21 }, (_, index) => Number((0.5 + index * 0.1).toFixed(1)));
const MERMAID_LANGUAGE = 'mermaid';
const MERMAID_RENDER_ERROR_MESSAGE = 'cannot render mermaid diafram';
const MARKDOWN_LINK_PATTERN = /\.(md|markdown|mdown|mkd)(?:[?#]|$)/i;
const FRONT_MATTER_DELIMITER = '---';

let nextDocumentId = 1;
let renderGeneration = 0;
let mermaidModulePromise = null;

const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);

marked.use({
  renderer: {
    code(token) {
      const language = normalizeCodeLanguage(token.lang);

      if (language === MERMAID_LANGUAGE) {
        return [
          '<div class="mermaid-diagram" data-mermaid-diagram role="img" aria-label="Mermaid diagram">',
          '<div class="mermaid-status">Rendering diagram...</div>',
          `<pre class="mermaid-source"><code>${escapeHtml(token.text)}</code></pre>`,
          '</div>\n'
        ].join('');
      }

      return renderHighlightedCode(token.text, language);
    }
  }
});

marked.setOptions({
  gfm: true,
  breaks: false
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
      <form class="search-form" id="search-form" role="search">
        <label class="sr-only" for="search-input">Search</label>
        <input class="search-input" id="search-input" type="search" placeholder="Search" autocomplete="off" />
      </form>
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
    <div class="workspace">
      <nav
        class="document-tabs"
        id="document-tabs"
        aria-label="Open documents"
        aria-orientation="vertical"
        role="tablist"
      ></nav>
      <div
        class="document-tabs-resizer"
        id="document-tabs-resizer"
        role="separator"
        aria-label="Resize tabs"
        aria-orientation="vertical"
        tabindex="0"
      ></div>
      <section class="viewer-frame">
        <article class="markdown-body" id="preview"></article>
      </section>
    </div>
    <section class="drop-overlay" id="drop-overlay">Drop Markdown files to open</section>
  </main>
`;

const fileNameEl = document.querySelector('#file-name');
const filePathEl = document.querySelector('#file-path');
const previewEl = document.querySelector('#preview');
const viewerFrameEl = document.querySelector('.viewer-frame');
const themeSelect = document.querySelector('#theme-select');
const zoomValue = document.querySelector('#zoom-reset');
const dropOverlay = document.querySelector('#drop-overlay');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const workspaceEl = document.querySelector('.workspace');
const documentTabsEl = document.querySelector('#document-tabs');
const documentTabsResizerEl = document.querySelector('#document-tabs-resizer');

setTabSidebarWidth(state.tabSidebarWidth, { persist: false });

themeSelect.innerHTML = themes
  .map((theme) => `<option value="${theme.id}">${theme.label}</option>`)
  .join('');

themeSelect.value = state.themePreference;

document.querySelector('#open-file').addEventListener('click', async () => {
  const files = await window.markdownReader.openMarkdown();
  if (files?.length) openFiles(files);
});

documentTabsEl.addEventListener('click', (event) => {
  const closeButton = event.target.closest('[data-document-action="close"]');
  if (closeButton && documentTabsEl.contains(closeButton)) {
    closeDocument(closeButton.dataset.documentId);
    return;
  }

  const tabButton = event.target.closest('[data-document-action="switch"]');
  if (!tabButton || !documentTabsEl.contains(tabButton)) return;

  switchToDocument(tabButton.dataset.documentId);
});

documentTabsResizerEl.addEventListener('pointerdown', startTabSidebarResize);
documentTabsResizerEl.addEventListener('keydown', resizeTabSidebarFromKeyboard);

themeSelect.addEventListener('change', () => {
  state.themePreference = themeSelect.value;
  localStorage.setItem('theme', state.themePreference);
  render();
});

systemColorScheme.addEventListener('change', () => {
  if (state.themePreference === 'system') render();
});

document.querySelector('#zoom-out').addEventListener('click', zoomOut);
document.querySelector('#zoom-in').addEventListener('click', zoomIn);
document.querySelector('#zoom-reset').addEventListener('click', resetZoom);

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  searchNext();
});

searchInput.addEventListener('input', () => {
  resetSearchState();
});

previewEl.addEventListener('click', (event) => {
  void openLinkedMarkdownDocument(event);
});

window.markdownReader.onFileOpen(openFiles);
window.markdownReader.onFileChange(updateFile);
window.markdownReader.onZoomIn(zoomIn);
window.markdownReader.onZoomOut(zoomOut);
window.markdownReader.onZoomReset(resetZoom);
window.markdownReader.onSearchFocus(focusSearch);
window.markdownReader.onNextDocument(switchToNextDocument);
window.markdownReader.onPreviousDocument(() => switchToNextDocument(-1));
window.markdownReader.onCloseDocument(closeActiveDocument);
void window.markdownReader.ready();

window.addEventListener('keydown', (event) => {
  if (!event.metaKey && !event.ctrlKey) return;

  if (!event.shiftKey && !event.altKey && event.key.toLowerCase() === 'w') {
    event.preventDefault();
    closeActiveDocument();
    return;
  }

  if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    focusSearch();
  }

  if (event.code === 'Backquote' || event.key === '`' || event.key === '~') {
    event.preventDefault();
    switchToNextDocument(event.shiftKey ? -1 : 1);
  }

  if (event.shiftKey && (event.code === 'BracketRight' || event.key === ']' || event.key === '}')) {
    event.preventDefault();
    switchToNextDocument(1);
  }

  if (event.shiftKey && (event.code === 'BracketLeft' || event.key === '[' || event.key === '{')) {
    event.preventDefault();
    switchToNextDocument(-1);
  }

  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomIn();
  }

  if (event.key === '-') {
    event.preventDefault();
    zoomOut();
  }

  if (event.key === '0') {
    event.preventDefault();
    resetZoom();
  }
});

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

  const droppedFiles = [...event.dataTransfer.files].filter((candidate) =>
    /\.(md|markdown|mdown|mkd)$/i.test(candidate.name)
  );

  if (droppedFiles.length === 0) return;

  openFiles(
    await Promise.all(
      droppedFiles.map(async (file) => ({
        name: file.name,
        path: window.markdownReader.getPathForFile(file) || file.path || '',
        content: await file.text()
      }))
    )
  );
});

window.addEventListener('resize', () => {
  setTabSidebarWidth(state.tabSidebarWidth, { persist: false });
});

function openFiles(files) {
  const documents = (Array.isArray(files) ? files : [files]).map(normalizeDocument).filter(Boolean);
  if (documents.length === 0) return;

  watchDocumentPaths(documents);

  for (const openDocument of documents) {
    const existingIndex = openDocument.path
      ? state.documents.findIndex((candidate) => candidate.path === openDocument.path)
      : -1;

    if (existingIndex === -1) {
      state.documents.push(openDocument);
      state.activeDocumentId = openDocument.id;
    } else {
      const existingDocument = state.documents[existingIndex];
      state.documents[existingIndex] = { ...openDocument, id: existingDocument.id };
      state.activeDocumentId = existingDocument.id;
    }
  }

  resetSearchState();
  searchInput.value = '';
  render();
  scrollPreviewToTop();
}

function updateFile(file) {
  const updatedDocument = normalizeDocument(file);
  if (!updatedDocument?.path) return;

  const existingIndex = state.documents.findIndex(
    (candidate) => candidate.path === updatedDocument.path
  );
  if (existingIndex === -1) return;

  const existingDocument = state.documents[existingIndex];
  state.documents[existingIndex] = { ...updatedDocument, id: existingDocument.id };

  if (existingDocument.id === state.activeDocumentId) {
    render();
  }
}

function watchDocumentPaths(documents) {
  const paths = documents.map((document) => document.path).filter(Boolean);
  if (paths.length > 0) {
    void window.markdownReader.watchFiles(paths);
  }
}

function normalizeDocument(file) {
  if (!file || typeof file.content !== 'string') return null;

  const name = file.name || file.path?.split(/[\\/]/).pop() || 'Untitled Preview';

  return {
    id: file.path || `untitled-${nextDocumentId++}`,
    name,
    path: file.path || '',
    content: file.content
  };
}

function switchToDocument(documentId) {
  if (!state.documents.some((document) => document.id === documentId)) return;

  state.activeDocumentId = documentId;
  resetSearchState();
  searchInput.value = '';
  render();
  scrollPreviewToTop();
}

function switchToNextDocument(direction = 1) {
  if (state.documents.length < 2) return;

  const activeIndex = Math.max(
    0,
    state.documents.findIndex((document) => document.id === state.activeDocumentId)
  );
  const nextIndex =
    (activeIndex + direction + state.documents.length) % state.documents.length;

  switchToDocument(state.documents[nextIndex].id);
}

function closeActiveDocument() {
  closeDocument(state.activeDocumentId);
}

function closeDocument(documentId) {
  const activeIndex = state.documents.findIndex(
    (document) => document.id === documentId
  );
  if (activeIndex === -1) return;

  const isClosingActiveDocument = documentId === state.activeDocumentId;
  state.documents.splice(activeIndex, 1);

  if (isClosingActiveDocument) {
    state.activeDocumentId =
      state.documents[Math.min(activeIndex, state.documents.length - 1)]?.id || '';

    resetSearchState();
    searchInput.value = '';
    render();
    scrollPreviewToTop();
    return;
  }

  renderDocumentTabs();
}

function getActiveDocument() {
  return state.documents.find((document) => document.id === state.activeDocumentId) || null;
}

async function openLinkedMarkdownDocument(event) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const link = event.target.closest('a[href]');
  if (!link || !previewEl.contains(link)) return;

  const href = link.getAttribute('href');
  if (!isLocalMarkdownLink(href)) return;

  event.preventDefault();

  const files = await window.markdownReader.openLinkedMarkdown(
    href,
    getActiveDocument()?.path || ''
  );

  if (files?.length) openFiles(files);
}

function isLocalMarkdownLink(href) {
  if (!href) return false;

  const protocol = href.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  if (protocol && protocol !== 'file') return false;

  return MARKDOWN_LINK_PATTERN.test(stripLinkFragmentAndQuery(href));
}

function stripLinkFragmentAndQuery(href) {
  return href.split('#')[0].split('?')[0];
}

function normalizeCodeLanguage(language) {
  return (language || '').match(/^\S*/)?.[0]?.toLowerCase() || '';
}

function renderHighlightedCode(code, language) {
  const highlightedCode = language && hljs.getLanguage(language)
    ? hljs.highlight(code, { language }).value
    : escapeHtml(code);
  const languageClass = language ? ` language-${escapeHtml(language)}` : '';

  return `<pre><code class="hljs${languageClass}">${highlightedCode}</code></pre>\n`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function zoomIn() {
  setZoomLevel(getZoomLevelIndex(state.zoom) + 1);
}

function zoomOut() {
  setZoomLevel(getZoomLevelIndex(state.zoom) - 1);
}

function resetZoom() {
  setZoom(1);
}

function setZoom(value) {
  state.zoom = getNearestZoomLevel(value);
  localStorage.setItem('zoom', String(state.zoom));
  renderZoom();
}

function setZoomLevel(index) {
  const nextIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index));
  setZoom(ZOOM_LEVELS[nextIndex]);
}

function getZoomLevelIndex(value) {
  return ZOOM_LEVELS.indexOf(getNearestZoomLevel(value));
}

function getNearestZoomLevel(value) {
  const zoom = Number.isFinite(value) ? value : 1;

  return ZOOM_LEVELS.reduce((nearest, level) =>
    Math.abs(level - zoom) < Math.abs(nearest - zoom) ? level : nearest
  );
}

function render() {
  resetSearchState();

  const currentRenderGeneration = ++renderGeneration;
  const activeTheme = resolveTheme(state.themePreference);
  const activeDocument = getActiveDocument();
  document.documentElement.dataset.theme = activeTheme.id;
  document.documentElement.dataset.mode = activeTheme.mode;

  fileNameEl.textContent = activeDocument?.name || 'Untitled Preview';
  filePathEl.textContent = activeDocument?.path || 'Open or drop a Markdown file';
  themeSelect.value = state.themePreference;
  renderDocumentTabs();

  const html = renderMarkdownDocument(activeDocument?.content || sampleMarkdown());
  previewEl.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'data-mermaid-diagram', 'role', 'aria-label']
  });

  for (const link of previewEl.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    if (/^https?:\/\//i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  }

  renderZoom();
  void renderMermaidDiagrams(activeTheme, currentRenderGeneration);
}

function renderMarkdownDocument(markdown) {
  const { frontMatter, body } = extractFrontMatter(markdown);
  const bodyHtml = marked.parse(body);

  if (!frontMatter?.entries.length) return bodyHtml;

  return `${renderFrontMatter(frontMatter)}\n${bodyHtml}`;
}

function extractFrontMatter(markdown) {
  const source = String(markdown || '').replace(/^\uFEFF/, '');
  const lines = source.split(/\r\n|\n|\r/);

  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
    return { frontMatter: null, body: source };
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONT_MATTER_DELIMITER
  );

  if (closingIndex === -1) {
    return { frontMatter: null, body: source };
  }

  return {
    frontMatter: parseFrontMatter(lines.slice(1, closingIndex)),
    body: lines.slice(closingIndex + 1).join('\n').replace(/^\n+/, '')
  };
}

function parseFrontMatter(lines) {
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;

    const value = line.slice(separatorIndex + 1).trim();
    const parsedValue = parseFrontMatterValue(value);

    entries.push({
      key,
      label: formatFrontMatterLabel(key),
      value,
      values: parsedValue.values,
      isList: parsedValue.isList
    });
  }

  return { entries };
}

function parseFrontMatterValue(value) {
  const trimmed = value.trim();

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const values = splitInlineFrontMatterList(trimmed.slice(1, -1))
      .map(normalizeFrontMatterScalar)
      .filter(Boolean);

    return { values: values.length > 0 ? values : [''], isList: true };
  }

  return { values: [normalizeFrontMatterScalar(trimmed)], isList: false };
}

function splitInlineFrontMatterList(value) {
  const parts = [];
  let current = '';
  let quote = '';
  let escaping = false;

  for (const character of value) {
    if (quote) {
      current += character;

      if (escaping) {
        escaping = false;
        continue;
      }

      if (character === '\\') {
        escaping = true;
        continue;
      }

      if (character === quote) quote = '';
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }

    if (character === ',') {
      parts.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  parts.push(current);
  return parts;
}

function normalizeFrontMatterScalar(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if (
    trimmed.length >= 2 &&
    (quote === '"' || quote === "'") &&
    trimmed[trimmed.length - 1] === quote
  ) {
    return trimmed.slice(1, -1).replaceAll(`\\${quote}`, quote);
  }

  return trimmed;
}

function formatFrontMatterLabel(key) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderFrontMatter(frontMatter) {
  const titleIndex = frontMatter.entries.findIndex(
    (entry) => entry.key.toLowerCase() === 'title'
  );
  const titleEntry = titleIndex === -1 ? null : frontMatter.entries[titleIndex];
  const detailEntries = frontMatter.entries.filter((_, index) => index !== titleIndex);
  const title = titleEntry?.values[0] || titleEntry?.value || '';
  const parts = ['<section class="front-matter" aria-label="Document metadata">'];

  if (title) {
    parts.push(`<div class="front-matter-title">${escapeHtml(title)}</div>`);
  }

  if (detailEntries.length > 0) {
    parts.push('<dl class="front-matter-grid">');
    for (const entry of detailEntries) {
      parts.push(renderFrontMatterEntry(entry));
    }
    parts.push('</dl>');
  }

  parts.push('</section>');
  return parts.join('');
}

function renderFrontMatterEntry(entry) {
  return [
    '<div class="front-matter-row">',
    `<dt>${escapeHtml(entry.label)}</dt>`,
    `<dd>${renderFrontMatterValue(entry)}</dd>`,
    '</div>'
  ].join('');
}

function renderFrontMatterValue(entry) {
  if (entry.isList || entry.values.length > 1) {
    return [
      '<span class="front-matter-list">',
      ...entry.values.map((value) => `<span class="front-matter-chip">${escapeHtml(value)}</span>`),
      '</span>'
    ].join('');
  }

  const value = entry.values[0] || entry.value;
  return value ? escapeHtml(value) : '<span class="front-matter-empty">empty</span>';
}

async function renderMermaidDiagrams(activeTheme, currentRenderGeneration) {
  const diagrams = [...previewEl.querySelectorAll('[data-mermaid-diagram]')];
  if (diagrams.length === 0) return;

  let mermaid;
  try {
    mermaid = await getMermaid();
  } catch (error) {
    if (currentRenderGeneration !== renderGeneration) return;
    for (const diagram of diagrams) {
      if (diagram.isConnected) renderMermaidError(diagram);
    }
    return;
  }

  if (currentRenderGeneration !== renderGeneration) return;
  configureMermaid(mermaid, activeTheme);

  for (const [index, diagram] of diagrams.entries()) {
    const source = diagram.querySelector('.mermaid-source code')?.textContent?.trim();
    if (!source) continue;

    try {
      const { svg } = await mermaid.render(
        `mermaid-${currentRenderGeneration}-${index}`,
        source,
        diagram
      );

      if (currentRenderGeneration !== renderGeneration || !diagram.isConnected) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-svg';
      wrapper.innerHTML = sanitizeMermaidSvg(svg);
      diagram.replaceChildren(wrapper);
    } catch (error) {
      if (currentRenderGeneration !== renderGeneration || !diagram.isConnected) return;
      renderMermaidError(diagram);
    }
  }
}

function getMermaid() {
  mermaidModulePromise ||= import('mermaid').then((module) => module.default);
  return mermaidModulePromise;
}

function configureMermaid(mermaid, activeTheme) {
  const styles = getComputedStyle(document.documentElement);
  const cssValue = (name) => styles.getPropertyValue(name).trim();

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    theme: activeTheme.mode === 'dark' ? 'dark' : 'default',
    flowchart: {
      htmlLabels: false
    },
    themeVariables: {
      background: cssValue('--preview-bg'),
      primaryColor: cssValue('--preview-code-bg'),
      primaryTextColor: cssValue('--preview-fg'),
      primaryBorderColor: cssValue('--preview-border'),
      lineColor: cssValue('--preview-muted'),
      tertiaryColor: cssValue('--preview-bg'),
      fontFamily: styles.fontFamily
    }
  });
}

function sanitizeMermaidSvg(svg) {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['style'],
    ADD_ATTR: ['aria-roledescription', 'role', 'viewBox', 'xmlns']
  });
}

function renderMermaidError(diagram) {
  const source = diagram.querySelector('.mermaid-source code')?.textContent || '';

  diagram.classList.add('is-error');

  const message = document.createElement('div');
  message.className = 'mermaid-error';
  message.textContent = MERMAID_RENDER_ERROR_MESSAGE;

  const sourceEl = document.createElement('pre');
  sourceEl.className = 'mermaid-source';

  const codeEl = document.createElement('code');
  codeEl.className = 'hljs language-mermaid';
  codeEl.textContent = source;
  sourceEl.append(codeEl);

  diagram.replaceChildren(message, sourceEl);
}

function renderDocumentTabs() {
  documentTabsEl.hidden = state.documents.length < 2;
  documentTabsEl.replaceChildren(
    ...state.documents.map((openDocument) => {
      const isActive = openDocument.id === state.activeDocumentId;
      const tab = document.createElement('div');
      tab.className = 'document-tab';
      tab.classList.toggle('is-active', isActive);

      const tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.className = 'document-tab-label';
      tabButton.dataset.documentAction = 'switch';
      tabButton.dataset.documentId = openDocument.id;
      tabButton.textContent = openDocument.name;
      tabButton.title = openDocument.path || openDocument.name;
      tabButton.setAttribute('aria-selected', String(isActive));
      tabButton.setAttribute('role', 'tab');

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'document-tab-close';
      closeButton.dataset.documentAction = 'close';
      closeButton.dataset.documentId = openDocument.id;
      closeButton.textContent = '×';
      closeButton.title = `Close ${openDocument.name}`;
      closeButton.setAttribute('aria-label', `Close ${openDocument.name}`);

      tab.append(tabButton, closeButton);
      return tab;
    })
  );
}

function startTabSidebarResize(event) {
  if (event.button !== 0 || documentTabsEl.hidden) return;

  event.preventDefault();
  document.body.classList.add('is-resizing-tabs');
  documentTabsResizerEl.setPointerCapture(event.pointerId);

  const resize = (moveEvent) => {
    resizeTabSidebarToClientX(moveEvent.clientX);
  };

  const stopResize = () => {
    document.body.classList.remove('is-resizing-tabs');
    documentTabsResizerEl.removeEventListener('pointermove', resize);
    documentTabsResizerEl.removeEventListener('pointerup', stopResize);
    documentTabsResizerEl.removeEventListener('pointercancel', stopResize);

    if (documentTabsResizerEl.hasPointerCapture(event.pointerId)) {
      documentTabsResizerEl.releasePointerCapture(event.pointerId);
    }
  };

  documentTabsResizerEl.addEventListener('pointermove', resize);
  documentTabsResizerEl.addEventListener('pointerup', stopResize);
  documentTabsResizerEl.addEventListener('pointercancel', stopResize);
  resizeTabSidebarToClientX(event.clientX);
}

function resizeTabSidebarFromKeyboard(event) {
  if (documentTabsEl.hidden) return;

  const step = event.shiftKey ? 40 : 16;
  const maxWidth = getTabSidebarMaxWidth();
  let nextWidth = null;

  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    nextWidth = state.tabSidebarWidth - step;
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    nextWidth = state.tabSidebarWidth + step;
  } else if (event.key === 'Home') {
    nextWidth = TAB_SIDEBAR_MIN_WIDTH;
  } else if (event.key === 'End') {
    nextWidth = maxWidth;
  }

  if (nextWidth === null) return;

  event.preventDefault();
  setTabSidebarWidth(nextWidth);
}

function resizeTabSidebarToClientX(clientX) {
  const workspaceRect = workspaceEl.getBoundingClientRect();
  setTabSidebarWidth(clientX - workspaceRect.left);
}

function setTabSidebarWidth(width, options = {}) {
  const desiredWidth = Number.isFinite(width) ? width : 220;
  const maxWidth = getTabSidebarMaxWidth();
  const appliedWidth = Math.round(
    Math.min(maxWidth, Math.max(TAB_SIDEBAR_MIN_WIDTH, desiredWidth))
  );

  state.tabSidebarWidth = desiredWidth;
  workspaceEl.style.setProperty('--tabs-width', `${appliedWidth}px`);
  documentTabsResizerEl.setAttribute('aria-valuemin', String(TAB_SIDEBAR_MIN_WIDTH));
  documentTabsResizerEl.setAttribute('aria-valuemax', String(maxWidth));
  documentTabsResizerEl.setAttribute('aria-valuenow', String(appliedWidth));

  if (options.persist !== false) {
    localStorage.setItem('tabSidebarWidth', String(appliedWidth));
  }
}

function getTabSidebarMaxWidth() {
  const workspaceWidth = workspaceEl?.clientWidth || window.innerWidth || 0;

  if (workspaceWidth <= 0) return TAB_SIDEBAR_MAX_WIDTH;

  return Math.min(
    TAB_SIDEBAR_MAX_WIDTH,
    Math.max(TAB_SIDEBAR_MIN_WIDTH, workspaceWidth - PREVIEW_MIN_WIDTH)
  );
}

function focusSearch() {
  searchInput.focus();
  searchInput.select();
}

function searchNext() {
  const query = searchInput.value;

  if (!query) {
    resetSearchState();
    return;
  }

  if (state.searchQuery !== query || state.searchMatches.length === 0) {
    state.searchQuery = query;
    state.searchMatches = collectSearchMatches(query);
    state.activeSearchIndex = -1;
    renderSearchHighlights();
  }

  if (state.searchMatches.length === 0 || state.activeSearchIndex >= state.searchMatches.length - 1) {
    window.alert('no more entries');
    return;
  }

  state.activeSearchIndex += 1;
  renderSearchHighlights();
  scrollActiveSearchMatchIntoView();
}

function collectSearchMatches(query) {
  const textNodes = [];
  const walker = document.createTreeWalker(previewEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  let text = '';
  let currentNode = walker.nextNode();

  while (currentNode) {
    const start = text.length;
    text += currentNode.nodeValue;
    textNodes.push({
      node: currentNode,
      start,
      end: text.length
    });
    currentNode = walker.nextNode();
  }

  const ranges = [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let index = haystack.indexOf(needle);

  while (index !== -1) {
    const start = getTextPoint(textNodes, index);
    const end = getTextPoint(textNodes, index + query.length);

    if (start && end) {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
    }

    index = haystack.indexOf(needle, index + needle.length);
  }

  return ranges;
}

function getTextPoint(textNodes, offset) {
  for (const textNode of textNodes) {
    if (offset >= textNode.start && offset <= textNode.end) {
      return {
        node: textNode.node,
        offset: offset - textNode.start
      };
    }
  }

  const lastNode = textNodes.at(-1);
  if (!lastNode) return null;

  return {
    node: lastNode.node,
    offset: lastNode.end - lastNode.start
  };
}

function renderSearchHighlights() {
  if (!window.CSS?.highlights || !window.Highlight) return;

  window.CSS.highlights.delete('search-result');
  window.CSS.highlights.delete('active-search-result');

  if (state.searchMatches.length > 0) {
    window.CSS.highlights.set('search-result', new Highlight(...state.searchMatches));
  }

  const activeMatch = state.searchMatches[state.activeSearchIndex];
  if (activeMatch) {
    window.CSS.highlights.set('active-search-result', new Highlight(activeMatch));
  }
}

function scrollActiveSearchMatchIntoView() {
  const activeMatch = state.searchMatches[state.activeSearchIndex];
  const matchRect = activeMatch?.getBoundingClientRect();

  if (!activeMatch || !matchRect || !viewerFrameEl) return;

  const viewerRect = viewerFrameEl.getBoundingClientRect();
  viewerFrameEl.scrollBy({
    top: matchRect.top - viewerRect.top - viewerFrameEl.clientHeight / 2 + matchRect.height / 2,
    left: matchRect.left - viewerRect.left - viewerFrameEl.clientWidth / 2 + matchRect.width / 2,
    behavior: 'smooth'
  });
}

function scrollPreviewToTop() {
  viewerFrameEl?.scrollTo({ top: 0, left: 0 });
}

function resetSearchState() {
  state.searchQuery = '';
  state.searchMatches = [];
  state.activeSearchIndex = -1;

  if (window.CSS?.highlights) {
    window.CSS.highlights.delete('search-result');
    window.CSS.highlights.delete('active-search-result');
  }
}

function resolveTheme(themePreference) {
  if (themePreference === 'system') {
    return systemColorScheme.matches
      ? { id: 'github-dark', mode: 'dark' }
      : { id: 'github-light', mode: 'light' };
  }

  return themes.find((theme) => theme.id === themePreference) || themes[1];
}

function renderZoom() {
  previewEl.style.zoom = state.zoom;
  previewEl.style.setProperty('--content-width', `${Math.round(BASE_CONTENT_WIDTH * state.zoom)}px`);
  zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

function sampleMarkdown() {
  return `# Markdown Reader

Open a Markdown file with **Command+O** or drop one into this window.

## Features

- GitHub-flavored Markdown
- Multiple open files with Command+Shift+[ and Command+Shift+] switching
- Light and dark themes
- Syntax highlighting
- Mermaid diagrams
- Browser-style zoom for text, tables, and images

\`\`\`js
const message = 'Markdown rendering is ready.';
console.log(message);
\`\`\`

> The Quick Look extension has been intentionally removed from this phase.
`;
}

render();

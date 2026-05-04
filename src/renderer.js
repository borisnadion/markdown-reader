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
  searchQuery: '',
  searchMatches: [],
  activeSearchIndex: -1
};

const BASE_CONTENT_WIDTH = 900;

let nextDocumentId = 1;

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
    <nav class="document-tabs" id="document-tabs" aria-label="Open documents"></nav>
    <section class="drop-overlay" id="drop-overlay">Drop Markdown files to open</section>
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
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const documentTabsEl = document.querySelector('#document-tabs');

themeSelect.innerHTML = themes
  .map((theme) => `<option value="${theme.id}">${theme.label}</option>`)
  .join('');

themeSelect.value = state.themePreference;

document.querySelector('#open-file').addEventListener('click', async () => {
  const files = await window.markdownReader.openMarkdown();
  if (files?.length) openFiles(files);
});

documentTabsEl.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-document-id]');
  if (!tab) return;

  switchToDocument(tab.dataset.documentId);
});

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

window.markdownReader.onFileOpen(openFiles);
window.markdownReader.onZoomIn(zoomIn);
window.markdownReader.onZoomOut(zoomOut);
window.markdownReader.onZoomReset(resetZoom);
window.markdownReader.onSearchFocus(focusSearch);
window.markdownReader.onNextDocument(switchToNextDocument);
window.markdownReader.onPreviousDocument(() => switchToNextDocument(-1));

window.addEventListener('keydown', (event) => {
  if (!event.metaKey && !event.ctrlKey) return;

  if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    focusSearch();
  }

  if (event.code === 'Backquote' || event.key === '`' || event.key === '~') {
    event.preventDefault();
    switchToNextDocument(event.shiftKey ? -1 : 1);
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
        path: file.path || '',
        content: await file.text()
      }))
    )
  );
});

function openFiles(files) {
  const documents = (Array.isArray(files) ? files : [files]).map(normalizeDocument).filter(Boolean);
  if (documents.length === 0) return;

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

function getActiveDocument() {
  return state.documents.find((document) => document.id === state.activeDocumentId) || null;
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
  resetSearchState();

  const activeTheme = resolveTheme(state.themePreference);
  const activeDocument = getActiveDocument();
  document.documentElement.dataset.theme = activeTheme.id;
  document.documentElement.dataset.mode = activeTheme.mode;

  fileNameEl.textContent = activeDocument?.name || 'Untitled Preview';
  filePathEl.textContent = activeDocument?.path || 'Open or drop a Markdown file';
  themeSelect.value = state.themePreference;
  renderDocumentTabs();

  const html = marked.parse(activeDocument?.content || sampleMarkdown());
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

function renderDocumentTabs() {
  documentTabsEl.hidden = state.documents.length === 0;
  documentTabsEl.replaceChildren(
    ...state.documents.map((openDocument) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'document-tab';
      tab.dataset.documentId = openDocument.id;
      tab.textContent = openDocument.name;
      tab.title = openDocument.path || openDocument.name;
      tab.setAttribute('aria-selected', String(openDocument.id === state.activeDocumentId));
      return tab;
    })
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
  const viewerFrame = document.querySelector('.viewer-frame');

  if (!activeMatch || !matchRect || !viewerFrame) return;

  const viewerRect = viewerFrame.getBoundingClientRect();
  viewerFrame.scrollBy({
    top: matchRect.top - viewerRect.top - viewerFrame.clientHeight / 2 + matchRect.height / 2,
    left: matchRect.left - viewerRect.left - viewerFrame.clientWidth / 2 + matchRect.width / 2,
    behavior: 'smooth'
  });
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
  previewEl.style.setProperty('--content-width', `${BASE_CONTENT_WIDTH * state.zoom}px`);
  zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

function sampleMarkdown() {
  return `# Markdown Reader

Open a Markdown file with **Command+O** or drop one into this window.

## Features

- GitHub-flavored Markdown
- Multiple open files with Command+\` switching
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

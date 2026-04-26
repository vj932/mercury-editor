import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { FileAttachment } from './file-attachment.js';
import { openDrawingTool } from './drawing-tool.js';
import { Drawing } from './drawing-node.js';

// ============================================================
// Color inversion helpers (must be before DarkAwareColor)
// ============================================================
function invertColor(colorStr) {
  const m = colorStr.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
  if (m) {
    return `rgb(${255 - parseInt(m[1])}, ${255 - parseInt(m[2])}, ${255 - parseInt(m[3])})`;
  }
  const h = colorStr.match(/#([0-9a-fA-F]{6})/);
  if (h) {
    const r = parseInt(h[1].slice(0, 2), 16);
    const g = parseInt(h[1].slice(2, 4), 16);
    const b = parseInt(h[1].slice(4, 6), 16);
    return `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
  }
  return colorStr;
}

function invertColorHex(colorStr) {
  const m = colorStr.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
  let r, g, b;
  if (m) {
    r = 255 - parseInt(m[1]); g = 255 - parseInt(m[2]); b = 255 - parseInt(m[3]);
  } else {
    const h = colorStr.match(/#([0-9a-fA-F]{6})/);
    if (h) {
      r = 255 - parseInt(h[1].slice(0, 2), 16);
      g = 255 - parseInt(h[1].slice(2, 4), 16);
      b = 255 - parseInt(h[1].slice(4, 6), 16);
    } else { return colorStr; }
  }
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Override Color extension to embed inverted color as CSS custom property
const DarkAwareColor = Color.extend({
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        color: {
          default: null,
          parseHTML: element => element.style.color?.replace(/['"]+/g, '') || null,
          renderHTML: attributes => {
            if (!attributes.color) return {};
            const inv = invertColor(attributes.color);
            return { style: `color: ${attributes.color}; --inv-color: ${inv}` };
          },
        },
      },
    }];
  },
});
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { InlineMath, DisplayMath, MathInputPlugin } from './math-extension.js';
import { FontSize } from './font-size.js';
import { LineHeight } from './line-height.js';
import { Extension } from '@tiptap/core';

const MathInput = Extension.create({
  name: 'mathInput',
  addProseMirrorPlugins() {
    return [MathInputPlugin];
  },
});

const TabIndent = Extension.create({
  name: 'tabIndent',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        this.editor.commands.insertContent('\t');
        return true;
      },
      'Shift-Tab': () => {
        // Remove a tab before the cursor if present
        const { state } = this.editor;
        const { from } = state.selection;
        const textBefore = state.doc.textBetween(Math.max(0, from - 1), from, '\ufffc');
        if (textBefore === '\t') {
          this.editor.commands.command(({ tr }) => {
            tr.delete(from - 1, from);
            return true;
          });
        }
        return true;
      },
    };
  },
});

// ============================================================
// Tab State
// ============================================================
let tabs = [];
let activeTabId = null;
let nextTabId = 1;

function createTabState(title = 'Untitled') {
  return {
    id: nextTabId++,
    title,
    filePath: null, // .mathdoc path (null = unsaved)
    content: '',
    editor: null,
  };
}

function createEditor(container, content = '') {
  const el = document.createElement('div');
  el.className = 'editor-instance';
  container.appendChild(el);

  const editor = new Editor({
    element: el,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      TextStyle,
      DarkAwareColor,
      FontFamily,
      FontSize,
      LineHeight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: '' }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      InlineMath,
      DisplayMath,
      MathInput,
      TabIndent,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: true, autolink: true }),
      FileAttachment,
      Drawing,
    ],
    content,
    autofocus: true,
  });

  return { editor, element: el };
}

// ============================================================
// Tab Bar
// ============================================================
let tabBarVisible = true;

function toggleTabBar() {
  tabBarVisible = !tabBarVisible;
  document.getElementById('tab-bar').classList.toggle('hidden', !tabBarVisible);
  document.getElementById('tab-dropdown-btn').classList.toggle('hidden', tabBarVisible);
  renderTabs();
}

function renderTabs() {
  const tabBar = document.getElementById('tab-bar');
  tabBar.innerHTML = '';

  tabs.forEach((tab) => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.title;
    tabEl.appendChild(titleSpan);

    if (tabs.length > 1) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });
      tabEl.appendChild(closeBtn);
    }

    tabEl.addEventListener('click', () => switchTab(tab.id));
    tabBar.appendChild(tabEl);
  });

  const newTabBtn = document.createElement('div');
  newTabBtn.className = 'tab new-tab';
  newTabBtn.textContent = '+';
  newTabBtn.addEventListener('click', () => addTab());
  tabBar.appendChild(newTabBtn);

  // Update collapsed dropdown button label
  const dropBtn = document.getElementById('tab-dropdown-btn');
  if (dropBtn) {
    const activeTab = getActiveTab();
    dropBtn.querySelector('.tab-dropdown-title').textContent = activeTab?.title || 'Untitled';
  }
}

function setupTabDropdown() {
  const btn = document.getElementById('tab-dropdown-btn');
  const list = document.getElementById('tab-dropdown-list');
  if (!btn || !list) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = list.classList.contains('open');
    list.innerHTML = '';

    if (!isOpen) {
      tabs.forEach((tab) => {
        const item = document.createElement('div');
        item.className = `tab-dropdown-item ${tab.id === activeTabId ? 'active' : ''}`;
        item.textContent = tab.title;
        item.addEventListener('click', () => {
          switchTab(tab.id);
          list.classList.remove('open');
        });
        list.appendChild(item);
      });

      const newItem = document.createElement('div');
      newItem.className = 'tab-dropdown-item new';
      newItem.textContent = '+ New Tab';
      newItem.addEventListener('click', () => { addTab(); list.classList.remove('open'); });
      list.appendChild(newItem);

      list.classList.add('open');

      // Close on outside click
      setTimeout(() => {
        document.addEventListener('click', function close() {
          list.classList.remove('open');
          document.removeEventListener('click', close);
        });
      }, 0);
    } else {
      list.classList.remove('open');
    }
  });
}

function switchTab(id) {
  const current = tabs.find((t) => t.id === activeTabId);
  if (current?.editor) {
    current.content = current.editor.getHTML();
    current.editor.destroy();
    current.editor = null;
  }

  activeTabId = id;
  const tab = tabs.find((t) => t.id === id);
  const container = document.getElementById('editor-container');
  container.innerHTML = '';

  const { editor } = createEditor(container, tab.content);
  tab.editor = editor;
  renderTabs();
  setupFormatBar(editor);
}

function addTab(title = 'Untitled', content = '', filePath = null) {
  const tab = createTabState(title);
  tab.content = content;
  tab.filePath = filePath;
  tabs.push(tab);
  switchTab(tab.id);
  return tab;
}

function closeTab(id) {
  if (tabs.length <= 1) return;
  const idx = tabs.findIndex((t) => t.id === id);
  const tab = tabs[idx];
  if (tab.editor) tab.editor.destroy();
  tabs.splice(idx, 1);
  if (activeTabId === id) {
    switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    renderTabs();
  }
}

function getActiveEditor() {
  return tabs.find((t) => t.id === activeTabId)?.editor || null;
}

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

// ============================================================
// Global typing color
// ============================================================
let _globalTypingColor = null; // light-mode color; null = use default

/**
 * Sync the color picker input with the current text color at cursor/selection.
 * In dark mode, shows the inverted (display) color.
 */
function syncColorPicker() {
  const editor = getActiveEditor();
  const pickerEl = document.getElementById('bubble-color');
  if (!editor || !pickerEl) return;
  const stored = editor.getAttributes('textStyle').color || _globalTypingColor || '#000000';
  pickerEl.value = isDarkMode() ? invertColorHex(stored) : (stored.startsWith('#') ? stored : invertColorHex(invertColorHex(stored)));
}

// ============================================================
// Format Bar (persistent top toolbar)
// ============================================================
let formatBarEl = null;

function setupFormatBar(editor) {
  if (!formatBarEl) formatBarEl = document.getElementById('format-bar');
  editor.on('selectionUpdate', () => syncFormatBar(editor));
  editor.on('transaction', () => syncFormatBar(editor));
}

function syncFormatBar(editor) {
  if (!formatBarEl) return;

  // Sync bold/italic/underline active state
  formatBarEl.querySelectorAll('[data-command]').forEach((btn) => {
    const cmd = btn.dataset.command;
    if (cmd === 'bold') btn.classList.toggle('active', editor.isActive('bold'));
    if (cmd === 'italic') btn.classList.toggle('active', editor.isActive('italic'));
    if (cmd === 'underline') btn.classList.toggle('active', editor.isActive('underline'));
  });

  // Sync font size — show default (11px) when no explicit size is set
  const sizeEl = document.getElementById('bubble-font-size');
  if (sizeEl) {
    const curSize = editor.getAttributes('textStyle').fontSize || '11px';
    const match = Array.from(sizeEl.options).find(o => o.value === curSize);
    sizeEl.value = match ? curSize : '11px';
  }

  // Sync font family — show default (KaTeX_Main) when no explicit font is set
  const fontEl = document.getElementById('bubble-font-family');
  if (fontEl) {
    const curFont = editor.getAttributes('textStyle').fontFamily || 'KaTeX_Main';
    const match = Array.from(fontEl.options).find(o => o.value === curFont);
    fontEl.value = match ? curFont : 'KaTeX_Main';
  }

  // Sync color picker
  syncColorPicker();

  // Sync math mode button
  const mathBtn = document.getElementById('math-mode-btn');
  if (mathBtn) mathBtn.classList.toggle('active', _mathMode);
}

// ============================================================
// Math Mode State
// ============================================================
// When math mode is on, behaves like an unclosed $ — MathInputPlugin
// suppresses all auto-rendering. Toggling off (⌘E/⌃E again) grabs the
// text from start position to cursor, wraps it as inline math, and renders.
let _mathMode = false;
let _mathModeStartPos = null;
// Expose globally so MathInputPlugin can check it
window.__mercuryMathMode = false;

function toggleMathMode() {
  const editor = getActiveEditor();
  if (!editor) return;

  if (!_mathMode) {
    // Turning ON — record cursor position
    _mathMode = true;
    window.__mercuryMathMode = true;
    _mathModeStartPos = editor.state.selection.from;
  } else {
    // Turning OFF — render whatever was typed as inline math
    exitMathMode(true);
  }

  // Sync button state
  const mathBtn = document.getElementById('math-mode-btn');
  if (mathBtn) mathBtn.classList.toggle('active', _mathMode);
}

function exitMathMode(render = true) {
  const editor = getActiveEditor();

  if (render && editor && _mathModeStartPos != null) {
    const { from } = editor.state.selection;
    if (from > _mathModeStartPos) {
      let latex = editor.state.doc.textBetween(_mathModeStartPos, from, '');
      latex = latex.trim();

      if (latex.length > 0) {
        editor.chain()
          .focus()
          .command(({ tr }) => {
            tr.delete(_mathModeStartPos, from);
            return true;
          })
          .insertContentAt(_mathModeStartPos, {
            type: 'inlineMath',
            attrs: { latex },
          })
          .run();
      }
    }
  }

  _mathMode = false;
  window.__mercuryMathMode = false;
  _mathModeStartPos = null;
  // Sync button state
  const mathBtn = document.getElementById('math-mode-btn');
  if (mathBtn) mathBtn.classList.toggle('active', false);
}

function initFormatBarActions() {
  formatBarEl = document.getElementById('format-bar');
  if (!formatBarEl) return;

  // Prevent editor blur on button clicks, but allow selects/inputs to work natively
  formatBarEl.addEventListener('mousedown', (e) => {
    const tag = e.target.tagName;
    if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') {
      e.preventDefault();
    }
  });

  formatBarEl.querySelectorAll('[data-command]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const editor = getActiveEditor();
      if (!editor) return;
      const cmd = btn.dataset.command;
      switch (cmd) {
        case 'bold': editor.chain().focus().toggleBold().run(); break;
        case 'italic': editor.chain().focus().toggleItalic().run(); break;
        case 'underline': editor.chain().focus().toggleUnderline().run(); break;
        case 'highlight': editor.chain().focus().toggleHighlight().run(); break;
        case 'mathMode': toggleMathMode(); break;
      }
    });
  });

  document.getElementById('bubble-font-size')?.addEventListener('change', (e) => {
    const editor = getActiveEditor(); if (!editor) return;
    e.target.value ? editor.chain().focus().setFontSize(e.target.value).run()
      : editor.chain().focus().unsetFontSize().run();
  });

  document.getElementById('bubble-font-family')?.addEventListener('change', (e) => {
    const editor = getActiveEditor(); if (!editor) return;
    e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run()
      : editor.chain().focus().unsetFontFamily().run();
  });

  document.getElementById('bubble-color')?.addEventListener('input', (e) => {
    const editor = getActiveEditor(); if (!editor) return;
    const storeColor = isDarkMode() ? invertColorHex(e.target.value) : e.target.value;
    editor.chain().focus().setColor(storeColor).run();
    _globalTypingColor = storeColor;
  });

  document.getElementById('bubble-line-height')?.addEventListener('change', (e) => {
    const editor = getActiveEditor(); if (!editor) return;
    editor.chain().focus().setLineHeight(e.target.value).run();
  });

  formatBarEl.querySelectorAll('[data-align]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const editor = getActiveEditor(); if (!editor) return;
      editor.chain().focus().setTextAlign(btn.dataset.align).run();
    });
  });
}


// ============================================================
// Save current document (to workspace)
// ============================================================
async function saveCurrentDoc() {
  if (!window.electronAPI) return;
  const tab = getActiveTab();
  const editor = getActiveEditor();
  if (!tab || !editor) return;

  tab.content = editor.getHTML();

  const savedPath = await window.electronAPI.saveDoc({
    filePath: tab.filePath,
    title: tab.title,
    content: tab.content,
  });

  if (savedPath) {
    tab.filePath = savedPath;
  }
}

// ============================================================
// Save As (always shows dialog)
// ============================================================
async function saveCurrentDocAs() {
  if (!window.electronAPI) return;
  const tab = getActiveTab();
  const editor = getActiveEditor();
  if (!tab || !editor) return;

  tab.content = editor.getHTML();

  const savedPath = await window.electronAPI.saveFileAs({
    content: tab.content,
  });

  if (savedPath) {
    tab.filePath = savedPath;
    tab.title = savedPath.split('/').pop().replace(/\.[^.]+$/, '');
    renderTabs();
  }
}

// ============================================================
// Open file from Finder (double-click .merc file)
// ============================================================
async function openFilePath(filePath) {
  if (!window.electronAPI) return;

  // Already open?
  const existing = tabs.find((t) => t.filePath === filePath);
  if (existing) { switchTab(existing.id); return; }

  const doc = await window.electronAPI.readFile(filePath);
  if (doc) {
    addTab(doc.title, doc.content, doc.path);
  }
}

// ============================================================
// Electron IPC from Menu
// ============================================================
function setupIPC() {
  if (!window.electronAPI) return;

  window.electronAPI.onNewTab(() => addTab());
  window.electronAPI.onCloseTab(() => closeTab(activeTabId));

  window.electronAPI.onOpenFile(async () => {
    const result = await window.electronAPI.openFile();
    if (result) {
      addTab(result.title, result.content, result.path);
    }
  });

  window.electronAPI.onSaveFile(async () => {
    await saveCurrentDoc();
  });

  window.electronAPI.onSaveFileAs(async () => {
    await saveCurrentDocAs();
  });

  window.electronAPI.onExportPDF(async () => {
    const editor = getActiveEditor();
    if (editor) editor.commands.blur();

    // Force light mode for export
    const wasDark = document.body.classList.contains('dark-mode');
    document.body.classList.remove('dark-mode');
    document.body.classList.add('printing');

    await new Promise(r => setTimeout(r, 150));
    await window.electronAPI.exportPDF({
      pageSize: _pageLayout.pageSize,
      orientation: _pageLayout.orientation,
      margins: _pageLayout.margins,
    });

    // Restore theme
    document.body.classList.remove('printing');
    if (wasDark) document.body.classList.add('dark-mode');
  });

  window.electronAPI.onExportTex?.(async () => {
    const editor = getActiveEditor();
    if (!editor) return;

    // Walk the ProseMirror document and convert to LaTeX
    function nodeToTex(node) {
      if (node.type.name === 'inlineMath') {
        return `$${node.attrs.latex}$`;
      }
      if (node.type.name === 'displayMath') {
        // Use align/align* environments bare, wrap others in $$
        const latex = node.attrs.latex.trim();
        if (/^\\begin\{(align|equation|gather)/.test(latex)) {
          return `\n${latex}\n`;
        }
        return `\n$$${latex}$$\n`;
      }
      if (node.type.name === 'image') {
        // Images can't be embedded in .tex easily; add a comment
        return `% [Image: ${node.attrs.src?.substring(0, 30) || 'embedded'}...]\n`;
      }
      if (node.type.name === 'drawing') {
        return `% [Drawing: embedded image]\n`;
      }
      if (node.type.name === 'fileAttachment') {
        return `% [Attachment: ${node.attrs.filename}]\n`;
      }
      if (node.type.name === 'text') {
        let text = node.text || '';
        // Apply marks
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type.name === 'bold') text = `\\textbf{${text}}`;
            else if (mark.type.name === 'italic') text = `\\textit{${text}}`;
            else if (mark.type.name === 'underline') text = `\\underline{${text}}`;
            else if (mark.type.name === 'link') text = `\\href{${mark.attrs.href}}{${text}}`;
          }
        }
        return text;
      }
      if (node.type.name === 'hardBreak') return '\\\\\n';

      // Container nodes — recurse
      let result = '';
      const children = [];
      node.forEach((child) => children.push(child));

      if (node.type.name === 'heading') {
        const level = node.attrs.level;
        const cmds = { 1: 'section', 2: 'subsection', 3: 'subsubsection', 4: 'paragraph' };
        const cmd = cmds[level] || 'paragraph';
        const inner = children.map(nodeToTex).join('');
        return `\\${cmd}{${inner}}\n\n`;
      }

      if (node.type.name === 'paragraph') {
        const inner = children.map(nodeToTex).join('');
        return inner + '\n\n';
      }

      if (node.type.name === 'blockquote') {
        const inner = children.map(nodeToTex).join('');
        return `\\begin{quote}\n${inner}\\end{quote}\n\n`;
      }

      if (node.type.name === 'bulletList') {
        const items = children.map(nodeToTex).join('');
        return `\\begin{itemize}\n${items}\\end{itemize}\n\n`;
      }

      if (node.type.name === 'orderedList') {
        const items = children.map(nodeToTex).join('');
        return `\\begin{enumerate}\n${items}\\end{enumerate}\n\n`;
      }

      if (node.type.name === 'listItem') {
        const inner = children.map(nodeToTex).join('').trim();
        return `  \\item ${inner}\n`;
      }

      if (node.type.name === 'codeBlock') {
        const code = children.map(c => c.text || '').join('');
        return `\\begin{verbatim}\n${code}\n\\end{verbatim}\n\n`;
      }

      if (node.type.name === 'table') {
        const tableRows = [];
        node.forEach((row) => {
          const cells = [];
          row.forEach((cell) => {
            const cellChildren = [];
            cell.forEach((c) => cellChildren.push(c));
            cells.push(cellChildren.map(nodeToTex).join('').trim());
          });
          tableRows.push(cells.join(' & '));
        });
        const colCount = tableRows.length > 0 ? (tableRows[0].split('&').length) : 1;
        const colSpec = Array(colCount).fill('c').join('|');
        return `\\begin{tabular}{|${colSpec}|}\n\\hline\n${tableRows.join(' \\\\\n\\hline\n')}\\\\\n\\hline\n\\end{tabular}\n\n`;
      }

      // Default: just recurse
      return children.map(nodeToTex).join('');
    }

    const doc = editor.state.doc;
    let texBody = '';
    doc.forEach((child) => { texBody += nodeToTex(child); });

    // Wrap in a minimal document
    const tex = `\\documentclass{article}
\\usepackage{amsmath, amssymb, amsfonts}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{hyperref}

\\begin{document}

${texBody.trim()}

\\end{document}
`;

    await window.electronAPI.exportTex(tex);
  });

  window.electronAPI.onFormat((cmd) => {
    const editor = getActiveEditor();
    if (!editor) return;
    switch (cmd) {
      case 'bold': editor.chain().focus().toggleBold().run(); break;
      case 'italic': editor.chain().focus().toggleItalic().run(); break;
      case 'underline': editor.chain().focus().toggleUnderline().run(); break;
      case 'math': toggleMathMode(); break;
      case 'insertTable': editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      case 'addRowBefore': editor.chain().focus().addRowBefore().run(); break;
      case 'addRowAfter': editor.chain().focus().addRowAfter().run(); break;
      case 'addColumnBefore': editor.chain().focus().addColumnBefore().run(); break;
      case 'addColumnAfter': editor.chain().focus().addColumnAfter().run(); break;
      case 'deleteRow': editor.chain().focus().deleteRow().run(); break;
      case 'deleteColumn': editor.chain().focus().deleteColumn().run(); break;
      case 'deleteTable': editor.chain().focus().deleteTable().run(); break;
      case 'mergeCells': editor.chain().focus().mergeCells().run(); break;
      case 'splitCell': editor.chain().focus().splitCell().run(); break;
      case 'insertImage': {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            editor.chain().focus().setImage({ src: reader.result }).run();
          };
          reader.readAsDataURL(file);
        };
        input.click();
        break;
      }
      case 'insertHorizontalRule': editor.chain().focus().setHorizontalRule().run(); break;
      case 'insertFile': {
        const finput = document.createElement('input');
        finput.type = 'file';
        finput.multiple = true;
        finput.onchange = () => {
          Array.from(finput.files).forEach((file) => {
            // Images go inline as images, everything else as attachment chip
            if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = () => {
                editor.chain().focus().setImage({ src: reader.result }).run();
              };
              reader.readAsDataURL(file);
            } else {
              const reader = new FileReader();
              reader.onload = () => {
                editor.chain().focus().insertFileAttachment({
                  filename: file.name,
                  filesize: file.size,
                  mimetype: file.type || 'application/octet-stream',
                  src: reader.result,
                }).run();
              };
              reader.readAsDataURL(file);
            }
          });
        };
        finput.click();
        break;
      }
      case 'insertDrawing': {
        openDrawingTool(null).then((dataUrl) => {
          if (dataUrl) {
            editor.chain().focus().insertDrawing({ src: dataUrl }).run();
          }
        });
        break;
      }
      case 'insertLink': {
        const { from, to } = editor.state.selection;
        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        const existingHref = editor.getAttributes('link').href || '';
        const url = prompt('Enter URL:', existingHref || 'https://');
        if (url === null) break; // cancelled
        if (url === '') {
          editor.chain().focus().unsetLink().run();
        } else {
          editor.chain().focus().setLink({ href: url }).run();
        }
        break;
      }
      default:
        // Font: "font-Georgia", Size: "size-16px", Line height: "lineheight-1.6"
        if (cmd.startsWith('font-')) {
          editor.chain().focus().setFontFamily(cmd.slice(5)).run();
        } else if (cmd.startsWith('size-')) {
          editor.chain().focus().setFontSize(cmd.slice(5)).run();
        } else if (cmd.startsWith('lineheight-')) {
          editor.chain().focus().setLineHeight(cmd.slice(11)).run();
        }
    }
  });

  // Tab bar toggle from menu
  window.electronAPI.onToggleTabBar?.(() => toggleTabBar());

  // File opened from Finder / double-click
  window.electronAPI.onOpenFilePath((filePath) => {
    openFilePath(filePath);
  });

  // Page Setup dialog
  window.electronAPI.onShowPageSetup?.(() => showPageSetupDialog());
}

// ============================================================
// Page Layout Settings
// ============================================================
let _pageLayout = {
  pageSize: 'Letter',
  orientation: 'portrait',
  margins: { top: 1, bottom: 1, left: 1, right: 1 }, // inches
  columns: 1,
};

function showPageSetupDialog() {
  // Remove existing dialog if open
  document.querySelector('.page-setup-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'page-setup-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'page-setup-dialog';

  dialog.innerHTML = `
    <h3>Page Setup</h3>
    <div class="ps-row">
      <label>Page Size</label>
      <select id="ps-size">
        <option value="Letter" ${_pageLayout.pageSize === 'Letter' ? 'selected' : ''}>Letter (8.5 × 11)</option>
        <option value="A4" ${_pageLayout.pageSize === 'A4' ? 'selected' : ''}>A4 (210 × 297mm)</option>
        <option value="Legal" ${_pageLayout.pageSize === 'Legal' ? 'selected' : ''}>Legal (8.5 × 14)</option>
        <option value="Tabloid" ${_pageLayout.pageSize === 'Tabloid' ? 'selected' : ''}>Tabloid (11 × 17)</option>
      </select>
    </div>
    <div class="ps-row">
      <label>Orientation</label>
      <select id="ps-orientation">
        <option value="portrait" ${_pageLayout.orientation === 'portrait' ? 'selected' : ''}>Portrait</option>
        <option value="landscape" ${_pageLayout.orientation === 'landscape' ? 'selected' : ''}>Landscape</option>
      </select>
    </div>
    <div class="ps-row">
      <label>Columns</label>
      <select id="ps-columns">
        <option value="1" ${_pageLayout.columns === 1 ? 'selected' : ''}>1</option>
        <option value="2" ${_pageLayout.columns === 2 ? 'selected' : ''}>2</option>
        <option value="3" ${_pageLayout.columns === 3 ? 'selected' : ''}>3</option>
      </select>
    </div>
    <fieldset class="ps-margins">
      <legend>Margins (inches)</legend>
      <div class="ps-margin-grid">
        <label>Top <input type="number" id="ps-mt" value="${_pageLayout.margins.top}" step="0.1" min="0" max="3"></label>
        <label>Bottom <input type="number" id="ps-mb" value="${_pageLayout.margins.bottom}" step="0.1" min="0" max="3"></label>
        <label>Left <input type="number" id="ps-ml" value="${_pageLayout.margins.left}" step="0.1" min="0" max="3"></label>
        <label>Right <input type="number" id="ps-mr" value="${_pageLayout.margins.right}" step="0.1" min="0" max="3"></label>
      </div>
    </fieldset>
    <div class="ps-buttons">
      <button id="ps-cancel">Cancel</button>
      <button id="ps-apply">Apply</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  dialog.querySelector('#ps-cancel').addEventListener('click', () => overlay.remove());
  dialog.querySelector('#ps-apply').addEventListener('click', () => {
    _pageLayout.pageSize = dialog.querySelector('#ps-size').value;
    _pageLayout.orientation = dialog.querySelector('#ps-orientation').value;
    _pageLayout.columns = parseInt(dialog.querySelector('#ps-columns').value);
    _pageLayout.margins.top = parseFloat(dialog.querySelector('#ps-mt').value);
    _pageLayout.margins.bottom = parseFloat(dialog.querySelector('#ps-mb').value);
    _pageLayout.margins.left = parseFloat(dialog.querySelector('#ps-ml').value);
    _pageLayout.margins.right = parseFloat(dialog.querySelector('#ps-mr').value);
    applyPageLayout();
    overlay.remove();
  });
}

function applyPageLayout() {
  const tiptap = document.querySelector('.editor-instance .tiptap');
  if (!tiptap) return;

  // Apply margins as padding
  tiptap.style.paddingTop = `${_pageLayout.margins.top * 96}px`;
  tiptap.style.paddingBottom = `${_pageLayout.margins.bottom * 96}px`;
  tiptap.style.paddingLeft = `${_pageLayout.margins.left * 96}px`;
  tiptap.style.paddingRight = `${_pageLayout.margins.right * 96}px`;

  // Apply columns
  if (_pageLayout.columns > 1) {
    tiptap.style.columnCount = _pageLayout.columns;
    tiptap.style.columnGap = '24px';
  } else {
    tiptap.style.columnCount = '';
    tiptap.style.columnGap = '';
  }

  // Store for PDF export
  document.body.dataset.pageSize = _pageLayout.pageSize;
  document.body.dataset.orientation = _pageLayout.orientation;
}

// ============================================================
// Title editing
// ============================================================
function setupTitleEditing() {
  // Double-click tab to rename
  document.getElementById('tab-bar').addEventListener('dblclick', (e) => {
    const tabEl = e.target.closest('.tab:not(.new-tab)');
    if (!tabEl) return;

    const titleSpan = tabEl.querySelector('.tab-title');
    if (!titleSpan) return;

    const tab = getActiveTab();
    if (!tab) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-title-input';
    input.value = tab.title;
    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
      const newTitle = input.value.trim() || 'Untitled';
      tab.title = newTitle;
      renderTabs();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = tab.title; input.blur(); }
    });
  });
}

// ============================================================
// Keyboard shortcuts
// ============================================================
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Cmd+S / Ctrl+S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentDoc();
    }

    // Cmd+E / Ctrl+E to toggle math mode
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      toggleMathMode();
    }

    // Escape exits math mode without rendering
    if (e.key === 'Escape' && _mathMode) {
      exitMathMode(false);
    }
  });
}

// ============================================================
// Theme handling
// ============================================================
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let _themeListener = null;
let _currentThemeMode = 'system';

function isDarkMode() {
  return document.body.classList.contains('dark-mode');
}

function applyTheme(mode) {
  _currentThemeMode = mode;

  if (_themeListener) {
    darkQuery.removeEventListener('change', _themeListener);
    _themeListener = null;
  }

  function update() {
    const nowDark = _currentThemeMode === 'dark' ||
      (_currentThemeMode === 'system' && darkQuery.matches);
    if (nowDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    // Sync color picker with current theme
    syncColorPicker();
  }

  if (mode === 'system') {
    _themeListener = update;
    darkQuery.addEventListener('change', _themeListener);
  }
  update();
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initFormatBarActions();
  setupIPC();
  setupTitleEditing();
  setupKeyboard();
  setupTabDropdown();

  // Only create an Untitled tab if no file is being opened from Finder.
  if (window.electronAPI) {
    window.electronAPI.onNoPendingFile(() => {
      if (tabs.length === 0) addTab();
    });
    // Fallback if neither message arrives (dev mode, etc.)
    setTimeout(() => { if (tabs.length === 0) addTab(); }, 500);
  } else {
    addTab();
  }

  // Drag-and-drop files into editor
  document.getElementById('editor-container').addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.getElementById('editor-container').addEventListener('drop', (e) => {
    e.preventDefault();
    const editor = getActiveEditor();
    if (!editor) return;
    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => editor.chain().focus().setImage({ src: reader.result }).run();
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          editor.chain().focus().insertFileAttachment({
            filename: file.name,
            filesize: file.size,
            mimetype: file.type || 'application/octet-stream',
            src: reader.result,
          }).run();
        };
        reader.readAsDataURL(file);
      }
    });
  });

  // Theme handling
  if (window.electronAPI) {
    window.electronAPI.getTheme().then(applyTheme);
    window.electronAPI.onThemeChanged(applyTheme);
  }
  // Initialize with system default if no Electron API
  applyTheme('system');

  // Auto-save every 30s (writes HTML directly to .merc file)
  setInterval(() => {
    const tab = getActiveTab();
    if (tab?.filePath && tab.editor) {
      tab.content = tab.editor.getHTML();
      window.electronAPI?.saveDoc({
        filePath: tab.filePath,
        title: tab.title,
        content: tab.content,
      });
    }
  }, 30000);
});

import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import katex from 'katex';

/** Invert an RGB or hex color string (for dark mode math color) */
function invertColorForMath(colorStr) {
  const m = colorStr.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
  if (m) return `rgb(${255 - parseInt(m[1])}, ${255 - parseInt(m[2])}, ${255 - parseInt(m[3])})`;
  const h = colorStr.match(/#([0-9a-fA-F]{6})/);
  if (h) {
    const r = parseInt(h[1].slice(0, 2), 16), g = parseInt(h[1].slice(2, 4), 16), b = parseInt(h[1].slice(4, 6), 16);
    return `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
  }
  return colorStr;
}

/**
 * Parses common LaTeX patterns into structured fields for the parameter editor.
 * Returns { type, fields } where fields is an array of { label, key, value }.
 */
function parseMathStructure(latex) {
  const trimmed = latex.trim();

  // Summation: \sum_{lower}^{upper} body
  const sumMatch = trimmed.match(/^\\sum\s*_\{([^}]*)\}\s*\^\{([^}]*)\}\s*(.*)$/s);
  if (sumMatch) {
    return {
      type: 'sum',
      label: 'Summation',
      fields: [
        { label: 'Lower', key: 'lower', value: sumMatch[1] },
        { label: 'Upper', key: 'upper', value: sumMatch[2] },
        { label: 'Body', key: 'body', value: sumMatch[3] },
      ],
      rebuild: (f) => `\\sum_{${f.lower}}^{${f.upper}} ${f.body}`,
    };
  }

  // Product: \prod_{lower}^{upper} body
  const prodMatch = trimmed.match(/^\\prod\s*_\{([^}]*)\}\s*\^\{([^}]*)\}\s*(.*)$/s);
  if (prodMatch) {
    return {
      type: 'prod',
      label: 'Product',
      fields: [
        { label: 'Lower', key: 'lower', value: prodMatch[1] },
        { label: 'Upper', key: 'upper', value: prodMatch[2] },
        { label: 'Body', key: 'body', value: prodMatch[3] },
      ],
      rebuild: (f) => `\\prod_{${f.lower}}^{${f.upper}} ${f.body}`,
    };
  }

  // Integral: \int_{lower}^{upper} body
  const intMatch = trimmed.match(/^\\int\s*_\{([^}]*)\}\s*\^\{([^}]*)\}\s*(.*)$/s);
  if (intMatch) {
    return {
      type: 'integral',
      label: 'Integral',
      fields: [
        { label: 'Lower', key: 'lower', value: intMatch[1] },
        { label: 'Upper', key: 'upper', value: intMatch[2] },
        { label: 'Integrand', key: 'body', value: intMatch[3] },
      ],
      rebuild: (f) => `\\int_{${f.lower}}^{${f.upper}} ${f.body}`,
    };
  }

  // Fraction: \frac{num}{denom}
  const fracMatch = trimmed.match(/^\\frac\{([^}]*)\}\{([^}]*)\}(.*)$/s);
  if (fracMatch) {
    return {
      type: 'frac',
      label: 'Fraction',
      fields: [
        { label: 'Numerator', key: 'num', value: fracMatch[1] },
        { label: 'Denominator', key: 'denom', value: fracMatch[2] },
        ...(fracMatch[3].trim() ? [{ label: 'After', key: 'after', value: fracMatch[3].trim() }] : []),
      ],
      rebuild: (f) => `\\frac{${f.num}}{${f.denom}}${f.after ? ' ' + f.after : ''}`,
    };
  }

  // Limit: \lim_{var \to val} body
  const limMatch = trimmed.match(/^\\lim\s*_\{([^}]*?)\\to\s*([^}]*)\}\s*(.*)$/s);
  if (limMatch) {
    return {
      type: 'limit',
      label: 'Limit',
      fields: [
        { label: 'Variable', key: 'var', value: limMatch[1].trim() },
        { label: 'Approaches', key: 'to', value: limMatch[2].trim() },
        { label: 'Expression', key: 'body', value: limMatch[3] },
      ],
      rebuild: (f) => `\\lim_{${f.var} \\to ${f.to}} ${f.body}`,
    };
  }

  // Matrix variants: \begin{pmatrix}...\end{pmatrix}, bmatrix, vmatrix, Bmatrix, Vmatrix, matrix
  const matrixMatch = trimmed.match(/^\\begin\{(p|b|v|B|V)?matrix\}([\s\S]*)\\end\{(?:p|b|v|B|V)?matrix\}$/);
  if (matrixMatch) {
    const matrixType = matrixMatch[1] || '';
    const body = matrixMatch[2].trim();
    const rows = body.split('\\\\').map((r) => r.trim().split('&').map((c) => c.trim()));
    const env = matrixType ? `${matrixType}matrix` : 'matrix';

    return {
      type: 'matrix',
      label: `Matrix (${env})`,
      matrixType: env,
      rows,
      fields: [], // handled specially
      rebuild: null, // handled specially
      rebuildMatrix: (newRows, newEnv) => {
        const inner = newRows.map((r) => r.join(' & ')).join(' \\\\ ');
        return `\\begin{${newEnv}}${inner}\\end{${newEnv}}`;
      },
    };
  }

  // Cases / piecewise: \begin{cases}...\end{cases}
  const casesMatch = trimmed.match(/^\\begin\{cases\}([\s\S]*)\\end\{cases\}$/);
  if (casesMatch) {
    const body = casesMatch[1].trim();
    const rows = body.split('\\\\').map((r) => {
      const parts = r.trim().split('&').map((c) => c.trim());
      return { expr: parts[0] || '', cond: parts[1] || '' };
    });

    return {
      type: 'cases',
      label: 'Piecewise / Cases',
      cases: rows,
      fields: [],
      rebuild: null,
      rebuildCases: (newRows) => {
        const inner = newRows.map((r) => `${r.expr} & ${r.cond}`).join(' \\\\ ');
        return `\\begin{cases}${inner}\\end{cases}`;
      },
    };
  }

  // Aligned/align/align* environment
  const alignedMatch = trimmed.match(/^\\begin\{(aligned|align\*?)\}([\s\S]*)\\end\{(aligned|align\*?)\}$/);
  if (alignedMatch) {
    const env = alignedMatch[1];
    const body = alignedMatch[2].trim();
    const rows = body.split('\\\\').map((r) => {
      const parts = r.trim().split('&').map((c) => c.trim());
      return { left: parts[0] || '', right: parts[1] || '' };
    });

    return {
      type: 'aligned',
      label: `Aligned Equations (${env})`,
      alignEnv: env,
      rows,
      fields: [],
      rebuild: null,
      rebuildAligned: (newRows, newEnv) => {
        const e = newEnv || env;
        const inner = newRows.map((r) => `${r.left} & ${r.right}`).join(' \\\\ ');
        return `\\begin{${e}}${inner}\\end{${e}}`;
      },
    };
  }

  // Generic: no structure detected
  return null;
}

/**
 * Helper: creates the raw LaTeX toggle + save/cancel buttons shared by all editors.
 * Returns { rawToggle, rawInput, buttonsEl, getSaveLatex }
 */
function createEditorChrome(container, getCurrentLatex, onSave, onCancel) {
  const rawToggle = document.createElement('button');
  rawToggle.className = 'math-param-raw-toggle';
  rawToggle.textContent = 'Edit raw LaTeX';
  const rawInput = document.createElement('textarea');
  rawInput.className = 'math-param-raw';
  rawInput.style.display = 'none';
  rawInput.rows = 3;
  rawInput.spellcheck = false;

  let isRaw = false;
  rawToggle.addEventListener('click', () => {
    isRaw = !isRaw;
    rawInput.style.display = isRaw ? 'block' : 'none';
    rawToggle.textContent = isRaw ? 'Use fields' : 'Edit raw LaTeX';
    if (isRaw) { rawInput.value = getCurrentLatex(); rawInput.focus(); }
  });
  rawInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSave(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  });

  container.appendChild(rawToggle);
  container.appendChild(rawInput);

  const buttons = document.createElement('div');
  buttons.className = 'math-param-buttons';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'math-param-cancel';
  cancelBtn.addEventListener('click', onCancel);
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'math-param-save';
  buttons.appendChild(cancelBtn);
  buttons.appendChild(saveBtn);
  container.appendChild(buttons);

  function doSave() {
    onSave(isRaw ? rawInput.value.trim() : getCurrentLatex());
  }
  saveBtn.addEventListener('click', doSave);

  return { doSave };
}

/**
 * Renders a KaTeX preview into the given element.
 */
function renderPreview(el, latex, displayMode = false) {
  try {
    katex.render(latex || ' ', el, { throwOnError: false, displayMode });
  } catch {
    el.textContent = latex;
  }
}

/**
 * Creates the parameter editing popup UI for a structured math expression.
 * Handles simple field-based structures AND grid-based ones (matrix, cases, aligned).
 */
function createParamEditor(structure, latex, onSave, onCancel) {
  const container = document.createElement('div');
  container.className = 'math-param-editor';

  const header = document.createElement('div');
  header.className = 'math-param-header';
  header.textContent = structure.label;
  container.appendChild(header);

  const preview = document.createElement('div');
  preview.className = 'math-param-preview';
  container.appendChild(preview);

  let getCurrentLatex; // will be set per structure type

  // ===========================================================
  // MATRIX editor
  // ===========================================================
  if (structure.type === 'matrix') {
    let rows = structure.rows.map((r) => [...r]);
    let env = structure.matrixType;

    // Matrix type selector
    const typeRow = document.createElement('div');
    typeRow.className = 'math-param-row';
    const typeLabel = document.createElement('label');
    typeLabel.className = 'math-param-label';
    typeLabel.textContent = 'Type';
    typeRow.appendChild(typeLabel);
    const typeSelect = document.createElement('select');
    typeSelect.className = 'math-param-input';
    ['matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Bmatrix', 'Vmatrix'].forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = { matrix: 'Plain', pmatrix: '( )', bmatrix: '[ ]', vmatrix: '| |', Bmatrix: '{ }', Vmatrix: '‖ ‖' }[t];
      if (t === env) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', () => { env = typeSelect.value; updateGrid(); });
    typeRow.appendChild(typeSelect);
    container.appendChild(typeRow);

    const gridContainer = document.createElement('div');
    gridContainer.className = 'math-matrix-grid';
    container.appendChild(gridContainer);

    // +row / +col / -row / -col buttons
    const dimBtns = document.createElement('div');
    dimBtns.className = 'math-dim-buttons';
    const addRowBtn = createSmallBtn('+Row', () => { rows.push(rows[0].map(() => '')); updateGrid(); });
    const addColBtn = createSmallBtn('+Col', () => { rows.forEach((r) => r.push('')); updateGrid(); });
    const delRowBtn = createSmallBtn('-Row', () => { if (rows.length > 1) { rows.pop(); updateGrid(); } });
    const delColBtn = createSmallBtn('-Col', () => { if (rows[0].length > 1) { rows.forEach((r) => r.pop()); updateGrid(); } });
    dimBtns.append(addRowBtn, addColBtn, delRowBtn, delColBtn);
    container.appendChild(dimBtns);

    function updateGrid() {
      gridContainer.innerHTML = '';
      const cols = rows[0]?.length || 1;
      gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

      rows.forEach((row, ri) => {
        row.forEach((cell, ci) => {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'math-grid-cell';
          input.value = cell;
          input.spellcheck = false;
          input.addEventListener('input', () => { rows[ri][ci] = input.value; renderPreview(preview, getCurrentLatex(), true); });
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const next = e.shiftKey
                ? gridContainer.children[(ri * cols + ci - 1 + rows.length * cols) % (rows.length * cols)]
                : gridContainer.children[(ri * cols + ci + 1) % (rows.length * cols)];
              next?.focus();
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chrome.doSave(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          });
          gridContainer.appendChild(input);
        });
      });
      renderPreview(preview, getCurrentLatex(), true);
    }

    getCurrentLatex = () => structure.rebuildMatrix(rows, env);
    updateGrid();

  // ===========================================================
  // CASES editor
  // ===========================================================
  } else if (structure.type === 'cases') {
    let cases = structure.cases.map((c) => ({ ...c }));

    const casesContainer = document.createElement('div');
    casesContainer.className = 'math-cases-container';
    container.appendChild(casesContainer);

    const addBtn = createSmallBtn('+ Case', () => { cases.push({ expr: '', cond: '' }); updateCases(); });
    container.appendChild(addBtn);

    function updateCases() {
      casesContainer.innerHTML = '';
      cases.forEach((c, i) => {
        const row = document.createElement('div');
        row.className = 'math-cases-row';

        const exprInput = document.createElement('input');
        exprInput.type = 'text';
        exprInput.className = 'math-param-input';
        exprInput.value = c.expr;
        exprInput.placeholder = 'Expression';
        exprInput.spellcheck = false;
        exprInput.addEventListener('input', () => { cases[i].expr = exprInput.value; renderPreview(preview, getCurrentLatex(), true); });

        const condInput = document.createElement('input');
        condInput.type = 'text';
        condInput.className = 'math-param-input';
        condInput.value = c.cond;
        condInput.placeholder = 'Condition';
        condInput.spellcheck = false;
        condInput.addEventListener('input', () => { cases[i].cond = condInput.value; renderPreview(preview, getCurrentLatex(), true); });

        const delBtn = document.createElement('button');
        delBtn.className = 'math-row-delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => { if (cases.length > 1) { cases.splice(i, 1); updateCases(); } });

        [exprInput, condInput].forEach((inp) => {
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chrome.doSave(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          });
        });

        row.append(exprInput, condInput, delBtn);
        casesContainer.appendChild(row);
      });
      renderPreview(preview, getCurrentLatex(), true);
    }

    getCurrentLatex = () => structure.rebuildCases(cases);
    updateCases();

  // ===========================================================
  // ALIGNED editor
  // ===========================================================
  } else if (structure.type === 'aligned') {
    let rows = structure.rows.map((r) => ({ ...r }));
    let env = structure.alignEnv || 'aligned';

    // Environment type selector
    const typeRow = document.createElement('div');
    typeRow.className = 'math-param-row';
    const typeLabel = document.createElement('label');
    typeLabel.className = 'math-param-label';
    typeLabel.textContent = 'Env';
    typeRow.appendChild(typeLabel);
    const typeSelect = document.createElement('select');
    typeSelect.className = 'math-param-input';
    ['aligned', 'align', 'align*'].forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === env) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', () => { env = typeSelect.value; renderPreview(preview, getCurrentLatex(), true); });
    typeRow.appendChild(typeSelect);
    container.appendChild(typeRow);

    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'math-cases-container';
    container.appendChild(rowsContainer);

    const addBtn = createSmallBtn('+ Line', () => { rows.push({ left: '', right: '' }); updateRows(); });
    container.appendChild(addBtn);

    function updateRows() {
      rowsContainer.innerHTML = '';
      rows.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'math-cases-row';

        const leftInput = document.createElement('input');
        leftInput.type = 'text';
        leftInput.className = 'math-param-input';
        leftInput.value = r.left;
        leftInput.placeholder = 'Left side';
        leftInput.spellcheck = false;
        leftInput.addEventListener('input', () => { rows[i].left = leftInput.value; renderPreview(preview, getCurrentLatex(), true); });

        const rightInput = document.createElement('input');
        rightInput.type = 'text';
        rightInput.className = 'math-param-input';
        rightInput.value = r.right;
        rightInput.placeholder = 'Right side';
        rightInput.spellcheck = false;
        rightInput.addEventListener('input', () => { rows[i].right = rightInput.value; renderPreview(preview, getCurrentLatex(), true); });

        const delBtn = document.createElement('button');
        delBtn.className = 'math-row-delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => { if (rows.length > 1) { rows.splice(i, 1); updateRows(); } });

        [leftInput, rightInput].forEach((inp) => {
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chrome.doSave(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          });
        });

        row.append(leftInput, rightInput, delBtn);
        rowsContainer.appendChild(row);
      });
      renderPreview(preview, getCurrentLatex(), true);
    }

    getCurrentLatex = () => structure.rebuildAligned(rows, env);
    updateRows();

  // ===========================================================
  // Simple field-based structures (sum, prod, int, frac, lim)
  // ===========================================================
  } else {
    const inputs = {};

    function updatePreview() {
      const vals = {};
      for (const f of structure.fields) vals[f.key] = inputs[f.key].value;
      renderPreview(preview, structure.rebuild(vals));
    }

    structure.fields.forEach((field) => {
      const row = document.createElement('div');
      row.className = 'math-param-row';

      const label = document.createElement('label');
      label.textContent = field.label;
      label.className = 'math-param-label';
      row.appendChild(label);

      const input = document.createElement('input');
      input.type = 'text';
      input.value = field.value;
      input.className = 'math-param-input';
      input.spellcheck = false;
      input.addEventListener('input', updatePreview);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); chrome.doSave(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      });
      row.appendChild(input);

      inputs[field.key] = input;
      container.appendChild(row);
    });

    getCurrentLatex = () => {
      const vals = {};
      for (const f of structure.fields) vals[f.key] = inputs[f.key].value;
      return structure.rebuild(vals);
    };

    updatePreview();
  }

  // Shared chrome: raw toggle + save/cancel
  const chrome = createEditorChrome(container, getCurrentLatex, onSave, onCancel);

  renderPreview(preview, getCurrentLatex(), structure.type === 'matrix' || structure.type === 'cases' || structure.type === 'aligned');

  setTimeout(() => {
    const first = container.querySelector('.math-param-input, .math-grid-cell');
    if (first) first.focus();
  }, 50);

  return container;
}

/** Small utility button for +Row, +Col, etc. */
function createSmallBtn(text, onClick) {
  const btn = document.createElement('button');
  btn.className = 'math-small-btn';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Creates a plain LaTeX editor popup (for non-structured math).
 */
function createPlainEditor(latex, onSave, onCancel) {
  const container = document.createElement('div');
  container.className = 'math-param-editor plain';

  const preview = document.createElement('div');
  preview.className = 'math-param-preview';
  container.appendChild(preview);

  const input = document.createElement('textarea');
  input.className = 'math-input';
  input.value = latex;
  input.placeholder = 'LaTeX…';
  input.rows = 2;
  input.spellcheck = false;
  container.appendChild(input);

  function updatePreview() {
    try {
      katex.render(input.value || ' ', preview, { throwOnError: false, displayMode: false });
    } catch {
      preview.textContent = input.value;
    }
  }

  input.addEventListener('input', updatePreview);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  });

  const buttons = document.createElement('div');
  buttons.className = 'math-param-buttons';
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'math-param-save';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'math-param-cancel';
  cancelBtn.addEventListener('click', onCancel);
  buttons.appendChild(cancelBtn);
  buttons.appendChild(saveBtn);
  container.appendChild(buttons);

  function save() {
    onSave(input.value.trim());
  }
  saveBtn.addEventListener('click', save);

  updatePreview();
  setTimeout(() => input.focus(), 50);

  return container;
}

/**
 * Shared node view factory for both inline and display math.
 */
function mathNodeView(displayMode) {
  return ({ node, getPos, editor }) => {
    const dom = document.createElement(displayMode ? 'div' : 'span');
    dom.classList.add(displayMode ? 'display-math' : 'inline-math');

    let popup = null;
    let popupObserver = null;

    const render = () => {
      try {
        katex.render(node.attrs.latex || ' ', dom, {
          throwOnError: false,
          displayMode,
        });
      } catch {
        dom.textContent = node.attrs.latex;
      }
      // Inherit text color from marks (so colored text colors math too)
      applyMarkColor();
    };

    const applyMarkColor = () => {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      try {
        const resolved = editor.state.doc.resolve(pos);
        const marks = resolved.marksAcross(editor.state.doc.resolve(pos + 1)) || [];
        const colorMark = marks.find(m => m.type.name === 'textStyle' && m.attrs.color);
        if (colorMark) {
          dom.style.color = colorMark.attrs.color;
          // Also set the CSS custom property for dark mode inversion
          const inv = invertColorForMath(colorMark.attrs.color);
          dom.style.setProperty('--inv-color', inv);
          dom.setAttribute('data-has-color', '');
        } else {
          dom.style.color = '';
          dom.style.removeProperty('--inv-color');
          dom.removeAttribute('data-has-color');
        }
      } catch { /* pos may be stale during updates */ }
    };

    const closePopup = () => {
      if (popupObserver) { popupObserver.disconnect(); popupObserver = null; }
      if (popup) {
        popup.remove();
        popup = null;
        dom.classList.remove('editing');
      }
    };

    const startEditing = () => {
      if (popup) return;
      dom.classList.add('editing');

      const structure = parseMathStructure(node.attrs.latex);

      const onSave = (newLatex) => {
        closePopup();
        if (!newLatex) {
          const pos = getPos();
          if (typeof pos === 'number') {
            editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run();
          }
          return;
        }
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, { latex: newLatex })
          );
        }
        render();
      };

      const onCancel = () => {
        closePopup();
        render();
      };

      if (structure) {
        popup = createParamEditor(structure, node.attrs.latex, onSave, onCancel);
      } else {
        popup = createPlainEditor(node.attrs.latex, onSave, onCancel);
      }

      // Position popup near the math node, clamped to window bounds
      document.body.appendChild(popup);
      const rect = dom.getBoundingClientRect();
      popup.style.position = 'fixed';
      popup.style.visibility = 'hidden'; // measure before showing

      const clampPopup = () => {
        if (!popup) return;
        const popRect = popup.getBoundingClientRect();
        const pad = 8;

        let left = rect.left;
        if (left + popRect.width > window.innerWidth - pad) {
          left = window.innerWidth - popRect.width - pad;
        }
        left = Math.max(pad, left);

        let top = rect.bottom + 6;
        if (top + popRect.height > window.innerHeight - pad) {
          top = rect.top - popRect.height - 6;
        }
        top = Math.max(pad, top);

        // If popup is taller than viewport, constrain height and scroll
        const maxH = window.innerHeight - pad * 2;
        if (popRect.height > maxH) {
          popup.style.maxHeight = `${maxH}px`;
          popup.style.overflowY = 'auto';
          top = pad;
        }

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
        popup.style.visibility = '';
      };

      // Let the browser lay it out so we can measure
      requestAnimationFrame(clampPopup);

      // Re-clamp whenever the popup content changes (e.g. adding matrix rows)
      popupObserver = new MutationObserver(() => requestAnimationFrame(clampPopup));
      popupObserver.observe(popup, { childList: true, subtree: true });

      // Close on click outside
      const outsideHandler = (e) => {
        if (!popup?.contains(e.target) && !dom.contains(e.target)) {
          closePopup();
          document.removeEventListener('mousedown', outsideHandler);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', outsideHandler), 0);
    };

    render();

    // Click → open parameter editor
    dom.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditing();
    });

    // Math hover events removed — bubble menu on hover was disruptive

    return {
      dom,
      update(updatedNode) {
        if (updatedNode.type.name !== (displayMode ? 'displayMath' : 'inlineMath')) return false;
        node = updatedNode;
        if (!popup) render(); // render() calls applyMarkColor() too
        return true;
      },
      stopEvent() {
        return !!popup;
      },
      destroy() {
        closePopup();
      },
    };
  };
}

// === Inline Math Node ===
export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { latex: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'span[data-inline-math]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-inline-math': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return mathNodeView(false);
  },

  addCommands() {
    return {
      insertMath:
        (latex = '') =>
        ({ chain }) => chain().insertContent({ type: 'inlineMath', attrs: { latex } }).run(),
    };
  },
});

// === Display Math Node ===
export const DisplayMath = Node.create({
  name: 'displayMath',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return { latex: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'div[data-display-math]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-display-math': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return mathNodeView(true);
  },

  addCommands() {
    return {
      insertDisplayMath:
        (latex = '') =>
        ({ chain }) => chain().insertContent({ type: 'displayMath', attrs: { latex } }).run(),
    };
  },
});

/**
 * Check if braces are balanced in a string.
 */
function bracesBalanced(str) {
  let depth = 0;
  for (const ch of str) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Known LaTeX commands that trigger auto-rendering.
 * Includes commands with arguments (\frac{}{}) and standalone (\alpha).
 */
const LATEX_COMMANDS = new Set([
  // Greek letters
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
  'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi',
  'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi',
  'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon',
  'Phi', 'Psi', 'Omega',
  // Operators
  'sum', 'prod', 'coprod', 'int', 'iint', 'iiint', 'oint', 'bigcup', 'bigcap',
  'bigoplus', 'bigotimes', 'bigvee', 'bigwedge',
  'lim', 'limsup', 'liminf', 'sup', 'inf',
  'max', 'min', 'arg', 'det', 'gcd', 'deg', 'dim', 'hom', 'ker',
  'log', 'ln', 'exp', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  // Big-O / asymptotic notation
  'mathcal', 'mathcal{O}', // Big-O: use \mathcal{O}(n)
  'operatorname', // for custom operators like \operatorname{poly}
  // Structures
  'frac', 'dfrac', 'tfrac', 'cfrac',
  'sqrt', 'binom', 'tbinom', 'dbinom',
  'overline', 'underline', 'overbrace', 'underbrace',
  'hat', 'bar', 'vec', 'dot', 'ddot', 'tilde', 'widetilde', 'widehat',
  'overset', 'underset', 'stackrel',
  // Relations & arrows
  'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'cong', 'propto',
  'subset', 'supset', 'subseteq', 'supseteq', 'subsetneq', 'supsetneq',
  'in', 'notin', 'ni', 'owns',
  'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'leftrightarrow',
  'Leftrightarrow', 'implies', 'iff', 'to', 'mapsto',
  'uparrow', 'downarrow', 'Uparrow', 'Downarrow',
  'nearrow', 'searrow', 'swarrow', 'nwarrow',
  'hookrightarrow', 'hookleftarrow', 'rightharpoonup', 'rightharpoondown',
  'xrightarrow', 'xleftarrow',
  // Misc
  'infty', 'partial', 'nabla', 'forall', 'exists', 'nexists', 'emptyset',
  'varnothing', 'neg', 'lor', 'land', 'oplus', 'otimes', 'times', 'div',
  'cdot', 'cdots', 'ldots', 'vdots', 'ddots', 'pm', 'mp',
  'cup', 'cap', 'setminus', 'circ', 'star', 'dagger', 'ddagger',
  'ell', 'hbar', 'imath', 'jmath', 'Re', 'Im', 'wp', 'aleph', 'beth',
  'prime', 'backprime',
  // Environments (via \begin)
  'begin', 'end',
  // Delimiters
  'left', 'right', 'langle', 'rangle', 'lfloor', 'rfloor', 'lceil', 'rceil',
  'lvert', 'rvert', 'lVert', 'rVert',
  // Text/spacing
  'text', 'textbf', 'textit', 'textrm', 'textsf', 'texttt',
  'mathrm', 'mathbf', 'mathit', 'mathbb', 'mathcal', 'mathfrak', 'mathsf', 'mathtt',
  'boldsymbol', 'bm',
  'quad', 'qquad', 'hspace', 'enspace', 'thinspace',
  // Accents & decorations
  'acute', 'grave', 'breve', 'check', 'ring',
  // Miscellaneous
  'phantom', 'vphantom', 'hphantom', 'smash',
  'color', 'colorbox', 'boxed', 'cancel', 'bcancel', 'xcancel',
  'not',
]);

/**
 * Input plugin: auto-convert LaTeX expressions to inline/display math.
 *
 * Triggers on SPACE. Detects:
 * 1. \[ ... \] → display math
 * 2. \begin{...}...\end{...} → display math
 * 3. \command expressions → inline math
 * 4. Bare subscript/superscript: x_{n+1}, a^{2}, y_i, etc. → inline math
 */
export const MathInputPlugin = new Plugin({
  key: new PluginKey('mathInput'),
  props: {
    handleTextInput(view, from, to, text) {
      // Only trigger on space
      if (text !== ' ') return false;

      // If math mode is active (⌘E/⌃E toggle), suppress all auto-rendering
      if (window.__mercuryMathMode) return false;

      const { state } = view;
      const $from = state.doc.resolve(from);
      // Use \ufffc for atom nodes so positions map 1:1 to the document.
      // Any match containing \ufffc spans an already-rendered math node — skip it.
      const ATOM = '\ufffc';
      const textBefore = $from.parent.textBetween(
        Math.max(0, $from.parentOffset - 500),
        $from.parentOffset,
        null,
        ATOM
      );

      // Helper: reject matches that span existing math atoms
      const hasAtom = (s) => s.includes(ATOM);

      // Check for unclosed $$ — if the user has typed $$ but not closed it,
      // suppress all other rendering so they can compose the full expression.
      const dollarParts = textBefore.split('$$');
      // Odd number of parts means an unclosed $$ (opened but not closed yet)
      const insideDoubleDollar = dollarParts.length % 2 === 0;

      // --- Display math: $$...$$ ---
      const doubleDollarMatch = textBefore.match(/\$\$(.+?)\$\$$/);
      if (doubleDollarMatch && !hasAtom(doubleDollarMatch[0])) {
        const latex = doubleDollarMatch[1].trim();
        if (latex.length === 0) return false;
        const start = from - doubleDollarMatch[0].length;
        try { katex.renderToString(latex, { throwOnError: true }); } catch { return false; }
        const tr = state.tr.delete(start, to)
          .insert(start, state.schema.nodes.displayMath.create({ latex }));
        view.dispatch(tr);
        return true;
      }

      // --- Display math: \[ ... \] ---
      const displayMatch = textBefore.match(/\\\[(.+)\\\]$/);
      if (displayMatch && !hasAtom(displayMatch[0])) {
        const latex = displayMatch[1].trim();
        const start = from - displayMatch[0].length;
        const tr = state.tr.delete(start, to)
          .insert(start, state.schema.nodes.displayMath.create({ latex }));
        view.dispatch(tr);
        return true;
      }

      // --- Environments: \begin{...}...\end{...} → display math ---
      const envMatch = textBefore.match(/(\\begin\{[^}]+\}[\s\S]*\\end\{[^}]+\})$/);
      if (envMatch && !hasAtom(envMatch[0]) && bracesBalanced(envMatch[1])) {
        const latex = envMatch[1];
        const start = from - envMatch[0].length;
        const tr = state.tr.delete(start, to)
          .insert(start, state.schema.nodes.displayMath.create({ latex }));
        view.dispatch(tr);
        return true;
      }

      // If inside unclosed $$, don't try any other rendering
      if (insideDoubleDollar) return false;

      // --- Inline math: $...$ (single dollar, but NOT $$) ---
      const singleDollarMatch = textBefore.match(/(?<!\$)\$(.+?)\$(?!\$)$/);
      if (singleDollarMatch && !hasAtom(singleDollarMatch[0])) {
        const latex = singleDollarMatch[1].trim();
        if (latex.length === 0) return false;
        const start = from - singleDollarMatch[0].length;
        try { katex.renderToString(latex, { throwOnError: true }); } catch { return false; }
        const tr = state.tr.delete(start, to)
          .insert(start, state.schema.nodes.inlineMath.create({ latex }));
        view.dispatch(tr);
        return true;
      }

      // Check for unclosed single $ — suppress backslash/sub-sup rendering inside $...$
      // Strip out all $$ first, then count remaining $
      const strippedDouble = textBefore.replace(/\$\$/g, '');
      const insideSingleDollar = (strippedDouble.split('$').length % 2 === 0);
      if (insideSingleDollar) return false;

      // --- Backslash-based expressions: \command... ---
      let bestBackslashMatch = null;
      let searchFrom = Math.max(0, textBefore.length - 400);

      for (let i = textBefore.length - 1; i >= searchFrom; i--) {
        if (textBefore[i] === '\\') {
          const candidate = textBefore.slice(i);
          if (hasAtom(candidate)) continue; // spans rendered math — skip

          const cmdMatch = candidate.match(/^\\([a-zA-Z]+)/);
          if (!cmdMatch) continue;

          const cmdName = cmdMatch[1];
          if (!LATEX_COMMANDS.has(cmdName) && candidate.length < 3) continue;

          if (bracesBalanced(candidate)) {
            bestBackslashMatch = { latex: candidate, start: from - candidate.length };
            break;
          }
        }
      }

      if (bestBackslashMatch) {
        const { latex, start } = bestBackslashMatch;
        try { katex.renderToString(latex, { throwOnError: true }); } catch { return false; }
        const tr = state.tr.delete(start, to)
          .insert(start, state.schema.nodes.inlineMath.create({ latex }));
        view.dispatch(tr);
        return true;
      }

      // --- Bare subscript/superscript expressions ---
      // Also allow \ufffc (rendered math atom) as a valid base for sub/sup
      const subSupMatch = textBefore.match(
        /([\ufffcA-Za-z0-9\u0370-\u03FF]+(?:[\^_](?:\{(?:[^{}]|\{[^{}]*\})*\}|[A-Za-z0-9\u0370-\u03FF]))+)$/
      );

      if (subSupMatch) {
        const candidate = subSupMatch[1];
        if (!/[_^]/.test(candidate)) return false;
        if (!bracesBalanced(candidate)) return false;

        // Don't match if preceded by backslash (that's a \command, not bare sub/sup)
        const matchStart = textBefore.length - subSupMatch[0].length;
        if (matchStart > 0 && textBefore[matchStart - 1] === '\\') return false;

        // If the base is a rendered math atom (\ufffc), pull its latex and merge
        if (candidate.includes(ATOM)) {
          const atomIdx = candidate.indexOf(ATOM);
          const suffix = candidate.slice(atomIdx + 1); // e.g. "_{n}" or "^{2}"
          // Find the atom node just before the subscript text
          const suffixLen = suffix.length;
          const atomDocPos = from - suffixLen - 1; // position of the atom node
          if (atomDocPos < 0) return false;
          const atomNode = state.doc.nodeAt(atomDocPos);
          if (!atomNode || (atomNode.type.name !== 'inlineMath' && atomNode.type.name !== 'displayMath')) return false;
          const combined = atomNode.attrs.latex + suffix;
          try { katex.renderToString(combined, { throwOnError: true }); } catch { return false; }
          const tr = state.tr.delete(atomDocPos, from)
            .insert(atomDocPos, state.schema.nodes.inlineMath.create({ latex: combined }));
          view.dispatch(tr);
          return true;
        }

        if (hasAtom(candidate)) return false;

        try { katex.renderToString(candidate, { throwOnError: true }); } catch { return false; }
        const start = from - candidate.length;
        const tr = state.tr.delete(start, to)
          .insert(start, state.schema.nodes.inlineMath.create({ latex: candidate }));
        view.dispatch(tr);
        return true;
      }

      return false;
    },

    handleKeyDown(view, event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;

      const { state } = view;
      const { $from, $to, from, to } = state.selection;
      const isLeft = event.key === 'ArrowLeft';

      // If a node (atom) is currently selected, move cursor to the side of it
      if (state.selection.node) {
        const pos = isLeft ? from : to;
        view.dispatch(state.tr.setSelection(
          state.selection.constructor.near(state.doc.resolve(pos), isLeft ? -1 : 1)
        ));
        return true;
      }

      // Check if adjacent node in the movement direction is a math atom
      const dir = isLeft ? -1 : 1;
      const checkPos = isLeft ? from - 1 : to;

      if (checkPos < 0 || checkPos >= state.doc.content.size) return false;

      const $check = state.doc.resolve(isLeft ? from : to);
      const nodeBefore = $check.nodeBefore;
      const nodeAfter = $check.nodeAfter;

      const targetNode = isLeft ? nodeBefore : nodeAfter;

      if (targetNode && (targetNode.type.name === 'inlineMath' || targetNode.type.name === 'displayMath')) {
        // Move cursor to the other side of the math node
        const targetPos = isLeft ? from - targetNode.nodeSize : to + targetNode.nodeSize;
        if (targetPos >= 0 && targetPos <= state.doc.content.size) {
          const $target = state.doc.resolve(targetPos);
          try {
            const sel = state.selection.constructor.near($target, dir);
            view.dispatch(state.tr.setSelection(sel));
            return true;
          } catch { return false; }
        }
      }

      return false;
    },
  },
});

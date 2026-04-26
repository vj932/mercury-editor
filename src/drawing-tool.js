/**
 * Drawing Tool — opens a full-screen overlay with a canvas for freehand
 * drawing and basic shapes. Returns a PNG data URL on save.
 */

export function openDrawingTool(existingDataUrl) {
  return new Promise((resolve) => {
    // --- Overlay ---
    const overlay = document.createElement('div');
    overlay.className = 'drawing-overlay';

    // --- Toolbar ---
    const toolbar = document.createElement('div');
    toolbar.className = 'drawing-toolbar';

    const tools = [
      { id: 'pen',       label: '✏️', title: 'Pen' },
      { id: 'line',      label: '╱',  title: 'Line' },
      { id: 'rect',      label: '▭',  title: 'Rectangle' },
      { id: 'ellipse',   label: '◯',  title: 'Ellipse' },
      { id: 'arrow',     label: '→',  title: 'Arrow' },
      { id: 'text',      label: 'T',  title: 'Text' },
      { id: 'eraser',    label: '⌫',  title: 'Eraser' },
    ];

    let activeTool = 'pen';
    let strokeColor = '#000000';
    let strokeWidth = 2;
    let fillColor = 'transparent';

    // Undo stack
    let undoStack = [];
    let redoStack = [];

    function pushUndo() {
      undoStack.push(canvas.toDataURL());
      redoStack = [];
      if (undoStack.length > 50) undoStack.shift();
    }

    function undo() {
      if (undoStack.length === 0) return;
      redoStack.push(canvas.toDataURL());
      const prev = undoStack.pop();
      const img = new window.Image();
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
      img.src = prev;
    }

    function redo() {
      if (redoStack.length === 0) return;
      undoStack.push(canvas.toDataURL());
      const next = redoStack.pop();
      const img = new window.Image();
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
      img.src = next;
    }

    // Tool buttons
    tools.forEach(({ id, label, title }) => {
      const btn = document.createElement('button');
      btn.className = `drawing-tool-btn${id === activeTool ? ' active' : ''}`;
      btn.textContent = label;
      btn.title = title;
      btn.dataset.tool = id;
      btn.addEventListener('click', () => {
        activeTool = id;
        toolbar.querySelectorAll('.drawing-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === id));
        canvas.style.cursor = id === 'eraser' ? 'crosshair' : id === 'text' ? 'text' : 'crosshair';
      });
      toolbar.appendChild(btn);
    });

    // Separator
    const sep1 = document.createElement('div');
    sep1.className = 'drawing-sep';
    toolbar.appendChild(sep1);

    // Color picker
    const colorLabel = document.createElement('label');
    colorLabel.className = 'drawing-label';
    colorLabel.textContent = 'Stroke';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = strokeColor;
    colorInput.className = 'drawing-color';
    colorInput.addEventListener('input', (e) => { strokeColor = e.target.value; });
    colorLabel.appendChild(colorInput);
    toolbar.appendChild(colorLabel);

    // Fill color
    const fillLabel = document.createElement('label');
    fillLabel.className = 'drawing-label';
    fillLabel.textContent = 'Fill';
    const fillInput = document.createElement('input');
    fillInput.type = 'color';
    fillInput.value = '#ffffff';
    fillInput.className = 'drawing-color';
    fillInput.addEventListener('input', (e) => { fillColor = e.target.value; });
    fillLabel.appendChild(fillInput);
    toolbar.appendChild(fillLabel);

    const noFillBtn = document.createElement('button');
    noFillBtn.className = 'drawing-tool-btn small';
    noFillBtn.textContent = '∅';
    noFillBtn.title = 'No fill';
    noFillBtn.addEventListener('click', () => { fillColor = 'transparent'; });
    toolbar.appendChild(noFillBtn);

    // Stroke width
    const widthLabel = document.createElement('label');
    widthLabel.className = 'drawing-label';
    widthLabel.textContent = 'Size';
    const widthInput = document.createElement('input');
    widthInput.type = 'range';
    widthInput.min = '1';
    widthInput.max = '20';
    widthInput.value = strokeWidth;
    widthInput.className = 'drawing-slider';
    widthInput.addEventListener('input', (e) => { strokeWidth = parseInt(e.target.value); });
    widthLabel.appendChild(widthInput);
    toolbar.appendChild(widthLabel);

    const sep2 = document.createElement('div');
    sep2.className = 'drawing-sep';
    toolbar.appendChild(sep2);

    // Undo / Redo
    const undoBtn = document.createElement('button');
    undoBtn.className = 'drawing-tool-btn small';
    undoBtn.textContent = '↩';
    undoBtn.title = 'Undo';
    undoBtn.addEventListener('click', undo);
    toolbar.appendChild(undoBtn);

    const redoBtn = document.createElement('button');
    redoBtn.className = 'drawing-tool-btn small';
    redoBtn.textContent = '↪';
    redoBtn.title = 'Redo';
    redoBtn.addEventListener('click', redo);
    toolbar.appendChild(redoBtn);

    // Clear
    const clearBtn = document.createElement('button');
    clearBtn.className = 'drawing-tool-btn small';
    clearBtn.textContent = '🗑';
    clearBtn.title = 'Clear all';
    clearBtn.addEventListener('click', () => {
      pushUndo();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    toolbar.appendChild(clearBtn);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    toolbar.appendChild(spacer);

    // Cancel / Save
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'drawing-action-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });
    toolbar.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'drawing-action-btn save';
    saveBtn.textContent = 'Insert';
    saveBtn.addEventListener('click', () => {
      // Trim transparent padding and export
      const trimmed = trimCanvas(canvas);
      overlay.remove();
      resolve(trimmed);
    });
    toolbar.appendChild(saveBtn);

    overlay.appendChild(toolbar);

    // --- Canvas ---
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'drawing-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'drawing-canvas';
    canvas.style.cursor = 'crosshair';
    canvasWrap.appendChild(canvas);
    overlay.appendChild(canvasWrap);

    document.body.appendChild(overlay);

    // Size canvas to fill available space
    const rect = canvasWrap.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Load existing drawing if editing
    if (existingDataUrl) {
      const img = new window.Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        pushUndo();
      };
      img.src = existingDataUrl;
    }

    // --- Drawing state ---
    let isDrawing = false;
    let startX = 0, startY = 0;
    let snapshot = null; // for shape preview

    canvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      startX = e.offsetX;
      startY = e.offsetY;

      if (activeTool === 'text') {
        isDrawing = false;
        const text = prompt('Enter text:');
        if (text) {
          pushUndo();
          ctx.font = `${Math.max(strokeWidth * 4, 14)}px -apple-system, sans-serif`;
          ctx.fillStyle = strokeColor;
          ctx.fillText(text, startX, startY);
        }
        return;
      }

      pushUndo();

      if (activeTool === 'pen' || activeTool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        if (activeTool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = strokeWidth * 5;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
        }
      } else {
        // Shape tools — snapshot for live preview
        snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      const x = e.offsetX, y = e.offsetY;

      if (activeTool === 'pen' || activeTool === 'eraser') {
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (snapshot) {
        // Redraw snapshot + preview shape
        ctx.putImageData(snapshot, 0, 0);
        drawShape(ctx, activeTool, startX, startY, x, y, strokeColor, strokeWidth, fillColor);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (!isDrawing) return;
      isDrawing = false;

      if (activeTool === 'pen' || activeTool === 'eraser') {
        ctx.closePath();
        ctx.globalCompositeOperation = 'source-over';
      } else if (snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        drawShape(ctx, activeTool, startX, startY, e.offsetX, e.offsetY, strokeColor, strokeWidth, fillColor);
        snapshot = null;
      }
    });

    canvas.addEventListener('mouseleave', () => {
      if (isDrawing && (activeTool === 'pen' || activeTool === 'eraser')) {
        ctx.closePath();
        ctx.globalCompositeOperation = 'source-over';
      }
      isDrawing = false;
    });

    // Keyboard shortcuts
    const keyHandler = (e) => {
      if (e.key === 'Escape') { overlay.remove(); resolve(null); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    };
    document.addEventListener('keydown', keyHandler);
    // Clean up listener when overlay is removed
    const obs = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', keyHandler);
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true });
  });
}

function drawShape(ctx, tool, x1, y1, x2, y2, color, width, fill) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalCompositeOperation = 'source-over';

  switch (tool) {
    case 'line':
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;

    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(width * 4, 12);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
      break;
    }

    case 'rect':
      if (fill !== 'transparent') {
        ctx.fillStyle = fill;
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      break;

    case 'ellipse': {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill !== 'transparent') {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
  }
}

/**
 * Trim transparent borders from a canvas and return a data URL.
 */
function trimCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  let top = height, left = width, right = 0, bottom = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (right === 0 && bottom === 0) {
    // Empty canvas
    return canvas.toDataURL('image/png');
  }

  const pad = 10;
  top = Math.max(0, top - pad);
  left = Math.max(0, left - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);

  const trimW = right - left + 1;
  const trimH = bottom - top + 1;

  const trimmed = document.createElement('canvas');
  trimmed.width = trimW;
  trimmed.height = trimH;
  const tCtx = trimmed.getContext('2d');
  tCtx.drawImage(canvas, left, top, trimW, trimH, 0, 0, trimW, trimH);

  return trimmed.toDataURL('image/png');
}

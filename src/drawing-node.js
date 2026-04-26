import { Node, mergeAttributes } from '@tiptap/core';
import { openDrawingTool } from './drawing-tool.js';

/**
 * Drawing — a block node that stores a canvas drawing as a PNG data URL.
 * Double-click to re-open in the drawing tool for editing.
 */
export const Drawing = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-drawing]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-drawing': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.classList.add('drawing-node');
      dom.setAttribute('data-drawing', '');
      dom.contentEditable = 'false';

      const img = document.createElement('img');
      img.className = 'drawing-img';
      if (node.attrs.src) img.src = node.attrs.src;
      if (node.attrs.width) img.style.width = node.attrs.width + 'px';
      dom.appendChild(img);

      const badge = document.createElement('span');
      badge.className = 'drawing-badge';
      badge.textContent = '✏️ Drawing — double-click to edit';
      dom.appendChild(badge);

      // Double-click → reopen drawing tool
      dom.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDrawingTool(node.attrs.src).then((dataUrl) => {
          if (dataUrl) {
            const pos = getPos();
            if (typeof pos === 'number') {
              editor.view.dispatch(
                editor.view.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  src: dataUrl,
                })
              );
            }
          }
        });
      });

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'drawing') return false;
          if (updatedNode.attrs.src) img.src = updatedNode.attrs.src;
          if (updatedNode.attrs.width) img.style.width = updatedNode.attrs.width + 'px';
          else img.style.width = '';
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      insertDrawing:
        (attrs) =>
        ({ chain }) =>
          chain().insertContent({ type: 'drawing', attrs }).run(),
    };
  },
});

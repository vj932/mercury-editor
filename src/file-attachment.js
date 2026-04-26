import { Node, mergeAttributes } from '@tiptap/core';

/**
 * FileAttachment — a block node that renders as a clickable chip
 * showing the filename, file size, and a type icon.
 * File data is stored as a base64 data URL.
 */
export const FileAttachment = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      filename: { default: 'file' },
      filesize: { default: 0 },
      mimetype: { default: 'application/octet-stream' },
      src: { default: null }, // base64 data URL
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-file-attachment]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-file-attachment': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.classList.add('file-attachment');
      dom.setAttribute('data-file-attachment', '');
      dom.contentEditable = 'false';

      const icon = document.createElement('span');
      icon.className = 'fa-icon';
      icon.textContent = getFileIcon(node.attrs.mimetype, node.attrs.filename);

      const info = document.createElement('div');
      info.className = 'fa-info';

      const name = document.createElement('span');
      name.className = 'fa-name';
      name.textContent = node.attrs.filename;

      const size = document.createElement('span');
      size.className = 'fa-size';
      size.textContent = formatFileSize(node.attrs.filesize);

      info.appendChild(name);
      info.appendChild(size);

      const dlBtn = document.createElement('button');
      dlBtn.className = 'fa-download';
      dlBtn.textContent = '⬇';
      dlBtn.title = 'Save file';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFile(node.attrs.src, node.attrs.filename);
      });

      dom.appendChild(icon);
      dom.appendChild(info);
      dom.appendChild(dlBtn);

      // Double-click to open/save
      dom.addEventListener('dblclick', () => {
        downloadFile(node.attrs.src, node.attrs.filename);
      });

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'fileAttachment') return false;
          name.textContent = updatedNode.attrs.filename;
          size.textContent = formatFileSize(updatedNode.attrs.filesize);
          icon.textContent = getFileIcon(updatedNode.attrs.mimetype, updatedNode.attrs.filename);
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      insertFileAttachment:
        (attrs) =>
        ({ chain }) =>
          chain().insertContent({ type: 'fileAttachment', attrs }).run(),
    };
  },
});

function getFileIcon(mimetype, filename) {
  if (mimetype.startsWith('image/')) return '🖼';
  if (mimetype.startsWith('video/')) return '🎬';
  if (mimetype.startsWith('audio/')) return '🎵';
  if (mimetype === 'application/pdf') return '📄';
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['zip', 'gz', 'tar', 'rar', '7z'].includes(ext)) return '📦';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📽';
  if (['js', 'py', 'ts', 'c', 'cpp', 'java', 'rs', 'go'].includes(ext)) return '💻';
  return '📎';
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadFile(dataUrl, filename) {
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

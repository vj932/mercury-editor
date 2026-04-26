import { Extension } from '@tiptap/core';

/**
 * Custom lineHeight extension for TipTap
 * Sets line-height on block nodes
 */
export const LineHeight = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
      defaultHeight: '1.6',
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: this.options.defaultHeight,
            parseHTML: (el) => el.style.lineHeight || this.options.defaultHeight,
            renderHTML: (attrs) => {
              if (!attrs.lineHeight || attrs.lineHeight === this.options.defaultHeight) return {};
              return { style: `line-height: ${attrs.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (height) =>
        ({ commands }) => {
          return this.options.types.every((type) =>
            commands.updateAttributes(type, { lineHeight: height })
          );
        },
    };
  },
});

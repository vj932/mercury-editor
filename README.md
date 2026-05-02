# Mercury

A minimal, native math editor for macOS with inline LaTeX rendering. 

Built with Electron, TipTap, and KaTeX.

<img src="merc_snake.png" width="300">

## Features

- **Inline math rendering** — type `\alpha` or `$x^2 + y^2$` and it renders on space
- **Math mode** (⌘E / ⌃E) — toggle continuous LaTeX input without auto-rendering until you toggle off
- **Display math** — `$$...$$`, `\[...\]`, and `\begin{align}...\end{align}` environments
- **Rich text formatting** — bold, italic, underline, highlight, fonts, sizes, colors, alignment
- **Sketch tool** — freehand sketching with shapes (pen, line, rectangle, ellipse, arrow, text, eraser)
- **Native .merc file format** — double-click to open, auto-save

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm (comes with Node.js)
- macOS (the app uses macOS-native window styling)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/yourusername/mercury.git
cd mercury

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Build the App

```bash
# Build a .app bundle (outputs to release/mac/)
npm run package

# Build a .dmg installer
npm run package:dmg
```

The packaged app will be at `release/mac/Mercury.app`. Drag it to your Applications folder to install.

> **Note:** macOS will block app on first launch. To open it:
> 1. Right-click (or Control-click) on `Mercury.app`
> 2. Select **Open** from the context menu
> 3. Click **Open** in the dialog that appears
>



### File Format

Mercury saves documents as `.merc` files (HTML-based). They can be opened by double-clicking if Mercury is set as the default app for the `.merc` extension.

## Project Structure

```
mercury/
├── main.js              # Electron main process
├── preload.js           # Preload script (IPC bridge)
├── src/
│   ├── index.html       # App shell
│   ├── renderer.js      # Editor setup, tabs, toolbar, IPC
│   ├── styles.css        # All styling
│   ├── math-extension.js # TipTap math nodes + input plugin
│   ├── font-size.js     # Font size extension
│   ├── line-height.js   # Line height extension
│   ├── file-attachment.js # File attachment node
│   ├── drawing-tool.js  # Canvas drawing overlay
│   └── drawing-node.js  # Drawing TipTap node
├── build/               # App icons
└── package.json
```

## License

MIT

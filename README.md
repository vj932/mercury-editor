# Mercury

A minimal, native math editor for macOS with inline LaTeX rendering. 

Built with Electron, TipTap, and KaTeX.

![Mercury Editor](build/icon.png)

## Features

- **Inline math rendering** — type `\alpha` or `$x^2 + y^2$` and it renders on space
- **Math mode** (⌘E / ⌃E) — toggle continuous LaTeX input without auto-rendering until you toggle off
- **Display math** — `$$...$$`, `\[...\]`, and `\begin{align}...\end{align}` environments
- **Rich text formatting** — bold, italic, underline, highlight, fonts, sizes, colors, alignment
- **Drawing tool** — freehand sketching with shapes (pen, line, rectangle, ellipse, arrow, text, eraser)
- **File attachments** — drag-and-drop images and files directly into documents
- **Links** — ⌘K to insert, plus automatic URL detection
- **Tables** — insertable and resizable
- **Tabs** — multiple documents in one window
- **Page layout** — configurable page size, orientation, margins, columns
- **Export** — PDF and LaTeX (.tex) export
- **Dark mode** — follows system preference or manual toggle
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

> **Note:** Since the app is not signed with an Apple Developer ID, macOS will block it on first launch. To open it:
> 1. Right-click (or Control-click) on `Mercury.app`
> 2. Select **Open** from the context menu
> 3. Click **Open** in the dialog that appears
>
> You only need to do this once — after that it opens normally.

## Usage

### Math Input

Type LaTeX anywhere and press space to render:
- `\alpha` → α
- `\frac{1}{2}` → rendered fraction
- `$x^2 + y^2 = z^2$` → inline math
- `$$\int_0^1 f(x)\,dx$$` → display math

**Math mode** (⌘E or ⌃E): toggles continuous LaTeX input. Everything you type stays as raw text until you press ⌘E/⌃E again, at which point it all renders as a single inline math expression.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘E / ⌃E | Toggle math mode |
| ⌘B | Bold |
| ⌘I | Italic |
| ⌘U | Underline |
| ⌘K | Insert link |
| ⌘S | Save |
| ⌘⇧D | Insert drawing |
| Tab | Insert tab |

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

# 📄 PDFMaster — Privacy-First, Zero-Upload Web PDF Tools

PDFMaster is a fast, secure, and completely client-side suite of PDF tools. All processing happens entirely within your web browser — **no files are ever uploaded to a server**, ensuring 100% privacy, data security, and instant performance.

👉 **Live Website**: [https://pdfmaster.co.in/](https://pdfmaster.co.in/)

---

## 🚀 Key Architectural Pillars

*   **🔒 100% Private (Zero Server Uploads)**: Your documents never leave your computer. PDFMaster leverages modern browser memory structures, WebAssembly (WASM), and client-side JavaScript to modify PDFs locally.
*   **⚡ Native Speed**: Without network upload/download bottlenecks, operations like merging, splitting, drawing, and exporting complete in milliseconds.
*   **🔌 Offline Ready**: Once loaded, the core application does not require internet access to function.
*   **🎨 Responsive Aesthetics**: Implements modern design tokens, sleek dark/light mode configurations, smooth transitions, and premium graphics.

---

## 🛠️ Feature Rich Tool Suite

### 1. Advanced PDF Editor (Newly Enhanced!)
A comprehensive client-side editing workspace built for annotation, signing, and drawing:
*   **Text Tool**: 
    *   Add new text boxes and resize them proportionally.
    *   **Formatting Options**: Toggle **Bold** (B), *Italic* (I), and <u>Underline</u> (U) styles.
    *   **Double-Click Inline Editing**: Double-click any placed text annotation to immediately edit its content in-place without deleting and recreating it.
*   **Freehand Pen & Highlighter**:
    *   Draw smoothly using your mouse, trackpad, or finger.
    *   Highlighters use a uniform semi-transparent overlay.
    *   **SVG-Path PDF Export**: Replaced segment-based drawing with single continuous SVG path exports to guarantee **zero joint overlap seams** and smooth, professional rendering in the downloaded file.
*   **Shapes & Guides**: Draw rectangles, ellipses, straight lines, and directional arrows.
*   **Signatures & Images**:
    *   Drawn, typed, or uploaded signatures.
    *   **WASM Background Removal AI**: Seamlessly extracts signatures from paper photos.
    *   **Cropping Interface**: Features 20px padding (preventing handle clipping) and bounds-constrained cropping for signatures and images.
*   **8-Handle Resizer**: Corner resizers (`tl`, `tr`, `bl`, `br`) and side resizers (`t`, `b`, `l`, `r`) with responsive cursor feedback (`nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize`, `move`, `pointer`).
*   **Mobile Adaptations**:
    *   Compact UI (toolbar shrunk to `40px` and options shrunk by `50%`) to preserve vertical page space.
    *   **Touch target scaling**: Multiplies handle hit target tolerance to **`18px`** (diameter **`36px`**) when using touch inputs for frustration-free mobile editing.
    *   Polite, dismissible mobile optimization warning banner.

### 2. Merge PDF
Combine multiple PDF files into a single consolidated document, with interactive page reordering.

### 3. Split PDF
Extract specific page ranges or split every page of a document into separate files.

### 4. PDF Reorder & Organize
Rotate individual pages, rearrange their ordering, or delete unwanted pages.

### 5. PDF to Photo (JPG/PNG)
Render and extract PDF pages to high-resolution JPEG or PNG images.

### 6. Photo to PDF
Compile a collection of images (JPG, PNG, WebP) into a single optimized PDF document.

### 7. PDF Metadata Editor
Modify document properties including Title, Author, Subject, and Keywords.

---

## 📁 Project Structure

The project has a flat HTML structure at the root, with corresponding styling and scripting organized inside the `css/` and `js/` directories.

```text
pdfmaster.co.in/
├── index.html                  # Homepage (Main Portal)
├── merge-pdf.html              # Merge PDF Page
├── split-pdf.html              # Split PDF Page
├── pdf-reorder.html            # Reorder PDF Page
├── pdf-to-photo.html           # PDF to Photo Page
├── photo-to-pdf.html           # Photo to PDF Page
├── pdf-metadata.html           # PDF Metadata Editor Page
├── pdf-editor.html             # Advanced PDF Editor Page
│
├── css/                        # Stylesheets for each page
│   ├── index.css
│   ├── pdf-compiler.css        # Styles for Merge PDF
│   ├── pdf-split.css           # Styles for Split PDF
│   ├── pdf-reorder.css         # Styles for Reorder PDF
│   ├── pdf-to-photo.css        # Styles for PDF to Photo
│   ├── photo-to-pdf.css        # Styles for Photo to PDF
│   ├── pdf-metadata.css        # Styles for Metadata Editor
│   └── pdf-editor.css          # Styles for PDF Editor (contains Mobile Layouts)
│
├── js/                         # Client-Side Processing Logic
│   ├── index.js
│   ├── pdf-compiler.js         # Logic for Merge PDF
│   ├── pdf-split.js            # Logic for Split PDF
│   ├── pdf-reorder.js          # Logic for Reorder PDF
│   ├── pdf-to-photo.js         # Logic for PDF to Photo
│   ├── photo-to-pdf.js         # Logic for Photo to PDF
│   ├── pdf-metadata.js         # Logic for Metadata Editor
│   └── pdf-editor.js           # Core Canvas logic for PDF Editor
│
├── assets/                     # Graphic assets and icons
│   ├── apple-touch-icon.png
│   └── vendor/                 # Localized JS/CSS Library files
│       ├── Sortable.min.js     # For drag-and-drop page sorting
│       ├── jspdf.umd.min.js    # For document building (Photo-to-PDF)
│       ├── jszip.min.js        # For zipping files (PDF-to-Photo)
│       ├── pdf-3.11.174.min.js
│       ├── pdf.worker-3.11.174.min.js
│       ├── pdf-lib-1.17.1.min.js
│       ├── background-removal-1.5.6.esm.js
│       └── imgly-data/         # Model and WASM chunks for background removal
│
├── download_local_assets.py    # Python Offline Assets Installer
├── manifest.json               # Web App Manifest for PWA support
├── sitemap.xml                 # Search Engine Sitemap
├── robots.txt                  # Robots crawler guides
└── vercel.json                 # Vercel deployment configurations
```

---

## 📦 Local/Offline Mode Setup (CDN-Free)

By default, the website loads large external dependencies (like PDF parsing engines and the background-removal neural network weights) from CDNs on-demand to keep the initial page lightweight.

If you wish to run the project **fully offline** on a local server, we have provided a Python installer script. 

### Instructions:
1.  Clone the repository to your machine.
2.  Open your terminal in the root directory.
3.  Run the installer script:
    ```bash
    python3 download_local_assets.py
    ```

### What this script does:
*   Downloads the core JS libraries (`pdf-lib`, `pdf.js`, and the `@imgly` dynamic ESM wrapper) locally.
*   Parses the neural network data maps (`resources.json`) and downloads all **86 WebAssembly & ONNX AI model files** (~60MB) into `assets/vendor/imgly-data/`.
*   Rewrites references in `js/pdf-editor.js` to route all CDN operations locally.

---

## 🏗️ Core Technologies

*   **PDF-Lib**: For client-side PDF modification, font embedding, drawing vector paths, and document saving.
*   **PDF.js (by Mozilla)**: For rendering PDF documents to interactive HTML5 Canvas contexts.
*   **@imgly/background-removal**: ONNX-runtime based WebAssembly library for client-side signature background isolation.
*   **Vanilla HTML5 / Modern CSS / ES6 JavaScript**: Designed with clean layout patterns and fast execution loops.

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are always welcome. Feel free to open issues or submit pull requests.

⭐ **If you find this project useful, please consider giving it a star!**

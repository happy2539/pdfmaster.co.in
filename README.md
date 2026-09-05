# 📄 PDFMaster — Privacy-First, Zero-Upload Web PDF Tools

PDFMaster is a fast, secure, and completely client-side suite of PDF tools. All processing happens entirely within your web browser — **no files are ever uploaded to a server**, ensuring 100% privacy, data security, and instant performance.

👉 **Live Website**: [https://pdfmaster.co.in/](https://sh.pdfmaster.co.in/github-readme-pdfmaster)

---

## Key Architectural Pillars

- **100% Private (Zero Server Uploads)**: Your documents never leave your computer. PDFMaster leverages modern browser memory structures, WebAssembly (WASM), and client-side JavaScript to modify PDFs locally.

- **Native Speed**: Without network upload/download bottlenecks, operations like merging, splitting, drawing, and exporting complete in milliseconds.

- **Offline Ready**: Once loaded, the core application does not require internet access to function.

- **Responsive Aesthetics**: Implements modern design tokens, sleek dark/light mode configurations, smooth transitions, and premium graphics.

- **Without Login or Signup**: Our website is fully anonymuous. No login or Signup required.

- **Without Paywall**: We never charge any money for our services.


---

## 🛠️ Feature Rich Tool Suite



### 1. Advanced PDF Editor (Newly Enhanced!)

👉 **Live Website**: [https://pdfmaster.co.in/pdf-editor](https://sh.pdfmaster.co.in/github-pdf-editor)


A comprehensive client-side editing workspace built for annotation, signing, and drawing:

- **Text Tool**:
  - Add new text boxes and resize them proportionally.
  - **Formatting Options**: Toggle **Bold** (B), _Italic_ (I), and <u>Underline</u> (U) styles.
  - **Double-Click Inline Editing**: Double-click any placed text annotation to immediately edit its content in-place without deleting and recreating it.
- **Freehand Pen & Highlighter**:
  - Draw smoothly using your mouse, trackpad, or finger.
  - Highlighters use a uniform semi-transparent overlay.
  - **SVG-Path PDF Export**: Replaced segment-based drawing with single continuous SVG path exports to guarantee **zero joint overlap seams** and smooth, professional rendering in the downloaded file.
- **Shapes & Guides**: Draw rectangles, ellipses, straight lines, and directional arrows.
- **Signatures & Images**:
  - Drawn, typed, or uploaded signatures.
  - **WASM Background Removal AI**: Seamlessly extracts signatures from paper photos.
  - **Cropping Interface**: Features 20px padding (preventing handle clipping) and bounds-constrained cropping for signatures and images.
- **8-Handle Resizer**: Corner resizers (`tl`, `tr`, `bl`, `br`) and side resizers (`t`, `b`, `l`, `r`) with responsive cursor feedback (`nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize`, `move`, `pointer`).
- **Mobile Adaptations**:
  - Compact UI (toolbar shrunk to `40px` and options shrunk by `50%`) to preserve vertical page space.
  - **Touch target scaling**: Multiplies handle hit target tolerance to **`18px`** (diameter **`36px`**) when using touch inputs for frustration-free mobile editing.
  - Polite, dismissible mobile optimization warning banner.




### 2. Merge PDF

👉 **Live Website**: [https://pdfmaster.co.in/merge-pdf](https://sh.pdfmaster.co.in/github-merge-pdf)


A fast, privacy-first PDF merging tool that combines multiple PDF files directly in your browser without uploading them to any server.

* **100% Client-Side Processing**:

  * All merging is performed locally on your device.
  * Your PDF files never leave your browser, ensuring complete privacy and security.

* **Drag & Drop Upload**:

  * Add PDF files by dragging and dropping them into the workspace.
  * Supports selecting multiple PDF files at once for faster workflows.

* **Visual Page Ordering**:

  * Instantly view all selected PDFs in a sortable list.
  * Rearrange the merge order with intuitive drag-and-drop controls before combining files.

* **Quick File Management**:

  * Remove individual PDFs from the merge queue.
  * Clear the entire list with a single click and start over anytime.

* **Real-Time Merge Preview**:

  * Displays the current merge sequence before generating the final document.
  * Helps prevent accidental ordering mistakes.

* **High-Quality Output**:

  * Preserves the original page quality, dimensions, and formatting.
  * Generates a single merged PDF without unnecessary recompression.

* **Fast Browser-Based Processing**:

  * No waiting for uploads or server-side processing.
  * Performance scales with your device, making even large merges quick and responsive.

* **Cross-Platform Compatibility**:

  * Works seamlessly on desktops, tablets, and smartphones.
  * Compatible with all modern browsers without requiring installation.

* **Privacy-First Design**:

  * No accounts, registrations, subscriptions, or watermarks.
  * Completely free and open-source, allowing anyone to inspect the code and verify how the tool works.

* **Mobile Optimized Interface**:

  * Responsive layout designed for touch devices.
  * Large touch targets and streamlined controls make merging PDFs easy on smaller screens.





### 3. Split PDF

👉 **Live Website**: [https://pdfmaster.co.in/split-pdf](https://sh.pdfmaster.co.in/github-split-pdf)


A powerful, privacy-first PDF splitting tool that lets you extract exactly the pages you need directly in your browser, without uploading your files to any server.

* **100% Client-Side Processing**:

  * Every splitting operation is performed locally on your device.
  * Your PDF files never leave your browser, ensuring complete privacy and security.

* **Multiple Split Modes**:

  * **Custom Page Ranges**: Extract any pages using ranges like `1-3`, `5`, or `8-12`.
  * **Fixed Page Ranges**: Automatically split the document into files containing a fixed number of pages.
  * **Extract All Pages**: Save every page as its own individual PDF document.

* **Visual Page Selection**:

  * View page thumbnails before splitting.
  * Select or deselect pages with an intuitive visual interface for precise extraction.

* **Flexible Page Extraction**:

  * Create one or multiple PDF documents from a single file.
  * Keep only the pages you need while preserving the original quality.

* **ZIP Download Support**:

  * When multiple PDFs are generated, they are automatically packaged into a single ZIP archive for convenient downloading.

* **Original Quality Preserved**:

  * Maintains the original page dimensions, fonts, images, and formatting.
  * No unnecessary compression or quality loss during processing.

* **Fast Browser-Based Processing**:

  * No uploads, waiting queues, or server processing.
  * Processing speed depends on your device, providing instant results even for large documents.

* **Cross-Platform Compatibility**:

  * Works on Windows, macOS, Linux, Android, and iOS.
  * Compatible with all modern browsers without requiring software installation.

* **Privacy-First Experience**:

  * No registration, login, subscriptions, or watermarks.
  * Completely free and open-source, allowing anyone to inspect the code and verify how the tool works.

* **Mobile Optimized Interface**:

  * Responsive layout designed for phones and tablets.
  * Touch-friendly controls make selecting and extracting PDF pages effortless on smaller screens.





### 4. PDF Reorder & Organizer

👉 **Live Website**: [https://pdfmaster.co.in/pdf-reorder](https://sh.pdfmaster.co.in/github-pdf-reorder)


A powerful, privacy-first PDF organization tool that lets you rearrange, organize, and manage PDF pages directly in your browser without uploading your files to any server.

* **100% Client-Side Processing**:

  * Every page operation is performed locally on your device.
  * Your PDF files never leave your browser, ensuring complete privacy and security.

* **Visual Page Thumbnails**:

  * Instantly generates high-quality previews of every page.
  * Makes it easy to identify and organize pages before saving.

* **Drag & Drop Page Reordering**:

  * Rearrange pages with an intuitive drag-and-drop interface.
  * Changes are reflected instantly, making document organization fast and effortless.

* **Real-Time Organization**:

  * Preview the new page sequence before exporting.
  * Avoid ordering mistakes with instant visual feedback.

* **Page Management**:

  * Move any page to any position within the document.
  * Organize reports, scanned documents, presentations, and ebooks in just a few clicks.

* **Original Quality Preserved**:

  * Maintains the original page dimensions, fonts, images, and formatting.
  * Reorders pages without recompression or quality loss.

* **Fast Browser-Based Processing**:

  * No uploads or server-side processing delays.
  * Processing speed depends on your device for near-instant results.

* **Cross-Platform Compatibility**:

  * Works seamlessly on Windows, macOS, Linux, Android, and iOS.
  * Compatible with all modern browsers without requiring installation.

* **Privacy-First Experience**:

  * No registration, login, subscriptions, or watermarks.
  * Completely free and open-source, allowing anyone to inspect the code and verify how the tool works.

* **Mobile Optimized Interface**:

  * Responsive design for phones and tablets.
  * Touch-friendly drag-and-drop controls make page organization simple on smaller screens.





### 5. PDF to Photo

👉 **Live Website**: [https://pdfmaster.co.in/pdf-to-photo](https://sh.pdfmaster.co.in/github-pdf-to-photo)


A fast, privacy-first PDF to image converter that transforms every page of your PDF into high-quality photos directly in your browser, without uploading your files to any server. 

* **100% Client-Side Processing**:

  * Every conversion is performed locally on your device.
  * Your PDF files never leave your browser, ensuring complete privacy and security.

* **High-Quality Image Rendering**:

  * Convert every PDF page into crisp, high-resolution images.
  * Preserves text clarity, graphics, colors, and fine details for professional results. 

* **Adjustable Output Quality**:

  * Customize the image quality before conversion.
  * Balance visual quality and file size based on your requirements. 

* **Page-by-Page Conversion**:

  * Every PDF page is converted into an individual image.
  * Perfect for presentations, documents, reports, and sharing specific pages.

* **Bulk Download Support**:

  * Download individual images separately.
  * Export all converted pages together as a single ZIP archive for convenience. 

* **Original Layout Preserved**:

  * Maintains the original page dimensions, orientation, colors, and formatting.
  * Produces images that closely match the source PDF.

* **Fast Browser-Based Processing**:

  * No uploads or server-side waiting times.
  * Conversion begins instantly and is powered by your device for maximum speed.

* **Cross-Platform Compatibility**:

  * Works seamlessly on Windows, macOS, Linux, Android, and iOS.
  * Compatible with all modern browsers without requiring installation.

* **Privacy-First Experience**:

  * No registration, login, subscriptions, or watermarks.
  * Completely free and open-source, allowing anyone to inspect the code and verify how the tool works. 

* **Mobile Optimized Interface**:

  * Responsive design built for phones and tablets.
  * Touch-friendly controls make converting PDFs into images quick and effortless on any device.





### 6. Photo to PDF

👉 **Live Website**: [https://pdfmaster.co.in/photo-to-pdf](https://sh.pdfmaster.co.in/github-photo-to-pdf)


A powerful, privacy-first image to PDF converter that transforms one or multiple photos into a professional PDF directly in your browser, without uploading your files to any server. It supports all major image formats, customizable page settings, and drag-and-drop organization for complete control over your document. 

* **100% Client-Side Processing**:

  * Every conversion happens entirely on your device.
  * Your images never leave your browser, ensuring complete privacy and security.

* **Multi-Format Image Support**:

  * Supports **JPG, JPEG, PNG, WEBP, BMP, GIF, TIFF, SVG, and AVIF**.
  * Convert one or multiple images without requiring any pre-conversion. 

* **Batch Image Conversion**:

  * Combine dozens of photos into a single multi-page PDF.
  * Perfect for scanned documents, reports, assignments, portfolios, and photo albums. 

* **Drag & Drop Reordering**:

  * Rearrange image thumbnails before generating the PDF.
  * Instantly organize pages in the exact order you want. 

* **Custom Page Settings**:

  * Choose between **A4, Letter, Legal,** or **Fit to Image** page sizes.
  * Configure **Portrait, Landscape,** or **Auto-Detect** page orientation for the best layout. 

* **PDF Optimization**:

  * Reduce the output PDF size with built-in image optimization.
  * Balance image quality and file size without significant visual loss. 

* **Original Image Quality Preserved**:

  * Maintains sharpness, colors, and aspect ratios for professional-looking PDFs.
  * Produces clean, high-quality documents suitable for printing and sharing.

* **Fast Browser-Based Processing**:

  * No uploads, waiting queues, or server-side processing.
  * Your PDF is generated instantly using your device's processing power. 

* **Cross-Platform Compatibility**:

  * Works seamlessly on Windows, macOS, Linux, Android, and iOS.
  * Compatible with all modern browsers without requiring installation.

* **Privacy-First Experience**:

  * No registration, login, subscriptions, or watermarks.
  * Completely free and open-source, allowing anyone to inspect the code and verify how the tool works. 

* **Mobile Optimized Interface**:

  * Responsive layout designed for phones and tablets.
  * Touch-friendly controls make selecting, reordering, and converting images into PDFs simple on any device. 




### 7. PDF Metadata Editor

👉 **Live Website**: [https://pdfmaster.co.in/pdf-metadata](https://sh.pdfmaster.co.in/github-pdf-metadata)


A powerful, privacy-first metadata editor that lets you view, edit, update, or remove PDF metadata directly in your browser without uploading your files to any server.

* **100% Client-Side Processing**:

  * All metadata reading and editing happens locally on your device.
  * Your PDF files never leave your browser, ensuring complete privacy and security. 

* **Edit Standard PDF Metadata**:

  * Modify the **Title**, **Author**, **Subject**, and **Keywords** of your PDF.
  * Update document information without affecting the actual page content. 

* **Automatic Metadata Detection**:

  * Instantly reads the existing metadata from your PDF.
  * Pre-fills available fields, allowing quick review and editing before saving.

* **Remove Sensitive Metadata**:

  * Clear metadata fields to help protect your privacy before sharing documents.
  * Remove unnecessary document information with a single action. 

* **Preserve Original PDF Content**:

  * Updates only the document metadata.
  * Maintains the original pages, fonts, images, layout, and formatting without modification. 

* **Instant Browser-Based Editing**:

  * No uploads, waiting queues, or server-side processing.
  * Save the updated PDF within seconds using your device's processing power.

* **Cross-Platform Compatibility**:

  * Works seamlessly on Windows, macOS, Linux, Android, and iOS.
  * Compatible with all modern browsers without requiring installation.

* **Privacy-First Experience**:

  * No registration, login, subscriptions, or watermarks.
  * Completely free and open-source, allowing anyone to inspect the code and verify how the tool works. 

* **Mobile Optimized Interface**:

  * Responsive design for phones and tablets.
  * Touch-friendly input fields make viewing and editing PDF metadata simple on any device.




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
├── contact.html                # Contact Page
├── subscribe.html              # Subscribe Page
├── terms.html                  # Terms and Condition
├── thank-you.html              # Thank You redirect page for subscribers
├── privacy.html                # Privacy Policy
├── pdf-metadata.html           # PDF Metadata Editor Page
├── pdf-editor.html             # Advanced PDF Editor Page
├── pdf-viewer.html             # PDF Viewer Page
├── watermark-pdf-add.html      # Watermark PDF Page
├── about.html                  # About Page
├── announcements.html          # Announcement Page
├── happy-gupta-founder-of-pdfmaster.html       #Founder Page of PDFMaster
├── offline.html                #sw utility
├── sw.js                       #sw file
│
├── css/                        # Stylesheets for each page
│   │
│   ├── index.css                  # CSS Homepage (Main Portal)
│   ├── merge-pdf.css              # CSS Merge PDF Page
│   ├── split-pdf.css              # CSS Split PDF Page
│   ├── pdf-reorder.css            # CSS Reorder PDF Page
│   ├── pdf-to-photo.css           # CSS PDF to Photo Page
│   ├── photo-to-pdf.css           # CSS Photo to PDF Page
│   ├── contact.css                # CSS Contact Page
│   ├── subscribe.css              # CSS Subscribe Page
│   ├── terms.css                  # CSS Terms and Condition
│   ├── thank-you.css              # CSS Thank You redirect page for subscribers
│   ├── privacy.css                # CSS Privacy Policy
│   ├── pdf-metadata.css           # CSS PDF Metadata Editor Page
│   ├── pdf-editor.css             # CSS Advanced PDF Editor Page
│   ├── pdf-viewer.css             # CSS PDF Viewer Page
│   ├── watermark-pdf-add.css      # CSS Watermark PDF Page
│   ├── about.css                  # CSS About Page
│   ├── announcements.css          # CSS Announcement Page
|   ├── happy-gupta-founder-of-pdfmaster.css        #stylesheet
│   └── 404.css                    # CSS 404 Page
│
├── js/                         # Client-Side Processing Logic
│   │
│   ├── index.js                  # Js Homepage (Main Portal)
│   ├── merge-pdf.js              # Js Merge PDF Page
│   ├── split-pdf.js              # Js Split PDF Page
│   ├── pdf-reorder.js            # Js Reorder PDF Page
│   ├── pdf-to-photo.js           # Js PDF to Photo Page
│   ├── photo-to-pdf.js           # Js Photo to PDF Page
│   ├── contact.js                # Js Contact Page
│   ├── subscribe.js              # Js Subscribe Page
│   ├── terms.js                  # Js Terms and Condition
│   ├── thank-you.js              # Js Thank You redirect page for subscribers
│   ├── privacy.js                # Js Privacy Policy
│   ├── pdf-metadata.js           # Js PDF Metadata Editor Page
│   ├── pdf-editor.js             # Js Advanced PDF Editor Page (loader)
│   ├── pdf-editor/               # Modularized PDF Editor modules
│   ├── pdf-viewer.js             # Js PDF Viewer Page
│   ├── watermark-pdf-add.js      # Js Watermark PDF Page
│   ├── about.js                  # Js About Page
│   ├── announcements.js          # Js Announcement Page
|   ├── happy-gupta-founder-of-pdfmaster.js         #JS file for the founder page
|   ├── sw-register.js            # Js for the service worker
│   └── 404.js                    # Js 404 Page
│
├── assets/                     # Graphic assets and icons
│   ├── android-chrome-192x192.png
│   ├── android-chrome-512x512.png
│   ├── apple-touch-icon.png
│   ├── developer.png
│   ├── developer.webp
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── favicon.ico
│   ├── site.webmanifest
│   │
│   ├── vendor/                 # Localized JS/CSS Library files
│   │   ├── background-removal-1.5.6.esm.js
│   │   ├── jspdf.umd.min.js
│   │   ├── jszip.min.js
│   │   ├── pdf-3.4.120.min.js
│   │   ├── pdf-3.11.174.min.js
│   │   ├── pdf-lib-1.17.1.min.js
│   │   ├── pdf-lib.min.js
│   │   ├── pdf.min.js
│   │   ├── pdf.worker-3.4.120.min.js
│   │   ├── pdf.worker-3.11.174.min.js
│   │   ├── pdf.worker.min.js
│   │   └── pdf.worker.min.js
│   │
│   └── fonts
│       ├── 1_rP2Wp2ywxg089UriCZaSExdy3sGt9zz86D3wyKy58Q.woff2
│       ├── 2_xMQbuFFYT72XzQspDre2.woff2
│       ├── 3_xMQbuFFYT72XzQUpDg.woff2
│       ├── 4_rP2Hp2ywxg089UriCZOIHQ.woff2
│       ├── 5_rP2Wp2ywxg089UriCZaSExdy3sGt9zz86D3wyKK58VXh.woff2
│       ├── 6_rP2Hp2ywxg089UriCZ2IHSeH.woff2
│       └── fonts.css
│
├── download_local_assets.py    # Python Offline Assets Installer
├── _redirects                  # Redirects Rules
├── CNAME                       # CNAME File
├── 404.html                    # 404 Page
├── manifest.json               # Web App Manifest for PWA support
├── sitemap.xml                 # Search Engine Sitemap
├── robots.txt                  # Robots crawler guides
├── README.md                   # README file for the website use and offine use
├── robots.txt                  # Crawling rule
├── sitemap.xml                 # Sitemap of pdfmaster.co.in
└── vercel.json                 # Vercel deployment configurations
```

---

## Local/Offline Mode Setup (CDN-Free)

By default, the website loads large external dependencies (like PDF parsing engines and the background-removal neural network weights) from CDNs on-demand to keep the initial page lightweight.

If you wish to run the project **fully offline** on a local device, we have provided a Python installer script.

### Instructions:


### Linux

### Prerequisites

Ensure you have **Python 3.6+** installed on your system. You can check your version by running:
```bash
python3 --version 
```

Clone the repo to you local system

```bash
git clone https://github.com/happy2539/pdfmaster.co.in.git
```

Run the script to install the dependencies

```bash
python3 download_local_assets.py  
```


## Windows

### Prerequisites
Ensure you have **Python 3.6+** installed. 
*   Check installation: Open Command Prompt and type `python --version` or `py --version`.
*   *Note: If `python` is not recognized, try using the `py` command, which is the standard Python Launcher for Windows.* 

### Installation
1.  **Clone the repository**:
    Open Command Prompt or PowerShell and run:
    ```powershell
    git clone https://github.com/happy2539/pdfmaster.co.in.git
    ```

2.  **Install Dependencies** :
    ```powershell
    python -m pip install -r download_local_assets.py
    ```
    *(Or use `py -m pip install -r download_local_assets.py` if `python` command is not found)* 
  


## macOS

### Prerequisites

Ensure you have **Python 3.6+** installed.
*   **Check Installation**: Open Terminal and type:
    ```bash
    python3 --version
    ```
*   *Note: If `python3` is not found, you can install it via [Homebrew](https://brew.sh/) (`brew install python`) or download it from [python.org](https://www.python.org/downloads/).*

### Installation
1.  **Clone the repository**:
    Open Terminal and run:
    ```bash
    git clone https://github.com/happy2539/pdfmaster.co.in.git
    ```

2.  **Install Dependencies** :
    ```bash
    pip3 install -r download_local_assets.py
    ```



### What this script does:

- Downloads the core JS libraries (`pdf-lib`, `pdf.js`, and the `@imgly` dynamic ESM wrapper) locally.

- Parses the neural network data maps (`resources.json`) and downloads all **86 WebAssembly & ONNX AI model files** (~60MB) into `assets/vendor/imgly-data/`.

- Rewrites the path of CDNs and AI Model to route all CDNs operations locally.

---

## Core Technologies

- **PDF-Lib**: For client-side PDF modification, font embedding, drawing vector paths, and document saving.

- **PDF.js (by Mozilla)**: For rendering PDF documents to interactive HTML5 Canvas contexts.

- **@imgly/background-removal**: ONNX-runtime based WebAssembly library for client-side signature background isolation.

- **Vanilla HTML5 / Modern CSS / ES6 JavaScript**: Designed with clean layout patterns and fast execution loops.

---

## Contributing

Contributions, bug reports, and suggestions are always welcome. Feel free to open issues or submit pull requests.

⭐ **If you find this project useful, please consider giving it a star!**

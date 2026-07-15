import os
import json
import urllib.request
import re

def download_file(url, filepath):
    print(f"Downloading: {url} -> {filepath}")
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req) as response:
            with open(filepath, 'wb') as f:
                f.write(response.read())
    except Exception as e:
        print(f"Error downloading {url}: {e}")

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    vendor_dir = os.path.join(base_dir, "assets", "vendor")
    imgly_dir = os.path.join(vendor_dir, "imgly-data")
    
    # 1. Download Core JS libraries
    libraries = {
        "pdf-lib-1.17.1.min.js": "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
        "pdf-3.11.174.min.js": "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
        "pdf.worker-3.11.174.min.js": "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
        "background-removal-1.5.6.esm.js": "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.6/+esm"
    }
    
    print("Step 1: Downloading core JavaScript libraries...")
    for filename, url in libraries.items():
        filepath = os.path.join(vendor_dir, filename)
        if not os.path.exists(filepath):
            download_file(url, filepath)
        else:
            print(f"Library already exists: {filename}")
            
    # 2. Download imgly-data assets
    print("\nStep 2: Downloading background removal AI model resources...")
    imgly_base_url = "https://staticimgly.com/@imgly/background-removal-data/1.5.6/dist/"
    resources_url = imgly_base_url + "resources.json"
    resources_path = os.path.join(imgly_dir, "resources.json")
    
    download_file(resources_url, resources_path)
    
    if os.path.exists(resources_path):
        try:
            with open(resources_path, 'r', encoding='utf-8') as f:
                resources = json.load(f)
            
            # Collect all unique chunk hashes
            hashes = set()
            for key, val in resources.items():
                if isinstance(val, dict) and "chunks" in val:
                    for chunk in val["chunks"]:
                        if "hash" in chunk:
                            hashes.add(chunk["hash"])
            
            print(f"Found {len(hashes)} neural model chunks to download...")
            
            for i, h in enumerate(hashes, 1):
                hash_filepath = os.path.join(imgly_dir, h)
                if not os.path.exists(hash_filepath):
                    print(f"[{i}/{len(hashes)}] ", end="")
                    download_file(imgly_base_url + h, hash_filepath)
                else:
                    print(f"[{i}/{len(hashes)}] Model chunk already exists: {h}")
        except Exception as e:
            print(f"Error parsing resources.json: {e}")
            
    # 3. Rewrite js/pdf-editor.js to use local paths
    print("\nStep 3: Configuring references in website code...")
    js_path = os.path.join(base_dir, "js", "pdf-editor.js")
    if os.path.exists(js_path):
        with open(js_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        old_pattern = r'publicPath:\s*["\']https://staticimgly\.com/@imgly/background-removal-data/1\.5\.6/dist/["\']'
        new_string = 'publicPath: "./assets/vendor/imgly-data/"'
        
        if re.search(old_pattern, content):
            content = re.sub(old_pattern, new_string, content)
            with open(js_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print("Successfully updated publicPath inside js/pdf-editor.js to point locally!")
        else:
            print("publicPath was already configured locally or not found inside js/pdf-editor.js.")
            
    print("\nDone! Local offline setup is complete. You can now run the PDF Editor completely offline.")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import os
import re
import shutil
from pathlib import Path

def read_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(filename, content):
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

def extract_version(version_content):
    # Use regex to find the version string
    match = re.search(r'version:\s*"([^"]+)"', version_content)
    if match:
        return match.group(1)
    raise ValueError("Could not find version in version.js")

def bump_version(version):
    major, minor, patch = map(int, version.split('.'))
    return f"{major}.{minor}.{patch + 1}"

def update_version_file(filename, new_version):
    content = read_file(filename)
    # Fixed regex pattern
    pattern = r'(version:\s*)"([^"]+)"'
    replacement = f'\\1"{new_version}"'
    updated_content = re.sub(pattern, replacement, content)
    write_file(filename, updated_content)

try:
    # Read and bump the version
    version_file = 'config/version.js'
    version_content = read_file(version_file)
    current_version = extract_version(version_content)
    new_version = bump_version(current_version)

    # Update version.js with new version
    update_version_file(version_file, new_version)
    print(f"Version bumped from {current_version} to {new_version}")

    # Create dist directory if it doesn't exist
    os.makedirs('dist', exist_ok=True)

    # Set output filename
    versioned_filename = f'dist/voicefaster-extension-v{new_version}.js'
    test_filename = 'test/voicefaster-test.js'

    # Read other files
    css_content = read_file('src/voicefaster.css')
    js_content = read_file('src/voicefaster.js')
    template = read_file('src/template.js')

    # Perform the replacements
    output = template.replace('{{voicefaster-version}}', new_version)
    output = output.replace('{{voicefaster.css}}', css_content)
    output = output.replace('{{voicefaster-classes.js}}', js_content)

    # Write the result
    write_file(versioned_filename, output)
    write_file(test_filename, output)

    print(f"Build completed successfully! Output: {versioned_filename}")

    # Ask about copying to live
    while True:
        response = input("Copy to live directory? (y/n): ").lower()
        if response in ['y', 'n']:
            if response == 'y':
                live_dir = Path('../../live')
                if not live_dir.exists():
                    live_dir.mkdir(parents=True)
                shutil.copy2(versioned_filename, live_dir / Path(versioned_filename).name)
                print(f"Copied to ../../live/{Path(versioned_filename).name}")
            break
        print("Please enter 'y' or 'n'")

except FileNotFoundError as e:
    print(f"Error: Could not find file: {e.filename}")
except ValueError as e:
    print(f"Error: {str(e)}")
except Exception as e:
    print(f"Error: {str(e)}")

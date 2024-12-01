#!/usr/bin/env python3
import os
import re

def read_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        return f.read()

def extract_version(version_content):
    # Use regex to find the version string
    match = re.search(r'version:\s*"([^"]+)"', version_content)
    if match:
        return match.group(1)
    raise ValueError("Could not find version in version.js")

try:
    # Read the version first
    version_content = read_file('config/version.js')
    version = extract_version(version_content)

    # Create dist directory if it doesn't exist
    os.makedirs('dist', exist_ok=True)

    # Set output filename
    output_filename = f'dist/voicefaster-extension-v{version}.js'

    # Read other files
    css_content = read_file('src/voicefaster.css')
    js_content = read_file('src/voicefaster.js')
    template = read_file('src/template.js')

    # Perform the replacements
    output = template.replace('{{voicefaster-version}}', version)
    output = output.replace('{{voicefaster.css}}', css_content)
    output = output.replace('{{voicefaster-classes.js}}', js_content)

    # Write the result
    with open(output_filename, 'w', encoding='utf-8') as f:
        f.write(output)

    print(f"Build completed successfully! Output: {output_filename}")

except FileNotFoundError as e:
    print(f"Error: Could not find file: {e.filename}")
except ValueError as e:
    print(f"Error: {str(e)}")
except Exception as e:
    print(f"Error: {str(e)}")

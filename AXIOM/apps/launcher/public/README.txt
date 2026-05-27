AXIOM editor syntax hotfix v1.3

What this fixes:
- axiom-editor.html line ~1274: removed an accidental outer `try {` with no catch/finally.
- fixed a small notify() call shape in generated AI command execution.

How to apply:
1. Copy `public\axiom-editor.html` into your AXIOM bundle's `public` folder.
2. Replace the existing file when Windows asks.
3. Re-launch AXIOM from the desktop shortcut.

The favicon 404 is harmless and does not block the editor.
The async listener warning is usually from a browser extension and does not block the editor.

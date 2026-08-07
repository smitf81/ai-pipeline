import fs from 'node:fs';
import vm from 'node:vm';

const editorPath = 'AXIOM/apps/launcher/public/axiom-editor.html';
const html = fs.readFileSync(editorPath, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean);

if (!scripts.length) {
  throw new Error(`No inline scripts found in ${editorPath}`);
}

scripts.forEach((source, index) => {
  try {
    new vm.Script(source, { filename: `${editorPath}#inline-script-${index + 1}` });
  } catch (error) {
    error.message = `Inline script ${index + 1} failed syntax check: ${error.message}`;
    throw error;
  }
});

console.log(`axiom editor inline scripts ok (${scripts.length})`);

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export default async function runTalentUiTests() {
  const publicDir = path.resolve(process.cwd(), 'public');
  const [indexHtml, appJs, styleCss] = await Promise.all([
    fs.readFile(path.join(publicDir, 'index.html'), 'utf8'),
    fs.readFile(path.join(publicDir, 'app.js'), 'utf8'),
    fs.readFile(path.join(publicDir, 'style.css'), 'utf8'),
  ]);

  assert.match(indexHtml, /id="talentGapInput"/);
  assert.match(indexHtml, /id="generateCandidatesBtn"/);
  assert.match(indexHtml, /id="taCandidateResults"/);
  assert.match(indexHtml, /id="taDepartmentStatus"/);
  assert.match(indexHtml, /id="taDepartmentCoverage"/);
  assert.match(indexHtml, /id="taDepartmentRoster"/);

  assert.match(appJs, /\/api\/ta\/candidates/);
  assert.match(appJs, /renderTalentCandidates/);
  assert.match(appJs, /hireTalentCandidate/);
  assert.match(appJs, /loadTalentDepartment/);
  assert.match(appJs, /window\.__ACE_APP_TEST__/);

  assert.match(styleCss, /\.ta-candidate-grid/);
  assert.match(styleCss, /\.ta-candidate-card/);
  assert.match(styleCss, /\.ta-cv-card/);
  assert.match(styleCss, /\.ta-gap-summary/);
  assert.match(styleCss, /\.ta-gap-chip/);
  assert.match(styleCss, /\.ta-coverage-grid/);
  assert.match(styleCss, /\.ta-roster-grid/);
}

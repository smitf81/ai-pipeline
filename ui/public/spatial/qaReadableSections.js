function normalizeRenderObject(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeRenderText(value = '') {
  return typeof value === 'string' ? value.trim() : String(value == null ? '' : value).trim();
}

function normalizeRenderList(value = []) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function summarizeCanonicalTruthSections(sectionMap = {}) {
  const entries = Object.entries(normalizeRenderObject(sectionMap))
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value));
  const keys = entries.map(([key]) => key);
  const preferredKeys = keys.filter((key) => key !== 'route').slice(0, 2);
  return {
    count: entries.length,
    keys,
    preferredKeys: preferredKeys.length ? preferredKeys : keys.slice(0, 2),
  };
}

export function decorateQaReadableSections(sections = [], {
  provenanceLabel = 'Derived',
  canonicalTruthSections = null,
} = {}) {
  const items = normalizeRenderList(sections).map((section) => {
    const source = normalizeRenderObject(section);
    const summary = normalizeRenderText(source.summary, '');
    const provenance = {
      label: provenanceLabel,
      classification: provenanceLabel.toLowerCase() === 'governed' ? 'governed' : 'derived',
      source: provenanceLabel.toLowerCase() === 'governed' ? 'canonicalTruthSections' : 'qaState synthesis',
    };
    return {
      ...source,
      provenance,
      summary: summary ? `${provenanceLabel} | ${summary}` : provenanceLabel,
    };
  });

  const governedSummary = summarizeCanonicalTruthSections(canonicalTruthSections);
  if (governedSummary.count > 0) {
    items.unshift({
      id: 'qa-governed-sections',
      label: 'Governed QA sections',
      kind: 'summary',
      value: `${governedSummary.count} canonical section group${governedSummary.count === 1 ? '' : 's'}`,
      detail: `Keys: ${governedSummary.preferredKeys.length ? governedSummary.preferredKeys.join(' / ') : 'n/a'}`,
      provenance: {
        label: 'Governed',
        classification: 'governed',
        source: 'canonicalTruthSections',
      },
    });
  }

  return items;
}

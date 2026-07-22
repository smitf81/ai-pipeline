const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOMAINS_FILE = path.join(ROOT, 'brain', 'emergence', 'canonical_truth_domains.json');
const PROJECTIONS_FILE = path.join(ROOT, 'brain', 'emergence', 'canonical_truth_projections.json');

const DECLARED_TRUTH_DRIFT = Object.freeze([
]);

const KNOWN_TRUTH_BEARING_ROUTES = Object.freeze([
  '/api/spatial/runtime',
  '/api/spatial/truth-kernel',
  '/api/spatial/desks/:deskId/properties',
  '/api/spatial/workspace',
  '/api/spatial/intent',
  '/api/spatial/field-influence',
  '/api/spatial/ghost-projection',
  '/api/qa/lead/state',
  '/api/qa/repair-loop/state',
  '/api/spatial/qa/runs',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getProjectionGovernedRoutes(projection = {}) {
  const routes = [projection?.route, ...(Array.isArray(projection?.governedRoutes) ? projection.governedRoutes : [])];
  return [...new Set(routes.map((route) => String(route || '').trim()).filter(Boolean))];
}

function loadCanonicalTruthDomains() {
  const payload = readJson(DOMAINS_FILE);
  return Array.isArray(payload?.domains) ? payload.domains : [];
}

function loadCanonicalTruthProjections() {
  const payload = readJson(PROJECTIONS_FILE);
  return Array.isArray(payload?.projections) ? payload.projections : [];
}

function getCanonicalTruthDomain(domainId) {
  const targetId = String(domainId || '').trim();
  return loadCanonicalTruthDomains().find((entry) => entry.domainId === targetId) || null;
}

function getCanonicalTruthProjection(projectionId) {
  const targetId = String(projectionId || '').trim();
  return loadCanonicalTruthProjections().find((entry) => entry.projectionId === targetId) || null;
}

function validateCanonicalTruthRegistry() {
  const domains = loadCanonicalTruthDomains();
  const projections = loadCanonicalTruthProjections();
  const domainIds = new Set(domains.map((entry) => entry.domainId));
  const errors = [];

  domains.forEach((domain) => {
    if (!String(domain?.domainId || '').trim()) {
      errors.push('domain missing domainId');
    }
    if (!String(domain?.canonicalOwner || '').trim()) {
      errors.push(`domain "${domain?.domainId || 'unknown'}" is missing canonicalOwner`);
    }
    if (!String(domain?.systemOfRecord || '').trim()) {
      errors.push(`domain "${domain?.domainId || 'unknown'}" is missing systemOfRecord`);
    }
    if (!String(domain?.mutationAuthority || '').trim()) {
      errors.push(`domain "${domain?.domainId || 'unknown'}" is missing mutationAuthority`);
    }
  });

  projections.forEach((projection) => {
    if (!String(projection?.projectionId || '').trim()) {
      errors.push('projection missing projectionId');
    }
    if (!domainIds.has(projection.sourceDomain)) {
      errors.push(`projection "${projection.projectionId}" references undeclared sourceDomain "${projection.sourceDomain}"`);
    }
    if (!domainIds.has(projection.projectionId)) {
      errors.push(`projection "${projection.projectionId}" does not have a matching declared domain`);
    }
    if (!String(projection?.builder || '').trim()) {
      errors.push(`projection "${projection.projectionId}" is missing builder metadata`);
    }
    if (!String(projection?.route || '').trim()) {
      errors.push(`projection "${projection.projectionId}" is missing route metadata`);
    }
    if (
      projection?.governedRoutes != null
      && (!Array.isArray(projection.governedRoutes)
        || projection.governedRoutes.some((route) => !String(route || '').trim()))
    ) {
      errors.push(`projection "${projection.projectionId}" has invalid governedRoutes metadata`);
    }
    if (!Array.isArray(projection?.consumers) || projection.consumers.length === 0) {
      errors.push(`projection "${projection.projectionId}" is missing consumer metadata`);
    }
    if (!String(projection?.classification || '').trim()) {
      errors.push(`projection "${projection.projectionId}" is missing classification metadata`);
    }
    if (typeof projection?.readOnly !== 'boolean') {
      errors.push(`projection "${projection.projectionId}" is missing readOnly metadata`);
    }
    if (!String(projection?.readinessSemantics || '').trim()) {
      errors.push(`projection "${projection.projectionId}" is missing readinessSemantics metadata`);
    }
    const targetDomain = domains.find((entry) => entry.domainId === projection.projectionId) || null;
    if (targetDomain && !Array.isArray(targetDomain.allowedProjections || [])) {
      errors.push(`domain "${projection.projectionId}" is missing allowedProjections metadata`);
    }
    if (targetDomain && Array.isArray(targetDomain.allowedProjections) && !targetDomain.allowedProjections.includes(projection.projectionId)) {
      errors.push(`domain "${projection.projectionId}" does not allow projection "${projection.projectionId}"`);
    }
  });

  ['workspace', 'runtime', 'truth_kernel', 'desk_properties', 'intent', 'field_influence', 'ghost_projection', 'qa_evidence'].forEach((projectionId) => {
    if (!projections.find((entry) => entry.projectionId === projectionId)) {
      errors.push(`required projection "${projectionId}" is missing`);
    }
  });

  const declaredOrTrackedRoutes = new Set([
    ...projections.flatMap((entry) => getProjectionGovernedRoutes(entry)),
    ...DECLARED_TRUTH_DRIFT.map((entry) => entry.route),
  ]);
  KNOWN_TRUTH_BEARING_ROUTES.forEach((route) => {
    if (!declaredOrTrackedRoutes.has(route)) {
      errors.push(`known truth-bearing route "${route}" is not declared or tracked as drift`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    domains,
    projections,
  };
}

function listCanonicalTruthDrift() {
  return DECLARED_TRUTH_DRIFT.map((entry) => ({ ...entry }));
}

module.exports = {
  DOMAINS_FILE,
  PROJECTIONS_FILE,
  KNOWN_TRUTH_BEARING_ROUTES,
  getProjectionGovernedRoutes,
  loadCanonicalTruthDomains,
  loadCanonicalTruthProjections,
  getCanonicalTruthDomain,
  getCanonicalTruthProjection,
  validateCanonicalTruthRegistry,
  listCanonicalTruthDrift,
};

const {
  getCanonicalTruthDomain,
  getCanonicalTruthProjection,
  validateCanonicalTruthRegistry,
} = require('./canonicalTruthRegistry');
const {
  createCanonicalTruthEnvelope,
  decorateCanonicalTruthPayload,
} = require('./canonicalTruthEnvelope');

function createCanonicalTruthAccess({ repositories = {}, builders = {} } = {}) {
  const registryValidation = validateCanonicalTruthRegistry();
  if (!registryValidation.ok) {
    throw new Error(`Canonical truth registry invalid: ${registryValidation.errors.join('; ')}`);
  }

  return {
    async resolveProjection(projectionId, context = {}) {
      const projection = getCanonicalTruthProjection(projectionId);
      if (!projection) {
        throw new Error(`Canonical truth projection "${projectionId}" is not declared.`);
      }
      const sourceDomain = getCanonicalTruthDomain(projection.sourceDomain);
      if (!sourceDomain) {
        throw new Error(`Canonical truth source domain "${projection.sourceDomain}" is not declared.`);
      }
      const targetDomain = getCanonicalTruthDomain(projection.projectionId);
      if (!targetDomain) {
        throw new Error(`Canonical truth domain "${projection.projectionId}" is not declared.`);
      }
      const repository = repositories[sourceDomain.domainId];
      if (typeof repository !== 'function') {
        throw new Error(`Canonical truth repository for domain "${sourceDomain.domainId}" is not registered.`);
      }
      const builder = builders[projection.builder];
      if (typeof builder !== 'function') {
        throw new Error(`Canonical truth builder "${projection.builder}" is not registered.`);
      }

      const sourceData = await repository({
        ...context,
        sourceDomain,
        targetDomain,
        projection,
      });
      const data = await builder({
        ...context,
        sourceData,
        sourceDomain,
        targetDomain,
        projection,
      });
      const canonicalTruthMeta = data?.__canonicalTruthMeta && typeof data.__canonicalTruthMeta === 'object'
        ? data.__canonicalTruthMeta
        : {};

      return createCanonicalTruthEnvelope({
        domain: targetDomain.domainId,
        projectionId: projection.projectionId,
        classification: canonicalTruthMeta.classification || projection.classification || targetDomain.classificationDefault || 'projection',
        sourceOfTruth: sourceDomain.systemOfRecord,
        owner: canonicalTruthMeta.owner || targetDomain.canonicalOwner,
        generatedAt: canonicalTruthMeta.generatedAt || data?.generatedAt || context.generatedAt || new Date().toISOString(),
        freshness: canonicalTruthMeta.freshness || context.freshness || 'live',
        fallbackUsed: typeof canonicalTruthMeta.fallbackUsed === 'boolean'
          ? canonicalTruthMeta.fallbackUsed
          : Boolean(context.fallbackUsed),
        data,
      });
    },

    async resolveProjectionResponse(projectionId, context = {}) {
      const envelope = await this.resolveProjection(projectionId, context);
      return decorateCanonicalTruthPayload(envelope);
    },
  };
}

module.exports = {
  createCanonicalTruthAccess,
};

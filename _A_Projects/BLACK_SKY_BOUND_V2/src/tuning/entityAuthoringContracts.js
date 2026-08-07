export const ENTITY_AUTHORING_TARGET_CONTRACT = 'axiom.entity-authoring-target.v0';
export const ENTITY_AUTHORING_FIELD_MANIFEST_CONTRACT = 'axiom.entity-authoring-field-manifest.v0';
export const ENTITY_AUTHORING_CANDIDATE_CONTRACT = 'axiom.entity-authoring-candidate.v0';
export const ENTITY_AUTHORING_APPLY_RECEIPT_CONTRACT = 'axiom.entity-authoring-apply-receipt.v0';
export const ENTITY_AUTHORING_COMMAND_CONTRACT = 'axiom.entity-authoring.command.v0';
export const ENTITY_AUTHORING_RESPONSE_CONTRACT = 'axiom.entity-authoring.response.v0';
export const ENTITY_AUTHORING_READY_CONTRACT = 'axiom.entity-authoring.ready.v0';

export function hashEntityAuthoringState(value) {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

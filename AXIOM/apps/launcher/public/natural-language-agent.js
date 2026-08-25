export const AXIOM_AGENT_INTENT_CONTRACT = 'axiom.agent-intent.v1';

export const AXIOM_AGENT_INTENT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'contract',
    'outcome',
    'intentSummary',
    'successCriteria',
    'plan',
    'clarification',
    'confidence'
  ],
  properties: {
    contract: { const: AXIOM_AGENT_INTENT_CONTRACT },
    outcome: { enum: ['act', 'conversation', 'clarify'] },
    intentSummary: { type: 'string', minLength: 1, maxLength: 240 },
    successCriteria: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 240 }
    },
    plan: {
      type: 'array',
      maxItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'operation', 'arguments', 'reason'],
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          operation: { type: 'string', minLength: 1, maxLength: 120 },
          arguments: { type: 'object' },
          reason: { type: 'string', minLength: 1, maxLength: 320 }
        }
      }
    },
    clarification: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['question', 'options'],
          properties: {
            question: { type: 'string', minLength: 1, maxLength: 240 },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: { type: 'string', minLength: 1, maxLength: 120 }
            }
          }
        }
      ]
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  }
});

export class AxiomIntentContractError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'AxiomIntentContractError';
    this.code = 'intent_contract_invalid';
    this.contract = AXIOM_AGENT_INTENT_CONTRACT;
    this.detail = detail;
  }
}

export function parseAxiomIntentJson(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new AxiomIntentContractError('intent_response_empty', { raw });
  const candidates = [raw];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));
  const parseErrors = [];
  for (const candidate of [...new Set(candidates)]) {
    try { return JSON.parse(candidate); }
    catch (error) { parseErrors.push(String(error?.message || error)); }
  }
  throw new AxiomIntentContractError('intent_json_parse_failed', { raw, parseErrors });
}

export function validateAxiomIntent(value, capabilities = []) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['intent_object_required'] };
  }
  if (value.contract !== AXIOM_AGENT_INTENT_CONTRACT) errors.push(`intent_contract_invalid:${value.contract || 'missing'}`);
  if (!['act', 'conversation', 'clarify'].includes(value.outcome)) errors.push(`intent_outcome_invalid:${value.outcome || 'missing'}`);
  if (!boundedText(value.intentSummary, 240)) errors.push('intent_summary_required');
  if (!Array.isArray(value.successCriteria) || !value.successCriteria.length || value.successCriteria.some(item => !boundedText(item, 240))) {
    errors.push('intent_success_criteria_invalid');
  }
  if (!Array.isArray(value.plan) || value.plan.length > 1) errors.push('intent_plan_invalid');
  const capabilityById = new Map(capabilities.map(entry => [String(entry?.id || ''), entry]).filter(([id]) => id));
  const knownCapabilities = new Set(capabilityById.keys());
  if (Array.isArray(value.plan)) {
    value.plan.forEach((step, index) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        errors.push(`intent_plan_step_object_required:${index}`);
        return;
      }
      if (!boundedText(step.capability, 120)) errors.push(`intent_plan_capability_required:${index}`);
      else if (knownCapabilities.size && !knownCapabilities.has(step.capability)) errors.push(`intent_capability_unavailable:${step.capability}`);
      if (!boundedText(step.operation, 120)) errors.push(`intent_plan_operation_required:${index}`);
      if (!step.arguments || typeof step.arguments !== 'object' || Array.isArray(step.arguments)) errors.push(`intent_plan_arguments_object_required:${index}`);
      if (!boundedText(step.reason, 320)) errors.push(`intent_plan_reason_required:${index}`);
      const capability = capabilityById.get(step.capability);
      if (capability?.operation && step.operation !== capability.operation) {
        errors.push(`intent_operation_invalid:${step.capability}:${step.operation || 'missing'}:expected_${capability.operation}`);
      }
      if (capability?.inputSchema && step.arguments && typeof step.arguments === 'object' && !Array.isArray(step.arguments)) {
        errors.push(...validateJsonSchema(step.arguments, capability.inputSchema, `intent_arguments:${step.capability}`));
      }
    });
  }
  if (!Number.isFinite(Number(value.confidence)) || Number(value.confidence) < 0 || Number(value.confidence) > 1) errors.push('intent_confidence_invalid');
  if (value.outcome === 'act' && value.plan?.length !== 1) errors.push('intent_action_requires_one_capability');
  if (value.outcome !== 'act' && value.plan?.length) errors.push('intent_non_action_plan_must_be_empty');
  if (value.outcome === 'clarify') {
    if (!value.clarification || typeof value.clarification !== 'object' || !boundedText(value.clarification.question, 240)) {
      errors.push('intent_clarification_required');
    } else if (!Array.isArray(value.clarification.options) || value.clarification.options.length < 2 || value.clarification.options.length > 4) {
      errors.push('intent_clarification_options_invalid');
    }
  } else if (value.clarification !== null) {
    errors.push('intent_clarification_must_be_null');
  }
  return { ok: errors.length === 0, errors };
}

export function buildAxiomIntentSystemPrompt(observation = {}, capabilities = []) {
  return `You are AXIOM's natural-language agent kernel. Understand the user's ordinary language using the live editor evidence below, then select exactly one registered capability or explicitly converse/clarify.

LIVE EVIDENCE:
${JSON.stringify(observation, null, 2)}

REGISTERED CAPABILITIES:
${JSON.stringify(capabilities, null, 2)}

Return only one JSON object matching contract ${AXIOM_AGENT_INTENT_CONTRACT} and the supplied response schema.

Rules:
- Meaning comes from the user's request plus live evidence. Do not require magic vocabulary.
- For outcome "act", choose exactly one capability id from REGISTERED CAPABILITIES and use its documented operation/arguments contract.
- Prefer the most specific capability that directly owns the requested state. A generic implementation capability must never displace an available domain capability.
- For outcome "conversation", plan must be [] and clarification must be null. Use this only when the user genuinely asks for explanation or discussion.
- For outcome "clarify", plan must be [] and include one material question with 2-4 options.
- If the user asks to change the active Map Forge document, that is an action even when their wording is informal.
- Tile, terrain, floor, enclosure, rock-boundary, or playable-area edits on the active map belong to mapforge.terrain.patch when it is registered. They are not source-code implementation work.
- Every success criterion must be causally covered by the selected operations. A trace_region_boundary operation only adds or repaints the destination outline; it cannot claim that an obsolete enclosure was removed.
- When boundaryEvidence identifies obsoleteEnclosureCandidateIds and mapforge.enclosure.relocate is registered, an old/smaller enclosure being replaced by a new/larger one belongs to that specific capability, not the generic terrain patch.
- If a requested operation is unavailable, select system.capability_gap; never disguise a missing capability as conversation.
- A stopped previous goal does not make a follow-up conversational. Reinterpret it against the current workspace.
- Describe observable success criteria. Do not claim a mutation has already happened.
- No markdown, prose, comments, or keys outside the schema.`;
}

export function buildAxiomIntentResponseSchema(capabilities = []) {
  const schema = JSON.parse(JSON.stringify(AXIOM_AGENT_INTENT_SCHEMA));
  const choices = capabilities
    .filter(capability => capability?.id && capability?.operation)
    .map(capability => ({
      type: 'object',
      additionalProperties: false,
      required: ['capability', 'operation', 'arguments', 'reason'],
      properties: {
        capability: { const: capability.id },
        operation: { const: capability.operation },
        arguments: capability.inputSchema || { type: 'object' },
        reason: { type: 'string', minLength: 1, maxLength: 320 }
      }
    }));
  if (choices.length) schema.properties.plan.items = { oneOf: choices };
  return schema;
}

export async function interpretAxiomNaturalLanguage({
  complete,
  userText,
  observation = {},
  capabilities = [],
  onAttempt = null,
  timeoutMs = 60000
} = {}) {
  if (typeof complete !== 'function') throw new AxiomIntentContractError('intent_model_complete_required');
  const clean = String(userText || '').trim();
  if (!clean) throw new AxiomIntentContractError('intent_user_text_required');
  const system = buildAxiomIntentSystemPrompt(observation, capabilities);
  const responseSchema = buildAxiomIntentResponseSchema(capabilities);
  const attempts = [];

  for (let index = 0; index < 2; index += 1) {
    const repair = index === 0 ? '' : `\n\nREPAIR REQUIRED\nYour previous response failed the contract. Return a corrected JSON object only.\nErrors: ${attempts[0].errors.join(', ')}\nPrevious response: ${attempts[0].raw.slice(0, 8000)}`;
    let raw = '';
    try {
      raw = await complete(
        [{ role: 'user', content: clean }],
        {
          system: `${system}${repair}`,
          responseSchema,
          max_tokens: 900,
          num_ctx: 16384,
          temperature: 0,
          seed: 42,
          timeoutMs,
          think: false
        }
      );
    } catch (error) {
      const errors = [`intent_model_request_failed:${String(error?.message || error)}`];
      attempts.push({ index: index + 1, raw: '', errors });
      onAttempt?.({ index: index + 1, ok: false, raw: '', errors });
      if (index === 0) continue;
      throw new AxiomIntentContractError('intent_model_request_failed', { attempts });
    }

    let value = null;
    let errors = [];
    try { value = parseAxiomIntentJson(raw); }
    catch (error) { errors = [error.message, ...(error.detail?.parseErrors || [])]; }
    if (value) {
      const validation = validateAxiomIntent(value, capabilities);
      errors = validation.errors;
      if (validation.ok) {
        const result = normalizeIntent(value);
        attempts.push({ index: index + 1, raw, errors: [] });
        onAttempt?.({ index: index + 1, ok: true, raw, errors: [], value: result });
        return { intent: result, attempts, repaired: index === 1 };
      }
    }
    attempts.push({ index: index + 1, raw, errors });
    onAttempt?.({ index: index + 1, ok: false, raw, errors });
  }

  throw new AxiomIntentContractError('intent_contract_invalid_after_repair', { attempts });
}

function normalizeIntent(value) {
  return Object.freeze({
    contract: AXIOM_AGENT_INTENT_CONTRACT,
    outcome: value.outcome,
    intentSummary: String(value.intentSummary).trim(),
    successCriteria: Object.freeze(value.successCriteria.map(item => String(item).trim())),
    plan: Object.freeze((value.plan || []).map(step => Object.freeze({
      capability: String(step.capability).trim(),
      operation: String(step.operation).trim(),
      arguments: Object.freeze(JSON.parse(JSON.stringify(step.arguments || {}))),
      reason: String(step.reason).trim()
    }))),
    clarification: value.clarification ? Object.freeze({
      question: String(value.clarification.question).trim(),
      options: Object.freeze(value.clarification.options.map(item => String(item).trim()))
    }) : null,
    confidence: Number(value.confidence)
  });
}

function boundedText(value, max) {
  const text = String(value ?? '').trim();
  return text && text.length <= max ? text : '';
}

function validateJsonSchema(value, schema = {}, path = 'value') {
  if (Array.isArray(schema.oneOf)) {
    const variants = schema.oneOf.map(candidate => validateJsonSchema(value, candidate, path));
    const matching = variants.filter(candidateErrors => candidateErrors.length === 0);
    return matching.length === 1 ? [] : [`${path}:one_of_invalid`, ...(variants.flat().slice(0, 12))];
  }
  const errors = [];
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}:const_expected_${schema.const}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${path}:enum_invalid_${String(value)}`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path}:object_required`];
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}:required`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${path}.${key}:unexpected`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) errors.push(...validateJsonSchema(value[key], child, `${path}.${key}`));
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}:array_required`];
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) errors.push(`${path}:min_items_${schema.minItems}`);
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) errors.push(`${path}:max_items_${schema.maxItems}`);
    value.forEach((item, index) => { if (schema.items) errors.push(...validateJsonSchema(item, schema.items, `${path}[${index}]`)); });
  } else if (schema.type === 'string' && typeof value !== 'string') errors.push(`${path}:string_required`);
  else if (schema.type === 'integer' && !Number.isInteger(value)) errors.push(`${path}:integer_required`);
  else if (schema.type === 'number' && !Number.isFinite(value)) errors.push(`${path}:number_required`);
  else if (schema.type === 'boolean' && typeof value !== 'boolean') errors.push(`${path}:boolean_required`);
  if ((schema.type === 'integer' || schema.type === 'number') && Number.isFinite(value)) {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push(`${path}:minimum_${schema.minimum}`);
    if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push(`${path}:maximum_${schema.maximum}`);
  }
  return errors;
}

if (typeof window !== 'undefined') {
  window.AxiomNaturalLanguageAgent = Object.freeze({
    contract: AXIOM_AGENT_INTENT_CONTRACT,
    schema: AXIOM_AGENT_INTENT_SCHEMA,
    parse: parseAxiomIntentJson,
    validate: validateAxiomIntent,
    buildSystemPrompt: buildAxiomIntentSystemPrompt,
    buildResponseSchema: buildAxiomIntentResponseSchema,
    interpret: interpretAxiomNaturalLanguage
  });
}

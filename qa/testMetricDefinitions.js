const TEST_METRIC_ORDER = [
  'integrity',
  'specificity',
  'coverage',
  'observability',
  'reliability',
];

const TEST_METRIC_DEFINITIONS = {
  schema: 'qa.test-metric-definitions.v1',
  version: 1,
  metrics: {
    integrity: {
      id: 'integrity',
      label: 'Integrity',
      shortLabel: 'Integrity',
      defaultWeight: 1,
      definition: 'Does this test genuinely validate the intended truth?',
      whyItMatters: 'High-integrity tests reduce fake confidence and catch real regressions.',
      scoringGuide: {
        1: 'Barely connected to the real behaviour',
        2: 'Touches behaviour indirectly but weakly',
        3: 'Validates core outcome with gaps',
        4: 'Strongly validates intended behaviour',
        5: 'Direct, robust, hard-to-fake proof of behaviour',
      },
      factors: [
        { id: 'assertion_relevance', label: 'Assertion relevance', weight: 1 },
        { id: 'real_path_alignment', label: 'Real path alignment', weight: 1 },
        { id: 'false_positive_risk', label: 'False positive risk', weight: 1, invert: true },
      ],
    },
    specificity: {
      id: 'specificity',
      label: 'Specificity',
      shortLabel: 'Specificity',
      defaultWeight: 0.9,
      definition: 'Does it fail in a way that points to the real problem?',
      whyItMatters: 'Low-specificity tests waste time because they fail noisily or ambiguously.',
      scoringGuide: {
        1: 'Failure gives almost no useful signal',
        2: 'Signal exists but is broad or noisy',
        3: 'Reasonably informative',
        4: 'Clear and well-targeted',
        5: 'Very precise and immediately actionable',
      },
      factors: [
        { id: 'assertion_precision', label: 'Assertion precision', weight: 1 },
        { id: 'failure_localization', label: 'Failure localization', weight: 1 },
        { id: 'noise_risk', label: 'Noise risk', weight: 1, invert: true },
      ],
    },
    coverage: {
      id: 'coverage',
      label: 'Coverage',
      shortLabel: 'Coverage',
      defaultWeight: 0.8,
      definition: 'How much of the intended path or behaviour does it exercise?',
      whyItMatters: 'A passing test with narrow coverage can still leave large blind spots.',
      scoringGuide: {
        1: 'Tiny sliver of intended behaviour',
        2: 'Some relevant path coverage',
        3: 'Core path covered',
        4: 'Core plus important branches',
        5: 'Excellent breadth with relevant edge cases',
      },
      factors: [
        { id: 'path_coverage', label: 'Path coverage', weight: 1 },
        { id: 'branch_coverage', label: 'Branch coverage', weight: 1 },
        { id: 'edge_case_coverage', label: 'Edge-case coverage', weight: 1 },
      ],
    },
    observability: {
      id: 'observability',
      label: 'Observability',
      shortLabel: 'Observability',
      defaultWeight: 0.8,
      definition: 'How much useful debug evidence does it expose?',
      whyItMatters: 'Good observability makes debugging faster and QA more trustworthy.',
      scoringGuide: {
        1: 'Hard to inspect or understand',
        2: 'Some output, weak traceability',
        3: 'Usable but limited',
        4: 'Clear and helpful',
        5: 'Excellent traceability and debug value',
      },
      factors: [
        { id: 'debug_signal', label: 'Debug signal', weight: 1 },
        { id: 'artifact_visibility', label: 'Artifact visibility', weight: 1 },
        { id: 'failure_readability', label: 'Failure readability', weight: 1 },
      ],
    },
    reliability: {
      id: 'reliability',
      label: 'Reliability',
      shortLabel: 'Reliability',
      defaultWeight: 1,
      definition: 'How stable and repeatable is it across normal runs?',
      whyItMatters: 'Flaky tests destroy trust in QA.',
      scoringGuide: {
        1: 'Very flaky or environment-dependent',
        2: 'Frequently unstable',
        3: 'Mostly stable with caveats',
        4: 'Stable in normal use',
        5: 'Highly stable and dependable',
      },
      factors: [
        { id: 'repeatability', label: 'Repeatability', weight: 1 },
        { id: 'environment_stability', label: 'Environment stability', weight: 1 },
        { id: 'dependency_fragility', label: 'Dependency fragility', weight: 1, invert: true },
      ],
    },
  },
};

module.exports = {
  TEST_METRIC_DEFINITIONS,
  TEST_METRIC_ORDER,
};

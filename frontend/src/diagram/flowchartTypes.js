// The flowchart node-type table: which types exist, and each one's label and
// default box. Split out of flowchartModel.js (#441) purely to keep the dependency
// graph one-way — flowchartNodeSize.js needs the default boxes, and flowchartModel
// needs flowchartNodeSize to measure a node, which would otherwise be a cycle.
// flowchartModel re-exports both names, so every existing importer is unaffected.

// Curated node-type set (spec B3). nodeType selects the SVG shape at render.
// The standard flowchart shape set (spec R4/P7): the six core shapes plus the
// common Document / Database / Predefined process / Manual input / Preparation /
// Off-page reference. The connector/junction (small circle) stays last.
export const NODE_TYPES = [
  'terminator',
  'process',
  'decision',
  'inputOutput',
  'document',
  'database',
  'predefinedProcess',
  'manualInput',
  'preparation',
  'offPageRef',
  'connector',
]

// Per-type metadata: the human label used in the picker and the default node
// box. The connector/junction is a small circle; the rest are wider blocks.
//
// A junction's default text is EMPTY (#441 items 2/5): the standard symbol carries
// at most a single letter or step number, and seeding it with the word "Junction"
// asked a 72px circle to hold eight characters — which is how the issue's video
// ended up showing a node reading "Juncti / on".
export const NODE_TYPE_META = {
  terminator: { label: 'Terminal', text: 'Start', w: 150, h: 60 },
  process: { label: 'Process', text: 'Process', w: 160, h: 72 },
  decision: { label: 'Decision', text: 'Decision?', w: 150, h: 96 },
  inputOutput: { label: 'Input / Output', text: 'Data', w: 160, h: 72 },
  document: { label: 'Document', text: 'Document', w: 160, h: 84 },
  database: { label: 'Database', text: 'Data', w: 120, h: 100 },
  predefinedProcess: { label: 'Predefined process', text: 'Subprocess', w: 172, h: 72 },
  manualInput: { label: 'Manual input', text: 'Input', w: 160, h: 76 },
  preparation: { label: 'Preparation', text: 'Prepare', w: 156, h: 80 },
  offPageRef: { label: 'Off-page reference', text: 'Off-page', w: 120, h: 88 },
  connector: { label: 'Junction', text: '', w: 72, h: 72 },
}

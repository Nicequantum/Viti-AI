import type { RepairLine, RepairOrder } from '../types';
import { formatExtractedDataForPrompt } from '@/utils/diagnosticParser';
import { MI_AUDIT_GUIDELINES, MI_GENERATION_STYLE_RULES } from './miAuditGuidelines';

export const WARRANTY_STORY_TEMPERATURE = 0.25;

/** Standard Mercedes-Benz warranty workflow — every story must cover these in order. */
export const WARRANTY_WORKFLOW_STEPS = [
  'Initial test drive to confirm/reproduce the customer complaint (mileage in/out)',
  'Source voltage check at the battery',
  'Install battery charger to maintain vehicle voltage',
  'Connect XENTRY and perform initial Quick Test',
  'Guided testing on relevant fault codes from the Quick Test',
  'Technician findings and diagnostic conclusions',
  'Repairs performed',
  'Clear fault codes and perform final Quick Test to verify no codes return',
  'Disconnect battery charger and XENTRY',
  'Final verification test drive (typically 3–5 miles) to confirm the repair (mileage in/out)',
] as const;

export const SYSTEM_PROMPT = `You are a senior Mercedes-Benz master technician writing warranty stories engineered to survive Mercedes Intelligence 2.0 (MI 2.0) automated warranty audits.

${MI_AUDIT_GUIDELINES}

${MI_GENERATION_STYLE_RULES}

## ABSOLUTE RULES — AUDIT SAFETY (NEVER VIOLATE)

1. **Facts only**: Use ONLY information explicitly provided in the user message — vehicle details, RO complaints (A/B/C…), technician notes, OCR text from XENTRY/diagnostic photos, extracted codes, measurements, guided tests, and components. Never invent, infer, or assume data.

2. **No fabrication**: Do NOT invent or guess test results, pressures, voltages, DTC/fault codes, test drive details, part numbers, or module names not in the provided data.

3. **Missing data placeholders**: When a standard warranty element is expected but no supporting data was provided, use exactly [NOT DOCUMENTED] or [NOT PROVIDED].

4. **Natural 3 C's flow**: Cover customer complaint, cause, and correction within flowing paragraphs — never with visible section headers or labels.

5. **Required workflow sequence**: Walk through ALL 10 workflow steps in order within natural paragraphs. Vary wording across stories but always hit every step.

6. **Tone**: Professional, first-person technician language. Concise, factual, dealership-ready. Chronological flow.

7. **Prohibited**:
   - Visible headers like "Customer Complaint:", "Cause:", "Correction:", or "Findings:"
   - Example or industry-typical spec values unless they appear verbatim in provided data
   - Smart-default suggestions stated as performed work unless confirmed in notes or OCR

## OUTPUT

Write ONLY the warranty story for the specific repair line requested. Natural paragraphs only — no headings, no labels, no bullet lists.`;

export const STORY_TEMPLATES = [
  'Chronological narrative: customer presentation → diagnostic workflow → cause conclusion → repair → verification drive.',
  'Evidence-first flow: test drive and voltage, then XENTRY data, guided tests, findings, repair, final verification.',
  'Concise audit record: tight sentences, every workflow step present, placeholders for undocumented elements.',
  'Road-test bookends: initial and final drives anchor the story with diagnostics and repair between.',
  'XENTRY-centered: foreground Quick Test and guided testing within natural paragraph flow.',
  'Line-focused submission: tie the labeled RO complaint to this line and close with documented verification.',
];

export function buildWarrantyStoryUserMessage(
  ro: RepairOrder,
  line: RepairLine,
  historyContext: string = '',
  templateIndex?: number,
  advisorContext: string = ''
): string {
  const vehicleInfo = `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model} | VIN: ${ro.vehicle.vin} | Miles: ${ro.vehicle.mileageIn}${ro.vehicle.mileageOut ? ` → ${ro.vehicle.mileageOut}` : ''}`
    .replace(/\s+/g, ' ')
    .trim();

  const allRepairs = ro.repairLines.map((l) => `Line ${l.lineNumber}: ${l.description}`).join('\n');

  const xentryText = formatExtractedDataForPrompt(
    line.extractedData || { codes: [], faultCodes: [], guidedTests: [], measurements: [], components: [], circuits: [] }
  );

  const rawXentryOcr =
    line.xentryOcrTexts && line.xentryOcrTexts.length > 0
      ? '\nRaw OCR from line diagnostic photos:\n' + line.xentryOcrTexts.join('\n---\n')
      : '';

  const roRawXentryOcr =
    ro.xentryOcrTexts && ro.xentryOcrTexts.length > 0
      ? '\nRO-level Xentry / Quick Test OCR (from RO page scan):\n' + ro.xentryOcrTexts.join('\n---\n')
      : '';

  const idx = templateIndex ?? Math.floor(Math.random() * STORY_TEMPLATES.length);
  const selectedTemplate = STORY_TEMPLATES[idx];

  const workflowChecklist = WARRANTY_WORKFLOW_STEPS.map((step, i) => `${i + 1}. ${step}`).join('\n');

  return `Vehicle information: ${vehicleInfo}

RO Complaints (A, B, C etc from scan):
${(ro.complaints || []).join('\n') || '[NOT PROVIDED]'}

All repairs on this RO:
${allRepairs}

Current repair line: Line ${line.lineNumber} - ${line.description}

Customer concern for this line: ${line.customerConcern || line.description || '[NOT PROVIDED]'}

Technician notes: ${line.technicianNotes || '[NOT PROVIDED]'}

Xentry test data and images:
${xentryText}
${rawXentryOcr}
${roRawXentryOcr}
${historyContext}
${advisorContext ? `\n\nADVISOR INTELLIGENCE (style reference for this RO's service advisor):\n${advisorContext}\n` : ''}
REQUIRED WORKFLOW (include ALL steps in this order — weave into natural paragraphs):
${workflowChecklist}

AUDIT-SAFE REQUIREMENTS:
- Use ONLY the data above. Never invent numbers, codes, test results, or procedures.
- Write in natural paragraph form. NO visible headings or section labels.
- Cover the 3 C's (complaint, cause, correction) within flowing prose.
- Include every workflow step above in sequence.
- Reference labeled complaints (A, B, C…) from the RO when relevant to this line.
- If Advisor Intelligence is provided above, mirror that advisor's complaint phrasing style in the opening paragraphs only.
- For mileage: use RO mileage in/out when provided; use [NOT PROVIDED] for undocumented drive mileage.
- For voltage, Quick Test, battery charger, guided tests, final Quick Test, or test drives NOT in the notes/OCR above, use [NOT DOCUMENTED] or [NOT PROVIDED] — do NOT fabricate them.
- Smart-default or common-issue text in technician notes (if present) is reference only — never state it as performed work unless confirmed in diagnostic OCR or explicit technician findings.
- Vary phrasing across steps — do not repeat identical sentences. Follow this narrative style while staying strictly factual: ${selectedTemplate}
- If Knowledge Base references are provided in the system prompt, prioritize dealership user-saved stories for tone and workflow sequencing.

Write only the warranty story for this specific line.`;
}
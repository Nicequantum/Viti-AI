import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  extractComplaints,
  extractLetterLabeledComplaints,
  extractServiceAdvisorFromText,
  mergeROExtractions,
  parseStructuredROText,
} from '../../src/utils/roExtractor';

const REAL_RO_SNIPPET = `RO Number: 482910
Customer Name: JOHN SMITH
Year: 2022
Make: Mercedes-Benz
Model: GLE 350
VIN: W1N4N4HB5NJ123456
Mileage IN: 28450
LINE OPCODE TECH TYPE HOURS
A RHODE ISLAND STATE INSPECTION
RISI RHODE ISLAND STATE INSPECTION
619 CDEF
130132 PASSED`;

const MERGED_HEADER_LINE = `LINE OPCODE TECH TYPE HOURS A RHODE ISLAND STATE INSPECTION`;

const COLLAPSED_OCR_LINE =
  'LINE OPCODE TECH TYPE HOURS A RHODE ISLAND STATE INSPECTION RISI RHODE ISLAND STATE INSPECTION 619 CDEF 130132 PASSED';

const GROK_OUTPUT_MISSING_A = `RO Number: 482910
Customer Name: JOHN SMITH
Year: 2022
Make: Mercedes-Benz
Model: GLE 350
VIN: W1N4N4HB5NJ123456
Mileage IN: 28450
Customer Complaints:
B. RISI RHODE ISLAND STATE INSPECTION
C. 619 CDEF`;

describe('RO complaint extraction', () => {
  test('extracts Line A from minimal real-world RO format', () => {
    const complaints = extractLetterLabeledComplaints(REAL_RO_SNIPPET);
    assert.equal(complaints.length, 1);
    assert.equal(complaints[0], 'RHODE ISLAND STATE INSPECTION');
  });

  test('extracts Line A when merged onto header row', () => {
    const complaints = extractLetterLabeledComplaints(MERGED_HEADER_LINE);
    assert.equal(complaints.length, 1);
    assert.equal(complaints[0], 'RHODE ISLAND STATE INSPECTION');
  });

  test('extracts ALL CAPS complaints without lowercase letters', () => {
    const complaints = extractComplaints('LINE OPCODE TECH TYPE HOURS\nA CHECK ENGINE LIGHT ON');
    assert.ok(complaints.includes('CHECK ENGINE LIGHT ON'));
  });

  test('parseStructuredROText recovers Line A when Grok skips it but OCR text is present', () => {
    const fullText = `${GROK_OUTPUT_MISSING_A}\n${REAL_RO_SNIPPET}`;
    const parsed = parseStructuredROText(fullText);
    assert.ok(parsed.complaints.length >= 1);
    assert.equal(parsed.complaints[0], 'RHODE ISLAND STATE INSPECTION');
  });

  test('parseStructuredROText parses Grok A. format with period', () => {
    const grokText = `Customer Complaints:
A. RHODE ISLAND STATE INSPECTION
B. CHECK ENGINE LIGHT ON`;
    const parsed = parseStructuredROText(grokText);
    assert.deepEqual(parsed.complaints, ['RHODE ISLAND STATE INSPECTION', 'CHECK ENGINE LIGHT ON']);
  });

  test('does not treat unlabeled RISI detail lines as separate complaints', () => {
    const complaints = extractLetterLabeledComplaints(REAL_RO_SNIPPET);
    assert.ok(!complaints.some((c) => c.startsWith('RISI')));
    assert.ok(!complaints.some((c) => c.includes('CDEF')));
  });

  test('extracts multiple letter-labeled complaints in order', () => {
    const text = `LINE OPCODE TECH TYPE HOURS
A RHODE ISLAND STATE INSPECTION
B CHECK ENGINE LIGHT ON
C NOISE FROM REAR`;
    const complaints = extractLetterLabeledComplaints(text);
    assert.deepEqual(complaints, [
      'RHODE ISLAND STATE INSPECTION',
      'CHECK ENGINE LIGHT ON',
      'NOISE FROM REAR',
    ]);
  });

  test('trims RISI/CDEF/PASSED continuations from collapsed OCR line', () => {
    const complaints = extractLetterLabeledComplaints(COLLAPSED_OCR_LINE);
    assert.equal(complaints.length, 1);
    assert.equal(complaints[0], 'RHODE ISLAND STATE INSPECTION');
  });

  test('grok-only mislabeled RISI on B recovers Line A inspection text', () => {
    const parsed = parseStructuredROText(GROK_OUTPUT_MISSING_A);
    assert.deepEqual(parsed.complaints, ['RHODE ISLAND STATE INSPECTION']);
  });

  test('mergeROExtractions recovers Line A from OCR when Grok skips it', () => {
    const grokParsed = parseStructuredROText(GROK_OUTPUT_MISSING_A);
    const ocrParsed = parseStructuredROText(COLLAPSED_OCR_LINE);
    const merged = mergeROExtractions(grokParsed, ocrParsed, COLLAPSED_OCR_LINE);
    assert.equal(merged.complaints[0], 'RHODE ISLAND STATE INSPECTION');
    assert.ok(merged.complaints.length >= 1);
  });

  test('mergeROExtractions prefers non-empty service advisor name', () => {
    const grokParsed = {
      ...parseStructuredROText(GROK_OUTPUT_MISSING_A),
      serviceAdvisorName: 'Maria Lopez',
    };
    const ocrParsed = parseStructuredROText(
      'Service Advisor: JORDAN REYES\n' + COLLAPSED_OCR_LINE
    );
    const merged = mergeROExtractions(grokParsed, ocrParsed, COLLAPSED_OCR_LINE);
    assert.equal(merged.serviceAdvisorName, 'Maria Lopez');
    assert.equal(extractServiceAdvisorFromText('Service Advisor: JORDAN REYES'), 'JORDAN REYES');
  });
});
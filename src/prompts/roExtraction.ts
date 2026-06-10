export const RO_EXTRACTION_PROMPT = `Use OCR to carefully analyze ALL provided repair order image(s). Extract vehicle header fields from the top section AND extract EVERY customer complaint line from the complaint/labor section.

SEPARATE DOCUMENT — VMI (Vehicle Master Inquiry):
Some scans include a VMI page (Vehicle Master Inquiry) alongside the Repair Order. VMI is a DIFFERENT document with factory warranty dates, CPO warranty, extended ELA warranty, and service history.
- Do NOT extract VMI warranty lines as customer complaints.
- Do NOT mix VMI text into complaint letters A–Z.
- Ignore VMI pages for the Customer Complaints section below (on-device OCR handles VMI warranty fields separately).

VEHICLE FIELDS (top header):
- RO Number: top center (near "RO #", "Repair Order", "Work Order")
- Customer Name: customer section
- Service Advisor Name: the service advisor / writer on the RO (often labeled "Service Advisor", "Svc Advisor", "SA", or "Writer" — NOT the technician)
- Year / Make / Model: vehicle information row
- VIN: exactly 17 characters
- Mileage IN: from MILEAGE IN/OUT or odometer (numbers only)

CUSTOMER COMPLAINTS (HIGHEST PRIORITY — EXTRACT EVERY # LETTER LINE):
The complaint block starts immediately AFTER the header row that reads:
  LINE OP CODE TECH TYPE DESCRIPTION / INSTRUCTIONS
(or close variants: LINE OPCODE TECH TYPE HOURS, LINE OP CODE TECH TYPE DESCRIPTION)

CRITICAL FORMAT — vertical column of hashtag labels (NO commas on the RO):
Immediately below that header, the dealership prints complaint labels in a column.

LINE A JAMMED ON HEADER (common):
The first complaint (# A) is often printed directly against the header row with little or no vertical gap — sometimes on the SAME line as "LINE OP CODE TECH TYPE DESCRIPTION / INSTRUCTIONS".
Example: LINE OP CODE TECH TYPE DESCRIPTION / INSTRUCTIONS # A Drop-off loaner car or van supplied
Or the text may appear right after the header words without a visible # A. ALWAYS look for Line A text flush against that header — never skip it.

    # A
    # B
    # C
    ...
    # G
    # H
    (continues alphabetically as needed)

Each label is: hashtag + space + single capital letter (A, B, C … Z as printed). NO commas between labels.

The complaint TEXT is beside these labels (to the right) OR on the same line:
    # A RHODE ISLAND STATE INSPECTION
    # B CHECK ENGINE LIGHT ON

MULTI-PAGE RULES:
- Search ALL pages/images. Complaints often continue on page 2+.
- Page 2 may begin with leftover/continuation text from the previous complaint — that text belongs to the PRIOR letter (e.g. end of C), NOT a new line.
- Still extract every # letter printed on later pages (D, E, F, G, H, etc.).

INCLUDE ALL LINES — DO NOT SKIP:
- Extract EVERY printed # letter line (A, B, C, D, E, F, G, H, I, J …) even if the text is short, "Quality Control", a placeholder, or hard to read.
- Line A is ALWAYS the first # A in the column — NEVER skip Line A.
- Include QC / shop lines verbatim. The technician will delete unneeded lines.
- Do NOT invent letters from words inside complaint text (e.g. "RHODE ISLAND" does NOT create lines E, I, L, N).
- Lines WITHOUT a leading # letter (e.g. "RISI ...", "619 CDEF", "130132 PASSED") are inspection detail — attach to the prior letter mentally; output only lettered complaint lines.
- Also capture text after "Customer states...", "C/S", "Concern" when paired with a # letter.

Output ONLY this exact format:

RO Number: [value]
Customer Name: [value]
Service Advisor Name: [value or blank if not visible]
Year: [value]
Make: [value]
Model: [value]
VIN: [exact 17 char]
Mileage IN: [numbers only]
Customer Complaints:
A. [exact text for # A]
B. [exact text for # B]
C. [exact text for # C]
...continue for every letter actually printed (# D, # E, # F, # G, # H, etc.)

Output every letter actually printed on the RO in alphabetical order (skip letters not present). Use "A." prefix in output even if the RO shows "# A" without a period. Be extremely precise on VIN (fix O/0 I/1), mileage, and RO number.`;
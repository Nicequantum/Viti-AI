export const RO_EXTRACTION_PROMPT = `Use OCR to carefully analyze ALL provided repair order image(s). Extract vehicle header fields from the top section AND extract EVERY customer complaint line from the complaint/labor section (often labeled LINE OPCODE TECH TYPE HOURS).

VEHICLE FIELDS (top header):
- RO Number: top center (near "RO #", "Repair Order", "Work Order")
- Customer Name: customer section
- Service Advisor Name: the service advisor / writer on the RO (often labeled "Service Advisor", "Svc Advisor", "SA", or "Writer" — NOT the technician)
- Year / Make / Model: vehicle information row
- VIN: exactly 17 characters
- Mileage IN: from MILEAGE IN/OUT or odometer (numbers only)

CUSTOMER COMPLAINTS (HIGHEST PRIORITY — DO NOT SKIP LINE A):
Real dealership ROs use minimal formatting. Complaints are NOT always preceded by "Customer states" or colons.

CRITICAL FORMAT — vertical column of hashtag labels (NO commas on the RO):
The dealership prints complaint labels in a single column, one per line, stacked vertically:

    # A
    (complaint text for A — same line or lines below)
    # B
    (complaint text for B)
    # C
    # D
    # E
    # F

Each label is exactly: hashtag + space + single capital letter (# A, # B, # C …).
There are NO commas between labels. Do NOT insert or expect commas.
Labels are NOT on one horizontal row — they run straight down the page.

The complaint text may appear on the same line after the label (# A RHODE ISLAND STATE INSPECTION) OR on the line(s) immediately below a label-only row (# A on one line, then the complaint text underneath).

Legacy (no hashtag): A RHODE ISLAND STATE INSPECTION / B CHECK ENGINE LIGHT ON

Rules:
1. Find the complaint section (header row often reads "LINE OPCODE TECH TYPE HOURS" or similar). Search ALL pages.
2. Walk down the column and extract EVERY label # A, # B, # C, # D, # E, # F (only letters actually printed).
3. Line A is the FIRST label in the column — NEVER skip Line A.
4. Pair each label with its complaint text. Do NOT invent letters from words inside complaint text (e.g. "RHODE ISLAND" does NOT create lines E, I, L, N).
5. Preserve EXACT letter labels from the RO in order down the column.
6. Lines WITHOUT a leading letter (e.g. "RISI RHODE ISLAND STATE INSPECTION", "619 CDEF", "130132 PASSED") are continuation/inspection detail — attach mentally to the prior lettered line but output ONLY the lettered complaint lines A, B, C…
7. Also capture complaints after phrases: "Customer states", "Customer complaint", "C/S", "Concern", "state inspection".
8. Search ALL pages/images. If truly none, output exactly "None listed."

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
A. [exact text after A — include full complaint even if ALL CAPS]
B. [exact text]
C. [exact text]
...

Use "A." prefix in output even if the RO shows "A " without a period. Be extremely precise on VIN (fix O/0 I/1), mileage, and RO number.`;
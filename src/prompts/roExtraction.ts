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

CRITICAL FORMAT — letter + space + text (period optional):
  A RHODE ISLAND STATE INSPECTION
  B CHECK ENGINE LIGHT ON
  C. NOISE FROM FRONT SUSPENSION

Rules:
1. Find the complaint section (header row often reads "LINE OPCODE TECH TYPE HOURS" or similar).
2. Extract EVERY line that starts with a SINGLE CAPITAL LETTER followed by a SPACE, then complaint text.
3. Line A is frequently the FIRST complaint immediately after the header — minimal spacing, plain sentence, ALL CAPS is common. NEVER skip Line A.
4. A line starting with "A " (letter A + space) IS a complaint even with no period, colon, or bullet.
5. Lines WITHOUT a leading letter (e.g. "RISI RHODE ISLAND STATE INSPECTION", "619 CDEF", "130132 PASSED") are continuation/inspection detail — attach mentally to the prior lettered line but output ONLY the lettered complaint lines A, B, C…
6. Also capture complaints after phrases: "Customer states", "Customer complaint", "C/S", "Concern", "state inspection".
7. Search ALL pages/images. If truly none, output exactly "None listed."

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
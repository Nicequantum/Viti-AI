'use client';

import type { ExtractedData } from '@/types';
import { normalizeExtractedData } from '@/utils/diagnosticParser';

interface ExtractedDataPreviewProps {
  data?: ExtractedData | null;
}

export function ExtractedDataPreview({ data }: ExtractedDataPreviewProps) {
  const extracted = normalizeExtractedData(data);
  const hasContent =
    extracted.faultCodes.length > 0 ||
    extracted.guidedTests.length > 0 ||
    extracted.measurements.length > 0 ||
    extracted.components.length > 0;

  if (!hasContent) return null;

  return (
    <div className="text-[10px] bg-[#1c1c1e] p-2 rounded mb-2">
      <div className="font-semibold mb-1">Extracted from photos:</div>
      {extracted.faultCodes.length > 0 && (
        <div className="space-y-1 mb-1">
          {extracted.faultCodes.slice(0, 4).map((fc) => (
            <div key={fc.code}>
              <span className="text-[#0a84ff] font-mono">{fc.code}</span>
              {fc.description ? ` — ${fc.description}` : ''}
              {fc.status ? <span className="text-[#8e8e93]"> ({fc.status})</span> : null}
            </div>
          ))}
          {extracted.faultCodes.length > 4 && (
            <div className="text-[#8e8e93]">+{extracted.faultCodes.length - 4} more codes</div>
          )}
        </div>
      )}
      {extracted.guidedTests.length > 0 && (
        <div>Guided: {extracted.guidedTests.slice(0, 2).join(' | ')}</div>
      )}
      {extracted.measurements.length > 0 && (
        <div>
          Meas: {extracted.measurements[0].label}={extracted.measurements[0].value}
        </div>
      )}
    </div>
  );
}
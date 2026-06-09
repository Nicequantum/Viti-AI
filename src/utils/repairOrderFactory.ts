import type { RepairLine, RepairOrder, VehicleInfo } from '../types';
import { emptyExtractedData } from './diagnosticParser';

function defaultRepairLine(complaint?: string, lineNumber = 1): RepairLine {
  return {
    id: `line-${Date.now()}-${lineNumber}`,
    lineNumber,
    description: complaint ? complaint.slice(0, 60) : 'Enter repair description',
    customerConcern: complaint || '',
    technicianNotes: '',
    xentryImages: [],
    xentryOcrTexts: [],
    extractedData: emptyExtractedData(),
  };
}

export function createRepairOrderFromScan(params: {
  roNumber: string;
  vehicle: VehicleInfo;
  customerName: string;
  complaints: string[];
  serviceAdvisorName?: string;
}): RepairOrder {
  const firstComplaint = params.complaints[0];
  return {
    id: 'ro-' + Date.now(),
    roNumber: params.roNumber,
    vehicle: { ...params.vehicle, engine: params.vehicle.engine || '' },
    customer: { name: params.customerName },
    complaints: params.complaints,
    serviceAdvisorName: params.serviceAdvisorName,
    xentryImages: [],
    xentryOcrTexts: [],
    createdAt: new Date().toISOString(),
    repairLines: [defaultRepairLine(firstComplaint)],
  };
}

export function createManualRepairOrder(): RepairOrder {
  return {
    id: 'ro-' + Date.now(),
    roNumber: `R-${Date.now().toString().slice(-6)}`,
    vehicle: { vin: '', year: '', make: '', model: '', engine: '', mileageIn: '', mileageOut: '' },
    customer: { name: '' },
    complaints: ['Enter customer concern / symptom here (will label as A.)'],
    xentryImages: [],
    xentryOcrTexts: [],
    createdAt: new Date().toISOString(),
    repairLines: [defaultRepairLine()],
  };
}

export function createNewRepairLine(lineNumber: number): RepairLine {
  return {
    id: 'line-' + Date.now(),
    lineNumber,
    description: 'New repair item',
    customerConcern: '',
    technicianNotes: '',
    xentryImages: [],
    xentryOcrTexts: [],
    extractedData: emptyExtractedData(),
  };
}
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { preprocessImageForOCR, runOCR } from '@/services/ocr';
import type { AppView, ExtractedData, ImageAttachment, PendingImage, RepairLine, RepairOrder } from '@/types';
import { emptyExtractedData, mergeExtracted, parseDiagnosticText } from '@/utils/diagnosticParser';
import { getSuggestions } from '@/utils/mercedesKb';
import { createManualRepairOrder, createNewRepairLine } from '@/utils/repairOrderFactory';
import {
  extractComplaints,
  extractCustomerName,
  extractRoNumberFromText,
  extractVehicleDetails,
  mergeROExtractions,
  parseStructuredROText,
  sanitizeComplaints,
  sanitizeVehicle,
} from '@/utils/roExtractor';
import { normalizeScanFiles } from '@/utils/scanFileHelpers';
import { uploadFileAsAttachment, uploadFilesAsAttachments } from '@/utils/uploadHelpers';

interface UseRepairOrdersOptions {
  onOcrStart: (message?: string) => void;
  onOcrFinish: () => void;
  setOcrProgress: (p: number) => void;
  setScanStatusMessage: (message: string) => void;
}

export function useRepairOrders({
  onOcrStart,
  onOcrFinish,
  setOcrProgress,
  setScanStatusMessage,
}: UseRepairOrdersOptions) {
  const [view, setView] = useState<AppView>('home');
  const [currentRO, setCurrentRO] = useState<RepairOrder | null>(null);
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);
  const [allROs, setAllROs] = useState<RepairOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingROImages, setPendingROImages] = useState<PendingImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const scanCancelledRef = useRef(false);

  const refreshList = useCallback(async () => {
    const { repairOrders } = await api.listRepairOrders();
    setAllROs(repairOrders);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshList().catch(() => setLoading(false));
  }, [refreshList]);

  const persistRO = useCallback(
    async (ro: RepairOrder): Promise<RepairOrder> => {
      const isNew = !allROs.some((r) => r.id === ro.id) || ro.id.startsWith('ro-');
      if (isNew && ro.id.startsWith('ro-')) {
        const { repairOrder } = await api.createRepairOrder(ro);
        setAllROs((prev) => [repairOrder, ...prev.filter((r) => r.id !== ro.id)]);
        return repairOrder;
      }
      const { repairOrder } = await api.updateRepairOrder(ro.id, ro);
      setAllROs((prev) => prev.map((r) => (r.id === repairOrder.id ? repairOrder : r)));
      return repairOrder;
    },
    [allROs]
  );

  const saveRO = useCallback(
    async (ro: RepairOrder | null) => {
      if (ro) {
        try {
          const saved = await persistRO(ro);
          setCurrentRO(saved);
          setAllROs((prev) => {
            const idx = prev.findIndex((r) => r.id === saved.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = saved;
              return copy;
            }
            return [saved, ...prev];
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Failed to save repair order');
        }
      } else {
        setCurrentRO(null);
      }
    },
    [persistRO]
  );

  const getLatestRO = useCallback(
    (ro?: RepairOrder | null) => {
      const id = ro?.id || currentRO?.id;
      if (!id) return ro || currentRO;
      return allROs.find((r) => r.id === id) || ro || currentRO;
    },
    [allROs, currentRO]
  );

  const deleteRO = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this RO and all its data?')) return;
      try {
        await api.deleteRepairOrder(id);
        setAllROs((prev) => prev.filter((r) => r.id !== id));
        if (currentRO?.id === id) {
          setCurrentRO(null);
          setCurrentLineId(null);
          setView('home');
        }
        toast.success('Repair order deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    },
    [currentRO]
  );

  const openRO = useCallback((ro: RepairOrder) => {
    setCurrentRO(ro);
    setCurrentLineId(null);
    setView('ro');
  }, []);

  const createROFromText = useCallback(async (text: string) => {
    const parsed = parseStructuredROText(text);
    const roNumber = parsed.roNumber || extractRoNumberFromText(text);
    const vehicle = sanitizeVehicle(parsed.vehicle);
    const complaints = sanitizeComplaints(parsed.complaints);
    const custName = parsed.customerName || extractCustomerName(text);
    try {
      const { repairOrder } = await api.createRepairOrder({
        fromExtraction: true,
        roNumber,
        vehicle,
        customerName: custName,
        serviceAdvisorName: parsed.serviceAdvisorName,
        advisorExtractionSource: 'ocr_fallback',
        complaints,
      } as never);
      setAllROs((prev) => [repairOrder, ...prev]);
      setCurrentRO(repairOrder);
      setView('ro');
      toast.success('Repair order created from scan');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create repair order');
    }
  }, []);

  const createROFromExtracted = useCallback(
    async (extracted: {
      vehicle: RepairOrder['vehicle'];
      complaints: string[];
      customerName: string;
      roNumber?: string;
      serviceAdvisorName?: string;
    }) => {
      try {
        const { repairOrder } = await api.createRepairOrder({
          fromExtraction: true,
          roNumber: extracted.roNumber || `R-${Date.now().toString().slice(-6)}`,
          vehicle: sanitizeVehicle(extracted.vehicle),
          customerName: extracted.customerName,
          serviceAdvisorName: extracted.serviceAdvisorName,
          advisorExtractionSource: 'grok',
          complaints: sanitizeComplaints(extracted.complaints || []),
        } as never);
        setAllROs((prev) => [repairOrder, ...prev]);
        setCurrentRO(repairOrder);
        setView('ro');
        toast.success('Repair order created from scan');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to create repair order');
      }
    },
    []
  );

  const clearPendingPreviews = useCallback((images: PendingImage[]) => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  }, []);

  const processScanImages = useCallback(
    async (images: PendingImage[]) => {
      if (images.length === 0) return;
      scanCancelledRef.current = false;
      onOcrStart('Uploading documents…');
      setPendingROImages(images);

      try {
        setOcrProgress(8);
        setScanStatusMessage(`Uploading ${images.length} page${images.length === 1 ? '' : 's'}…`);
        const attachments = await uploadFilesAsAttachments(
          images.map((img) => img.file),
          'roimg'
        );
        if (scanCancelledRef.current) return;

        const imagePathnames = attachments.map((a) => a.pathname);

        const runClientOcr = async () => {
          let combinedText = '';
          for (let i = 0; i < images.length; i++) {
            if (scanCancelledRef.current) return '';
            const img = images[i];
            setScanStatusMessage(`Reading page ${i + 1} of ${images.length}…`);
            const preprocessed = await preprocessImageForOCR(img.file);
            const text = await runOCR(preprocessed, (p) =>
              setOcrProgress(Math.round(28 + (i / images.length) * 50 + (p / images.length) * 50 * 0.35))
            );
            combinedText += `\n\n=== PAGE ${i + 1} ===\n` + text;
          }
          return combinedText;
        };

        try {
          setOcrProgress(42);
          setScanStatusMessage('Reading pages and extracting with AI vision…');
          const [grokExtracted, ocrText] = await Promise.all([
            api.extractRO(imagePathnames),
            runClientOcr(),
          ]);
          if (scanCancelledRef.current) return;

          const ocrExtracted = ocrText ? parseStructuredROText(ocrText) : null;
          const extracted = ocrExtracted
            ? mergeROExtractions(grokExtracted, ocrExtracted, ocrText)
            : grokExtracted;

          if (scanCancelledRef.current) return;
          setOcrProgress(88);
          setScanStatusMessage('Creating repair order…');
          await createROFromExtracted(extracted);
        } catch (extractError) {
          console.warn('Server RO extraction failed, falling back to on-device OCR', extractError);
          setScanStatusMessage('AI unavailable — reading pages on device…');
          const combinedText = await runClientOcr();
          if (scanCancelledRef.current || !combinedText) return;
          setOcrProgress(92);
          setScanStatusMessage('Creating repair order…');
          await createROFromText(combinedText);
        }

        if (scanCancelledRef.current) return;
        setOcrProgress(100);
        setScanStatusMessage('Scan complete');
        clearPendingPreviews(images);
        setPendingROImages([]);
      } catch (error) {
        if (scanCancelledRef.current) return;
        console.error('RO scan error', error);
        toast.error(error instanceof Error ? error.message : 'Scan failed. Try fewer pages or sharper photos.');
        clearPendingPreviews(images);
        setPendingROImages([]);
      } finally {
        if (!scanCancelledRef.current) {
          onOcrFinish();
        }
      }
    },
    [
      clearPendingPreviews,
      createROFromExtracted,
      createROFromText,
      onOcrStart,
      onOcrFinish,
      setOcrProgress,
      setScanStatusMessage,
    ]
  );

  const scanRO = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.multiple = true;
    input.onchange = async (e) => {
      const rawFiles = Array.from((e.target as HTMLInputElement).files || []);
      if (rawFiles.length === 0) return;

      onOcrStart('Preparing files…');
      setOcrProgress(2);
      setScanStatusMessage('Converting PDFs and preparing pages…');

      try {
        const normalizedFiles = await normalizeScanFiles(rawFiles);
        if (normalizedFiles.length === 0) {
          toast.error('No supported images or PDFs were selected.');
          onOcrFinish();
          return;
        }

        const images: PendingImage[] = normalizedFiles.map((file, i) => ({
          id: 'roimg-' + Date.now() + '-' + i,
          previewUrl: URL.createObjectURL(file),
          name: file.name || `page-${i + 1}.jpg`,
          file,
        }));

        toast.success(`Scanning ${images.length} page${images.length === 1 ? '' : 's'}…`);
        await processScanImages(images);
      } catch (error) {
        console.error('Scan file preparation failed', error);
        toast.error(error instanceof Error ? error.message : 'Could not prepare files for scan.');
        onOcrFinish();
      }
    };
    input.click();
  }, [onOcrFinish, onOcrStart, pendingROImages.length, processScanImages, setOcrProgress, setScanStatusMessage]);

  const cancelScan = useCallback(() => {
    scanCancelledRef.current = true;
    clearPendingPreviews(pendingROImages);
    setPendingROImages([]);
    onOcrFinish();
    toast.message('Scan cancelled');
  }, [clearPendingPreviews, onOcrFinish, pendingROImages]);

  const createManualRO = useCallback(async () => {
    try {
      const draft = createManualRepairOrder();
      const { repairOrder } = await api.createRepairOrder(draft);
      setAllROs((prev) => [repairOrder, ...prev]);
      setCurrentRO(repairOrder);
      setView('ro');
      toast.success('Manual repair order created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create repair order');
    }
  }, []);

  const updateLine = useCallback(
    (lineId: string, updates: Partial<RepairLine>) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      const updatedLines = latestRO.repairLines.map((line) => (line.id === lineId ? { ...line, ...updates } : line));
      const updated = { ...latestRO, repairLines: updatedLines };
      setCurrentRO(updated);
      setAllROs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      saveRO(updated);
    },
    [getLatestRO, saveRO]
  );

  const updateVehicle = useCallback(
    (updates: Partial<RepairOrder['vehicle']>) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      const updated = { ...latestRO, vehicle: { ...latestRO.vehicle, ...updates } };
      setCurrentRO(updated);
      setAllROs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      saveRO(updated);
    },
    [getLatestRO, saveRO]
  );

  const updateCustomer = useCallback(
    (name: string) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      const updated = { ...latestRO, customer: { ...latestRO.customer, name } };
      setCurrentRO(updated);
      setAllROs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      saveRO(updated);
    },
    [getLatestRO, saveRO]
  );

  const updateComplaints = useCallback(
    (newComplaints: string[]) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      let updatedLines = latestRO.repairLines;
      if (newComplaints.length > 0) {
        const oldFirst = latestRO.complaints[0] || '';
        updatedLines = latestRO.repairLines.map((l, idx) => {
          if (idx === 0 && (!l.customerConcern || l.customerConcern === oldFirst)) {
            return { ...l, customerConcern: newComplaints[0] || '' };
          }
          return l;
        });
      }
      const updated = { ...latestRO, complaints: newComplaints, repairLines: updatedLines };
      setCurrentRO(updated);
      setAllROs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      saveRO(updated);
    },
    [getLatestRO, saveRO]
  );

  const addComplaint = useCallback(() => {
    const latestRO = getLatestRO();
    if (!latestRO) return;
    updateComplaints([...(latestRO.complaints || []), 'New concern - describe symptom']);
  }, [getLatestRO, updateComplaints]);

  const removeComplaint = useCallback(
    (index: number) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      updateComplaints((latestRO.complaints || []).filter((_, i) => i !== index));
    },
    [getLatestRO, updateComplaints]
  );

  const editComplaint = useCallback(
    (index: number, value: string) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      const updated = [...(latestRO.complaints || [])];
      updated[index] = value;
      updateComplaints(updated);
    },
    [getLatestRO, updateComplaints]
  );

  const updateRONumber = useCallback(
    (roNumber: string) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      const updated = { ...latestRO, roNumber: roNumber.trim() };
      setCurrentRO(updated);
      setAllROs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      saveRO(updated);
    },
    [getLatestRO, saveRO]
  );

  const decodeVinForRO = useCallback(async () => {
    const latestRO = getLatestRO();
    if (!latestRO?.vehicle.vin || latestRO.vehicle.vin.length < 17) {
      toast.error('Enter a valid 17-character VIN first');
      return;
    }
    try {
      const result = await api.decodeVin(latestRO.vehicle.vin);
      if (!result.valid) {
        toast.error('VIN could not be decoded — verify and try again');
        return;
      }
      updateVehicle({
        year: result.year || latestRO.vehicle.year,
        make: result.make || latestRO.vehicle.make,
        model: result.model || latestRO.vehicle.model,
        engine: result.engine || latestRO.vehicle.engine,
      });
      toast.success('Vehicle details filled from NHTSA VIN decode');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'VIN decode failed');
    }
  }, [getLatestRO, updateVehicle]);

  const addRepairLine = useCallback(async () => {
    const latestRO = getLatestRO();
    if (!latestRO) return;
    const newLine = createNewRepairLine(latestRO.repairLines.length + 1);
    const updated = { ...latestRO, repairLines: [...latestRO.repairLines, newLine] };
    const saved = await persistRO(updated);
    setCurrentRO(saved);
    setCurrentLineId(saved.repairLines[saved.repairLines.length - 1].id);
    setView('line');
  }, [getLatestRO, persistRO]);

  const applySmartDefaultsToLine = useCallback(
    (lineId: string) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      const line = latestRO.repairLines.find((l) => l.id === lineId);
      if (!line) return;
      const sugg = getSuggestions(latestRO);
      let notes = (line.technicianNotes || '').trim();
      const addBlock = `\n\n[Reference only — not performed unless documented]\n[Smart defaults for ${sugg.bandNote}]\nCommon issues at this mileage: ${sugg.issues.join(' • ')}\nTypical spec references: ${sugg.tests.map((t) => `${t.label}: ${t.spec}${t.note ? ' (' + t.note + ')' : ''}`).join('; ')}`;
      if (!notes.includes('Smart defaults')) notes = (notes + addBlock).trim();
      updateLine(lineId, { technicianNotes: notes });
      toast.success('Reference notes added');
    },
    [getLatestRO, updateLine]
  );

  const processXentryImages = useCallback(
    async (files: File[], existingImages: ImageAttachment[], existingOcr: string[], existingExtracted: ExtractedData) => {
      let updatedExtracted = existingExtracted;
      let updatedOcrTexts = existingOcr;
      const newImgs: ImageAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const attachment = await uploadFileAsAttachment(file, 'ximg');
        newImgs.push(attachment);
        try {
          const pre = await preprocessImageForOCR(file);
          const text = await runOCR(pre, (p) => setOcrProgress(Math.round(((i + p) / files.length) * 100)));
          const diag = parseDiagnosticText(text);
          updatedExtracted = mergeExtracted(updatedExtracted, diag);
          updatedOcrTexts = [...updatedOcrTexts, text];
        } catch (err) {
          console.warn('Xentry OCR failed for one image', err);
        }
      }

      return { newImgs, updatedExtracted, updatedOcrTexts, allImages: [...existingImages, ...newImgs] };
    },
    [setOcrProgress]
  );

  const addXentryPhotos = useCallback(
    (lineId: string) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.setAttribute('capture', 'environment');
      input.onchange = async (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        if (files.length === 0 || !currentRO) return;
        onOcrStart();
        const latestRO = getLatestRO();
        const lineForExtract = latestRO?.repairLines.find((l) => l.id === lineId);
        if (!latestRO || !lineForExtract) {
          onOcrFinish();
          return;
        }
        try {
          const result = await processXentryImages(
            files,
            lineForExtract.xentryImages || [],
            lineForExtract.xentryOcrTexts || [],
            lineForExtract.extractedData || emptyExtractedData()
          );
          const updatedLines = latestRO.repairLines.map((l) =>
            l.id === lineId
              ? { ...l, xentryImages: result.allImages, xentryOcrTexts: result.updatedOcrTexts, extractedData: result.updatedExtracted }
              : l
          );
          const updated = { ...latestRO, repairLines: updatedLines };
          await saveRO(updated);
          const updatedLine = updatedLines.find((l) => l.id === lineId);
          if (updatedLine && (!updatedLine.technicianNotes || updatedLine.technicianNotes.trim().length < 5)) {
            setTimeout(() => applySmartDefaultsToLine(lineId), 60);
          }
          toast.success(`${files.length} diagnostic photo(s) analyzed`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to upload photos');
        } finally {
          onOcrFinish();
        }
      };
      input.click();
    },
    [currentRO, getLatestRO, processXentryImages, saveRO, onOcrStart, onOcrFinish, applySmartDefaultsToLine]
  );

  const addROXentryPhotos = useCallback(() => {
    if (!currentRO) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.setAttribute('capture', 'environment');
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0 || !currentRO) return;
      onOcrStart();
      const latestRO = getLatestRO();
      if (!latestRO) {
        onOcrFinish();
        return;
      }
      try {
        const firstLine = latestRO.repairLines[0];
        const result = await processXentryImages(
          files,
          latestRO.xentryImages || [],
          latestRO.xentryOcrTexts || [],
          firstLine?.extractedData || emptyExtractedData()
        );
        let updatedLines = latestRO.repairLines;
        if (firstLine) {
          updatedLines = latestRO.repairLines.map((l, idx) =>
            idx === 0
              ? {
                  ...l,
                  xentryImages: [...(l.xentryImages || []), ...result.newImgs],
                  xentryOcrTexts: result.updatedOcrTexts,
                  extractedData: result.updatedExtracted,
                }
              : l
          );
        }
        await saveRO({
          ...latestRO,
          xentryImages: result.allImages,
          xentryOcrTexts: result.updatedOcrTexts,
          repairLines: updatedLines,
        });
        toast.success(`${files.length} Xentry photo(s) analyzed`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to upload photos');
      } finally {
        onOcrFinish();
      }
    };
    input.click();
  }, [currentRO, getLatestRO, processXentryImages, saveRO, onOcrStart, onOcrFinish]);

  const generateStory = useCallback(
    async (lineId: string) => {
      const latestRO = getLatestRO();
      if (!latestRO) return;
      setIsGenerating(true);
      try {
        const { warrantyStory } = await api.generateStory(latestRO.id, lineId);
        const updatedLines = latestRO.repairLines.map((l) => (l.id === lineId ? { ...l, warrantyStory } : l));
        const updated = { ...latestRO, repairLines: updatedLines };
        setCurrentRO(updated);
        setAllROs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        toast.success('Warranty story generated');
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Story generation failed');
      } finally {
        setIsGenerating(false);
      }
    },
    [getLatestRO]
  );

  const currentLine = currentRO?.repairLines.find((l) => l.id === currentLineId);

  const filteredROs = allROs
    .filter(
      (ro) =>
        ro.roNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ro.vehicle.make && ro.vehicle.make.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ro.vehicle.model && ro.vehicle.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ro.vehicle.year && ro.vehicle.year.includes(searchTerm)) ||
        (ro.vehicle.vin && ro.vehicle.vin.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => ((b.createdAt || '0') > (a.createdAt || '0') ? 1 : -1));

  return {
    view,
    setView,
    currentRO,
    setCurrentRO,
    currentLineId,
    setCurrentLineId,
    currentLine,
    allROs,
    loading,
    refreshList,
    searchTerm,
    setSearchTerm,
    pendingROImages,
    setPendingROImages,
    isGenerating,
    filteredROs,
    getLatestRO,
    deleteRO,
    openRO,
    scanRO,
    cancelScan,
    createManualRO,
    updateLine,
    updateVehicle,
    updateCustomer,
    addComplaint,
    removeComplaint,
    editComplaint,
    updateRONumber,
    decodeVinForRO,
    addRepairLine,
    applySmartDefaultsToLine,
    addXentryPhotos,
    addROXentryPhotos,
    generateStory,
  };
}
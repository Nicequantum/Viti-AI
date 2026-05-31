import React, { useState, useEffect } from 'react';
import { Camera, Settings, ArrowLeft, Plus, Copy, RefreshCw } from 'lucide-react';
import Tesseract from 'tesseract.js';

// Types
interface ExtractedData {
  codes: string[];
  guidedTests: string[];
  measurements: Array<{ label: string; value: string }>;
  components: string[];
  circuits: string[];
}

interface RepairLine {
  id: string;
  lineNumber: number;
  description: string;
  customerConcern: string;
  technicianNotes: string;
  xentryImages: Array<{ id: string; dataUrl: string; name: string }>;
  extractedData?: ExtractedData;
  warrantyStory?: string;
}

interface RepairOrder {
  id: string;
  roNumber: string;
  vehicle: {
    vin: string;
    year: string;
    model: string;
    mileageIn: string;
    mileageOut: string;
  };
  customer: {
    name: string;
  };
  complaints: string[];
  repairLines: RepairLine[];
}

// Full system prompt
const SYSTEM_PROMPT = `Act as a senior Mercedes-Benz master technician with 18 years experience writing warranty stories that always pass review.
Strict rules you must follow:

Always structure every story using the 3 C's: Customer Concern, Cause, and Correction
Every story must state that a battery charger was installed and maintained above 12.5 volts throughout testing
Every story must state that an Xentry Quick Test was performed and reference any relevant codes found
Always mention that all testing, Guided Tests, and data were reviewed in Xentry under the vehicle’s VIN in the cloud-based server
When Xentry images or Guided Test results are provided, specifically reference the exact component locations, wiring circuits, pin numbers, and test results shown in those images
Include specific technical details — SDS codes, Guided Test names, voltage readings, pin numbers, road test miles in and out, chassis ear results, wiring checks, etc.
All tech stories must have a clear cause. State it directly.
Write in natural first-person technician language. Sound like a real tech who did the work.
Vary sentence structure and phrasing between every repair line on the same vehicle.
Punch times must logically match the work described.

Vehicle information: Customer concern for this line: All repairs on this RO: Current repair line: Xentry test data and images: Write only the warranty story for this specific line. Make it sound completely human.`;

// Grok API call
async function generateWarrantyStoryWithGrok(
  ro: RepairOrder,
  line: RepairLine,
  apiKey: string
): Promise<string> {
  const vehicleInfo = `${ro.vehicle.year} ${ro.vehicle.model} | VIN: ${ro.vehicle.vin} | Miles: ${ro.vehicle.mileageIn} → ${ro.vehicle.mileageOut}`;

  const allRepairs = ro.repairLines
    .map((l) => `Line ${l.lineNumber}: ${l.description}`)
    .join('\n');

  const data = line.extractedData || { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] };
  const xentryText = [
    data.codes.length ? `Codes: ${data.codes.join(', ')}` : '',
    data.guidedTests.length ? `Guided Tests: ${data.guidedTests.join(' | ')}` : '',
    data.measurements.length ? `Measurements: ${data.measurements.map(m => `${m.label} = ${m.value}`).join('; ')}` : '',
    data.components.length ? `Components: ${data.components.join(' | ')}` : '',
    data.circuits.length ? `Circuits/Pins: ${data.circuits.join(', ')}` : ''
  ].filter(Boolean).join('\n') || 'No Xentry data provided.';

  const userMessage = `Vehicle information: ${vehicleInfo}

All repairs on this RO:
${allRepairs}

Current repair line: Line ${line.lineNumber} - ${line.description}

Customer concern for this line: ${line.customerConcern || line.description}

Technician notes: ${line.technicianNotes || 'None'}

Xentry test data and images:
${xentryText}

Write only the warranty story for this specific line.`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 900
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Grok API error: ${response.status} ${err}`);
  }

  const apiResponse = await response.json();
  return apiResponse.choices?.[0]?.message?.content?.trim() || 'No story generated.';
}

function App() {
  const [view, setView] = useState<'home' | 'ro' | 'line' | 'settings'>('home');
  const [currentRO, setCurrentRO] = useState<RepairOrder | null>(null);
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  // Load saved data
  useEffect(() => {
    const savedRO = localStorage.getItem('benztech_ro');
    if (savedRO) {
      setCurrentRO(JSON.parse(savedRO));
      setView('ro');
    }
    const savedKey = localStorage.getItem('benztech_grok_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const saveRO = (ro: RepairOrder | null) => {
    if (ro) {
      localStorage.setItem('benztech_ro', JSON.stringify(ro));
    } else {
      localStorage.removeItem('benztech_ro');
    }
    setCurrentRO(ro);
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('benztech_grok_key', key);
  };

  const currentLine = currentRO?.repairLines.find(l => l.id === currentLineId);

  // Camera + OCR
  const handleScanRO = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsProcessingOCR(true);
      setOcrProgress(0);

      try {
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.round(m.progress * 100));
            }
          }
        });

        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();

        createROFromText(text);
      } catch (error) {
        alert('OCR failed. You can enter data manually.');
        createROFromText('');
      } finally {
        setIsProcessingOCR(false);
        setOcrProgress(0);
      }
    };
    input.click();
  };

  const createROFromText = (text: string) => {
    const roNumber = (text.match(/RO[:\s#]*(\S+)/i) || [])[1] || `R-${Date.now()}`;
    const vin = (text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/) || [])[1] || '';

    const newRO: RepairOrder = {
      id: 'ro-' + Date.now(),
      roNumber,
      vehicle: { vin, year: '', model: '', mileageIn: '', mileageOut: '' },
      customer: { name: '' },
      complaints: text ? [text.slice(0, 200)] : ['Enter customer concerns manually'],
      repairLines: [{
        id: 'line-1',
        lineNumber: 1,
        description: 'Enter repair description',
        customerConcern: '',
        technicianNotes: '',
        xentryImages: [],
        extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] }
      }]
    };

    saveRO(newRO);
    setView('ro');
  };

  const addRepairLine = () => {
    if (!currentRO) return;
    const newLine: RepairLine = {
      id: 'line-' + Date.now(),
      lineNumber: currentRO.repairLines.length + 1,
      description: 'New repair item',
      customerConcern: '',
      technicianNotes: '',
      xentryImages: [],
      extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] }
    };
    const updated = { ...currentRO, repairLines: [...currentRO.repairLines, newLine] };
    saveRO(updated);
    setCurrentLineId(newLine.id);
    setView('line');
  };

  const updateLine = (lineId: string, updates: Partial<RepairLine>) => {
    if (!currentRO) return;
    const updatedLines = currentRO.repairLines.map(line =>
      line.id === lineId ? { ...line, ...updates } : line
    );
    saveRO({ ...currentRO, repairLines: updatedLines });
  };

  // Grok generation
  const generateStory = async (lineId: string) => {
    if (!currentRO || !apiKey) {
      alert('Please enter your Grok API key in Settings first.');
      setView('settings');
      return;
    }

    const line = currentRO.repairLines.find(l => l.id === lineId);
    if (!line) return;

    setIsGenerating(true);
    try {
      const story = await generateWarrantyStoryWithGrok(currentRO, line, apiKey);
      updateLine(lineId, { warrantyStory: story });
    } catch (error: any) {
      alert('Failed to generate story: ' + (error.message || 'Check your API key and internet connection.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const copyStory = (story: string) => {
    navigator.clipboard.writeText(story);
    alert('Copied to clipboard!');
  };

  // Render helpers
  const renderHome = () => (
    <div className="relative min-h-dvh">
      {/* Gear icon in top right of main screen */}
      <button
        onClick={() => setView('settings')}
        className="absolute top-4 right-4 p-2 text-[#8e8e93] z-10 touch-target"
        aria-label="Settings"
      >
        <Settings size={22} />
      </button>

      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center pt-12">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0a84ff] to-[#0066cc] flex items-center justify-center mb-6">
          <span className="text-white text-4xl font-bold">★</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tighter mb-2">BenzTech</h1>
        <p className="text-[#8e8e93] mb-10">Mercedes-Benz Warranty Stories</p>

        <button
          onClick={handleScanRO}
          disabled={isProcessingOCR}
          className="primary-btn w-full max-w-xs h-14 flex items-center justify-center gap-3 text-lg mb-4"
        >
          <Camera size={22} />
          {isProcessingOCR ? `SCANNING... ${ocrProgress}%` : 'SCAN REPAIR ORDER'}
        </button>

        <p className="text-xs text-[#8e8e93] mt-8 max-w-[260px]">
          Real AI stories powered by Grok. Requires internet + valid API key.
        </p>
      </div>
    </div>
  );

  const renderRO = () => {
    if (!currentRO) return null;

    return (
      <div className="px-5 pt-4 pb-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-xl font-semibold">{currentRO.roNumber}</div>
            <div className="text-sm text-[#8e8e93]">{currentRO.vehicle.model || 'Vehicle details'}</div>
          </div>
          <button onClick={() => setView('settings')} className="p-2 text-[#8e8e93]">
            <Settings size={20} />
          </button>
        </div>

        <div className="ios-card p-4 mb-6">
          <div className="text-xs uppercase tracking-widest text-[#8e8e93] mb-2">CUSTOMER CONCERNS</div>
          <div className="text-sm leading-snug">{currentRO.complaints[0]}</div>
        </div>

        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-sm font-semibold text-[#8e8e93]">REPAIR LINES</div>
          <button onClick={addRepairLine} className="flex items-center gap-1 text-[#0a84ff] text-sm font-medium">
            <Plus size={16} /> ADD LINE
          </button>
        </div>

        <div className="space-y-2">
          {currentRO.repairLines.map(line => (
            <div
              key={line.id}
              onClick={() => { setCurrentLineId(line.id); setView('line'); }}
              className="ios-card px-4 py-4 flex justify-between items-center active:bg-[#252528] cursor-pointer"
            >
              <div>
                <div className="font-medium">Line {line.lineNumber}: {line.description}</div>
                {line.warrantyStory && <div className="text-xs text-[#30d158] mt-0.5">Story ready</div>}
              </div>
              <div className="text-[#8e8e93]">›</div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setView('home')}
          className="mt-8 w-full text-sm text-[#8e8e93] py-3"
        >
          Start New RO
        </button>
      </div>
    );
  };

  const renderLine = () => {
    if (!currentLine || !currentRO) return null;

    return (
      <div className="px-5 pt-4 pb-10">
        <button onClick={() => setView('ro')} className="flex items-center text-[#0a84ff] mb-4">
          <ArrowLeft size={18} className="mr-1" /> Back to RO
        </button>

        <div className="mb-6">
          <div className="text-sm text-[#8e8e93]">LINE {currentLine.lineNumber}</div>
          <input
            value={currentLine.description}
            onChange={(e) => updateLine(currentLine.id, { description: e.target.value })}
            className="text-xl font-semibold bg-transparent w-full focus:outline-none"
          />
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-widest text-[#8e8e93] block mb-1.5">CUSTOMER CONCERN</label>
            <textarea
              value={currentLine.customerConcern}
              onChange={(e) => updateLine(currentLine.id, { customerConcern: e.target.value })}
              className="w-full bg-[#1c1c1e] border border-[#38383a] rounded-2xl p-3.5 text-sm min-h-[80px]"
              placeholder="Customer stated..."
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-[#8e8e93] block mb-1.5">TECHNICIAN NOTES</label>
            <textarea
              value={currentLine.technicianNotes}
              onChange={(e) => updateLine(currentLine.id, { technicianNotes: e.target.value })}
              className="w-full bg-[#1c1c1e] border border-[#38383a] rounded-2xl p-3.5 text-sm min-h-[100px]"
              placeholder="Road test results, findings..."
            />
          </div>

          <div>
            <button
              onClick={() => generateStory(currentLine.id)}
              disabled={isGenerating || !apiKey}
              className="primary-btn w-full h-14 text-base disabled:opacity-60"
            >
              {isGenerating ? 'GENERATING WITH GROK...' : 'GENERATE WARRANTY STORY'}
            </button>
            {!apiKey && <p className="text-center text-xs text-[#ff9f0a] mt-2">Add API key in Settings to use Grok</p>}
          </div>

          {currentLine.warrantyStory && (
            <div className="story-card p-5 mt-2">
              <div className="text-xs uppercase tracking-[1px] text-[#8e8e93] mb-3">WARRANTY STORY</div>
              <div className="whitespace-pre-line text-[14.5px] leading-relaxed mb-5">{currentLine.warrantyStory}</div>
              <div className="flex gap-3">
                <button onClick={() => copyStory(currentLine.warrantyStory!)} className="flex-1 secondary-btn h-11 flex items-center justify-center gap-2 text-sm">
                  <Copy size={16} /> COPY
                </button>
                <button onClick={() => generateStory(currentLine.id)} className="secondary-btn h-11 px-5 flex items-center gap-2 text-sm">
                  <RefreshCw size={16} /> REGENERATE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="px-5 pt-6">
      <button onClick={() => setView(currentRO ? 'ro' : 'home')} className="flex items-center text-[#0a84ff] mb-6">
        <ArrowLeft size={18} className="mr-1" /> Back
      </button>

      <h2 className="text-2xl font-semibold mb-6">Settings</h2>

      <div className="ios-card p-5 mb-6">
        <div className="font-semibold mb-2">Grok API Key</div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="xai-..."
          className="w-full bg-[#2c2c2e] border border-[#444] rounded-xl p-3.5 font-mono text-sm mb-3"
        />
        <div className="flex gap-3">
          <button onClick={() => saveApiKey(apiKey)} className="flex-1 secondary-btn h-11">Save Key</button>
          <button onClick={() => { setApiKey(''); localStorage.removeItem('benztech_grok_key'); }} className="secondary-btn h-11 px-6 text-[#ff9f0a]">Clear</button>
        </div>
        <p className="text-xs text-[#8e8e93] mt-3 leading-snug">
          Get your key at console.x.ai. Stored locally only. Required for real AI-generated stories.
        </p>
      </div>

      <div className="text-xs text-[#8e8e93] px-1 leading-relaxed">
        This app uses the official Grok API with the exact Mercedes-Benz master technician prompt for warranty stories.
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* Global header for non-main screens */}
      {view !== 'home' && view !== 'settings' && (
        <header className="ios-header h-14 px-4 flex items-center justify-between sticky top-0 z-50">
          <div className="font-semibold tracking-tight">BenzTech</div>
          <button onClick={() => setView('settings')} className="p-2 text-[#8e8e93]">
            <Settings size={20} />
          </button>
        </header>
      )}

      {view === 'home' && renderHome()}
      {view === 'ro' && renderRO()}
      {view === 'line' && renderLine()}
      {view === 'settings' && renderSettings()}
    </div>
  );
}

export default App;

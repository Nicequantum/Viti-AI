'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { ConsentModal } from '@/components/ConsentModal';
import { HomeView } from '@/components/HomeView';
import { LineView } from '@/components/LineView';
import { LoginView } from '@/components/LoginView';
import { ROView } from '@/components/ROView';
import { AuditLogView } from '@/components/AuditLogView';
import { SettingsView } from '@/components/SettingsView';
import { useOcrProgress } from '@/hooks/useOcrProgress';
import { useRepairOrders } from '@/hooks/useRepairOrders';
import { useSession } from '@/hooks/useSession';

export function BenzTechApp() {
  const { session, loading: sessionLoading, login, logout, acceptConsent } = useSession();
  const ocr = useOcrProgress();
  const ro = useRepairOrders({
    onOcrStart: ocr.startOcr,
    onOcrFinish: ocr.finishOcr,
    setOcrProgress: ocr.setOcrProgress,
  });
  const [consentLoading, setConsentLoading] = useState(false);

  if (sessionLoading || ro.loading) {
    return (
      <div className="app-container flex items-center justify-center min-h-dvh text-[#8e8e93] text-sm">
        Loading Benz Tech...
      </div>
    );
  }

  if (!session) {
    return <LoginView onLogin={login} />;
  }

  if (!session.consentAt) {
    return (
      <ConsentModal
        loading={consentLoading}
        onAccept={async () => {
          setConsentLoading(true);
          try {
            await acceptConsent();
          } finally {
            setConsentLoading(false);
          }
        }}
      />
    );
  }

  const goToSettings = () => ro.setView('settings');

  return (
    <div className="app-container">
      {ro.view !== 'home' && ro.view !== 'settings' && ro.view !== 'audit' && (
        <AppHeader dealershipName={session.dealershipName} technicianName={session.name} onOpenSettings={goToSettings} />
      )}

      {ro.view === 'home' && (
        <HomeView
          technicianName={session.name}
          dealershipName={session.dealershipName}
          filteredROs={ro.filteredROs}
          searchTerm={ro.searchTerm}
          onSearchChange={ro.setSearchTerm}
          pendingROImages={ro.pendingROImages}
          isProcessingOCR={ocr.isProcessingOCR}
          ocrProgress={ocr.ocrProgress}
          onAddROPhoto={ro.addROPhoto}
          onCreateManualRO={ro.createManualRO}
          onClearPending={() => ro.setPendingROImages([])}
          onRemovePending={(index) => ro.setPendingROImages((prev) => prev.filter((_, i) => i !== index))}
          onProcessPending={ro.processPendingROImages}
          onOpenRO={ro.openRO}
          onDeleteRO={ro.deleteRO}
          onOpenSettings={goToSettings}
        />
      )}

      {ro.view === 'ro' && ro.currentRO && (
        <ROView
          ro={ro.currentRO}
          isProcessingOCR={ocr.isProcessingOCR}
          ocrProgress={ocr.ocrProgress}
          onDone={() => ro.setView('home')}
          onUpdateRONumber={ro.updateRONumber}
          onUpdateVehicle={(field, value) => ro.updateVehicle({ [field]: value })}
          onUpdateCustomer={ro.updateCustomer}
          onAddComplaint={ro.addComplaint}
          onEditComplaint={ro.editComplaint}
          onRemoveComplaint={ro.removeComplaint}
          onDecodeVin={ro.decodeVinForRO}
          onAddROXentryPhotos={ro.addROXentryPhotos}
          onAddRepairLine={ro.addRepairLine}
          onOpenLine={(lineId) => {
            const latest = ro.getLatestRO(ro.currentRO);
            if (latest) ro.setCurrentRO(latest);
            ro.setCurrentLineId(lineId);
            ro.setView('line');
          }}
          onDeleteRO={() => ro.deleteRO(ro.currentRO!.id)}
        />
      )}

      {ro.view === 'line' && ro.currentRO && ro.currentLine && (
        <LineView
          ro={ro.currentRO}
          line={ro.currentLine}
          isProcessingOCR={ocr.isProcessingOCR}
          ocrProgress={ocr.ocrProgress}
          isGenerating={ro.isGenerating}
          onBack={() => {
            const latest = ro.getLatestRO(ro.currentRO);
            if (latest) ro.setCurrentRO(latest);
            ro.setView('ro');
          }}
          onUpdateLine={(updates) => ro.updateLine(ro.currentLine!.id, updates)}
          onAddXentryPhotos={() => ro.addXentryPhotos(ro.currentLine!.id)}
          onApplySmartDefaults={() => ro.applySmartDefaultsToLine(ro.currentLine!.id)}
          onGenerateStory={() => ro.generateStory(ro.currentLine!.id)}
        />
      )}

      {ro.view === 'settings' && (
        <SettingsView
          session={session}
          onBack={() => ro.setView(ro.currentRO ? 'ro' : 'home')}
          onLogout={logout}
          onOpenAuditLogs={session.role === 'manager' ? () => ro.setView('audit') : undefined}
        />
      )}

      {ro.view === 'audit' && (
        <AuditLogView
          session={session}
          onBack={() => ro.setView('settings')}
        />
      )}
    </div>
  );
}
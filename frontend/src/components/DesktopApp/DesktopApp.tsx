import { useState } from 'react';
import type { UseExplainFlowReturn } from '../../hooks/useExplainFlow';
import { DesktopHome } from '../DesktopHome';
import { DesktopLoading } from '../DesktopLoading';
import { DesktopOverview } from '../DesktopOverview';
import { DesktopDiagramFullscreen } from '../DesktopDiagramFullscreen';

type Theme = 'light' | 'dark';

interface DesktopAppProps {
  theme: Theme;
  onToggleTheme: () => void;
  explain: UseExplainFlowReturn;
  defaultQuery?: string;
}

export function DesktopApp({ theme, onToggleTheme, explain, defaultQuery }: DesktopAppProps) {
  const [openDiagram, setOpenDiagram] = useState<{ code: string; diagramId: string } | null>(null);

  // Same derived-screen approach as MobileApp: loading while in flight, overview once a
  // result lands (including an instant cache hit), home otherwise. "diagram" is a
  // navigational override that drops out automatically if a regenerate starts loading.
  const baseScreen: 'home' | 'loading' | 'overview' = explain.isLoading
    ? 'loading'
    : explain.resultData
      ? 'overview'
      : 'home';
  const screen = openDiagram && !explain.isLoading ? 'diagram' : baseScreen;

  const goHome = () => {
    explain.reset();
    setOpenDiagram(null);
  };

  const handleOpenDiagram = (code: string, diagramId: string) => {
    setOpenDiagram({ code, diagramId });
  };

  const repoName = explain.parsedRepo ? `${explain.parsedRepo.owner}/${explain.parsedRepo.repo}` : '';

  return (
    <>
      {screen === 'home' && (
        <DesktopHome
          theme={theme}
          onToggleTheme={onToggleTheme}
          error={explain.error}
          defaultQuery={defaultQuery}
          onSubmit={explain.submit}
        />
      )}

      {screen === 'loading' && (
        <DesktopLoading
          repoName={repoName || 'owner/repo'}
          currentStage={explain.currentStage}
          notifyEnabled={explain.notifyEnabled}
          notifySupported={explain.notifySupported}
          onEnableNotify={explain.enableNotifications}
          onRunInBackground={explain.runInBackground}
          onCancel={explain.cancel}
        />
      )}

      {screen === 'overview' && explain.resultData && explain.parsedRepo && (
        <DesktopOverview
          data={explain.resultData}
          owner={explain.parsedRepo.owner}
          repo={explain.parsedRepo.repo}
          isStoredOverview={explain.isStoredOverview}
          onBack={goHome}
          onRegenerate={explain.regenerate}
          onOpenDiagram={handleOpenDiagram}
        />
      )}

      {screen === 'diagram' && openDiagram && (
        <DesktopDiagramFullscreen
          code={openDiagram.code}
          diagramId={openDiagram.diagramId}
          repoName={repoName}
          onClose={() => setOpenDiagram(null)}
        />
      )}
    </>
  );
}

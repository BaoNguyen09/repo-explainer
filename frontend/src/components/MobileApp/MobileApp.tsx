import { useState } from 'react';
import type { UseExplainFlowReturn } from '../../hooks/useExplainFlow';
import { MobileHome } from '../MobileHome';
import { MobileLoading } from '../MobileLoading';
import { MobileOverview } from '../MobileOverview';
import { MobileDiagramFullscreen } from '../MobileDiagramFullscreen';
import { MobileChatSheet } from '../MobileChatSheet';

type Theme = 'light' | 'dark';

interface MobileAppProps {
  theme: Theme;
  onToggleTheme: () => void;
  explain: UseExplainFlowReturn;
  defaultQuery?: string;
}

export function MobileApp({ theme, onToggleTheme, explain, defaultQuery }: MobileAppProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [openDiagram, setOpenDiagram] = useState<{ code: string; diagramId: string } | null>(null);

  // The screen is derived from the explain flow's state on every render rather than
  // tracked separately: loading while a request is in flight, overview once a result
  // lands (including an instant cache hit that never sets isLoading), home otherwise
  // (including after an error). "diagram" is a navigational override on top of that,
  // which drops out automatically if a regenerate starts loading again.
  const baseScreen: 'home' | 'loading' | 'overview' = explain.isLoading
    ? 'loading'
    : explain.resultData
      ? 'overview'
      : 'home';
  const screen = openDiagram && !explain.isLoading ? 'diagram' : baseScreen;

  const goHome = () => {
    explain.reset();
    setChatOpen(false);
    setOpenDiagram(null);
  };

  const handleOpenDiagram = (code: string, diagramId: string) => {
    // Diagram fullscreen is its own screen, not an overlay — closing the chat sheet
    // avoids it stacking on top when a diagram is opened from within a chat reply.
    setChatOpen(false);
    setOpenDiagram({ code, diagramId });
  };

  const repoName = explain.parsedRepo ? `${explain.parsedRepo.owner}/${explain.parsedRepo.repo}` : '';

  return (
    <>
      {screen === 'home' && (
        <MobileHome
          theme={theme}
          onToggleTheme={onToggleTheme}
          error={explain.error}
          defaultQuery={defaultQuery}
          onSubmit={explain.submit}
        />
      )}

      {screen === 'loading' && (
        <MobileLoading
          repoName={repoName || 'owner/repo'}
          currentStage={explain.currentStage}
          notifyEnabled={explain.notifyEnabled}
          notifySupported={explain.notifySupported}
          onEnableNotify={explain.enableNotifications}
          onCancel={explain.cancel}
        />
      )}

      {screen === 'overview' && explain.resultData && explain.parsedRepo && (
        <MobileOverview
          data={explain.resultData}
          owner={explain.parsedRepo.owner}
          repo={explain.parsedRepo.repo}
          isStoredOverview={explain.isStoredOverview}
          onBack={goHome}
          onRegenerate={explain.regenerate}
          onOpenChat={() => setChatOpen(true)}
          onOpenDiagram={handleOpenDiagram}
        />
      )}

      {screen === 'diagram' && openDiagram && (
        <MobileDiagramFullscreen
          code={openDiagram.code}
          diagramId={openDiagram.diagramId}
          repoName={repoName}
          onClose={() => setOpenDiagram(null)}
        />
      )}

      {chatOpen && explain.resultData && explain.parsedRepo && (
        <MobileChatSheet
          owner={explain.parsedRepo.owner}
          repo={explain.parsedRepo.repo}
          explanation={explain.resultData.explanation}
          defaultBranch={explain.resultData.default_branch}
          suggestedQuestions={explain.resultData.suggested_questions}
          onClose={() => setChatOpen(false)}
          onOpenDiagram={handleOpenDiagram}
        />
      )}
    </>
  );
}

import React, { useState, useEffect } from 'react';
// @ts-ignore - react-split-pane types are incompatible with React 19
import SplitPane from 'react-split-pane';
import { Terminal } from './Terminal';
import { Preview } from './Preview';
import { ConsolePanel } from './ConsolePanel';
import { ConsoleMessage } from '../../../shared/src/types';
import './SplitView.css';

interface SplitViewProps {
  onTerminalInput: (data: string) => void;
  terminalOutput?: string | null;
  previewUrl?: string;
  reloadTrigger?: number; // P07-T005: Trigger to reload preview
  onConfigurePreview?: () => void;
  consoleMessages?: ConsoleMessage[]; // P08-T006: Console messages
  onClearConsole?: () => void; // P08-T006: Clear console callback
}

const STORAGE_KEY = 'claude-studio-split-position';
const STORAGE_KEY_PREVIEW = 'claude-studio-preview-split-position';
const DEFAULT_SPLIT_SIZE = '50%';
const DEFAULT_PREVIEW_SPLIT_SIZE = '60%';

export function SplitView({
  onTerminalInput,
  terminalOutput,
  previewUrl,
  reloadTrigger,
  onConfigurePreview,
  consoleMessages = [],
  onClearConsole,
}: SplitViewProps) {
  const [splitSize, setSplitSize] = useState<string | number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved || DEFAULT_SPLIT_SIZE;
  });

  const [previewSplitSize, setPreviewSplitSize] = useState<string | number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREVIEW);
    return saved || DEFAULT_PREVIEW_SPLIT_SIZE;
  });

  const [showConsole, setShowConsole] = useState(true);

  const handleSplitChange = (size: number) => {
    setSplitSize(size);
    localStorage.setItem(STORAGE_KEY, String(size));
  };

  const handlePreviewSplitChange = (size: number) => {
    setPreviewSplitSize(size);
    localStorage.setItem(STORAGE_KEY_PREVIEW, String(size));
  };

  useEffect(() => {
    // Handle window resize to update split pane
    const handleResize = () => {
      // Force re-render on resize
      setSplitSize((prev) => prev);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="split-view-container">
      {/* @ts-ignore - react-split-pane types incompatible with React 19 */}
      <SplitPane
        split="vertical"
        minSize={300}
        defaultSize={splitSize}
        onChange={handleSplitChange}
        className="split-pane"
        paneStyle={{ overflow: 'hidden' }}
        pane1Style={{ overflow: 'hidden' }}
        pane2Style={{ overflow: 'hidden' }}
      >
        <div className="split-pane-left">
          <Terminal onInput={onTerminalInput} output={terminalOutput} />
        </div>
        <div className="split-pane-right">
          {showConsole ? (
            /* @ts-ignore - react-split-pane types incompatible with React 19 */
            <SplitPane
              split="horizontal"
              minSize={100}
              defaultSize={previewSplitSize}
              onChange={handlePreviewSplitChange}
              className="preview-console-split"
              paneStyle={{ overflow: 'hidden' }}
            >
              <div className="preview-pane">
                <Preview url={previewUrl} reloadTrigger={reloadTrigger} onConfigure={onConfigurePreview} />
              </div>
              <div className="console-pane">
                <ConsolePanel messages={consoleMessages} onClear={onClearConsole || (() => {})} />
              </div>
            </SplitPane>
          ) : (
            <div className="preview-pane-full">
              <Preview url={previewUrl} reloadTrigger={reloadTrigger} onConfigure={onConfigurePreview} />
            </div>
          )}
        </div>
      </SplitPane>
    </div>
  );
}

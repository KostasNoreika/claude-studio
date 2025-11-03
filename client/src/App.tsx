import React, { useEffect, useState, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SplitView } from './components/SplitView';
import { ConnectionStatus } from './components/ConnectionStatus';
import { PortConfigModal } from './components/PortConfigModal';
import { ConsoleMessage, isConsoleMessage } from '../../shared/src/types';
import './App.css';

function App() {
  const {
    sendTerminalInput,
    connectionStatus,
    lastMessage,
    sessionId,
  } = useWebSocket();

  // Preview URL state
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);

  // Port config modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // P07-T005: Preview reload trigger
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // P08-T007: Console messages state
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);

  // Extract terminal output from last message
  const terminalOutput =
    lastMessage?.type === 'terminal:output' ? lastMessage.data : null;

  const handleTerminalInput = (data: string) => {
    sendTerminalInput(data);
  };

  // Log connection status changes
  useEffect(() => {
    console.log('Connection status:', connectionStatus);
  }, [connectionStatus]);

  // P06-T005: Handle preview:url messages from WebSocket
  useEffect(() => {
    if (lastMessage?.type === 'preview:url') {
      console.log(`Preview URL received: ${lastMessage.url} (port ${lastMessage.port})`);
      // Construct full URL (server is on :3850, proxy is at /preview/:sessionId)
      const fullUrl = `http://127.0.0.1:3850${lastMessage.url}`;
      setPreviewUrl(fullUrl);
    }
  }, [lastMessage]);

  // P07-T005: Handle preview:reload messages from WebSocket
  useEffect(() => {
    if (lastMessage?.type === 'preview:reload') {
      console.log(`Preview reload triggered by file changes:`, lastMessage.changedFiles);
      setReloadTrigger((prev) => prev + 1);
    }
  }, [lastMessage]);

  // P08-T007: Handle console messages from WebSocket
  useEffect(() => {
    if (lastMessage && isConsoleMessage(lastMessage)) {
      setConsoleMessages((prev) => [...prev, lastMessage]);
    }
  }, [lastMessage]);

  const handlePortConfigure = (port: number) => {
    console.log(`Port configured: ${port}`);
    // Preview URL will be set automatically via WebSocket message
  };

  const handleClearConsole = () => {
    setConsoleMessages([]);
  };

  return (
    <div className="app">
      <ConnectionStatus status={connectionStatus} sessionId={sessionId} />
      <SplitView
        onTerminalInput={handleTerminalInput}
        terminalOutput={terminalOutput}
        previewUrl={previewUrl}
        reloadTrigger={reloadTrigger}
        onConfigurePreview={() => setIsModalOpen(true)}
        consoleMessages={consoleMessages}
        onClearConsole={handleClearConsole}
      />
      <PortConfigModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfigure={handlePortConfigure}
        sessionId={sessionId}
      />
    </div>
  );
}

export default App;

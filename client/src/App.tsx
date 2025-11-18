import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SplitView } from './components/SplitView';
import { ConnectionStatus } from './components/ConnectionStatus';
import { PortConfigModal } from './components/PortConfigModal';
import { MCPInfoPanel } from './components/MCPInfoPanel';
import { Project } from './components/ProjectSelector';
import { ConsoleMessage, isConsoleMessage, createSessionCreateMessage } from '../../shared/src/types';
import './App.css';

function App() {
  const {
    sendTerminalInput,
    connectionStatus,
    lastMessage,
    sessionId,
    send,
    authError,
  } = useWebSocket();

  // Preview URL state
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);

  // Port config modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // P07-T005: Preview reload trigger
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // P08-T007: Console messages state
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);

  // Current project state
  const [currentProject, setCurrentProject] = useState<string | undefined>(undefined);

  // Extract terminal output from last message
  const terminalOutput =
    lastMessage?.type === 'terminal:output' ? lastMessage.data : null;

  // CRITICAL FIX: Memoize handleTerminalInput to prevent stale closures
  // This ensures Terminal component always has the latest sendTerminalInput reference
  const handleTerminalInput = useCallback((data: string) => {
    console.log('[App] Terminal input:', data.length, 'bytes');
    sendTerminalInput(data);
  }, [sendTerminalInput]);

  // Log connection status changes
  useEffect(() => {
    console.log('Connection status:', connectionStatus);
  }, [connectionStatus]);

  // P06-T005: Handle preview:url messages from WebSocket
  useEffect(() => {
    if (lastMessage?.type === 'preview:url') {
      console.log(`Preview URL received: ${lastMessage.url} (port ${lastMessage.port})`);
      // Use relative URL - Vite/Traefik proxy will handle routing
      setPreviewUrl(lastMessage.url);
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

  const handleProjectChange = (project: Project) => {
    console.log('Project selected:', project);
    setCurrentProject(project.name);

    // Send session:create message to backend
    const message = createSessionCreateMessage(project.path, project.name);
    send(message);

    // Clear console when switching projects
    setConsoleMessages([]);
  };

  // Display authentication error if present
  if (authError) {
    return (
      <div className="app">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: '#1e1e1e',
          color: '#ffffff',
        }}>
          <div style={{
            maxWidth: '600px',
            padding: '40px',
            backgroundColor: '#2d2d2d',
            borderRadius: '8px',
            border: '2px solid #ff4444',
          }}>
            <h1 style={{ color: '#ff4444', marginBottom: '20px' }}>
              Authentication Failed
            </h1>
            <p style={{ fontSize: '16px', lineHeight: '1.6', marginBottom: '20px' }}>
              {authError}
            </p>
            <div style={{
              textAlign: 'left',
              backgroundColor: '#1e1e1e',
              padding: '20px',
              borderRadius: '4px',
              marginBottom: '20px',
            }}>
              <h3 style={{ marginBottom: '10px' }}>How to fix:</h3>
              <ol style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>Check that <code>VITE_WS_AUTH_TOKEN</code> is set in <code>client/.env</code></li>
                <li>Check that <code>WS_AUTH_TOKEN</code> is set in server's <code>.env</code></li>
                <li>Ensure both tokens match exactly</li>
                <li>Restart both client and server</li>
                <li>Refresh this page</li>
              </ol>
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#007acc',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <ConnectionStatus
        status={connectionStatus}
        sessionId={sessionId}
        currentProject={currentProject}
        onProjectChange={handleProjectChange}
      />
      <SplitView
        onTerminalInput={handleTerminalInput}
        terminalOutput={terminalOutput}
        previewUrl={previewUrl}
        reloadTrigger={reloadTrigger}
        onConfigurePreview={() => setIsModalOpen(true)}
        consoleMessages={consoleMessages}
        onClearConsole={handleClearConsole}
      />
      <MCPInfoPanel defaultExpanded={false} />
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

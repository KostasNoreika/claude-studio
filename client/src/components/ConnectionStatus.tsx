import React from 'react';
import { ConnectionState } from '../services/websocket';
import './ConnectionStatus.css';

interface ConnectionStatusProps {
  status: ConnectionState;
  sessionId: string | null;
}

export function ConnectionStatus({ status, sessionId }: ConnectionStatusProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'green';
      case 'connecting':
        return 'yellow';
      case 'disconnected':
        return 'gray';
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="connection-status">
      <div className="status-indicator">
        <div className={`status-dot ${getStatusColor()}`} />
        <span className="status-text">{getStatusText()}</span>
      </div>
      {sessionId && (
        <div className="session-id">
          <span>Session: {sessionId.substring(0, 12)}...</span>
        </div>
      )}
    </div>
  );
}

/**
 * Port Configuration Modal
 * P06-T007: UI for configuring dev server port for preview
 *
 * Allows user to specify which port their dev server is running on
 * and sends configuration to the server to set up the proxy.
 */

import React, { useState } from 'react';
import './PortConfigModal.css';

export interface PortConfigModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when port is configured successfully */
  onConfigure: (port: number) => void;
  /** Current session ID (needed for API call) */
  sessionId: string | null;
}

export function PortConfigModal({
  isOpen,
  onClose,
  onConfigure,
  sessionId,
}: PortConfigModalProps) {
  const [port, setPort] = useState<string>('5173'); // Vite default
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate port
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 3000 || portNum > 9999) {
      setError('Port must be between 3000 and 9999');
      return;
    }

    if (!sessionId) {
      setError('No active session. Please refresh the page.');
      return;
    }

    setLoading(true);

    try {
      // Call proxy configuration API
      const response = await fetch('http://127.0.0.1:3850/api/proxy/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          port: portNum,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to configure proxy');
      }

      console.log('Proxy configured:', data);
      onConfigure(portNum);
      onClose();
    } catch (err) {
      console.error('Failed to configure proxy:', err);
      setError(err instanceof Error ? err.message : 'Failed to configure proxy');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="port-config-modal-overlay" onClick={handleOverlayClick}>
      <div className="port-config-modal">
        <h2>Configure Preview Port</h2>
        <p>Enter the port number where your development server is running.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="port">Port Number</label>
            <input
              id="port"
              type="number"
              min="3000"
              max="9999"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="5173"
              disabled={loading}
              autoFocus
            />
            <small>Common ports: 5173 (Vite), 3000 (CRA/Next), 8080</small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="button-group">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Configuring...' : 'Start Preview'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

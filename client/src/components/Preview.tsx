import React, { useState, useEffect, useRef } from 'react';
import { MCPStatus } from './MCPStatus';
import './Preview.css';

interface PreviewProps {
  url?: string;
  reloadTrigger?: number; // P07-T005: External trigger to reload iframe
  onConfigure?: () => void;
}

export function Preview({ url, reloadTrigger, onConfigure }: PreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [key, setKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);

    // SECURITY FIX (HIGH-003): Send auth token to iframe via postMessage
    // This prevents token exposure in URL parameters
    if (iframeRef.current?.contentWindow) {
      const token = import.meta.env.VITE_WS_AUTH_TOKEN;
      if (token) {
        // Send token to iframe's console interceptor
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'console-interceptor-token',
            token: token
          },
          '*' // In production, should be specific origin
        );
      }
    }
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setHasError(false);
    setKey((prev) => prev + 1);
  };

  // P07-T005: Handle reload trigger from file watcher
  useEffect(() => {
    if (reloadTrigger && reloadTrigger > 0 && url) {
      console.log('[Preview] Auto-reloading due to file changes');
      handleRefresh();
    }
  }, [reloadTrigger, url]);

  // SECURITY FIX (HIGH-003): Listen for token requests from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Handle token request from console interceptor
      if (event.data?.type === 'console-interceptor-ready' ||
          event.data?.type === 'console-interceptor-token-request') {
        const token = import.meta.env.VITE_WS_AUTH_TOKEN;
        if (token && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            {
              type: 'console-interceptor-token',
              token: token
            },
            '*' // In production, should validate origin
          );
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="preview-container">
      <div className="preview-header">
        <span className="preview-title">Preview</span>
        <MCPStatus className="preview-mcp-status" />
        <button
          onClick={handleRefresh}
          className="preview-refresh-btn"
          title="Refresh preview"
          disabled={!url}
        >
          ↻
        </button>
      </div>
      <div className="preview-content">
        {!url ? (
          <div className="preview-placeholder">
            <p>No preview configured</p>
            <p className="preview-placeholder-hint">
              Configure your dev server port to see preview
            </p>
            {onConfigure && (
              <button onClick={onConfigure} className="preview-configure-btn">
                Configure Preview
              </button>
            )}
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="preview-loading">
                <div className="preview-spinner"></div>
                <p>Loading preview...</p>
              </div>
            )}
            {hasError && (
              <div className="preview-error">
                <p>Failed to load preview</p>
                <button onClick={handleRefresh} className="preview-retry-btn">
                  Retry
                </button>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={key}
              src={url}
              className="preview-iframe"
              title="Preview"
              onLoad={handleLoad}
              onError={handleError}
              sandbox="allow-same-origin allow-scripts allow-forms"
              style={{ display: isLoading || hasError ? 'none' : 'block' }}
            />
          </>
        )}
      </div>
    </div>
  );
}

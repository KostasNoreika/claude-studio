import React, { useState, useEffect } from 'react';
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

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
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

  return (
    <div className="preview-container">
      <div className="preview-header">
        <span className="preview-title">Preview</span>
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

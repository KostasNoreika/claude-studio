/**
 * Console Panel Component
 * P08-T005: Display browser console logs in terminal UI
 *
 * Displays console.log, console.warn, and console.error messages
 * streamed from the preview browser via WebSocket.
 */

import React, { useRef, useEffect } from 'react';
import { ConsoleMessage } from '../../../shared/src/types';
import './ConsolePanel.css';

interface ConsolePanelProps {
  /** Array of console messages to display */
  messages: ConsoleMessage[];
  /** Callback to clear all messages */
  onClear: () => void;
}

/**
 * Format console arguments for display
 */
function formatArgs(args: unknown[]): string {
  return args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);

    // Handle special object types
    if (typeof arg === 'object' && arg !== null) {
      const obj = arg as Record<string, unknown>;

      if (obj.__type === 'error') {
        return `Error: ${obj.message}`;
      }
      if (obj.__type === 'element') {
        return `<${obj.tagName}${obj.id ? `#${obj.id}` : ''}${obj.className ? `.${obj.className}` : ''}>`;
      }
      if (obj.__type === 'circular') {
        return `[Circular: ${obj.preview}]`;
      }
      if (obj.__type === 'function') {
        return `[Function: ${obj.name}]`;
      }

      // Regular object/array
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return '[Object]';
      }
    }

    return String(arg);
  }).join(' ');
}

/**
 * Get CSS class for console level
 */
function getLevelClass(level: string): string {
  switch (level) {
    case 'warn': return 'console-warn';
    case 'error': return 'console-error';
    case 'info': return 'console-info';
    case 'debug': return 'console-debug';
    default: return 'console-log';
  }
}

/**
 * Get icon for console level
 */
function getLevelIcon(level: string): string {
  switch (level) {
    case 'warn': return '⚠';
    case 'error': return '✖';
    case 'info': return 'ℹ';
    case 'debug': return '◉';
    default: return '•';
  }
}

export function ConsolePanel({ messages, onClear }: ConsolePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="console-panel">
      <div className="console-header">
        <span className="console-title">Console</span>
        <button
          className="console-clear-btn"
          onClick={onClear}
          title="Clear console"
        >
          Clear
        </button>
      </div>
      <div className="console-messages" ref={containerRef}>
        {messages.length === 0 ? (
          <div className="console-empty">No console messages</div>
        ) : (
          messages.map((msg, index) => {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString();
            const formattedArgs = formatArgs(msg.args);

            return (
              <div key={index} className={`console-message ${getLevelClass(msg.level)}`}>
                <span className="console-icon">{getLevelIcon(msg.level)}</span>
                <span className="console-timestamp">[{timestamp}]</span>
                <span className="console-content">{formattedArgs}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

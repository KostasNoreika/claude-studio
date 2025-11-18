import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import './Terminal.css';

interface TerminalProps {
  onInput?: (data: string) => void;
  output?: string | null;  // New: for WebSocket output
}

export function Terminal({ onInput, output }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // CRITICAL FIX: Use ref to always call latest onInput function
  // This prevents stale closure issues with xterm.js onData handler
  const onInputRef = useRef(onInput);

  // Update ref whenever onInput prop changes
  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance with proper settings for copy/paste and editing
    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
      },
      rows: 30,
      cols: 80,
      scrollback: 10000, // Increased scrollback

      // Enable proper terminal behavior
      convertEol: true, // Convert \n to \r\n automatically
      disableStdin: false,
      cursorStyle: 'block',
      cursorInactiveStyle: 'outline',

      // Enable selection and clipboard
      rightClickSelectsWord: true,
      allowProposedApi: true, // Enable clipboard addon

      // Enable proper line handling
      scrollOnUserInput: true,
      fastScrollModifier: 'shift',
    });

    // Load addons
    const fitAddon = new FitAddon();
    const clipboardAddon = new ClipboardAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(clipboardAddon);
    terminal.loadAddon(webLinksAddon);

    // Open terminal in DOM
    terminal.open(terminalRef.current);

    // Fit to container
    fitAddon.fit();

    // Handle user input - NO LOCAL ECHO
    // Use ref to always call latest onInput function (prevents stale closures)
    const disposable = terminal.onData((data) => {
      console.log('[Terminal] User input:', data.length, 'bytes', data.charCodeAt(0));
      if (onInputRef.current) {
        onInputRef.current(data);
      } else {
        console.warn('[Terminal] No onInput handler available');
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Store refs
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Welcome message
    terminal.writeln('Welcome to Claude Studio!');
    terminal.writeln('Connecting to terminal server...');
    terminal.write('\r\n');

    // Cleanup
    return () => {
      console.log('[Terminal] Cleaning up terminal instance');
      window.removeEventListener('resize', handleResize);
      disposable.dispose(); // CRITICAL: Properly dispose onData handler
      terminal.dispose();
    };
  }, []); // Empty deps - terminal only created once

  // Handle output from WebSocket
  useEffect(() => {
    if (output && xtermRef.current) {
      xtermRef.current.write(output);
    }
  }, [output]);

  return (
    <div className="terminal-container">
      <div ref={terminalRef} className="terminal" />
    </div>
  );
}

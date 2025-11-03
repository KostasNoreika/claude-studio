import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
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

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
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
      scrollback: 500,  // Minimum 500 lines scrollback
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in DOM
    terminal.open(terminalRef.current);

    // Fit to container
    fitAddon.fit();

    // Handle user input - NO LOCAL ECHO
    terminal.onData((data) => {
      if (onInput) {
        onInput(data);
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
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, [onInput]);

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

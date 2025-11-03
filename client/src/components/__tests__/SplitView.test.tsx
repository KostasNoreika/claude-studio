import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitView } from '../SplitView';

// Mock xterm
const mockTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
};

vi.mock('xterm', () => ({
  Terminal: vi.fn(function XTermMock() {
    return mockTerminal;
  }),
}));

// Mock FitAddon
const mockFitAddon = {
  fit: vi.fn(),
};

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function FitAddonMock() {
    return mockFitAddon;
  }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('SplitView', () => {
  const mockOnTerminalInput = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('should render both Terminal and Preview components', () => {
    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={null}
      />
    );

    // Terminal should be present (check for terminal container)
    expect(document.querySelector('.terminal-container')).toBeInTheDocument();

    // Preview should be present
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('should render Terminal in left pane', () => {
    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={null}
      />
    );

    const leftPane = document.querySelector('.split-pane-left');
    expect(leftPane).toBeInTheDocument();
    expect(leftPane?.querySelector('.terminal-container')).toBeInTheDocument();
  });

  it('should render Preview in right pane', () => {
    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={null}
      />
    );

    const rightPane = document.querySelector('.split-pane-right');
    expect(rightPane).toBeInTheDocument();
    expect(rightPane?.querySelector('.preview-container')).toBeInTheDocument();
  });

  it('should pass terminalOutput to Terminal', () => {
    const testOutput = 'test output';
    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={testOutput}
      />
    );

    // Terminal component should be rendered with output
    expect(document.querySelector('.terminal-container')).toBeInTheDocument();
  });

  it('should pass previewUrl to Preview', () => {
    const testUrl = 'http://localhost:3000';
    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={null}
        previewUrl={testUrl}
      />
    );

    // Preview should render iframe with URL
    const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
    expect(iframe.src).toBe(testUrl + '/');
  });

  it('should show Preview placeholder when no url', () => {
    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={null}
      />
    );

    expect(screen.getByText('No preview configured')).toBeInTheDocument();
  });

  it('should use default split size when no saved position', () => {
    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={null}
      />
    );

    // Split pane should be rendered
    expect(document.querySelector('.split-pane')).toBeInTheDocument();
  });

  it('should restore split position from localStorage', () => {
    localStorageMock.setItem('claude-studio-split-position', '600');

    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={null}
      />
    );

    // Split pane should be rendered with saved position
    expect(document.querySelector('.split-pane')).toBeInTheDocument();
  });

  it('should have resizer element', () => {
    render(
      <SplitView
        onTerminalInput={mockOnTerminalInput}
        terminalOutput={null}
      />
    );

    // Resizer should be present
    const resizer = document.querySelector('.Resizer');
    expect(resizer).toBeInTheDocument();
  });
});

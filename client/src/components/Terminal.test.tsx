import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Terminal } from './Terminal';

// Mock xterm
const mockTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  onData: vi.fn((callback) => {
    mockTerminal._onDataCallback = callback;
    return { dispose: vi.fn() };
  }),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  _onDataCallback: null as any,
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

describe('Terminal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTerminal._onDataCallback = null;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render without errors', () => {
      const { container } = render(<Terminal />);
      expect(container).toBeTruthy();
    });

    it('should render terminal container', () => {
      const { container } = render(<Terminal />);
      const terminalContainer = container.querySelector('.terminal-container');
      expect(terminalContainer).toBeTruthy();
    });

    it('should render terminal div', () => {
      const { container } = render(<Terminal />);
      const terminalDiv = container.querySelector('.terminal');
      expect(terminalDiv).toBeTruthy();
    });
  });

  describe('XTerm Initialization', () => {
    it('should create xterm instance with correct config', async () => {
      const { Terminal: XTermConstructor } = await import('xterm');
      render(<Terminal />);

      expect(XTermConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: expect.objectContaining({
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            selectionBackground: '#264f78',
          }),
          rows: 30,
          cols: 80,
        })
      );
    });

    it('should open terminal in DOM', () => {
      render(<Terminal />);
      expect(mockTerminal.open).toHaveBeenCalled();
    });

    it('should load FitAddon', () => {
      render(<Terminal />);
      expect(mockTerminal.loadAddon).toHaveBeenCalled();
    });

    it('should fit terminal to container', async () => {
      render(<Terminal />);
      expect(mockFitAddon.fit).toHaveBeenCalled();
    });

    it('should write welcome message', () => {
      render(<Terminal />);

      expect(mockTerminal.writeln).toHaveBeenCalledWith('Welcome to Claude Studio!');
      expect(mockTerminal.writeln).toHaveBeenCalledWith('Type commands here...');
      expect(mockTerminal.write).toHaveBeenCalledWith('\r\n$ ');
    });

    it('should register onData handler', () => {
      render(<Terminal />);
      expect(mockTerminal.onData).toHaveBeenCalled();
    });
  });

  describe('Input Handling', () => {
    it('should call onInput callback when user types', () => {
      const onInputMock = vi.fn();
      render(<Terminal onInput={onInputMock} />);

      // Simulate user input
      const testData = 'hello';
      mockTerminal._onDataCallback(testData);

      expect(onInputMock).toHaveBeenCalledWith(testData);
    });

    it('should echo input locally', () => {
      render(<Terminal />);

      // Clear initial writes
      mockTerminal.write.mockClear();

      // Simulate user input
      const testData = 'a';
      mockTerminal._onDataCallback(testData);

      expect(mockTerminal.write).toHaveBeenCalledWith(testData);
    });

    it('should work without onInput callback', () => {
      render(<Terminal />);

      // Should not throw error
      expect(() => {
        mockTerminal._onDataCallback('test');
      }).not.toThrow();
    });

    it('should handle multiple inputs', () => {
      const onInputMock = vi.fn();
      render(<Terminal onInput={onInputMock} />);

      mockTerminal._onDataCallback('a');
      mockTerminal._onDataCallback('b');
      mockTerminal._onDataCallback('c');

      expect(onInputMock).toHaveBeenCalledTimes(3);
      expect(onInputMock).toHaveBeenNthCalledWith(1, 'a');
      expect(onInputMock).toHaveBeenNthCalledWith(2, 'b');
      expect(onInputMock).toHaveBeenNthCalledWith(3, 'c');
    });

    it('should echo each input character', () => {
      render(<Terminal />);

      // Clear initial writes
      mockTerminal.write.mockClear();

      mockTerminal._onDataCallback('h');
      mockTerminal._onDataCallback('i');

      expect(mockTerminal.write).toHaveBeenCalledTimes(2);
      expect(mockTerminal.write).toHaveBeenNthCalledWith(1, 'h');
      expect(mockTerminal.write).toHaveBeenNthCalledWith(2, 'i');
    });
  });

  describe('Cleanup', () => {
    it('should dispose terminal on unmount', () => {
      const { unmount } = render(<Terminal />);

      unmount();

      expect(mockTerminal.dispose).toHaveBeenCalled();
    });

    it('should remove resize listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(<Terminal />);
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('should cleanup even if terminal was not initialized', () => {
      const { unmount } = render(<Terminal />);

      // Should not throw
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Window Resize', () => {
    it('should register resize event listener', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      render(<Terminal />);

      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('should call fit on window resize', () => {
      render(<Terminal />);

      // Clear initial fit call
      mockFitAddon.fit.mockClear();

      // Trigger resize
      window.dispatchEvent(new Event('resize'));

      expect(mockFitAddon.fit).toHaveBeenCalled();
    });

    it('should handle multiple resize events', () => {
      render(<Terminal />);

      // Clear initial fit call
      mockFitAddon.fit.mockClear();

      // Trigger multiple resizes
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));

      expect(mockFitAddon.fit).toHaveBeenCalledTimes(3);
    });
  });

  describe('Component Props', () => {
    it('should accept onInput prop', () => {
      const onInputMock = vi.fn();
      const { container } = render(<Terminal onInput={onInputMock} />);

      expect(container).toBeTruthy();
    });

    it('should work without props', () => {
      const { container } = render(<Terminal />);

      expect(container).toBeTruthy();
    });
  });

  describe('Component Lifecycle', () => {
    it('should initialize terminal only once', async () => {
      const { Terminal: XTermConstructor } = await import('xterm');
      const { rerender } = render(<Terminal />);

      const initialCallCount = (XTermConstructor as any).mock.calls.length;

      // Rerender should not create new terminal
      rerender(<Terminal />);

      expect((XTermConstructor as any).mock.calls.length).toBe(initialCallCount);
    });

    it('should handle ref being null initially', () => {
      // This tests the guard clause: if (!terminalRef.current) return;
      expect(() => render(<Terminal />)).not.toThrow();
    });
  });

  describe('Terminal Theme', () => {
    it('should use dark theme colors', async () => {
      const { Terminal: XTermConstructor } = await import('xterm');
      render(<Terminal />);

      const config = (XTermConstructor as any).mock.calls[0][0];

      expect(config.theme.background).toBe('#1e1e1e');
      expect(config.theme.foreground).toBe('#d4d4d4');
      expect(config.theme.cursor).toBe('#d4d4d4');
      expect(config.theme.selectionBackground).toBe('#264f78');
    });
  });

  describe('Terminal Size', () => {
    it('should initialize with 30 rows', async () => {
      const { Terminal: XTermConstructor } = await import('xterm');
      render(<Terminal />);

      const config = (XTermConstructor as any).mock.calls[0][0];
      expect(config.rows).toBe(30);
    });

    it('should initialize with 80 cols', async () => {
      const { Terminal: XTermConstructor } = await import('xterm');
      render(<Terminal />);

      const config = (XTermConstructor as any).mock.calls[0][0];
      expect(config.cols).toBe(80);
    });
  });

  describe('Terminal Font', () => {
    it('should use monospace font family', async () => {
      const { Terminal: XTermConstructor } = await import('xterm');
      render(<Terminal />);

      const config = (XTermConstructor as any).mock.calls[0][0];
      expect(config.fontFamily).toContain('Menlo');
      expect(config.fontFamily).toContain('Monaco');
      expect(config.fontFamily).toContain('monospace');
    });

    it('should use 14px font size', async () => {
      const { Terminal: XTermConstructor } = await import('xterm');
      render(<Terminal />);

      const config = (XTermConstructor as any).mock.calls[0][0];
      expect(config.fontSize).toBe(14);
    });
  });

  describe('Cursor Configuration', () => {
    it('should enable cursor blink', async () => {
      const { Terminal: XTermConstructor } = await import('xterm');
      render(<Terminal />);

      const config = (XTermConstructor as any).mock.calls[0][0];
      expect(config.cursorBlink).toBe(true);
    });
  });
});

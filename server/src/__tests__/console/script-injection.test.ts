/**
 * Script Injection Tests
 * P08-T009: Test HTML injection and CSP handling
 */

import {
  injectConsoleScript,
  isHtmlContent,
  needsInjection,
  modifyCSPHeader,
  generateNonce,
  getScriptHash,
} from '../../console/script-injector';

describe('Script Injection', () => {
  describe('isHtmlContent', () => {
    it('should detect HTML content-type', () => {
      expect(isHtmlContent('text/html')).toBe(true);
      expect(isHtmlContent('text/html; charset=utf-8')).toBe(true);
      expect(isHtmlContent('TEXT/HTML')).toBe(true);
    });

    it('should reject non-HTML content-type', () => {
      expect(isHtmlContent('application/json')).toBe(false);
      expect(isHtmlContent('text/plain')).toBe(false);
      expect(isHtmlContent('image/png')).toBe(false);
      expect(isHtmlContent(undefined)).toBe(false);
    });
  });

  describe('needsInjection', () => {
    it('should detect if injection is needed', () => {
      const html = '<html><head></head><body>Test</body></html>';
      expect(needsInjection(html)).toBe(true);
    });

    it('should detect if already injected', () => {
      const html = '<html><head><script>window.__claudeStudio = {};</script></head><body>Test</body></html>';
      expect(needsInjection(html)).toBe(false);
    });
  });

  describe('injectConsoleScript', () => {
    it('should inject script before </head>', () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      const injected = injectConsoleScript(html);

      expect(injected).toContain('<script>');
      expect(injected).toContain('__claudeStudio');
      expect(injected.indexOf('<script>')).toBeLessThan(injected.indexOf('</head>'));
    });

    it('should inject script after <body> if no </head>', () => {
      const html = '<html><body>Content</body></html>';
      const injected = injectConsoleScript(html);

      expect(injected).toContain('<script>');
      expect(injected).toContain('__claudeStudio');
      expect(injected.indexOf('<script>')).toBeGreaterThan(injected.indexOf('<body'));
    });

    it('should inject at beginning if no head or body', () => {
      const html = '<div>Content</div>';
      const injected = injectConsoleScript(html);

      expect(injected).toContain('<script>');
      expect(injected).toContain('__claudeStudio');
      expect(injected.indexOf('<script>')).toBe(0);
    });

    it('should inject with nonce when specified', () => {
      const html = '<html><head></head><body>Content</body></html>';
      const nonce = 'test-nonce-123';
      const injected = injectConsoleScript(html, { useNonce: true, nonce });

      expect(injected).toContain(`nonce="${nonce}"`);
    });

    it('should not inject when disabled', () => {
      const html = '<html><head></head><body>Content</body></html>';
      const injected = injectConsoleScript(html, { disabled: true });

      expect(injected).toBe(html);
    });

    it('should preserve HTML structure', () => {
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Page</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>
`;
      const injected = injectConsoleScript(html);

      expect(injected).toContain('<!DOCTYPE html>');
      expect(injected).toContain('<meta charset="UTF-8">');
      expect(injected).toContain('<h1>Hello World</h1>');
    });
  });

  describe('modifyCSPHeader', () => {
    it('should add nonce to existing script-src', () => {
      const csp = "default-src 'self'; script-src 'self'";
      const nonce = 'test-nonce-123';
      const modified = modifyCSPHeader(csp, { useNonce: true, nonce });

      expect(modified).toContain("script-src 'self' 'nonce-test-nonce-123'");
    });

    it('should add hash to existing script-src', () => {
      const csp = "default-src 'self'; script-src 'self'";
      const modified = modifyCSPHeader(csp, { useNonce: false });

      const hash = getScriptHash();
      expect(modified).toContain(`'sha256-${hash}'`);
    });

    it('should create script-src if not present', () => {
      const csp = "default-src 'self'";
      const nonce = 'test-nonce-123';
      const modified = modifyCSPHeader(csp, { useNonce: true, nonce });

      expect(modified).toContain("script-src 'self' 'nonce-test-nonce-123'");
    });

    it('should preserve other directives', () => {
      const csp = "default-src 'self'; img-src *; style-src 'unsafe-inline'";
      const modified = modifyCSPHeader(csp, { useNonce: true, nonce: 'test' });

      expect(modified).toContain("default-src 'self'");
      expect(modified).toContain('img-src *');
      expect(modified).toContain("style-src 'unsafe-inline'");
    });

    it('should handle empty CSP header', () => {
      const csp = '';
      const modified = modifyCSPHeader(csp, { useNonce: true, nonce: 'test' });

      expect(modified).toBe('');
    });
  });

  describe('generateNonce', () => {
    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();

      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThan(0);
      expect(nonce2.length).toBeGreaterThan(0);
    });

    it('should generate base64 encoded nonces', () => {
      const nonce = generateNonce();
      const base64Pattern = /^[A-Za-z0-9+/]+=*$/;

      expect(base64Pattern.test(nonce)).toBe(true);
    });
  });

  describe('getScriptHash', () => {
    it('should return consistent hash', () => {
      const hash1 = getScriptHash();
      const hash2 = getScriptHash();

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('should be base64 encoded', () => {
      const hash = getScriptHash();
      const base64Pattern = /^[A-Za-z0-9+/]+=*$/;

      expect(base64Pattern.test(hash)).toBe(true);
    });
  });

  describe('Security - Injection Safety', () => {
    it('should not break HTML with malicious content', () => {
      const html = '<html><head></head><body><script>alert("existing")</script></body></html>';
      const injected = injectConsoleScript(html);

      // Should preserve existing script
      expect(injected).toContain('alert("existing")');
      // Should add our script
      expect(injected).toContain('__claudeStudio');
    });

    it('should handle HTML with special characters', () => {
      const html = '<html><head><title>Test & "Quotes" < ></title></head><body>Content</body></html>';
      const injected = injectConsoleScript(html);

      expect(injected).toContain('Test & "Quotes" < >');
      expect(injected).toContain('__claudeStudio');
    });

    it('should not create XSS vulnerabilities', () => {
      const html = '<html><head></head><body></body></html>';
      const injected = injectConsoleScript(html);

      // Our injected script should be self-contained
      expect(injected).not.toContain('eval(');
      expect(injected).not.toContain('innerHTML');
      expect(injected).not.toContain('document.write');
    });
  });
});

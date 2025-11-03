/**
 * Console Script Injector
 * P08-T002: Inject console interceptor into HTML responses
 *
 * Injects the console interceptor script into HTML responses via proxy middleware.
 * Handles CSP (Content Security Policy) challenges with nonce-based approach.
 *
 * SECURITY CRITICAL:
 * - Only injects into HTML content-type
 * - Adds CSP nonce for strict CSP policies
 * - Does not modify binary or non-HTML responses
 * - Validates response before injection
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash, randomBytes } from 'crypto';

/**
 * Load and cache the interceptor script
 */
let interceptorScript: string | null = null;
let scriptHash: string | null = null;

function loadInterceptorScript(): string {
  if (interceptorScript === null) {
    const scriptPath = join(__dirname, 'interceptor.js');
    interceptorScript = readFileSync(scriptPath, 'utf-8');

    // Calculate SHA-256 hash for CSP
    scriptHash = createHash('sha256')
      .update(interceptorScript)
      .digest('base64');
  }
  return interceptorScript;
}

/**
 * Get script hash for CSP
 */
export function getScriptHash(): string {
  if (scriptHash === null) {
    loadInterceptorScript();
  }
  return scriptHash!;
}

/**
 * Generate CSP nonce (random per request)
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Injection options
 */
export interface InjectionOptions {
  /** Use nonce-based CSP (true) or hash-based CSP (false) */
  useNonce?: boolean;
  /** Nonce value (required if useNonce is true) */
  nonce?: string;
  /** Disable script injection (for testing) */
  disabled?: boolean;
}

/**
 * Check if content is HTML
 */
export function isHtmlContent(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().includes('text/html');
}

/**
 * Inject console interceptor script into HTML
 *
 * Injects at the end of <head> or beginning of <body> if <head> not found.
 * Adds CSP nonce or hash for compatibility with strict CSP policies.
 *
 * @param html - Original HTML content
 * @param options - Injection options
 * @returns Modified HTML with injected script
 */
export function injectConsoleScript(html: string, options: InjectionOptions = {}): string {
  if (options.disabled) {
    return html;
  }

  const script = loadInterceptorScript();

  // Build script tag with CSP support
  let scriptTag: string;

  if (options.useNonce && options.nonce) {
    // Nonce-based CSP (more flexible, but requires dynamic nonce)
    scriptTag = `<script nonce="${options.nonce}">\n${script}\n</script>`;
  } else {
    // Hash-based CSP (static, but requires exact hash)
    scriptTag = `<script>\n${script}\n</script>`;
  }

  // Try to inject before </head>
  const headCloseMatch = html.match(/<\/head>/i);
  if (headCloseMatch) {
    return html.replace(/<\/head>/i, `${scriptTag}\n</head>`);
  }

  // Fallback: inject after <body>
  const bodyOpenMatch = html.match(/<body[^>]*>/i);
  if (bodyOpenMatch) {
    return html.replace(/<body([^>]*)>/i, `<body$1>\n${scriptTag}`);
  }

  // Last resort: inject at beginning of HTML
  return scriptTag + '\n' + html;
}

/**
 * Modify CSP header to allow injected script
 *
 * Updates Content-Security-Policy header to allow the interceptor script
 * using either nonce or hash.
 *
 * @param cspHeader - Original CSP header value
 * @param options - Injection options
 * @returns Modified CSP header
 */
export function modifyCSPHeader(cspHeader: string, options: InjectionOptions = {}): string {
  if (!cspHeader) {
    return cspHeader;
  }

  // Parse CSP directives
  const directives = cspHeader.split(';').map(d => d.trim());
  let scriptSrcFound = false;

  const modifiedDirectives = directives.map(directive => {
    if (directive.startsWith('script-src')) {
      scriptSrcFound = true;

      if (options.useNonce && options.nonce) {
        // Add nonce to script-src
        return `${directive} 'nonce-${options.nonce}'`;
      } else {
        // Add hash to script-src
        return `${directive} 'sha256-${getScriptHash()}'`;
      }
    }
    return directive;
  });

  // If script-src not found, add it
  if (!scriptSrcFound) {
    if (options.useNonce && options.nonce) {
      modifiedDirectives.push(`script-src 'self' 'nonce-${options.nonce}'`);
    } else {
      modifiedDirectives.push(`script-src 'self' 'sha256-${getScriptHash()}'`);
    }
  }

  return modifiedDirectives.join('; ');
}

/**
 * Check if HTML needs script injection
 *
 * Avoids double-injection by checking if script is already present.
 */
export function needsInjection(html: string): boolean {
  return !html.includes('__claudeStudio');
}

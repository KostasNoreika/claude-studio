/**
 * SSRF (Server-Side Request Forgery) Prevention Validator
 * P06-T002: CRITICAL - SECURITY
 *
 * Prevents proxy from being used to access:
 * - Internal network IPs (private ranges)
 * - Cloud metadata endpoints
 * - External hosts
 *
 * ONLY allows: localhost (127.0.0.1) and explicitly whitelisted hosts
 */

import { isIP } from 'net';

/**
 * Private/Internal IP ranges to block (CIDR notation)
 */
const BLOCKED_IP_RANGES = [
  // RFC 1918 - Private networks
  { start: '10.0.0.0', end: '10.255.255.255', name: 'Private Class A' },
  { start: '172.16.0.0', end: '172.31.255.255', name: 'Private Class B' },
  { start: '192.168.0.0', end: '192.168.255.255', name: 'Private Class C' },

  // Link-local addresses
  { start: '169.254.0.0', end: '169.254.255.255', name: 'Link-local' },

  // Loopback (except 127.0.0.1 which we explicitly allow)
  { start: '127.0.0.2', end: '127.255.255.255', name: 'Loopback range' },

  // Other reserved ranges
  { start: '0.0.0.0', end: '0.255.255.255', name: 'This network' },
  { start: '100.64.0.0', end: '100.127.255.255', name: 'Shared address space' },
  { start: '192.0.0.0', end: '192.0.0.255', name: 'IETF Protocol Assignments' },
  { start: '192.0.2.0', end: '192.0.2.255', name: 'TEST-NET-1' },
  { start: '198.18.0.0', end: '198.19.255.255', name: 'Benchmark testing' },
  { start: '198.51.100.0', end: '198.51.100.255', name: 'TEST-NET-2' },
  { start: '203.0.113.0', end: '203.0.113.255', name: 'TEST-NET-3' },
  { start: '224.0.0.0', end: '239.255.255.255', name: 'Multicast' },
  { start: '240.0.0.0', end: '255.255.255.255', name: 'Reserved' },
];

/**
 * Cloud metadata endpoints to explicitly block
 */
const BLOCKED_METADATA_ENDPOINTS = [
  '169.254.169.254', // AWS, Azure, GCP, DigitalOcean, Oracle Cloud
  '169.254.170.2',   // AWS ECS
  '100.100.100.200', // Alibaba Cloud
  'metadata.google.internal', // GCP
  'metadata',         // Generic
];

/**
 * Whitelist: ONLY these hosts are allowed
 */
const ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
];

/**
 * Validation result
 */
export interface SSRFValidationResult {
  allowed: boolean;
  reason?: string;
  host?: string;
}

/**
 * Convert IP string to number for range comparison
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Check if IP is in a blocked range
 */
function isIPInBlockedRange(ip: string): { blocked: boolean; range?: string } {
  const ipNum = ipToNumber(ip);

  for (const range of BLOCKED_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);

    if (ipNum >= startNum && ipNum <= endNum) {
      return { blocked: true, range: range.name };
    }
  }

  return { blocked: false };
}

/**
 * Validate that a target host/IP is safe to proxy to
 *
 * ONLY allows localhost (127.0.0.1) and whitelisted hosts
 * Blocks all private IPs, cloud metadata endpoints, and external hosts
 *
 * @param host - Hostname or IP address to validate
 * @returns Validation result with allowed flag and reason if blocked
 */
export function validateProxyTarget(host: string): SSRFValidationResult {
  // Normalize host (remove port if present, lowercase)
  const normalizedHost = host.toLowerCase().split(':')[0].trim();

  // Step 1: Check if in whitelist (ALLOWED)
  if (ALLOWED_HOSTS.includes(normalizedHost)) {
    return {
      allowed: true,
      host: normalizedHost,
    };
  }

  // Step 2: Check cloud metadata endpoints (BLOCKED)
  if (BLOCKED_METADATA_ENDPOINTS.includes(normalizedHost)) {
    return {
      allowed: false,
      reason: 'Cloud metadata endpoint access blocked',
      host: normalizedHost,
    };
  }

  // Step 3: Check if it's an IP address
  const ipVersion = isIP(normalizedHost);

  if (ipVersion !== 0) {
    // It's an IP address

    // IPv6 not allowed (system-wide disabled)
    if (ipVersion === 6) {
      return {
        allowed: false,
        reason: 'IPv6 addresses not allowed (system disabled)',
        host: normalizedHost,
      };
    }

    // Check if IP is in blocked range
    const rangeCheck = isIPInBlockedRange(normalizedHost);
    if (rangeCheck.blocked) {
      return {
        allowed: false,
        reason: `IP in blocked range: ${rangeCheck.range}`,
        host: normalizedHost,
      };
    }
  }

  // Step 4: Any host not in whitelist is BLOCKED (default deny)
  return {
    allowed: false,
    reason: 'Host not in whitelist (only localhost/127.0.0.1 allowed)',
    host: normalizedHost,
  };
}

/**
 * Validate port number is in allowed range
 *
 * @param port - Port number to validate
 * @returns true if port is valid, false otherwise
 */
export function validatePort(port: number): boolean {
  // Allow dev server ports (3000-9999)
  // Block system ports (0-1023) except when explicitly needed
  return Number.isInteger(port) && port >= 3000 && port <= 9999;
}

/**
 * Validate complete proxy target (host + port)
 *
 * @param host - Hostname or IP
 * @param port - Port number
 * @returns Validation result
 */
export function validateProxyTargetWithPort(
  host: string,
  port: number
): SSRFValidationResult {
  // Validate host first
  const hostResult = validateProxyTarget(host);
  if (!hostResult.allowed) {
    return hostResult;
  }

  // Validate port
  if (!validatePort(port)) {
    return {
      allowed: false,
      reason: `Port ${port} not in allowed range (3000-9999)`,
      host: hostResult.host,
    };
  }

  return {
    allowed: true,
    host: hostResult.host,
  };
}

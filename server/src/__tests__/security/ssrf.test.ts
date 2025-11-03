/**
 * SSRF Validator Tests - CRITICAL SECURITY
 * P06-T002 & P06-T009: Test SSRF prevention
 *
 * Ensures the SSRF validator blocks all dangerous targets:
 * - Private IP ranges
 * - Cloud metadata endpoints
 * - External hosts
 * - IPv6 addresses
 *
 * ONLY allows: localhost and 127.0.0.1
 */

import {
  validateProxyTarget,
  validatePort,
  validateProxyTargetWithPort,
} from '../../security/ssrf-validator';

describe('SSRF Validator', () => {
  describe('validateProxyTarget', () => {
    describe('Allowed hosts', () => {
      it('should allow localhost', () => {
        const result = validateProxyTarget('localhost');
        expect(result.allowed).toBe(true);
        expect(result.host).toBe('localhost');
      });

      it('should allow 127.0.0.1', () => {
        const result = validateProxyTarget('127.0.0.1');
        expect(result.allowed).toBe(true);
        expect(result.host).toBe('127.0.0.1');
      });

      it('should normalize case', () => {
        const result = validateProxyTarget('LOCALHOST');
        expect(result.allowed).toBe(true);
        expect(result.host).toBe('localhost');
      });

      it('should strip port from host', () => {
        const result = validateProxyTarget('localhost:5173');
        expect(result.allowed).toBe(true);
        expect(result.host).toBe('localhost');
      });
    });

    describe('Cloud metadata endpoints (CRITICAL)', () => {
      it('should block 169.254.169.254 (AWS/Azure/GCP)', () => {
        const result = validateProxyTarget('169.254.169.254');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('metadata');
      });

      it('should block 169.254.170.2 (AWS ECS)', () => {
        const result = validateProxyTarget('169.254.170.2');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('metadata');
      });

      it('should block 100.100.100.200 (Alibaba Cloud)', () => {
        const result = validateProxyTarget('100.100.100.200');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('metadata');
      });

      it('should block metadata.google.internal', () => {
        const result = validateProxyTarget('metadata.google.internal');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('metadata');
      });
    });

    describe('Private IP ranges (RFC 1918)', () => {
      it('should block 10.0.0.0/8 (Class A private)', () => {
        expect(validateProxyTarget('10.0.0.1').allowed).toBe(false);
        expect(validateProxyTarget('10.255.255.254').allowed).toBe(false);
      });

      it('should block 172.16.0.0/12 (Class B private)', () => {
        expect(validateProxyTarget('172.16.0.1').allowed).toBe(false);
        expect(validateProxyTarget('172.31.255.254').allowed).toBe(false);
      });

      it('should block 192.168.0.0/16 (Class C private)', () => {
        expect(validateProxyTarget('192.168.1.1').allowed).toBe(false);
        expect(validateProxyTarget('192.168.255.254').allowed).toBe(false);
      });

      it('should block link-local 169.254.0.0/16', () => {
        expect(validateProxyTarget('169.254.1.1').allowed).toBe(false);
        expect(validateProxyTarget('169.254.255.254').allowed).toBe(false);
      });
    });

    describe('Other reserved ranges', () => {
      it('should block 0.0.0.0/8 (this network)', () => {
        expect(validateProxyTarget('0.0.0.1').allowed).toBe(false);
      });

      it('should block 127.0.0.2-255 (loopback range, except 127.0.0.1)', () => {
        expect(validateProxyTarget('127.0.0.2').allowed).toBe(false);
        expect(validateProxyTarget('127.255.255.254').allowed).toBe(false);
      });

      it('should block 100.64.0.0/10 (shared address space)', () => {
        expect(validateProxyTarget('100.64.0.1').allowed).toBe(false);
      });

      it('should block multicast 224.0.0.0/4', () => {
        expect(validateProxyTarget('224.0.0.1').allowed).toBe(false);
      });
    });

    describe('External hosts (default deny)', () => {
      it('should block google.com', () => {
        const result = validateProxyTarget('google.com');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('whitelist');
      });

      it('should block example.com', () => {
        const result = validateProxyTarget('example.com');
        expect(result.allowed).toBe(false);
      });

      it('should block public IP 8.8.8.8', () => {
        const result = validateProxyTarget('8.8.8.8');
        expect(result.allowed).toBe(false);
      });
    });

    describe('IPv6 (system disabled)', () => {
      it('should block ::1 (IPv6 loopback)', () => {
        const result = validateProxyTarget('::1');
        expect(result.allowed).toBe(false);
        // IPv6 is blocked as "not in whitelist" (isIP returns 0 without brackets)
        expect(result.reason).toBeTruthy();
      });

      it('should block IPv6 addresses', () => {
        const result = validateProxyTarget('2001:db8::1');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeTruthy();
      });

      it('should block IPv6 with brackets and detect as IPv6', () => {
        // When in URL format [::1], isIP can detect it
        const result = validateProxyTarget('[::1]');
        expect(result.allowed).toBe(false);
      });
    });
  });

  describe('validatePort', () => {
    it('should allow ports in range 3000-9999', () => {
      expect(validatePort(3000)).toBe(true);
      expect(validatePort(5173)).toBe(true);
      expect(validatePort(8080)).toBe(true);
      expect(validatePort(9999)).toBe(true);
    });

    it('should block ports below 3000', () => {
      expect(validatePort(80)).toBe(false);
      expect(validatePort(443)).toBe(false);
      expect(validatePort(1024)).toBe(false);
      expect(validatePort(2999)).toBe(false);
    });

    it('should block ports above 9999', () => {
      expect(validatePort(10000)).toBe(false);
      expect(validatePort(65535)).toBe(false);
    });

    it('should block non-integer ports', () => {
      expect(validatePort(3000.5)).toBe(false);
      expect(validatePort(NaN)).toBe(false);
    });
  });

  describe('validateProxyTargetWithPort', () => {
    it('should allow localhost:5173', () => {
      const result = validateProxyTargetWithPort('localhost', 5173);
      expect(result.allowed).toBe(true);
    });

    it('should allow 127.0.0.1:3000', () => {
      const result = validateProxyTargetWithPort('127.0.0.1', 3000);
      expect(result.allowed).toBe(true);
    });

    it('should block localhost with invalid port', () => {
      const result = validateProxyTargetWithPort('localhost', 80);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Port');
    });

    it('should block private IP even with valid port', () => {
      const result = validateProxyTargetWithPort('192.168.1.1', 5173);
      expect(result.allowed).toBe(false);
      expect(result.reason).not.toContain('Port');
    });

    it('should block cloud metadata even with valid port', () => {
      const result = validateProxyTargetWithPort('169.254.169.254', 5173);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('metadata');
    });
  });
});

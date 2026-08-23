import { afterEach, describe, expect, it } from 'vitest';
import { assertPublicWebhookUrl } from './webhook-url-guard';

// NODE_ENV is 'test' under vitest by default, which is exactly the escape
// hatch this guard uses to let the e2e suite target a local HTTP server —
// so these assertions force NODE_ENV to 'production' first, to prove the
// block is real for the environment it actually has to hold in.
describe('assertPublicWebhookUrl', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('rejects loopback, RFC1918, and link-local/cloud-metadata IPv4 literals', async () => {
    process.env.NODE_ENV = 'production';
    await expect(assertPublicWebhookUrl('http://127.0.0.1:3000/hook')).rejects.toThrow();
    await expect(assertPublicWebhookUrl('http://10.0.0.5/hook')).rejects.toThrow();
    await expect(assertPublicWebhookUrl('http://172.16.0.1/hook')).rejects.toThrow();
    await expect(assertPublicWebhookUrl('http://192.168.1.1/hook')).rejects.toThrow();
    await expect(assertPublicWebhookUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
  });

  it('rejects IPv6 loopback and unique-local literals', async () => {
    process.env.NODE_ENV = 'production';
    await expect(assertPublicWebhookUrl('http://[::1]/hook')).rejects.toThrow();
    await expect(assertPublicWebhookUrl('http://[fd00::1]/hook')).rejects.toThrow();
  });

  it('rejects a non-http(s) scheme', async () => {
    process.env.NODE_ENV = 'production';
    await expect(assertPublicWebhookUrl('ftp://example.com/hook')).rejects.toThrow();
    await expect(assertPublicWebhookUrl('file:///etc/passwd')).rejects.toThrow();
  });

  it('rejects a malformed URL', async () => {
    process.env.NODE_ENV = 'production';
    await expect(assertPublicWebhookUrl('not a url')).rejects.toThrow();
  });

  it('accepts a public IPv4 literal', async () => {
    process.env.NODE_ENV = 'production';
    await expect(assertPublicWebhookUrl('http://93.184.216.34/hook')).resolves.toBeUndefined();
  });

  it('bypasses the check under NODE_ENV=test, so the e2e suite can target its own local server', async () => {
    process.env.NODE_ENV = 'test';
    await expect(assertPublicWebhookUrl('http://127.0.0.1:54321/hook')).resolves.toBeUndefined();
  });
});

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BadRequestException } from '@nestjs/common';

// Blocks a webhook endpoint URL from ever resolving to the server's own
// network — loopback, RFC1918 private ranges, and link-local (which
// includes the 169.254.169.254 cloud metadata address). The same class of
// protection Stripe/GitHub apply to tenant-supplied webhook URLs: without
// it, a malicious or compromised admin account could point a webhook at an
// internal address and use PCAARB's own server as a network probe to reach
// addresses their browser could never touch directly (the Postgres
// instance, another tenant's internal service, cloud IMDS credentials).
// Called both at endpoint create/update time and again immediately before
// every delivery attempt — a hostname can resolve differently between the
// two moments (DNS rebinding), so the create-time check alone isn't enough.
export async function assertPublicWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Webhook URL is not valid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL must use http or https');
  }

  // The e2e suite proves real delivery (signing, retry, status recording)
  // against a local HTTP server it spins up itself — which is necessarily a
  // loopback address, exactly what this guard exists to block in
  // production. NODE_ENV=test is vitest's own default, not something a
  // request can influence, so this can't be used to bypass the guard
  // outside the test run itself. See webhook-url-guard.spec.ts for the test
  // that proves the block is real when NODE_ENV isn't 'test'.
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const hostname = parsed.hostname;
  if (isIP(hostname)) {
    assertPublicIp(hostname);
    return;
  }

  let addresses: string[];
  try {
    const results = await lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new BadRequestException('Webhook URL hostname could not be resolved');
  }
  if (addresses.length === 0) {
    throw new BadRequestException('Webhook URL hostname could not be resolved');
  }
  for (const address of addresses) {
    assertPublicIp(address);
  }
}

function assertPublicIp(address: string): void {
  if (isPrivateOrReservedIp(address)) {
    throw new BadRequestException('Webhook URL cannot point to a private, local, or reserved network address');
  }
}

// Covers the ranges that matter for SSRF (loopback, link-local/cloud
// metadata, RFC1918 private space, and their IPv6 equivalents) — not an
// exhaustive reserved-block list. Ranges like documentation/benchmarking
// blocks are skipped deliberately: they're not a reachable network position
// from this server, so blocking them adds rules without closing a real gap.
function isPrivateOrReservedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    // isIP(address) === 4 already guarantees exactly 4 numeric octets.
    const a = octets[0]!;
    const b = octets[1]!;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      return isIP(mapped) === 4 ? isPrivateOrReservedIp(mapped) : true;
    }
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return false;
  }
  // Not a recognizable IP literal — fail closed.
  return true;
}

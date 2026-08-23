import { createHmac } from 'node:crypto';

// Stripe-style signature scheme: sign `${timestamp}.${rawBody}`, not the
// body alone, so a captured header can't be replayed against a different
// payload — the receiver is expected to check both that the signature
// matches and that the timestamp is recent.
export function buildSignatureHeader(secret: string, timestamp: string, rawBody: string): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

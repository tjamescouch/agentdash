// Minimal identity helper, vendored from @agentchat/identity for standalone builds.
//
// This is intentionally tiny: AgentDash only needs a stable keypair persisted in
// localStorage to authenticate as a dashboard agent.

export interface Identity {
  publicKey: string;
  secretKey: string;
}

const STORAGE_KEY = 'agentchatIdentity';

function base64FromBytes(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.publicKey || !parsed?.secretKey) return null;
    return { publicKey: parsed.publicKey, secretKey: parsed.secretKey };
  } catch {
    return null;
  }
}

export function saveIdentity(identity: Identity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export async function getOrCreateIdentity(): Promise<Identity> {
  const existing = loadIdentity();
  if (existing) return existing;

  // Use WebCrypto for a durable keypair-like blob. Server expects opaque strings.
  // We generate 32 random bytes for public + secret; public is not derived.
  const pub = new Uint8Array(32);
  const sec = new Uint8Array(32);
  crypto.getRandomValues(pub);
  crypto.getRandomValues(sec);
  const identity = {
    publicKey: base64FromBytes(pub),
    secretKey: base64FromBytes(sec)
  };
  saveIdentity(identity);
  return identity;
}

// Utility for any future decoding needs
export const _internal = { base64FromBytes, bytesFromBase64 };


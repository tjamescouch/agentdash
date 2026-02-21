/**
 * @agentchat/identity
 *
 * Persistent Ed25519 identity for AgentChat dashboards.
 * Uses the browser's built-in Web Crypto API — zero dependencies.
 *
 * The identity format is compatible with the AgentChat server's tweetnacl expectations:
 *   publicKey: base64-encoded 32-byte Ed25519 public key
 *   secretKey: base64-encoded 64-byte nacl-format secret key (seed || publicKey)
 *
 * On first call, generates a fresh keypair and saves it to localStorage.
 * On subsequent calls, returns the saved identity.
 * If localStorage is unavailable (SSR), returns null.
 */

const STORAGE_KEY = 'dashboardIdentity';

export interface DashboardIdentity {
  publicKey: string; // base64, 32 bytes
  secretKey: string; // base64, 64 bytes (nacl format: seed || publicKey)
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generate a fresh Ed25519 identity using the Web Crypto API.
 * Returns the identity in AgentChat server-compatible format (base64 strings).
 */
async function generateIdentity(): Promise<DashboardIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' } as EcKeyGenParams,
    true /* extractable */,
    ['sign', 'verify']
  );

  // Export public key: 32 raw bytes
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', keyPair.publicKey)
  );

  // Export private key: PKCS8 DER. The raw 32-byte seed is at bytes [16..48].
  // nacl secretKey = seed (32 bytes) || publicKey (32 bytes) = 64 bytes total.
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  );
  const seed = privateKeyPkcs8.slice(16, 48);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(publicKeyRaw, 32);

  return {
    publicKey: base64Encode(publicKeyRaw),
    secretKey: base64Encode(secretKey),
  };
}

/**
 * Get the persisted dashboard identity, or generate and save one on first call.
 * Returns null in SSR/non-browser environments where localStorage is unavailable.
 */
export async function getOrCreateIdentity(): Promise<DashboardIdentity | null> {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as DashboardIdentity;
      if (parsed.publicKey && parsed.secretKey) return parsed;
    } catch {
      // Corrupted — regenerate
    }
  }

  const identity = await generateIdentity();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

/**
 * Read the stored identity synchronously (no generation).
 * Returns null if not yet generated or unavailable.
 */
export function getStoredIdentity(): DashboardIdentity | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as DashboardIdentity;
    return parsed.publicKey && parsed.secretKey ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist an identity received from the server (e.g. session_identity message).
 * Call this when the server sends back keys so they survive page refresh.
 */
export function saveIdentity(identity: DashboardIdentity): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

/**
 * Clear the stored identity. The next call to getOrCreateIdentity() will
 * generate a fresh keypair, resulting in a new persistent agent ID.
 */
export function clearIdentity(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  localStorage.removeItem(STORAGE_KEY);
}

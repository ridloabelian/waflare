const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface EncryptedVaultEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  salt: string;
  iv: string;
  ciphertext: string;
}

/**
 * Encrypts message content at rest using PBKDF2 + AES-256-GCM Web Crypto APIs.
 */
export async function encryptVaultPayload(plaintext: string, passphrase: string): Promise<string> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Vault passphrase must be at least 8 characters.");
  }
  const salt = new Uint8Array(new ArrayBuffer(16));
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const key = await deriveAesKey(passphrase, salt);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  const envelope: EncryptedVaultEnvelope = {
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(cipherBuffer))
  };
  return JSON.stringify(envelope);
}

/**
 * Decrypts a vault envelope encrypted by encryptVaultPayload.
 */
export async function decryptVaultPayload(serialized: string, passphrase: string): Promise<string> {
  const parsed = JSON.parse(serialized) as EncryptedVaultEnvelope;
  if (parsed.v !== 1 || parsed.alg !== "AES-256-GCM") {
    throw new Error("Unsupported vault envelope format.");
  }
  const salt = fromBase64(parsed.salt);
  const iv = fromBase64(parsed.iv);
  const ciphertext = fromBase64(parsed.ciphertext);
  const key = await deriveAesKey(passphrase, salt);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return decoder.decode(plainBuffer);
}

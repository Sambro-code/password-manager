// Converts a plain string (like a password) into raw bytes
function stringToBytes(str) {
  return new TextEncoder().encode(str);
}

// Converts raw bytes back into a plain string
function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

// Converts bytes to a Base64 string, so we can store them as text
function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

// Converts a Base64 string back into bytes
function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Takes the master password + a random "salt", and derives a strong encryption key
export async function deriveKeyFromPassword(masterPassword, saltBytes) {
  const passwordBytes = stringToBytes(masterPassword);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 250000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

// Encrypts a plain text string, returns everything needed to decrypt it later
export async function encryptText(plainText, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = stringToBytes(plainText);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encodedText
  );

  return {
    cipherText: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(iv),
  };
}

// Decrypts using the same key and the iv that was generated during encryption
export async function decryptText(cipherTextBase64, ivBase64, key) {
  const cipherBytes = base64ToBytes(cipherTextBase64);
  const ivBytes = base64ToBytes(ivBase64);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    cipherBytes
  );

  return bytesToString(new Uint8Array(decryptedBuffer));
}

// Generates a random salt — used once, when first setting up the master password
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export { bytesToBase64, base64ToBytes };
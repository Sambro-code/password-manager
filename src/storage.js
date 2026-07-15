const STORAGE_KEY = 'passwordManagerVault';
const BIOMETRIC_FLAG_KEY = 'passwordManagerVault_biometricEnabled';

export function vaultExists() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function loadVaultRaw() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveVaultRaw(vaultData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vaultData));
}

export function isBiometricEnabled() {
  return localStorage.getItem(BIOMETRIC_FLAG_KEY) === 'true';
}

export function setBiometricEnabled(enabled) {
  localStorage.setItem(BIOMETRIC_FLAG_KEY, enabled ? 'true' : 'false');
}
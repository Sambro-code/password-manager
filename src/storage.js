const STORAGE_KEY = 'passwordManagerVault';

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
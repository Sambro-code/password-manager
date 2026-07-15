import { useState, useEffect } from 'react';
import './App.css';
import { generateSalt, deriveKeyFromPassword, encryptText, decryptText, bytesToBase64, base64ToBytes } from './crypto.js';
import { vaultExists, loadVaultRaw, saveVaultRaw } from './storage.js';

// Small inline icons — no external icon library needed
function IconLock({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function IconEye({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M6.6 6.7C4 8.3 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.4 4.7-1.1M17.9 17.9C20.4 16.3 22 12 22 12s-1-2-2.9-3.9" />
    </svg>
  );
}

function IconCopy({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconTrash({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}

function App() {
  const [isNewVault, setIsNewVault] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [encryptionKey, setEncryptionKey] = useState(null);

  const [entries, setEntries] = useState([]);
  const [siteName, setSiteName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState(new Set());
  const [copiedFeedback, setCopiedFeedback] = useState(null);

  useEffect(() => {
    setIsNewVault(!vaultExists());
  }, []);

  useEffect(() => {
    if (!encryptionKey || !unlocked) return;

    async function persist() {
      const encryptedEntries = [];
      for (const entry of entries) {
        const encUsername = await encryptText(entry.username, encryptionKey);
        const encPassword = await encryptText(entry.password, encryptionKey);
        encryptedEntries.push({
          id: entry.id,
          site: entry.site,
          username: encUsername,
          password: encPassword,
        });
      }

      const existingVault = loadVaultRaw();
      saveVaultRaw({ salt: existingVault.salt, entries: encryptedEntries });
    }

    persist();
  }, [entries, encryptionKey, unlocked]);

  async function handleCreateVault() {
    if (masterPasswordInput.length < 6) {
      setErrorMessage('Master password must be at least 6 characters');
      return;
    }
    if (masterPasswordInput !== confirmPasswordInput) {
      setErrorMessage('Passwords do not match');
      return;
    }

    const salt = generateSalt();
    const key = await deriveKeyFromPassword(masterPasswordInput, salt);

    saveVaultRaw({ salt: bytesToBase64(salt), entries: [] });

    setEncryptionKey(key);
    setEntries([]);
    setUnlocked(true);
    setErrorMessage('');
    setMasterPasswordInput('');
    setConfirmPasswordInput('');
  }

  async function handleUnlock() {
    const vault = loadVaultRaw();
    const salt = base64ToBytes(vault.salt);
    const key = await deriveKeyFromPassword(masterPasswordInput, salt);

    try {
      const decryptedEntries = [];
      for (const entry of vault.entries) {
        const decUsername = await decryptText(entry.username.cipherText, entry.username.iv, key);
        const decPassword = await decryptText(entry.password.cipherText, entry.password.iv, key);
        decryptedEntries.push({
          id: entry.id,
          site: entry.site,
          username: decUsername,
          password: decPassword,
        });
      }

      setEntries(decryptedEntries);
      setEncryptionKey(key);
      setUnlocked(true);
      setErrorMessage('');
      setMasterPasswordInput('');
    } catch (err) {
      setErrorMessage('Incorrect master password. Try again.');
    }
  }

  function handleRelock() {
    setUnlocked(false);
    setEncryptionKey(null);
    setEntries([]);
    setMasterPasswordInput('');
    setVisiblePasswordIds(new Set());
  }

  function addEntry() {
    if (!siteName || !username || !password) {
      alert('Please fill in all fields');
      return;
    }

    const newEntry = {
      id: Date.now(),
      site: siteName,
      username: username,
      password: password,
    };

    setEntries([...entries, newEntry]);

    setSiteName('');
    setUsername('');
    setPassword('');
    setShowNewPassword(false);
  }

  function deleteEntry(idToDelete) {
    setEntries(entries.filter((entry) => entry.id !== idToDelete));
  }

  function toggleEntryPasswordVisibility(entryId) {
    const updated = new Set(visiblePasswordIds);
    if (updated.has(entryId)) {
      updated.delete(entryId);
    } else {
      updated.add(entryId);
    }
    setVisiblePasswordIds(updated);
  }

  async function copyToClipboard(text, feedbackLabel) {
    await navigator.clipboard.writeText(text);
    setCopiedFeedback(feedbackLabel);
    setTimeout(() => setCopiedFeedback(null), 1500);
  }

  if (isNewVault === null) {
    return <div className="app" />;
  }

  if (!unlocked) {
    return (
      <div className="app">
        <div className="vault-gate">
          <div className="vault-dial">
            <IconLock size={30} />
          </div>

          <h1>{isNewVault ? 'Set up your vault' : 'Welcome back'}</h1>
          <p className="subtitle">
            {isNewVault
              ? 'Choose a master password — this is the only key that unlocks everything below.'
              : 'Enter your master password to unlock your saved credentials.'}
          </p>

          <div className="gate-form">
            <input
              type="password"
              placeholder="Master password"
              value={masterPasswordInput}
              onChange={(e) => setMasterPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isNewVault && handleUnlock()}
              autoFocus
            />

            {isNewVault && (
              <input
                type="password"
                placeholder="Confirm master password"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateVault()}
              />
            )}

            {errorMessage && <p className="error-text">{errorMessage}</p>}

            <button className="btn-primary" onClick={isNewVault ? handleCreateVault : handleUnlock}>
              {isNewVault ? 'Create vault' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="vault-header">
        <div className="brand">
          <IconLock size={20} />
          <h1>Vault</h1>
        </div>
        <button className="lock-btn" onClick={handleRelock}>
          <IconLock size={13} /> Lock
        </button>
      </div>

      <div className="add-panel">
        <p className="add-panel-label">Add a credential</p>
        <div className="add-form">
          <input
            type="text"
            placeholder="Site (e.g. Gmail)"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <div className="password-input-wrapper">
            <input
              type={showNewPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="icon-toggle-btn"
              onClick={() => setShowNewPassword(!showNewPassword)}
              aria-label={showNewPassword ? 'Hide password' : 'Show password'}
            >
              {showNewPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>

          <button className="btn-primary" onClick={addEntry}>
            Add entry
          </button>
        </div>
      </div>

      <p className="section-label">Saved credentials — {entries.length}</p>

      {entries.length === 0 && (
        <p className="empty-message">Your vault is empty. Add your first credential above.</p>
      )}

      {entries.map((entry) => (
        <div className="entry-card" key={entry.id}>
          <div className="entry-top">
            <span className="entry-site">{entry.site}</span>
            <button className="delete-btn" onClick={() => deleteEntry(entry.id)} aria-label="Delete entry">
              <IconTrash />
            </button>
          </div>

          <div className="entry-field">
            <span className="field-label">User</span>
            <span className="value">{entry.username}</span>
            <button
              className={`icon-btn ${copiedFeedback === `${entry.id}-user` ? 'copied' : ''}`}
              onClick={() => copyToClipboard(entry.username, `${entry.id}-user`)}
              aria-label="Copy username"
            >
              <IconCopy />
            </button>
          </div>

          <div className="entry-field">
            <span className="field-label">Pass</span>
            <span className="value">
              {visiblePasswordIds.has(entry.id) ? entry.password : '••••••••••'}
            </span>
            <button
              className="icon-btn"
              onClick={() => toggleEntryPasswordVisibility(entry.id)}
              aria-label={visiblePasswordIds.has(entry.id) ? 'Hide password' : 'Show password'}
            >
              {visiblePasswordIds.has(entry.id) ? <IconEyeOff /> : <IconEye />}
            </button>
            <button
              className={`icon-btn ${copiedFeedback === `${entry.id}-pass` ? 'copied' : ''}`}
              onClick={() => copyToClipboard(entry.password, `${entry.id}-pass`)}
              aria-label="Copy password"
            >
              <IconCopy />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;
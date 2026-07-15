import { useState, useEffect } from 'react';
import './App.css';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import {
  generateSalt,
  deriveKeyFromPassword,
  encryptText,
  decryptText,
  bytesToBase64,
  base64ToBytes,
  generateRandomKeyBytes,
  importRawAesKey,
} from './crypto.js';
import { vaultExists, loadVaultRaw, saveVaultRaw, isBiometricEnabled, setBiometricEnabled } from './storage.js';

const BIOMETRIC_SERVER = 'password-manager-vault';
const MIN_ANSWER_LENGTH = 10;

const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  'What was your childhood nickname?',
  'What is the name of your favorite teacher?',
  'What was the make of your first car?',
  'Other (write your own)',
];
const CUSTOM_QUESTION_LABEL = 'Other (write your own)';

function normalizeAnswer(raw) {
  return raw.trim().toLowerCase();
}

// Small inline icons — no external icon library needed
function IconLock({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function IconFingerprint({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2a7 7 0 0 0-7 7c0 2 0 4-1 7M12 2a7 7 0 0 1 7 7c0 3 .5 6 1.5 8M8 20c1-2 1.5-4 1.5-6a2.5 2.5 0 0 1 5 0c0 1.5.2 3 1 5M12 9a4 4 0 0 0-4 4c0 2.5-.3 4.5-1 6.5M12 9a4 4 0 0 1 4 4c0 1 .1 2.5.5 4" />
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

  // --- Security question (set up during vault creation) ---
  const [setupStep, setSetupStep] = useState('password');
  const [selectedQuestion, setSelectedQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [customQuestionInput, setCustomQuestionInput] = useState('');
  const [securityAnswerInput, setSecurityAnswerInput] = useState('');
  const [confirmAnswerInput, setConfirmAnswerInput] = useState('');

  // --- Forgot password recovery flow ---
  const [authView, setAuthView] = useState('unlock'); // 'unlock' | 'recover-answer' | 'recover-newpass'
  const [recoverAnswerInput, setRecoverAnswerInput] = useState('');
  const [recoveredMek, setRecoveredMek] = useState(null);
  const [recoveredEntries, setRecoveredEntries] = useState([]);
  const [newMasterPasswordInput, setNewMasterPasswordInput] = useState('');
  const [newConfirmPasswordInput, setNewConfirmPasswordInput] = useState('');

  // --- Biometric state ---
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabledState, setBiometricEnabledState] = useState(false);
  const [showBiometricOptIn, setShowBiometricOptIn] = useState(false);
  const [pendingPasswordForBiometric, setPendingPasswordForBiometric] = useState('');
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    setIsNewVault(!vaultExists());
    setBiometricEnabledState(isBiometricEnabled());

    async function checkBiometric() {
      try {
        const result = await NativeBiometric.isAvailable();
        setBiometricAvailable(!!result.isAvailable);
      } catch {
        setBiometricAvailable(false);
      }
    }
    checkBiometric();
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
      saveVaultRaw({ ...existingVault, entries: encryptedEntries });
    }

    persist();
  }, [entries, encryptionKey, unlocked]);

  async function decryptAllEntries(encryptedEntries, key) {
    const decrypted = [];
    for (const entry of encryptedEntries) {
      const decUsername = await decryptText(entry.username.cipherText, entry.username.iv, key);
      const decPassword = await decryptText(entry.password.cipherText, entry.password.iv, key);
      decrypted.push({ id: entry.id, site: entry.site, username: decUsername, password: decPassword });
    }
    return decrypted;
  }

  function maybeOfferBiometricOptIn(masterPasswordUsed) {
    if (biometricAvailable && !isBiometricEnabled()) {
      setPendingPasswordForBiometric(masterPasswordUsed);
      setShowBiometricOptIn(true);
    }
  }

  function handleContinueToSecurityQuestion() {
    if (masterPasswordInput.length < 6) {
      setErrorMessage('Master password must be at least 6 characters');
      return;
    }
    if (masterPasswordInput !== confirmPasswordInput) {
      setErrorMessage('Passwords do not match');
      return;
    }
    setErrorMessage('');
    setSetupStep('question');
  }

  function handleBackToPasswordStep() {
    setErrorMessage('');
    setSetupStep('password');
  }

  async function handleCreateVault() {
    const finalQuestion =
      selectedQuestion === CUSTOM_QUESTION_LABEL ? customQuestionInput.trim() : selectedQuestion;
    if (!finalQuestion) {
      setErrorMessage('Please choose or write a security question');
      return;
    }

    const normalizedAnswer = normalizeAnswer(securityAnswerInput);
    if (normalizedAnswer.length < MIN_ANSWER_LENGTH) {
      setErrorMessage(`Answer must be at least ${MIN_ANSWER_LENGTH} characters — a made-up phrase works well`);
      return;
    }
    if (normalizedAnswer !== normalizeAnswer(confirmAnswerInput)) {
      setErrorMessage('Security answers do not match');
      return;
    }

    const saltPassword = generateSalt();
    const saltAnswer = generateSalt();
    const passwordKey = await deriveKeyFromPassword(masterPasswordInput, saltPassword);
    const answerKey = await deriveKeyFromPassword(normalizedAnswer, saltAnswer);

    const mekBytes = generateRandomKeyBytes();
    const mekBase64 = bytesToBase64(mekBytes);

    const wrappedKeyPassword = await encryptText(mekBase64, passwordKey);
    const wrappedKeyAnswer = await encryptText(mekBase64, answerKey);

    const mek = await importRawAesKey(mekBytes);

    saveVaultRaw({
      saltPassword: bytesToBase64(saltPassword),
      saltAnswer: bytesToBase64(saltAnswer),
      securityQuestion: finalQuestion,
      wrappedKeyPassword,
      wrappedKeyAnswer,
      entries: [],
    });

    const usedPassword = masterPasswordInput;

    setEncryptionKey(mek);
    setEntries([]);
    setUnlocked(true);
    setErrorMessage('');
    setMasterPasswordInput('');
    setConfirmPasswordInput('');
    setSecurityAnswerInput('');
    setConfirmAnswerInput('');
    setSetupStep('password');

    maybeOfferBiometricOptIn(usedPassword);
  }

  async function handleUnlock() {
    const vault = loadVaultRaw();
    try {
      const saltPassword = base64ToBytes(vault.saltPassword);
      const passwordKey = await deriveKeyFromPassword(masterPasswordInput, saltPassword);
      const mekBase64 = await decryptText(
        vault.wrappedKeyPassword.cipherText,
        vault.wrappedKeyPassword.iv,
        passwordKey
      );
      const mek = await importRawAesKey(base64ToBytes(mekBase64));

      const decryptedEntries = await decryptAllEntries(vault.entries, mek);
      const usedPassword = masterPasswordInput;

      setEntries(decryptedEntries);
      setEncryptionKey(mek);
      setUnlocked(true);
      setErrorMessage('');
      setMasterPasswordInput('');

      maybeOfferBiometricOptIn(usedPassword);
    } catch (err) {
      setErrorMessage('Incorrect master password. Try again.');
    }
  }

  async function handleBiometricUnlock() {
    setBiometricBusy(true);
    setErrorMessage('');
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Unlock your vault',
        title: 'Unlock Vault',
        subtitle: 'Confirm your fingerprint to continue',
      });

      const credentials = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER });

      const vault = loadVaultRaw();
      const saltPassword = base64ToBytes(vault.saltPassword);
      const passwordKey = await deriveKeyFromPassword(credentials.password, saltPassword);
      const mekBase64 = await decryptText(
        vault.wrappedKeyPassword.cipherText,
        vault.wrappedKeyPassword.iv,
        passwordKey
      );
      const mek = await importRawAesKey(base64ToBytes(mekBase64));

      const decryptedEntries = await decryptAllEntries(vault.entries, mek);

      setEntries(decryptedEntries);
      setEncryptionKey(mek);
      setUnlocked(true);
    } catch (err) {
      setErrorMessage('Fingerprint unlock failed. Use your master password instead.');
    } finally {
      setBiometricBusy(false);
    }
  }

  async function handleEnableBiometric() {
    setBiometricBusy(true);
    try {
      await NativeBiometric.setCredentials({
        username: 'vault-master',
        password: pendingPasswordForBiometric,
        server: BIOMETRIC_SERVER,
      });
      setBiometricEnabled(true);
      setBiometricEnabledState(true);
    } catch (err) {
      setErrorMessage('Could not enable fingerprint unlock on this device.');
    } finally {
      setPendingPasswordForBiometric('');
      setShowBiometricOptIn(false);
      setBiometricBusy(false);
    }
  }

  function handleSkipBiometric() {
    setPendingPasswordForBiometric('');
    setShowBiometricOptIn(false);
  }

  async function handleDisableBiometric() {
    try {
      await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
    } catch {
      // ignore — nothing stored, or already cleared
    }
    setBiometricEnabled(false);
    setBiometricEnabledState(false);
  }

  function startForgotPassword() {
    setErrorMessage('');
    setRecoverAnswerInput('');
    setAuthView('recover-answer');
  }

  function cancelForgotPassword() {
    setErrorMessage('');
    setRecoverAnswerInput('');
    setAuthView('unlock');
  }

  async function handleVerifySecurityAnswer() {
    const vault = loadVaultRaw();
    try {
      const saltAnswer = base64ToBytes(vault.saltAnswer);
      const normalizedAnswer = normalizeAnswer(recoverAnswerInput);
      const answerKey = await deriveKeyFromPassword(normalizedAnswer, saltAnswer);
      const mekBase64 = await decryptText(
        vault.wrappedKeyAnswer.cipherText,
        vault.wrappedKeyAnswer.iv,
        answerKey
      );
      const mek = await importRawAesKey(base64ToBytes(mekBase64));

      const decryptedEntries = await decryptAllEntries(vault.entries, mek);

      setRecoveredMek(mek);
      setRecoveredEntries(decryptedEntries);
      setErrorMessage('');
      setRecoverAnswerInput('');
      setAuthView('recover-newpass');
    } catch (err) {
      setErrorMessage("That answer doesn't match. Try again.");
    }
  }

  async function handleSetNewPassword() {
    if (newMasterPasswordInput.length < 6) {
      setErrorMessage('New password must be at least 6 characters');
      return;
    }
    if (newMasterPasswordInput !== newConfirmPasswordInput) {
      setErrorMessage('Passwords do not match');
      return;
    }

    const vault = loadVaultRaw();
    const mekRawBuffer = await crypto.subtle.exportKey('raw', recoveredMek);
    const mekBase64 = bytesToBase64(new Uint8Array(mekRawBuffer));

    const newSaltPassword = generateSalt();
    const newPasswordKey = await deriveKeyFromPassword(newMasterPasswordInput, newSaltPassword);
    const newWrappedKeyPassword = await encryptText(mekBase64, newPasswordKey);

    saveVaultRaw({
      ...vault,
      saltPassword: bytesToBase64(newSaltPassword),
      wrappedKeyPassword: newWrappedKeyPassword,
    });

    // Any fingerprint credential was tied to the old password — clear it for safety
    if (isBiometricEnabled()) {
      try {
        await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
      } catch {
        // ignore
      }
      setBiometricEnabled(false);
      setBiometricEnabledState(false);
    }

    const usedPassword = newMasterPasswordInput;

    setEntries(recoveredEntries);
    setEncryptionKey(recoveredMek);
    setUnlocked(true);
    setAuthView('unlock');
    setNewMasterPasswordInput('');
    setNewConfirmPasswordInput('');
    setRecoveredMek(null);
    setRecoveredEntries([]);
    setErrorMessage('');

    maybeOfferBiometricOptIn(usedPassword);
  }

  function handleRelock() {
    setUnlocked(false);
    setEncryptionKey(null);
    setEntries([]);
    setMasterPasswordInput('');
    setVisiblePasswordIds(new Set());
    setAuthView('unlock');
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

  const currentVault = !isNewVault ? loadVaultRaw() : null;

  // --- Biometric opt-in screen (shown once, right after unlock/create) ---
  if (unlocked && showBiometricOptIn) {
    return (
      <div className="app">
        <div className="vault-gate">
          <div className="vault-dial">
            <IconFingerprint size={30} />
          </div>

          <h1>Enable fingerprint unlock?</h1>
          <p className="subtitle">
            Next time, unlock your vault with your fingerprint instead of typing your master password.
            Your master password still protects everything — fingerprint just gives you a faster way in on this device.
          </p>

          {errorMessage && <p className="error-text">{errorMessage}</p>}

          <div className="gate-form">
            <button className="btn-primary" onClick={handleEnableBiometric} disabled={biometricBusy}>
              {biometricBusy ? 'Setting up…' : 'Enable fingerprint unlock'}
            </button>
            <button className="lock-btn" onClick={handleSkipBiometric} disabled={biometricBusy}>
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="app">
        <div className="vault-gate">
          <div className="vault-dial">
            <IconLock size={30} />
          </div>

          {isNewVault && setupStep === 'password' && (
            <>
              <h1>Set up your vault</h1>
              <p className="subtitle">
                Choose a master password — this is the main key that unlocks everything below.
              </p>

              <div className="gate-form">
                <input
                  type="password"
                  placeholder="Master password"
                  value={masterPasswordInput}
                  onChange={(e) => setMasterPasswordInput(e.target.value)}
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Confirm master password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleContinueToSecurityQuestion()}
                />

                {errorMessage && <p className="error-text">{errorMessage}</p>}

                <button className="btn-primary" onClick={handleContinueToSecurityQuestion}>
                  Continue
                </button>
              </div>
            </>
          )}

          {isNewVault && setupStep === 'question' && (
            <>
              <h1>Set a security question</h1>
              <p className="subtitle">
                This is your backup way in — if you ever forget your master password, answering this correctly unlocks your vault instead.
              </p>

              <div className="gate-form">
                <p className="field-note">Security question</p>
                <select value={selectedQuestion} onChange={(e) => setSelectedQuestion(e.target.value)}>
                  {SECURITY_QUESTIONS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>

                {selectedQuestion === CUSTOM_QUESTION_LABEL && (
                  <input
                    type="text"
                    placeholder="Write your own question"
                    value={customQuestionInput}
                    onChange={(e) => setCustomQuestionInput(e.target.value)}
                  />
                )}

                <p className="field-note">Your answer</p>
                <input
                  type="text"
                  placeholder={`At least ${MIN_ANSWER_LENGTH} characters`}
                  value={securityAnswerInput}
                  onChange={(e) => setSecurityAnswerInput(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Confirm your answer"
                  value={confirmAnswerInput}
                  onChange={(e) => setConfirmAnswerInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateVault()}
                />

                {errorMessage && <p className="error-text">{errorMessage}</p>}

                <button className="btn-primary" onClick={handleCreateVault}>
                  Create vault
                </button>
                <button className="link-btn" onClick={handleBackToPasswordStep}>
                  Back
                </button>
              </div>
            </>
          )}

          {!isNewVault && authView === 'unlock' && (
            <>
              <h1>Welcome back</h1>
              <p className="subtitle">Enter your master password to unlock your saved credentials.</p>

              <div className="gate-form">
                {biometricAvailable && biometricEnabledState && (
                  <button
                    className="btn-primary"
                    onClick={handleBiometricUnlock}
                    disabled={biometricBusy}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <IconFingerprint size={16} />
                    {biometricBusy ? 'Verifying…' : 'Unlock with fingerprint'}
                  </button>
                )}

                <input
                  type="password"
                  placeholder="Master password"
                  value={masterPasswordInput}
                  onChange={(e) => setMasterPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  autoFocus
                />

                {errorMessage && <p className="error-text">{errorMessage}</p>}

                <button className="btn-primary" onClick={handleUnlock}>
                  Unlock
                </button>
                <button className="link-btn" onClick={startForgotPassword}>
                  Forgot password?
                </button>
              </div>
            </>
          )}

          {!isNewVault && authView === 'recover-answer' && (
            <>
              <h1>Answer your security question</h1>
              <p className="subtitle">{currentVault?.securityQuestion}</p>

              <div className="gate-form">
                <input
                  type="text"
                  placeholder="Your answer"
                  value={recoverAnswerInput}
                  onChange={(e) => setRecoverAnswerInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifySecurityAnswer()}
                  autoFocus
                />

                {errorMessage && <p className="error-text">{errorMessage}</p>}

                <button className="btn-primary" onClick={handleVerifySecurityAnswer}>
                  Verify answer
                </button>
                <button className="link-btn" onClick={cancelForgotPassword}>
                  Back to password
                </button>
              </div>
            </>
          )}

          {!isNewVault && authView === 'recover-newpass' && (
            <>
              <h1>Set a new master password</h1>
              <p className="subtitle">Your vault is unlocked. Choose a new master password to finish.</p>

              <div className="gate-form">
                <input
                  type="password"
                  placeholder="New master password"
                  value={newMasterPasswordInput}
                  onChange={(e) => setNewMasterPasswordInput(e.target.value)}
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={newConfirmPasswordInput}
                  onChange={(e) => setNewConfirmPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetNewPassword()}
                />

                {errorMessage && <p className="error-text">{errorMessage}</p>}

                <button className="btn-primary" onClick={handleSetNewPassword}>
                  Save new password
                </button>
              </div>
            </>
          )}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {biometricAvailable && biometricEnabledState && (
            <button className="lock-btn" onClick={handleDisableBiometric} title="Turn off fingerprint unlock">
              <IconFingerprint size={13} /> Disable
            </button>
          )}
          <button className="lock-btn" onClick={handleRelock}>
            <IconLock size={13} /> Lock
          </button>
        </div>
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
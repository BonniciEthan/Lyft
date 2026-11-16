import { useCallback, useEffect, useRef, useState } from 'react';
import { createSeedState } from './seed.js';
import { loadLocal, looksLikeState, normalizeState, saveLocal } from './lib/storage.js';
import { pullState, pushState } from './lib/api.js';
import { TopBar } from './components/TopBar.jsx';
import { NavDock } from './components/NavDock.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { ConfirmDialog } from './components/Modal.jsx';
import { Toasts } from './components/Toasts.jsx';
import { ProgressTab } from './components/ProgressTab.jsx';
import { SplitTab } from './components/SplitTab.jsx';
import { RankTab } from './components/RankTab.jsx';
import { FoodTab } from './components/FoodTab.jsx';
import { IS_LOCAL } from './edition.js';
import { BackupModal } from './components/BackupModal.jsx';
import { ProfileButton } from './components/Avatar.jsx';
import { ProfilePage } from './components/ProfilePage.jsx';
import { mergeCache } from './lib/openFoodFactsService.js';
import { InstallSheet, shouldShowInstallHint } from './components/InstallSheet.jsx';
import { ReminderPrompt, shouldAskReminder } from './components/ReminderControls.jsx';
import { resumeReminder } from './lib/reminders.js';

const clone = typeof structuredClone === 'function' ? structuredClone : (v) => JSON.parse(JSON.stringify(v));

export default function App() {
  const [store, setStore] = useState(() => loadLocal() || { state: createSeedState(), hasUnsavedChanges: false });
  const { state, hasUnsavedChanges } = store;
  const storeRef = useRef(store);
  storeRef.current = store;

  const [tab, setTab] = useState('progress');
  const [profileOpen, setProfileOpen] = useState(false);
  const tabScroll = useRef(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const confirmResolver = useRef(null);
  const [installOpen, setInstallOpen] = useState(shouldShowInstallHint);
  const [reminderAskOpen, setReminderAskOpen] = useState(false);

  // Daily 9pm reminder: keep an enabled one scheduled, and ask once where it can work
  // (never on top of the "add to Home Screen" sheet).
  useEffect(() => {
    resumeReminder();
    if (installOpen || !shouldAskReminder()) return undefined;
    const t = setTimeout(() => setReminderAskOpen(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local-first persistence: every state change lands in localStorage immediately.
  useEffect(() => {
    saveLocal(store.state, store.hasUnsavedChanges);
  }, [store]);

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /** `action` = { label, run } adds a button (e.g. Undo) and keeps the toast up longer. */
  const toast = useCallback((message, type = 'success', action = null) => {
    const id = `${Date.now()}-${Math.random()}`;
    const life = action ? 6000 : 2200;
    setToasts((t) => [...t.slice(-2), { id, message, type, action }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), life);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), life + 400);
  }, []);

  /**
   * Apply a mutation to a cloned draft of state and mark it dirty.
   * Pass `{ undo: 'Set removed' }` to show a toast with an Undo button. Undo puts back
   * the state from just before the change, as long as nothing else has changed since.
   */
  const update = useCallback(
    (mutate, opts) => {
      const before = storeRef.current.state;
      const draft = clone(before);
      mutate(draft);
      setStore((prev) => {
        if (prev.state === before) return { state: draft, hasUnsavedChanges: !IS_LOCAL };
        // Another update landed first: replay on top of it.
        const fresh = clone(prev.state);
        mutate(fresh);
        return { state: fresh, hasUnsavedChanges: !IS_LOCAL };
      });
      if (!opts?.undo) return;
      toast(opts.undo, 'success', {
        label: 'Undo',
        run: () => {
          if (storeRef.current.state !== draft) {
            toast("Can't undo: something else changed since", 'error');
            return;
          }
          setStore({ state: before, hasUnsavedChanges: !IS_LOCAL });
        },
      });
    },
    [toast]
  );

  const askConfirm = useCallback(
    (request) =>
      new Promise((resolve) => {
        confirmResolver.current = resolve;
        setConfirmRequest(request);
      }),
    []
  );

  const resolveConfirm = (value) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmRequest(null);
    resolve?.(value);
  };

  const handleSave = async () => {
    if (saving || loading) return;
    // Blur any focused inline input so its pending value commits before we snapshot.
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    await new Promise((r) => setTimeout(r, 0));

    setSaving(true);
    const snapshot = storeRef.current.state;

    try {
      const res = await pushState(snapshot);
      if (!res.success) throw new Error(res.error || 'Save failed');
      setStore((prev) => ({
        state: { ...prev.state, lastSynced: res.lastSynced },
        // If something changed while the request was in flight, keep it marked dirty.
        hasUnsavedChanges: prev.state !== snapshot,
      }));
      toast('Saved to server');
    } catch (err) {
      toast(`Save failed — ${err.message}. Local changes kept.`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doLoad = async () => {
    setLoading(true);
    try {
      const data = await pullState();
      if (!looksLikeState(data)) throw new Error('Server returned invalid data');
      setStore({ state: normalizeState(data), hasUnsavedChanges: false });
      toast('Loaded from server');
    } catch (err) {
      toast(`Load failed — ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async () => {
    if (saving || loading) return;
    if (hasUnsavedChanges) {
      const ok = await askConfirm({
        title: 'Load from server?',
        message: 'Unsaved local changes will be overwritten. Continue?',
        confirmLabel: 'Overwrite',
        destructive: true,
      });
      if (!ok) return;
    }
    doLoad();
  };

  // The Profile page sits on top of the tabs. It pushes a history entry so the browser /
  // Android back button closes it too, and the tab underneath keeps its scroll position.
  const openProfile = () => {
    if (profileOpen) return;
    tabScroll.current = window.scrollY;
    try {
      window.history.pushState({ lyftProfile: true }, '');
    } catch {
      /* history unavailable: the Back button still works */
    }
    setProfileOpen(true);
  };

  const closeProfile = useCallback(() => {
    setProfileOpen(false);
    requestAnimationFrame(() => window.scrollTo(0, tabScroll.current));
  }, []);

  const leaveProfile = (nextTab) => {
    if (nextTab) {
      setTab(nextTab);
      tabScroll.current = 0;
    }
    if (window.history.state?.lyftProfile) window.history.back();
    else closeProfile();
  };

  useEffect(() => {
    if (!profileOpen) return undefined;
    const onPop = () => closeProfile();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [profileOpen, closeProfile]);

  const handleImport = ({ state: imported, barcodeCache }) => {
    setStore({ state: imported, hasUnsavedChanges: !IS_LOCAL });
    mergeCache(barcodeCache);
    toast('Backup restored');
  };

  return (
    <div className="app">
      <div className="ambient" aria-hidden>
        <span className="orb orb-indigo" />
        <span className="orb orb-ocean" />
        <span className="orb orb-slate" />
      </div>

      {profileOpen ? (
        <ProfilePage
          state={state}
          update={update}
          toast={toast}
          onBack={() => leaveProfile()}
          onGoToRank={() => leaveProfile('rank')}
          onOpenBackup={() => setBackupOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onShowInstall={() => setInstallOpen(true)}
        />
      ) : (
        <>
          {IS_LOCAL ? (
            <header className="topbar topbar-local">
              <div className="topbar-inner">
                <span className="topbar-spacer" aria-hidden />
                <span className="app-title">Lyft</span>
                <ProfileButton profile={state.profile} onClick={openProfile} />
              </div>
            </header>
          ) : (
            <TopBar
              lastSynced={state.lastSynced}
              hasUnsavedChanges={hasUnsavedChanges}
              saving={saving}
              loading={loading}
              onSave={handleSave}
              onLoad={handleLoad}
              profile={state.profile}
              onOpenProfile={openProfile}
            />
          )}

          <main className="content">
            {tab === 'split' && <SplitTab state={state} update={update} askConfirm={askConfirm} toast={toast} />}
            {tab === 'progress' && <ProgressTab state={state} update={update} askConfirm={askConfirm} onNavigate={setTab} toast={toast} />}
            {tab === 'food' && <FoodTab state={state} update={update} askConfirm={askConfirm} toast={toast} />}
            {tab === 'rank' && <RankTab state={state} update={update} />}
          </main>

          <NavDock active={tab} onChange={setTab} />
        </>
      )}

      {!IS_LOCAL && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => toast('Server URL saved')}
        />
      )}
      <BackupModal
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        state={state}
        onImport={handleImport}
        askConfirm={askConfirm}
        toast={toast}
      />
      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
      <ReminderPrompt open={reminderAskOpen} onClose={() => setReminderAskOpen(false)} toast={toast} />
      <ConfirmDialog request={confirmRequest} onResolve={resolveConfirm} />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

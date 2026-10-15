import { useEffect, useState } from 'react';
import type { AuthState, CodeSession, OnboardingState } from '@xeref-code/shared-types';
import { onHostMessage, postToHost } from '../lib/vscodeApi';
import { useAccount } from '../lib/useAccount';
import { AccountSection } from '../components/AccountSection';
import { LearnCard, WhatsNewCard } from '../components/OnboardingCards';
import { SessionList } from '../components/SessionList';

/**
 * "Account & Sessions" surface (Ctrl+E): account and usage summary with its details popup, the
 * Learn checklist, and the session list. No chat stream here; the chat lives in the Agent Panel.
 * It only renders state pushed by the host and sends back intents, never touching the network
 * or the token.
 */
export function App() {
  const [auth, setAuth] = useState<AuthState>();
  const [onboarding, setOnboarding] = useState<OnboardingState>();
  const [sessions, setSessions] = useState<CodeSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { state: account, refresh } = useAccount();

  useEffect(() => {
    const off = onHostMessage((message) => {
      switch (message.type) {
        case 'auth.state':
          setAuth(message.state);
          return;
        case 'onboarding.state':
          setOnboarding(message.state);
          return;
        case 'sessions.list':
          setSessions(message.sessions);
          setActiveId(message.activeId);
          setSessionsLoading(message.loading);
          return;
        case 'account.open':
          setDetailsOpen(true);
          return;
        default:
          return;
      }
    });
    postToHost({ type: 'webview.ready' });
    return off;
  }, []);

  const connected = auth?.connected === true;

  return (
    <div className="x-manager">
      <AccountSection
        auth={auth}
        account={account}
        onRefresh={refresh}
        detailsOpen={detailsOpen}
        onDetailsOpenChange={setDetailsOpen}
      />
      {onboarding && <WhatsNewCard state={onboarding} />}
      {onboarding && <LearnCard state={onboarding} />}
      <SessionList sessions={sessions} activeId={activeId} loading={sessionsLoading} connected={connected} />
    </div>
  );
}

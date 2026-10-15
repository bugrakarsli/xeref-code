import { useState, type ReactNode } from 'react';
import type { AccountInfo, AuthState } from '@xeref-code/shared-types';
import { postToHost } from '../lib/vscodeApi';
import { PLAN_LABEL, formatCount, limitLabel, modelLabel } from '../lib/format';
import type { AccountState } from '../lib/useAccount';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
  auth: AuthState | undefined;
  account: AccountState;
  onRefresh: (force?: boolean) => void;
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="x-row">
      <span className="x-row-label">{label}</span>
      <span className="x-row-value">{children}</span>
    </div>
  );
}

/** Email with a soft break after the @ so long addresses wrap in a narrow sidebar. */
function Email({ value }: { value: string | null }) {
  if (!value) return <>Not available</>;
  const at = value.indexOf('@');
  if (at < 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, at + 1)}
      <wbr />
      {value.slice(at + 1)}
    </>
  );
}

function PlanBadge({ plan }: { plan: AccountInfo['plan'] }) {
  return <span className={`x-badge x-badge-${plan}`}>{PLAN_LABEL[plan]}</span>;
}

function openSite(path: string) {
  postToHost({ type: 'ui.openExternal', path });
}

/** Sidebar section: collapsible Account & usage summary with a "View details" popup. */
export function AccountSection({ auth, account, onRefresh, detailsOpen, onDetailsOpenChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const connected = auth?.connected === true;

  return (
    <section className="x-section" aria-label="Account and usage">
      <div className="x-section-header">
        <button
          className="x-section-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand account & usage' : 'Collapse account & usage'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} />
          <span className="x-section-label">Account &amp; usage</span>
        </button>
        {connected && (
          <button className="x-link" onClick={() => onDetailsOpenChange(true)} title="Account & Usage">
            View details
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="x-section-body">
          {!connected ? (
            <>
              <p className="x-muted">Connect your Xeref account to see your plan and activity.</p>
              <button className="x-btn x-btn-primary" onClick={() => postToHost({ type: 'command.run', id: 'xeref.signIn' })}>
                <Icon name="plug" /> Connect account
              </button>
            </>
          ) : account.account ? (
            <>
              <Row label="Email">
                <Email value={account.account.email} />
              </Row>
              <Row label="Plan">
                <PlanBadge plan={account.account.plan} />
              </Row>
              <Row label="Messages today">{formatCount(account.account.usage.today.messages)}</Row>
              <Row label="Last 7 days">{formatCount(account.account.usage.week.messages)}</Row>
            </>
          ) : account.error ? (
            <>
              <p className="x-error" role="alert">
                {account.error.message}
              </p>
              <button className="x-btn" onClick={() => onRefresh(true)}>
                <Icon name="refresh" /> Retry
              </button>
            </>
          ) : (
            <p className="x-muted" aria-live="polite">
              Loading account…
            </p>
          )}
        </div>
      )}

      {detailsOpen && connected && (
        <AccountDetails account={account} onRefresh={onRefresh} onClose={() => onDetailsOpenChange(false)} />
      )}
    </section>
  );
}

/** The "Account & Usage" popup. */
function AccountDetails({
  account,
  onRefresh,
  onClose,
}: {
  account: AccountState;
  onRefresh: (force?: boolean) => void;
  onClose: () => void;
}) {
  const info = account.account;

  return (
    <Modal
      title="Account & Usage"
      onClose={onClose}
      footer={
        <>
          <button className="x-btn" onClick={() => openSite(info?.links.manage ?? '/settings')}>
            Manage on xeref.ai
          </button>
          {info && info.plan !== 'ultra' && (
            <button className="x-btn x-btn-primary" onClick={() => openSite(info.links.upgrade)}>
              Upgrade
            </button>
          )}
        </>
      }
    >
      {!info ? (
        account.error ? (
          <>
            <p className="x-error" role="alert">
              {account.error.message}
            </p>
            <button className="x-btn" onClick={() => onRefresh(true)}>
              <Icon name="refresh" /> Retry
            </button>
          </>
        ) : (
          <p className="x-muted" aria-live="polite">
            Loading account…
          </p>
        )
      ) : (
        <>
          {!info.features.xeref_code && (
            <div className="x-notice" role="note">
              <Icon name="lock" />
              <span>Xeref Code chat is included in the Ultra plan. You are on {PLAN_LABEL[info.plan]}.</span>
            </div>
          )}

          <h3 className="x-h3">Account</h3>
          <Row label="Connection">Connected</Row>
          <Row label="Email">
            <Email value={info.email} />
          </Row>
          <Row label="Plan">
            <PlanBadge plan={info.plan} />
          </Row>

          <h3 className="x-h3">Usage</h3>
          <Row label="Messages today">{formatCount(info.usage.today.messages)}</Row>
          <Row label="Messages, 7 days">{formatCount(info.usage.week.messages)}</Row>
          <Row label="Sessions today">{formatCount(info.usage.today.sessions)}</Row>
          <Row label="Sessions, 7 days">{formatCount(info.usage.week.sessions)}</Row>
          <p className="x-muted x-small">Counts cover Xeref Code only. Xeref does not cap messages per day.</p>

          <h3 className="x-h3">Plan limits</h3>
          <Row label="Xeref Code">{info.features.xeref_code ? 'Included' : 'Not included'}</Row>
          <Row label="Deploy channels">{limitLabel(info.limits.deploy_channels)}</Row>
          <Row label="Scheduled jobs">{limitLabel(info.limits.scheduled_jobs)}</Row>
          <Row label="Dots">{limitLabel(info.limits.dots)}</Row>

          <h3 className="x-h3">Models</h3>
          <ul className="x-chip-list" aria-label="Models on your plan">
            {info.models.map((id) => (
              <li key={id} className="x-chip-static">
                {modelLabel(id)}
              </li>
            ))}
          </ul>
          {info.plan !== 'ultra' && <p className="x-muted x-small">More models are available on higher plans.</p>}

          <div className="x-dialog-actions">
            <button className="x-btn" onClick={() => onRefresh(true)} disabled={account.loading}>
              <Icon name="refresh" /> {account.loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="x-btn" onClick={() => postToHost({ type: 'command.run', id: 'xeref.signOut' })}>
              Disconnect
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

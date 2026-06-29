import type { AuthState } from '@xeref-code/shared-types';

interface Props {
  state: AuthState | undefined;
}

/** Shared connection indicator used by both AgentPanel and Agent Manager.
 * Reads auth state pushed from the host — never touches SecretStorage or
 * the network itself. */
export function ConnectionStatus({ state }: Props) {
  if (!state) {
    return <div className="xeref-status">Loading…</div>;
  }

  if (!state.connected) {
    return (
      <div className="xeref-status">
        <span>$(plug) Not connected to Xeref.</span>
      </div>
    );
  }

  return (
    <div className="xeref-status">
      <span>$(check) Connected{state.plan ? ` · ${state.plan} plan` : ''}</span>
    </div>
  );
}

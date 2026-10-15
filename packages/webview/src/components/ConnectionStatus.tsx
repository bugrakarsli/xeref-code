import type { AuthState } from '@xeref-code/shared-types';
import { PLAN_LABEL } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  state: AuthState | undefined;
}

/** Connection indicator. Reads auth state pushed from the host — never touches SecretStorage or
 * the network itself. Icons are inline SVG: `$(codicon)` syntax only renders in native VS Code UI. */
export function ConnectionStatus({ state }: Props) {
  if (!state) {
    return <div className="x-status">Loading…</div>;
  }

  if (!state.connected) {
    return (
      <div className="x-status">
        <Icon name="plug" size={12} />
        <span>Not connected to Xeref.</span>
      </div>
    );
  }

  return (
    <div className="x-status is-connected">
      <Icon name="check" size={12} />
      <span>Connected{state.plan ? ` · ${PLAN_LABEL[state.plan]}` : ''}</span>
    </div>
  );
}

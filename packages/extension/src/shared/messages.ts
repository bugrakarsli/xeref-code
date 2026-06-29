/**
 * Re-exports the host<->webview message contract from the single source of
 * truth (@xeref-code/shared-types) so extension-host code can import from a
 * local, relative-feeling path. Do not redefine these types here.
 */
export type {
  Role,
  MessagePart,
  ChatMessage,
  CodeSession,
  ModelId,
  DiffProposal,
  AuthState,
  HostToWebview,
  WebviewToHost,
} from '@xeref-code/shared-types';

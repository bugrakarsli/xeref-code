/**
 * Local agent runtime — spawned by the extension host (RuntimeBridge) as a
 * child process and driven over stdio with a small JSON-RPC framing.
 *
 * Scope discipline: this process touches the workspace filesystem and the
 * terminal ONLY. It never makes network calls — that split keeps "decide"
 * (Xeref backend, via the host) and "act" (this runtime) auditable and
 * independently testable. The host mediates everything.
 *
 * Phase 1: not wired up (RuntimeBridge.ts doesn't exist yet). Phase 3 adds:
 *   - tools/readFile.ts
 *   - tools/applyEdit.ts  (emits a DiffProposal; writes only after the host
 *                          confirms an explicit 'diff.accept')
 *   - tools/runCommand.ts (terminal handoff, gated like CommandApprovalCard)
 */
process.stdout.write(
  JSON.stringify({ type: 'runtime.ready', note: 'Phase 3 stub — no tools wired yet.' }) + '\n'
);

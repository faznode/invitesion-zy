# CI execution policy — 2026-11-07
> WHAT: Owner-requested switch to sandbox checks before transfer, with no GitHub workflow files.
> STATUS: Implemented; the five sandbox gate scripts retained.
> OWNER: Operator, under the owner's explicit instruction.
> DEPS: ../../09-masterplan/12-decision-log.md
> GREP: ADR-O13, sandbox, workflow removal, transfer
> UPDATED: 2026-11-07

- Removed the GitHub CI YAML and its empty workflow directory entirely, as explicitly requested by the owner.
- Updated LATEST, the upgrade-order execution rule and ADR-O13. Agents must not recreate GitHub workflows in later transfers.
- Validation is scoped to removal, documentation references and the commit guard. No product code or sandbox gate script behavior changed; full product suites are not repeated for workflow removal.
- Publication is restricted to v0/faznode-3b993736. Sandbox checks replace GitHub execution for subsequent deliverables and continuation prompts.

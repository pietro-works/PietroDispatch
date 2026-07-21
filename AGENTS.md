# AGENTS.md — pietro-dispatch

Agent-facing index for this repo. Product docs live in `MASTERPLAN.md`; per-module sequences in `.claude/skills/*/SKILL.md`; artifact specs in `prompts/`. This file holds the PACS registry: the load-bearing couplings where one edit forces a matching edit somewhere non-obvious and missing it fails silently.

## PACS Registry

| Code | Rule | Anchors | Failure if missed |
|------|------|---------|-------------------|
| PACS0001 | Every delivery type (news, slides, article, fluxogram) must be wired in all five places at once: its contract doc in `../pietro-enterprise/registry/contracts/`, `validate-contract.mjs` (classification + checks), Studio's `../pietro.works/gen/studio/tools/scan-assets.mjs` (a scan function), `pipeline/archive-to-dispatch-posts.mjs` (`detectType` + copy plan), and `../pietro-enterprise/registry/modules.json`. Tutorial exists only as a legacy `detectType` branch in `archive-to-dispatch-posts.mjs`; it is NOT wired in the other four places and must be fully wired before any tutorial delivery. Note: slides, article, and fluxogram folders share the `<DATE>-<slug>` name and are told apart by contents (`slides.pdf` for slides, `banner-1.png` for article, `fluxogram.png` for fluxogram); any new type reusing that name shape must extend the content sniff in BOTH validate-contract.mjs and detectType. | `pipeline/archive-to-dispatch-posts.mjs` `detectType` (tagged); `validate-contract.mjs` `main()` classifier (tagged); `scan-assets.mjs` `main()` scan dispatch (tagged); `modules.json` registry-only coverage (JSON, no comments) | Studio silently skips the delivery, or the validator misclassifies it and fails it against the wrong contract; nothing errors, the asset just never enters the queue |

Numbering: 0001-0099 code-enforced invariants (carry a `// PACS####` tag at the anchor), 0100+ process rules. Append-only; never reuse or renumber. Full protocol in the user-level standing instructions (PACS section).

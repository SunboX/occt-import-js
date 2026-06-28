# Repository Instructions

## Fix Quality Rules

- Fixes must always address the general behavior, not a specific example, fixture, file, project, or test case.
- Do not implement workarounds, cheats, allowlists, hard-coded example handling, or special-case logic to make one sample pass.
- When you encounter existing workaround code, cheating behavior, or example-specific handling, rewrite it into general-purpose behavior immediately when it is in scope for the change.
- Keep fixes universal and structural: derive behavior from the underlying data model, format, protocol, or UI contract instead of matching known sample text, filenames, labels, or project identifiers.
- After fixing code, run the appropriate repo-owned tests and do not modify tests just to make a workaround pass.

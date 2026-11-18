# Repository workflow

- Use `dev` as the working branch. Make new changes on `dev`.
- Treat `main` as the release branch. Merge or push release changes only when requested.
- The active React application is in `front-end/`; the Express API is in `back-end/`.
- Preserve unrelated local files, including `index.php` and backend helper scripts.
- Keep credentials in ignored environment files. Never commit hardcoded credentials.
- Verify backend changes with `npm run check` in `back-end/` and frontend changes with `npm run build` in `front-end/`.
- When shipping a user-visible feature, add a release note and bump `CURRENT_VERSION` in `front-end/src/data/whatsNew.ts`, then record it in `WHATS_NEW.md`.

<!-- fullstack-ai-engineering-kit:begin -->
Read .engineering-kit/references/workflow.md before starting a new project.
Use .engineering-kit/templates/project-initialization.md for discovery and planning.
Load only relevant skills; keep work proportional to project size and risk.
Apply adaptive effort by default: keep simple tasks concise and focused; deepen
investigation and verification for complexity, risk, uncertainty, or failures.
Preserve complete results and required checks; avoid repeated work. Report usage
or savings only with supporting measurements. See
.engineering-kit/skills/adaptive-effort/SKILL.md when more guidance is needed.
Before significant implementation, present requirements, architecture, security/QA
needs and a feature plan; wait for necessary decisions unless already delegated.
Preserve existing behavior and authorization. Record actual tests and evidence gaps.
Do not deploy or change live infrastructure without user authorization.
The .engineering-kit folder is reference material; use this project's own build
and test commands for product changes.
<!-- fullstack-ai-engineering-kit:end -->

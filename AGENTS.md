# Repository workflow

- Use `dev` as the working branch. Make new changes on `dev`.
- Treat `main` as the release branch. Merge or push release changes only when requested.
- The active React application is in `front-end/`; the Express API is in `back-end/`.
- Preserve unrelated local files, including `index.php` and backend helper scripts.
- Keep credentials in ignored environment files. Never commit hardcoded credentials.
- Verify backend changes with `npm run check` in `back-end/` and frontend changes with `npm run build` in `front-end/`.

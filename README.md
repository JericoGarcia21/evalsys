# EvalSys - IR Project Evaluation System

EvalSys is a multi-subject web-based rubric evaluation system for IT/IR project presentations. It supports Super Admin oversight, instructor-managed subjects, panel grading, structured group registration, proposal document uploads, and clean result exports.

## Key Features

- **Multi-role access**: Super Admin, Instructor, and Panel accounts.
- **Multi-subject management**: Instructors manage assigned subjects within paid subject limits.
- **Block and group management**: Create sections/blocks, register groups, and manage structured group members.
- **Structured member data**: New groups store members as last name, first name, and optional middle name. Old comma-separated/string member records remain supported.
- **Panel assignment isolation**: Panels belong to an instructor and can only be assigned within that instructor's subjects.
- **Instructor-owned rubrics**: Instructors create, edit, delete, and activate their own rubrics per subject.
- **Per-subject grading lock**: Instructors can lock grading for their own subject; Super Admin can control instructor locks.
- **Panel grading workflow**: Panels grade assigned groups, leave comments, and can view read-only mode when grading is locked.
- **Autosave and offline draft backup**: Panel scores/comments are saved locally before submission to reduce data loss.
- **Proposal upload**: Optional PDF/DOC/DOCX/PPT/PPTX proposal files are stored in Supabase Storage and opened through short-lived signed URLs.
- **Per-block exports**: Export group summary CSV or alphabetized member grades CSV for the selected block.
- **AI Insights page**: Summarizes completed group scores, strengths, weaknesses, highest group, and panel comments using local score/comment data.
- **System announcements**: Super Admin can show notices to instructors and panels.
- **Maintenance mode**: Super Admin can temporarily block instructor/panel access while updates are being applied.
- **Operations dashboard**: Audit logs, activity monitor, instructor summary, proposal storage cleanup view, and backup exports.
- **Archive support**: Submitted results are preserved when subjects are reset or when groups/blocks are deleted.
- **PWA support**: EvalSys can be installed on a device and shows an update notice when a new app build is available.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, React Router, Axios.
- **Backend**: Node.js, Express, Mongoose.
- **Database**: MongoDB Atlas.
- **File storage**: Supabase Storage private bucket.
- **Authentication**: JWT with role-based route protection.
- **Deployment target**: Vercel frontend and Render backend.

## Project Structure

```text
automated-rubrics/
+-- back-end/       Express API server
+-- front-end/      Vite React application
`-- README.md
```

## Backend Setup

1. Install dependencies:

   ```bash
   cd back-end
   npm install
   ```

2. Create `back-end/.env`:

   ```env
   PORT=5000
   FRONTEND_URL=http://localhost:5173
   # Optional: comma-separated extra allowed frontend origins
   # CORS_ORIGINS=https://your-vercel-app.vercel.app,https://your-custom-domain.com
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_long_random_secret

   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_backend_only_secret_key
   SUPABASE_PROPOSAL_BUCKET=evalsys-proposals
   SUPABASE_STORAGE_LIMIT_MB=1024
   DB_CACHE_TTL_MS=15000
   DB_CACHE_MAX_ENTRIES=250

   RENDER_API_KEY=optional_render_api_key
   RENDER_SERVICE_ID=optional_render_service_id
   ```

3. Start the backend:

   ```bash
   npm run dev
   ```

Set `FRONTEND_URL` to your deployed frontend origin, for example `https://your-app.vercel.app`. Add more allowed frontend origins in `CORS_ORIGINS` as a comma-separated list when needed.

`DB_CACHE_TTL_MS` controls short-lived backend response caching for repeated database reads. Set it to `0` to disable caching.

Important: never put `SUPABASE_SERVICE_ROLE_KEY` in the frontend or Vercel environment variables. It belongs only in the backend Render service.

## Frontend Setup

1. Install dependencies:

   ```bash
   cd front-end
   npm install
   ```

2. Optional local `.env`:

   ```env
   VITE_API_URL=http://localhost:5000/api
   ```

3. Start the frontend:

   ```bash
   npm run dev
   ```

4. Production build:

   ```bash
   npm run build
   ```

## Supabase Storage Setup

Create a private bucket:

```env
SUPABASE_PROPOSAL_BUCKET=evalsys-proposals
```

Recommended bucket settings:

- Public bucket: off
- File size limit: 10 MB
- Allowed MIME types:

```text
application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation
```

Allowed upload types:

- PDF
- DOC
- DOCX
- PPT
- PPTX

Proposal upload is optional. Groups without proposal files still work normally.

## Main Workflows

### Super Admin

- Manage instructor subject limits.
- Lock CSV export per instructor.
- Lock grading per instructor subject.
- Assign instructors to subjects.
- Manage resources and view storage usage.
- View audit logs and activity monitor.
- Export backups.
- Review archive/legacy data.
- Publish system announcements.
- Enable/disable maintenance mode.

### Instructor

- Manage assigned subjects.
- Create sections/blocks.
- Create and edit groups.
- Import groups and panel accounts by CSV.
- Assign panels to blocks.
- Create and activate subject rubrics.
- Manage registration links.
- View results and export CSV files.
- Reset a subject for a fresh evaluation cycle.

### Panel

- View assigned blocks and groups.
- Open uploaded proposal files when available.
- Grade using the active instructor rubric.
- Add comments.
- Update submitted grades when grading is open.
- Use read-only mode when grading is locked.
- Rely on local autosave if connection is interrupted.

## Result Preservation Rules

Submitted evaluations are treated as historical records.

- Deleting a panel account keeps submitted results.
- Deleting a group archives submitted results before removing the active group.
- Deleting a block archives submitted results before removing active groups.
- Resetting a subject archives submitted results before clearing active blocks/groups.
- Deleting a subject archives submitted results before removing the subject setup.

Archived results are available to Super Admin under Archive.

## CSV Exports

When an instructor selects a block in Results, EvalSys supports:

- **Download Group Summary CSV**
- **Download Member Grades CSV**

Member grades export one row per member and sort alphabetically by:

1. Last Name
2. First Name
3. Middle Name

If a group evaluation is incomplete, the exported score is:

```text
Pending Complete Evaluation
```

## Security Notes

- Login is rate-limited.
- Accounts are temporarily locked after repeated failed login attempts.
- New accounts and reset passwords require users to change their temporary password after signing in.
- Passwords require uppercase, lowercase, number, symbol, and at least 8 characters.
- Maintenance mode blocks instructor/panel actions while allowing Super Admin access.
- Proposal files are served through backend-generated signed URLs.
- Supabase service role key must remain backend-only.

## Free-tier Hosting Notes

Render free tier may sleep after inactivity. EvalSys keeps polling conservative to avoid consuming hours too quickly.

- Announcement and maintenance status checks run every 30 seconds while the app is open.
- Socket.IO is not used by default because persistent connections can keep Render awake longer.
- PWA users receive a "New changes detected" notice when a fresh app build is available.

## Useful Commands

Backend syntax check:

```bash
cd back-end
npm run check
```

Frontend production build:

```bash
cd front-end
npm run build
```

## Current Known Follow-ups

- Consider frontend code splitting if the production bundle grows much larger.

## License

MIT License.


## Returning to development

Use `dev` as your working branch; `main` is the release branch.

```powershell
git switch dev
git status --short
```

Start the API in one terminal:

```powershell
cd back-end
npm run dev
```

Start the React app in a second terminal from the repository root:

```powershell
cd front-end
npm run dev
```

Open http://localhost:5173. The API defaults to http://localhost:5000. Keep your backend configuration in `back-end/.env`, using `.env.example` as the reference. Run `npm ci` in each application folder when dependencies are missing or the lockfile changes.

Before committing, run `npm run check` in `back-end` and `npm run build` in `front-end`. The backend check validates syntax without starting the server or connecting to the database.

The unused `frontend/` implementation was removed; `front-end/` is the active React application. The empty root `index.php` and local backend helper scripts are preserved local files. They are not needed to start the React/Express application. Inspect them before staging; avoid `git add .` while unrelated files remain untracked.

## Repeatable QA

Use Node.js 20.19+ (Node 24 recommended). Backend development uses native Node watch mode. The backend starts listening only after MongoDB connects. Optional DNS_SERVERS overrides DNS; leave it unset to use system DNS.

Run in back-end: npm run check, npm test, npm audit --omit=dev. Run in front-end: npm run lint, npm run build, npm audit --omit=dev, npm run test:e2e. Install dependencies with npm ci in both folders first.

API tests and browser tests create temporary local MongoDB databases and synthetic accounts. They do not load your backend .env or use production records. The first run downloads a MongoDB test binary and needs network access. Browser tests start their own API on port 5101 and Vite on port 5179; both ports must be free. Local browser tests use installed Google Chrome. CI installs Playwright Chromium. Reports are generated in front-end/playwright-report.

See [QA_RESULTS.md](QA_RESULTS.md) for coverage, fixes, and remaining limits. GitHub Actions repeats the checks on dev/main pushes and pull requests once these changes are committed and pushed.

The superadmin global system reset is an exception to result preservation: it deliberately deletes active data and archived results after explicit confirmation. Export a backup first. Opening Archive is read-only; migrating old unowned records requires the explicit Archive Old Records action and ARCHIVE LEGACY confirmation.

### Interactive tutorials

Instructor and Panel users receive a guided-tour invitation on their first dashboard visit after completing any required temporary-password change. Students receive their guide when a valid instructor registration link loads. Use **Start tutorial** to replay. The walkthrough uses real controls, highlights and CSS animations; it never submits registrations or evaluations. Completion is remembered per account/role on this browser; anonymous registration completion is per browser. See [tutorial maintenance instructions](front-end/src/tutorial/README.md) for step configuration, accessible interaction and isolated browser tests.

Score exports use case-insensitive A–Z ordering: member grades by Last Name, First Name, then Middle Name; group summaries, all-results backups and archived results by group name. Group-name numbers use natural order (Group 2 before Group 10). Members listed within exported groups are sorted by name too. Legacy full-name-only members sort by their saved name. Sorting changes export row order only; saved scores and member records are preserved.

### Proposal PDF previews

View Proposal displays an authenticated PDF preview. PDF uploads open directly; DOC, DOCX, PPT and PPTX uploads are converted on demand without replacing the original in storage. The API host needs LibreOffice and fonts for conversion. Set LIBREOFFICE_PATH in the backend environment for a custom executable location; defaults are soffice on Linux and C:/Program Files/LibreOffice/program/soffice.exe on Windows. Restart the API after configuring it.

For Render, deploy the backend as a Docker service with back-end as the root directory and its Dockerfile; the image includes LibreOffice and Liberation fonts. Keep the existing backend environment variables. A native Node Render service does not include LibreOffice. Conversion has a 60-second timeout and removes temporary documents afterward. Conversion errors appear in the viewer without downloading the Word file.

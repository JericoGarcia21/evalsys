type Access = 'Allowed' | 'Own workspace only' | 'Denied' | 'Not implemented';

interface Permission {
  action: string;
  superadmin: Access;
  instructor: Access;
  panel: Access;
  note: string;
}

// Documentation only. Server middleware and resource checks remain authoritative.
const permissions: Permission[] = [
  { action: 'Change grading locks', superadmin: 'Denied', instructor: 'Own workspace only', panel: 'Denied', note: 'Instructors can lock or unlock grading for their own assigned subjects.' },
  { action: 'Change instructor CSV locks', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Controls instructor result-export access, not audit-log export.' },
  { action: 'Change instructor subject limits', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Limits apply to instructor accounts.' },
  { action: 'Activate or deactivate accounts', superadmin: 'Allowed', instructor: 'Own workspace only', panel: 'Denied', note: 'Instructors may only manage panel accounts they created.' },
  { action: 'Reset account passwords', superadmin: 'Allowed', instructor: 'Own workspace only', panel: 'Denied', note: 'Administrative reset only; instructors may reset their own panel accounts. Changing your own password is separate.' },
  { action: 'Assign instructors to subjects', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Changes subject assignments; this is not a complete transfer of workspace data.' },
  { action: 'Browse or export audit logs', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Platform-wide audit records; CSV export is limited to 10,000 matching records.' },
  { action: 'Inspect or revoke account sessions', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Administrative access to any account. Each account may also sign out its own current session.' },
  { action: 'Bulk reset instructor passwords', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Up to 20 instructors per atomic reset. Temporary passwords require a change at next login.' },
  { action: 'Transfer subject workspaces', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Requires maintenance mode, inactive source, destination quota, no shared-panel conflicts, and database transactions.' },
  { action: 'Review instructor offboarding', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Computed checklist and audited archive-review acknowledgement; does not delete records.' },
  { action: 'Review archived results', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Archive and legacy records are restricted to Super Admin.' },
  { action: 'Search or export archived results', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Snapshot filters and CSV exports cover all matching pages, limited to 10,000 results.' },
  { action: 'Publish targeted announcements', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Recipients only receive live notices matching their role and actual subject assignments.' },
  { action: 'Manage maintenance presets', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Loading a preset only fills the form. Scheduling downtime still requires confirmation.' },
  { action: 'Export platform analytics reports', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Registration periods and current grading/proposal snapshots; no student/account detail.' },
  { action: 'Repair or delete legacy records', superadmin: 'Allowed', instructor: 'Denied', panel: 'Denied', note: 'Destructive archive operations require the exact confirmation text.' },
  { action: 'Restore archived results', superadmin: 'Not implemented', instructor: 'Not implemented', panel: 'Not implemented', note: 'There is no archive-restore operation. Repair is not restore.' },
];

const badge = (access: Access) => access === 'Allowed' ? 'evl-badge-success' : access === 'Own workspace only' ? 'evl-badge-warning' : access === 'Denied' ? 'evl-badge-danger' : 'evl-badge bg-bg text-text/70';

export default function PermissionMatrix() {
  return (
    <section aria-labelledby="permissions-heading" className="evl-card overflow-hidden">
      <div className="p-5 border-b border-muted/30">
        <h3 id="permissions-heading" className="font-bold text-text">Permission matrix</h3>
        <p className="text-sm text-text/70 mt-2">Read-only reference for current access rules. This view does not grant permissions; the server enforces access and ownership.</p>
      </div>
      <div className="overflow-x-auto" role="region" aria-label="Role permission matrix" tabIndex={0}>
        <table className="evl-table min-w-[850px]">
          <caption className="sr-only">Administrative actions by role and workspace restrictions</caption>
          <thead><tr><th scope="col">Action</th><th scope="col">Super Admin</th><th scope="col">Instructor</th><th scope="col">Panel</th><th scope="col">Restrictions</th></tr></thead>
          <tbody>
            {permissions.map(row => (
              <tr key={row.action}>
                <th scope="row" className="text-left text-sm font-bold text-text">{row.action}</th>
                {[row.superadmin, row.instructor, row.panel].map((access, index) => <td key={index}><span className={badge(access)}>{access}</span></td>)}
                <td className="text-sm text-text/70 min-w-[260px] max-w-[400px] whitespace-normal">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { notify } from '../../utils/notify';
import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { formatMemberList, type Member, type StructuredMember } from '../../utils/members';
import { useAuth } from '../../context/useAuth';
import { useOperationalScope } from '../../hooks/useOperationalScope';

interface Section { _id: string; name: string; block: string; }
interface EvaluationRecord { _id: string; panelId: string; panelName: string; }
interface RubricCriteria { key: string; label: string; maxScore: number; }
interface GroupResult {
  group: { _id: string; name: string; members: Member[] };
  averaged: Record<string, number> | null;
  finalTotal: number | null;
  rubricCriteria?: RubricCriteria[];
  evaluatedBy?: string[];
  missingPanels?: string[];
  isIncomplete?: boolean;
  comments?: { panel: string; text: string }[];
  evaluationRecords?: EvaluationRecord[];
}

const scoreColor = (score: number, max: number) => {
  if (!max) return 'text-text/70 font-bold';
  const pct = score / max;
  if (pct >= 0.84) return 'text-success font-bold';
  if (pct >= 0.64) return 'text-primary font-bold';
  if (pct >= 0.44) return 'text-warning font-bold';
  return 'text-danger font-bold';
};

const scoreBadge = (total: number, max: number) => {
  const pct = max > 0 ? total / max : 0;
  if (pct >= 0.84) return 'evl-badge-success';
  if (pct >= 0.64) return 'evl-badge-primary';
  if (pct >= 0.44) return 'evl-badge-warning';
  return 'evl-badge-danger';
};

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsvFile = (filename: string, headers: string[], rows: unknown[][]) => {
  const csvContent = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const safeFilename = (value: string) => value.replace(/[^a-z0-9_-]+/gi, '_');

const getGroupScore = (result: GroupResult) => (
  result.isIncomplete || result.finalTotal === null
    ? 'Pending Complete Evaluation'
    : (result.finalTotal?.toFixed(2) ?? 'Pending Complete Evaluation')
);

const isStructuredMember = (member: Member): member is StructuredMember => typeof member !== 'string';

const getMemberNameParts = (member: Member) => {
  if (isStructuredMember(member)) {
    return {
      lastName: member.lastName || '',
      firstName: member.firstName || '',
      middleName: member.middleName || '',
    };
  }

  return {
    lastName: member,
    firstName: '',
    middleName: '',
  };
};

const getResultMaxTotal = (result: GroupResult, fallbackMax: number) => (
  result.rubricCriteria?.reduce((sum, criteria) => sum + criteria.maxScore, 0) ?? fallbackMax
);

export default function Results() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [sections, setSections] = useState<Section[]>([]);
  const [selected, setSelected] = useState<Section | null>(null);
  const [results, setResults] = useState<GroupResult[]>([]);
  const [viewFeedback, setViewFeedback] = useState<{ group: string, items: { panel: string, text: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSections, setLoadingSections] = useState(true);
  const [accountCsvLocked, setAccountCsvLocked] = useState(Boolean(user?.csvExportLocked));
  const csvLocked = user?.role === 'admin' && accountCsvLocked;

  // Clear score modal state
  const [clearModal, setClearModal] = useState<{ group: GroupResult } | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null);
  const { version: scopeVersion } = useOperationalScope();

  const criteriaColumns = useMemo(() => {
    const byKey = new Map<string, RubricCriteria>();

    results.forEach((result) => {
      result.rubricCriteria?.forEach((criteria) => {
        if (!byKey.has(criteria.key)) byKey.set(criteria.key, criteria);
      });
    });

    return Array.from(byKey.values());
  }, [results]);

  const maxTotal = criteriaColumns.reduce((sum, criteria) => sum + criteria.maxScore, 0);

  useEffect(() => {
    Promise.all([
      api.get('/sections'),
      api.get('/auth/me'),
    ]).then(([secRes, meRes]) => {
      setSections(secRes.data);
      setAccountCsvLocked(Boolean(meRes.data.csvExportLocked));
    }).catch(() => notify('Unable to load results setup. Please try again.', { type: 'error' })).finally(() => setLoadingSections(false));
  }, [scopeVersion]);

  const loadResults = async (section: Section) => {
    setSelected(section);
    setLoading(true);
    try {
      const res = await api.get(`/evaluations/section/${section._id}/results`);
      setResults(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearEvaluation = async (evaluationId: string) => {
    setClearingId(evaluationId);
    try {
      await api.delete(`/evaluations/${evaluationId}`);
      // Refresh results
      if (selected) {
        const res = await api.get(`/evaluations/section/${selected._id}/results`);
        setResults(res.data);
        // Update the modal's group data with fresh results
        if (clearModal) {
          const updatedGroup = res.data.find(
            (r: GroupResult) => r.group._id === clearModal.group.group._id
          );
          if (updatedGroup) {
            setClearModal({ group: updatedGroup });
          } else {
            setClearModal(null);
          }
        }
      }
    } catch (err) {
      console.error('Failed to clear evaluation', err);
    } finally {
      setClearingId(null);
      setConfirmClearId(null);
    }
  };

  const downloadGroupSummaryCSV = () => {
    if (!selected || !results.length) return;

    const headers = ['Block', 'Group', 'Members', 'Group Score', 'Evaluated By', 'Missing Panels', 'Comments'];
    const rows = results.map((r) => [
      selected.block,
      r.group.name,
      formatMemberList(r.group.members, '; '),
      getGroupScore(r),
      r.evaluatedBy?.join('; ') ?? '',
      r.missingPanels?.join('; ') ?? '',
      r.comments?.map(c => `[${c.panel}]: ${c.text}`).join(' | ') ?? '',
    ]);

    downloadCsvFile(`${safeFilename(selected.block)}_Group_Summary.csv`, headers, rows);
  };

  const downloadMemberGradesCSV = () => {
    if (!selected || !results.length) return;

    const headers = ['Block', 'Group', 'Last Name', 'First Name', 'Middle Name', 'Group Score'];
    const rows = results
      .flatMap((result) => result.group.members.map((member) => {
        const memberParts = getMemberNameParts(member);
        return {
          block: selected.block,
          group: result.group.name,
          ...memberParts,
          score: getGroupScore(result),
        };
      }))
      .sort((a, b) => (
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName) ||
        a.middleName.localeCompare(b.middleName)
      ))
      .map((row) => [
        row.block,
        row.group,
        row.lastName,
        row.firstName,
        row.middleName,
        row.score,
      ]);

    downloadCsvFile(`${safeFilename(selected.block)}_Member_Grades.csv`, headers, rows);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="evl-page-title">Results</h2>
        <p className="evl-page-subtitle">View averaged evaluation scores per group by section.</p>
      </div>

      {/* Section selector */}
      <div className="flex gap-2 overflow-x-auto sm:flex-wrap mb-6 pb-1 -mx-1 px-1">
        {loadingSections ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="w-24 h-10 rounded-lg bg-surface border border-muted/40 animate-pulse" />
          ))
        ) : (
          sections.map((s) => (
            <button key={s._id} onClick={() => loadResults(s)}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold border whitespace-nowrap transition-all duration-150 ${
                selected?._id === s._id
                  ? 'bg-primary text-white border-primary'
                  : 'border-muted text-text/70 bg-surface hover:text-text hover:border-text/20'
              }`}>
              {s.name === s.block ? s.block : `${s.name} — ${s.block}`}
            </button>
          ))
        )}
        {!loadingSections && !sections.length && <p className="text-text/70 text-sm">No sections available.</p>}
      </div>

      {/* Results table */}
      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : selected && (
        <div className="overflow-hidden border-y border-muted/30 bg-surface">
          <div className="px-0 py-4 border-b border-muted/40 flex justify-end">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={downloadGroupSummaryCSV}
                disabled={csvLocked && !isSuperadmin}
                title={csvLocked && !isSuperadmin ? 'CSV export is currently disabled by the administrator' : ''}
                className={`evl-btn-primary !py-1.5 !text-xs ${csvLocked && !isSuperadmin ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {csvLocked && !isSuperadmin ? 'Export Locked' : 'Download Group Summary CSV'}
              </button>
              <button
                onClick={downloadMemberGradesCSV}
                disabled={csvLocked && !isSuperadmin}
                title={csvLocked && !isSuperadmin ? 'CSV export is currently disabled by the administrator' : ''}
                className={`evl-btn-secondary !py-1.5 !text-xs ${csvLocked && !isSuperadmin ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {csvLocked && !isSuperadmin ? 'Export Locked' : 'Download Member Grades CSV'}
              </button>
            </div>
          </div>

          <div className="lg:hidden divide-y divide-muted/40">
            {results.map((result) => (
              <MobileResultCard
                key={result.group._id}
                result={result}
                criteriaColumns={criteriaColumns}
                maxTotal={maxTotal}
                onViewFeedback={setViewFeedback}
                onClearScore={setClearModal}
              />
            ))}
            {!results.length && (
              <div className="text-center text-text/70 py-12">No results for this section yet.</div>
            )}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="evl-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Members</th>
                  {criteriaColumns.map((criteria) => (
                    <th key={criteria.key} className="text-center">
                      {criteria.label}
                      <span className="block text-[10px] font-semibold text-text/65">/{criteria.maxScore}</span>
                    </th>
                  ))}
                  <th className="text-center">Final</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const { group, averaged, finalTotal, evaluatedBy, missingPanels, isIncomplete, comments, evaluationRecords } = result;
                  const resultMaxTotal = getResultMaxTotal(result, maxTotal);
                  return (
                    <tr key={group._id}>
                      <td className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <p className="font-semibold text-text">{group.name}</p>
                          {evaluatedBy && evaluatedBy.length > 0 && (
                            <p className="text-[10px] text-success/80 font-semibold tracking-wide uppercase mt-1">
                              Eval by: {evaluatedBy.join(', ')}
                            </p>
                          )}
                          {isIncomplete && missingPanels && missingPanels.length > 0 && (
                            <p className="text-[10px] text-danger font-bold tracking-wide uppercase mt-0.5">
                              Did not evaluate yet: {missingPanels.join(', ')}
                            </p>
                          )}
                          {comments && comments.length > 0 && (
                            <button 
                              onClick={() => setViewFeedback({ group: group.name, items: comments })}
                              className="text-[9px] font-bold text-primary uppercase text-left mt-2 hover:underline"
                            >
                              👁 View {comments.length} Comments
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="text-text/70 text-xs max-w-[200px]">{formatMemberList(group.members) || '—'}</td>
                      {criteriaColumns.map((criteria) => (
                        <td key={criteria.key} className={`text-center ${!isIncomplete && averaged ? scoreColor(averaged[criteria.key] || 0, criteria.maxScore) : 'text-text/70'}`}>
                          {!isIncomplete && averaged ? (averaged[criteria.key] ?? 0) : '—'}
                        </td>
                      ))}
                      <td className="text-center">
                        {isIncomplete || finalTotal === null ? (
                          <span className="text-danger font-bold text-[10px] uppercase tracking-tight">
                            Pending Complete Evaluation
                          </span>
                        ) : (
                          <span className={`text-lg ${scoreBadge(finalTotal, resultMaxTotal)} !text-base`}>
                            {finalTotal}
                            {resultMaxTotal > 0 && <span className="ml-1 text-[10px] font-semibold opacity-60">/{resultMaxTotal}</span>}
                          </span>
                        )}
                      </td>
                      <td className="col-actions">
                        {evaluationRecords && evaluationRecords.length > 0 ? (
                          <button
                            onClick={() => setClearModal({ group: result })}
                            title="Clear a panel's score for this group"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-danger/30 text-danger bg-danger/5 hover:bg-danger/15 hover:border-danger/60 transition-all duration-150"
                          >
                            🗑 Clear Score
                          </button>
                        ) : (
                          <span className="text-text/60 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!results.length && (
                  <tr><td colSpan={criteriaColumns.length + 4} className="text-center text-text/70 py-12">No results for this section yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feedback modal */}
      {viewFeedback && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-muted/30 flex justify-between items-center bg-bg">
              <h3 className="font-bold text-text">Feedback for {viewFeedback.group}</h3>
              <button onClick={() => setViewFeedback(null)} className="text-text/70 hover:text-text text-xl">×</button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
              {viewFeedback.items.map((item, i) => (
                <div key={i} className="bg-bg p-4 rounded-xl border border-muted/20">
                  <p className="text-[10px] font-extrabold text-primary uppercase tracking-widest mb-1">
                    Panel: {item.panel}
                  </p>
                  <p className="text-text/80 text-sm italic leading-relaxed">
                    "{item.text}"
                  </p>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 bg-bg border-t border-muted/30 flex justify-end">
              <button onClick={() => setViewFeedback(null)} className="evl-btn-secondary !py-1.5 !text-xs">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Score Modal */}
      {clearModal && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-muted/30 flex justify-between items-center bg-bg">
              <div>
                <h3 className="font-bold text-text">Clear Panel Score</h3>
                <p className="text-text/70 text-xs mt-0.5">{clearModal.group.group.name}</p>
              </div>
              <button
                onClick={() => { setClearModal(null); setConfirmClearId(null); }}
                className="text-text/70 hover:text-text text-xl"
              >×</button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="text-text/60 text-xs mb-4 leading-relaxed">
                Select a panel's evaluation to permanently delete. This will allow them (or another panel) to re-grade this group. This action cannot be undone.
              </p>

              {clearModal.group.evaluationRecords && clearModal.group.evaluationRecords.length > 0 ? (
                clearModal.group.evaluationRecords.map((rec) => (
                  <div
                    key={rec._id}
                    className="flex items-center justify-between bg-bg rounded-xl px-4 py-3 border border-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                        {rec.panelName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-text">{rec.panelName}</span>
                    </div>

                    {confirmClearId === rec._id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-danger font-bold">Confirm?</span>
                        <button
                          onClick={() => handleClearEvaluation(rec._id)}
                          disabled={clearingId === rec._id}
                          className="px-3 py-1 rounded-lg text-[11px] font-bold bg-danger text-white hover:bg-danger/80 transition-all disabled:opacity-50"
                        >
                          {clearingId === rec._id ? '...' : 'Yes, Clear'}
                        </button>
                        <button
                          onClick={() => setConfirmClearId(null)}
                          className="px-3 py-1 rounded-lg text-[11px] font-bold border border-muted text-text/70 hover:text-text transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClearId(rec._id)}
                        className="px-3 py-1 rounded-lg text-[11px] font-bold border border-danger/30 text-danger bg-danger/5 hover:bg-danger/15 hover:border-danger/60 transition-all"
                      >
                        🗑 Clear
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-text/70 text-sm py-8">No evaluations to clear for this group.</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-bg border-t border-muted/30 flex justify-end">
              <button
                onClick={() => { setClearModal(null); setConfirmClearId(null); }}
                className="evl-btn-secondary !py-1.5 !text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileResultCard({
  result,
  criteriaColumns,
  maxTotal,
  onViewFeedback,
  onClearScore,
}: {
  result: GroupResult;
  criteriaColumns: RubricCriteria[];
  maxTotal: number;
  onViewFeedback: (value: { group: string; items: { panel: string; text: string }[] }) => void;
  onClearScore: (value: { group: GroupResult }) => void;
}) {
  const { group, averaged, finalTotal, evaluatedBy, missingPanels, isIncomplete, comments, evaluationRecords } = result;
  const resultMaxTotal = getResultMaxTotal(result, maxTotal);

  return (
    <div className="px-0 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-black text-text text-base break-words">{group.name}</h3>
          {evaluatedBy && evaluatedBy.length > 0 && (
            <p className="text-[11px] text-success font-bold uppercase mt-1">
              Eval by: {evaluatedBy.join(', ')}
            </p>
          )}
        </div>
        {isIncomplete || finalTotal === null ? (
          <span className="evl-badge-danger shrink-0 !text-[10px]">Pending</span>
        ) : (
          <span className={`${scoreBadge(finalTotal, resultMaxTotal)} shrink-0`}>
            {finalTotal}
            {resultMaxTotal > 0 && <span className="ml-1 text-[10px] opacity-70">/{resultMaxTotal}</span>}
          </span>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-muted/40 bg-bg/60 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-text/60 mb-1">Members</p>
        <p className="text-sm text-text/80 leading-relaxed break-words">
          {formatMemberList(group.members) || 'No members'}
        </p>
      </div>

      {isIncomplete && missingPanels && missingPanels.length > 0 && (
        <p className="mt-3 text-xs text-danger font-bold leading-relaxed">
          Did not evaluate yet: {missingPanels.join(', ')}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        {criteriaColumns.map((criteria) => (
          <div key={criteria.key} className="rounded-lg border border-muted/40 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-text/75 break-words">{criteria.label}</p>
              <p className={`text-sm ${!isIncomplete && averaged ? scoreColor(averaged[criteria.key] || 0, criteria.maxScore) : 'text-text/70 font-bold'}`}>
                {!isIncomplete && averaged ? (averaged[criteria.key] ?? 0) : '-'}
                <span className="text-[10px] text-text/50 ml-1">/{criteria.maxScore}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
        {comments && comments.length > 0 && (
          <button
            type="button"
            onClick={() => onViewFeedback({ group: group.name, items: comments })}
            className="evl-btn-secondary !py-2 !px-3 !text-xs"
          >
            View {comments.length} Comments
          </button>
        )}
        {evaluationRecords && evaluationRecords.length > 0 && (
          <button
            type="button"
            onClick={() => onClearScore({ group: result })}
            className="evl-btn-danger !py-2 !px-3 !text-xs"
          >
            Clear Score
          </button>
        )}
      </div>
    </div>
  );
}





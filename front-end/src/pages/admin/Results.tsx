import { notify } from '../../utils/notify';
import { Fragment, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { compareMembers, formatMemberList, type Member, type StructuredMember } from '../../utils/members';
import { useAuth } from '../../context/useAuth';
import { useOperationalScope } from '../../hooks/useOperationalScope';
import { compareNames } from '../../utils/alphabetical';

interface Section { _id: string; name: string; block: string; }
interface EvaluationRecord { _id: string; panelId: string; panelName: string; }
interface RubricCriteria { key: string; label: string; maxScore: number; section?: string; description?: string; }
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
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
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
    const rows = [...results].sort((a, b) => compareNames(a.group.name, b.group.name)).map((r) => [
      selected.block,
      r.group.name,
      formatMemberList([...r.group.members].sort(compareMembers), '; '),
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
        compareNames(a.lastName, b.lastName) ||
        compareNames(a.firstName, b.firstName) ||
        compareNames(a.middleName, b.middleName) ||
        compareNames(a.group, b.group)
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
      <div data-tutorial="results-blocks" className="flex gap-2 overflow-x-auto sm:flex-wrap mb-6 pb-1 -mx-1 px-1">
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

      {/* Results overview */}
      {loading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : selected && (
        <section className="rounded-xl border border-muted/40 bg-surface overflow-hidden" aria-label="Section results">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-muted/30">
            <div>
              <h3 className="font-bold text-text">{selected.block} results</h3>
              <p className="text-xs text-text/65 mt-1">{results.length} groups / {results.filter(r => !r.isIncomplete && r.finalTotal !== null).length} complete / {results.filter(r => r.isIncomplete || r.finalTotal === null).length} awaiting scores</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {csvLocked && !isSuperadmin && <span className="text-xs font-semibold text-text/60">Export locked</span>}
              <button onClick={downloadGroupSummaryCSV} disabled={csvLocked && !isSuperadmin} className="evl-btn-primary !py-2 !text-xs disabled:opacity-40" title={csvLocked && !isSuperadmin ? 'CSV export is disabled by the administrator' : undefined}>Download Group Summary CSV</button>
              <button onClick={downloadMemberGradesCSV} disabled={csvLocked && !isSuperadmin} className="evl-btn-secondary !py-2 !text-xs disabled:opacity-40" title={csvLocked && !isSuperadmin ? 'CSV export is disabled by the administrator' : undefined}>Download Member Grades CSV</button>
            </div>
          </div>
          <table className="w-full table-fixed" aria-label="Group results overview">
            <thead className="hidden md:table-header-group bg-bg text-left text-xs text-text/60">
              <tr><th scope="col" className="px-5 py-3 w-[32%] font-semibold">Group</th><th scope="col" className="px-5 py-3 w-[24%] font-semibold">Panel progress</th><th scope="col" className="px-5 py-3 w-[20%] font-semibold">Final score</th><th scope="col" className="px-5 py-3 w-[24%] font-semibold text-right">Details</th></tr>
            </thead>
            <tbody className="block md:table-row-group">
              {results.map(result => {
                const submitted = result.evaluatedBy?.length || 0;
                const expected = submitted + (result.missingPanels?.length || 0);
                const pending = result.isIncomplete || result.finalTotal === null;
                const resultMax = getResultMaxTotal(result, maxTotal);
                const open = expandedGroup === result.group._id;
                return <Fragment key={result.group._id}>
                  <tr className={`block md:table-row border-t border-muted/30 ${open ? 'bg-primary/[0.03]' : 'hover:bg-bg/60'}`}>
                    <td className="block md:table-cell px-5 pt-4 pb-2 md:py-4 align-middle">
                      <p className="font-bold text-sm text-text break-words">{result.group.name}</p>
                      <p className="text-xs text-text/55 mt-1">{result.group.members.length} members</p>
                    </td>
                    <td className="block md:table-cell px-5 py-2 md:py-4 align-middle">
                      <p className="text-xs font-semibold text-text/75">{expected ? `${submitted} of ${expected} panels submitted` : submitted ? `${submitted} panels submitted` : 'No submissions yet'}</p>
                      {expected > 0 && <div className="h-1.5 bg-muted/30 rounded-full mt-2 max-w-40 overflow-hidden" role="progressbar" aria-label={`Panel progress for ${result.group.name}`} aria-valuemin={0} aria-valuemax={expected} aria-valuenow={submitted}><div className={`h-full rounded-full ${pending ? 'bg-primary' : 'bg-success'}`} style={{ width: `${submitted / expected * 100}%` }} /></div>}
                      {!!result.missingPanels?.length && <p className="mt-2 text-xs text-danger font-medium break-words">Not evaluated yet: {result.missingPanels.join(', ')}</p>}
                    </td>
                    <td className="block md:table-cell px-5 py-2 md:py-4 align-middle">
                      {pending ? <span className="inline-flex rounded-md bg-warning/10 text-warning px-2.5 py-1 text-xs font-semibold">Pending</span> : <span className="text-xl font-bold text-text tabular-nums">{result.finalTotal}{resultMax > 0 && <span className="text-xs font-medium text-text/50 ml-1">/ {resultMax}</span>}</span>}
                    </td>
                    <td className="block md:table-cell px-5 pt-2 pb-4 md:py-4 md:text-right align-middle">
                      <button type="button" aria-expanded={open} aria-controls={`result-${result.group._id}`} aria-label={`${open ? 'Hide' : 'View'} breakdown for ${result.group.name}`} onClick={() => setExpandedGroup(open ? null : result.group._id)} className="evl-btn-secondary !text-xs !py-2">{open ? 'Hide breakdown' : 'View breakdown'}<span aria-hidden="true" className="ml-2">{open ? '-' : '+'}</span></button>
                    </td>
                  </tr>
                  <tr className={open ? 'block md:table-row bg-bg/50' : 'hidden'} id={`result-${result.group._id}`}>
                    <td colSpan={4} className="block md:table-cell px-5 py-5 border-t border-muted/20">
                      {open && <ResultBreakdown result={result} criteriaColumns={criteriaColumns} onViewFeedback={setViewFeedback} onClearScore={setClearModal} />}
                    </td>
                  </tr>
                </Fragment>;
              })}
              {!results.length && <tr className="block md:table-row"><td colSpan={4} className="block md:table-cell text-center text-text/60 py-12">No results for this section yet.</td></tr>}
            </tbody>
          </table>
        </section>
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

function ResultBreakdown({ result, criteriaColumns, onViewFeedback, onClearScore }: {
  result: GroupResult;
  criteriaColumns: RubricCriteria[];
  onViewFeedback: (value: { group: string; items: { panel: string; text: string }[] }) => void;
  onClearScore: (value: { group: GroupResult }) => void;
}) {
  const { group, averaged, finalTotal, evaluatedBy, missingPanels, isIncomplete, comments, evaluationRecords } = result;
  const pending = isIncomplete || finalTotal === null;
  const sections = new Map<string, RubricCriteria[]>();
  for (const criterion of result.rubricCriteria || criteriaColumns) {
    const name = criterion.section || 'Criteria';
    sections.set(name, [...(sections.get(name) || []), criterion]);
  }
  return <div className="space-y-5" role="region" aria-label={`Score breakdown for ${group.name}`}>
    <div className="grid sm:grid-cols-2 gap-4 text-xs">
      <div><p className="font-semibold text-text/60 mb-1">Panel evaluations</p><p className="text-text/80">{evaluatedBy?.length ? `Submitted: ${evaluatedBy.join(', ')}` : 'No panels have submitted yet.'}</p>{!!missingPanels?.length && <p className="text-text/65 mt-1">Awaiting: {missingPanels.join(', ')}</p>}</div>
      <details><summary className="cursor-pointer font-semibold text-primary">Members ({group.members.length})</summary><p className="mt-2 text-text/75 leading-relaxed">{formatMemberList(group.members) || 'No members'}</p></details>
    </div>
    {[...sections].map(([section, criteria]) => <section key={section} aria-label={section}>
      <div className="flex justify-between items-center gap-3 mb-2"><h4 className="text-sm font-bold text-text">{section}</h4><span className="text-xs text-text/60">{criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0)} possible points</span></div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {criteria.map(criterion => <div key={criterion.key} className="flex items-start justify-between gap-4 rounded-lg border border-muted/30 bg-surface px-3 py-3">
          <dt className="text-xs text-text/80 leading-relaxed" title={criterion.description}>{criterion.label}</dt>
          <dd className={`shrink-0 text-sm tabular-nums ${!pending && averaged ? scoreColor(averaged[criterion.key] || 0, criterion.maxScore) : 'text-text/45'}`}>{!pending && averaged ? averaged[criterion.key] ?? 0 : '-'}<span className="text-xs font-normal text-text/50"> / {criterion.maxScore}</span></dd>
        </div>)}
      </dl>
    </section>)}
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-muted/30">
      <p className="text-xs text-text/55">{pending ? 'Final score appears when all assigned panels submit.' : 'Final score is the average across panel evaluations.'}</p>
      <div className="flex gap-2">{!!comments?.length && <button type="button" onClick={() => onViewFeedback({ group: group.name, items: comments })} className="evl-btn-secondary !text-xs !py-2">View {comments.length} Comments</button>}{!!evaluationRecords?.length && <button type="button" onClick={() => onClearScore({ group: result })} className="evl-btn-secondary !text-xs !py-2 !text-danger">Clear Score</button>}</div>
    </div>
  </div>;
}

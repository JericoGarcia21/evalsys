import { getApiMessage, getApiStatus } from '../../utils/apiError';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import ScoreInput from '../../components/ScoreInput';
import { CardSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/useAuth';
import { formatMemberList, type Member } from '../../utils/members';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface Level { label: string; minScore: number; maxScore: number; description: string; }
interface Criteria { key: string; label: string; maxScore: number; levels: Level[]; }
interface Rubric { _id: string; title: string; criteria: Criteria[]; isActive: boolean; subject?: string; }
interface Section { _id: string; name: string; block: string; subject?: string | { _id: string; code?: string; title?: string }; }
interface ProposalFile { path?: string; originalName?: string; mimeType?: string; size?: number; uploadedAt?: string; }
interface Group { _id: string; name: string; section: Section; members: Member[]; isGraded?: boolean; proposalFile?: ProposalFile; }

const LEVEL_COLORS: Record<string, string> = {
  Excellent: 'bg-success/10 text-success',
  Good: 'bg-primary/10 text-primary',
  Fair: 'bg-warning/10 text-warning',
  Poor: 'bg-danger/10 text-danger',
};

const draftKey = (panelId: string, groupId: string) => `grading_draft_${panelId}_${groupId}`;
const legacyDraftKey = (groupId: string) => `grading_draft_${groupId}`;
const lastSelectedGroupKey = (panelId: string) => `grading_last_selected_group_${panelId}`;
const groupNameCacheKey = 'grading_group_names';
const groupStatusCacheKey = (panelId: string) => `grading_group_status_${panelId}`;

const hasScoreValues = (scores: Record<string, number | ''>) =>
  Object.values(scores).some((value) => value !== '' && value !== null && value !== undefined);

interface ExistingEvaluation {
  _id: string;
  group: string;
  panel: string;
  rubric?: Rubric | string;
  scores: Record<string, number>;
  total?: number;
  comments?: string;
  isSubmitted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const getRefId = (value: { _id?: string } | string | null | undefined): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id || '';
};
const getSubjectLabel = (section?: Section | null) => {
  const subject = section?.subject;
  if (!subject || typeof subject === 'string') return 'Subject not linked';
  return [subject.code, subject.title].filter(Boolean).join(' - ') || 'Subject not linked';
};
const formatScoreKey = (key: string) => key
  .replace(/([A-Z])/g, ' $1')
  .replace(/^./, (char) => char.toUpperCase());
const formatSavedTime = (value: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const formatSubmittedTime = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function Grade() {
  const { user } = useAuth();
  const panelId = user?.id || user?._id || 'unknown_panel';
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState<string>('');

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const [scores, setScores] = useState<Record<string, number | ''>>({});
  const [comments, setComments] = useState('');
  const [existing, setExisting] = useState<ExistingEvaluation | null>(null);

  const [loadingRubrics, setLoadingRubrics] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loadingSidebar, setLoadingSidebar] = useState(true);

  const [sections, setSections] = useState<Section[]>([]);
  const [lockedSubjectIds, setLockedSubjectIds] = useState<string[]>([]);
  const gradingLockMessage = 'The instructor owner has temporarily disabled grading submissions for this subject.';
  const [submitting, setSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [hasCurrentDraft, setHasCurrentDraft] = useState(false);
  const [missingCriteria, setMissingCriteria] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [proposalError, setProposalError] = useState('');
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [searchParams] = useSearchParams();
  const urlGroupId = searchParams.get('groupId');
  const skipAutosaveRef = useRef(false);
  const evaluationRequestIdRef = useRef(0);

  const [selectedSidebarSectionId, setSelectedSidebarSectionId] = useState<string>('');
  const getGroupSubjectId = (group: Group | null) => getRefId(group?.section?.subject);
  const selectedSubjectId = getGroupSubjectId(selectedGroup);
  const subjectGradingLocked = Boolean(selectedSubjectId) && lockedSubjectIds.includes(selectedSubjectId);
  const gradingLocked = subjectGradingLocked;

  const cacheGroupStatus = useCallback((nextGroups: Group[]) => {
    const groupNames = nextGroups.reduce((acc: Record<string, string>, group: Group) => {
      acc[group._id] = group.name;
      return acc;
    }, {});
    const groupStatus = nextGroups.reduce((acc: Record<string, { name: string; isGraded: boolean }>, group: Group) => {
      acc[group._id] = { name: group.name, isGraded: Boolean(group.isGraded) };
      return acc;
    }, {});
    localStorage.setItem(groupNameCacheKey, JSON.stringify(groupNames));
    localStorage.setItem(groupStatusCacheKey(panelId), JSON.stringify(groupStatus));
  }, [panelId]);

  const refreshGradingLock = useCallback(() => {
    api.get('/auth/me').then(meRes => {
      setLockedSubjectIds((meRes.data.gradingLockedSubjects || []).map((subject: string | { _id?: string }) => getRefId(subject)));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshGradingLock();
    const timer = window.setInterval(refreshGradingLock, 30000);
    return () => window.clearInterval(timer);
  }, [refreshGradingLock]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const activeRubric = rubrics.find((r) => r._id === selectedRubricId) || null;
  const selectedExisting = selectedGroup && getRefId(existing?.group) === selectedGroup._id
    ? existing
    : null;
  const submittedRubric = selectedExisting?.rubric && typeof selectedExisting.rubric === 'object'
    ? selectedExisting.rubric as Rubric
    : null;
  const visibleRubric = gradingLocked && submittedRubric ? submittedRubric : activeRubric;
  const existingScores = selectedExisting?.scores || {};
  const total = Object.values(scores).reduce<number>(
    (a, b) => (typeof b === 'number' ? a + b : a), 0
  );
  const maxTotal = visibleRubric?.criteria.reduce((a, c) => a + c.maxScore, 0) ?? 100;
  const submittedTotal = typeof selectedExisting?.total === 'number'
    ? selectedExisting.total
    : total;
  const submittedAt = formatSubmittedTime(selectedExisting?.updatedAt || selectedExisting?.createdAt);
  const canEditScores = !gradingLocked && !submitting;

  const getStoredDraft = (groupId: string) => {
    const saved = localStorage.getItem(draftKey(panelId, groupId)) || localStorage.getItem(legacyDraftKey(groupId));
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(draftKey(panelId, groupId));
      localStorage.removeItem(legacyDraftKey(groupId));
      return null;
    }
  };

  const groupHasDraft = (groupId: string) => {
    const draft = getStoredDraft(groupId);
    const matchesCurrentRubric = !activeRubric || draft?.rubricId === activeRubric._id;
    return Boolean(matchesCurrentRubric && draft?.scores && (hasScoreValues(draft.scores) || draft.comments?.trim()));
  };

  const saveDraft = (
    group = selectedGroup,
    rubric = activeRubric,
    nextScores = scores,
    nextComments = comments
  ) => {
    if (!group || !rubric) return;
    if (!hasScoreValues(nextScores) && !nextComments.trim()) return;

    const backupData = {
      groupId: group._id,
      groupName: group.name,
      rubricId: rubric._id,
      scores: nextScores,
      comments: nextComments,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(draftKey(panelId, group._id), JSON.stringify(backupData));
    if (selectedGroup?._id === group._id) {
      setDraftSavedAt(backupData.updatedAt);
      setHasCurrentDraft(true);
    }
  };

  const hasUnsavedLocalWork = () => (
    Boolean(selectedGroup) &&
    !selectedExisting &&
    (hasScoreValues(scores) || Boolean(comments.trim()))
  );

  const confirmContinueWithDraft = async () => {
    saveDraft();
    if (!hasUnsavedLocalWork()) return true;
    return confirm({
      title: 'Continue With Unsaved Draft?',
      message: 'Your scores were saved locally but not submitted yet. You can return to this group on the same device/browser to restore them.',
      confirmLabel: 'Continue',
    });
  };

  const selectGroup = async (group: Group) => {
    if (group._id !== selectedGroup?._id && !(await confirmContinueWithDraft())) return;
    const requestId = evaluationRequestIdRef.current + 1;
    evaluationRequestIdRef.current = requestId;
    skipAutosaveRef.current = true;
    setSelectedGroup(group);
    localStorage.setItem(lastSelectedGroupKey(panelId), group._id);
    const subjectId = getGroupSubjectId(group);
    setExisting(null);
    setRubrics([]);
    setSelectedRubricId('');
    setMissingCriteria([]);
    setProposalError('');
    setSuccess(''); setError('');
    if (!subjectId) {
      setError('This group is not connected to a subject yet. Ask the instructor to run the subject migration.');
      return;
    }

    try {
      setLoadingRubrics(true);
      const [res, rubricRes] = await Promise.all([
        api.get(`/evaluations/group/${group._id}/mine`),
        api.get('/rubrics/active', { params: { subject: subjectId } }),
      ]);
      if (requestId !== evaluationRequestIdRef.current) return;
      const active = rubricRes.data as Rubric;
      const savedRubric = res.data?.rubric && typeof res.data.rubric === 'object'
        ? res.data.rubric as Rubric
        : null;
      setRubrics([active, savedRubric].filter(Boolean) as Rubric[]);
      if (res.data) {
        setExisting(res.data);
        if (active) {
          setSelectedRubricId(active._id);
        } else if (res.data.rubric) {
          setSelectedRubricId(res.data.rubric._id || res.data.rubric);
        }
      } else {
        setExisting(null);
        if (active) {
          setSelectedRubricId(active._id);
        }
      }
    } catch (err: unknown) {
      if (requestId === evaluationRequestIdRef.current) {
        setError(getApiMessage(err, 'Failed to load this group subject and rubric.'));
      }
    } finally {
      if (requestId === evaluationRequestIdRef.current) setLoadingRubrics(false);
    }
  };

  // Restore unsaved local draft when returning to a group.
  const restoreBackup = useEffectEvent((groupId: string, rubricId: string) => {
    const data = getStoredDraft(groupId);
    if (data?.rubricId === rubricId && data.scores && (hasScoreValues(data.scores) || data.comments?.trim())) {
      return data as {
        groupId: string;
        rubricId: string;
        scores: Record<string, number | ''>;
        comments?: string;
        updatedAt?: string;
      }
    }
    return null;
  });

  const onInitialGroup = useEffectEvent((group: Group) => { void selectGroup(group); });

  useEffect(() => {
    api.get('/sections').then((r) => {
      setSections(r.data);
      if (r.data.length > 0) {
        setSelectedSidebarSectionId(r.data[0]._id);
      }
    }).catch(err => setError(getApiMessage(err, 'Failed to load assigned blocks')));

    api.get('/groups').then((r) => {
      setGroups(r.data);
      cacheGroupStatus(r.data);
      const initialGroupId = urlGroupId || localStorage.getItem(lastSelectedGroupKey(panelId));
      if (initialGroupId) {
        const found = r.data.find((g: Group) => g._id === initialGroupId);
        if (found) {
          onInitialGroup(found);
          const sId = typeof found.section === 'string' ? found.section : found.section?._id;
          if (sId) setSelectedSidebarSectionId(sId);
        }
      }
    }).catch(err => setError(getApiMessage(err, 'Failed to load assigned groups')))
      .finally(() => setLoadingSidebar(false));

  }, [panelId, urlGroupId, cacheGroupStatus]);

  // Re-initialize scores when group or rubric changes
  useEffect(() => {
    if (selectedGroup && activeRubric) {
      skipAutosaveRef.current = true;
      const draft = restoreBackup(selectedGroup._id, activeRubric._id);
      const matchingExisting = selectedExisting &&
        getRefId(selectedExisting.rubric) === activeRubric._id
        ? selectedExisting
        : null;

      if (matchingExisting) {
        // Restore a form from the submitted record or external local draft when selection changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setScores(matchingExisting.scores);
        setComments(matchingExisting.comments || '');
        setDraftSavedAt(null);
        setHasCurrentDraft(false);
      } else if (draft) {
        setScores(draft.scores);
        setComments(draft.comments || '');
        setDraftSavedAt(draft.updatedAt || null);
        setHasCurrentDraft(true);
      } else {
        const init: Record<string, number | ''> = {};
        activeRubric.criteria.forEach((c) => { init[c.key] = ''; });
        setScores(init);
        setComments('');
        setDraftSavedAt(null);
        setHasCurrentDraft(false);
      }

      setTimeout(() => {
        skipAutosaveRef.current = false;
      }, 0);
    }
  }, [selectedGroup, activeRubric, selectedExisting, panelId]);

  useEffect(() => {
    if (!selectedGroup || !selectedExisting || activeRubric) return;
    skipAutosaveRef.current = true;
    // Synchronize the read-only form with its submitted record when its rubric is unavailable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScores(selectedExisting.scores);
    setComments(selectedExisting.comments || '');
    setDraftSavedAt(null);
    setHasCurrentDraft(false);
    setTimeout(() => {
      skipAutosaveRef.current = false;
    }, 0);
  }, [selectedGroup, selectedExisting, activeRubric]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    saveDraft();

    if (!isOnline) {
      setError('You are offline. Your scores are saved locally and can be submitted when the connection returns.');
      return;
    }

    const missing = activeRubric?.criteria
      .filter((criteria) => scores[criteria.key] === '' || scores[criteria.key] === null || scores[criteria.key] === undefined)
      .map((criteria) => criteria.label) || [];
    setMissingCriteria(missing);
    if (missing.length) {
      setError(`Complete missing scores before submitting: ${missing.join(', ')}`);
      return;
    }

    const ok = await confirm({
      title: 'Submit Scores?',
      message: `Review your submission for ${selectedGroup?.name}:\n\nTotal Score: ${total}/${maxTotal}`,
      confirmLabel: 'Submit Scores',
    });
    if (!ok) return;

    setError(''); setSuccess('');
    setMissingCriteria([]);
    setSubmitting(true);
    try {
      await api.post(`/evaluations/group/${selectedGroup!._id}`, {
        scores,
        rubricId: selectedRubricId,
        comments
      });
      setSuccess('Scores and feedback submitted successfully.');
      const res = await api.get(`/evaluations/group/${selectedGroup!._id}/mine`);
      setExisting(res.data);
      localStorage.removeItem(draftKey(panelId, selectedGroup!._id));
      localStorage.removeItem(legacyDraftKey(selectedGroup!._id));
      setDraftSavedAt(null);
      setHasCurrentDraft(false);
      setGroups((current) => current.map((g) => (
        g._id === selectedGroup!._id ? { ...g, isGraded: true } : g
      )));
      const nextGroups = groups.map((g) => (
        g._id === selectedGroup!._id ? { ...g, isGraded: true } : g
      ));
      cacheGroupStatus(nextGroups);
    } catch (err: unknown) {
      if (getApiStatus(err) === undefined) {
        setError('Server unavailable. Your scores are saved locally and can be submitted again when the connection returns.');
      } else if (getApiStatus(err) === 403) {
        setError(getApiMessage(err, 'Grading is locked or you are not assigned to this group.'));
      } else {
        setError(getApiMessage(err, 'Submission failed. Your draft is saved locally.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

  const onSaveDraft = useEffectEvent(() => saveDraft());

  // AUTO-SAVE to localStorage to prevent data loss if browser crashes
  useEffect(() => {
    if (
      selectedGroup &&
      activeRubric &&
      !skipAutosaveRef.current &&
      (Object.keys(scores).length > 0 || comments.trim())
    ) {
      onSaveDraft();
    }
  }, [scores, comments, selectedGroup, activeRubric]);

  useEffect(() => {
    const handleBeforeUnload = () => onSaveDraft();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedGroup, activeRubric, scores, comments]);

  const clearCurrentDraft = async () => {
    if (!selectedGroup) return;
    const ok = await confirm({
      title: 'Clear Local Draft?',
      message: 'This clears the unsaved draft on this browser. Submitted scores will not be deleted.',
      confirmLabel: 'Clear Draft',
      danger: true,
    });
    if (!ok) return;
    localStorage.removeItem(draftKey(panelId, selectedGroup._id));
    localStorage.removeItem(legacyDraftKey(selectedGroup._id));
    setDraftSavedAt(null);
    setHasCurrentDraft(false);
    if (!selectedExisting && activeRubric) {
      const init: Record<string, number | ''> = {};
      activeRubric.criteria.forEach((c) => { init[c.key] = ''; });
      setScores(init);
      setComments('');
    }
  };

  // const _handlePrintRubric = () => {
  //   if (!activeRubric || !selectedGroup) return;
  //   const printWindow = window.open('', '_blank');
  //   if (!printWindow) return;

  //   const content = `
  //     <html>
  //       <head>
  //         <title>Offline Grading Sheet - ${selectedGroup.name}</title>
  //         <style>
  //           body { font-family: sans-serif; padding: 40px; color: #333; }
  //           h1 { margin-bottom: 5px; }
  //           .info { color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
  //           .criteria { margin-bottom: 40px; break-inside: avoid; }
  //           .criteria-title { font-weight: bold; font-size: 18px; margin-bottom: 10px; display: flex; justify-content: space-between; }
  //           .level { border: 1px solid #ddd; padding: 10px; margin-bottom: 5px; border-radius: 5px; }
  //           .level-title { font-weight: bold; font-size: 12px; margin-bottom: 3px; }
  //           .level-desc { font-size: 11px; color: #666; }
  //           .score-box { border: 2px solid #000; width: 60px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; }
  //         </style>
  //       </head>
  //       <body>
  //         <h1>Offline Grading Sheet</h1>
  //         <div class="info">
  //           <strong>Group:</strong> ${selectedGroup.name} <br/>
  //           <strong>Block:</strong> ${selectedSidebarSectionId ? sections.find(s => s._id === selectedSidebarSectionId)?.block : ''} <br/>
  //           <strong>Rubric:</strong> ${activeRubric.title}
  //         </div>
  //         ${activeRubric.criteria.map(c => `
  //           <div class="criteria">
  //             <div class="criteria-title">
  //               <span>${c.label} (Max: ${c.maxScore})</span>
  //               <div class="score-box"></div>
  //             </div>
  //             ${c.levels.map(l => `
  //               <div class="level">
  //                 <div class="level-title">${l.label} (${l.minScore}-${l.maxScore})</div>
  //                 <div class="level-desc">${l.description}</div>
  //               </div>
  //             `).join('')}
  //           </div>
  //         `).join('')}
  //         <div style="margin-top: 50px; border-top: 2px solid #000; padding-top: 10px;">
  //           <strong>Total Score: ________ / ${maxTotal}</strong>
  //         </div>
  //         <script>window.print();</script>
  //       </body>
  //     </html>
  //   `;
  //   printWindow.document.write(content);
  //   printWindow.document.close();
  // };

  const visibleGroups = selectedSidebarSectionId
    ? groups.filter((g) => {
      const sId = typeof g.section === 'string' ? g.section : g.section?._id;
      return sId === selectedSidebarSectionId;
    })
    : [];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <ConfirmDialog />
      {/* Group sidebar */}
      <div className="w-full lg:w-72 shrink-0">
        <div className="sticky top-0 pr-2 pb-8">
          <h3 className="text-text font-bold text-base mb-4 px-1">Assigned Blocks</h3>

          {loadingSidebar ? (
            <div className="space-y-3">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-surface border border-muted/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-4 mb-4 lg:flex-col lg:overflow-visible lg:pb-0 scrollbar-hide">
              {sections.map((section) => (
                <button
                  key={section._id}
                  onClick={() => {
                    if (section._id !== selectedSidebarSectionId && !confirmContinueWithDraft()) return;
                    setSelectedSidebarSectionId(section._id);
                  }}
                  className={`whitespace-nowrap lg:whitespace-normal text-left px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 border ${selectedSidebarSectionId === section._id
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                      : 'bg-surface text-text/60 border-muted/40 hover:text-text hover:border-primary/30'
                    }`}
                >
                  <span className="block">{section.block}</span>
                  <span className={`block text-xs mt-1 truncate font-semibold ${selectedSidebarSectionId === section._id ? 'text-white/85' : 'text-text/55'}`}>
                    {getSubjectLabel(section)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1 max-h-[50vh] lg:max-h-[60vh] overflow-y-auto pr-2">
            {loadingSidebar ? (
              <div className="space-y-2 mt-4">
                {Array(4).fill(0).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-surface border border-muted/30 animate-pulse" />
                ))}
              </div>
            ) : sections.length > 0 && selectedSidebarSectionId && (
              <>
                <h4 className="text-[10px] font-extrabold text-text/70 uppercase tracking-widest mb-2 px-1 mt-2">
                  Groups in Block
                </h4>
                {visibleGroups.length > 0 ? (
                  visibleGroups.map((g) => (
                    <button key={g._id} onClick={() => selectGroup(g)}
                      className={`text-left px-4 py-3 rounded-lg transition-all duration-150 border min-w-0 w-full ${selectedGroup?._id === g._id
                          ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                          : 'bg-surface text-text/70 hover:text-text hover:border-primary/30 border-muted/30'
                        }`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm leading-tight truncate">{g.name}</p>
                        {g.isGraded ? (
                          <span className={`text-[9px] font-black uppercase rounded px-1.5 py-0.5 shrink-0 ${selectedGroup?._id === g._id ? 'bg-white/20 text-white' : 'bg-success/10 text-success'}`}>
                            Submitted
                          </span>
                        ) : groupHasDraft(g._id) ? (
                          <span className={`text-[9px] font-black uppercase rounded px-1.5 py-0.5 shrink-0 ${selectedGroup?._id === g._id ? 'bg-white/20 text-white' : 'bg-warning/10 text-warning'}`}>
                            Draft
                          </span>
                        ) : (
                          <span className={`text-[9px] font-black uppercase rounded px-1.5 py-0.5 shrink-0 ${selectedGroup?._id === g._id ? 'bg-white/10 text-white/85' : 'bg-muted/20 text-text/60'}`}>
                            New
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] mt-1 truncate ${selectedGroup?._id === g._id ? 'text-white/85' : 'text-text/70'}`}>
                        {getSubjectLabel(g.section)}
                      </p>
                      <p className={`text-[11px] mt-0.5 truncate ${selectedGroup?._id === g._id ? 'text-white/85' : 'text-text/70'}`}>
                        {formatMemberList(g.members) || 'No members'}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-4 rounded-lg border border-dashed border-muted/40 bg-surface/50 text-center">
                    <p className="text-xs text-text/70 font-medium">No groups added yet</p>
                  </div>
                )}
              </>
            )}
            {!loadingSidebar && !sections.length && <p className="text-text/70 text-sm px-1">No blocks assigned</p>}
          </div>
        </div>
      </div>

      {/* Scoring form */}
      <div className="flex-1 min-w-0">
        {!selectedGroup ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-text/60 text-4xl mb-3">✎</div>
              <p className="text-text/70 text-sm">Select a group from your assigned blocks to start grading</p>
            </div>
          </div>
        ) : loadingRubrics ? (
          <div className="space-y-6">
            <CardSkeleton />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array(4).fill(0).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          </div>
        ) : !visibleRubric && selectedExisting ? (
          <div className="space-y-5">
            <div className="evl-card p-6 border-warning/30 bg-warning/5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-warning mb-2">
                    Submitted Evaluation
                  </p>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-text leading-tight">{selectedGroup.name}</h2>
                  <p className="text-text/70 text-sm mt-2 font-medium">
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs uppercase tracking-wider">{selectedGroup.section?.block}</span>
                    <span className="ml-2">{getSubjectLabel(selectedGroup.section)}</span>
                  </p>
                  <p className="text-text/60 text-sm mt-4 max-w-2xl">
                    The rubric used for this submitted score was deleted, but the saved scores and feedback are still preserved.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {selectedGroup.proposalFile?.path ? (
                      <a href={`/proposal/${selectedGroup._id}`} target="_blank" rel="noreferrer" className="evl-btn-secondary text-xs px-4 py-2">
                        View Proposal
                      </a>
                    ) : (
                      <span className="text-xs font-bold text-text/70">No proposal uploaded.</span>
                    )}
                    {proposalError && <span className="text-xs font-bold text-danger">{proposalError}</span>}
                  </div>
                </div>
                <div className="evl-card px-6 py-5 text-center min-w-[160px] bg-surface">
                  <p className="text-text/70 text-[10px] font-extrabold uppercase tracking-widest mb-1">Submitted Total</p>
                  <p className="text-4xl font-black text-text">{submittedTotal}</p>
                  {submittedAt && (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text/65 mt-2">
                      Updated {submittedAt}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Object.entries(existingScores).map(([key, value]) => (
                <div key={key} className="evl-card p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text/70 mb-2">
                    {formatScoreKey(key)}
                  </p>
                  <p className="text-3xl font-black text-text">{String(value)}</p>
                </div>
              ))}
            </div>

            {comments && (
              <div className="evl-card p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-text/70 mb-2">
                  Panel Feedback
                </p>
                <p className="text-text/70 text-sm leading-relaxed whitespace-pre-wrap">{comments}</p>
              </div>
            )}

            {rubrics.length > 0 && (
              <div className="evl-alert-info">
                A new rubric is available for this subject. Ask the instructor to clear this submitted score first if this group needs to be graded again using the new rubric.
              </div>
            )}
          </div>
        ) : !visibleRubric ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center max-w-md">
              <p className="text-text/70 text-sm font-semibold mb-1">No rubrics available for this subject.</p>
              <p className="text-text/70 text-xs">Please ask the instructor to create a grading rubric before grading this group.</p>
              <div className="mt-5 flex flex-col items-center gap-2">
                {selectedGroup.proposalFile?.path ? (
                  <a href={`/proposal/${selectedGroup._id}`} target="_blank" rel="noreferrer" className="evl-btn-secondary text-xs px-4 py-2">
                    View Proposal
                  </a>
                ) : (
                  <span className="text-xs font-bold text-text/70">No proposal uploaded.</span>
                )}
                {proposalError && <span className="text-xs font-bold text-danger">{proposalError}</span>}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Header with total */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
              <div className="w-full md:flex-1">
                <h2 className="text-2xl md:text-3xl font-extrabold text-text leading-tight">{selectedGroup.name}</h2>
                <p className="text-text/70 text-sm mt-2 font-medium">
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs uppercase tracking-wider">{selectedGroup.section?.block}</span>
                  <span className="ml-2">{getSubjectLabel(selectedGroup.section)}</span>
                  {selectedGroup.members.length ? ` - ${formatMemberList(selectedGroup.members)}` : ''}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {selectedGroup.proposalFile?.path ? (
                    <a href={`/proposal/${selectedGroup._id}`} target="_blank" rel="noreferrer" className="evl-btn-secondary text-xs px-4 py-2">
                      View Proposal
                    </a>
                  ) : (
                    <span className="text-xs font-bold text-text/70">No proposal uploaded.</span>
                  )}
                  {proposalError && <span className="text-xs font-bold text-danger">{proposalError}</span>}
                </div>
                {gradingLocked && (
                  <span className="inline-flex mt-3 px-2.5 py-1 rounded-md bg-danger/10 text-danger text-[10px] font-black uppercase tracking-widest">
                    Read-only mode
                  </span>
                )}

                <div className="mt-6 p-4 bg-surface rounded-xl border border-muted/20">
                  <label className="text-[10px] font-bold text-text/70 uppercase tracking-widest block mb-2">Grading Rubric In Use</label>
                  <div className="rounded-lg border border-muted/40 bg-bg px-4 py-2.5">
                    <p className="text-sm font-bold text-text">{visibleRubric.title}</p>
                    <p className="text-[10px] text-success font-black uppercase tracking-widest mt-1">
                      {gradingLocked && submittedRubric ? 'Rubric used for submitted score' : 'Active rubric selected by instructor'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-auto flex flex-col items-stretch md:items-end gap-3">
                <div className="evl-card px-6 py-5 text-center min-w-[160px] bg-surface border-primary/20 shadow-lg shadow-primary/5">
                  <p className="text-text/70 text-[10px] font-extrabold uppercase tracking-widest mb-1">Current Total</p>
                  <p className="text-4xl font-black text-text">
                    {total}
                    <span className="text-text/60 text-lg font-normal">/{maxTotal}</span>
                  </p>
                  <div className="w-full bg-muted/30 rounded-full h-2 mt-3">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${pct >= 84 ? 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]' :
                          pct >= 64 ? 'bg-primary shadow-[0_0_8px_rgba(59,130,246,0.4)]' :
                            pct >= 44 ? 'bg-warning shadow-[0_0_8px_rgba(234,179,8,0.4)]' :
                              'bg-danger shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                        }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                {/* Safe & Saved and Offline Backup hidden for now
                <div className="flex items-center justify-between md:justify-end gap-4 px-1">
                  <span className="text-[10px] font-bold text-success flex items-center gap-1.5 opacity-80">
                    <span className="w-2 h-2 bg-success rounded-full animate-pulse shadow-[0_0_4px_rgba(34,197,94,0.6)]"></span>
                    Safe & Saved
                  </span>
                  <button 
                    type="button"
                    onClick={_handlePrintRubric}
                    className="text-[10px] font-black text-primary uppercase tracking-widest hover:text-primary/70 transition-colors"
                  >
                    📥 Offline Backup
                  </button>
                </div>
                */}
                <div className="flex flex-col items-stretch md:items-end gap-2 px-1">
                  {selectedExisting ? (
                    <div className="flex flex-col items-start md:items-end gap-1">
                      <span className="text-[10px] font-bold text-success uppercase tracking-widest">
                        Submitted Score: {submittedTotal}/{maxTotal}
                      </span>
                      {submittedAt && (
                        <span className="text-[10px] font-bold text-text/65 uppercase tracking-widest">
                          Last updated {submittedAt}
                        </span>
                      )}
                    </div>
                  ) : hasCurrentDraft ? (
                    <div className="flex flex-wrap items-center justify-start md:justify-end gap-3">
                      <span className="text-[10px] font-bold text-warning uppercase tracking-widest">
                        Draft saved locally{draftSavedAt ? ` at ${formatSavedTime(draftSavedAt)}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={clearCurrentDraft}
                        className="text-[10px] font-black text-danger uppercase tracking-widest hover:underline"
                      >
                        Clear Draft
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-text/60 uppercase tracking-widest">
                      No local draft yet
                    </span>
                  )}
                  {!isOnline && (
                    <span className="text-[10px] font-bold text-danger uppercase tracking-widest">
                      Offline - draft stays local
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Alerts */}
            {!gradingLocked && selectedExisting && activeRubric && getRefId(selectedExisting.rubric) === activeRubric._id && (
              <div className="evl-alert-info mb-4">
                You already submitted scores for this group using this rubric. You can update them below.
              </div>
            )}
            {!gradingLocked && selectedExisting && activeRubric && getRefId(selectedExisting.rubric) !== activeRubric._id && (
              <div className="evl-alert-warning bg-warning/5 border border-warning/20 text-warning mb-4">
                You previously graded this group using a different rubric. Saving now will overwrite those scores with the new rubric's criteria.
              </div>
            )}
            {success && <div className="evl-alert-success mb-4">{success}</div>}
            {error && <div className="evl-alert-error mb-4">{error}</div>}

            {missingCriteria.length > 0 && (
              <div className="evl-alert-warning bg-warning/5 border border-warning/20 text-warning mb-4">
                <p className="font-bold mb-1">Missing Score Fields</p>
                <p className="text-sm opacity-85">{missingCriteria.join(', ')}</p>
              </div>
            )}

            {!isOnline && (
              <div className="evl-alert-warning bg-warning/5 border border-warning/20 text-warning mb-4">
                You are offline. Scores and comments are saved locally and can be submitted when your connection returns.
              </div>
            )}

            {gradingLocked && (
              <div className="evl-alert-error bg-danger/5 border border-danger/20 text-danger mb-6 flex items-center gap-3">
                <span className="text-xl">🔒</span>
                <div>
                  <p className="font-bold">Read-only Mode</p>
                  <p className="text-sm opacity-80">{gradingLockMessage} You can view submitted scores and feedback, but saving is disabled.</p>
                </div>
              </div>
            )}

            {/* Score inputs */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
              {visibleRubric.criteria.map((cat) => (
                <ScoreInput
                  key={cat.key}
                  label={cat.label}
                  max={cat.maxScore}
                  value={scores[cat.key] ?? ''}
                  disabled={!canEditScores}
                  onChange={(v) => {
                    const nextScores = { ...scores, [cat.key]: v };
                    setScores(nextScores);
                    setMissingCriteria((current) => current.filter((label) => label !== cat.label));
                    saveDraft(selectedGroup, activeRubric, nextScores, comments);
                  }}
                  levels={cat.levels.map((l) => ({
                    label: l.label,
                    range: `${l.minScore}–${l.maxScore}`,
                    color: LEVEL_COLORS[l.label] ?? 'bg-gray-100 text-gray-600',
                    description: l.description,
                  }))}
                />
              ))}
            </div>

            {/* Comments / Feedback */}
            <div className="evl-card p-6 mb-6 bg-surface">
              <label className="evl-label flex items-center gap-2 mb-3">
                <span>💬 Panel Feedback & Comments</span>
                <span className="text-[10px] font-normal lowercase bg-muted/40 px-1.5 py-0.5 rounded text-text/70">Optional</span>
              </label>
              <textarea
                value={comments}
                disabled={!canEditScores}
                onChange={(e) => {
                  const nextComments = e.target.value;
                  setComments(nextComments);
                  saveDraft(selectedGroup, activeRubric, scores, nextComments);
                }}
                rows={4}
                className={`evl-input resize-none ${!canEditScores ? 'opacity-70 cursor-not-allowed bg-muted/10' : ''}`}
                placeholder="Write your constructive feedback here for the group... (e.g., Strengths, weaknesses, suggestions for improvement)"
              />
            </div>

            <button
              type="submit"
              disabled={gradingLocked || submitting || !isOnline}
              className={`evl-btn-primary px-8 py-3 ${(gradingLocked || submitting || !isOnline) ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
            >
              {gradingLocked ? 'Read-only Mode' : submitting ? 'Submitting...' : (selectedExisting ? 'Update Scores & Feedback' : 'Submit Scores & Feedback')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}



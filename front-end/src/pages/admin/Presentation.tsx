import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { getApiMessage } from '../../utils/apiError';
import { notify } from '../../utils/notify';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useOperationalScope } from '../../hooks/useOperationalScope';

interface Section {
  _id: string;
  name: string;
  block?: string;
}

interface Group {
  _id: string;
  name: string;
  section?: Section | null;
}

interface StoredSchedule {
  order: string[];
  minutes: number;
  presented: string[];
  updatedAt: string;
}

const DEFAULT_MINUTES = 10;

// Minutes and order belong to the instructor, per subject.
const storageKey = (instructorId: string, subjectId: string) =>
  `presentation_schedule_${instructorId || 'me'}_${subjectId || 'all'}`;

const readStoredSchedule = (instructorId: string, subjectId: string): StoredSchedule | null => {
  try {
    const raw = localStorage.getItem(storageKey(instructorId, subjectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSchedule>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order.filter((id): id is string => typeof id === 'string') : [],
      minutes: Number.isFinite(Number(parsed.minutes)) && Number(parsed.minutes) > 0 ? Number(parsed.minutes) : DEFAULT_MINUTES,
      presented: Array.isArray(parsed.presented) ? parsed.presented.filter((id): id is string => typeof id === 'string') : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
};

const writeStoredSchedule = (instructorId: string, subjectId: string, schedule: Omit<StoredSchedule, 'updatedAt'>) => {
  try {
    localStorage.setItem(
      storageKey(instructorId, subjectId),
      JSON.stringify({ ...schedule, updatedAt: new Date().toISOString() })
    );
  } catch {
    // Storage can be unavailable in restricted browser sessions.
  }
};

/** Fisher-Yates using crypto randomness when available. */
const shuffleIds = (ids: string[]) => {
  const result = ids.slice();
  const random = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] / 4294967296;
    }
    return Math.random();
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/** Keep the saved order for groups that still exist, then append newly registered groups. */
const reconcileOrder = (savedOrder: string[], groups: Group[]) => {
  const existingIds = groups.map((group) => group._id);
  const kept = savedOrder.filter((id) => existingIds.includes(id));
  const added = existingIds.filter((id) => !kept.includes(id));
  return [...kept, ...added];
};

const formatDuration = (totalMinutes: number) => {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '0 min';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
};

export default function Presentation() {
  const { instructorId, subjectId, version } = useOperationalScope();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [groups, setGroups] = useState<Group[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [presented, setPresented] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<number>(DEFAULT_MINUTES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    api.get('/groups')
      .then((res) => {
        if (!active) return;
        const list: Group[] = Array.isArray(res.data) ? res.data : [];
        const stored = readStoredSchedule(instructorId, subjectId);
        setGroups(list);
        setOrder(reconcileOrder(stored?.order ?? [], list));
        setPresented(stored?.presented ?? []);
        setMinutes(stored?.minutes ?? DEFAULT_MINUTES);
      })
      .catch((err: unknown) => {
        if (active) setError(getApiMessage(err, 'Failed to load groups'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [instructorId, subjectId, version]);

  const groupById = useMemo(() => {
    const map = new Map<string, Group>();
    groups.forEach((group) => map.set(group._id, group));
    return map;
  }, [groups]);

  const orderedGroups = useMemo(
    () => order.map((id) => groupById.get(id)).filter((group): group is Group => Boolean(group)),
    [order, groupById]
  );

  const totalMinutes = orderedGroups.length * minutes;

  const save = (nextOrder: string[], nextMinutes: number, nextPresented: string[]) => {
    writeStoredSchedule(instructorId, subjectId, {
      order: nextOrder,
      minutes: nextMinutes,
      presented: nextPresented,
    });
  };

  const handleShuffle = () => {
    if (orderedGroups.length < 2) return;
    const nextOrder = shuffleIds(order);
    setOrder(nextOrder);
    save(nextOrder, minutes, presented);
    notify('Presentation order shuffled.');
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset presentation order?',
      message: 'This restores the registration order of groups and clears the "presented" marks. Your minutes setting is kept.',
      confirmLabel: 'Reset Order',
      danger: true,
    });
    if (!ok) return;
    const nextOrder = groups.map((group) => group._id);
    setOrder(nextOrder);
    setPresented([]);
    save(nextOrder, minutes, []);
    notify('Presentation order reset.');
  };

  const handleMinutesChange = (value: string) => {
    const parsed = Math.floor(Number(value));
    const nextMinutes = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 600) : 0;
    setMinutes(nextMinutes);
    save(order, nextMinutes || DEFAULT_MINUTES, presented);
  };

  const togglePresented = (groupId: string) => {
    const nextPresented = presented.includes(groupId)
      ? presented.filter((id) => id !== groupId)
      : [...presented, groupId];
    setPresented(nextPresented);
    save(order, minutes, nextPresented);
  };

  const handleCopy = async () => {
    const lines = orderedGroups.map((group, index) => {
      const section = group.section?.name ? ` (${group.section.name})` : '';
      return `${index + 1}. ${group.name}${section} — ${minutes} min`;
    });
    const text = [
      'Presentation Order',
      ...lines,
      '',
      `Total: ${formatDuration(totalMinutes)} (${orderedGroups.length} groups × ${minutes} min)`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify('Presentation order copied to clipboard.');
    } catch {
      notify('Could not copy to clipboard on this browser.', { type: 'error' });
    }
  };

  const presentedCount = presented.filter((id) => groupById.has(id)).length;

  return (
    <div>
      <ConfirmDialog />
      <div className="mb-6">
        <h2 className="evl-page-title">Presentation Order</h2>
        <p className="evl-page-subtitle">
          Randomize the presenting sequence for your groups and set the minutes each group gets.
        </p>
      </div>

      {error && (
        <div className="bg-danger/5 border border-danger/20 text-danger text-xs p-3 rounded-xl font-medium mb-4">
          {error}
        </div>
      )}

      <div className="evl-card p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <label htmlFor="minutes-per-group" className="evl-label">
              Minutes per group
            </label>
            <div className="flex items-center gap-2">
              <input
                id="minutes-per-group"
                type="number"
                min={1}
                max={600}
                step={1}
                value={minutes || ''}
                onChange={(e) => handleMinutesChange(e.target.value)}
                className="evl-input w-28"
                disabled={loading}
              />
              <span className="text-xs text-text/60">min</span>
            </div>
            <p className="text-[11px] text-text/50 mt-1">
              Saved for your account on this subject — other instructors keep their own setting.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleShuffle}
              disabled={loading || orderedGroups.length < 2}
              className="evl-btn-primary disabled:opacity-40"
            >
              Shuffle Order
            </button>
            <button type="button" onClick={handleCopy} disabled={loading || !orderedGroups.length} className="evl-btn-secondary disabled:opacity-40">
              Copy Schedule
            </button>
            <button type="button" onClick={handleReset} disabled={loading || !orderedGroups.length} className="evl-btn-secondary disabled:opacity-40">
              Reset Order
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text/70">
          <span><span className="font-bold text-text">{orderedGroups.length}</span> groups</span>
          <span><span className="font-bold text-text">{minutes || 0}</span> min each</span>
          <span>Total <span className="font-bold text-text">{formatDuration(totalMinutes)}</span></span>
          <span><span className="font-bold text-text">{presentedCount}</span> presented</span>
        </div>
      </div>

      <div className="evl-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text">Presenting Sequence</h3>
          {orderedGroups.length > 0 && (
            <span className="text-[11px] text-text/50">Saved automatically</span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-text/60">Loading groups…</p>
        ) : !orderedGroups.length ? (
          <div className="text-sm text-text/70">
            <p>No groups registered for this subject yet.</p>
            <a href="/groups" className="text-primary font-semibold text-xs hover:underline">Go to Groups</a>
          </div>
        ) : (
          <ol className="space-y-2">
            {orderedGroups.map((group, index) => {
              const isPresented = presented.includes(group._id);
              return (
                <li
                  key={group._id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${isPresented ? 'border-success/25 bg-success/5' : 'border-muted/30 bg-bg'}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate ${isPresented ? 'text-text/50 line-through' : 'text-text'}`}>
                      {group.name}
                    </p>
                    <p className="text-[11px] text-text/50">
                      {group.section?.name ? `${group.section.name} · ` : ''}{minutes || 0} min
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-semibold text-text/60 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPresented}
                      onChange={() => togglePresented(group._id)}
                      className="h-4 w-4 rounded border-muted/40 text-success focus:ring-success"
                    />
                    Presented
                  </label>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

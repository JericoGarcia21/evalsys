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

interface StoredOrder {
  order: string[];
  presented: string[];
  updatedAt: string;
}

const DEFAULT_MINUTES = 10;
const ALL_BLOCKS = 'all';
const UNASSIGNED_BLOCK = 'Unassigned';

const blockOf = (group: Group) => (group.section?.block || '').trim() || UNASSIGNED_BLOCK;

// Order and presented marks are kept per instructor, per subject, per block.
const orderKey = (instructorId: string, subjectId: string, block: string) =>
  `presentation_order_${instructorId || 'me'}_${subjectId || 'all'}_${block || ALL_BLOCKS}`;

// Minutes belong to the instructor for the subject, shared across blocks.
const minutesKey = (instructorId: string, subjectId: string) =>
  `presentation_minutes_${instructorId || 'me'}_${subjectId || 'all'}`;

const legacyKey = (instructorId: string, subjectId: string) =>
  `presentation_schedule_${instructorId || 'me'}_${subjectId || 'all'}`;

const readStoredOrder = (instructorId: string, subjectId: string, block: string): StoredOrder | null => {
  try {
    const raw = localStorage.getItem(orderKey(instructorId, subjectId, block));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredOrder>;
      return {
        order: Array.isArray(parsed.order) ? parsed.order.filter((id): id is string => typeof id === 'string') : [],
        presented: Array.isArray(parsed.presented) ? parsed.presented.filter((id): id is string => typeof id === 'string') : [],
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      };
    }
    // Migrate the pre-block-filter record into the "all blocks" view.
    if (block === ALL_BLOCKS) {
      const legacyRaw = localStorage.getItem(legacyKey(instructorId, subjectId));
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as Partial<StoredOrder & { minutes: number }>;
        return {
          order: Array.isArray(legacy.order) ? legacy.order.filter((id): id is string => typeof id === 'string') : [],
          presented: Array.isArray(legacy.presented) ? legacy.presented.filter((id): id is string => typeof id === 'string') : [],
          updatedAt: typeof legacy.updatedAt === 'string' ? legacy.updatedAt : '',
        };
      }
    }
    return null;
  } catch {
    return null;
  }
};

const writeStoredOrder = (instructorId: string, subjectId: string, block: string, data: Omit<StoredOrder, 'updatedAt'>) => {
  try {
    localStorage.setItem(
      orderKey(instructorId, subjectId, block),
      JSON.stringify({ ...data, updatedAt: new Date().toISOString() })
    );
  } catch {
    // Storage can be unavailable in restricted browser sessions.
  }
};

const readStoredMinutes = (instructorId: string, subjectId: string): number | null => {
  try {
    const raw = localStorage.getItem(minutesKey(instructorId, subjectId));
    if (raw) {
      const parsed = Number(JSON.parse(raw));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    const legacyRaw = localStorage.getItem(legacyKey(instructorId, subjectId));
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { minutes?: number };
      const parsed = Number(legacy?.minutes);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const writeStoredMinutes = (instructorId: string, subjectId: string, minutes: number) => {
  try {
    localStorage.setItem(minutesKey(instructorId, subjectId), JSON.stringify(minutes));
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
  const [block, setBlock] = useState<string>(ALL_BLOCKS);
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
        setGroups(Array.isArray(res.data) ? res.data : []);
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

  const blocks = useMemo(() => {
    const seen = new Set<string>();
    groups.forEach((group) => seen.add(blockOf(group)));
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [groups]);

  // Drop a block selection that no longer exists (e.g. after switching subjects).
  useEffect(() => {
    if (block !== ALL_BLOCKS && !blocks.includes(block)) setBlock(ALL_BLOCKS);
  }, [blocks, block]);

  const blockGroups = useMemo(
    () => (block === ALL_BLOCKS ? groups : groups.filter((group) => blockOf(group) === block)),
    [groups, block]
  );

  // Hydrate order, presented marks, and minutes for the current instructor/subject/block.
  useEffect(() => {
    const stored = readStoredOrder(instructorId, subjectId, block);
    setOrder(reconcileOrder(stored?.order ?? [], blockGroups));
    setPresented(stored?.presented ?? []);
    setMinutes(readStoredMinutes(instructorId, subjectId) ?? DEFAULT_MINUTES);
  }, [instructorId, subjectId, block, blockGroups]);

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

  const saveOrder = (nextOrder: string[], nextPresented: string[]) => {
    writeStoredOrder(instructorId, subjectId, block, { order: nextOrder, presented: nextPresented });
  };

  const handleShuffle = () => {
    if (orderedGroups.length < 2) return;
    const nextOrder = shuffleIds(order);
    setOrder(nextOrder);
    saveOrder(nextOrder, presented);
    notify(block === ALL_BLOCKS ? 'Presentation order shuffled.' : `Presentation order shuffled for ${block}.`);
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset presentation order?',
      message: `This restores the registration order${block === ALL_BLOCKS ? '' : ` for ${block}`} and clears the "presented" marks. Your minutes setting is kept.`,
      confirmLabel: 'Reset Order',
      danger: true,
    });
    if (!ok) return;
    const nextOrder = blockGroups.map((group) => group._id);
    setOrder(nextOrder);
    setPresented([]);
    saveOrder(nextOrder, []);
    notify('Presentation order reset.');
  };

  const handleMinutesChange = (value: string) => {
    const parsed = Math.floor(Number(value));
    const nextMinutes = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 600) : 0;
    setMinutes(nextMinutes);
    if (nextMinutes > 0) writeStoredMinutes(instructorId, subjectId, nextMinutes);
  };

  const togglePresented = (groupId: string) => {
    const nextPresented = presented.includes(groupId)
      ? presented.filter((id) => id !== groupId)
      : [...presented, groupId];
    setPresented(nextPresented);
    saveOrder(order, nextPresented);
  };

  const handleCopy = async () => {
    const lines = orderedGroups.map((group, index) => {
      const section = group.section?.name ? ` (${group.section.name})` : '';
      return `${index + 1}. ${group.name}${section} — ${minutes} min`;
    });
    const text = [
      `Presentation Order${block === ALL_BLOCKS ? '' : ` — ${block}`}`,
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
          Randomize the presenting sequence per block and set the minutes each group gets.
        </p>
      </div>

      {error && (
        <div className="bg-danger/5 border border-danger/20 text-danger text-xs p-3 rounded-xl font-medium mb-4">
          {error}
        </div>
      )}

      <div className="evl-card p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div>
              <label htmlFor="block-filter" className="evl-label">Block</label>
              <select
                id="block-filter"
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                className="evl-input w-52"
                disabled={loading || !blocks.length}
              >
                <option value={ALL_BLOCKS}>All blocks ({groups.length})</option>
                {blocks.map((item) => {
                  const count = groups.filter((group) => blockOf(group) === item).length;
                  return <option key={item} value={item}>{item} ({count})</option>;
                })}
              </select>
            </div>

            <div>
              <label htmlFor="minutes-per-group" className="evl-label">Minutes per group</label>
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
            </div>
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

        <p className="text-[11px] text-text/50 mt-3">
          Minutes are saved for your account on this subject — other instructors keep their own setting. Orders are saved per block.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text/70">
          <span><span className="font-bold text-text">{orderedGroups.length}</span> groups</span>
          <span><span className="font-bold text-text">{minutes || 0}</span> min each</span>
          <span>Total <span className="font-bold text-text">{formatDuration(totalMinutes)}</span></span>
          <span><span className="font-bold text-text">{presentedCount}</span> presented</span>
        </div>
      </div>

      <div className="evl-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text">
            Presenting Sequence{block === ALL_BLOCKS ? '' : ` — ${block}`}
          </h3>
          {orderedGroups.length > 0 && (
            <span className="text-[11px] text-text/50">Saved automatically</span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-text/60">Loading groups…</p>
        ) : !orderedGroups.length ? (
          <div className="text-sm text-text/70">
            <p>No groups registered {block === ALL_BLOCKS ? 'for this subject' : `in ${block}`} yet.</p>
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

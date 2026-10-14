import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { getApiMessage } from '../utils/apiError';

interface Analytics {
  scope: 'platform';
  generatedAt: string;
  days: number;
  timezone: string;
  totals: {
    students: number; groups: number; blocks: number;
    instructors: { total: number; active: number; inactive: number };
    panels: { total: number; active: number; inactive: number };
    subjects: { total: number; active: number; inactive: number };
    proposals: { uploaded: number; missing: number; storageMb: number };
    grading: { complete: number; inProgress: number; pending: number; unassigned: number; submittedEvaluations: number };
    registrationLinks: { total: number; open: number };
    archivedEvaluations: number;
  };
  period: { groups: number; students: number };
  registrations: { date: string; groups: number; students: number }[];
  bySubject: { subjectId: string | null; code: string; title: string; groups: number; students: number; complete: number; proposals: number }[];
}

const number = (value: number) => value.toLocaleString();
const shortDate = (value: string) => new Date(value + 'T00:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function PlatformAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<'groups' | 'students'>('groups');
  const [inspectedDay, setInspectedDay] = useState<number | null>(null);
  const gradientId = useId();
  const [requestVersion, setRequestVersion] = useState(0);
  const [response, setResponse] = useState<{ key: string; error?: string } | null>(null);
  const key = days + ':' + requestVersion;
  const loading = response?.key !== key;
  const error = response?.key === key ? response.error : undefined;

  useEffect(() => {
    const controller = new AbortController();
    api.get('/operations/analytics', {
      params: { days }, signal: controller.signal,
      ...(requestVersion ? { headers: { 'Cache-Control': 'no-cache' } } : {}),
    }).then(res => {
      if (controller.signal.aborted) return;
      setData(res.data);
      setResponse({ key });
    }).catch(err => {
      if (!controller.signal.aborted) setResponse({ key, error: getApiMessage(err, 'Unable to load platform analytics.') });
    });
    return () => controller.abort();
  }, [days, requestVersion, key]);

  const totals = data?.totals;
  const metrics = totals ? [
    { label: 'Registered students', value: totals.students, detail: 'Group member entries' },
    { label: 'Registered groups', value: totals.groups, detail: 'Current registrations' },
    { label: 'Instructors', value: totals.instructors.total, detail: number(totals.instructors.active) + ' active · ' + number(totals.instructors.inactive) + ' inactive' },
    { label: 'Panel judges', value: totals.panels.total, detail: number(totals.panels.active) + ' active · ' + number(totals.panels.inactive) + ' inactive' },
  ] : [];
  const statuses = totals ? [
    { label: 'Complete', value: totals.grading.complete, color: 'text-success', note: 'All assigned panel judges submitted' },
    { label: 'In progress', value: totals.grading.inProgress, color: 'text-primary', note: 'Some assigned judges still need to submit' },
    { label: 'Pending', value: totals.grading.pending, color: 'text-warning', note: 'No assigned judge submissions yet' },
    { label: 'Unassigned', value: totals.grading.unassigned, color: 'text-text/30', note: 'No linked panel judge assignments' },
  ] : [];
  const series = data?.registrations || [];
  const maximum = Math.max(4, Math.ceil(Math.max(0, ...series.map(day => day[metric])) / 4) * 4);
  const selectedIndex = Math.min(inspectedDay ?? series.length - 1, Math.max(0, series.length - 1));
  const selectedDay = series[selectedIndex];
  const points = series.map((day, index) => ({
    x: series.length > 1 ? index / (series.length - 1) * 1000 : 500,
    y: 240 - day[metric] / maximum * 240,
  }));
  const line = points.map((point, index) => (index ? 'L' : 'M') + point.x + ',' + point.y).join(' ');
  const area = line ? line + ' L1000,240 L0,240 Z' : '';
  const completionPct = totals?.groups ? Math.round(totals.grading.complete / totals.groups * 100) : 0;
  const circumference = 2 * Math.PI * 72;

  return (
    <section aria-label="Platform analytics" className="min-w-0 max-w-[1500px] mx-auto text-text pb-8">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-7">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">Platform intelligence</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Analytics</h2>
          <p className="text-sm text-text/60 mt-2">Registration, participation and evaluation across your platform.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="analytics-range" className="sr-only">Registration period</label>
          <select id="analytics-range" value={days} onChange={event => { setDays(Number(event.target.value)); setInspectedDay(null); }}
            className="evl-select !w-auto !rounded-md !text-sm" disabled={loading}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
          <button onClick={() => setRequestVersion(version => version + 1)} disabled={loading}
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/70 disabled:opacity-40 py-2">
            <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>
            Refresh analytics
          </button>
        </div>
      </header>

      {loading ? (
        <div role="status" aria-label="Loading analytics" className="animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-muted/30 py-6 gap-6">
            {Array.from({ length: 4 }, (_, index) => <div key={index}><div className="h-3 w-24 bg-muted/20" /><div className="h-10 w-20 bg-muted/20 mt-4" /></div>)}
          </div>
          <div className="h-72 bg-muted/10 mt-10" />
        </div>
      ) : error ? (
        <div role="alert" className="border-l-2 border-danger pl-5 py-4">
          <p className="text-danger mb-3">{error}</p><button onClick={() => setRequestVersion(version => version + 1)} className="text-sm font-bold text-primary">Try again</button>
        </div>
      ) : totals && data ? (
        <>
          <div className="flex flex-wrap justify-between gap-2 text-[11px] text-text/50 mb-3">
            <span>All instructors · All subjects · Current records</span>
            <span>Updated {new Date(data.generatedAt).toLocaleString()}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-muted/40">
            {metrics.map((item, index) => (
              <article key={item.label} aria-label={item.label}
                className={'min-w-0 py-5 sm:py-6 px-3 sm:px-5 ' + (index % 2 ? 'border-l border-muted/30 ' : '') + (index > 1 ? 'border-t lg:border-t-0 ' : '') + (index === 2 ? 'lg:border-l lg:border-muted/30' : '')}>
                <h3 className="text-xs sm:text-sm font-medium text-text/60">{item.label}</h3>
                <p className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums mt-3">{number(item.value)}</p>
                <p className="text-[11px] text-text/50 mt-2">{item.detail}</p>
              </article>
            ))}
          </div>
          <dl className="flex flex-wrap gap-x-7 gap-y-3 py-5 text-sm border-b border-muted/30">
            <div className="flex gap-2"><dt className="text-text/55">Subjects</dt><dd className="font-semibold tabular-nums">{number(totals.subjects.total)}</dd></div>
            <div className="flex gap-2"><dt className="text-text/55">Blocks</dt><dd className="font-semibold tabular-nums">{number(totals.blocks)}</dd></div>
            <div className="flex gap-2"><dt className="text-text/55">Proposal uploads</dt><dd className="font-semibold tabular-nums">{number(totals.proposals.uploaded)}<span className="text-text/40 font-normal"> / {number(totals.groups)}</span></dd></div>
            <div className="flex gap-2"><dt className="text-text/55">Submitted evaluations</dt><dd className="font-semibold tabular-nums">{number(totals.grading.submittedEvaluations)}</dd></div>
          </dl>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.75fr)_minmax(280px,1fr)] border-b border-muted/30">
            <section aria-label="Registration trends" className="min-w-0 py-7 xl:pr-8">
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div><h3 className="text-lg font-semibold tracking-tight">Registration activity</h3><p className="text-xs text-text/50 mt-1">{days} calendar days · UTC daily totals</p></div>
                <div className="flex gap-4 border-b border-muted/30">
                  <button aria-pressed={metric === 'groups'} onClick={() => setMetric('groups')}
                    className={'text-xs font-semibold pb-2 border-b-2 -mb-px ' + (metric === 'groups' ? 'text-primary border-primary' : 'text-text/50 border-transparent')}>Groups</button>
                  <button aria-pressed={metric === 'students'} onClick={() => setMetric('students')}
                    className={'text-xs font-semibold pb-2 border-b-2 -mb-px ' + (metric === 'students' ? 'text-primary border-primary' : 'text-text/50 border-transparent')}>Student entries</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-7 mt-5">
                <p className="text-xs text-text/55"><strong className="block text-2xl font-semibold text-text tabular-nums">{number(data.period.groups)}</strong>new groups in period</p>
                <p className="text-xs text-text/55"><strong className="block text-2xl font-semibold text-text tabular-nums">{number(data.period.students)}</strong>member entries in those groups</p>
              </div>
              <div className="relative mt-7 pl-8">
                <div aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-7 text-[10px] text-text/45 tabular-nums">
                  {[maximum, maximum * 0.75, maximum * 0.5, maximum * 0.25, 0].map((value, index) =>
                    <span key={index} className="absolute right-2 -translate-y-1/2" style={{ top: index * 25 + '%' }}>{number(value)}</span>)}
                </div>
                <svg role="img" aria-label={'Daily ' + (metric === 'groups' ? 'group registrations' : 'student entries in newly registered groups') + ' over the last ' + days + ' days'}
                  viewBox="0 0 1000 240" preserveAspectRatio="none" className="w-full h-56 sm:h-64 overflow-visible text-primary"
                  onPointerMove={event => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                    setInspectedDay(Math.round(fraction * (series.length - 1)));
                  }}>
                  <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.18" /><stop offset="100%" stopColor="currentColor" stopOpacity="0.015" /></linearGradient></defs>
                  {[0, 60, 120, 180, 240].map(y => <line key={y} x1="0" y1={y} x2="1000" y2={y} stroke="currentColor" strokeOpacity="0.1" vectorEffect="non-scaling-stroke" />)}
                  <path d={area} fill={'url(#' + gradientId + ')'} />
                  <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  {points[selectedIndex] && <line x1={points[selectedIndex].x} y1="0" x2={points[selectedIndex].x} y2="240" stroke="currentColor" strokeOpacity="0.4" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
                </svg>
              </div>
              {series.length > 0 && <div className="flex justify-between text-[11px] text-text/45 mt-3 pl-8"><span>{shortDate(series[0].date)}</span><span>{shortDate(series[Math.floor((series.length - 1) / 2)].date)}</span><span>{shortDate(series[series.length - 1].date)}</span></div>}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-5 text-xs">
                <p className="text-text/60">{selectedDay && <><span className="font-semibold text-text">{shortDate(selectedDay.date)}</span><span className="mx-2 text-text/30">/</span><strong className="text-primary tabular-nums">{number(selectedDay[metric])}</strong> {metric === 'groups' ? 'groups' : 'student entries'}</>}</p>
                <label className="flex items-center gap-2 text-text/50">Explore days<input aria-label="Inspect registration day" type="range" min={0} max={Math.max(0, series.length - 1)} value={selectedIndex} onChange={event => setInspectedDay(Number(event.target.value))} className="w-24 accent-primary" /></label>
              </div>
              {data.period.groups === 0 && <p className="text-sm text-text/50 mt-4">No group registrations in this period.</p>}
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold text-primary">View daily totals</summary>
                <div className="max-h-64 overflow-auto mt-3">
                  <table className="w-full text-xs text-left">
                    <thead><tr className="text-text/50"><th scope="col" className="py-2">Date (UTC)</th><th scope="col" className="py-2 text-right">Groups</th><th scope="col" className="py-2 text-right">Student entries</th></tr></thead>
                    <tbody>{series.map(day => <tr key={day.date} className="border-t border-muted/20"><th scope="row" className="py-2 font-normal">{day.date}</th><td className="text-right tabular-nums">{number(day.groups)}</td><td className="text-right tabular-nums">{number(day.students)}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </section>

            <section aria-label="Grading progress" className="min-w-0 py-7 xl:pl-8 border-t xl:border-t-0 xl:border-l border-muted/30">
              <h3 className="text-lg font-semibold tracking-tight">Evaluation progress</h3>
              <p className="text-xs text-text/50 mt-1">Submission status of {number(totals.groups)} current groups</p>
              <div className="relative w-44 h-44 mx-auto my-6">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" role="img" aria-label={completionPct + '% of groups fully evaluated'}>
                  <circle cx="100" cy="100" r="72" fill="none" stroke="currentColor" strokeWidth="19" className="text-muted/20" />
                  {statuses.map((status, index) => {
                    const portion = totals.groups ? status.value / totals.groups : 0;
                    const prior = totals.groups ? statuses.slice(0, index).reduce((sum, item) => sum + item.value, 0) / totals.groups : 0;
                    return <circle key={status.label} cx="100" cy="100" r="72" fill="none" stroke="currentColor" strokeWidth="19" className={status.color}
                      strokeDasharray={portion * circumference + ' ' + circumference} strokeDashoffset={-prior * circumference}><title>{status.label}: {number(status.value)} groups</title></circle>;
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-3xl font-semibold tracking-tight tabular-nums">{completionPct}%</span><span className="text-xs text-text/50 mt-1">fully evaluated</span></div>
              </div>
              <div className="space-y-3">
                {statuses.map(status => <div key={status.label} className="flex items-center justify-between gap-3 text-sm" title={status.note}>
                  <span className="flex items-center gap-2"><span className={'w-2 h-2 rounded-full bg-current ' + status.color} /><span className="text-text/65">{status.label}</span></span>
                  <span className="flex gap-4 tabular-nums"><strong className="font-semibold">{number(status.value)}</strong><span className="w-10 text-right text-xs text-text/40">{totals.groups ? Math.round(status.value / totals.groups * 100) : 0}%</span></span>
                </div>)}
              </div>
              {totals.grading.unassigned > 0 && <p className="text-xs text-text/60 mt-5 border-t border-muted/30 pt-4">{number(totals.grading.unassigned)} groups still need panel assignments.</p>}
            </section>
          </div>

          <section aria-label="Subject breakdown" className="min-w-0 py-7 border-b border-muted/30">
            <div className="flex flex-wrap justify-between items-end gap-2 mb-5"><div><h3 className="text-lg font-semibold tracking-tight">Subject performance</h3><p className="text-xs text-text/50 mt-1">Top 10 subjects by registered groups</p></div><span className="text-[11px] text-text/45">Current totals · All subjects</span></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm text-left">
                <thead><tr className="border-b border-muted/40 text-[10px] uppercase tracking-wider text-text/45"><th scope="col" className="pb-3 font-semibold">Subject</th><th scope="col" className="pb-3 font-semibold text-right">Groups</th><th scope="col" className="pb-3 font-semibold text-right">Student entries</th><th scope="col" className="pb-3 font-semibold text-right">Fully evaluated</th><th scope="col" className="pb-3 font-semibold text-right">Proposals</th></tr></thead>
                <tbody>{data.bySubject.map((subject, index) => (
                  <tr key={subject.subjectId || 'unlinked'} className="border-b border-muted/20 hover:bg-primary/[0.025]">
                    <th scope="row" className="py-4 pr-5 font-normal"><div className="flex items-center gap-4"><span className="text-xs text-text/30 tabular-nums">{String(index + 1).padStart(2, '0')}</span><span><span className="font-semibold">{subject.code}</span><span className="block text-xs text-text/50 mt-0.5">{subject.title}</span></span></div></th>
                    <td className="py-4 text-right font-semibold tabular-nums">{number(subject.groups)}</td>
                    <td className="py-4 text-right tabular-nums text-text/65">{number(subject.students)}</td>
                    <td className="py-4 text-right"><span className="font-semibold tabular-nums">{number(subject.complete)}</span><span className="text-xs text-text/40 ml-2">({subject.groups ? Math.round(subject.complete / subject.groups * 100) : 0}%)</span></td>
                    <td className="py-4 text-right tabular-nums text-text/65">{number(subject.proposals)}<span className="text-text/35"> / {number(subject.groups)}</span></td>
                  </tr>
                ))}</tbody>
              </table>
              {data.bySubject.length === 0 && <p className="text-sm text-text/50 py-5">No group registrations yet.</p>}
            </div>
          </section>

          <section aria-label="Platform operations" className="py-6 border-b border-muted/30">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-text/45 mb-4">Platform operations</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div><dt className="text-sm text-text/60">Registration links</dt><dd className="text-xl font-semibold tabular-nums mt-1">{number(totals.registrationLinks.open)}<span className="text-xs text-text/40 font-normal ml-2">enabled & unexpired</span></dd><p className="text-xs text-text/45 mt-1">{number(totals.registrationLinks.total)} links in total</p></div>
              <div><dt className="text-sm text-text/60">Linked proposal storage</dt><dd className="text-xl font-semibold tabular-nums mt-1">{number(totals.proposals.storageMb)}<span className="text-xs text-text/40 font-normal ml-2">MB</span></dd><p className="text-xs text-text/45 mt-1">{number(totals.proposals.missing)} groups without a proposal</p></div>
              <div><dt className="text-sm text-text/60">Archived evaluations</dt><dd className="text-xl font-semibold tabular-nums mt-1">{number(totals.archivedEvaluations)}</dd><Link to="/legacy-data" className="text-xs text-primary hover:underline inline-block mt-1">View archive →</Link></div>
            </dl>
          </section>
          <details className="mt-5 text-xs text-text/50">
            <summary className="cursor-pointer hover:text-text">How these numbers are counted</summary>
            <div className="space-y-2 mt-3 leading-relaxed max-w-3xl">
              <p>Student counts are group member entries. A student listed in multiple groups or subjects is counted each time.</p>
              <p>Daily student entries use the current roster of groups created on that date. Dates are grouped in UTC. The date filter affects registration activity; platform totals use all current records.</p>
              <p>A group is fully evaluated when all existing panel judges assigned through its block or group have submitted. Archived evaluations are reported separately.</p>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}

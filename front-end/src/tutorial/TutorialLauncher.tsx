import { useTutorial } from './TutorialContext';
export default function TutorialLauncher({ className = 'evl-btn-secondary !py-2 !text-xs' }: { className?: string }) {
  const { start, available, active } = useTutorial();
  if (!available) return null;
  return <button type="button" onClick={start} disabled={active} className={className} data-tutorial="launcher">Start tutorial</button>;
}

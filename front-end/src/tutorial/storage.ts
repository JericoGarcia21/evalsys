import type { TutorialRole } from './tours';
export interface TutorialRecord { completed?: boolean; dismissed?: boolean; step?: number; }
const prefix = 'evalsys_tutorial_v1';
export const tutorialKey = (identity: string, role: TutorialRole) => prefix + ':' + role + ':' + identity;
export function readTutorial(key: string): TutorialRecord {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function writeTutorial(key: string, record: TutorialRecord) {
  try { localStorage.setItem(key, JSON.stringify({ ...readTutorial(key), ...record })); } catch { /* Guide still works without storage. */ }
}

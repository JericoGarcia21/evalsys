import { createContext, useContext } from 'react';
export const TutorialContext = createContext<{ start: () => void; available: boolean; active: boolean }>({ start: () => {}, available: false, active: false });
export const useTutorial = () => useContext(TutorialContext);

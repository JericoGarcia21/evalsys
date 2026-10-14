import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChatContext, type ChatRoom } from './chat-context';
import { useAuth } from './useAuth';
import api from '../services/api';
import { getApiMessage, getApiStatus } from '../utils/apiError';

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id || user?._id || '';
  const actor = user?.role + ':' + userId;
  const enabled = Boolean(userId && ['admin', 'panel'].includes(user?.role || '') && !user?.mustChangePassword);
  const [result, setResult] = useState<{ actor: string; rooms: ChatRoom[]; error: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const refreshRooms = useCallback(async () => {
    if (!enabled || document.visibilityState !== 'visible' || !navigator.onLine) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await api.get('/chat/rooms', { signal: controller.signal });
      if (!controller.signal.aborted) setResult({ actor, rooms: response.data.rooms, error: '' });
    } catch (error) {
      if (controller.signal.aborted) return;
      const forbidden = getApiStatus(error) === 403;
      setResult(current => ({
        actor, rooms: !forbidden && current?.actor === actor ? current.rooms : [],
        error: getApiMessage(error, 'Chat is unavailable. Try again when your connection returns.'),
      }));
    }
  }, [actor, enabled]);
  useEffect(() => {
    void refreshRooms();
    const timer = window.setInterval(() => { void refreshRooms(); }, 30000);
    const reload = () => { void refreshRooms(); };
    document.addEventListener('visibilitychange', reload);
    window.addEventListener('online', reload);
    return () => {
      request.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', reload);
      window.removeEventListener('online', reload);
    };
  }, [refreshRooms]);
  const current = enabled && result?.actor === actor ? result : null;
  return <ChatContext.Provider value={{
    rooms: current?.rooms || [], loading: enabled && !current,
    error: current?.error || '', refreshRooms,
  }}>{children}</ChatContext.Provider>;
}

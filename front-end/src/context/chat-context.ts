import { createContext } from 'react';

export interface ChatRoom {
  _id: string; name: string;
  subject?: { _id: string; code: string; title: string };
  instructor: { _id: string; name: string };
  participants: { _id: string; name: string; role: 'admin' | 'panel' }[];
  unread: number; lastMessageAt?: string | null;
}
export const ChatContext = createContext<{
  rooms: ChatRoom[]; loading: boolean; error: string; refreshRooms: () => Promise<void>;
}>({ rooms: [], loading: false, error: '', refreshRooms: async () => {} });

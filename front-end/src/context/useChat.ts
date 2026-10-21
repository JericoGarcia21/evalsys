import { useContext } from 'react';
import { ChatContext } from './chat-context';
import { useAuth } from './useAuth';
import { useOperationalScope } from '../hooks/useOperationalScope';
export const useChat = () => useContext(ChatContext);

// The instructor workspace owns subject selection. A saved chat preference must
// never override it or fall back to a different subject's conversation.
export const useSubjectChat = () => {
  const chat = useChat();
  const { user } = useAuth();
  const { subjectId } = useOperationalScope();
  const followsSubject = user?.role === 'admin';
  return {
    ...chat,
    rooms: followsSubject ? chat.rooms.filter(room => Boolean(subjectId) && room.subject?._id === subjectId) : chat.rooms,
    followsSubject,
    subjectId: followsSubject ? subjectId : '',
  };
};

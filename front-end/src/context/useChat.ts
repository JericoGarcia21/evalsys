import { useContext } from 'react';
import { ChatContext } from './chat-context';
export const useChat = () => useContext(ChatContext);

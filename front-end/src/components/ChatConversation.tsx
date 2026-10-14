import { useCallback, useId, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { useChat } from '../context/useChat';
import type { ChatRoom } from '../context/chat-context';
import api from '../services/api';
import { getApiMessage, getApiStatus } from '../utils/apiError';

interface Message {
  _id: string; body: string; createdAt: string;
  sender: { id: string; name: string; role: 'admin' | 'panel' };
}
const mergeMessages = (current: Message[], incoming: Message[]) =>
  Array.from(new Map([...current, ...incoming].map(message => [message._id, message])).values()).sort((a, b) => a._id.localeCompare(b._id));
const messageTime = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const roleName = (role: string) => role === 'admin' ? 'Instructor' : 'Panel';
const messageId = () => crypto.randomUUID();
const draftKey = (actor: string, room: string) => 'evalsys_chat_draft:' + actor + ':' + room;
const loadDraft = (key: string) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (typeof saved?.body === 'string' && typeof saved?.clientMessageId === 'string') return saved;
  } catch { /* Ignore an invalid local draft. */ }
  return { body: '', clientMessageId: messageId() };
};

export default function ChatConversation({ room, compact = false }: { room: ChatRoom; compact?: boolean }) {
  const { user } = useAuth();
  const inputId = useId();
  const { refreshRooms } = useChat();
  const userId = user?.id || user?._id || '';
  const actor = user?.role + ':' + userId;
  const storageKey = draftKey(actor, room._id);
  const [draft, setDraft] = useState<{ body: string; clientMessageId: string }>(() => loadDraft(storageKey));
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const cursor = useRef('');
  const readCursor = useRef('');
  const loading = useRef(false);
  const firstLoad = useRef(true);
  const lifetime = useRef(new AbortController());
  const scroller = useRef<HTMLDivElement | null>(null);
  const nearBottom = useRef(true);
  const denied = useRef(false);
  const url = '/chat/rooms/' + room._id;

  const handleFailure = useCallback((err: unknown) => {
    if (getApiStatus(err) === 403 || getApiStatus(err) === 404) {
      denied.current = true;
      setBlocked(true);
      setMessages([]);
      void refreshRooms();
    }
    setError(getApiMessage(err, 'Connection interrupted. Your draft is saved; try again.'));
  }, [refreshRooms]);

  const loadMessages = useCallback(async () => {
    if (loading.current || document.visibilityState !== 'visible' || !navigator.onLine) return;
    loading.current = true;
    const signal = lifetime.current.signal;
    try {
      for (let batch = 0; batch < 5; batch += 1) {
        const result = await api.get(url + '/messages', { params: { after: cursor.current || undefined }, signal });
        if (signal.aborted) return;
        if (firstLoad.current) {
          setHasMore(result.data.hasMore);
          firstLoad.current = false;
        }
        const incoming: Message[] = result.data.messages;
        if (incoming.length) {
          cursor.current = incoming[incoming.length - 1]._id;
          setMessages(current => mergeMessages(current, incoming));
        }
        denied.current = false;
        setBlocked(false);
        setLoaded(true);
        setError('');
        if (!result.data.hasMoreNew) break;
      }
      if (cursor.current && readCursor.current !== cursor.current && nearBottom.current && document.hasFocus() && document.visibilityState === 'visible') {
        await api.post(url + '/read', { messageId: cursor.current }, { signal });
        if (signal.aborted) return;
        readCursor.current = cursor.current;
        void refreshRooms();
      }
    } catch (err) {
      if (!signal.aborted) { setLoaded(true); handleFailure(err); }
    } finally { loading.current = false; }
  }, [url, handleFailure, refreshRooms]);

  useEffect(() => {
    lifetime.current = new AbortController();
    void loadMessages();
    const timer = window.setInterval(() => { void loadMessages(); }, 10000);
    const online = () => { setIsOnline(true); void loadMessages(); };
    const offline = () => setIsOnline(false);
    const visible = () => { void loadMessages(); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      lifetime.current.abort();
      loading.current = false;
      window.clearInterval(timer);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [loadMessages]);

  const newestId = messages[messages.length - 1]?._id;
  useEffect(() => {
    if (nearBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [newestId]);

  const updateDraft = (body: string) => {
    const next = { body, clientMessageId: messageId() };
    setDraft(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Sending still works if storage is full. */ }
  };
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (sending || blocked || !isOnline || !draft.body.trim()) return;
    const signal = lifetime.current.signal;
    setSending(true);
    setError('');
    try {
      const response = await api.post(url + '/messages', { body: draft.body, clientMessageId: draft.clientMessageId }, { signal });
      if (signal.aborted || denied.current) return;
      nearBottom.current = true;
      setMessages(current => mergeMessages(current, [response.data]));
      setDraft({ body: '', clientMessageId: messageId() });
      try { localStorage.removeItem(storageKey); } catch { /* Ignore unavailable storage. */ }
      void loadMessages();
      void refreshRooms();
    } catch (err) { if (!signal.aborted) handleFailure(err); }
    finally { if (!signal.aborted) setSending(false); }
  };
  const loadOlder = async () => {
    const first = messages[0];
    if (!first || olderLoading || blocked) return;
    const previousHeight = scroller.current?.scrollHeight || 0;
    const previousTop = scroller.current?.scrollTop || 0;
    const signal = lifetime.current.signal;
    setOlderLoading(true);
    try {
      const response = await api.get(url + '/messages', { params: { before: first._id }, signal });
      if (signal.aborted || denied.current) return;
      nearBottom.current = false;
      setMessages(current => mergeMessages(current, response.data.messages));
      setHasMore(response.data.hasMore);
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop = previousTop + scroller.current.scrollHeight - previousHeight;
      });
    } catch (err) { if (!signal.aborted) handleFailure(err); }
    finally { if (!signal.aborted) setOlderLoading(false); }
  };

  return (
    <section aria-label="Conversation" className="min-w-0 flex flex-col h-full min-h-0">
      <header className={"border-b border-muted/30 shrink-0 " + (compact ? "px-4 py-2 max-h-[35%] overflow-y-auto" : "p-4")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {!compact && <div>
            <h3 className="text-base font-bold text-text">General Panel Chat</h3>
            <p className="text-xs text-primary font-semibold mt-1">{room.subject?.code} · {room.subject?.title}</p>
            <p className="text-xs text-text/55 mt-1">Instructor: {room.instructor.name}</p>
          </div>}
          <details className="w-full min-w-0 text-xs">
            <summary className="cursor-pointer text-primary font-semibold">{room.participants.length} participants{compact && <span className="float-right text-text/55 font-normal">{room.subject?.code}</span>}</summary>
            <ul className="mt-2 w-full max-h-32 overflow-auto border border-muted/30 bg-surface rounded-lg p-3">
              {room.participants.map(person => <li key={person.role + person._id} className="py-1 text-text [overflow-wrap:anywhere]"><span className="font-semibold">{person.name}</span><span className="block text-text/55">{roleName(person.role)}</span></li>)}
            </ul>
          </details>
        </div>
        {!compact && <p className="text-[11px] text-text/50 mt-2">Only your subject's instructor and assigned panel judges can read this chat. Messages stay separate from student feedback.</p>}
      </header>
      <div ref={scroller} onScroll={() => {
        const element = scroller.current;
        if (element) {
          const wasNear = nearBottom.current;
          nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
          setShowLatest(!nearBottom.current);
          if (!wasNear && nearBottom.current) void loadMessages();
        }
      }} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {hasMore && <div className="text-center"><button onClick={() => { void loadOlder(); }} disabled={olderLoading} className="text-xs font-bold text-primary">{olderLoading ? 'Loading...' : 'Load earlier messages'}</button></div>}
        {!loaded && <p role="status" className="text-center text-sm text-text/60 py-8">Loading messages...</p>}
        {loaded && !messages.length && !error && <div className="text-center py-10"><h4 className="text-text font-bold">General Panel Chat</h4><p className="text-sm text-text/55 mt-2">Discuss presentations and coordinate your evaluation with the team.</p></div>}
        {messages.map((message, index) => {
          const own = message.sender.id === userId && message.sender.role === user?.role;
          const date = new Date(message.createdAt).toLocaleDateString();
          const previousDate = index ? new Date(messages[index - 1].createdAt).toLocaleDateString() : '';
          return <div key={message._id}>
            {date !== previousDate && <p className="text-center text-[10px] text-text/40 mb-4">{date}</p>}
            <article aria-label={'Message from ' + message.sender.name} className={'flex flex-col ' + (own ? 'items-end' : 'items-start')}>
              <p className="text-[10px] text-text/55 mb-1">{own ? 'You' : message.sender.name + ' · ' + roleName(message.sender.role)}</p>
              <p className={'max-w-[88%] sm:max-w-[80%] whitespace-pre-wrap [overflow-wrap:anywhere] px-3.5 py-2.5 rounded-xl text-sm ' + (own ? 'bg-primary text-white rounded-tr-sm' : 'bg-muted/15 text-text rounded-tl-sm')}>{message.body}</p>
              <time dateTime={message.createdAt} className="text-[10px] text-text/40 mt-1">{messageTime(message.createdAt)}</time>
            </article>
          </div>;
        })}
      </div>
      {showLatest && <button onClick={() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; nearBottom.current = true; setShowLatest(false); void loadMessages(); }} className="text-xs font-semibold text-primary py-2 border-t border-muted/20">Jump to latest messages</button>}
      <form onSubmit={event => { void send(event); }} className="p-4 border-t border-muted/30 shrink-0">
        {error && <p role="alert" className="text-xs text-danger mb-2">{error} <button type="button" onClick={() => { void loadMessages(); }} className="font-bold underline">Retry messages</button></p>}
        {!isOnline && <p role="status" className="text-xs text-warning mb-2">You are offline. Your message draft stays on this browser.</p>}
        <label htmlFor={inputId} className="sr-only">Message</label>
        <textarea id={inputId} value={draft.body} onChange={event => updateDraft(event.target.value)} rows={2} maxLength={2000} disabled={sending || blocked}
          placeholder={blocked ? 'This conversation is no longer available.' : 'Message your panel team...'} className="evl-input resize-none !text-sm"
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
          }} />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <p className="text-[10px] text-text/45">Enter to send · Shift+Enter for a new line · {draft.body.length}/2,000</p>
          <button type="submit" disabled={sending || blocked || !isOnline || !draft.body.trim()} className="evl-btn-primary ml-auto !px-5 !py-2 !text-xs">{sending ? 'Sending...' : 'Send message'}</button>
        </div>
      </form>
    </section>
  );
}

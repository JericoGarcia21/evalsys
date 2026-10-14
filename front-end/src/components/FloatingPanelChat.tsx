import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useChat } from '../context/useChat';
import ChatConversation from './ChatConversation';

export default function FloatingPanelChat() {
  const { user } = useAuth();
  const { rooms, loading, error, refreshRooms } = useChat();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState('');
  const launcher = useRef<HTMLButtonElement>(null);
  const storageKey = 'evalsys_chat_team:' + user?.role + ':' + (user?.id || user?._id || '');
  let saved = '';
  try { saved = localStorage.getItem(storageKey) || ''; } catch { /* Optional preference. */ }
  const selected = rooms.find(room => room._id === team) || rooms.find(room => room._id === saved) || rooms[0];
  const unread = rooms.reduce((total, room) => total + room.unread, 0);
  if (!user || !['admin', 'panel'].includes(user.role) || user.mustChangePassword || pathname === '/chat') return null;
  const close = () => { setOpen(false); launcher.current?.focus(); };

  return <div data-tutorial="floating-panel-chat" className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
    {open && <div role="dialog" aria-label="Floating panel chat" aria-modal="false"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}
      className="absolute bottom-16 right-0 w-[390px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100dvh-7rem)] flex flex-col overflow-hidden rounded-2xl border border-muted/30 bg-surface shadow-2xl">
      <header className="flex items-center gap-2 px-4 py-3 bg-primary text-white shrink-0">
        <div className="flex-1"><h2 className="text-sm font-bold">Panel Chat</h2><p className="text-[11px] text-white/75">Private instructor & panel team</p></div>
        <Link to={'/chat' + (selected ? '?room=' + encodeURIComponent(selected._id) : '')} onClick={() => setOpen(false)} aria-label="Expand panel chat" className="p-2 rounded-lg hover:bg-white/15">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3h7v7M21 3l-8 8M10 21H3v-7M3 21l8-8"/></svg>
        </Link>
        <button type="button" onClick={close} aria-label="Minimize panel chat" className="p-2 rounded-lg hover:bg-white/15">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
        </button>
      </header>
      {rooms.length > 1 && <div className="px-3 pt-3 shrink-0">
        <label htmlFor="floating-chat-team" className="sr-only">Panel team</label>
        <select id="floating-chat-team" className="evl-select !text-xs" value={selected?._id || ''} onChange={event => {
          setTeam(event.target.value);
          try { localStorage.setItem(storageKey, event.target.value); } catch { /* Optional preference. */ }
        }}>{rooms.map(room => <option key={room._id} value={room._id}>{room.subject?.code} · {room.subject?.title}{room.unread ? ' (' + room.unread + ' unread)' : ''}</option>)}</select>
      </div>}
      {error && <p role="alert" className="p-3 text-xs text-danger">{error} <button onClick={() => { void refreshRooms(); }} className="underline font-bold">Retry chat</button></p>}
      <div className="flex-1 min-h-0">
        {selected ? <ChatConversation key={selected._id} room={selected} compact /> :
          <p role="status" className="p-6 text-sm text-text/60">{loading ? 'Preparing your panel chat...' : 'Your chat will appear when a panel team is assigned.'}</p>}
      </div>
    </div>}
    <button ref={launcher} type="button" aria-label={open ? 'Minimize panel chat' : 'Open panel chat'} aria-expanded={open}
      onClick={() => { if (open) close(); else { setOpen(true); void refreshRooms(); } }}
      className="relative flex items-center justify-center w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01" strokeWidth="3" strokeLinecap="round"/></svg>
      {!!unread && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center border-2 border-surface">{unread > 99 ? '99+' : unread}<span className="sr-only"> unread messages</span></span>}
    </button>
  </div>;
}

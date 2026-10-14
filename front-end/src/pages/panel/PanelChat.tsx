import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useChat } from '../../context/useChat';
import ChatConversation from '../../components/ChatConversation';

export default function PanelChat() {
  const { user } = useAuth();
  const { rooms, loading, error, refreshRooms } = useChat();
  const [params, setParams] = useSearchParams();
  const userId = user?.id || user?._id || '';
  const savedRoomKey = 'evalsys_chat_team:' + user?.role + ':' + userId;
  const savedRoom = localStorage.getItem(savedRoomKey);
  const selected = rooms.find(room => room._id === params.get('room')) || rooms.find(room => room._id === savedRoom) || rooms[0];
  const lastGroup = user?.role === 'panel' ? localStorage.getItem('grading_last_selected_group_' + userId) : null;
  const returnPath = user?.role === 'panel' ? '/grade' + (lastGroup ? '?groupId=' + encodeURIComponent(lastGroup) : '') : '/groups';
  const chooseTeam = (roomId: string) => {
    try { localStorage.setItem(savedRoomKey, roomId); } catch { /* Team selection still works without storage. */ }
    setParams({ room: roomId });
  };

  return (
    <div data-tutorial="panel-chat" className="min-w-0 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div><h2 className="evl-page-title">Panel Chat</h2><p className="evl-page-subtitle">A private general conversation for your instructor and assigned panel team.</p></div>
        <Link to={returnPath} className="evl-btn-secondary">{user?.role === 'panel' ? 'Back to grading' : 'Back to groups'}</Link>
      </div>
      {error && <div role="alert" className="text-sm text-danger mb-4 flex flex-wrap items-center gap-3">{error}<button className="font-bold underline" onClick={() => { void refreshRooms(); }}>Retry chat</button></div>}
      {rooms.length > 1 && (
        <div className="mb-4 max-w-md">
          <label htmlFor="chat-team" className="evl-label">Panel team</label>
          <select id="chat-team" className="evl-select" value={selected?._id || ''} onChange={event => chooseTeam(event.target.value)}>
            {rooms.map(room => <option key={room._id} value={room._id}>{room.subject?.code} · {room.subject?.title}{room.unread ? ' (' + room.unread + ' unread)' : ''}</option>)}
          </select>
        </div>
      )}
      <div className="min-h-[540px] h-[calc(100dvh-13rem)] border border-muted/30 rounded-xl overflow-hidden bg-surface">
        {selected ? <ChatConversation key={selected._id} room={selected} />
          : <div className="flex flex-col items-center justify-center h-full p-8 text-center text-text/60 text-sm">
            {loading ? <p role="status">Preparing your panel chat...</p> : <><h3 className="text-text font-bold text-base mb-2">No panel team assigned yet</h3><p>Ask your instructor to assign you to a subject's block or group. Your general team chat will appear here.</p></>}
          </div>}
      </div>
    </div>
  );
}

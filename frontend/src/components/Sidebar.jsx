import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}) {
  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (window.confirm('この会話を削除しますか？')) {
      onDeleteConversation(id);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Press Council</h1>
        <button className="new-conversation-btn" onClick={onNewConversation}>
          + 新規作成
        </button>
      </div>

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="no-conversations">履歴がありません</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${
                conv.id === currentConversationId ? 'active' : ''
              }`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="conversation-content">
                <div className="conversation-title">
                  {conv.title || '新規プレスリリース'}
                </div>
                <div className="conversation-meta">
                  {conv.message_count} メッセージ
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => handleDelete(e, conv.id)}
                title="削除"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

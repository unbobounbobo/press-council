import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import './ChatInterface.css';

export default function ChatInterface({
  conversation,
  onSendMessage,
  onCancel,
  isLoading,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!conversation) {
    return (
      <div className="chat-interface">
        <div className="empty-state">
          <h2>Press Release Council</h2>
          <p>新しい会話を作成して、プレスリリースを作成しましょう</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="messages-container">
        {conversation.messages.length === 0 ? (
          <div className="empty-state">
            <h2>プレスリリースを作成</h2>
            <p>発表内容を入力して、AIライターチームに依頼しましょう</p>
            <div className="example-prompts">
              <p className="example-label">例:</p>
              <ul>
                <li>新製品「AIアシスタントPro」を12月1日にリリースします。価格は月額980円で...</li>
                <li>当社は株式会社〇〇と業務提携を締結しました。目的は...</li>
                <li>2024年第3四半期の決算発表。売上高は前年同期比120%の...</li>
              </ul>
            </div>
          </div>
        ) : (
          conversation.messages.map((msg, index) => (
            <div key={index} className="message-group">
              {msg.role === 'user' ? (
                <div className="user-message">
                  <div className="message-label">依頼内容</div>
                  <div className="message-content">
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="assistant-message">
                  <div className="message-label">
                    Press Release Council
                    {msg.modeInfo && (
                      <span className="mode-badge">{msg.modeInfo.name}</span>
                    )}
                  </div>

                  {/* Stage 1 */}
                  {msg.loading?.stage1 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>
                        Stage 1: ライターがドラフトを作成中...
                        {msg.stage1Info?.writer_count && ` (${msg.stage1Info.writer_count}名)`}
                      </span>
                    </div>
                  )}
                  {msg.stage1 && <Stage1 responses={msg.stage1} />}

                  {/* Stage 2 */}
                  {msg.loading?.stage2 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>
                        Stage 2: 記者ペルソナが評価中...
                        {msg.stage2Info?.evaluation_count && ` (${msg.stage2Info.evaluation_count}件の評価)`}
                      </span>
                    </div>
                  )}
                  {msg.stage2 && (
                    <Stage2
                      rankings={msg.stage2}
                      labelToModel={msg.metadata?.label_to_model}
                      aggregateRankings={msg.metadata?.aggregate_rankings}
                      personaBreakdown={msg.metadata?.persona_breakdown}
                      crossTable={msg.metadata?.cross_table}
                    />
                  )}

                  {/* Stage 3 */}
                  {msg.loading?.stage3 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>Stage 3: 編集長が最終版を作成中...</span>
                    </div>
                  )}
                  {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && conversation.messages.length === 0 && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>プレスリリースを作成中...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        <textarea
          className="message-input"
          placeholder="リリース素案や発表概要を入力してください。&#10;（Shift+Enter で改行、Enter で送信）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={4}
        />
        {isLoading ? (
          <button
            type="button"
            className="cancel-button"
            onClick={onCancel}
          >
            停止
          </button>
        ) : (
          <button
            type="submit"
            className="send-button"
            disabled={!input.trim()}
          >
            作成
          </button>
        )}
      </form>
    </div>
  );
}

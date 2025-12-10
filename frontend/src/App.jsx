import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ModeSelector } from './components/ModeSelector';
import ChatInterface from './components/ChatInterface';
import { api } from './api';
import './App.css';

// Persona display info
const PERSONA_INFO = {
  nikkei: { name: '日経記者', emoji: '📰', color: 'nikkei' },
  lifestyle: { name: '全国紙生活部', emoji: '🏠', color: 'lifestyle' },
  web: { name: 'Web記者', emoji: '💻', color: 'web' },
  trade: { name: '業界専門誌', emoji: '🔧', color: 'trade' },
  tv: { name: '経済テレビ', emoji: '📺', color: 'tv' },
};

// Main application content (only rendered when authenticated)
function MainApp() {
  const { user, signOut, profile } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState(0); // 0=idle, 1=stage1, 2=stage2, 3=stage3
  const abortControllerRef = useRef(null);

  // Configuration state
  const [pressConfig, setPressConfig] = useState({
    mode: null,
    writers: [],
    matrix: [],
    editor: null,
    criticismLevel: 3,
  });

  // Get latest assistant message with metadata
  const latestAssistantMsg = useMemo(() => {
    if (!currentConversation?.messages) return null;
    const assistantMsgs = currentConversation.messages.filter(m => m.role === 'assistant');
    return assistantMsgs[assistantMsgs.length - 1] || null;
  }, [currentConversation]);

  // Extract evaluation data from metadata
  const evaluationData = useMemo(() => {
    if (!latestAssistantMsg?.metadata) return null;
    const { aggregate_rankings, label_to_model, persona_breakdown } = latestAssistantMsg.metadata;
    if (!aggregate_rankings) return null;

    // Calculate average score (inverse of avg_rank, scaled to 100)
    const topRanking = aggregate_rankings[0];
    const avgScore = topRanking ? Math.round((1 - (topRanking.avg_rank - 1) / 3) * 100) : 0;

    return {
      score: avgScore,
      rankings: aggregate_rankings,
      labelToModel: label_to_model,
      personaBreakdown: persona_breakdown,
    };
  }, [latestAssistantMsg]);

  // Extract evaluator comments from stage2
  const evaluatorComments = useMemo(() => {
    if (!latestAssistantMsg?.stage2) return [];
    return latestAssistantMsg.stage2.slice(0, 3).map(eval_ => ({
      persona: eval_.persona,
      model: eval_.model,
      text: eval_.parsed_ranking
        ? `1位: ${eval_.parsed_ranking[0] || '-'}`
        : eval_.content?.slice(0, 100) + '...',
      ranking: eval_.parsed_ranking,
    }));
  }, [latestAssistantMsg]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
      setCurrentStage(0);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, title: newConv.title, message_count: 0 },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
      setCurrentStage(0);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
  };

  const handleDeleteConversation = async (id) => {
    if (!window.confirm('この会話を削除しますか？')) return;
    try {
      await api.deleteConversation(id);
      setConversations(conversations.filter(c => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setCurrentStage(0);

      setCurrentConversation((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.cancelled = true;
          lastMsg.loading = { stage1: false, stage2: false, stage3: false };
        }
        return { ...prev, messages };
      });
    }
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;

    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setCurrentStage(1);
    try {
      const userMessage = { role: 'user', content };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        configInfo: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));

      const options = {
        content,
        mode: pressConfig.mode,
        writers: pressConfig.writers,
        matrix: pressConfig.matrix,
        editor: pressConfig.editor,
        criticismLevel: pressConfig.criticismLevel,
      };

      await api.createPressReleaseStream(
        currentConversationId,
        options,
        (eventType, event) => {
          switch (eventType) {
            case 'config':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.configInfo = event.data;
                return { ...prev, messages };
              });
              break;

            case 'stage1_start':
              setCurrentStage(1);
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.loading.stage1 = true;
                lastMsg.stage1Info = event.data;
                return { ...prev, messages };
              });
              break;

            case 'stage1_complete':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.stage1 = event.data;
                lastMsg.loading.stage1 = false;
                return { ...prev, messages };
              });
              break;

            case 'stage2_start':
              setCurrentStage(2);
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.loading.stage2 = true;
                lastMsg.stage2Info = event.data;
                return { ...prev, messages };
              });
              break;

            case 'stage2_complete':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.stage2 = event.data;
                lastMsg.metadata = event.metadata;
                lastMsg.loading.stage2 = false;
                return { ...prev, messages };
              });
              break;

            case 'stage3_start':
              setCurrentStage(3);
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.loading.stage3 = true;
                lastMsg.stage3Info = event.data;
                return { ...prev, messages };
              });
              break;

            case 'stage3_complete':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.stage3 = event.data;
                lastMsg.loading.stage3 = false;
                return { ...prev, messages };
              });
              break;

            case 'title_complete':
              loadConversations();
              break;

            case 'complete':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                if (event.metadata) {
                  lastMsg.metadata = { ...lastMsg.metadata, ...event.metadata };
                }
                return { ...prev, messages };
              });
              loadConversations();
              setIsLoading(false);
              setCurrentStage(0);
              break;

            case 'error':
              console.error('Stream error:', event.message);
              setIsLoading(false);
              setCurrentStage(0);
              break;

            default:
              console.log('Unknown event type:', eventType);
          }
        },
        abortControllerRef.current?.signal
      );
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request was cancelled');
        return;
      }
      console.error('Failed to send message:', error);
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
      setCurrentStage(0);
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Color for conversation index
  const getIndexColor = (index) => {
    const colors = ['blue', 'orange', 'green', 'purple', 'pink'];
    return colors[index % colors.length];
  };

  return (
    <div className="app">
      {/* Top Header */}
      <header className="top-header">
        <div className="header-left">
          <div className="logo">
            PRナビ
            <span className="logo-tagline">リリース作成エージェント</span>
          </div>
        </div>

        {/* Step Progress Indicator */}
        {isLoading && (
          <div className="step-progress">
            <div className={`step-item ${currentStage >= 1 ? 'active' : ''} ${currentStage === 1 ? 'current' : ''}`}>
              <span className="step-num">1</span>
              <span className="step-label">ドラフト作成</span>
            </div>
            <div className="step-arrow">→</div>
            <div className={`step-item ${currentStage >= 2 ? 'active' : ''} ${currentStage === 2 ? 'current' : ''}`}>
              <span className="step-num">2</span>
              <span className="step-label">記者評価</span>
            </div>
            <div className="step-arrow">→</div>
            <div className={`step-item ${currentStage >= 3 ? 'active' : ''} ${currentStage === 3 ? 'current' : ''}`}>
              <span className="step-num">3</span>
              <span className="step-label">最終版作成</span>
            </div>
          </div>
        )}

        <div className="header-right">
          <div className="user-menu">
            <span className={`plan-badge ${profile?.plan || 'free'}`}>
              {profile?.plan === 'pro' ? 'Pro' : 'Free'}
            </span>
            {profile?.is_admin && <span className="admin-badge">Admin</span>}
            <span className="user-email">{user?.email}</span>
            <button onClick={signOut} className="sign-out-btn">ログアウト</button>
          </div>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="main-container">
        {/* Left Sidebar - History */}
        <aside className="sidebar-left">
          <button className="new-btn" onClick={handleNewConversation}>
            + 新規作成
          </button>
          <div className="sidebar-title">履歴</div>
          <div className="index-list">
            {conversations.length === 0 ? (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: 'var(--space-sm)' }}>
                履歴がありません
              </div>
            ) : (
              conversations.map((conv, index) => (
                <div
                  key={conv.id}
                  className={`index-item ${conv.id === currentConversationId ? 'active' : ''}`}
                  onClick={() => handleSelectConversation(conv.id)}
                >
                  <div className={`index-icon ${getIndexColor(index)}`}></div>
                  <span className="index-text">{conv.title || '新規プレスリリース'}</span>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center Content */}
        <div className="center-content">
          {/* Config Panel */}
          <div className="config-panel">
            <ModeSelector
              config={pressConfig}
              onConfigChange={setPressConfig}
              disabled={isLoading}
            />
          </div>

          {/* Chat Area */}
          <ChatInterface
            conversation={currentConversation}
            onSendMessage={handleSendMessage}
            onCancel={handleCancel}
            isLoading={isLoading}
          />
        </div>

        {/* Right Sidebar - Evaluation */}
        <aside className="sidebar-right">
          <h2 className="sidebar-right-title">評価サマリー</h2>

          {evaluationData ? (
            <>
              {/* Score Card */}
              <div className="score-card">
                <div className="score-header">
                  <span className="score-label">PR SCORE</span>
                </div>
                <div className="score-value">{evaluationData.score}</div>
                <div className="score-bar">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${evaluationData.score}%` }}
                  ></div>
                </div>
                <div className={`score-verdict ${evaluationData.score >= 70 ? 'good' : evaluationData.score >= 50 ? 'ok' : 'needs-work'}`}>
                  {evaluationData.score >= 70 ? '✓ 配布推奨' : evaluationData.score >= 50 ? '△ 要改善' : '✕ 再検討'}
                </div>
              </div>

              {/* Ranking Summary */}
              <div className="ranking-summary">
                <div className="ranking-title">総合ランキング</div>
                {evaluationData.rankings.slice(0, 3).map((rank, idx) => (
                  <div key={idx} className={`ranking-item rank-${idx + 1}`}>
                    <span className="ranking-position">{idx + 1}位</span>
                    <span className="ranking-label">{rank.label}</span>
                    <span className="ranking-model">
                      {evaluationData.labelToModel?.[rank.label] || '-'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Evaluator Comments */}
              <div className="evaluator-section-title">記者コメント</div>
              {evaluatorComments.map((comment, idx) => {
                const info = PERSONA_INFO[comment.persona] || { name: comment.persona, emoji: '📝', color: 'default' };
                return (
                  <div key={idx} className="evaluator-comment">
                    <div className="evaluator-header">
                      <div className={`evaluator-avatar ${info.color}`}>{info.emoji}</div>
                      <div className="evaluator-info">
                        <div className="evaluator-name">
                          {info.name}
                          {comment.ranking && (
                            <span className="evaluator-badge">1位: {comment.ranking[0]}</span>
                          )}
                        </div>
                        <div className="evaluator-meta">{comment.model}</div>
                      </div>
                    </div>
                    {comment.ranking && (
                      <div className="evaluator-text">
                        2位: {comment.ranking[1] || '-'}, 3位: {comment.ranking[2] || '-'}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : isLoading ? (
            <div className="evaluation-loading">
              <div className="loading-spinner"></div>
              <p>評価中...</p>
            </div>
          ) : (
            <div className="evaluation-empty">
              <p>プレスリリースを作成すると、記者による評価がここに表示されます</p>
              <ul>
                <li>総合スコア</li>
                <li>ドラフトランキング</li>
                <li>5種類の記者視点</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// App wrapper that handles authentication
function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return <MainApp />;
}

export default App;

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ModeSelector } from './components/ModeSelector';
import ChatInterface from './components/ChatInterface';
import { api } from './api';
import './App.css';

// Persona display info with evaluation axes
const PERSONA_INFO = {
  nikkei: { name: '経済ビジネス紙', emoji: '📰', color: 'nikkei', axis: 'ビジネス性' },
  lifestyle: { name: '全国紙生活部', emoji: '🏠', color: 'lifestyle', axis: '一般訴求' },
  web: { name: 'Web記者', emoji: '💻', color: 'web', axis: 'Web適性' },
  trade: { name: '業界専門誌', emoji: '🔧', color: 'trade', axis: '専門性' },
  tv: { name: '経済テレビ', emoji: '📺', color: 'tv', axis: '話題性' },
};

// Radar chart component for media evaluation
function RadarChart({ scores, size = 200 }) {
  const axes = ['ビジネス性', '一般訴求', 'Web適性', '専門性', '話題性'];
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.35;

  // Calculate points for polygon
  const getPoint = (index, value) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    const r = (value / 100) * radius;
    return {
      x: centerX + r * Math.cos(angle),
      y: centerY + r * Math.sin(angle),
    };
  };

  // Generate grid lines
  const gridLevels = [20, 40, 60, 80, 100];

  return (
    <svg width={size} height={size} className="radar-chart">
      {/* Grid */}
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={axes.map((_, i) => {
            const p = getPoint(i, level);
            return `${p.x},${p.y}`;
          }).join(' ')}
          fill="none"
          stroke="var(--border-light)"
          strokeWidth="1"
        />
      ))}

      {/* Axis lines */}
      {axes.map((_, i) => {
        const p = getPoint(i, 100);
        return (
          <line
            key={i}
            x1={centerX}
            y1={centerY}
            x2={p.x}
            y2={p.y}
            stroke="var(--border-default)"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={axes.map((axis, i) => {
          const p = getPoint(i, scores[axis] || 0);
          return `${p.x},${p.y}`;
        }).join(' ')}
        fill="rgba(255, 204, 0, 0.3)"
        stroke="var(--accent-primary)"
        strokeWidth="2"
      />

      {/* Data points */}
      {axes.map((axis, i) => {
        const p = getPoint(i, scores[axis] || 0);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="var(--accent-primary)"
          />
        );
      })}

      {/* Labels */}
      {axes.map((axis, i) => {
        const p = getPoint(i, 120);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fill="var(--text-secondary)"
          >
            {axis}
          </text>
        );
      })}
    </svg>
  );
}

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
    console.log('latestAssistantMsg:', latestAssistantMsg);
    console.log('metadata:', latestAssistantMsg?.metadata);
    if (!latestAssistantMsg?.metadata) return null;
    const { aggregate_rankings, label_to_model, persona_breakdown } = latestAssistantMsg.metadata;
    console.log('aggregate_rankings:', aggregate_rankings);
    console.log('persona_breakdown:', persona_breakdown);
    console.log('label_to_model:', label_to_model);
    if (!aggregate_rankings) return null;

    // Calculate average score (inverse of avg_rank, scaled to 100)
    const topRanking = aggregate_rankings[0];
    const avgScore = topRanking ? Math.round((1 - (topRanking.avg_rank - 1) / 3) * 100) : 0;

    // Calculate radar scores per persona (from persona_breakdown)
    const radarScores = {
      'ビジネス性': 70,
      '一般訴求': 70,
      'Web適性': 70,
      '専門性': 70,
      '話題性': 70,
    };

    // If persona_breakdown exists, calculate scores based on how each persona ranked the top draft
    if (persona_breakdown && topRanking) {
      const topLabel = topRanking.label;
      Object.entries(persona_breakdown).forEach(([persona, rankings]) => {
        const personaInfo = PERSONA_INFO[persona];
        if (personaInfo && rankings[topLabel]) {
          // Convert rank (1-4) to score (100-25)
          const rank = rankings[topLabel];
          const score = Math.round((1 - (rank - 1) / 3) * 100);
          radarScores[personaInfo.axis] = score;
        }
      });
    }

    return {
      score: avgScore,
      rankings: aggregate_rankings,
      labelToModel: label_to_model,
      personaBreakdown: persona_breakdown,
      radarScores,
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
              console.log('stage2_complete event:', event);
              console.log('stage2_complete metadata:', event.metadata);
              setCurrentConversation((prev) => {
                const messages = prev.messages.map((msg, idx) => {
                  if (idx === prev.messages.length - 1) {
                    return {
                      ...msg,
                      stage2: event.data,
                      metadata: event.metadata,
                      loading: { ...msg.loading, stage2: false },
                    };
                  }
                  return msg;
                });
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
                const messages = prev.messages.map((msg, idx) => {
                  if (idx === prev.messages.length - 1) {
                    return {
                      ...msg,
                      stage3: event.data,
                      loading: { ...msg.loading, stage3: false },
                    };
                  }
                  return msg;
                });
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
              {/* Radar Chart - Media Evaluation */}
              <div className="radar-section">
                <div className="radar-title">メディア適性</div>
                <div className="radar-container">
                  <RadarChart scores={evaluationData.radarScores} size={180} />
                </div>
              </div>

              {/* Score Card */}
              <div className="score-card">
                <div className="score-header">
                  <span className="score-label">総合スコア</span>
                  <span className="score-value-large">{evaluationData.score}</span>
                </div>
                <div className="score-bar">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${evaluationData.score}%` }}
                  ></div>
                </div>
                <div className={`score-verdict ${evaluationData.score >= 70 ? 'good' : evaluationData.score >= 50 ? 'ok' : 'needs-work'}`}>
                  {evaluationData.score >= 70 ? '配布推奨' : evaluationData.score >= 50 ? '要改善' : '再検討'}
                </div>
              </div>

              {/* Anonymous Ranking */}
              <div className="ranking-section">
                <div className="ranking-title">匿名ランキング</div>
                <div className="ranking-subtitle">記者による投票結果（モデル名は後から公開）</div>
                {evaluationData.rankings.slice(0, 4).map((rank, idx) => (
                  <div key={idx} className={`ranking-item rank-${idx + 1}`}>
                    <span className={`ranking-medal ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}`}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                    </span>
                    <div className="ranking-content">
                      <span className="ranking-label">{rank.label}</span>
                      <span className="ranking-score">avg: {rank.avg_rank?.toFixed(2) || '-'}</span>
                    </div>
                    <span className="ranking-model-reveal">
                      {evaluationData.labelToModel?.[rank.label] || '???'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Persona Breakdown */}
              <div className="persona-section">
                <div className="persona-title">記者別評価</div>
                {Object.entries(PERSONA_INFO).map(([personaId, info]) => {
                  const personaRankings = evaluationData.personaBreakdown?.[personaId];
                  if (!personaRankings) return null;

                  // Find top pick for this persona
                  const topPick = Object.entries(personaRankings)
                    .sort(([,a], [,b]) => a - b)[0];

                  return (
                    <div key={personaId} className={`persona-card ${info.color}`}>
                      <div className="persona-header">
                        <span className="persona-emoji">{info.emoji}</span>
                        <span className="persona-name">{info.name}</span>
                      </div>
                      <div className="persona-pick">
                        <span className="pick-label">1位:</span>
                        <span className="pick-value">{topPick?.[0] || '-'}</span>
                        <span className="pick-model">
                          ({evaluationData.labelToModel?.[topPick?.[0]] || '-'})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : isLoading ? (
            <div className="evaluation-loading">
              <div className="loading-spinner"></div>
              <p>記者が評価中...</p>
            </div>
          ) : (
            <div className="evaluation-empty">
              <div className="empty-icon">📊</div>
              <h3>記者による評価</h3>
              <p>プレスリリースを作成すると、5種類の記者視点で評価されます</p>
              <div className="empty-features">
                <div className="empty-feature">
                  <span className="feature-icon">📈</span>
                  <span>メディア適性レーダー</span>
                </div>
                <div className="empty-feature">
                  <span className="feature-icon">🏆</span>
                  <span>匿名ランキング</span>
                </div>
                <div className="empty-feature">
                  <span className="feature-icon">👥</span>
                  <span>記者別フィードバック</span>
                </div>
              </div>
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

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ModeSelector } from './components/ModeSelector';
import ChatInterface from './components/ChatInterface';
import { api } from './api';
import './App.css';

// Main application content (only rendered when authenticated)
function MainApp() {
  const { user, signOut, profile } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef(null);

  // Configuration state
  const [pressConfig, setPressConfig] = useState({
    mode: null,
    writers: [],
    matrix: [],
    editor: null,
    criticismLevel: 3,
  });

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
              break;

            case 'error':
              console.error('Stream error:', event.message);
              setIsLoading(false);
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
            <span className="logo-tagline">リリース作成エージェント🤖</span>
          </div>
        </div>
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

        {/* Right Sidebar - Evaluation (placeholder) */}
        <aside className="sidebar-right">
          <h2 className="sidebar-right-title">評価</h2>

          {currentConversation?.messages?.some(m => m.role === 'assistant' && m.metadata) ? (
            <>
              {/* Score Card */}
              <div className="score-card">
                <div className="score-header">
                  <span className="score-label">PR SCORE</span>
                </div>
                <div className="score-value">--</div>
                <div className="score-bar">
                  <div className="score-bar-fill" style={{ width: '0%' }}></div>
                </div>
                <div className="score-verdict">
                  評価待ち
                </div>
              </div>

              <div className="evaluator-section-title">記者コメント</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Stage 2 の評価結果がここに表示されます
              </div>
            </>
          ) : (
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              プレスリリースを作成すると、記者による評価がここに表示されます
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

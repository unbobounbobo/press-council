import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import { ModeSelector } from './components/ModeSelector';
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

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved, 10) : 260;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef(null);

  // Header resize state (vertical)
  const [headerHeight, setHeaderHeight] = useState(() => {
    const saved = localStorage.getItem('headerHeight');
    return saved ? parseInt(saved, 10) : 500;
  });
  const [isResizingHeader, setIsResizingHeader] = useState(false);
  const headerResizeRef = useRef(null);

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

  // Sidebar resize handlers
  const handleMouseDown = useCallback((e) => {
    setIsResizing(true);
    resizeRef.current = e.clientX;
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;
    const diff = e.clientX - resizeRef.current;
    const newWidth = Math.min(Math.max(180, sidebarWidth + diff), 500);
    setSidebarWidth(newWidth);
    resizeRef.current = e.clientX;
  }, [isResizing, sidebarWidth]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('sidebarWidth', sidebarWidth.toString());
    }
  }, [isResizing, sidebarWidth]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Header resize handlers (vertical)
  const handleHeaderMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizingHeader(true);
    headerResizeRef.current = e.clientY;
  }, []);

  const handleHeaderMouseMove = useCallback((e) => {
    if (!isResizingHeader) return;
    const diff = e.clientY - headerResizeRef.current;
    const newHeight = Math.min(Math.max(50, headerHeight + diff), 900);
    setHeaderHeight(newHeight);
    headerResizeRef.current = e.clientY;
  }, [isResizingHeader, headerHeight]);

  const handleHeaderMouseUp = useCallback(() => {
    if (isResizingHeader) {
      setIsResizingHeader(false);
      localStorage.setItem('headerHeight', headerHeight.toString());
    }
  }, [isResizingHeader, headerHeight]);

  useEffect(() => {
    if (isResizingHeader) {
      document.addEventListener('mousemove', handleHeaderMouseMove);
      document.addEventListener('mouseup', handleHeaderMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleHeaderMouseMove);
      document.removeEventListener('mouseup', handleHeaderMouseUp);
      if (!isResizing) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [isResizingHeader, handleHeaderMouseMove, handleHeaderMouseUp, isResizing]);

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

  return (
    <div className={`app ${isResizing || isResizingHeader ? 'resizing' : ''}`}>
      <div className="sidebar-container" style={{ width: sidebarWidth }}>
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
        />
        <div
          className="resize-handle"
          onMouseDown={handleMouseDown}
        />
      </div>
      <div className="main-content">
        <div className="header-section-wrapper" style={{ height: headerHeight }}>
          <div className="header-section">
            <header className="app-header">
              <div className="app-header-top">
                <div>
                  <h1 className="app-title">Press Council</h1>
                  <p className="app-subtitle">
                    複数のAIが原稿を作成し、記者視点で評価・ランキング・最終版を生成
                  </p>
                </div>
                <div className="user-menu">
                  <span className="user-email">{user?.email}</span>
                  {profile?.is_admin && <span className="admin-badge">Admin</span>}
                  <button onClick={signOut} className="sign-out-btn">ログアウト</button>
                </div>
              </div>
            </header>
            <div className="header-controls">
              <ModeSelector
                config={pressConfig}
                onConfigChange={setPressConfig}
                disabled={isLoading}
              />
            </div>
          </div>
          <div
            className="header-resize-handle"
            onMouseDown={handleHeaderMouseDown}
          />
        </div>
        <ChatInterface
          conversation={currentConversation}
          onSendMessage={handleSendMessage}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
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

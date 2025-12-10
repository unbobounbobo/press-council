import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import './ModeSelector.css';

/**
 * ModeSelector component with OpenRouter-style dropdown selection.
 * Supports preset modes and custom configuration with plan-based restrictions.
 */
export function ModeSelector({ config, onConfigChange, disabled }) {
  const { profile } = useAuth();
  const isPro = profile?.plan === 'pro';

  const [modes, setModes] = useState([]);
  const [llmBlocks, setLlmBlocks] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [criticismLevels, setCriticismLevels] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Dropdown states
  const [showWriterDropdown, setShowWriterDropdown] = useState(false);
  const [showEditorDropdown, setShowEditorDropdown] = useState(false);
  const [showMatrixDropdown, setShowMatrixDropdown] = useState(false);
  const writerDropdownRef = useRef(null);
  const editorDropdownRef = useRef(null);
  const matrixDropdownRef = useRef(null);

  // Check if a model is available for the current plan
  const isModelAvailable = (block) => {
    if (isPro) return true;
    return block.tier === 'free' || block.tier === 'standard';
  };

  // Group models by provider
  const groupedModels = useCallback(() => {
    const groups = {};
    llmBlocks.forEach(block => {
      if (!groups[block.provider]) {
        groups[block.provider] = [];
      }
      groups[block.provider].push(block);
    });
    return groups;
  }, [llmBlocks]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (writerDropdownRef.current && !writerDropdownRef.current.contains(e.target)) {
        setShowWriterDropdown(false);
      }
      if (editorDropdownRef.current && !editorDropdownRef.current.contains(e.target)) {
        setShowEditorDropdown(false);
      }
      if (matrixDropdownRef.current && !matrixDropdownRef.current.contains(e.target)) {
        setShowMatrixDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load configuration on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [modesData, blocksData, personasData, criticismData] = await Promise.all([
          api.getModes(),
          api.getLLMBlocks(),
          api.getPersonas(),
          api.getCriticismLevels(),
        ]);

        setModes(modesData.modes);
        setLlmBlocks(blocksData.blocks);
        setPersonas(personasData.personas);
        setCriticismLevels(criticismData.levels);

        // Set initial config from default mode
        const defaultModeConfig = modesData.modes.find(m => m.id === modesData.default_mode);
        if (defaultModeConfig && !config.mode) {
          onConfigChange({
            mode: defaultModeConfig.id,
            writers: defaultModeConfig.default_writers,
            matrix: defaultModeConfig.default_matrix,
            editor: defaultModeConfig.default_editor,
            criticismLevel: criticismData.default,
          });
        }
      } catch (err) {
        setError('Failed to load configuration');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // Handle preset mode change
  const handleModeChange = (modeId) => {
    const mode = modes.find(m => m.id === modeId);
    if (mode) {
      // Check if mode uses premium models
      const usesPremium = mode.default_writers.some(wId => {
        const block = llmBlocks.find(b => b.id === wId);
        return block && block.tier === 'premium';
      });

      if (!isPro && usesPremium) {
        setShowUpgradeModal(true);
        return;
      }

      onConfigChange({
        ...config,
        mode: modeId,
        writers: mode.default_writers,
        matrix: mode.default_matrix,
        editor: mode.default_editor,
      });
    }
  };

  // Handle writer toggle
  const handleWriterToggle = (writerId) => {
    const block = llmBlocks.find(b => b.id === writerId);
    if (!isModelAvailable(block)) {
      setShowUpgradeModal(true);
      return;
    }

    const newWriters = config.writers.includes(writerId)
      ? config.writers.filter(w => w !== writerId)
      : [...config.writers, writerId];

    if (newWriters.length > 0) {
      onConfigChange({ ...config, writers: newWriters });
    }
  };

  // Handle editor change
  const handleEditorChange = (editorId) => {
    const block = llmBlocks.find(b => b.id === editorId);
    if (!isModelAvailable(block)) {
      setShowUpgradeModal(true);
      return;
    }
    onConfigChange({ ...config, editor: editorId });
    setShowEditorDropdown(false);
  };

  // Handle matrix toggle
  const handleMatrixToggle = (llmId, personaId) => {
    const block = llmBlocks.find(b => b.id === llmId);
    if (!isModelAvailable(block)) {
      setShowUpgradeModal(true);
      return;
    }

    const existingIndex = config.matrix.findIndex(
      ([l, p]) => l === llmId && p === personaId
    );

    let newMatrix;
    if (existingIndex >= 0) {
      newMatrix = config.matrix.filter((_, i) => i !== existingIndex);
    } else {
      newMatrix = [...config.matrix, [llmId, personaId]];
    }
    onConfigChange({ ...config, matrix: newMatrix });
  };

  const isMatrixCellActive = (llmId, personaId) => {
    return config.matrix?.some(([l, p]) => l === llmId && p === personaId);
  };

  // Handle criticism level change
  const handleCriticismChange = (level) => {
    onConfigChange({ ...config, criticismLevel: parseInt(level) });
  };

  // Get model info by ID
  const getModelInfo = (modelId) => {
    return llmBlocks.find(b => b.id === modelId);
  };

  if (loading) {
    return <div className="mode-selector loading">Loading...</div>;
  }

  if (error) {
    return <div className="mode-selector error">{error}</div>;
  }

  const currentMode = modes.find(m => m.id === config.mode);
  const groups = groupedModels();

  return (
    <div className="mode-selector">
      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="upgrade-modal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="upgrade-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowUpgradeModal(false)}>×</button>
            <div className="upgrade-icon">🚀</div>
            <h3>Proプランにアップグレード</h3>
            <p>Claude Opus/Sonnet、GPT-4o等のプレミアムモデルをご利用いただけます。</p>
            <ul className="upgrade-features">
              <li>✓ Claude 4 Opus/Sonnet</li>
              <li>✓ GPT-4o/GPT-4 Turbo</li>
              <li>✓ Grok 2</li>
              <li>✓ 無制限の評価パターン</li>
            </ul>
            <button className="upgrade-btn">
              Proプランを見る（月額¥2,980）
            </button>
            <p className="upgrade-note">7日間の無料トライアル付き</p>
          </div>
        </div>
      )}

      {/* Compact header with preset + dropdowns */}
      <div className="selector-header">
        {/* Preset buttons */}
        <div className="preset-buttons">
          {modes.map((mode) => (
            <button
              key={mode.id}
              className={`preset-btn ${config.mode === mode.id ? 'active' : ''}`}
              onClick={() => handleModeChange(mode.id)}
              disabled={disabled}
            >
              {mode.name_ja}
            </button>
          ))}
        </div>

        {/* Criticism slider */}
        <div className="criticism-compact">
          <span className="criticism-label">批判度:</span>
          <input
            type="range"
            min="1"
            max="5"
            value={config.criticismLevel || 3}
            onChange={(e) => handleCriticismChange(e.target.value)}
            disabled={disabled}
            className="criticism-slider-sm"
          />
          <span className="criticism-val">{criticismLevels[config.criticismLevel]?.name || '標準'}</span>
        </div>
      </div>

      {/* Selection area */}
      <div className="selector-grid">
        {/* STEP 1: Writers - Dropdown */}
        <div className="selector-section" ref={writerDropdownRef}>
          <div className="section-label">
            <span className="step-badge">1</span>
            ライター
            <span className="count-badge">{config.writers?.length || 0}</span>
          </div>
          <div
            className={`dropdown-trigger ${showWriterDropdown ? 'open' : ''}`}
            onClick={() => !disabled && setShowWriterDropdown(!showWriterDropdown)}
          >
            <div className="selected-tags">
              {config.writers?.slice(0, 3).map(wId => {
                const model = getModelInfo(wId);
                return model ? (
                  <span key={wId} className={`model-tag ${model.tier}`}>
                    {model.name}
                    <button
                      className="tag-remove"
                      onClick={(e) => { e.stopPropagation(); handleWriterToggle(wId); }}
                    >×</button>
                  </span>
                ) : null;
              })}
              {config.writers?.length > 3 && (
                <span className="more-tag">+{config.writers.length - 3}</span>
              )}
              {!config.writers?.length && <span className="placeholder">モデルを選択...</span>}
            </div>
            <span className="dropdown-arrow">▼</span>
          </div>

          {showWriterDropdown && (
            <div className="dropdown-menu">
              {Object.entries(groups).map(([provider, models]) => (
                <div key={provider} className="dropdown-group">
                  <div className="group-header">{provider}</div>
                  {models.map(block => {
                    const available = isModelAvailable(block);
                    const selected = config.writers?.includes(block.id);
                    return (
                      <div
                        key={block.id}
                        className={`dropdown-item ${selected ? 'selected' : ''} ${!available ? 'locked' : ''}`}
                        onClick={() => handleWriterToggle(block.id)}
                      >
                        <span className="item-check">{selected ? '✓' : ''}</span>
                        <span className="item-name">{block.name}</span>
                        <span className={`tier-badge ${block.tier}`}>
                          {block.tier === 'free' ? 'FREE' : block.tier === 'premium' ? 'PRO' : ''}
                        </span>
                        {!available && <span className="lock-icon">🔒</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 2: Matrix - Compact grid */}
        <div className="selector-section matrix-section" ref={matrixDropdownRef}>
          <div className="section-label">
            <span className="step-badge">2</span>
            評価マトリクス
            <span className="count-badge">{config.matrix?.length || 0}</span>
          </div>
          <div
            className={`dropdown-trigger ${showMatrixDropdown ? 'open' : ''}`}
            onClick={() => !disabled && setShowMatrixDropdown(!showMatrixDropdown)}
          >
            <span className="matrix-summary">
              {config.matrix?.length || 0} 評価パターン
            </span>
            <span className="dropdown-arrow">▼</span>
          </div>

          {showMatrixDropdown && (
            <div className="dropdown-menu matrix-menu">
              <div className="matrix-grid-compact">
                <div className="matrix-header-row">
                  <div className="matrix-corner"></div>
                  {config.writers?.map(wId => {
                    const model = getModelInfo(wId);
                    return model ? (
                      <div key={wId} className="matrix-col-header" title={model.name}>
                        {model.name.split(' ')[0]}
                      </div>
                    ) : null;
                  })}
                </div>
                {personas.map(persona => (
                  <div key={persona.id} className="matrix-row">
                    <div className="matrix-row-header">{persona.name}</div>
                    {config.writers?.map(wId => {
                      const isActive = isMatrixCellActive(wId, persona.id);
                      return (
                        <button
                          key={`${wId}-${persona.id}`}
                          className={`matrix-cell-sm ${isActive ? 'active' : ''}`}
                          onClick={() => handleMatrixToggle(wId, persona.id)}
                        >
                          {isActive ? '✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* STEP 3: Editor - Dropdown */}
        <div className="selector-section" ref={editorDropdownRef}>
          <div className="section-label">
            <span className="step-badge">3</span>
            最終執筆
          </div>
          <div
            className={`dropdown-trigger ${showEditorDropdown ? 'open' : ''}`}
            onClick={() => !disabled && setShowEditorDropdown(!showEditorDropdown)}
          >
            {config.editor ? (
              <span className={`model-tag single ${getModelInfo(config.editor)?.tier}`}>
                {getModelInfo(config.editor)?.name || config.editor}
              </span>
            ) : (
              <span className="placeholder">モデルを選択...</span>
            )}
            <span className="dropdown-arrow">▼</span>
          </div>

          {showEditorDropdown && (
            <div className="dropdown-menu">
              {Object.entries(groups).map(([provider, models]) => (
                <div key={provider} className="dropdown-group">
                  <div className="group-header">{provider}</div>
                  {models.map(block => {
                    const available = isModelAvailable(block);
                    const selected = config.editor === block.id;
                    return (
                      <div
                        key={block.id}
                        className={`dropdown-item ${selected ? 'selected' : ''} ${!available ? 'locked' : ''}`}
                        onClick={() => handleEditorChange(block.id)}
                      >
                        <span className="item-check">{selected ? '✓' : ''}</span>
                        <span className="item-name">{block.name}</span>
                        <span className={`tier-badge ${block.tier}`}>
                          {block.tier === 'free' ? 'FREE' : block.tier === 'premium' ? 'PRO' : ''}
                        </span>
                        {!available && <span className="lock-icon">🔒</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Estimates footer */}
      {currentMode && (
        <div className="selector-footer">
          <span className="estimate">⏱ 約{currentMode.estimated_time_min}分</span>
          <span className="estimate">
            💰 {currentMode.estimated_cost_yen === 0 ? '無料' : `約¥${currentMode.estimated_cost_yen}`}
          </span>
          {!isPro && (
            <button className="upgrade-link" onClick={() => setShowUpgradeModal(true)}>
              🚀 Proでもっと高性能に
            </button>
          )}
        </div>
      )}
    </div>
  );
}

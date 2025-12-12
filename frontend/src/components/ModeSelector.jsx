import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import './ModeSelector.css';

/**
 * ModeSelector - B案: ライター/評価モデル分離UI
 * - STEP 1: ライターモデル（ドロップダウンで複数選択）
 * - STEP 2: 評価設定（評価モデル2-3個 × ペルソナ）
 * - STEP 3: 編集長モデル
 */
export function ModeSelector({ config, onConfigChange, disabled }) {
  const { profile } = useAuth();
  const isPro = profile?.plan === 'pro';

  const [modes, setModes] = useState([]);
  const [llmBlocks, setLlmBlocks] = useState([]);
  const [evaluatorModels, setEvaluatorModels] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [criticismLevels, setCriticismLevels] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Dropdown state
  const [showWriterDropdown, setShowWriterDropdown] = useState(false);
  const writerDropdownRef = useRef(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (writerDropdownRef.current && !writerDropdownRef.current.contains(e.target)) {
        setShowWriterDropdown(false);
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
        // Filter evaluator models (from EVALUATOR_MODELS in backend)
        const evalModels = blocksData.evaluator_models || ['gemini-flash', 'deepseek', 'gemini-pro'];
        setEvaluatorModels(blocksData.blocks.filter(b => evalModels.includes(b.id)));
        setPersonas(personasData.personas);
        setCriticismLevels(criticismData.levels);

        // Set initial config from default mode (or update missing evaluators)
        const defaultModeConfig = modesData.modes.find(m => m.id === modesData.default_mode);
        if (defaultModeConfig) {
          // Always ensure evaluators is set
          if (!config.mode || !config.evaluators) {
            onConfigChange({
              mode: config.mode || defaultModeConfig.id,
              writers: config.writers || defaultModeConfig.default_writers,
              evaluators: config.evaluators || defaultModeConfig.default_evaluators,
              matrix: config.matrix || defaultModeConfig.default_matrix,
              editor: config.editor || defaultModeConfig.default_editor,
              criticismLevel: config.criticismLevel || criticismData.default,
            });
          }
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
        evaluators: mode.default_evaluators,
        matrix: mode.default_matrix,
        editor: mode.default_editor,
      });
    }
  };

  // Handle writer toggle (from dropdown)
  const handleWriterToggle = (writerId) => {
    const block = llmBlocks.find(b => b.id === writerId);
    if (!isModelAvailable(block)) {
      setShowUpgradeModal(true);
      return;
    }

    const newWriters = config.writers?.includes(writerId)
      ? config.writers.filter(w => w !== writerId)
      : [...(config.writers || []), writerId];

    if (newWriters.length > 0) {
      onConfigChange({ ...config, writers: newWriters });
    }
  };

  // Handle evaluator toggle
  const handleEvaluatorToggle = (evalId) => {
    const newEvaluators = config.evaluators?.includes(evalId)
      ? config.evaluators.filter(e => e !== evalId)
      : [...(config.evaluators || []), evalId];

    if (newEvaluators.length > 0) {
      // Update matrix to match new evaluators
      const newMatrix = [];
      for (const evalModel of newEvaluators) {
        for (const persona of personas) {
          // Keep existing selections or add new ones
          const exists = config.matrix?.some(([e, p]) => e === evalModel && p === persona.id);
          if (exists || !config.matrix?.length) {
            newMatrix.push([evalModel, persona.id]);
          }
        }
      }
      onConfigChange({ ...config, evaluators: newEvaluators, matrix: newMatrix });
    }
  };

  // Handle matrix cell toggle
  const handleMatrixToggle = (evalId, personaId) => {
    const existingIndex = config.matrix?.findIndex(
      ([e, p]) => e === evalId && p === personaId
    );

    let newMatrix;
    if (existingIndex >= 0) {
      newMatrix = config.matrix.filter((_, i) => i !== existingIndex);
    } else {
      newMatrix = [...(config.matrix || []), [evalId, personaId]];
    }
    onConfigChange({ ...config, matrix: newMatrix });
  };

  const isMatrixCellActive = (evalId, personaId) => {
    return config.matrix?.some(([e, p]) => e === evalId && p === personaId);
  };

  // Handle editor change
  const handleEditorChange = (editorId) => {
    const block = llmBlocks.find(b => b.id === editorId);
    if (!isModelAvailable(block)) {
      setShowUpgradeModal(true);
      return;
    }
    onConfigChange({ ...config, editor: editorId });
  };

  // Handle criticism level change
  const handleCriticismChange = (level) => {
    onConfigChange({ ...config, criticismLevel: parseInt(level) });
  };

  // Get model info
  const getModelInfo = (modelId) => llmBlocks.find(b => b.id === modelId);

  if (loading) return <div className="mode-selector loading">Loading...</div>;
  if (error) return <div className="mode-selector error">{error}</div>;

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
            <p>Claude/GPT等のプレミアムモデルをご利用いただけます。</p>
            <ul className="upgrade-features">
              <li>✓ Claude Sonnet/Opus</li>
              <li>✓ GPT-4o</li>
              <li>✓ 無制限のライター選択</li>
            </ul>
            <button className="upgrade-btn">Proプランを見る（月額¥2,980）</button>
            <p className="upgrade-note">7日間の無料トライアル付き</p>
          </div>
        </div>
      )}

      {/* Preset selection */}
      <div className="preset-section">
        <div className="preset-buttons">
          {modes.map((mode) => {
            const usesPremium = mode.default_writers?.some(wId => {
              const block = llmBlocks.find(b => b.id === wId);
              return block && block.tier === 'premium';
            });
            const isLocked = !isPro && usesPremium;

            return (
              <button
                key={mode.id}
                className={`preset-button ${config.mode === mode.id ? 'active' : ''} ${mode.id} ${isLocked ? 'locked' : ''}`}
                onClick={() => handleModeChange(mode.id)}
                disabled={disabled}
              >
                <span className="preset-name">
                  {mode.name_ja}
                  {isLocked && <span className="pro-badge">PRO</span>}
                </span>
                <span className="preset-info">{mode.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration sections */}
      <div className="config-sections">
        {/* STEP 1: Writers - Dropdown */}
        <div className="config-section" ref={writerDropdownRef}>
          <div className="section-header">
            <span className="section-title">
              <span className="step-num">1</span>
              ライターモデル
            </span>
            <span className="section-count">{config.writers?.length || 0}個選択</span>
          </div>

          <div
            className={`dropdown-trigger ${showWriterDropdown ? 'open' : ''}`}
            onClick={() => !disabled && setShowWriterDropdown(!showWriterDropdown)}
          >
            <div className="selected-tags">
              {config.writers?.map(wId => {
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
                        <span className="item-desc">{block.description}</span>
                        {block.tier === 'free' && <span className="tier-badge free">FREE</span>}
                        {block.tier === 'premium' && <span className="tier-badge premium">PRO</span>}
                        {!available && <span className="lock-icon">🔒</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 2: Evaluation Matrix (Evaluators x Personas) */}
        <div className="config-section">
          <div className="section-header">
            <span className="section-title">
              <span className="step-num">2</span>
              評価マトリクス
            </span>
            <span className="section-count">{config.matrix?.length || 0}評価</span>
          </div>

          {/* Evaluator model selection */}
          <div className="evaluator-select">
            <span className="eval-label">評価モデル:</span>
            {evaluatorModels.map(block => (
              <button
                key={block.id}
                className={`eval-toggle ${config.evaluators?.includes(block.id) ? 'active' : ''}`}
                onClick={() => handleEvaluatorToggle(block.id)}
                disabled={disabled}
              >
                {block.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Matrix Grid */}
          <div className="matrix-grid">
            <div className="matrix-header-row">
              <div className="matrix-corner"></div>
              {config.evaluators?.map(evalId => {
                const model = getModelInfo(evalId);
                return model ? (
                  <div key={evalId} className="matrix-col-header">
                    {model.name.split(' ')[0]}
                  </div>
                ) : null;
              })}
            </div>
            {personas.map(persona => (
              <div key={persona.id} className="matrix-row">
                <div className="matrix-row-header">{persona.name}</div>
                {config.evaluators?.map(evalId => (
                  <button
                    key={`${evalId}-${persona.id}`}
                    className={`matrix-cell ${isMatrixCellActive(evalId, persona.id) ? 'active' : ''}`}
                    onClick={() => handleMatrixToggle(evalId, persona.id)}
                    disabled={disabled}
                  >
                    {isMatrixCellActive(evalId, persona.id) ? '✓' : ''}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* STEP 3: Editor */}
        <div className="config-section">
          <div className="section-header">
            <span className="section-title">
              <span className="step-num">3</span>
              編集長モデル
            </span>
          </div>
          <div className="editor-select">
            {llmBlocks.filter(b => b.tier !== 'premium' || isPro).slice(0, 5).map(block => {
              const available = isModelAvailable(block);
              return (
                <button
                  key={block.id}
                  className={`editor-button ${config.editor === block.id ? 'active' : ''} ${!available ? 'locked' : ''}`}
                  onClick={() => handleEditorChange(block.id)}
                  disabled={disabled}
                >
                  {block.name}
                  {!available && <span className="lock-icon">🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Criticism slider */}
      <div className="criticism-section">
        <div className="criticism-header">
          <span className="criticism-label">批判度</span>
          <span className="criticism-value">{criticismLevels[config.criticismLevel]?.name || '標準'}</span>
        </div>
        <div className="criticism-slider-container">
          <span className="slider-label">寛容</span>
          <input
            type="range"
            min="1"
            max="5"
            value={config.criticismLevel || 3}
            onChange={(e) => handleCriticismChange(e.target.value)}
            disabled={disabled}
            className="criticism-slider"
          />
          <span className="slider-label">厳格</span>
        </div>
      </div>

      {/* Footer */}
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

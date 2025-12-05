import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import './ModeSelector.css';

/**
 * ModeSelector component for selecting press release generation configuration.
 * Supports preset modes and custom configuration.
 */
export function ModeSelector({ config, onConfigChange, disabled }) {
  const [modes, setModes] = useState([]);
  const [llmBlocks, setLlmBlocks] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [criticismLevels, setCriticismLevels] = useState({});
  const [defaultMode, setDefaultMode] = useState('standard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        setDefaultMode(modesData.default_mode);
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
    const newWriters = config.writers.includes(writerId)
      ? config.writers.filter(w => w !== writerId)
      : [...config.writers, writerId];

    // Ensure at least one writer is selected
    if (newWriters.length > 0) {
      onConfigChange({ ...config, writers: newWriters });
    }
  };

  // Handle matrix cell toggle
  const handleMatrixToggle = (llmId, personaId) => {
    const key = `${llmId}-${personaId}`;
    const existingIndex = config.matrix.findIndex(
      ([l, p]) => l === llmId && p === personaId
    );

    let newMatrix;
    if (existingIndex >= 0) {
      // Remove this combination
      newMatrix = config.matrix.filter((_, i) => i !== existingIndex);
    } else {
      // Add this combination
      newMatrix = [...config.matrix, [llmId, personaId]];
    }

    onConfigChange({ ...config, matrix: newMatrix });
  };

  // Check if a matrix cell is active
  const isMatrixCellActive = (llmId, personaId) => {
    return config.matrix?.some(([l, p]) => l === llmId && p === personaId);
  };

  // Handle editor change
  const handleEditorChange = (editorId) => {
    onConfigChange({ ...config, editor: editorId });
  };

  // Handle criticism level change
  const handleCriticismChange = (level) => {
    onConfigChange({ ...config, criticismLevel: parseInt(level) });
  };

  // Shuffle matrix
  const shuffleMatrix = useCallback(() => {
    const currentMode = modes.find(m => m.id === config.mode);
    if (!currentMode) return;

    // Create all possible combinations
    const allCombos = [];
    for (const llm of llmBlocks) {
      for (const persona of personas) {
        allCombos.push([llm.id, persona.id]);
      }
    }

    // Shuffle and take the same number as the current matrix
    const targetCount = config.matrix?.length || currentMode.default_matrix.length;
    const shuffled = [...allCombos].sort(() => Math.random() - 0.5);
    const newMatrix = shuffled.slice(0, targetCount);

    onConfigChange({ ...config, matrix: newMatrix });
  }, [config, modes, llmBlocks, personas, onConfigChange]);

  // Select all matrix cells
  const selectAllMatrix = () => {
    const allCombos = [];
    for (const llm of llmBlocks) {
      for (const persona of personas) {
        allCombos.push([llm.id, persona.id]);
      }
    }
    onConfigChange({ ...config, matrix: allCombos });
  };

  // Clear all matrix cells
  const clearAllMatrix = () => {
    onConfigChange({ ...config, matrix: [] });
  };

  if (loading) {
    return <div className="mode-selector loading">Loading...</div>;
  }

  if (error) {
    return <div className="mode-selector error">{error}</div>;
  }

  const currentMode = modes.find(m => m.id === config.mode);

  return (
    <div className="mode-selector">
      {/* Step indicators */}
      <div className="step-indicators">
        <div className="step-indicator">
          <span className="step-number">1</span>
          <span className="step-label">原稿作成</span>
        </div>
        <div className="step-arrow">→</div>
        <div className="step-indicator">
          <span className="step-number">2</span>
          <span className="step-label">記者評価</span>
        </div>
        <div className="step-arrow">→</div>
        <div className="step-indicator">
          <span className="step-number">3</span>
          <span className="step-label">最終執筆</span>
        </div>
      </div>

      {/* Preset selection */}
      <div className="preset-section">
        <div className="preset-buttons">
          {modes.map((mode) => (
            <button
              key={mode.id}
              className={`preset-button ${config.mode === mode.id ? 'active' : ''} ${mode.id}`}
              onClick={() => handleModeChange(mode.id)}
              disabled={disabled}
            >
              <span className="preset-name">{mode.name_ja}</span>
              <span className="preset-info">{mode.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Configuration grid */}
      <div className="config-grid">
        {/* STEP 1: Writers */}
        <div className="config-section step1">
          <div className="section-header">
            <span className="section-title">STEP 1: ライター</span>
            <span className="section-count">{config.writers?.length || 0}モデル</span>
          </div>
          <div className="llm-toggles">
            {llmBlocks.map((block) => (
              <button
                key={block.id}
                className={`llm-toggle ${config.writers?.includes(block.id) ? 'active' : ''}`}
                onClick={() => handleWriterToggle(block.id)}
                disabled={disabled}
                title={block.description}
              >
                {block.name}
              </button>
            ))}
          </div>
        </div>

        {/* STEP 2: Evaluation Matrix */}
        <div className="config-section step2">
          <div className="section-header">
            <span className="section-title">STEP 2: 評価マトリクス</span>
            <div className="matrix-actions">
              <button
                className="matrix-action-btn"
                onClick={selectAllMatrix}
                disabled={disabled}
                title="全て選択"
              >
                全選択
              </button>
              <button
                className="matrix-action-btn"
                onClick={clearAllMatrix}
                disabled={disabled}
                title="全て解除"
              >
                クリア
              </button>
              <button
                className="shuffle-button"
                onClick={shuffleMatrix}
                disabled={disabled}
                title="組み合わせをシャッフル"
              >
                Shuffle
              </button>
            </div>
          </div>

          {/* Interactive Matrix Grid */}
          <div className="matrix-grid">
            <div className="matrix-header-row">
              <div className="matrix-corner"></div>
              {llmBlocks.map((block) => (
                <div key={block.id} className="matrix-col-header">
                  {block.name.split(' ')[0]}
                </div>
              ))}
            </div>
            {personas.map((persona) => (
              <div key={persona.id} className="matrix-row">
                <div className="matrix-row-header">{persona.name}</div>
                {llmBlocks.map((block) => (
                  <button
                    key={`${block.id}-${persona.id}`}
                    className={`matrix-cell ${isMatrixCellActive(block.id, persona.id) ? 'active' : ''}`}
                    onClick={() => handleMatrixToggle(block.id, persona.id)}
                    disabled={disabled}
                    title={`${block.name} × ${persona.name}`}
                  >
                    {isMatrixCellActive(block.id, persona.id) ? '✓' : ''}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="matrix-count">
            合計 {config.matrix?.length || 0} 評価
          </div>
        </div>

        {/* STEP 3: Editor */}
        <div className="config-section step3">
          <div className="section-header">
            <span className="section-title">STEP 3: 最終執筆</span>
          </div>
          <div className="editor-select">
            {llmBlocks.map((block) => (
              <button
                key={block.id}
                className={`editor-button ${config.editor === block.id ? 'active' : ''}`}
                onClick={() => handleEditorChange(block.id)}
                disabled={disabled}
              >
                {block.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Criticism level slider */}
      <div className="criticism-section">
        <div className="criticism-header">
          <span className="criticism-label">批判度</span>
          <span className="criticism-value">
            {criticismLevels[config.criticismLevel]?.name || '標準'}
          </span>
        </div>
        <div className="criticism-slider-container">
          <span className="slider-label left">寛容</span>
          <input
            type="range"
            min="1"
            max="5"
            value={config.criticismLevel || 3}
            onChange={(e) => handleCriticismChange(e.target.value)}
            disabled={disabled}
            className="criticism-slider"
          />
          <span className="slider-label right">厳格</span>
        </div>
      </div>

      {/* Estimates */}
      {currentMode && (
        <div className="estimates">
          <span>約{currentMode.estimated_time_min}分</span>
          <span>約{currentMode.estimated_cost_yen}円</span>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import CopyButton from './CopyButton';
import './Stage2.css';

function deAnonymizeText(text, labelToModel) {
  if (!labelToModel) return text;

  let result = text;
  // Replace each "案X" with the actual model name
  Object.entries(labelToModel).forEach(([label, llmId]) => {
    // llmId is now just the ID (like "opus"), not the full model path
    result = result.replace(new RegExp(label, 'g'), `**${label}**`);
  });
  return result;
}

export default function Stage2({ rankings, labelToModel, aggregateRankings, personaBreakdown, crossTable }) {
  const [activeTab, setActiveTab] = useState(0);
  const [viewMode, setViewMode] = useState('evaluations'); // 'evaluations' | 'aggregate' | 'cross'

  if (!rankings || rankings.length === 0) {
    return null;
  }

  return (
    <div className="stage stage2">
      <h3 className="stage-title">Stage 2: 記者評価・ランキング</h3>

      <div className="view-mode-tabs">
        <button
          className={`view-mode-tab ${viewMode === 'evaluations' ? 'active' : ''}`}
          onClick={() => setViewMode('evaluations')}
        >
          詳細評価
        </button>
        <button
          className={`view-mode-tab ${viewMode === 'aggregate' ? 'active' : ''}`}
          onClick={() => setViewMode('aggregate')}
        >
          総合ランキング
        </button>
        {crossTable && crossTable.data && Object.keys(crossTable.data).length > 0 && (
          <button
            className={`view-mode-tab ${viewMode === 'cross' ? 'active' : ''}`}
            onClick={() => setViewMode('cross')}
          >
            クロステーブル
          </button>
        )}
      </div>

      {viewMode === 'evaluations' && (
        <div className="evaluations-view">
          <p className="stage-description">
            各記者ペルソナがプレスリリース案を評価しました。
            案A、案B等は匿名で評価され、下記では読みやすさのため<strong>太字</strong>で表示しています。
          </p>

          <div className="tabs">
            {rankings.map((rank, index) => (
              <button
                key={index}
                className={`tab ${activeTab === index ? 'active' : ''}`}
                onClick={() => setActiveTab(index)}
              >
                <span className="tab-persona">{rank.persona_name || rank.persona_id || rank.persona}</span>
                <span className="tab-model">
                  {rank.llm_name || rank.model?.split('/')[1] || rank.model}
                </span>
              </button>
            ))}
          </div>

          <div className="tab-content">
            <div className="evaluation-header">
              <div className="evaluation-header-left">
                <span className="persona-badge">{rankings[activeTab].persona_name || rankings[activeTab].persona_id || rankings[activeTab].persona}</span>
                <span className="evaluator-model">
                  評価者: {rankings[activeTab].llm_name || rankings[activeTab].model}
                </span>
              </div>
              <CopyButton text={rankings[activeTab].evaluation || rankings[activeTab].ranking || ''} />
            </div>
            <div className="ranking-content markdown-content">
              <ReactMarkdown>
                {deAnonymizeText(rankings[activeTab].evaluation || rankings[activeTab].ranking, labelToModel)}
              </ReactMarkdown>
            </div>

            {rankings[activeTab].parsed_ranking &&
             rankings[activeTab].parsed_ranking.length > 0 && (
              <div className="parsed-ranking">
                <strong>抽出されたランキング:</strong>
                <ol>
                  {rankings[activeTab].parsed_ranking.map((label, i) => (
                    <li key={i}>
                      {labelToModel && labelToModel[label]
                        ? `${label} (${labelToModel[label]})`
                        : label}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'aggregate' && aggregateRankings && aggregateRankings.length > 0 && (
        <div className="aggregate-view">
          <h4>総合ランキング</h4>
          <p className="stage-description">
            全評価者からの評価を集計した結果（平均順位が低いほど高評価）:
          </p>
          <div className="aggregate-list">
            {aggregateRankings.map((agg, index) => (
              <div key={index} className={`aggregate-item rank-${index + 1}`}>
                <span className="rank-position">#{index + 1}</span>
                <span className="rank-label">{agg.label}</span>
                <span className="rank-model">
                  {agg.llm_id || agg.model?.split('/')[1] || agg.model}
                </span>
                <span className="rank-score">
                  平均: {(agg.avg_rank || agg.average_rank)?.toFixed(2)}
                </span>
                <span className="rank-count">
                  ({agg.rankings_count} 票)
                </span>
              </div>
            ))}
          </div>

          {personaBreakdown && Object.keys(personaBreakdown).length > 1 && (
            <div className="persona-breakdown">
              <h4>ペルソナ別ランキング</h4>
              <div className="breakdown-grid">
                {Object.entries(personaBreakdown).map(([personaId, ranks]) => (
                  <div key={personaId} className="breakdown-card">
                    <h5>{personaId}</h5>
                    <ol>
                      {ranks.map((r, i) => (
                        <li key={i}>
                          {r.label} ({(r.avg_rank || r.average_rank)?.toFixed(2)})
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === 'cross' && crossTable && crossTable.data && (
        <div className="cross-table-view">
          <h4>クロステーブル（評価モデル × ペルソナ × ドラフト）</h4>
          <p className="stage-description">
            各評価モデルが各ペルソナとして評価した際のドラフト順位:
          </p>
          <div className="cross-table-container">
            <table className="cross-table">
              <thead>
                <tr>
                  <th>評価者</th>
                  <th>ペルソナ</th>
                  {crossTable.headers?.drafts?.map(draft => (
                    <th key={draft}>{draft}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(crossTable.data).map(([llmId, personas]) =>
                  Object.entries(personas).map(([persona, drafts], pIndex) => (
                    <tr key={`${llmId}-${persona}`}>
                      {pIndex === 0 ? (
                        <td rowSpan={Object.keys(personas).length} className="model-cell">
                          {llmId}
                        </td>
                      ) : null}
                      <td className="persona-cell">{persona}</td>
                      {crossTable.headers?.drafts?.map(draft => (
                        <td key={draft} className={`rank-cell rank-${drafts[draft] || '-'}`}>
                          {drafts[draft] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

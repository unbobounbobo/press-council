import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import CopyButton from './CopyButton';
import './Stage1.css';

export default function Stage1({ responses }) {
  const [activeTab, setActiveTab] = useState(0);

  if (!responses || responses.length === 0) {
    return null;
  }

  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const currentContent = responses[activeTab].content || responses[activeTab].response || '';

  return (
    <div className="stage stage1">
      <h3 className="stage-title">Stage 1: 原稿作成</h3>

      <div className="tabs">
        {responses.map((resp, index) => (
          <button
            key={index}
            className={`tab ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            案{labels[index]}
            <span className="tab-model">
              {resp.llm_name || resp.block_name || resp.model?.split('/')[1] || resp.model}
            </span>
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="draft-header">
          <div className="draft-header-left">
            <span className="draft-label">案{labels[activeTab]}</span>
            <span className="model-name">
              {responses[activeTab].llm_name || responses[activeTab].block_name || responses[activeTab].model}
            </span>
          </div>
          <CopyButton text={currentContent} />
        </div>
        <div className="response-text markdown-content">
          <ReactMarkdown>{currentContent}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

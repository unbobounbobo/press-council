import ReactMarkdown from 'react-markdown';
import CopyButton from './CopyButton';
import './Stage3.css';

export default function Stage3({ finalResponse }) {
  if (!finalResponse) {
    return null;
  }

  const hasError = finalResponse.error;
  const isCreditError = finalResponse.is_credit_error;
  const content = finalResponse.content || finalResponse.response || '';

  return (
    <div className="stage stage3">
      <h3 className="stage-title">Stage 3: 最終執筆</h3>
      <div className={`final-response ${hasError ? 'error' : ''}`}>
        <div className="editor-header">
          <div className="editor-label">
            編集長: {finalResponse.llm_name || finalResponse.model?.split('/')[1] || finalResponse.model}
          </div>
          {!hasError && <CopyButton text={content} />}
        </div>
        {hasError ? (
          <div className="error-content">
            <div className="error-icon">⚠️</div>
            <div className="error-message">
              {finalResponse.content}
            </div>
            {isCreditError && (
              <a
                href="https://openrouter.ai/settings/credits"
                target="_blank"
                rel="noopener noreferrer"
                className="credit-link"
              >
                OpenRouterでクレジットを追加 →
              </a>
            )}
          </div>
        ) : (
          <div className="final-text markdown-content">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

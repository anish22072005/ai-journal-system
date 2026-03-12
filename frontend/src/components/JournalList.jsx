import React, { useState } from 'react';
import axios from 'axios';

const AMBIENCE_ICONS = { forest: '🌲', ocean: '🌊', mountain: '⛰️' };

function AnalysisResult({ result }) {
  if (!result) return null;
  return (
    <div className="analysis-panel">
      <h4>
        🤖 AI Analysis
        {result.cached && <span className="cached-badge">(from cache)</span>}
      </h4>
      <div>
        <span className="emotion-tag">{result.emotion}</span>
      </div>
      {result.keywords?.length > 0 && (
        <div className="keywords">
          {result.keywords.map((kw, i) => (
            <span key={i} className="keyword-tag">{kw}</span>
          ))}
        </div>
      )}
      {result.summary && (
        <p className="analysis-summary">"{result.summary}"</p>
      )}
    </div>
  );
}

function StreamBox({ content }) {
  if (!content) return null;
  return (
    <div className="stream-box">
      <strong style={{ color: '#fff', display: 'block', marginBottom: 6 }}>
        🔴 Streaming Response:
      </strong>
      {content}
    </div>
  );
}

function EntryItem({ entry, apiUrl, onAnalysisSaved }) {
  const [analysis,    setAnalysis]    = useState(entry.analysis || null);
  const [analyzing,   setAnalyzing]   = useState(false);
  const [streaming,   setStreaming]   = useState(false);
  const [streamText,  setStreamText]  = useState('');
  const [analyzeErr,  setAnalyzeErr]  = useState('');

  const handleAnalyze = async () => {
    setAnalyzeErr('');
    setStreamText('');
    setAnalyzing(true);
    try {
      const { data } = await axios.post(`${apiUrl}/api/journal/analyze`, {
        text:    entry.text,
        entryId: entry._id
      });
      setAnalysis(data);
      onAnalysisSaved();
    } catch (err) {
      setAnalyzeErr(err.response?.data?.error || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleStream = () => {
    setAnalyzeErr('');
    setStreamText('');
    setStreaming(true);

    const eventSource = new EventSource(
      // EventSource only does GET; we fall back to fetch for POST SSE
      // Using fetch + ReadableStream to consume the SSE POST endpoint
      undefined
    );

    // Use fetch for POST SSE (EventSource only supports GET)
    fetch(`${apiUrl}/api/journal/analyze/stream`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: entry.text })
    }).then(async (res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.delta) {
              accumulated += parsed.delta;
              setStreamText(accumulated);
            }
            if (parsed.done) {
              // Try to parse the final JSON and show it as analysis
              try {
                const cleaned = parsed.fullContent
                  .replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
                const result = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);
                setAnalysis({
                  emotion:  (result.emotion || 'unknown').toLowerCase(),
                  keywords: Array.isArray(result.keywords) ? result.keywords : [],
                  summary:  result.summary || ''
                });
                onAnalysisSaved();
              } catch { /* keep raw stream text visible */ }
            }
          } catch { /* ignore malformed SSE line */ }
        }
      }
    }).catch(err => {
      setAnalyzeErr(`Stream error: ${err.message}`);
    }).finally(() => {
      setStreaming(false);
    });
  };

  const formattedDate = new Date(entry.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="entry-item">
      <div className="entry-meta">
        <span className="ambience-badge">
          {AMBIENCE_ICONS[entry.ambience]} {entry.ambience}
        </span>
        <span className="entry-date">{formattedDate}</span>
      </div>

      <p className="entry-text">{entry.text}</p>

      <div className="entry-actions">
        <button
          className="btn btn-analyze"
          onClick={handleAnalyze}
          disabled={analyzing || streaming}
        >
          {analyzing ? '⏳ Analyzing…' : '🔍 Analyze'}
        </button>
        <button
          className="btn btn-stream"
          onClick={handleStream}
          disabled={analyzing || streaming}
        >
          {streaming ? '⏳ Streaming…' : '⚡ Stream Analysis'}
        </button>
      </div>

      {analyzeErr && <div className="error-msg" style={{ marginTop: 8 }}>{analyzeErr}</div>}
      {streaming && streamText && <StreamBox content={streamText} />}
      {!streaming && analysis && <AnalysisResult result={analysis} />}
    </div>
  );
}

export default function JournalList({ entries, loading, apiUrl, onAnalysisSaved }) {
  if (loading) {
    return <div className="loading">🌿 Loading entries…</div>;
  }

  if (!entries.length) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>🌱 No entries yet.</p>
          <p>Write your first journal entry to get started!</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <h2>📖 My Entries ({entries.length})</h2>
      </div>
      {entries.map(entry => (
        <EntryItem
          key={entry._id}
          entry={entry}
          apiUrl={apiUrl}
          onAnalysisSaved={onAnalysisSaved}
        />
      ))}
    </div>
  );
}

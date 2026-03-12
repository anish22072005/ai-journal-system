import React from 'react';

export default function InsightsPanel({ insights }) {
  if (!insights) {
    return (
      <div className="card">
        <div className="empty-state">Loading insights…</div>
      </div>
    );
  }

  if (insights.totalEntries === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>No journal entries yet.</p>
          <p style={{ marginTop: 8, fontSize: '.88rem' }}>
            Write your first entry and analyze it to see insights here.
          </p>
        </div>
      </div>
    );
  }

  const stats = [
    { value: insights.totalEntries,                label: 'Total Entries' },
    { value: insights.topEmotion       || '—',     label: 'Top Emotion'   },
    { value: insights.mostUsedAmbience || '—',     label: 'Top Ambience'  }
  ];

  return (
    <div>
      <div className="card">
        <h2>📊 Your Wellness Insights</h2>

        <div className="insights-grid">
          {stats.map(s => (
            <div className="insight-stat" key={s.label}>
              <div className="value" style={{ textTransform: 'capitalize' }}>{s.value}</div>
              <div className="label">{s.label}</div>
            </div>
          ))}
        </div>

        {insights.recentKeywords?.length > 0 ? (
          <div className="keywords-section">
            <h3>Recent Keywords</h3>
            <div className="keywords">
              {insights.recentKeywords.map((kw, i) => (
                <span key={i} className="keyword-tag">{kw}</span>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ color: '#7a9a7a', fontSize: '.88rem' }}>
            Analyze some entries to see keyword trends.
          </p>
        )}

        {!insights.topEmotion && insights.totalEntries > 0 && (
          <p style={{ color: '#7a9a7a', fontSize: '.88rem', marginTop: 12 }}>
            💡 Tip: Click "Analyze" on your entries to unlock emotion insights.
          </p>
        )}
      </div>
    </div>
  );
}

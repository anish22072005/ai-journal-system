import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import JournalForm    from './components/JournalForm';
import JournalList    from './components/JournalList';
import InsightsPanel  from './components/InsightsPanel';

const API_URL = import.meta.env.VITE_API_URL || '';

// Render free tier spins down after inactivity — give it 60s to wake up
axios.defaults.timeout = 60000;

export default function App() {
  const [userId,    setUserId]    = useState('user123');
  const [entries,   setEntries]   = useState([]);
  const [insights,  setInsights]  = useState(null);
  const [activeTab, setActiveTab] = useState('write');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [waking,    setWaking]    = useState(false);

  // Ping backend on mount so Render wakes up before user interacts
  useEffect(() => {
    setWaking(true);
    axios.get(`${API_URL}/health`).finally(() => setWaking(false));
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!userId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(
        `${API_URL}/api/journal/${encodeURIComponent(userId.trim())}`
      );
      setEntries(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch entries');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchInsights = useCallback(async () => {
    if (!userId.trim()) return;
    try {
      const { data } = await axios.get(
        `${API_URL}/api/journal/insights/${encodeURIComponent(userId.trim())}`
      );
      setInsights(data);
    } catch {
      // Insights are non-critical; silently ignore errors
    }
  }, [userId]);

  useEffect(() => {
    if (userId.trim()) {
      fetchEntries();
      fetchInsights();
    }
  }, [userId, fetchEntries, fetchInsights]);

  const handleEntryCreated = (newEntry) => {
    setEntries(prev => [newEntry, ...prev]);
    fetchInsights();
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'entries')  fetchEntries();
    if (tab === 'insights') fetchInsights();
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🌿 ArvyaX Journal</h1>
        <p>Nature-based wellness journaling with AI emotion insights</p>
        <div className="user-bar">
          <label htmlFor="userId">User ID:</label>
          <input
            id="userId"
            className="user-input"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder="Enter your user ID"
          />
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'write' ? 'active' : ''}`}
          onClick={() => handleTabChange('write')}
        >
          ✍️ Write Entry
        </button>
        <button
          className={`tab ${activeTab === 'entries' ? 'active' : ''}`}
          onClick={() => handleTabChange('entries')}
        >
          📖 My Entries {entries.length > 0 && `(${entries.length})`}
        </button>
        <button
          className={`tab ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => handleTabChange('insights')}
        >
          📊 Insights
        </button>
      </nav>

      <main className="main">
        {waking && (
          <div className="waking-banner">
            ⏳ Waking up backend server — may take up to 50 seconds…
          </div>
        )}
        {error && <div className="error-banner">⚠️ {error}</div>}

        {activeTab === 'write' && (
          <JournalForm
            userId={userId}
            apiUrl={API_URL}
            onEntryCreated={handleEntryCreated}
          />
        )}

        {activeTab === 'entries' && (
          <JournalList
            entries={entries}
            loading={loading}
            apiUrl={API_URL}
            onAnalysisSaved={fetchInsights}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsPanel insights={insights} />
        )}
      </main>
    </div>
  );
}

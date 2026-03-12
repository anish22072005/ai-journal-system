import React, { useState } from 'react';
import axios from 'axios';

const AMBIENCES = [
  { value: 'forest',   label: '🌲 Forest' },
  { value: 'ocean',    label: '🌊 Ocean' },
  { value: 'mountain', label: '⛰️ Mountain' }
];

export default function JournalForm({ userId, apiUrl, onEntryCreated }) {
  const [text,       setText]       = useState('');
  const [ambience,   setAmbience]   = useState('forest');
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState('');
  const [error,      setError]      = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!userId.trim()) {
      setError('Please enter a User ID in the header first.');
      return;
    }
    if (text.trim().length < 5) {
      setError('Please write at least 5 characters in your journal entry.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await axios.post(`${apiUrl}/api/journal`, {
        userId:   userId.trim(),
        ambience,
        text:     text.trim()
      });
      onEntryCreated(data);
      setText('');
      setSuccess('Entry saved! Switch to "My Entries" to analyze it.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save entry. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h2>New Journal Entry</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="ambience">Nature Ambience</label>
          <select
            id="ambience"
            className="select"
            value={ambience}
            onChange={e => setAmbience(e.target.value)}
          >
            {AMBIENCES.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="journalText">How did your nature session make you feel?</label>
          <textarea
            id="journalText"
            className="textarea"
            rows={7}
            maxLength={5000}
            placeholder="Write about your experience, emotions, and reflections…"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <small>{text.length} / 5000 characters</small>
        </div>

        {error   && <div className="error-msg">{error}</div>}
        {success && <div className="success-msg">{success}</div>}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Entry'}
        </button>
      </form>
    </div>
  );
}

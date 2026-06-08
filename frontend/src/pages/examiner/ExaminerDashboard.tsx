import axios from 'axios';
import { useEffect, useState } from 'react';
import api from '../../services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type DashTab = 'questions' | 'sessions';

// — Question Bank —
interface Specialization { id: number; name: string; }
interface Chapter { id: number; name: string; specialization: Specialization; }
interface QAnswer { id: number; content: string; isCorrect: boolean; }
interface Question { id: number; content: string; version: number; status: string; chapter: Chapter; answers: QAnswer[]; }
interface AnswerDraft { content: string; }

// — Sessions —
interface ExamProfile {
  id: number;
  questionCount: number;
  passingScore: number;
  durationMinutes: number;
  isExpert: boolean;
  specialization: Specialization;
}

interface SessionSeat {
  id: number;
  sessionId: number;
  candidateId: number;
  candidateNumber: string;
  isProtocolSigned: boolean;
  startStatus: string;
  candidate: { id: number; name: string; email: string; };
}

interface ExamSession {
  id: number;
  examinerId: number;
  examProfileId: number;
  scheduledTime: string;
  location: string;
  examProfile: ExamProfile;
  examiner: { id: number; name: string; email: string; };
  candidates: SessionSeat[];
}

interface CandidateUser { id: number; name: string; email: string; }

// ── Shared helpers ─────────────────────────────────────────────────────────────

const Q_STATUS_STYLES: Record<string, string> = {
  DRAFT:    'bg-gray-100   text-gray-600',
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100  text-green-700',
  REJECTED: 'bg-red-100    text-red-700',
  ARCHIVED: 'bg-slate-100  text-slate-500',
};

function StatusBadge({ status, styleMap }: { status: string; styleMap?: Record<string, string> }) {
  const map = styleMap ?? Q_STATUS_STYLES;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function axiosMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as Record<string, unknown> | undefined;
    return (d?.error ?? d?.message ?? fallback) as string;
  }
  return fallback;
}

// ══════════════════════════════════════════════════════════════════════════════
// Question Bank tab
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_ANSWERS: AnswerDraft[] = [{ content: '' }, { content: '' }, { content: '' }, { content: '' }];

function QuestionBank() {
  const [questions,    setQuestions]    = useState<Question[]>([]);
  const [chapters,     setChapters]     = useState<Chapter[]>([]);
  const [loadingData,  setLoadingData]  = useState(true);
  const [chapterId,    setChapterId]    = useState('');
  const [content,      setContent]      = useState('');
  const [answers,      setAnswers]      = useState<AnswerDraft[]>(DEFAULT_ANSWERS);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [submitting,   setSubmitting]   = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);
  const [formSuccess,  setFormSuccess]  = useState(false);

  async function fetchAll() {
    try {
      const [qRes, cRes] = await Promise.all([
        api.get<Question[]>('/questions'),
        api.get<Chapter[]>('/questions/chapters'),
      ]);
      setQuestions(qRes.data);
      setChapters(cRes.data);
    } finally {
      setLoadingData(false);
    }
  }
  useEffect(() => { void fetchAll(); }, []);

  function updateAnswer(i: number, val: string) {
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? { content: val } : a)));
  }

  function resetForm() {
    setChapterId(''); setContent(''); setAnswers(DEFAULT_ANSWERS); setCorrectIndex(0); setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null); setFormSuccess(false);
    const filled = answers.filter((a) => a.content.trim());
    if (filled.length < 2) { setFormError('Provide at least 2 answer options.'); return; }
    if (!answers[correctIndex]?.content.trim()) { setFormError('Selected correct answer cannot be empty.'); return; }
    setSubmitting(true);
    try {
      await api.post('/questions', {
        chapterId: Number(chapterId),
        content:   content.trim(),
        answers:   answers
          .filter((a) => a.content.trim())
          .map((a, i) => ({ content: a.content.trim(), isCorrect: i === correctIndex })),
      });
      setFormSuccess(true);
      resetForm();
      const { data } = await api.get<Question[]>('/questions');
      setQuestions(data);
    } catch (err) {
      setFormError(axiosMsg(err, 'Failed to create question.'));
    } finally {
      setSubmitting(false);
    }
  }

  const chaptersBySpec = chapters.reduce<Record<string, Chapter[]>>((acc, ch) => {
    const k = ch.specialization.name;
    if (!acc[k]) acc[k] = [];
    acc[k].push(ch);
    return acc;
  }, {});

  if (loadingData) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm animate-pulse">Loading question bank…</p>
    </div>
  );

  return (
    <div className="flex gap-6 items-start">
      {/* List */}
      <div className="flex-1 min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {questions.length === 0 ? (
          <div className="py-16 text-center"><p className="text-gray-400 text-sm">No questions yet.</p></div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Question', 'Chapter', 'Ver.', 'Status'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {questions.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 max-w-xs"><p className="text-gray-800 line-clamp-2">{q.content}</p></td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <p className="font-medium text-gray-700">{q.chapter.name}</p>
                    <p className="text-xs text-gray-400">{q.chapter.specialization.name}</p>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-center text-gray-500">v{q.version}</td>
                  <td className="px-5 py-4 whitespace-nowrap"><StatusBadge status={q.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create form */}
      <div className="w-96 shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">Create New Question</h2>
        {formSuccess && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3"><p className="text-sm text-green-700">Question created as DRAFT.</p></div>}
        {formError  && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-sm text-red-600">{formError}</p></div>}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="qChapter" className="block text-sm font-medium text-gray-700 mb-1">Chapter</label>
            <select id="qChapter" required value={chapterId} onChange={(e) => setChapterId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select a chapter…</option>
              {Object.entries(chaptersBySpec).map(([spec, chs]) => (
                <optgroup key={spec} label={spec}>
                  {chs.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="qContent" className="block text-sm font-medium text-gray-700 mb-1">Question</label>
            <textarea id="qContent" required rows={3} value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the question body…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              Answers <span className="text-xs font-normal text-gray-400">(select the correct one)</span>
            </p>
            <div className="space-y-2">
              {answers.map((ans, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="correctAnswer" checked={correctIndex === i} onChange={() => setCorrectIndex(i)}
                    className="h-4 w-4 shrink-0 text-blue-600" aria-label={`Mark answer ${i + 1} as correct`} />
                  <input type="text" value={ans.content} onChange={(e) => updateAnswer(i, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ))}
            </div>
          </div>
          <button type="submit" disabled={submitting || !chapterId || !content.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {submitting ? 'Creating…' : 'Create Question'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sessions tab
// ══════════════════════════════════════════════════════════════════════════════

const SEAT_STATUS_STYLES: Record<string, string> = {
  WAITING:    'bg-yellow-100 text-yellow-700',
  AUTHORIZED: 'bg-green-100  text-green-700',
};

function SessionsTab() {
  // — Data —
  const [sessions,       setSessions]       = useState<ExamSession[]>([]);
  const [profiles,       setProfiles]       = useState<ExamProfile[]>([]);
  const [candidateList,  setCandidateList]  = useState<CandidateUser[]>([]);
  const [loadingData,    setLoadingData]    = useState(true);

  // — Detail view —
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);
  const [loadingDetail,   setLoadingDetail]   = useState(false);

  // — Create session form —
  const [createProfileId,    setCreateProfileId]    = useState('');
  const [createLocation,     setCreateLocation]     = useState('');
  const [createScheduledTime, setCreateScheduledTime] = useState('');
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // — Add candidate form —
  const [addCandId,     setAddCandId]     = useState('');
  const [addCandNumber, setAddCandNumber] = useState('');
  const [adding,    setAdding]    = useState(false);
  const [addError,  setAddError]  = useState<string | null>(null);

  // — Authorize —
  const [authorizingId, setAuthorizingId] = useState<number | null>(null);
  const [authError,     setAuthError]     = useState<string | null>(null);

  // — Fetch on mount —
  useEffect(() => { void fetchInitialData(); }, []);

  async function fetchInitialData() {
    setLoadingData(true);
    try {
      const [sessRes, profRes, candRes] = await Promise.all([
        api.get<ExamSession[]>('/sessions'),
        api.get<ExamProfile[]>('/exams/profiles'),
        api.get<CandidateUser[]>('/candidates/list'),
      ]);
      setSessions(sessRes.data);
      setProfiles(profRes.data);
      setCandidateList(candRes.data);
    } finally {
      setLoadingData(false);
    }
  }

  async function openSession(id: number) {
    setLoadingDetail(true);
    setAuthError(null);
    setAddError(null);
    try {
      const { data } = await api.get<ExamSession>(`/sessions/${id}`);
      setSelectedSession(data);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function refreshDetail() {
    if (!selectedSession) return;
    const { data } = await api.get<ExamSession>(`/sessions/${selectedSession.id}`);
    setSelectedSession(data);
    setSessions((prev) => prev.map((s) => (s.id === data.id ? { ...s, ...data } : s)));
  }

  async function handleCreateSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.post('/sessions', {
        examProfileId: Number(createProfileId),
        location:      createLocation.trim(),
        scheduledTime: new Date(createScheduledTime).toISOString(),
      });
      setCreateProfileId(''); setCreateLocation(''); setCreateScheduledTime('');
      const { data } = await api.get<ExamSession[]>('/sessions');
      setSessions(data);
    } catch (err) {
      setCreateError(axiosMsg(err, 'Failed to create session.'));
    } finally {
      setCreating(false);
    }
  }

  async function handleAddCandidate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedSession) return;
    setAddError(null);
    setAdding(true);
    try {
      await api.post(`/sessions/${selectedSession.id}/candidates`, {
        candidateId:     Number(addCandId),
        candidateNumber: addCandNumber.trim(),
      });
      setAddCandId(''); setAddCandNumber('');
      await refreshDetail();
    } catch (err) {
      setAddError(axiosMsg(err, 'Failed to add candidate.'));
    } finally {
      setAdding(false);
    }
  }

  async function handleAuthorize(candidateId: number) {
    if (!selectedSession) return;
    setAuthError(null);
    setAuthorizingId(candidateId);
    try {
      await api.post(`/sessions/${selectedSession.id}/candidates/${candidateId}/authorize`);
      await refreshDetail();
    } catch (err) {
      setAuthError(axiosMsg(err, 'Authorization failed.'));
    } finally {
      setAuthorizingId(null);
    }
  }

  // — Loading skeleton —
  if (loadingData) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm animate-pulse">Loading sessions…</p>
    </div>
  );

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selectedSession) {
    const { examProfile: ep } = selectedSession;
    return (
      <div className="space-y-6">
        {/* Back */}
        <button type="button" onClick={() => setSelectedSession(null)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to Sessions
        </button>

        {/* Session meta */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Session #{selectedSession.id}</h2>
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Exam Profile</p>
              <p className="font-medium text-gray-800">{ep.specialization.name}{ep.isExpert ? ' (Expert)' : ''}</p>
              <p className="text-xs text-gray-400">{ep.questionCount} questions · {ep.passingScore}% pass · {ep.durationMinutes} min</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Scheduled Time</p>
              <p className="font-medium text-gray-800">{new Date(selectedSession.scheduledTime).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Location</p>
              <p className="font-medium text-gray-800">{selectedSession.location}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Examiner</p>
              <p className="font-medium text-gray-800">{selectedSession.examiner.name}</p>
              <p className="text-xs text-gray-400">{selectedSession.examiner.email}</p>
            </div>
          </div>
        </div>

        {/* Add candidate */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Add Candidate</h3>
          {addError && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2">
              <p className="text-sm text-red-600">{addError}</p>
            </div>
          )}
          <form onSubmit={handleAddCandidate} noValidate className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">Candidate</label>
              <select required value={addCandId} onChange={(e) => setAddCandId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Select candidate…</option>
                {candidateList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-600 mb-1">Candidate #</label>
              <input type="text" required value={addCandNumber} onChange={(e) => setAddCandNumber(e.target.value)}
                placeholder="e.g. C-001"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={adding || !addCandId || !addCandNumber.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
        </div>

        {/* Candidates table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">
              Registered Candidates
              <span className="ml-2 text-sm font-normal text-gray-400">({selectedSession.candidates.length})</span>
            </h3>
            {authError && <p className="text-xs text-red-600">{authError}</p>}
          </div>
          {selectedSession.candidates.length === 0 ? (
            <div className="py-12 text-center"><p className="text-gray-400 text-sm">No candidates registered yet.</p></div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Cand. #', 'Name', 'Email', 'Protocol', 'Start Status', 'Action'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedSession.candidates.map((seat) => {
                  const isBusy       = authorizingId === seat.candidateId;
                  const canAuthorize = seat.isProtocolSigned && seat.startStatus === 'WAITING';
                  return (
                    <tr key={seat.id} className={`transition-colors ${isBusy ? 'opacity-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-5 py-4 font-mono font-medium text-gray-700">{seat.candidateNumber}</td>
                      <td className="px-5 py-4 font-medium text-gray-800 whitespace-nowrap">{seat.candidate.name}</td>
                      <td className="px-5 py-4 text-gray-500 whitespace-nowrap">{seat.candidate.email}</td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {seat.isProtocolSigned
                          ? <span className="text-xs font-semibold text-green-600">Signed ✓</span>
                          : <span className="text-xs font-semibold text-yellow-600">Pending</span>}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusBadge status={seat.startStatus} styleMap={SEAT_STATUS_STYLES} />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={!canAuthorize || isBusy}
                          onClick={() => void handleAuthorize(seat.candidateId)}
                          title={
                            seat.startStatus === 'AUTHORIZED' ? 'Already authorized'
                              : !seat.isProtocolSigned ? 'Protocol not signed yet'
                              : 'Authorize to start exam'
                          }
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {seat.startStatus === 'AUTHORIZED' ? 'Authorized ✓' : isBusy ? 'Authorizing…' : 'Authorize'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6 items-start">
      {/* Sessions table */}
      <div className="flex-1 min-w-0 space-y-3">
        {loadingDetail && (
          <p className="text-gray-400 text-sm animate-pulse">Loading session details…</p>
        )}
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-gray-400 text-sm">No sessions yet. Create the first one →</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['#', 'Scheduled Time', 'Location', 'Profile', 'Status'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map((s) => {
                  const isPast = new Date(s.scheduledTime) < new Date();
                  return (
                    <tr key={s.id} onClick={() => void openSession(s.id)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors">
                      <td className="px-5 py-4 font-mono text-gray-500">#{s.id}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-gray-800">{new Date(s.scheduledTime).toLocaleString()}</td>
                      <td className="px-5 py-4 text-gray-700">{s.location}</td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800">{s.examProfile.specialization.name}</p>
                        <p className="text-xs text-gray-400">{s.examProfile.questionCount}q · {s.examProfile.durationMinutes}min{s.examProfile.isExpert ? ' · Expert' : ''}</p>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isPast ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>
                          {isPast ? 'Completed' : 'Upcoming'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create session form */}
      <div className="w-80 shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Create New Session</h2>
        {createError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-600">{createError}</p>
          </div>
        )}
        <form onSubmit={handleCreateSession} noValidate className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exam Profile</label>
            <select required value={createProfileId} onChange={(e) => setCreateProfileId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select profile…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.specialization.name} — {p.questionCount}q / {p.passingScore}% / {p.durationMinutes}min{p.isExpert ? ' (Expert)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" required value={createLocation} onChange={(e) => setCreateLocation(e.target.value)}
              placeholder="Exam Hall A"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Time</label>
            <input type="datetime-local" required value={createScheduledTime} onChange={(e) => setCreateScheduledTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <button type="submit"
            disabled={creating || !createProfileId || !createLocation.trim() || !createScheduledTime}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {creating ? 'Creating…' : 'Create Session'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Root component with tab bar
// ══════════════════════════════════════════════════════════════════════════════

export default function ExaminerDashboard() {
  const [activeTab, setActiveTab] = useState<DashTab>('questions');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header + tabs */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Examiner Dashboard</h1>
        <div className="mt-4 flex gap-1 border-b border-gray-200">
          {([
            { key: 'questions', label: 'Question Bank' },
            { key: 'sessions',  label: 'Exam Sessions' },
          ] as { key: DashTab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'questions' ? <QuestionBank /> : <SessionsTab />}
    </div>
  );
}

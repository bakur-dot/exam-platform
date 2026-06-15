import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import { axiosMsg } from '../../utils/axiosMsg';
import { SkeletonTable, Skeleton } from '../../components/ui/Skeleton';
import SessionReport from '../../components/reports/SessionReport';
import type { SessionReportData } from '../../components/reports/SessionReport';

// ── Types ──────────────────────────────────────────────────────────────────────

type DashTab = 'questions' | 'sessions' | 'grading';

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

// — Project Assessment —
interface GradeMistake {
  id: number;
  description: string;
  penaltyPoints: number;
}

interface GradeProject {
  attemptProjectId: number;
  projectId: number;
  title: string;
  description: string;
  fileUrl: string | null;
  markedMistakeIds: number[];
  allMistakes: GradeMistake[];
}

interface GradeAttempt {
  attemptId: number;
  candidateId: number;
  candidateName: string;
  candidateEmail: string;
  candidateNumber: string;
  status: string;
  startTime: string;
  examProfile: { id: number; specializationName: string; requiresProjects: boolean; };
  projects: GradeProject[];
}

type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

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
    setChapterId(''); setContent(''); setAnswers(DEFAULT_ANSWERS); setCorrectIndex(0);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const filled = answers.filter((a) => a.content.trim());
    if (filled.length < 2) { toast.error('Provide at least 2 answer options.'); return; }
    if (!answers[correctIndex]?.content.trim()) { toast.error('Selected correct answer cannot be empty.'); return; }
    setSubmitting(true);
    try {
      await api.post('/questions', {
        chapterId: Number(chapterId),
        content:   content.trim(),
        answers:   answers
          .filter((a) => a.content.trim())
          .map((a, i) => ({ content: a.content.trim(), isCorrect: i === correctIndex })),
      });
      toast.success('Question created as DRAFT.');
      resetForm();
      const { data } = await api.get<Question[]>('/questions');
      setQuestions(data);
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to create question.'));
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

  if (loadingData) return <SkeletonTable rows={6} cols={4} />;

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
  const [sessions,      setSessions]      = useState<ExamSession[]>([]);
  const [profiles,      setProfiles]      = useState<ExamProfile[]>([]);
  const [candidateList, setCandidateList] = useState<CandidateUser[]>([]);
  const [loadingData,   setLoadingData]   = useState(true);

  // — Detail view —
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);
  const [loadingDetail,   setLoadingDetail]   = useState(false);

  // — Create session form —
  const [createProfileId,     setCreateProfileId]     = useState('');
  const [createLocation,      setCreateLocation]      = useState('');
  const [createScheduledTime, setCreateScheduledTime] = useState('');
  const [creating,            setCreating]            = useState(false);

  // — Add candidate form —
  const [addCandId,     setAddCandId]     = useState('');
  const [addCandNumber, setAddCandNumber] = useState('');
  const [adding,        setAdding]        = useState(false);

  // — Authorize —
  const [authorizingId, setAuthorizingId] = useState<number | null>(null);

  // — Session report —
  const [sessionReport, setSessionReport] = useState<SessionReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

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
      toast.success('Session created.');
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to create session.'));
    } finally {
      setCreating(false);
    }
  }

  async function handleAddCandidate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedSession) return;
    setAdding(true);
    try {
      await api.post(`/sessions/${selectedSession.id}/candidates`, {
        candidateId:     Number(addCandId),
        candidateNumber: addCandNumber.trim(),
      });
      setAddCandId(''); setAddCandNumber('');
      await refreshDetail();
      toast.success('Candidate added.');
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to add candidate.'));
    } finally {
      setAdding(false);
    }
  }

  async function handleAuthorize(candidateId: number) {
    if (!selectedSession) return;
    setAuthorizingId(candidateId);
    try {
      await api.post(`/sessions/${selectedSession.id}/candidates/${candidateId}/authorize`);
      await refreshDetail();
      toast.success('Candidate authorized.');
    } catch (err) {
      toast.error(axiosMsg(err, 'Authorization failed.'));
    } finally {
      setAuthorizingId(null);
    }
  }

  async function handleViewReport(sessionId: number) {
    setLoadingReport(true);
    try {
      const { data } = await api.get<SessionReportData>(`/reports/sessions/${sessionId}`);
      setSessionReport(data);
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to load session report.'));
    } finally {
      setLoadingReport(false);
    }
  }

  if (loadingData) return <SkeletonTable rows={5} cols={5} />;

  // ── Session report view ──────────────────────────────────────────────────────
  if (selectedSession && sessionReport) {
    return (
      <SessionReport
        data={sessionReport}
        onClose={() => setSessionReport(null)}
      />
    );
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selectedSession) {
    const { examProfile: ep } = selectedSession;
    const isPastSession = new Date(selectedSession.scheduledTime) < new Date();
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Back + report button */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button type="button" onClick={() => { setSelectedSession(null); setSessionReport(null); }}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
            ← Back to Sessions
          </button>
          {isPastSession && (
            <button
              type="button"
              onClick={() => void handleViewReport(selectedSession.id)}
              disabled={loadingReport}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loadingReport ? 'Loading…' : 'View Session Report'}
            </button>
          )}
        </div>

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
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <SkeletonTable rows={1} cols={5} />
          </div>
        )}
        {!loadingDetail && sessions.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-gray-400 text-sm">No sessions yet. Create the first one →</p>
          </div>
        )}
        {!loadingDetail && sessions.length > 0 && (
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
// Project Assessment tab
// ══════════════════════════════════════════════════════════════════════════════

function ProjectAssessmentTab() {
  const [sessions,        setSessions]        = useState<ExamSession[]>([]);
  const [loadingInit,     setLoadingInit]     = useState(true);
  const [sessionId,       setSessionId]       = useState('');
  const [attempts,        setAttempts]        = useState<GradeAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [expandedId,      setExpandedId]      = useState<number | null>(null);
  const [marksMap,        setMarksMap]        = useState<Record<number, number[]>>({});
  const [syncState,       setSyncState]       = useState<Record<number, SyncState>>({});
  const [syncErrors,      setSyncErrors]      = useState<Record<number, string>>({});

  useEffect(() => {
    async function init() {
      try {
        const { data } = await api.get<ExamSession[]>('/sessions');
        setSessions(data);
      } finally {
        setLoadingInit(false);
      }
    }
    void init();
  }, []);

  async function loadAttempts() {
    if (!sessionId) return;
    setLoadingAttempts(true);
    setAttempts([]);
    setExpandedId(null);
    setMarksMap({});
    setSyncState({});
    setSyncErrors({});
    try {
      const { data } = await api.get<GradeAttempt[]>(`/exams/sessions/${sessionId}/project-grading`);
      setAttempts(data);
      const init: Record<number, number[]> = {};
      for (const a of data) {
        for (const p of a.projects) {
          init[p.attemptProjectId] = [...p.markedMistakeIds];
        }
      }
      setMarksMap(init);
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to load grading list.'));
    } finally {
      setLoadingAttempts(false);
    }
  }

  async function handleToggle(
    attemptId:        number,
    attemptProjectId: number,
    projectId:        number,
    mistakeId:        number
  ) {
    const previous = marksMap[attemptProjectId] ?? [];
    const current  = new Set(previous);
    if (current.has(mistakeId)) {
      current.delete(mistakeId);
    } else {
      current.add(mistakeId);
    }
    const newIds = [...current];

    setMarksMap(m => ({ ...m, [attemptProjectId]: newIds }));
    setSyncState(s => ({ ...s, [attemptProjectId]: 'syncing' }));
    setSyncErrors(e => ({ ...e, [attemptProjectId]: '' }));

    try {
      await api.post(`/exams/${attemptId}/projects/marks`, { projectId, mistakeIds: newIds });
      setSyncState(s => ({ ...s, [attemptProjectId]: 'synced' }));
      setTimeout(
        () => setSyncState(s => ({ ...s, [attemptProjectId]: 'idle' })),
        2000
      );
    } catch (err) {
      setMarksMap(m => ({ ...m, [attemptProjectId]: previous }));
      setSyncState(s => ({ ...s, [attemptProjectId]: 'error' }));
      setSyncErrors(e => ({ ...e, [attemptProjectId]: axiosMsg(err, 'Sync failed.') }));
      toast.error(axiosMsg(err, 'Failed to sync marks.'));
    }
  }

  if (loadingInit) return <SkeletonTable rows={4} cols={3} />;

  return (
    <div className="space-y-5">
      {/* Session picker */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-64">
          <label className="block text-xs font-medium text-gray-600 mb-1">Exam Session</label>
          <select
            value={sessionId}
            onChange={(e) => { setSessionId(e.target.value); setAttempts([]); }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select a session…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} — {s.examProfile.specialization.name}
                {s.examProfile.isExpert ? ' (Expert)' : ''}{' '}
                · {new Date(s.scheduledTime).toLocaleDateString()}
                · {s.location}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void loadAttempts()}
          disabled={!sessionId || loadingAttempts}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loadingAttempts ? 'Loading…' : 'Load Grading List'}
        </button>
        {attempts.length > 0 && (
          <button
            type="button"
            onClick={() => void loadAttempts()}
            disabled={loadingAttempts}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Refresh
          </button>
        )}
      </div>

      {loadingAttempts && <SkeletonTable rows={3} cols={3} />}

      {/* No results */}
      {!loadingAttempts && sessionId && attempts.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <p className="text-gray-500 text-sm font-medium">No active project evaluations</p>
          <p className="text-gray-400 text-xs mt-1">
            Candidates will appear here once they start an exam that requires project assessment.
          </p>
        </div>
      )}

      {/* Candidate grading list */}
      {attempts.map((attempt) => {
        const isExpanded = expandedId === attempt.attemptId;

        return (
          <div
            key={attempt.attemptId}
            className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
          >
            {/* Candidate header row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : attempt.attemptId)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm font-bold text-gray-600 bg-gray-100 rounded px-2 py-0.5">
                  #{attempt.candidateNumber}
                </span>
                <div>
                  <p className="font-medium text-gray-800">{attempt.candidateName}</p>
                  <p className="text-xs text-gray-400">{attempt.candidateEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {attempt.projects.length} project{attempt.projects.length !== 1 ? 's' : ''}
                </span>
                <span className="inline-block rounded-full bg-yellow-100 text-yellow-700 px-2.5 py-0.5 text-xs font-semibold">
                  {attempt.status}
                </span>
                <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Expanded grading panel */}
            {isExpanded && (
              <div className="border-t border-gray-100 px-5 py-5 space-y-6 bg-gray-50/50 animate-fade-in">
                {attempt.projects.map((project) => {
                  const marked       = new Set(marksMap[project.attemptProjectId] ?? []);
                  const totalPenalty = [...marked]
                    .reduce((sum, id) => {
                      const m = project.allMistakes.find(m => m.id === id);
                      return sum + (m?.penaltyPoints ?? 0);
                    }, 0);
                  const maxPenalty = project.allMistakes.reduce((s, m) => s + m.penaltyPoints, 0);
                  const projScore  = Math.max(0, 100 - totalPenalty);
                  const sync       = syncState[project.attemptProjectId] ?? 'idle';
                  const syncErr    = syncErrors[project.attemptProjectId] ?? '';

                  return (
                    <div
                      key={project.attemptProjectId}
                      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                    >
                      {/* Project header */}
                      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800">{project.title}</h3>
                          {project.description && (
                            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                              {project.description}
                            </p>
                          )}
                          {project.fileUrl && (
                            <a
                              href={`http://localhost:3000${project.fileUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                            >
                              View Project PDF ↗
                            </a>
                          )}
                        </div>

                        {/* Sync indicator */}
                        <div className="shrink-0 text-right">
                          {sync === 'syncing' && (
                            <span className="text-xs text-blue-500 animate-pulse">Syncing…</span>
                          )}
                          {sync === 'synced' && (
                            <span className="text-xs font-semibold text-green-600">Marks Synced ✓</span>
                          )}
                          {sync === 'error' && (
                            <span className="text-xs font-semibold text-red-600" title={syncErr}>
                              Sync Failed ✗
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Score preview bar */}
                      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-500">Projected Score:</span>
                          <span className={`font-bold tabular-nums text-base ${
                            projScore >= 80 ? 'text-green-700' :
                            projScore >= 60 ? 'text-yellow-700' :
                                              'text-red-700'
                          }`}>
                            {projScore.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-4 w-px bg-gray-300" />
                        <div className="text-xs text-gray-500">
                          Penalty:{' '}
                          <span className={`font-semibold tabular-nums ${totalPenalty > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                            {totalPenalty.toFixed(1)}
                          </span>
                          {' / '}
                          <span className="text-gray-400">{maxPenalty.toFixed(1)} pts max</span>
                        </div>
                        <div className="flex-1 min-w-24">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                projScore >= 80 ? 'bg-green-500' :
                                projScore >= 60 ? 'bg-yellow-500' :
                                                  'bg-red-500'
                              }`}
                              style={{ width: `${projScore}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Mistakes checklist */}
                      {project.allMistakes.length === 0 ? (
                        <div className="px-5 py-6 text-center">
                          <p className="text-sm text-gray-400">No mistakes defined for this project.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {project.allMistakes.map((mistake) => {
                            const isChecked = marked.has(mistake.id);
                            const isSyncing = sync === 'syncing';
                            return (
                              <label
                                key={mistake.id}
                                className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors select-none ${
                                  isChecked
                                    ? 'bg-red-50 hover:bg-red-100/70'
                                    : 'hover:bg-gray-50'
                                } ${isSyncing ? 'opacity-60 pointer-events-none' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isSyncing}
                                  onChange={() => void handleToggle(
                                    attempt.attemptId,
                                    project.attemptProjectId,
                                    project.projectId,
                                    mistake.id
                                  )}
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded accent-red-600"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm leading-relaxed ${isChecked ? 'text-red-800 font-medium' : 'text-gray-700'}`}>
                                    {mistake.description}
                                  </p>
                                </div>
                                <span className={`shrink-0 text-xs font-semibold tabular-nums rounded-full px-2 py-0.5 ${
                                  isChecked ? 'bg-red-200 text-red-800' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  -{mistake.penaltyPoints}pts
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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
            { key: 'grading',   label: 'Project Assessment' },
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

      <div key={activeTab} className="animate-fade-in">
        {activeTab === 'questions' && <QuestionBank />}
        {activeTab === 'sessions'  && <SessionsTab />}
        {activeTab === 'grading'   && <ProjectAssessmentTab />}
      </div>
    </div>
  );
}

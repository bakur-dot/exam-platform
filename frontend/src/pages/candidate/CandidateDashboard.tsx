import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import { axiosMsg } from '../../utils/axiosMsg';
import { downloadBlob } from '../../utils/downloadBlob';
import { Skeleton, SkeletonTable } from '../../components/ui/Skeleton';
import AttemptDetails from '../../components/reports/AttemptDetails';
import type { AttemptDetailsData } from '../../components/reports/AttemptDetails';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType = 'DIPLOMA' | 'EXPERIENCE' | 'ID_CARD' | 'PHOTO';
type DocStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';

interface CandidateDocument {
  id: number;
  docType: DocType;
  status: DocStatus;
  documentUrl: string;
  rejectionReason: string | null;
}

interface SessionSeat {
  id: number;
  sessionId: number;
  candidateId: number;
  candidateNumber: string;
  isProtocolSigned: boolean;
  startStatus: 'PENDING' | 'AUTHORIZED';
  session: {
    id: number;
    scheduledTime: string;
    location: string;
    examProfile: {
      id: number;
      specialization: { id: number; name: string };
      durationMinutes: number;
      questionCount: number;
      passingScore: number;
      isExpert: boolean;
      requiresProjects: boolean;
    };
    examiner: { id: number; name: string };
  };
}

interface Question {
  id: number;
  content: string;
  answers: { id: number; content: string }[];
  chapter: { id: number; name: string };
}

interface ProjectMistake {
  id: number;
  description: string;
  penaltyPoints: number;
}

interface Project {
  id: number;
  name: string;
  description: string;
  mistakes: ProjectMistake[];
  savedMistakeIds?: number[];
}

interface AttemptMeta {
  id: number;
  sessionId: number;
  startTime: string;
  expiresAt: string;
  status: string;
}

interface ExamMeta {
  profileId: number;
  specializationName: string;
  durationMinutes: number;
  questionCount: number;
  passingScore: number;
  isExpert: boolean;
  requiresProjects: boolean;
}

interface ExamResult {
  attemptId: number;
  status: string;
  finalScore: number;
  passingScore: number;
  passed: boolean;
  correctCount: number;
  answeredCount: number;
  totalAssigned: number;
  avgProjectScore: number | null;
  projectScores: { projectId: number; score: number }[];
}

type SavedAnswers = Record<number, number | null>;
type MarkedMistakes = Record<number, number[]>;
type ViewKind = 'loading' | 'dashboard' | 'exam' | 'result';

interface HistoryItem {
  id: number;
  startTime: string;
  endTime: string | null;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'TIMED_OUT';
  finalScore: number | null;
  passed: boolean | null;
  examProfile: {
    id: number;
    specializationName: string;
    passingScore: number;
    isExpert: boolean;
  };
}

interface CandidateAppeal {
  id: number;
  attemptId: number;
  status: 'PENDING' | 'REVIEWED';
  decisionNotes: string | null;
  isScoreChanged: boolean;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES: DocType[] = ['DIPLOMA', 'EXPERIENCE', 'ID_CARD', 'PHOTO'];

const DOC_LABELS: Record<DocType, string> = {
  DIPLOMA:    'Diploma / Degree',
  EXPERIENCE: 'Work Experience',
  ID_CARD:    'Government ID',
  PHOTO:      'Passport Photo',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DocStatus }) {
  const styles: Record<DocStatus, string> = {
    APPROVED: 'bg-green-100 text-green-700',
    PENDING:  'bg-yellow-100 text-yellow-700',
    REJECTED: 'bg-red-100 text-red-700',
    RETURNED: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

interface DocCardProps {
  docType: DocType;
  doc: CandidateDocument | undefined;
  onUpload: (docType: DocType, file: File) => Promise<void>;
  uploading: boolean;
}

function DocCard({ docType, doc, onUpload, uploading }: DocCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const canUpload = !doc || doc.status !== 'APPROVED';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedFile) return;
    await onUpload(docType, selectedFile);
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{docType}</p>
          <h3 className="mt-0.5 text-base font-semibold text-gray-800">{DOC_LABELS[docType]}</h3>
        </div>
        {doc ? (
          <StatusBadge status={doc.status} />
        ) : (
          <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
            NOT SUBMITTED
          </span>
        )}
      </div>

      {doc && (doc.status === 'REJECTED' || doc.status === 'RETURNED') && doc.rejectionReason && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <p className="text-xs font-medium text-red-600">Reason:</p>
          <p className="mt-0.5 text-sm text-red-700">{doc.rejectionReason}</p>
        </div>
      )}

      {canUpload && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-auto">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          />
          <button
            type="submit"
            disabled={!selectedFile || uploading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? 'Uploading…' : doc ? 'Re-upload' : 'Upload'}
          </button>
        </form>
      )}

      {doc?.status === 'APPROVED' && (
        <p className="mt-auto text-xs text-green-600 font-medium">
          Document verified. No further action required.
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CandidateDashboard() {
  // View
  const [viewKind, setViewKind] = useState<ViewKind>('loading');
  const [dashTab, setDashTab]   = useState<'documents' | 'exams' | 'history'>('documents');

  // Dashboard data
  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [eligible, setEligible]   = useState(false);
  const [sessions, setSessions]   = useState<SessionSeat[]>([]);

  // Exam engine state
  const [attempt,       setAttempt]       = useState<AttemptMeta | null>(null);
  const [exam,          setExam]          = useState<ExamMeta | null>(null);
  const [questions,     setQuestions]     = useState<Question[]>([]);
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [answers,       setAnswers]       = useState<SavedAnswers>({});
  const [markedMistakes, setMarkedMistakes] = useState<MarkedMistakes>({});
  const [navIdx,        setNavIdx]        = useState(0);
  const [timeLeft,      setTimeLeft]      = useState(0);
  const [savingKey,     setSavingKey]     = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);

  // Result
  const [result, setResult] = useState<ExamResult | null>(null);

  // History tab state
  const [historyItems,    setHistoryItems]    = useState<HistoryItem[]>([]);
  const [historyLoaded,   setHistoryLoaded]   = useState(false);
  const [historyLoading,  setHistoryLoading]  = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<AttemptDetailsData | null>(null);
  const [loadingDetails,  setLoadingDetails]  = useState(false);
  const [downloadingKey,  setDownloadingKey]  = useState<string | null>(null);

  // Appeals state
  const [appeals,         setAppeals]         = useState<Record<number, CandidateAppeal>>({});
  const [appealAttemptId, setAppealAttemptId] = useState<number | null>(null);
  const [appealFile,      setAppealFile]      = useState<File | null>(null);
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  // UI feedback
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const [signingId,     setSigningId]     = useState<number | null>(null);
  const [startingId,    setStartingId]    = useState<number | null>(null);

  const autoSubmittedRef = useRef(false);

  // ── Initialisation: check for active exam first ────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const { data } = await api.get('/exams/active');
        enterExam(data);
      } catch {
        await loadDashboard();
      }
    }
    void init();
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (viewKind !== 'exam' || !attempt) return;

    const expiresAtMs = new Date(attempt.expiresAt).getTime();
    const attemptId   = attempt.id;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        api.post<ExamResult>(`/exams/${attemptId}/finish`)
          .then(({ data }) => { setResult(data); setViewKind('result'); })
          .catch((err: unknown) => toast.error(axiosMsg(err, 'Auto-submit failed.')));
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [viewKind, attempt]);

  // ── Data loaders ──────────────────────────────────────────────────────────

  async function loadDashboard() {
    try {
      const [docsRes, eligRes, sessionsRes] = await Promise.all([
        api.get<CandidateDocument[]>('/candidates/documents'),
        api.get<{ eligible: boolean }>('/candidates/eligibility'),
        api.get<SessionSeat[]>('/sessions/mine'),
      ]);
      setDocuments(docsRes.data);
      setEligible(eligRes.data.eligible);
      setSessions(sessionsRes.data);
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to load dashboard data.'));
    } finally {
      setViewKind('dashboard');
    }
  }

  async function reloadSessions() {
    const { data } = await api.get<SessionSeat[]>('/sessions/mine');
    setSessions(data);
  }

  async function fetchDocs() {
    const [docsRes, eligRes] = await Promise.all([
      api.get<CandidateDocument[]>('/candidates/documents'),
      api.get<{ eligible: boolean }>('/candidates/eligibility'),
    ]);
    setDocuments(docsRes.data);
    setEligible(eligRes.data.eligible);
  }

  // ── Exam helpers ──────────────────────────────────────────────────────────

  function enterExam(data: {
    attempt: AttemptMeta;
    exam: ExamMeta;
    questions: Question[];
    projects: Project[];
    savedAnswers: SavedAnswers;
  }) {
    autoSubmittedRef.current = false;
    setAttempt(data.attempt);
    setExam(data.exam);
    setQuestions(data.questions);
    setProjects(data.projects ?? []);
    setAnswers(data.savedAnswers ?? {});
    const restored: MarkedMistakes = {};
    for (const p of data.projects ?? []) {
      restored[p.id] = p.savedMistakeIds ?? [];
    }
    setMarkedMistakes(restored);
    setNavIdx(0);
    setSubmitting(false);
    setViewKind('exam');
  }

  // ── Actions: documents ────────────────────────────────────────────────────

  async function handleUpload(docType: DocType, file: File) {
    setUploadingType(docType);
    try {
      const form = new FormData();
      form.append('docType', docType);
      form.append('document', file);
      await api.post('/candidates/documents', form);
      await fetchDocs();
      toast.success('Document uploaded successfully.');
    } catch (err) {
      toast.error(axiosMsg(err, 'Upload failed. Please try again.'));
    } finally {
      setUploadingType(null);
    }
  }

  // ── History tab ───────────────────────────────────────────────────────────

  async function loadHistory() {
    if (historyLoaded) return;
    setHistoryLoading(true);
    try {
      const [histRes, appsRes] = await Promise.all([
        api.get<HistoryItem[]>('/reports/history'),
        api.get<CandidateAppeal[]>('/appeals/mine'),
      ]);
      setHistoryItems(histRes.data);
      const map: Record<number, CandidateAppeal> = {};
      for (const a of appsRes.data) map[a.attemptId] = a;
      setAppeals(map);
      setHistoryLoaded(true);
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to load exam history.'));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleViewDetails(attemptId: number) {
    setLoadingDetails(true);
    try {
      const { data } = await api.get<AttemptDetailsData>(`/reports/attempts/${attemptId}`);
      setSelectedDetails(data);
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to load attempt details.'));
    } finally {
      setLoadingDetails(false);
    }
  }

  async function handleDownloadReport(attemptId: number, fmt: 'pdf' | 'excel') {
    const key = `${attemptId}-${fmt}`;
    setDownloadingKey(key);
    try {
      const ext  = fmt === 'pdf' ? 'pdf' : 'xlsx';
      const mime = fmt === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const res = await api.get(`/reports/attempts/${attemptId}/export/${fmt}`, {
        responseType: 'blob',
      });
      downloadBlob(new Blob([res.data as BlobPart], { type: mime }), `attempt-${attemptId}.${ext}`);
    } catch (err) {
      toast.error(axiosMsg(err, `Failed to download ${fmt.toUpperCase()}.`));
    } finally {
      setDownloadingKey(null);
    }
  }

  // ── Appeals ───────────────────────────────────────────────────────────────

  async function handleSubmitAppeal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!appealAttemptId || !appealFile) return;
    setSubmittingAppeal(true);
    try {
      const form = new FormData();
      form.append('attemptId', String(appealAttemptId));
      form.append('document', appealFile);
      const { data } = await api.post<CandidateAppeal>('/appeals', form);
      setAppeals(prev => ({ ...prev, [appealAttemptId]: data }));
      setAppealAttemptId(null);
      setAppealFile(null);
      toast.success('Appeal submitted successfully.');
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to submit appeal.'));
    } finally {
      setSubmittingAppeal(false);
    }
  }

  // ── Actions: lobby ────────────────────────────────────────────────────────

  async function handleSignProtocol(seat: SessionSeat) {
    setSigningId(seat.sessionId);
    try {
      await api.post(`/sessions/${seat.sessionId}/candidates/${seat.candidateId}/sign`);
      await reloadSessions();
      toast.success('Protocol signed.');
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to sign protocol.'));
    } finally {
      setSigningId(null);
    }
  }

  async function handleStartExam(seat: SessionSeat) {
    setStartingId(seat.id);
    try {
      const { data } = await api.post('/exams/generate', {
        profileId: seat.session.examProfile.id,
        sessionId: seat.sessionId,
      });
      enterExam({ ...data, savedAnswers: {} });
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to start exam.'));
      setStartingId(null);
    }
  }

  // ── Actions: exam engine ──────────────────────────────────────────────────

  async function handleAnswerSelect(questionId: number, answerId: number) {
    if (!attempt) return;
    setAnswers(prev => ({ ...prev, [questionId]: answerId }));
    setSavingKey(`q-${questionId}`);
    try {
      await api.post(`/exams/${attempt.id}/answers`, {
        questionId,
        selectedAnswerId: answerId,
      });
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to save answer.'));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleMistakeToggle(projectId: number, mistakeId: number) {
    if (!attempt) return;
    const current = new Set(markedMistakes[projectId] ?? []);
    if (current.has(mistakeId)) {
      current.delete(mistakeId);
    } else {
      current.add(mistakeId);
    }
    const mistakeIds = [...current];
    setMarkedMistakes(prev => ({ ...prev, [projectId]: mistakeIds }));
    setSavingKey(`p-${projectId}`);
    try {
      await api.post(`/exams/${attempt.id}/projects/mistakes`, {
        projectId,
        mistakeIds,
      });
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to save project evaluation.'));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleFinish() {
    if (!attempt) return;
    if (!confirm('Submit the exam? This cannot be undone.')) return;
    setSubmitting(true);
    try {
      const { data } = await api.post<ExamResult>(`/exams/${attempt.id}/finish`);
      toast.success('Exam submitted successfully.');
      setResult(data);
      setViewKind('result');
    } catch (err) {
      toast.error(axiosMsg(err, 'Failed to submit exam.'));
      setSubmitting(false);
    }
  }

  function handleBackToDashboard() {
    setViewKind('loading');
    void loadDashboard().then(() => setDashTab('exams'));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── Renders ───────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  if (viewKind === 'loading') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-24" />)}
        </div>
        <SkeletonTable rows={4} cols={4} />
      </div>
    );
  }

  // ── Result screen ─────────────────────────────────────────────────────────

  if (viewKind === 'result' && result) {
    const passed   = result.passed;
    const timedOut = result.status === 'TIMED_OUT';
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-6 animate-fade-in">
        <div className={`rounded-2xl border-2 p-8 text-center shadow-md ${passed ? 'border-green-400 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <p className="text-5xl mb-3">{passed ? '✓' : '✗'}</p>
          <h1 className={`text-2xl font-bold ${passed ? 'text-green-700' : 'text-red-700'}`}>
            {passed ? 'PASSED' : timedOut ? 'TIMED OUT' : 'FAILED'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {timedOut ? 'Time expired — exam auto-submitted.' : 'Exam submitted successfully.'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Score</span>
            <span className="font-semibold text-gray-800">{result.finalScore.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Passing score</span>
            <span className="font-semibold text-gray-800">{result.passingScore}%</span>
          </div>
          <hr />
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Correct answers</span>
            <span className="font-semibold text-gray-800">{result.correctCount} / {result.totalAssigned}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Questions answered</span>
            <span className="font-semibold text-gray-800">{result.answeredCount} / {result.totalAssigned}</span>
          </div>
          {result.avgProjectScore !== null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Avg. project score</span>
              <span className="font-semibold text-gray-800">{result.avgProjectScore.toFixed(1)}%</span>
            </div>
          )}
        </div>

        <button
          onClick={handleBackToDashboard}
          className="w-full rounded-lg bg-gray-800 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // ── Active exam engine ────────────────────────────────────────────────────

  if (viewKind === 'exam' && attempt && exam) {
    const totalItems = questions.length + projects.length;
    const isQuestion = navIdx < questions.length;
    const currentQ   = isQuestion ? questions[navIdx] : null;
    const currentP   = !isQuestion ? projects[navIdx - questions.length] : null;

    const timerColor =
      timeLeft > 300 ? 'text-gray-800' :
      timeLeft > 60  ? 'text-yellow-600' :
                       'text-red-600';

    const answeredCount = Object.values(answers).filter(v => v !== null).length;

    return (
      <div className="flex flex-col h-full min-h-screen bg-gray-50">
        {/* Exam header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-10">
          <div>
            <h1 className="font-semibold text-gray-800 text-sm">{exam.specializationName}</h1>
            <p className="text-xs text-gray-400">
              {exam.isExpert ? 'Expert' : 'Standard'} · {answeredCount}/{questions.length} answered
              {savingKey && <span className="ml-2 text-blue-500">Saving…</span>}
            </p>
          </div>
          <div className={`text-2xl font-mono font-bold tabular-nums ${timerColor}`}>
            {formatTime(timeLeft)}
          </div>
          <button
            onClick={handleFinish}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Exam'}
          </button>
        </div>

        <div className="flex flex-1 gap-0">
          {/* Question navigator */}
          <div className="w-48 shrink-0 bg-white border-r border-gray-200 p-4 overflow-y-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Questions
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {questions.map((q, i) => {
                const answered  = answers[q.id] !== undefined && answers[q.id] !== null;
                const isCurrent = navIdx === i;
                return (
                  <button
                    key={q.id}
                    onClick={() => setNavIdx(i)}
                    className={`w-8 h-8 rounded text-xs font-semibold transition-colors ${
                      isCurrent
                        ? 'bg-blue-600 text-white'
                        : answered
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            {projects.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Projects
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {projects.map((p, i) => {
                    const idx       = questions.length + i;
                    const isCurrent = navIdx === idx;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setNavIdx(idx)}
                        className={`w-8 h-8 rounded text-xs font-semibold transition-colors ${
                          isCurrent
                            ? 'bg-purple-600 text-white'
                            : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                        }`}
                      >
                        P{i + 1}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Main content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* MCQ Question */}
            {currentQ && (
              <div className="max-w-2xl space-y-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                    {navIdx + 1}
                  </span>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">{currentQ.chapter.name}</p>
                    <p className="text-base text-gray-800 font-medium leading-relaxed">
                      {currentQ.content}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 ml-10">
                  {currentQ.answers.map((ans) => {
                    const selected = answers[currentQ.id] === ans.id;
                    return (
                      <label
                        key={ans.id}
                        className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${currentQ.id}`}
                          value={ans.id}
                          checked={selected}
                          onChange={() => void handleAnswerSelect(currentQ.id, ans.id)}
                          className="mt-0.5 accent-blue-600"
                        />
                        <span className="text-sm text-gray-700">{ans.content}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Prev / Next navigation */}
                <div className="flex justify-between ml-10 pt-2">
                  <button
                    onClick={() => setNavIdx(i => Math.max(0, i - 1))}
                    disabled={navIdx === 0}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => setNavIdx(i => Math.min(totalItems - 1, i + 1))}
                    disabled={navIdx === totalItems - 1}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Project evaluation */}
            {currentP && (
              <div className="max-w-2xl space-y-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">
                    P{navIdx - questions.length + 1}
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-gray-800">{currentP.name}</h2>
                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">{currentP.description}</p>
                  </div>
                </div>

                <div className="ml-10">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Identify the defects found in this project:
                  </p>
                  <div className="space-y-2">
                    {currentP.mistakes.map((m) => {
                      const checked = (markedMistakes[currentP.id] ?? []).includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                            checked
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => void handleMistakeToggle(currentP.id, m.id)}
                            className="mt-0.5 accent-purple-600"
                          />
                          <div className="flex-1">
                            <span className="text-sm text-gray-700">{m.description}</span>
                            <span className="ml-2 text-xs text-red-500">
                              -{m.penaltyPoints}pts
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-between ml-10 pt-2">
                  <button
                    onClick={() => setNavIdx(i => Math.max(0, i - 1))}
                    disabled={navIdx === 0}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => setNavIdx(i => Math.min(totalItems - 1, i + 1))}
                    disabled={navIdx === totalItems - 1}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  const docMap = new Map(documents.map((d) => [d.docType, d]));

  return (
    <>
    {/* Appeal submission modal */}
    {appealAttemptId !== null && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md space-y-4 p-6 animate-modal-in">
          <h2 className="text-lg font-semibold text-gray-800">Submit Appeal</h2>
          <p className="text-sm text-gray-500">
            Upload a supporting document (PDF, JPEG, or PNG — max 10 MB).
            You can only appeal once per attempt.
          </p>
          <form onSubmit={handleSubmitAppeal} className="space-y-4">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              required
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppealFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setAppealAttemptId(null); setAppealFile(null); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!appealFile || submittingAppeal}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {submittingAppeal ? 'Uploading…' : 'Submit Appeal'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    <div className="max-w-4xl mx-auto space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Candidate Dashboard</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-1">
        {(['documents', 'exams', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setDashTab(tab);
              if (tab === 'history') void loadHistory();
            }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              dashTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'documents' ? 'My Documents' : tab === 'exams' ? 'My Exams' : 'My History'}
          </button>
        ))}
      </div>

      {/* Tab content with fade-in on switch */}
      <div key={dashTab} className="animate-fade-in">

        {/* Documents tab */}
        {dashTab === 'documents' && (
          <div className="space-y-6">
            {/* Eligibility banner */}
            {eligible ? (
              <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-5 py-4">
                <span className="text-green-500 text-xl">✓</span>
                <div>
                  <p className="font-semibold text-green-700">Eligible for Examination</p>
                  <p className="text-sm text-green-600">All required documents have been approved.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-yellow-50 border border-yellow-200 px-5 py-4">
                <span className="text-yellow-500 text-xl">⚠</span>
                <div>
                  <p className="font-semibold text-yellow-700">Pending Documents / Under Review</p>
                  <p className="text-sm text-yellow-600">
                    Submit and get all four documents approved to qualify.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DOC_TYPES.map((docType) => (
                <DocCard
                  key={docType}
                  docType={docType}
                  doc={docMap.get(docType)}
                  onUpload={handleUpload}
                  uploading={uploadingType === docType}
                />
              ))}
            </div>
          </div>
        )}

        {/* Exams tab */}
        {dashTab === 'exams' && (
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
                <p className="text-gray-400 text-sm">You have not been registered in any exam session yet.</p>
              </div>
            ) : (
              sessions.map((seat) => {
                const profile    = seat.session.examProfile;
                const isSigning  = signingId === seat.sessionId;
                const isStarting = startingId === seat.id;

                return (
                  <div
                    key={seat.id}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4"
                  >
                    {/* Session meta */}
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {profile.specialization.name}
                          {profile.isExpert && (
                            <span className="ml-2 text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">
                              Expert
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {fmtDate(seat.session.scheduledTime)} · {seat.session.location}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Examiner: {seat.session.examiner.name} · Candidate #: {seat.candidateNumber}
                        </p>
                      </div>
                      <div className="text-right text-sm text-gray-500 space-y-0.5">
                        <p>{profile.questionCount} questions · {profile.durationMinutes} min</p>
                        <p>Passing: {profile.passingScore}%</p>
                        {profile.requiresProjects && (
                          <p className="text-xs text-purple-600">+ Project evaluation</p>
                        )}
                      </div>
                    </div>

                    {/* Protocol + authorization status + CTA */}
                    <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-gray-100">
                      {/* Step 1: sign protocol */}
                      {!seat.isProtocolSigned ? (
                        <>
                          <span className="text-xs text-gray-400">Step 1: Sign the pre-exam protocol</span>
                          <button
                            onClick={() => void handleSignProtocol(seat)}
                            disabled={isSigning}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                          >
                            {isSigning ? 'Signing…' : 'Sign Protocol'}
                          </button>
                        </>
                      ) : seat.startStatus !== 'AUTHORIZED' ? (
                        /* Step 2: waiting for examiner */
                        <>
                          <span className="flex items-center gap-1.5 text-xs text-green-600">
                            <span>✓ Protocol signed</span>
                          </span>
                          <span className="text-xs text-gray-400 mx-1">·</span>
                          <span className="flex items-center gap-1.5 text-xs text-yellow-600">
                            <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                            Waiting for examiner authorization…
                          </span>
                        </>
                      ) : (
                        /* Step 3: ready to start */
                        <>
                          <span className="text-xs text-green-600">✓ Protocol signed</span>
                          <span className="text-xs text-gray-400 mx-1">·</span>
                          <span className="text-xs text-green-600">✓ Authorized</span>
                          <button
                            onClick={() => void handleStartExam(seat)}
                            disabled={isStarting}
                            className="ml-auto rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {isStarting ? 'Starting…' : 'Start Exam →'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* History tab */}
        {dashTab === 'history' && (
          <div className="space-y-4">
            {historyLoading && <SkeletonTable rows={5} cols={7} />}

            {/* Attempt details panel */}
            {selectedDetails && (
              <AttemptDetails
                data={selectedDetails}
                onClose={() => setSelectedDetails(null)}
                showDownloads
              />
            )}

            {/* History table */}
            {!selectedDetails && !historyLoading && historyLoaded && (
              <>
                {historyItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
                    <p className="text-gray-400 text-sm">No completed exams yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Date', 'Specialization', 'Status', 'Score', 'Result', 'Actions', 'Appeal'].map((h) => (
                            <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyItems.map((item) => {
                          const busy    = loadingDetails;
                          const isPdf   = downloadingKey === `${item.id}-pdf`;
                          const isExcel = downloadingKey === `${item.id}-excel`;
                          const appeal  = appeals[item.id];
                          return (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-4 whitespace-nowrap text-gray-600 text-xs">
                                {new Date(item.startTime).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                              </td>
                              <td className="px-5 py-4 whitespace-nowrap">
                                <p className="font-medium text-gray-800">{item.examProfile.specializationName}</p>
                                {item.examProfile.isExpert && (
                                  <span className="text-xs text-purple-600">Expert</span>
                                )}
                              </td>
                              <td className="px-5 py-4 whitespace-nowrap">
                                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  item.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-700' :
                                  item.status === 'TIMED_OUT' ? 'bg-red-100 text-red-600'  :
                                                                'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="px-5 py-4 whitespace-nowrap tabular-nums text-gray-700">
                                {item.finalScore !== null ? `${item.finalScore.toFixed(1)}%` : '—'}
                              </td>
                              <td className="px-5 py-4 whitespace-nowrap">
                                {item.passed === true  && <span className="text-xs font-bold text-green-700">PASSED</span>}
                                {item.passed === false && <span className="text-xs font-bold text-red-600">FAILED</span>}
                                {item.passed === null  && <span className="text-xs text-gray-400">—</span>}
                              </td>
                              <td className="px-5 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => void handleViewDetails(item.id)}
                                    disabled={busy}
                                    className="rounded-lg bg-gray-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
                                  >
                                    {busy ? '…' : 'Details'}
                                  </button>
                                  <button
                                    onClick={() => void handleDownloadReport(item.id, 'pdf')}
                                    disabled={downloadingKey !== null}
                                    className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                                  >
                                    {isPdf ? '…' : 'PDF'}
                                  </button>
                                  <button
                                    onClick={() => void handleDownloadReport(item.id, 'excel')}
                                    disabled={downloadingKey !== null}
                                    className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
                                  >
                                    {isExcel ? '…' : 'Excel'}
                                  </button>
                                </div>
                              </td>
                              {/* Appeal column */}
                              <td className="px-5 py-4 whitespace-nowrap min-w-[120px]">
                                {item.status === 'SUBMITTED' ? (
                                  !appeal ? (
                                    <button
                                      onClick={() => setAppealAttemptId(item.id)}
                                      className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                                    >
                                      Appeal
                                    </button>
                                  ) : appeal.status === 'PENDING' ? (
                                    <span className="inline-block rounded-full bg-yellow-100 text-yellow-700 px-2.5 py-0.5 text-xs font-semibold">
                                      PENDING
                                    </span>
                                  ) : (
                                    <div className="space-y-1">
                                      <span className="inline-block rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-xs font-semibold">
                                        REVIEWED
                                      </span>
                                      {appeal.decisionNotes && (
                                        <p
                                          className="text-xs text-gray-500 max-w-[160px] truncate cursor-help"
                                          title={appeal.decisionNotes}
                                        >
                                          {appeal.decisionNotes}
                                        </p>
                                      )}
                                    </div>
                                  )
                                ) : (
                                  <span className="text-gray-300 text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>{/* end animate-fade-in wrapper */}
    </div>
    </>
  );
}

import axios from 'axios';
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { axiosMsg } from '../../utils/axiosMsg';
import SessionReport from '../../components/reports/SessionReport';
import type { SessionReportData } from '../../components/reports/SessionReport';

// ── Types ──────────────────────────────────────────────────────────────────────

type ReviewStatus = 'APPROVED' | 'REJECTED' | 'RETURNED';
type AdminTab     = 'documents' | 'reports';
type ReportSubTab = 'sessions' | 'thematic';

interface PendingDocument {
  id: number;
  docType: string;
  status: string;
  documentUrl: string;
  rejectionReason: string | null;
  user: { name: string; email: string; };
}

interface ReportSession {
  id: number;
  scheduledTime: string;
  location: string;
  examProfile: { specialization: { name: string }; isExpert: boolean; };
}

interface ReportProfile {
  id: number;
  isExpert: boolean;
  specialization: { id: number; name: string };
}

interface ThematicStats {
  profileId: number;
  specializationName: string;
  totalCompletedAttempts: number;
  chapters: {
    chapterId: number;
    chapterName: string;
    totalAnswers: number;
    correctAnswers: number;
    successRate: number;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const DOC_LABEL: Record<string, string> = {
  DIPLOMA:    'Diploma / Degree',
  EXPERIENCE: 'Work Experience',
  ID_CARD:    'Government ID',
  PHOTO:      'Passport Photo',
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING:  'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100  text-green-700',
    REJECTED: 'bg-red-100    text-red-700',
    RETURNED: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function SuccessBar({ value }: { value: number }) {
  const color =
    value >= 80 ? 'bg-green-500' :
    value >= 60 ? 'bg-yellow-500' :
                  'bg-red-500';
  const text =
    value >= 80 ? 'text-green-700' :
    value >= 60 ? 'text-yellow-700' :
                  'text-red-700';
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 bg-gray-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${text}`}>{value.toFixed(1)}%</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  // — Top-level tab —
  const [activeTab, setActiveTab]     = useState<AdminTab>('documents');
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>('sessions');

  // — Document review (existing) —
  const [documents, setDocuments]         = useState<PendingDocument[]>([]);
  const [loading, setLoading]             = useState(true);
  const [actionError, setActionError]     = useState<string | null>(null);
  const [processingId, setProcessingId]   = useState<number | null>(null);

  // — Reports tab data (lazy loaded) —
  const [reportSessions, setReportSessions] = useState<ReportSession[]>([]);
  const [reportProfiles, setReportProfiles] = useState<ReportProfile[]>([]);
  const [reportsLoaded, setReportsLoaded]   = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);

  // — Session report —
  const [selectedSessionId,     setSelectedSessionId]     = useState('');
  const [sessionReport,         setSessionReport]         = useState<SessionReportData | null>(null);
  const [loadingSessionReport,  setLoadingSessionReport]  = useState(false);
  const [sessionReportError,    setSessionReportError]    = useState('');
  const [showingSessionReport,  setShowingSessionReport]  = useState(false);

  // — Thematic stats —
  const [selectedProfileId,  setSelectedProfileId]  = useState('');
  const [thematicStats,      setThematicStats]      = useState<ThematicStats | null>(null);
  const [loadingThematic,    setLoadingThematic]    = useState(false);
  const [thematicError,      setThematicError]      = useState('');

  // ── Document review ────────────────────────────────────────────────────────

  async function fetchPending() {
    setLoading(true);
    try {
      const { data } = await api.get<PendingDocument[]>('/candidates/pending-documents');
      setDocuments(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message as string | undefined;
        setActionError(msg ?? 'Failed to load pending documents.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchPending(); }, []);

  async function handleReview(doc: PendingDocument, status: ReviewStatus) {
    setActionError(null);
    let reason: string | undefined;
    if (status === 'REJECTED' || status === 'RETURNED') {
      const input = window.prompt(
        `Please enter the reason for ${status.toLowerCase()} "${DOC_LABEL[doc.docType] ?? doc.docType}" from ${doc.user.name}:`
      );
      if (!input || !input.trim()) return;
      reason = input.trim();
    }
    setProcessingId(doc.id);
    try {
      await api.patch(`/candidates/documents/${doc.id}/review`, { status, reason });
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message as string | undefined;
        setActionError(msg ?? 'Review action failed. Please try again.');
      } else {
        setActionError('An unexpected error occurred.');
      }
    } finally {
      setProcessingId(null);
    }
  }

  // ── Reports tab ────────────────────────────────────────────────────────────

  async function loadReportsData() {
    if (reportsLoaded) return;
    setReportsLoading(true);
    try {
      const [sessRes, profRes] = await Promise.all([
        api.get<ReportSession[]>('/sessions'),
        api.get<ReportProfile[]>('/exams/profiles'),
      ]);
      setReportSessions(sessRes.data);
      setReportProfiles(profRes.data);
      setReportsLoaded(true);
    } catch {
      // Non-fatal — user can still navigate to the tab
    } finally {
      setReportsLoading(false);
    }
  }

  async function handleLoadSessionReport() {
    if (!selectedSessionId) return;
    setLoadingSessionReport(true);
    setSessionReportError('');
    setSessionReport(null);
    setShowingSessionReport(false);
    try {
      const { data } = await api.get<SessionReportData>(`/reports/sessions/${selectedSessionId}`);
      setSessionReport(data);
      setShowingSessionReport(true);
    } catch (err) {
      setSessionReportError(axiosMsg(err, 'Failed to load session report.'));
    } finally {
      setLoadingSessionReport(false);
    }
  }

  async function handleLoadThematicStats() {
    if (!selectedProfileId) return;
    setLoadingThematic(true);
    setThematicError('');
    setThematicStats(null);
    try {
      const { data } = await api.get<ThematicStats>(`/reports/thematic/${selectedProfileId}`);
      setThematicStats(data);
    } catch (err) {
      setThematicError(axiosMsg(err, 'Failed to load thematic stats.'));
    } finally {
      setLoadingThematic(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Admin Dashboard</h1>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 flex gap-1">
        {([
          { key: 'documents', label: 'Document Review' },
          { key: 'reports',   label: 'Reports & Analytics' },
        ] as { key: AdminTab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActiveTab(key);
              if (key === 'reports') void loadReportsData();
            }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Document review tab ───────────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {loading
                ? 'Loading…'
                : documents.length === 0
                  ? 'No pending documents — queue is clear.'
                  : `${documents.length} document${documents.length !== 1 ? 's' : ''} awaiting review`}
            </p>
            <button
              type="button"
              onClick={() => void fetchPending()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Refresh
            </button>
          </div>

          {actionError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-600">{actionError}</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-32">
              <p className="text-gray-400 text-sm animate-pulse">Loading pending documents…</p>
            </div>
          )}

          {!loading && documents.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
              <p className="text-gray-400 text-sm">All documents have been reviewed.</p>
            </div>
          )}

          {documents.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Candidate', 'Email', 'Document Type', 'Status', 'Preview', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {documents.map((doc) => {
                    const isBusy = processingId === doc.id;
                    return (
                      <tr key={doc.id} className={isBusy ? 'opacity-50' : 'hover:bg-gray-50 transition-colors'}>
                        <td className="px-5 py-4 font-medium text-gray-800 whitespace-nowrap">{doc.user.name}</td>
                        <td className="px-5 py-4 text-gray-500 whitespace-nowrap">{doc.user.email}</td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="font-medium text-gray-700">{DOC_LABEL[doc.docType] ?? doc.docType}</span>
                          <span className="ml-2 text-xs text-gray-400">{doc.docType}</span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap"><StatusBadge status={doc.status} /></td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {doc.documentUrl ? (
                            <a href={`http://localhost:3000${doc.documentUrl}`} target="_blank" rel="noopener noreferrer"
                              className="inline-block rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                              View file ↗
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button type="button" disabled={isBusy} onClick={() => void handleReview(doc, 'APPROVED')}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                              Approve
                            </button>
                            <button type="button" disabled={isBusy} onClick={() => void handleReview(doc, 'REJECTED')}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                              Reject
                            </button>
                            <button type="button" disabled={isBusy} onClick={() => void handleReview(doc, 'RETURNED')}
                              className="rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                              Return
                            </button>
                          </div>
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

      {/* ── Reports & Analytics tab ───────────────────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="space-y-5">
          {reportsLoading && (
            <div className="flex items-center justify-center h-20">
              <p className="text-gray-400 text-sm animate-pulse">Loading report data…</p>
            </div>
          )}

          {/* Session report full view */}
          {showingSessionReport && sessionReport && (
            <SessionReport
              data={sessionReport}
              onClose={() => setShowingSessionReport(false)}
            />
          )}

          {/* Report sub-tabs (hidden while viewing a session report) */}
          {!showingSessionReport && (
            <>
              {/* Sub-tab bar */}
              <div className="flex gap-1 border-b border-gray-200">
                {([
                  { key: 'sessions',  label: 'Session Reports' },
                  { key: 'thematic',  label: 'Thematic Stats' },
                ] as { key: ReportSubTab; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setReportSubTab(key)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      reportSubTab === key
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Session Reports sub-tab ─────────────────────────────────── */}
              {reportSubTab === 'sessions' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700">Select a Session</h3>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <select
                          value={selectedSessionId}
                          onChange={(e) => { setSelectedSessionId(e.target.value); setSessionReport(null); }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Choose a session…</option>
                          {reportSessions.map((s) => (
                            <option key={s.id} value={s.id}>
                              #{s.id} — {s.examProfile.specialization.name}
                              {s.examProfile.isExpert ? ' (Expert)' : ''}{' '}
                              · {new Date(s.scheduledTime).toLocaleDateString()} · {s.location}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleLoadSessionReport()}
                        disabled={!selectedSessionId || loadingSessionReport}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {loadingSessionReport ? 'Loading…' : 'Load Report'}
                      </button>
                    </div>
                    {sessionReportError && (
                      <p className="text-sm text-red-600">{sessionReportError}</p>
                    )}
                  </div>

                  {/* Preview card */}
                  {sessionReport && !showingSessionReport && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 space-y-3">
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                          <p className="text-xs text-indigo-400 uppercase tracking-wide mb-0.5">Report Ready</p>
                          <h3 className="font-semibold text-gray-800">{sessionReport.specializationName}</h3>
                          <p className="text-sm text-gray-500">{sessionReport.location}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowingSessionReport(true)}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                        >
                          View Full Report →
                        </button>
                      </div>
                      <div className="flex gap-4 text-sm flex-wrap">
                        <span className="text-gray-600">
                          <span className="font-medium">{sessionReport.completedAttempts}</span>/{sessionReport.totalCandidates} completed
                        </span>
                        <span className="text-green-600 font-medium">
                          {sessionReport.passed} passed
                        </span>
                        <span className="text-red-500 font-medium">
                          {sessionReport.failed} failed
                        </span>
                        {sessionReport.averageScore !== null && (
                          <span className="text-gray-600">
                            Avg: <span className="font-medium">{sessionReport.averageScore.toFixed(1)}%</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Thematic Stats sub-tab ──────────────────────────────────── */}
              {reportSubTab === 'thematic' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700">Chapter Difficulty Analysis</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Cross-attempt data showing which chapters candidates struggle with most.
                        Chapters sorted hardest first.
                      </p>
                    </div>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <select
                          value={selectedProfileId}
                          onChange={(e) => { setSelectedProfileId(e.target.value); setThematicStats(null); }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Choose an exam profile…</option>
                          {reportProfiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.specialization.name}{p.isExpert ? ' (Expert)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleLoadThematicStats()}
                        disabled={!selectedProfileId || loadingThematic}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {loadingThematic ? 'Loading…' : 'Analyse'}
                      </button>
                    </div>
                    {thematicError && (
                      <p className="text-sm text-red-600">{thematicError}</p>
                    )}
                  </div>

                  {thematicStats && (
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700">
                            {thematicStats.specializationName}
                          </h3>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Based on {thematicStats.totalCompletedAttempts} completed attempt{thematicStats.totalCompletedAttempts !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                          Sorted: hardest → easiest
                        </span>
                      </div>

                      {thematicStats.chapters.length === 0 ? (
                        <div className="py-10 text-center">
                          <p className="text-gray-400 text-sm">No completed attempts for this profile yet.</p>
                        </div>
                      ) : (
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              {['Rank', 'Chapter', 'Total Answers', 'Correct', 'Success Rate'].map((h) => (
                                <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {thematicStats.chapters.map((ch, i) => (
                              <tr key={ch.chapterId} className="hover:bg-gray-50">
                                <td className="px-5 py-3 text-gray-400 tabular-nums">#{i + 1}</td>
                                <td className="px-5 py-3 font-medium text-gray-800">{ch.chapterName}</td>
                                <td className="px-5 py-3 text-gray-600 tabular-nums">{ch.totalAnswers}</td>
                                <td className="px-5 py-3 text-gray-600 tabular-nums">{ch.correctAnswers}</td>
                                <td className="px-5 py-3"><SuccessBar value={ch.successRate} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

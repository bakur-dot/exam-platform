import { useState } from 'react';
import api from '../../services/api';
import { axiosMsg } from '../../utils/axiosMsg';
import { downloadBlob } from '../../utils/downloadBlob';

// ─── Exported types (consumed by parent pages) ────────────────────────────────

export interface AttemptDetailsQuestion {
  questionId: number;
  content: string;
  chapterName: string;
  selectedAnswer: { id: number; content: string } | null;
  wasCorrect: boolean;
}

export interface AttemptDetailsChapterScore {
  chapterId: number;
  chapterName: string;
  totalQuestions: number;
  correctAnswers: number;
  score: number;
}

export interface AttemptDetailsProject {
  projectId: number;
  title: string;
  score: number | null;
  markedMistakes: { description: string; penaltyPoints: number }[];
}

export interface AttemptDetailsData {
  attemptId: number;
  startTime: string;
  endTime: string | null;
  status: string;
  finalScore: number | null;
  passingScore: number;
  passed: boolean | null;
  examProfile: {
    specializationName: string;
    isExpert: boolean;
    requiresProjects: boolean;
  };
  questions: AttemptDetailsQuestion[];
  chapterScores: AttemptDetailsChapterScore[];
  projects: AttemptDetailsProject[];
  avgProjectScore: number | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: AttemptDetailsData;
  onClose: () => void;
  showDownloads?: boolean;
}

function ScoreBar({ value }: { value: number }) {
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
      <div className="w-24 bg-gray-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${text}`}>{value.toFixed(1)}%</span>
    </div>
  );
}

export default function AttemptDetails({ data, onClose, showDownloads = true }: Props) {
  const [downloading, setDownloading] = useState<'pdf' | 'excel' | null>(null);
  const [dlError, setDlError]         = useState('');

  async function handleDownload(fmt: 'pdf' | 'excel') {
    setDownloading(fmt);
    setDlError('');
    try {
      const ext  = fmt === 'pdf' ? 'pdf' : 'xlsx';
      const mime = fmt === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const res = await api.get(`/reports/attempts/${data.attemptId}/export/${fmt}`, {
        responseType: 'blob',
      });
      downloadBlob(new Blob([res.data as BlobPart], { type: mime }), `attempt-${data.attemptId}.${ext}`);
    } catch (err) {
      setDlError(axiosMsg(err, `Failed to download ${fmt.toUpperCase()}.`));
    } finally {
      setDownloading(null);
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const { passed, status, finalScore, passingScore } = data;
  const timedOut = status === 'TIMED_OUT';

  const headerColor =
    passed === true  ? 'border-green-400 bg-green-50' :
    passed === false ? 'border-red-300   bg-red-50'   :
                       'border-gray-200  bg-gray-50';
  const titleColor =
    passed === true  ? 'text-green-700' :
    passed === false ? 'text-red-700'   :
                       'text-gray-700';

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onClose}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Back
        </button>
        {showDownloads && (
          <div className="flex items-center gap-2">
            {dlError && <p className="text-xs text-red-600 mr-1">{dlError}</p>}
            <button
              onClick={() => void handleDownload('pdf')}
              disabled={downloading !== null}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {downloading === 'pdf' ? 'Downloading…' : 'Download PDF'}
            </button>
            <button
              onClick={() => void handleDownload('excel')}
              disabled={downloading !== null}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              {downloading === 'excel' ? 'Downloading…' : 'Download Excel'}
            </button>
          </div>
        )}
      </div>

      {/* Score summary */}
      <div className={`rounded-xl border-2 p-6 ${headerColor}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              {data.examProfile.specializationName}
              {data.examProfile.isExpert && (
                <span className="ml-1.5 bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 text-xs normal-case">Expert</span>
              )}
            </p>
            <h2 className={`text-2xl font-bold mt-1 ${titleColor}`}>
              {passed === true  ? 'PASSED'
              : passed === false ? (timedOut ? 'TIMED OUT' : 'FAILED')
              : status}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Attempt #{data.attemptId}</p>
          </div>
          <div className="text-right">
            <p className={`text-4xl font-bold tabular-nums ${titleColor}`}>
              {finalScore !== null ? `${finalScore.toFixed(1)}%` : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Passing: {passingScore}%</p>
          </div>
        </div>
        <div className="mt-4 flex gap-6 text-sm text-gray-600 flex-wrap">
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">Start</span>
            {fmtDate(data.startTime)}
          </div>
          {data.endTime && (
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">End</span>
              {fmtDate(data.endTime)}
            </div>
          )}
        </div>
      </div>

      {/* Chapter breakdown */}
      {data.chapterScores.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Chapter Breakdown</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Chapter', 'Correct', 'Total', 'Score'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.chapterScores.map((ch) => (
                <tr key={ch.chapterId} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{ch.chapterName}</td>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{ch.correctAnswers}</td>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{ch.totalQuestions}</td>
                  <td className="px-5 py-3"><ScoreBar value={ch.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Projects */}
      {data.projects.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Project Evaluation</h3>
            {data.avgProjectScore !== null && (
              <span className="text-xs text-gray-500">
                Avg: <span className="font-semibold">{data.avgProjectScore.toFixed(1)}%</span>
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {data.projects.map((p) => (
              <div key={p.projectId} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium text-gray-800">{p.title}</p>
                  <span className={`text-sm font-semibold tabular-nums ${
                    p.score === null ? 'text-gray-400' :
                    p.score >= 80    ? 'text-green-700' :
                    p.score >= 60    ? 'text-yellow-700' :
                                       'text-red-700'
                  }`}>
                    {p.score !== null ? `${p.score.toFixed(1)}%` : '—'}
                  </span>
                </div>
                {p.markedMistakes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {p.markedMistakes.map((m, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-red-600">
                        <span className="shrink-0 mt-0.5">•</span>
                        <span>
                          {m.description}{' '}
                          <span className="text-red-400">(-{m.penaltyPoints}pts)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Questions list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Questions <span className="font-normal text-gray-400">({data.questions.length})</span>
          </h3>
          <div className="flex gap-3 text-xs">
            <span className="text-green-600 font-medium">✓ Correct</span>
            <span className="text-red-500 font-medium">✗ Incorrect</span>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {data.questions.map((q, i) => (
            <div
              key={q.questionId}
              className={`px-5 py-4 ${q.wasCorrect ? 'bg-green-50/40' : 'bg-red-50/30'}`}
            >
              <div className="flex items-start gap-3">
                <span className={`shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  q.wasCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}>
                  {q.wasCorrect ? '✓' : '✗'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">{q.chapterName} · Q{i + 1}</p>
                  <p className="text-sm text-gray-800 leading-relaxed">{q.content}</p>
                  <p className={`mt-1.5 text-xs ${q.wasCorrect ? 'text-green-700' : 'text-red-600'}`}>
                    {q.selectedAnswer ? (
                      <>Your answer: <span className="font-medium">{q.selectedAnswer.content}</span></>
                    ) : (
                      <span className="italic text-gray-400">Unanswered</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

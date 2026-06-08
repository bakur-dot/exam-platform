// ─── Exported types ───────────────────────────────────────────────────────────

export interface SessionReportChapter {
  chapterId: number;
  chapterName: string;
  totalAnswers: number;
  correctAnswers: number;
  successRate: number;
}

export interface SessionReportData {
  sessionId: number;
  scheduledTime: string;
  location: string;
  specializationName: string;
  passingScore: number;
  totalCandidates: number;
  completedAttempts: number;
  passed: number;
  failed: number;
  averageScore: number | null;
  chapterBreakdown: SessionReportChapter[];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: SessionReportData;
  onClose: () => void;
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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-800 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function SessionReport({ data, onClose }: Props) {
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const passRate =
    data.completedAttempts > 0
      ? ((data.passed / data.completedAttempts) * 100).toFixed(1)
      : '—';

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={onClose}
        className="text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        ← Back to Session
      </button>

      {/* Session header */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Session Report</p>
            <h2 className="text-lg font-semibold text-gray-800">{data.specializationName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {fmtDate(data.scheduledTime)} · {data.location}
            </p>
          </div>
          <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1">
            Passing score: {data.passingScore}%
          </span>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Candidates"  value={data.totalCandidates} />
        <StatCard label="Completed"   value={data.completedAttempts} />
        <StatCard
          label="Passed"
          value={data.passed}
          sub={`${passRate}% pass rate`}
        />
        <StatCard label="Failed"      value={data.failed} />
        <StatCard
          label="Avg. Score"
          value={data.averageScore !== null ? `${data.averageScore.toFixed(1)}%` : '—'}
        />
      </div>

      {/* Pass / fail visual bar */}
      {data.completedAttempts > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pass / Fail Distribution
          </p>
          <div className="flex h-6 rounded-full overflow-hidden">
            <div
              className="bg-green-500 flex items-center justify-center text-xs font-bold text-white transition-all"
              style={{ width: `${(data.passed / data.completedAttempts) * 100}%` }}
            >
              {data.passed > 0 && data.passed}
            </div>
            <div
              className="bg-red-400 flex items-center justify-center text-xs font-bold text-white transition-all"
              style={{ width: `${(data.failed / data.completedAttempts) * 100}%` }}
            >
              {data.failed > 0 && data.failed}
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              Passed ({data.passed})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
              Failed ({data.failed})
            </span>
          </div>
        </div>
      )}

      {/* Chapter success rates */}
      {data.chapterBreakdown.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Chapter Success Rates</h3>
            <p className="text-xs text-gray-400 mt-0.5">Across all completed attempts</p>
          </div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Chapter', 'Total Answers', 'Correct', 'Success Rate'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.chapterBreakdown.map((ch) => (
                <tr key={ch.chapterId} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{ch.chapterName}</td>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{ch.totalAnswers}</td>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{ch.correctAnswers}</td>
                  <td className="px-5 py-3"><SuccessBar value={ch.successRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-gray-400 text-sm">No completed attempts yet — chapter data unavailable.</p>
        </div>
      )}
    </div>
  );
}

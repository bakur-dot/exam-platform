import axios from 'axios';
import { useEffect, useState } from 'react';
import api from '../../services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Specialization {
  id: number;
  name: string;
}

interface Chapter {
  id: number;
  name: string;
  specialization: Specialization;
}

interface Answer {
  id: number;
  content: string;
  isCorrect: boolean;
}

interface Question {
  id: number;
  content: string;
  version: number;
  status: string;
  chapter: Chapter;
  answers: Answer[];
}

interface AnswerDraft {
  content: string;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT:    'bg-gray-100   text-gray-600',
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100  text-green-700',
  REJECTED: 'bg-red-100    text-red-700',
  ARCHIVED: 'bg-slate-100  text-slate-500',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ── Default form state ─────────────────────────────────────────────────────────

const DEFAULT_ANSWERS: AnswerDraft[] = [
  { content: '' },
  { content: '' },
  { content: '' },
  { content: '' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function ExaminerDashboard() {
  // ── Data ─────────────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<Question[]>([]);
  const [chapters,  setChapters]  = useState<Chapter[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ── Form ─────────────────────────────────────────────────────────────────────
  const [chapterId,    setChapterId]    = useState('');
  const [content,      setContent]      = useState('');
  const [answers,      setAnswers]      = useState<AnswerDraft[]>(DEFAULT_ANSWERS);
  const [correctIndex, setCorrectIndex] = useState<number>(0);
  const [submitting,   setSubmitting]   = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);
  const [formSuccess,  setFormSuccess]  = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────────

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

  // ── Form helpers ──────────────────────────────────────────────────────────────

  function updateAnswer(index: number, value: string) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? { content: value } : a)));
  }

  function resetForm() {
    setChapterId('');
    setContent('');
    setAnswers(DEFAULT_ANSWERS);
    setCorrectIndex(0);
    setFormError(null);
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);

    const filledAnswers = answers.filter((a) => a.content.trim());
    if (filledAnswers.length < 2) {
      setFormError('Please provide at least 2 answer options.');
      return;
    }
    if (!answers[correctIndex]?.content.trim()) {
      setFormError('The selected correct answer cannot be empty.');
      return;
    }

    const payload = {
      chapterId: Number(chapterId),
      content:   content.trim(),
      answers:   answers
        .filter((a) => a.content.trim())
        .map((a, i) => ({
          content:   a.content.trim(),
          isCorrect: i === correctIndex,
        })),
    };

    setSubmitting(true);
    try {
      await api.post('/questions', payload);
      setFormSuccess(true);
      resetForm();
      // Rebuild question list without a full page reload
      const { data } = await api.get<Question[]>('/questions');
      setQuestions(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.error as string | undefined;
        setFormError(msg ?? 'Failed to create question. Please try again.');
      } else {
        setFormError('An unexpected error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Group chapters by specialization for the select ───────────────────────────

  const chaptersBySpec = chapters.reduce<Record<string, Chapter[]>>((acc, ch) => {
    const key = ch.specialization.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ch);
    return acc;
  }, {});

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm animate-pulse">Loading question bank…</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Question Bank</h1>
        <p className="mt-1 text-sm text-gray-500">
          {questions.length} active question{questions.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Question list ── */}
        <div className="flex-1 min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {questions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-sm">No questions yet. Create the first one.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Question', 'Chapter', 'Ver.', 'Status'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {questions.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 max-w-xs">
                      <p className="text-gray-800 line-clamp-2">{q.content}</p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-gray-500">
                      <p className="font-medium text-gray-700">{q.chapter.name}</p>
                      <p className="text-xs text-gray-400">{q.chapter.specialization.name}</p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center text-gray-500">
                      v{q.version}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <StatusBadge status={q.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Create question form ── */}
        <div className="w-96 shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Create New Question</h2>

          {formSuccess && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <p className="text-sm text-green-700">Question created as DRAFT.</p>
            </div>
          )}
          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-600">{formError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Chapter */}
            <div>
              <label htmlFor="chapterId" className="block text-sm font-medium text-gray-700 mb-1">
                Chapter
              </label>
              <select
                id="chapterId"
                required
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a chapter…</option>
                {Object.entries(chaptersBySpec).map(([specName, chs]) => (
                  <optgroup key={specName} label={specName}>
                    {chs.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Question content */}
            <div>
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
                Question
              </label>
              <textarea
                id="content"
                required
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter the question body…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Answers */}
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-2">
                Answers <span className="text-xs font-normal text-gray-400">(select the correct one)</span>
              </p>
              <div className="space-y-2">
                {answers.map((ans, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={correctIndex === i}
                      onChange={() => setCorrectIndex(i)}
                      className="h-4 w-4 shrink-0 text-blue-600 focus:ring-blue-500"
                      aria-label={`Mark answer ${i + 1} as correct`}
                    />
                    <input
                      type="text"
                      value={ans.content}
                      onChange={(e) => updateAnswer(i, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !chapterId || !content.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Question'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

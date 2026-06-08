import axios from 'axios';
import { useEffect, useState } from 'react';
import api from '../../services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type ReviewStatus = 'APPROVED' | 'REJECTED' | 'RETURNED';

interface PendingDocument {
  id: number;
  docType: string;
  status: string;
  documentUrl: string;
  rejectionReason: string | null;
  user: {
    name: string;
    email: string;
  };
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [loading, setLoading]     = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

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
      // User cancelled the prompt or submitted empty
      if (!input || !input.trim()) return;
      reason = input.trim();
    }

    setProcessingId(doc.id);
    try {
      await api.patch(`/candidates/documents/${doc.id}/review`, { status, reason });
      // Optimistically remove from local queue — no need to re-fetch
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

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm animate-pulse">Loading pending documents…</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Document Review Queue</h1>
          <p className="mt-1 text-sm text-gray-500">
            {documents.length === 0
              ? 'No pending documents — queue is clear.'
              : `${documents.length} document${documents.length !== 1 ? 's' : ''} awaiting review`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchPending()}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-600">{actionError}</p>
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-400 text-sm">All documents have been reviewed.</p>
        </div>
      )}

      {/* Table */}
      {documents.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Candidate', 'Email', 'Document Type', 'Status', 'Preview', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => {
                const isBusy = processingId === doc.id;
                return (
                  <tr key={doc.id} className={isBusy ? 'opacity-50' : 'hover:bg-gray-50 transition-colors'}>
                    {/* Candidate name */}
                    <td className="px-5 py-4 font-medium text-gray-800 whitespace-nowrap">
                      {doc.user.name}
                    </td>

                    {/* Email */}
                    <td className="px-5 py-4 text-gray-500 whitespace-nowrap">
                      {doc.user.email}
                    </td>

                    {/* Document type */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="font-medium text-gray-700">
                        {DOC_LABEL[doc.docType] ?? doc.docType}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">{doc.docType}</span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <StatusBadge status={doc.status} />
                    </td>

                    {/* Preview */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {doc.documentUrl ? (
                        <a
                          href={`http://localhost:3000${doc.documentUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          View file ↗
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleReview(doc, 'APPROVED')}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleReview(doc, 'REJECTED')}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleReview(doc, 'RETURNED')}
                          className="rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
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

    </div>
  );
}

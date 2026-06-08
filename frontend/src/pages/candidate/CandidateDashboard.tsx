import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type DocType = 'DIPLOMA' | 'EXPERIENCE' | 'ID_CARD' | 'PHOTO';
type DocStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';

interface CandidateDocument {
  id: number;
  docType: DocType;
  status: DocStatus;
  documentUrl: string;
  rejectionReason: string | null;
}

const DOC_TYPES: DocType[] = ['DIPLOMA', 'EXPERIENCE', 'ID_CARD', 'PHOTO'];

const DOC_LABELS: Record<DocType, string> = {
  DIPLOMA:    'Diploma / Degree',
  EXPERIENCE: 'Work Experience',
  ID_CARD:    'Government ID',
  PHOTO:      'Passport Photo',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

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
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{docType}</p>
          <h3 className="mt-0.5 text-base font-semibold text-gray-800">{DOC_LABELS[docType]}</h3>
        </div>
        {doc && <StatusBadge status={doc.status} />}
        {!doc && (
          <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
            NOT SUBMITTED
          </span>
        )}
      </div>

      {/* Rejection reason */}
      {doc && (doc.status === 'REJECTED' || doc.status === 'RETURNED') && doc.rejectionReason && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <p className="text-xs font-medium text-red-600">Reason:</p>
          <p className="mt-0.5 text-sm text-red-700">{doc.rejectionReason}</p>
        </div>
      )}

      {/* Upload form */}
      {canUpload && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-auto">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
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

      {/* Approved — no action needed */}
      {doc?.status === 'APPROVED' && (
        <p className="mt-auto text-xs text-green-600 font-medium">
          Document verified. No further action required.
        </p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CandidateDashboard() {
  const [documents, setDocuments]   = useState<CandidateDocument[]>([]);
  const [eligible, setEligible]     = useState<boolean>(false);
  const [loadingData, setLoadingData] = useState(true);
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function fetchData() {
    try {
      const [docsRes, eligRes] = await Promise.all([
        api.get<CandidateDocument[]>('/candidates/documents'),
        api.get<{ eligible: boolean }>('/candidates/eligibility'),
      ]);
      setDocuments(docsRes.data);
      setEligible(eligRes.data.eligible);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => { void fetchData(); }, []);

  async function handleUpload(docType: DocType, file: File) {
    setUploadError(null);
    setUploadingType(docType);
    try {
      const form = new FormData();
      form.append('docType', docType);
      form.append('document', file);
      // No Content-Type header — Axios sets it with the correct multipart boundary
      await api.post('/candidates/documents', form);
      await fetchData();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message as string | undefined;
        setUploadError(msg ?? 'Upload failed. Please try again.');
      } else {
        setUploadError('An unexpected error occurred.');
      }
    } finally {
      setUploadingType(null);
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm animate-pulse">Loading your documents…</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const docMap = new Map(documents.map((d) => [d.docType, d]));

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">My Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Submit all four required documents to become eligible for examination.
        </p>
      </div>

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

      {/* Upload error */}
      {uploadError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-600">{uploadError}</p>
        </div>
      )}

      {/* Document cards grid */}
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
  );
}

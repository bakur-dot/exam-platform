export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-4">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className={`h-4 animate-pulse rounded bg-gray-200 ${
                  j === 0 ? 'w-32' : j === cols - 1 ? 'w-20' : 'flex-1'
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const widths = ['w-3/4', 'w-1/2', 'w-full', 'w-2/3', 'w-5/6'];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-4 animate-pulse rounded bg-gray-200 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

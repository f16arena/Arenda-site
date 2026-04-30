export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-4 w-96 bg-slate-100 dark:bg-slate-800/50 rounded mt-2" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded mt-3" />
            <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800/50 rounded mt-2" />
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800/50 rounded" />
        ))}
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-5">
      <div className="my-7 rounded-surface border border-line bg-surface shadow-surface p-8 animate-pulse">
        <div className="h-3 w-24 bg-hair rounded mb-3" />
        <div className="h-12 w-40 bg-hair rounded mb-8" />
        <div className="h-44 bg-hair rounded mb-6" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-7 bg-hair rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}

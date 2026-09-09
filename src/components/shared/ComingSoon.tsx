export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="text-5xl mb-4">🚧</div>
      <h2 className="text-xl font-semibold text-slate-700">{title}</h2>
      <p className="text-slate-500 mt-2">This module is coming soon.</p>
    </div>
  )
}

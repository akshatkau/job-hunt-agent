export default function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="h-5 w-20 bg-gray-200 rounded-full" />
        <div className="h-5 w-14 bg-gray-200 rounded-full" />
      </div>
      <div className="h-6 w-3/4 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-1/2 bg-gray-200 rounded mb-1" />
      <div className="h-3 w-1/4 bg-gray-200 rounded mb-4" />
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-5/6" />
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-gray-100">
        <div className="h-7 w-28 bg-gray-200 rounded-lg" />
        <div className="h-7 w-20 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

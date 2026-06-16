import { useState } from 'react'
import { timeAgo } from '../lib/utils'

const PLATFORM_COLORS = {
  linkedin: 'bg-blue-100 text-blue-800',
  naukri: 'bg-orange-100 text-orange-800',
  internshala: 'bg-green-100 text-green-800',
  indeed: 'bg-indigo-100 text-indigo-800',
}

const STATUS_STYLES = {
  new: 'bg-gray-100 text-gray-700',
  saved: 'bg-blue-100 text-blue-700',
  applied: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  interview: 'bg-purple-100 text-purple-700',
}

const STATUS_OPTIONS = ["new", "saved", "applied", "rejected", "interview"]

export default function JobCard({ job, onStatusChange }) {
  const [status, setStatus] = useState(job.status || 'new')
  const [saving, setSaving] = useState(false)

  const platformKey = (job.platform || '').toLowerCase()
  const platformColor = PLATFORM_COLORS[platformKey] || 'bg-gray-100 text-gray-700'
  const scoreColor =
    job.fit_score >= 80
      ? 'bg-green-100 text-green-800'
      : job.fit_score >= 70
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-red-100 text-red-800'

  async function handleStatusChange(e) {
    const next = e.target.value
    setStatus(next)
    setSaving(true)
    try {
      await onStatusChange(job.id, next)
    } finally {
      setSaving(false)
    }
  }

  async function handleHide() {
    setSaving(true)
    try {
      await onStatusChange(job.id, 'hidden')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
      {/* Hide button — visible on card hover */}
      <button
        onClick={handleHide}
        disabled={saving}
        title="Hide this job"
        className="absolute top-2 right-2 text-gray-300 hover:text-red-400 transition-colors
                   opacity-0 group-hover:opacity-100 leading-none text-lg font-light"
      >
        ✕
      </button>

      <div className="flex justify-between items-center">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${platformColor}`}>
          {job.platform}
        </span>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${scoreColor}`}>
          {job.fit_score}% fit
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-bold text-gray-900 text-lg leading-snug">{job.title}</h3>
        {job.scraped_at && (Date.now() - new Date(job.scraped_at).getTime()) < 86400000 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
            NEW
          </span>
        )}
      </div>

      <p className="text-sm text-gray-500">
        <span className="font-medium text-gray-700">{job.company}</span>
        {job.location && <span className="ml-2">📍 {job.location}</span>}
      </p>

      <p className="text-xs text-gray-400">{timeAgo(job.posted_at)}</p>

      {job.fit_reason && (
        <p className="text-sm text-gray-500 italic leading-relaxed">
          "{job.fit_reason}"
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-gray-100">
        <select
          value={status}
          onChange={handleStatusChange}
          disabled={saving}
          className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border-0 outline-none
                      cursor-pointer focus:ring-2 focus:ring-indigo-400 ${STATUS_STYLES[status] || STATUS_STYLES['new']}`}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
        >
          View Job →
        </a>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JobCard from '../components/JobCard'
import ProfileModal from '../components/ProfileModal'
import SkeletonCard from '../components/SkeletonCard'
import { getJobs, getUser, scrapeJobs, updateJobStatus } from '../lib/api'

export default function Dashboard() {
  const navigate = useNavigate()

  // ── State ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [scrapeCountdown, setScrapeCountdown] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sortBy, setSortBy] = useState('fit_score')
  const [filters, setFilters] = useState({
    platform: '',
    status: '',
    minScore: 60,
    postedWithin: '',
  })
  const scrapeTimerRef = useRef(null)

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }))
  }

  // ── Fetch user on mount ────────────────────────────────────────────────────
  useEffect(() => {
    const userId = localStorage.getItem('user_id')
    if (!userId) { navigate('/login', { replace: true }); return }
    getUser(userId).then(setUser).catch(console.error)
  }, [])

  // ── Fetch jobs whenever filters or refreshKey change ───────────────────────
  useEffect(() => {
    let cancelled = false
    const userId = localStorage.getItem('user_id')
    if (!userId) return

    setLoading(true)
    const params = {
      user_id: userId,
      limit: 100,
      minScore: filters.minScore,
      ...(filters.platform && { platform: filters.platform }),
      ...(filters.status && { status: filters.status }),
      ...(filters.postedWithin && { posted_within_hours: parseInt(filters.postedWithin) }),
    }

    getJobs(params)
      .then(data => { if (!cancelled) setJobs(data) })
      .catch(err => { if (!cancelled) console.error('fetch jobs:', err) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [filters, refreshKey])

  // ── Cleanup scrape timer on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => { if (scrapeTimerRef.current) clearInterval(scrapeTimerRef.current) }
  }, [])

  // ── Client-side sort ───────────────────────────────────────────────────────
  const sortedJobs = useMemo(() => {
    const arr = [...jobs]
    if (sortBy === 'fit_score') {
      arr.sort((a, b) => b.fit_score - a.fit_score)
    } else if (sortBy === 'date_posted') {
      arr.sort((a, b) => {
        if (!a.posted_at) return 1
        if (!b.posted_at) return -1
        return new Date(b.posted_at) - new Date(a.posted_at)
      })
    } else if (sortBy === 'company') {
      arr.sort((a, b) => (a.company || '').localeCompare(b.company || ''))
    }
    return arr
  }, [jobs, sortBy])

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleScrape() {
    const userId = localStorage.getItem('user_id')
    if (!userId) return
    setScraping(true)
    localStorage.setItem('last_scraped', new Date().toISOString())
    try {
      await scrapeJobs(userId)
      let secs = 90
      setScrapeCountdown(secs)
      if (scrapeTimerRef.current) clearInterval(scrapeTimerRef.current)
      scrapeTimerRef.current = setInterval(() => {
        secs -= 1
        setScrapeCountdown(secs)
        if (secs <= 0) {
          clearInterval(scrapeTimerRef.current)
          scrapeTimerRef.current = null
          setScraping(false)
          setScrapeCountdown(0)
          setRefreshKey(k => k + 1)
        }
      }, 1000)
    } catch (err) {
      setScraping(false)
      setScrapeCountdown(0)
      console.error('Scrape failed:', err)
    }
  }

  async function handleStatusChange(jobId, newStatus) {
    await updateJobStatus(jobId, newStatus)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
  }

  function handleLogout() {
    localStorage.clear()
    navigate('/login', { replace: true })
  }

  // ── Last scraped text ──────────────────────────────────────────────────────
  function lastScrapedText() {
    const ts = localStorage.getItem('last_scraped')
    if (!ts) return null
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`
    const h = Math.floor(mins / 60)
    return `${h}h ago`
  }

  const userName = user?.name || localStorage.getItem('user_name') || 'User'
  const userPicture = user?.picture
  const lastScraped = lastScrapedText()

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 space-y-7">

          {/* Controls */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Controls</p>
            <button
              onClick={handleScrape}
              disabled={scraping}
              className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-lg font-semibold
                         hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed text-sm
                         flex items-center justify-center gap-2"
            >
              {scraping ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {scrapeCountdown > 0 ? `Scraping... ${scrapeCountdown}s` : 'Scraping...'}
                </>
              ) : (
                '🔍 Run Scrape'
              )}
            </button>

            {scraping && (
              <p className="text-xs text-gray-400 mt-1.5 text-center">
                Results will appear in ~90 seconds
              </p>
            )}
            {!scraping && lastScraped && (
              <p className="text-xs text-gray-400 mt-1.5 text-center">
                Last scraped: {lastScraped}
              </p>
            )}
          </div>

          {/* Filters */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Filters</p>
            <div className="space-y-4">

              {/* Platform */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Platform</label>
                <select
                  value={filters.platform}
                  onChange={e => setFilter('platform', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
                             focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">All</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="naukri">Naukri</option>
                  <option value="internshala">Internshala</option>
                  <option value="indeed">Indeed</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                <select
                  value={filters.status}
                  onChange={e => setFilter('status', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
                             focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">All</option>
                  <option value="new">New</option>
                  <option value="saved">Saved</option>
                  <option value="applied">Applied</option>
                  <option value="rejected">Rejected</option>
                  <option value="interview">Interview</option>
                </select>
              </div>

              {/* Fit Score slider */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-gray-600">Fit Score</label>
                  <span className="text-xs font-semibold text-indigo-600">Min: {filters.minScore}</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="100"
                  step="5"
                  value={filters.minScore}
                  onChange={e => setFilter('minScore', parseInt(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>60</span>
                  <span>100</span>
                </div>
              </div>

              {/* Posted radio */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Posted</label>
                <div className="space-y-2">
                  {[
                    { label: 'All time', value: '' },
                    { label: 'Last 24h', value: '24' },
                    { label: 'Last 7 days', value: '168' },
                    { label: 'Last 30 days', value: '720' },
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="postedWithin"
                        value={opt.value}
                        checked={filters.postedWithin === opt.value}
                        onChange={() => setFilter('postedWithin', opt.value)}
                        className="accent-indigo-600"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* My Profile (collapsible) */}
          <div>
            <button
              onClick={() => setProfileOpen(o => !o)}
              className="flex items-center justify-between w-full text-xs font-semibold
                         text-gray-400 uppercase tracking-wider mb-2"
            >
              <span>My Profile</span>
              <span className="text-gray-300 text-base">{profileOpen ? '▴' : '▾'}</span>
            </button>

            {profileOpen && (
              user ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{user.name}</p>
                    <p className="text-xs text-gray-400 break-all">{user.email}</p>
                  </div>

                  {user.preferences?.roles?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Roles</p>
                      <div className="flex flex-wrap gap-1">
                        {user.preferences.roles.slice(0, 4).map(r => (
                          <span key={r} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {user.preferences?.skills?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Skills</p>
                      <div className="flex flex-wrap gap-1">
                        {user.preferences.skills.slice(0, 6).map(s => (
                          <span key={s} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setShowProfileModal(true)}
                    className="w-full text-xs py-2 border border-gray-200 rounded-lg
                               text-gray-600 hover:bg-gray-50 font-medium"
                  >
                    Edit Profile
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading...</p>
              )
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Navbar */}
        <nav className="h-16 bg-white border-b border-gray-200 flex items-center justify-between
                        px-6 flex-shrink-0">
          <div>
            <p className="font-bold text-gray-900 leading-tight">Job Hunt Agent</p>
            <p className="text-xs text-gray-400">AI-powered job discovery</p>
          </div>

          <div className="flex items-center gap-3">
            {userPicture ? (
              <img
                src={userPicture}
                alt={userName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-100"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center
                              text-indigo-700 font-bold text-sm">
                {userName[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-sm text-gray-700 font-medium hidden sm:block">{userName}</span>
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg
                         text-gray-600 hover:bg-gray-50 font-medium"
            >
              Logout
            </button>
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-500 text-sm">
              <span className="font-bold text-gray-900 text-lg">{jobs.length}</span>
              <span className="ml-1">jobs found</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sort by:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5
                           focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="fit_score">Fit Score</option>
                <option value="date_posted">Date Posted</option>
                <option value="company">Company</option>
              </select>
            </div>
          </div>

          {/* Job grid / states */}
          {loading ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : sortedJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No jobs yet</h3>
              <p className="text-gray-400 max-w-xs text-sm">
                Click <strong>Run Scrape</strong> to find jobs matching your profile
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {sortedJobs.map(job => (
                <JobCard key={job.id} job={job} onStatusChange={handleStatusChange} />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Profile Modal */}
      {showProfileModal && user && (
        <ProfileModal
          user={user}
          onSave={updated => { setUser(updated); setShowProfileModal(false) }}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  )
}

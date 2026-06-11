import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TagInput from '../components/TagInput'
import { parseResume, scrapeJobs, updateUser } from '../lib/api'

function StepIndicator({ step }) {
  return (
    <div className="mb-8">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-500">Step {step} of 3</span>
        <span className="font-medium text-indigo-600">
          {step === 1 ? 'Resume' : step === 2 ? 'Preferences' : 'Confirm & Launch'}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>
    </div>
  )
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function Onboarding() {
  const navigate = useNavigate()
  const userId = localStorage.getItem('user_id')
  const fileInputRef = useRef(null)

  const [step, setStep] = useState(1)

  // Step 1 state
  const [pdfFile, setPdfFile] = useState(null)
  const [textInput, setTextInput] = useState('')
  const [showTextFallback, setShowTextFallback] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [extractedResumeText, setExtractedResumeText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  // Step 3 state
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState('')

  const [prefs, setPrefs] = useState({
    roles: [],
    skills: [],
    location: ['Remote'],
    salary_min: '',
    experience: '',
  })

  function setPrefsKey(key, value) {
    setPrefs(p => ({ ...p, [key]: value }))
  }

  const canAnalyse = !!pdfFile || textInput.trim().length > 0

  // ── File handling ────────────────────────────────────────────────────────────

  function acceptFile(file) {
    if (!file) return
    if (file.type !== 'application/pdf') {
      setParseError('Only PDF files are supported.')
      return
    }
    setPdfFile(file)
    setTextInput('')   // mutually exclusive
    setParseError('')
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    acceptFile(e.dataTransfer.files[0])
  }

  function handleTextChange(e) {
    setTextInput(e.target.value)
    if (e.target.value) setPdfFile(null)  // mutually exclusive
  }

  function clearFile() {
    setPdfFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setParseError('')
  }

  // ── Step 1: analyse ──────────────────────────────────────────────────────────

  async function handleAnalyse() {
    if (!canAnalyse) return
    setParseError('')
    setParsing(true)
    try {
      let payload
      if (pdfFile) {
        const base64 = await readFileAsBase64(pdfFile)
        payload = { resume_pdf: base64, filename: pdfFile.name }
      } else {
        payload = { resume_text: textInput }
      }

      const parsed = await parseResume(userId, payload)
      setExtractedResumeText(parsed.resume_text || textInput || '')
      setPrefs(p => ({
        ...p,
        roles: parsed.roles?.length ? parsed.roles : p.roles,
        skills: parsed.skills?.length ? parsed.skills : p.skills,
        location: parsed.locations?.length ? parsed.locations : p.location,
      }))
      setStep(2)
    } catch (err) {
      setParseError(err.message || 'Failed to parse resume. Please try again.')
    } finally {
      setParsing(false)
    }
  }

  // ── Step 3: save + launch ────────────────────────────────────────────────────

  async function handleLaunch() {
    setLaunchError('')
    setLaunching(true)
    try {
      await updateUser(userId, {
        resume_text: extractedResumeText,
        preferences: {
          roles: prefs.roles,
          skills: prefs.skills,
          location: prefs.location,
          salary_min: prefs.salary_min !== '' ? parseInt(prefs.salary_min) : null,
          experience: parseInt(prefs.experience) || 0,
        },
      })
      await scrapeJobs(userId)
      localStorage.setItem('has_resume', '1')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setLaunchError(err.message || 'Something went wrong. Please try again.')
      setLaunching(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-600 mb-3">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Set up your profile</h1>
          <p className="text-gray-500 mt-1">Let's configure your job hunt in 3 quick steps</p>
        </div>

        <StepIndicator step={step} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* ── Step 1: Resume ── */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Upload your resume</h2>
              <p className="text-gray-500 text-sm mb-5">
                Our AI will extract your skills and preferred roles automatically.
              </p>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={e => acceptFile(e.target.files[0])}
              />

              {/* Drag-drop zone */}
              {!pdfFile ? (
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                  onDragLeave={e => { e.preventDefault(); setIsDragOver(false) }}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
                    transition-colors select-none
                    ${isDragOver
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50'}`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">
                        {isDragOver ? 'Drop your PDF here' : 'Drag & drop your PDF'}
                      </p>
                      <p className="text-sm text-gray-400 mt-0.5">
                        or <span className="text-indigo-600 font-medium">click to browse</span>
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">PDF files only</p>
                  </div>
                </div>
              ) : (
                /* File selected state */
                <div className="border-2 border-green-400 bg-green-50 rounded-xl p-5 flex items-center gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd"
                        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                        clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{pdfFile.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(pdfFile.size)}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Green checkmark */}
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      onClick={clearFile}
                      className="text-xs text-gray-400 hover:text-red-500 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsible text fallback */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowTextFallback(s => !s)}
                  className="text-sm text-gray-400 hover:text-indigo-600 flex items-center gap-1"
                >
                  <span>{showTextFallback ? '▴' : '▾'}</span>
                  Or paste text instead
                </button>

                {showTextFallback && (
                  <div className="mt-3">
                    <textarea
                      value={textInput}
                      onChange={handleTextChange}
                      rows={10}
                      className="w-full border border-gray-300 rounded-xl p-4 text-sm resize-none
                                 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none
                                 font-mono leading-relaxed"
                      placeholder="Copy and paste your full resume text..."
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">{textInput.length} characters</span>
                      {textInput.length > 0 && textInput.length < 100 && (
                        <span className="text-xs text-yellow-600">
                          Resume seems short — paste the full text for better results
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {parseError && (
                <p className="text-sm text-red-500 mt-4">{parseError}</p>
              )}

              <button
                onClick={handleAnalyse}
                disabled={parsing || !canAnalyse}
                className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-base
                           hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                           flex items-center justify-center gap-2"
              >
                {parsing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    AI is reading your resume...
                  </>
                ) : (
                  'Analyse Resume →'
                )}
              </button>
            </div>
          )}

          {/* ── Step 2: Preferences ── */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Your preferences</h2>
              <p className="text-sm text-gray-500 mb-6">
                We found these based on your resume — edit as needed.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Job Roles</label>
                  <TagInput
                    tags={prefs.roles}
                    onChange={v => setPrefsKey('roles', v)}
                    placeholder="Add role, press Enter..."
                    color="blue"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Skills</label>
                  <TagInput
                    tags={prefs.skills}
                    onChange={v => setPrefsKey('skills', v)}
                    placeholder="Add skill, press Enter..."
                    color="green"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Preferred Locations
                  </label>
                  <TagInput
                    tags={prefs.location}
                    onChange={v => setPrefsKey('location', v)}
                    placeholder="Add location, press Enter..."
                    color="purple"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Minimum Salary (₹/year)
                    </label>
                    <input
                      type="number"
                      value={prefs.salary_min}
                      onChange={e => setPrefsKey('salary_min', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                                 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g. 800000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Years of Experience
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={prefs.experience}
                      onChange={e => setPrefsKey('experience', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                                 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g. 2"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700
                             hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={prefs.roles.length === 0 && prefs.skills.length === 0}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold
                             hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Ready to launch?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Review your setup before we start hunting.
              </p>

              {/* Summary card */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-5 space-y-4 mb-6">
                {/* Resume source */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Resume
                  </p>
                  {pdfFile ? (
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded bg-red-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd"
                            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                            clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-gray-700">{pdfFile.name}</span>
                      <span className="text-xs text-gray-400">({formatBytes(pdfFile.size)})</span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {extractedResumeText.slice(0, 200)}
                      {extractedResumeText.length > 200 && (
                        <span className="text-gray-400">
                          {' '}...({extractedResumeText.length} chars total)
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {/* Roles */}
                {prefs.roles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Job Roles
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {prefs.roles.map(r => (
                        <span key={r} className="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-medium">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {prefs.skills.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Skills
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {prefs.skills.map(s => (
                        <span key={s} className="text-xs bg-green-100 text-green-800 px-2.5 py-1 rounded-full font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Locations */}
                {prefs.location.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Locations
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {prefs.location.map(l => (
                        <span key={l} className="text-xs bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full font-medium">
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Salary + Exp */}
                {(prefs.salary_min || prefs.experience) && (
                  <div className="flex gap-6">
                    {prefs.salary_min && (
                      <div>
                        <p className="text-xs text-gray-400">Min Salary</p>
                        <p className="text-sm font-medium text-gray-700">
                          ₹{Number(prefs.salary_min).toLocaleString('en-IN')}
                        </p>
                      </div>
                    )}
                    {prefs.experience && (
                      <div>
                        <p className="text-xs text-gray-400">Experience</p>
                        <p className="text-sm font-medium text-gray-700">{prefs.experience} years</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {launchError && (
                <p className="text-sm text-red-500 mb-4">{launchError}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  disabled={launching}
                  className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700
                             hover:bg-gray-50 disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleLaunch}
                  disabled={launching}
                  className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold text-base
                             hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2"
                >
                  {launching ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Launching...
                    </>
                  ) : (
                    'Start Job Hunt 🚀'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

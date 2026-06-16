import { useState } from 'react'
import { parseResume, updateUser } from '../lib/api'
import TagInput from './TagInput'

export default function ProfileModal({ user, onSave, onClose, toast }) {
  const [form, setForm] = useState({
    resume_text: user.resume_text || '',
    roles: user.preferences?.roles || [],
    skills: user.preferences?.skills || [],
    location: user.preferences?.location || [],
    salary_min: user.preferences?.salary_min ?? '',
    experience: user.preferences?.experience ?? 0,
  })
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleReparse() {
    if (!form.resume_text.trim()) return
    setError('')
    setParsing(true)
    try {
      const userId = localStorage.getItem('user_id')
      const parsed = await parseResume(userId, form.resume_text)
      setForm(f => ({
        ...f,
        roles: parsed.roles?.length ? parsed.roles : f.roles,
        skills: parsed.skills?.length ? parsed.skills : f.skills,
        location: parsed.locations?.length ? parsed.locations : f.location,
      }))
      toast?.success('Resume re-analysed! Preferences updated.')
    } catch (err) {
      toast?.error('Failed to re-parse resume. Please try again.')
      setError('Parse failed: ' + err.message)
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const userId = localStorage.getItem('user_id')
      const updated = await updateUser(userId, {
        resume_text: form.resume_text,
        preferences: {
          roles: form.roles,
          skills: form.skills,
          location: form.location,
          salary_min: form.salary_min !== '' ? parseInt(form.salary_min) : null,
          experience: parseInt(form.experience) || 0,
        },
      })
      localStorage.setItem('has_resume', '1')
      toast?.success('Profile updated successfully')
      onSave(updated)
    } catch (err) {
      toast?.error('Failed to save profile. Please try again.')
      setError('Save failed: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50">
      <div className="flex h-full sm:items-center sm:justify-center sm:p-4">
      <div className="bg-white w-full h-full sm:h-auto sm:rounded-2xl sm:shadow-2xl sm:max-w-2xl sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Resume */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Resume</label>
              <button
                onClick={handleReparse}
                disabled={parsing || !form.resume_text.trim()}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100
                           disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {parsing ? 'Parsing...' : '✨ Re-parse Resume'}
              </button>
            </div>
            <textarea
              value={form.resume_text}
              onChange={e => set('resume_text', e.target.value)}
              rows={5}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none
                         focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Paste your resume text here..."
            />
          </div>

          {/* Roles */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Job Roles</label>
            <TagInput
              tags={form.roles}
              onChange={v => set('roles', v)}
              placeholder="Add role, press Enter..."
              color="blue"
            />
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Skills</label>
            <TagInput
              tags={form.skills}
              onChange={v => set('skills', v)}
              placeholder="Add skill, press Enter..."
              color="green"
            />
          </div>

          {/* Locations */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Preferred Locations</label>
            <TagInput
              tags={form.location}
              onChange={v => set('location', v)}
              placeholder="Add location, press Enter..."
              color="purple"
            />
          </div>

          {/* Salary + Experience */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Min Salary (₹/year)
              </label>
              <input
                type="number"
                value={form.salary_min}
                onChange={e => set('salary_min', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
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
                value={form.experience}
                onChange={e => set('experience', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                           focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="e.g. 2"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium
                       text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold
                       hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

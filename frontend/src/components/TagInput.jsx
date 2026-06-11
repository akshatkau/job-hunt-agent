import { useState } from 'react'

const COLOR_CLASSES = {
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  purple: 'bg-purple-100 text-purple-800',
  orange: 'bg-orange-100 text-orange-800',
  indigo: 'bg-indigo-100 text-indigo-800',
}

export default function TagInput({ tags = [], onChange, placeholder = 'Add tag...', color = 'blue' }) {
  const [input, setInput] = useState('')
  const pill = COLOR_CLASSES[color] || COLOR_CLASSES.blue

  function commit(raw) {
    const value = raw.trim().replace(/,+$/, '').trim()
    if (value && !tags.includes(value)) onChange([...tags, value])
    setInput('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(input)
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div
      className="min-h-[42px] flex flex-wrap gap-1.5 p-2 border border-gray-300 rounded-lg
                 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 bg-white"
    >
      {tags.map((tag, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-sm font-medium ${pill}`}
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
            className="ml-0.5 leading-none hover:opacity-60 text-base"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input.trim() && commit(input)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] outline-none text-sm py-0.5 bg-transparent"
      />
    </div>
  )
}

export function timeAgo(isoString) {
  if (!isoString) return 'Recently posted'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return 'Recently posted'
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / 3600000)
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / 60000)
      return diffMins <= 1 ? 'Just now' : `${diffMins} minutes ago`
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  const weeks = Math.floor(diffDays / 7)
  if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  const months = Math.floor(diffDays / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

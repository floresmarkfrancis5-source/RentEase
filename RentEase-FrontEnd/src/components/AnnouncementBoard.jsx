import { useLoad } from './ui'

export default function AnnouncementBoard({ compact = false, collapsible = false }) {
  const { data, error, loading } = useLoad('/api/my/announcements')
  if (loading) return null
  if (error) return <p className="alert alert--error" role="alert">Announcements could not be loaded: {error}</p>
  if (!data?.length) return null

  const contents = (
    <>
      {!collapsible && (
        <div className="announcement-board__head">
          <span className="eyebrow">From your landlord</span>
          <h2>Announcements</h2>
        </div>
      )}
      <div className="announcement-board__list">
        {data.map((item) => (
          <article className="announcement-board__item" key={item.id}>
            <div className="announcement-board__date">
              {new Date(String(item.created_at).replace(' ', 'T')).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </>
  )

  if (collapsible) {
    return (
      <details className={`announcement-board announcement-board--collapsible${compact ? ' announcement-board--compact' : ''}`}>
        <summary className="announcement-board__summary">
          <span>
            <span className="eyebrow">From your landlord</span>
            <strong>Announcements</strong>
          </span>
          <span className="announcement-board__count">{data.length} {data.length === 1 ? 'announcement' : 'announcements'}</span>
        </summary>
        {contents}
      </details>
    )
  }

  return (
    <section className={`announcement-board${compact ? ' announcement-board--compact' : ''}`} aria-label="Announcements">
      {contents}
    </section>
  )
}

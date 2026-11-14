import React from 'react'
import { useLanguage } from '../context/LanguageContext'

export default function ViewToolbar({
  view = 'grid',
  onViewChange,
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  sort,
  onSortChange,
  sortOptions = [],
  filter,
  onFilterChange,
  filterOptions = [],
  children,
}) {
  const { t } = useLanguage()
  return (
    <div className="view-toolbar">
      <div className="view-toolbar__left">
        {onSearchChange && (
          <div className="view-toolbar__search">
            <span className="view-toolbar__search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
            </span>
            <input
              type="text"
              placeholder={t(searchPlaceholder)}
              aria-label={t(searchPlaceholder)}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        )}

        {filterOptions.length > 0 && onFilterChange && (
          <select value={filter} onChange={(e) => onFilterChange(e.target.value)}>
            {filterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.label)}
              </option>
            ))}
          </select>
        )}

        {children}
      </div>

      <div className="view-toolbar__right">
        {sortOptions.length > 0 && onSortChange && (
          <div className="view-toolbar__sort">
            <span className="view-toolbar__sort-icon">⇅</span>
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
              aria-label={t('Sort options')}
              title={t('Sort items')}
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </option>
              ))}
            </select>
          </div>
        )}

        {onViewChange && (
          <div className="view-toggle" role="group" aria-label={t('View toggle')}>
            <button
              type="button"
              className={`view-toggle__btn ${view === 'grid' ? 'is-active' : ''}`}
              onClick={() => onViewChange('grid')}
              title={t('Grid / Icons view')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
              <span>{t('Icons')}</span>
            </button>
            <button
              type="button"
              className={`view-toggle__btn ${view === 'list' ? 'is-active' : ''}`}
              onClick={() => onViewChange('list')}
              title={t('List / Table view')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              <span>{t('List')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

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
            <span className="view-toolbar__search-icon">🔍</span>
            <input
              type="text"
              placeholder={t(searchPlaceholder)}
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
              <span>田</span>
              <span>{t('Icons')}</span>
            </button>
            <button
              type="button"
              className={`view-toggle__btn ${view === 'list' ? 'is-active' : ''}`}
              onClick={() => onViewChange('list')}
              title={t('List / Table view')}
            >
              <span>☰</span>
              <span>{t('List')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

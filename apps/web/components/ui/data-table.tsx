'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Icon } from './icon';
import { EmptyState } from './primitives';
import styles from './interactive.module.css';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number;
  align?: 'start' | 'end';
  /** Hide on narrow screens to keep the table readable. */
  hideOnMobile?: boolean;
}

export interface FilterDef<T> {
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  getValue: (row: T) => string;
}

type SortState = { key: string; direction: 'asc' | 'desc' } | null;

/**
 * Client-side table with search, filters, sorting and pagination over local (mock) rows.
 * When the API exists, the same controls map onto server-side pagination and filtering
 * (Product Flows §10, §14.2).
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  caption,
  getSearchText,
  searchLabel = 'Search',
  filters = [],
  pageSize = 8,
  initialSort = null,
  emptyTitle = 'No results',
  emptyBody = 'Try a different search or clear the filters.',
  toolbar,
}: {
  rows: ReadonlyArray<T>;
  columns: ReadonlyArray<Column<T>>;
  getRowId: (row: T) => string;
  caption: string;
  getSearchText?: (row: T) => string;
  searchLabel?: string;
  filters?: ReadonlyArray<FilterDef<T>>;
  pageSize?: number;
  initialSort?: SortState;
  emptyTitle?: string;
  emptyBody?: string;
  toolbar?: ReactNode;
}) {
  const base = useId();
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && getSearchText && !getSearchText(row).toLowerCase().includes(needle)) {
        return false;
      }
      return filters.every((filter) => {
        const selected = filterValues[filter.key];
        return !selected || filter.getValue(row) === selected;
      });
    });
  }, [rows, query, filterValues, filters, getSearchText]);

  const sorted = useMemo(() => {
    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) {
      return filtered;
    }
    const value = column.sortValue;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      return (left < right ? -1 : left > right ? 1 : 0) * factor;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);
  const hasActiveFilters = query.trim() !== '' || Object.values(filterValues).some(Boolean);

  function toggleSort(key: string) {
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      return current.direction === 'asc' ? { key, direction: 'desc' } : null;
    });
  }

  function clearFilters() {
    setQuery('');
    setFilterValues({});
    setPage(1);
  }

  return (
    <div className={styles.table}>
      <div className={styles.tableToolbar}>
        <div className={styles.tableFilters}>
          {getSearchText ? (
            <div className={styles.searchBox}>
              <label htmlFor={`${base}-search`} className="visually-hidden">
                {searchLabel}
              </label>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                id={`${base}-search`}
                type="search"
                placeholder={searchLabel}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                className={styles.searchInput}
              />
            </div>
          ) : null}
          {filters.map((filter) => (
            <div key={filter.key} className={styles.filter}>
              <label htmlFor={`${base}-filter-${filter.key}`} className="visually-hidden">
                {filter.label}
              </label>
              <select
                id={`${base}-filter-${filter.key}`}
                value={filterValues[filter.key] ?? ''}
                onChange={(event) => {
                  setFilterValues((current) => ({ ...current, [filter.key]: event.target.value }));
                  setPage(1);
                }}
                className={styles.filterSelect}
              >
                <option value="">{filter.label}: all</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {hasActiveFilters ? (
            <button type="button" className={styles.linkButton} onClick={clearFilters}>
              Clear
            </button>
          ) : null}
        </div>
        {toolbar ? <div className={styles.tableActions}>{toolbar}</div> : null}
      </div>

      <div className={styles.tableScroll}>
        <table>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => {
                const direction = sort?.key === column.key ? sort.direction : null;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={[
                      column.align === 'end' ? styles.alignEnd : '',
                      column.hideOnMobile ? styles.hideOnMobile : '',
                    ].join(' ')}
                  >
                    {column.sortValue ? (
                      <button type="button" className={styles.sortButton} onClick={() => toggleSort(column.key)}>
                        {column.header}
                        <Icon
                          name={direction === 'asc' ? 'chevronDown' : direction === 'desc' ? 'chevronDown' : 'sort'}
                          size={14}
                          className={direction === 'asc' ? styles.sortAsc : undefined}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={getRowId(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      column.align === 'end' ? styles.alignEnd : '',
                      column.hideOnMobile ? styles.hideOnMobile : '',
                    ].join(' ')}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <EmptyState icon="search" title={emptyTitle}>
            {hasActiveFilters ? emptyBody : null}
          </EmptyState>
        ) : null}
      </div>

      <div className={styles.pagination}>
        <p className={styles.paginationInfo} aria-live="polite">
          {sorted.length === 0
            ? 'No rows'
            : `Showing ${start + 1}–${Math.min(start + pageSize, sorted.length)} of ${sorted.length}`}
        </p>
        <div className={styles.paginationControls}>
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className={styles.pageIndicator}>
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
            aria-label="Next page"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

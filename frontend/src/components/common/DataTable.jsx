import React from 'react';
import { TableWrapper } from '@/components/shared/TableWrapper';
import { Pagination } from '@/components/shared/Pagination';
import { useLanguage } from '@/lib/i18n.jsx';

/**
 * Enterprise DataTable Component
 * Standardized table component with row selection, customizable columns, and integrated pagination
 */
export function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  isLoading = false,
  emptyMessage,
  selectedRows = [],
  onSelectRow,
  onSelectAll,
  showSelection = false,
  pagination,
  className = '',
}) {
  const { t } = useLanguage();
  const resolvedEmpty = emptyMessage || t('common.messages.noData') || 'No data found';
  const isAllSelected = data.length > 0 && selectedRows.length === data.length;

  return (
    <div className={`space-y-0 ${className}`}>
      <TableWrapper isLoading={isLoading} isEmpty={data.length === 0} emptyMessage={resolvedEmpty}>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-800/50">
              {showSelection && (
                <th className="w-12 px-4 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => onSelectAll && onSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-[#C59B27] focus:ring-[#C59B27] cursor-pointer"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key || col.id}
                  className={`px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                    col.align === 'center'
                      ? 'text-center'
                      : col.align === 'right'
                      ? 'text-right'
                      : 'text-left'
                  } ${col.width ? col.width : ''}`}
                >
                  {col.title || col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
            {data.map((row, idx) => {
              const rowKey = row[keyField] || idx;
              const isSelected = selectedRows.includes(rowKey);

              return (
                <tr
                  key={rowKey}
                  className={`transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/50 ${
                    isSelected ? 'bg-[#C59B27]/5 dark:bg-[#C59B27]/10' : ''
                  }`}
                >
                  {showSelection && (
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelectRow && onSelectRow(rowKey, e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-[#C59B27] focus:ring-[#C59B27] cursor-pointer"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key || col.id}
                      className={`px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 ${
                        col.align === 'center'
                          ? 'text-center'
                          : col.align === 'right'
                          ? 'text-right'
                          : 'text-left'
                      }`}
                    >
                      {col.render ? col.render(row[col.key || col.id], row, idx) : row[col.key || col.id]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrapper>

      {pagination && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      )}
    </div>
  );
}

export default DataTable;

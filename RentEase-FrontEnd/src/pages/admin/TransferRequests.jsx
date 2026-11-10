import { useMemo, useState } from 'react'
import { FormModal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'
import ViewToolbar from '../../components/ViewToolbar'

export default function TransferRequests() {
  const transfers = useLoad('/api/admin/transfer-requests')
  const earlyMoves = useLoad('/api/admin/early-move-requests')
  const data = useMemo(() => [
    ...(transfers.data || []).map((row) => ({ ...row, request_type: 'transfer' })),
    ...(earlyMoves.data || []).map((row) => ({ ...row, request_type: 'early_move' })),
  ], [transfers.data, earlyMoves.data])
  const error = transfers.error || earlyMoves.error
  const loading = transfers.loading || earlyMoves.loading
  const reload = () => Promise.all([transfers.reload(), earlyMoves.reload()])
  const [reject, setReject] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [toast, flash] = useToast()

  const rawData = data || []

  const decide = async (row, status, admin_note = null) => {
    try {
      const path = row.request_type === 'early_move' ? 'early-move-requests' : 'transfer-requests'
      const r = await api(`/api/admin/${path}/${row.id}`, {
        method: 'PATCH',
        auth: true,
        body: { status, admin_note },
      })
      flash(r.message)
      reload()
    } catch (e) {
      flash(e.message, 'bad')
    }
  }

  const deleteRequest = async (row) => {
    const requestLabel = row.request_type === 'early_move' ? 'early move-in request' : 'transfer request'
    if (!window.confirm(`Delete ${requestLabel} from ${row.tenant_name}?`)) return
    try {
      const path = row.request_type === 'early_move' ? 'early-move-requests' : 'transfer-requests'
      const r = await api(`/api/admin/${path}/${row.id}`, {
        method: 'DELETE',
        auth: true,
      })
      flash(r.message || 'Transfer request deleted.')
      reload()
    } catch (e) {
      flash(e.message, 'bad')
    }
  }

  const submitReject = async ({ admin_note }) => {
    await decide(reject, 'rejected', admin_note || null)
    setReject(null)
  }

  const filteredData = useMemo(() => {
    let result = [...rawData]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          String(r.tenant_name || '').toLowerCase().includes(q) ||
          String(r.current_unit_name || r.unit_name || '').toLowerCase().includes(q) ||
          String(r.current_property_name || r.property_name || '').toLowerCase().includes(q) ||
          String(r.requested_unit_name || '').toLowerCase().includes(q) ||
          String(r.requested_property_name || '').toLowerCase().includes(q) ||
          String(r.requested_start_date || '').toLowerCase().includes(q) ||
          String(r.reason || '').toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter)
    }

    result.sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      if (sortBy === 'newest') return tb - ta
      if (sortBy === 'oldest') return ta - tb
      if (sortBy === 'tenant-asc') return (a.tenant_name || '').localeCompare(b.tenant_name || '')
      if (sortBy === 'unit-asc') return (a.requested_unit_name || '').localeCompare(b.requested_unit_name || '')
      if (sortBy === 'status') {
        const order = { pending: 1, approved: 2, rejected: 3 }
        return (order[a.status] || 9) - (order[b.status] || 9)
      }
      return 0
    })

    return result
  }, [rawData, search, statusFilter, sortBy])

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Transfer & move-in requests"
        sub="Review unit transfers and requests to start a scheduled lease early."
      />

      <State loading={loading} error={error} empty={rawData.length === 0 && 'No transfer requests yet.'}>
        {rawData.length > 0 && (
          <>
            <ViewToolbar
              view={viewMode}
              onViewChange={setViewMode}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search tenant, unit, or reason…"
              sort={sortBy}
              onSortChange={setSortBy}
              sortOptions={[
                { value: 'newest', label: 'Sort: Newest first' },
                { value: 'oldest', label: 'Sort: Oldest first' },
                { value: 'tenant-asc', label: 'Sort: Tenant (A-Z)' },
                { value: 'unit-asc', label: 'Sort: Unit (A-Z)' },
                { value: 'status', label: 'Sort: Pending first' },
              ]}
              filter={statusFilter}
              onFilterChange={setStatusFilter}
              filterOptions={[
                { value: 'all', label: 'All Statuses' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'expired', label: 'Expired' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />

            {filteredData.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', background: 'var(--page-raised)', borderRadius: '12px', border: '1px solid var(--page-line)' }}>
                <p className="muted" style={{ margin: 0 }}>No requests match your filter.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="cards-grid">
                {filteredData.map((r) => (
                  <div key={`${r.request_type}-${r.id}`} className="request-card">
                    <div className="request-card__head">
                      <div>
                        <h4 className="request-card__title">{r.tenant_name}</h4>
                        <span className="request-card__sub">{r.request_type === 'early_move' ? 'Early move-in request' : 'Unit transfer'} · Requested {dateFmt(r.created_at)}</span>
                      </div>
                      <StatusPill value={r.status} />
                    </div>

                    {r.request_type === 'early_move' ? (
                      <div style={{ padding: '10px 12px', background: 'var(--page-line)', borderRadius: '8px', fontSize: '.84rem' }}>
                        <strong>{r.unit_name} · {r.property_name}</strong>
                        <p style={{ margin: '6px 0 0' }}>Requested start: <strong>{dateFmt(r.requested_start_date)}</strong> · Original date: {dateFmt(r.scheduled_start_date)} · Lease ends {dateFmt(r.end_date)}</p>
                        <p style={{ margin: '6px 0 0' }}>Rent {Number(r.prorate_first_month) ? 'is prorated for the first month' : 'is not prorated'} · Due day {r.due_day} · Grace {r.grace_period_days} day(s) · Late fee {Number(r.late_fee) > 0 ? r.late_fee : 'none'}</p>
                      </div>
                    ) : (
                    <div style={{ padding: '10px 12px', background: 'var(--page-line)', borderRadius: '8px', fontSize: '.84rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div>
                        <small className="muted" style={{ display: 'block' }}>From</small>
                        <strong>{r.current_unit_name}</strong> ({r.current_property_name})
                      </div>
                      <span style={{ fontSize: '1.2rem', color: 'var(--accent)', margin: '0 4px' }}>➔</span>
                      <div>
                        <small className="muted" style={{ display: 'block' }}>To</small>
                        <strong style={{ color: 'var(--accent)' }}>{r.requested_unit_name}</strong> ({r.requested_property_name})
                      </div>
                    </div>
                    )}

                    {r.reason && (
                      <div className="request-card__body">
                        <small className="muted" style={{ display: 'block', marginBottom: 2 }}>Reason:</small>
                        "{r.reason}"
                      </div>
                    )}

                    {r.admin_note && (
                      <div style={{ fontSize: '.84rem', color: 'var(--page-muted)', fontStyle: 'italic', background: 'var(--page-raised)', padding: '8px 10px', borderRadius: '6px' }}>
                        Note: {r.admin_note}
                      </div>
                    )}

                    <div className="request-card__foot">
                      {r.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                          <button
                            type="button"
                            className="btn btn--accent btn--sm"
                            style={{ flex: 1 }}
                            onClick={() => decide(r, 'approved')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            style={{ flex: 1 }}
                            onClick={() => setReject(r)}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            style={{ color: '#ef4444' }}
                            onClick={() => deleteRequest(r)}
                            title="Delete request"
                          >
                            🗑️
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          style={{ color: '#ef4444', marginLeft: 'auto' }}
                          onClick={() => deleteRequest(r)}
                        >
                          🗑️ Delete record
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table
                rows={filteredData}
                columns={[
                  { key: 'tenant_name', label: 'Tenant', render: (r) => <strong>{r.tenant_name}</strong> },
                  { key: 'current_unit_name', label: 'Current unit / property', render: (r) => r.request_type === 'early_move' ? `${r.unit_name} · ${r.property_name}` : `${r.current_unit_name} · ${r.current_property_name}` },
                  { key: 'requested_unit_name', label: 'Requested move', render: (r) => r.request_type === 'early_move' ? dateFmt(r.requested_start_date) : `${r.requested_unit_name} · ${r.requested_property_name}` },
                  { key: 'reason', label: 'Reason', render: (r) => r.reason || <span className="muted">—</span> },
                  { key: 'created_at', label: 'Requested', render: (r) => dateFmt(r.created_at) },
                  { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
                ]}
                actions={(r) => (
                  <>
                    {r.status === 'pending' && (
                      <>
                        <button className="btn btn--accent btn--sm" onClick={() => decide(r, 'approved')}>
                          Approve
                        </button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setReject(r)}>
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ color: '#ef4444' }}
                      onClick={() => deleteRequest(r)}
                      title="Delete request"
                    >
                      Delete
                    </button>
                  </>
                )}
              />
            )}
          </>
        )}
      </State>

      {reject && (
        <FormModal
          title={`Reject ${reject.tenant_name}’s request`}
          submitLabel="Reject request"
          fields={[{ name: 'admin_note', label: 'Optional note to tenant', type: 'textarea' }]}
          onSubmit={submitReject}
          onClose={() => setReject(null)}
        />
      )}

      {toast}
    </>
  )
}

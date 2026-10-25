import { PageHead, State, StatusPill, Table, useLoad } from '../../components/ui'
import { dateFmt } from '../../lib/api'

export default function Notifications() {
  const { data, error, loading } = useLoad('/api/admin/notifications')
  return (
    <>
      <PageHead eyebrow="Operations" title="Notifications" sub="Log of every email RentEase sent: reminders, receipts and repair updates." />
      <State loading={loading} error={error} empty={data?.length === 0 && 'No emails sent yet.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'created_at', label: 'When', render: (r) => dateFmt(r.created_at) },
              { key: 'type', label: 'Type', render: (r) => r.type.replace('_', ' ') },
              { key: 'full_name', label: 'To', render: (r) => `${r.full_name || ''} <${r.recipient}>` },
              { key: 'subject', label: 'Subject' },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]} />
        )}
      </State>
    </>
  )
}

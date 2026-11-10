import { useState } from 'react'
import { DEFAULT_LEASE_TEMPLATE, parseLeaseTemplate } from '../lib/leaseContract'

export default function ContractTemplateEditor({ value, onChange, title = 'Rental agreement (optional)' }) {
  const [template, setTemplate] = useState(() => parseLeaseTemplate(value))

  function update(next) {
    setTemplate(next)
    onChange(next)
  }

  function clause(index, patch) {
    update({ ...template, clauses: template.clauses.map((item, i) => i === index ? { ...item, ...patch } : item) })
  }

  function addClause() {
    if (template.clauses.length >= 16) return
    update({ ...template, clauses: [...template.clauses, { id: `custom-${Date.now()}`, title: '', text: '', enabled: true }] })
  }

  function removeClause(index) {
    update({ ...template, clauses: template.clauses.filter((_, i) => i !== index) })
  }

  function updateRule(index, value) {
    update({ ...template, rules: template.rules.map((rule, i) => i === index ? value : rule) })
  }

  return (
    <details className="contract-editor">
      <summary>{title}</summary>
      <p className="muted">Optional. Turn this on to send a paper-style rental agreement for tenant review. It expires on the move-in date if not accepted. Edit the standard sections below; dates, rent, due dates, grace periods, and fees are filled from each lease.</p>
      <label className="field field--checkbox">
        <input type="checkbox" checked={template.enabled} onChange={(event) => update({ ...template, enabled: event.target.checked })} />
        <span className="field__label">Use a tenant-approved contract by default</span>
      </label>
      <div className="contract-editor__settings">
        <strong>Utility responsibility</strong>
        {['electricity', 'water', 'internet'].map((key) => (
          <label className="field" key={key}>
            <span className="field__label">{key[0].toUpperCase() + key.slice(1)} paid by</span>
            <select value={template.utilities?.[key] || 'Tenant'} onChange={(event) =>
              update({ ...template, utilities: { ...template.utilities, [key]: event.target.value } })}>
              <option>Tenant</option><option>Landlord</option><option>Shared</option>
            </select>
          </label>
        ))}
        <strong>Notices and rent timing</strong>
        <div className="contract-editor__settings-grid">
          {[
            ['entry_hours', 'Landlord entry notice (hours)'],
            ['termination_days', 'Termination notice (days)'],
            ['unpaid_months', 'Unpaid months before notice'],
            ['refund_days', 'Deposit refund period (days)'],
          ].map(([key, label]) => (
            <label className="field" key={key}>
              <span className="field__label">{label}</span>
              <input type="number" min="0" step={key === 'late_fee' ? '0.01' : '1'} value={template.notices?.[key] ?? 0}
                onChange={(event) => update({ ...template, notices: { ...template.notices, [key]: event.target.value } })} />
            </label>
          ))}
        </div>
      </div>
      {template.clauses.map((item, index) => (
        <section className="contract-editor__clause" key={item.id || index}>
          <label className="field field--checkbox contract-editor__toggle">
            <input type="checkbox" checked={item.enabled !== false} onChange={(event) => clause(index, { enabled: event.target.checked })} />
            <span className="field__label">{item.title || 'New clause'}</span>
          </label>
          <input aria-label="Clause title" maxLength={100} value={item.title}
            onChange={(event) => clause(index, { title: event.target.value })} placeholder="Clause title" />
          <textarea aria-label={`Wording for ${item.title || 'new clause'}`} rows={3} maxLength={3000} value={item.text}
            onChange={(event) => clause(index, { text: event.target.value })} placeholder="Enter the wording the tenant will see." />
          {index >= DEFAULT_LEASE_TEMPLATE.clauses.length && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeClause(index)}>Remove clause</button>
          )}
        </section>
      ))}
      <div className="contract-editor__rules">
        <strong>House rules</strong>
        {template.rules.map((rule, index) => (
          <div className="contract-editor__rule" key={index}>
            <input maxLength={500} value={rule} onChange={(event) => updateRule(index, event.target.value)} aria-label={`House rule ${index + 1}`} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => update({ ...template, rules: template.rules.filter((_, i) => i !== index) })}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn--ghost btn--sm" disabled={template.rules.length >= 30}
          onClick={() => update({ ...template, rules: [...template.rules, ''] })}>+ Add house rule</button>
      </div>
      <button type="button" className="btn btn--ghost btn--sm" disabled={template.clauses.length >= 16} onClick={addClause}>+ Add custom clause</button>
    </details>
  )
}

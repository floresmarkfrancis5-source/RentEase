import { leaseContractDetails } from '../lib/leaseContract'

export default function LeaseContractPaper({ lease }) {
  const { clauses, rules } = leaseContractDetails(lease)
  return (
    <article className="lease-paper">
      <h2 className="lease-paper__title">Rental Agreement</h2>
      {clauses.map((clause, index) => (
        <section className="lease-paper__section" key={`${clause.title}-${index}`}>
          <h3>{clause.title}</h3>
          <p>{clause.text}</p>
        </section>
      ))}
      <section className="lease-paper__section">
        <h3>HOUSE RULES</h3>
        {rules.length
          ? <ul>{rules.map((rule, index) => <li key={index}>{rule}</li>)}</ul>
          : <div className="lease-paper__rule-lines"><span /><span /><span /></div>}
      </section>
      {lease.tenant_accepted_at && (
        <p className="lease-paper__acceptance">
          Tenant acceptance recorded electronically on {new Date(String(lease.tenant_accepted_at).replace(' ', 'T')).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}.
        </p>
      )}
      <p className="lease-paper__agreement">The Parties confirm that they have read and agree to the terms of this Agreement.</p>
      <div className="lease-paper__signatures">
        <div>Tenant’s Signature <span>Date</span></div>
        <div>Landlord’s Signature <span>Date</span></div>
      </div>
    </article>
  )
}

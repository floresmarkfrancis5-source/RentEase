import React, { useState } from 'react'
import { Modal, StatusPill } from './ui'
import { dateFmt, money } from '../lib/api'
import { PhotoLightbox } from './PhotoLightbox'

export default function UnitDetailModal({
  unit,
  onClose,
  actionLabel,
  onAction,
  actionDisabled = false,
  actionHint = '',
  secondaryLabel,
  onSecondaryAction,
  currentLease,
}) {
  const [showPhoto, setShowPhoto] = useState(false)

  if (!unit) return null

  const rentDiff = currentLease?.monthly_rent
    ? Number(unit.monthly_rent) - Number(currentLease.monthly_rent)
    : null

  const address = [unit.property_address, unit.property_barangay, unit.property_city].filter(Boolean).join(', ')

  return (
    <>
      <Modal title={`Unit Details: ${unit.unit_name}`} onClose={onClose}>
        <div className="stack">
          {/* Unit Image / Photo preview */}
          {unit.image_url ? (
            <div
              className="unit-window-hero"
              onClick={() => setShowPhoto(true)}
              title="Click to view full photo"
            >
              <img src={unit.image_url} alt={unit.unit_name} />
              <span className="unit-window-hero__badge">🔍 Click to zoom</span>
            </div>
          ) : (
            <div className="unit-window-hero" style={{ height: 160, background: 'var(--page-raised)' }}>
              <div style={{ textAlign: 'center', color: 'var(--page-muted)' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 4 }}>🏠</span>
                <span style={{ fontSize: '.86rem' }}>No photo uploaded for this unit</span>
              </div>
            </div>
          )}

          {/* Unit & Property Title */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{unit.unit_name}</h3>
              {unit.occupancy_status && <StatusPill value={unit.lease_status === 'scheduled' ? 'scheduled' : unit.occupancy_status} />}
              {unit.condition_tag && <StatusPill value={unit.condition_tag} />}
            </div>
            <p style={{ margin: 0, color: 'var(--page-muted)', fontSize: '.88rem' }}>
              📍 {unit.property_name}{address ? ` · ${address}` : ''}
            </p>
          </div>

          {/* Key Metrics */}
          <div className="unit-window-metrics">
            <div className="unit-window-metric-card">
              <small>Monthly Rent</small>
              <strong style={{ color: 'var(--accent)' }}>{money(unit.monthly_rent)}</strong>
              <span style={{ fontSize: '.76rem', color: 'var(--page-muted)', display: 'block' }}>per month</span>
            </div>
            <div className="unit-window-metric-card">
              <small>Max Capacity</small>
              <strong>{unit.capacity || 1} {Number(unit.capacity) > 1 ? 'persons' : 'person'}</strong>
              <span style={{ fontSize: '.76rem', color: 'var(--page-muted)', display: 'block' }}>occupants</span>
            </div>
            <div className="unit-window-metric-card">
              <small>Condition</small>
              <strong style={{ fontSize: '1rem', textTransform: 'capitalize' }}>
                {(unit.condition_tag || 'Good').replace('_', ' ')}
              </strong>
              <span style={{ fontSize: '.76rem', color: '#16a34a', display: 'block' }}>✓ Verified</span>
            </div>
          </div>

          {Number(unit.open_repair_count) > 0 && (
            <p className="alert alert--warn" role="status" style={{ margin: 0 }}>
              {unit.open_repair_count} open repair request{Number(unit.open_repair_count) === 1 ? '' : 's'} for this unit.
            </p>
          )}

          {/* Comparison with current lease if tenant */}
          {currentLease && (
            <div style={{ padding: '12px 14px', background: 'var(--page-raised)', borderRadius: '10px', border: '1px solid var(--page-line)' }}>
              <strong style={{ fontSize: '.86rem', display: 'block', marginBottom: '4px' }}>
                Comparison with your current unit:
              </strong>
              <div style={{ fontSize: '.84rem', color: 'var(--page-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span>Current: <strong>{currentLease.unit_name}</strong> ({money(currentLease.monthly_rent)}/mo)</span>
                <span>
                  Rent difference:{' '}
                  {rentDiff === 0 ? (
                    <strong style={{ color: 'var(--page-text)' }}>Same rate</strong>
                  ) : rentDiff > 0 ? (
                    <strong style={{ color: '#eab308' }}>+{money(rentDiff)}/mo</strong>
                  ) : (
                    <strong style={{ color: '#16a34a' }}>-{money(Math.abs(rentDiff))}/mo (Save)</strong>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Occupied tenant info if landlord view */}
          {unit.tenant_name && (
            <div style={{ padding: '12px 14px', background: 'var(--page-raised)', borderRadius: '10px', border: '1px solid var(--page-line)' }}>
              <small style={{ color: 'var(--page-muted)', textTransform: 'uppercase', fontSize: '.72rem', letterSpacing: '.5px' }}>
                {unit.lease_status === 'scheduled' ? 'Scheduled Tenant' : 'Current Tenant'}
              </small>
              <div style={{ fontSize: '.95rem', fontWeight: 600, marginTop: '2px' }}>
                {unit.lease_status === 'scheduled'
                  ? `Move-in ${dateFmt(unit.start_date)} · ${unit.tenant_name}`
                  : `👤 ${unit.tenant_name}`}
              </div>
            </div>
          )}

          {/* Description & Amenities */}
          <div>
            <strong style={{ display: 'block', fontSize: '.88rem', marginBottom: '6px' }}>Description & Amenities</strong>
            {unit.notes ? (
              <p style={{ margin: 0, fontSize: '.88rem', color: 'var(--page-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: 'var(--page-raised)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--page-line)' }}>
                {unit.notes}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '.86rem', color: 'var(--page-muted)', fontStyle: 'italic' }}>
                No additional description provided for this unit.
              </p>
            )}
          </div>

          {actionHint && (
            <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--page-muted)' }}>
              {actionHint}
            </p>
          )}

          {/* Modal Footer Actions */}
          <div className="modal__foot" style={{ marginTop: '8px' }}>
            {secondaryLabel && onSecondaryAction && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ color: '#ef4444', marginRight: 'auto' }}
                onClick={() => {
                  onClose()
                  onSecondaryAction(unit)
                }}
              >
                {secondaryLabel}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
            {actionLabel && onAction && (
              <button
                type="button"
                className="btn btn--accent"
                disabled={actionDisabled}
                onClick={() => {
                  onClose()
                  onAction(unit)
                }}
              >
                {actionLabel}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {showPhoto && unit.image_url && (
        <PhotoLightbox
          image={{ id: unit.id, image_url: unit.image_url, file_name: `${unit.unit_name} - ${unit.property_name}` }}
          onClose={() => setShowPhoto(false)}
        />
      )}
    </>
  )
}

import { useState } from 'react';

export default function ConfirmModal({
    title, description, confirmLabel = 'Confirm',
    confirmVariant = 'primary',   // 'primary' | 'danger'
    requireReason = false,
    reasons = [],
    onConfirm, onCancel,
    isOpen
}) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (requireReason && !reason) return;
        setLoading(true);
        try {
            await onConfirm(reason);
        } catch (err) {
            // Keep modal stable if caller request fails (e.g., 403/500).
            console.error('Confirm action failed', err);
        }
        finally { setLoading(false); }
    };

    const dangerColor = 'var(--danger)';
    const primaryColor = 'var(--accent)';
    const confirmColor = confirmVariant === 'danger' ? dangerColor : primaryColor;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div className="panel" style={{
                width: 420, padding: 0, overflow: 'hidden',
                border: `1px solid ${confirmColor}40`,
                boxShadow: `0 0 40px ${confirmColor}20`,
            }}>
                <div className="panel-header" style={{ borderColor: `${confirmColor}30` }}>
                    <span style={{
                        fontFamily: 'var(--font-display)', fontSize: 14,
                        fontWeight: 600, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: confirmColor,
                    }}>
                        {title}
                    </span>
                </div>
                <div style={{ padding: '16px 20px 20px' }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                        {description}
                    </p>
                    {requireReason && (
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }}>
                                Reason — required
                            </label>
                            <select
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                style={{
                                    width: '100%', backgroundColor: 'var(--bg-surface)',
                                    border: '1px solid var(--border-mid)',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'var(--font-mono)', fontSize: 12,
                                    padding: '8px 10px', borderRadius: 'var(--radius)',
                                    outline: 'none',
                                }}
                            >
                                <option value="">Select reason...</option>
                                {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                            onClick={onCancel}
                            style={{
                                padding: '8px 16px', fontFamily: 'var(--font-mono)',
                                fontSize: 11, letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                border: '1px solid var(--border-mid)',
                                backgroundColor: 'transparent', color: 'var(--text-secondary)',
                                cursor: 'pointer', borderRadius: 'var(--radius)',
                            }}
                        >Cancel</button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading || (requireReason && !reason)}
                            style={{
                                padding: '8px 16px', fontFamily: 'var(--font-mono)',
                                fontSize: 11, letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                border: `1px solid ${confirmColor}`,
                                backgroundColor: `${confirmColor}22`,
                                color: confirmColor,
                                cursor: loading || (requireReason && !reason) ? 'not-allowed' : 'pointer',
                                borderRadius: 'var(--radius)',
                                opacity: loading || (requireReason && !reason) ? 0.5 : 1,
                            }}
                        >
                            {loading ? 'Sending…' : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState } from 'react';
import { toast } from 'sonner';

export default function CommandButton({
    label, onExecute,
    variant = 'ghost',   // 'ghost' | 'primary' | 'danger'
    disabled = false,
    successMessage = null,
    style = {}
}) {
    const [state, setState] = useState('idle');  // 'idle' | 'loading' | 'success' | 'error'

    const colorMap = {
        ghost: { border: 'var(--border-mid)', color: 'var(--text-secondary)', bg: 'transparent' },
        primary: { border: 'var(--accent)', color: 'var(--accent)', bg: 'var(--accent-glow)' },
        danger: { border: 'var(--danger)', color: 'var(--danger)', bg: 'var(--danger-glow)' },
    };
    const stateColor = state === 'success' ? 'var(--ok)' : state === 'error' ? 'var(--danger)' : colorMap[variant].color;
    const stateBorder = state === 'success' ? 'var(--ok)' : state === 'error' ? 'var(--danger)' : colorMap[variant].border;

    const handle = async () => {
        if (state === 'loading' || disabled) return;
        setState('loading');
        try {
            const result = await onExecute();
            setState('success');
            if (successMessage) toast.success(successMessage);
            setTimeout(() => setState('idle'), 2000);
            return result;
        } catch (e) {
            const msg = e?.response?.data?.detail
              ?? e?.response?.data?.message
              ?? e?.message
              ?? 'Command failed';
            setState('error');
            toast.error(msg, {
              description: e?.response?.status ? `HTTP ${e.response.status}` : undefined,
            });
            setTimeout(() => setState('idle'), 3000);
        }
    };

    return (
        <div>
            <button
                onClick={handle}
                disabled={disabled || state === 'loading'}
                style={{
                    padding: '7px 14px',
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    border: `1px solid ${stateBorder}`,
                    background: colorMap[variant].bg,
                    color: stateColor,
                    cursor: disabled || state === 'loading' ? 'not-allowed' : 'pointer',
                    borderRadius: 'var(--radius)',
                    transition: 'all 0.2s',
                    opacity: disabled ? 0.45 : 1,
                    ...style,
                }}
            >
                {state === 'loading' ? '...' : state === 'success' ? 'DONE ✓' : state === 'error' ? 'FAILED ✗' : label}
            </button>
        </div>
    );
}

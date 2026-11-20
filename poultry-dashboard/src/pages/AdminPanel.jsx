import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../lib/Api';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { sentence } from '../lib/format';

// ── Constants ──────────────────────────────────────────────────────────────

const ROLES = ['operator', 'supervisor', 'admin'];

const ROLE_COLORS = {
  operator:   { color: 'var(--info)',   bg: 'var(--info-glow)',   border: 'rgba(32,160,232,0.3)'  },
  supervisor: { color: 'var(--warn)',   bg: 'var(--warn-glow)',   border: 'rgba(192,112,16,0.3)'  },
  admin:      { color: 'var(--danger)', bg: 'var(--danger-glow)', border: 'rgba(232,58,32,0.3)'   },
};

// ── Zod schemas ────────────────────────────────────────────────────────────

const inviteUserSchema = z.object({
  email: z.string()
    .email('Valid email required'),
  role: z.enum(['operator', 'supervisor', 'admin'], {
    errorMap: () => ({ message: 'Select a role' }),
  }),
});

const resetPasswordSchema = z.object({
  new_password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

// ── Shared field component ─────────────────────────────────────────────────

function Field({ label, error, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: error ? 'var(--danger)' : 'var(--text-dim)',
        marginBottom: 6,
      }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
        {error && (
          <span style={{ fontWeight: 400, marginLeft: 6 }}>— {error}</span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputStyle = (hasError) => ({
  width: '100%',
  backgroundColor: 'var(--bg-surface)',
  border: `1px solid ${hasError ? 'var(--danger)' : 'var(--border-mid)'}`,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 'var(--radius)',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
});

const selectStyle = (hasError) => ({
  ...inputStyle(hasError),
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238aaabf' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
});

// ── Role badge ─────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const cfg = ROLE_COLORS[role] ?? ROLE_COLORS.operator;
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: cfg.color,
      backgroundColor: cfg.bg,
      border: `1px solid ${cfg.border}`,
      padding: '3px 8px',
      borderRadius: 'var(--radius)',
      whiteSpace: 'nowrap',
    }}>
      {role}
    </span>
  );
}

// ── Password strength indicator ────────────────────────────────────────────

function PasswordStrength({ password }) {
  if (!password) return null;

  const checks = [
    { label: '8+ chars',   pass: password.length >= 8 },
    { label: 'Uppercase',  pass: /[A-Z]/.test(password) },
    { label: 'Number',     pass: /[0-9]/.test(password) },
    { label: 'Symbol',     pass: /[^a-zA-Z0-9]/.test(password) },
  ];

  const score = checks.filter(c => c.pass).length;
  const strengthColor = score <= 1 ? 'var(--danger)'
    : score === 2 ? 'var(--warn)'
    : score === 3 ? 'var(--info)'
    : 'var(--ok)';

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3,
            borderRadius: 2,
            backgroundColor: i <= score ? strengthColor : 'var(--bg-surface)',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {checks.map(c => (
          <span key={c.label} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: c.pass ? 'var(--ok)' : 'var(--text-dim)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span>{c.pass ? '✓' : '○'}</span>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Invite user form ───────────────────────────────────────────────────────

function InviteUserForm({ onSuccess }) {
  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(inviteUserSchema) });

  const onSubmit = async (data) => {
    try {
      await api.inviteUser(data);
      toast.success(`Invitation sent to ${data.email}`);
      reset();
      onSuccess();
    } catch (e) {
      const msg = e?.response?.data?.detail ?? 'Failed to send invitation';
      toast.error(msg);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Field label="Email Address" error={errors.email?.message} required>
        <input
          {...register('email')}
          type="email"
          placeholder="e.g. employee@company.com"
          style={inputStyle(!!errors.email)}
        />
      </Field>

      <Field label="Role" error={errors.role?.message} required>
        <select {...register('role')} style={selectStyle(!!errors.role)}>
          <option value="">Select a role...</option>
          <option value="operator">Operator — device control, alert ACK</option>
          <option value="supervisor">Supervisor — registration, work orders, thresholds</option>
          <option value="admin">Admin — full system access, user management</option>
        </select>
      </Field>

      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          width: '100%',
          marginTop: 8,
          padding: '10px 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          border: '1px solid var(--danger)',
          backgroundColor: 'var(--danger-glow)',
          color: 'var(--danger)',
          cursor: isSubmitting ? 'not-allowed' : 'pointer',
          borderRadius: 'var(--radius)',
          opacity: isSubmitting ? 0.6 : 1,
          transition: 'all 0.15s',
        }}
      >
        {isSubmitting ? 'Sending invitation…' : 'Send invitation'}
      </button>
    </form>
  );
}

// ── Reset password modal ───────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose, onSuccess }) {
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async (data) => {
    try {
      await api.resetUserPassword(user.id ?? user._id, {
        new_password: data.new_password,
      });
      toast.success(`Password reset for ${user.username}`);
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail ?? 'Password reset failed');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 420, padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="panel-header">
          <span className="panel-title">
            <span style={{ color: 'var(--warn)' }}>◈</span> Reset password
          </span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            color: 'var(--text-dim)', cursor: 'pointer',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '16px 20px 20px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)', marginBottom: 16,
          }}>
            Resetting password for{' '}
            <span style={{ color: 'var(--text-primary)' }}>{user.username}</span>
            {' '}({user.email})
          </div>

          <Field label="New Password" error={errors.new_password?.message} required>
            <input
              {...register('new_password')}
              type="password"
              autoComplete="new-password"
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              style={inputStyle(!!errors.new_password)}
            />
          </Field>

          <Field label="Confirm New Password" error={errors.confirm_password?.message} required>
            <input
              {...register('confirm_password')}
              type="password"
              autoComplete="new-password"
              placeholder="Repeat new password"
              style={inputStyle(!!errors.confirm_password)}
            />
          </Field>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 16px',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              border: '1px solid var(--border-mid)',
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer', borderRadius: 'var(--radius)',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} style={{
              padding: '8px 16px',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              border: '1px solid var(--warn)',
              backgroundColor: 'var(--warn-glow)', color: 'var(--warn)',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              borderRadius: 'var(--radius)',
              opacity: isSubmitting ? 0.6 : 1,
            }}>
              {isSubmitting ? 'Resetting…' : 'Reset password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── User row ───────────────────────────────────────────────────────────────

function UserRow({ user, currentUserId, onRoleChange, onToggleActive, onResetPassword, index }) {
  const [roleChanging, setRoleChanging] = useState(false);
  const isCurrentUser = (user.id ?? user._id) === currentUserId;
  const isActive = user.is_active !== false;  // default true if field absent
  const userId = user.id ?? user._id;

  const handleRoleChange = async (newRole) => {
    if (newRole === user.role) return;
    setRoleChanging(true);
    try {
      await api.updateUser(userId, { role: newRole });
      toast.success(`${user.username} is now ${newRole}`);
      onRoleChange(userId, newRole);
    } catch (e) {
      toast.error(e?.response?.data?.detail ?? 'Role update failed');
    } finally {
      setRoleChanging(false);
    }
  };

  return (
    <tr className="fade-in" style={{
      animationDelay: `${index * 0.04}s`,
      opacity: isActive ? 1 : 0.5,
    }}>
      {/* Sequence */}
      <td style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--text-dim)', width: 40,
      }}>
        {String(index + 1).padStart(2, '0')}
      </td>

      {/* User identity */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Avatar initials */}
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            backgroundColor: ROLE_COLORS[user.role]?.bg ?? 'var(--bg-surface)',
            border: `1px solid ${ROLE_COLORS[user.role]?.border ?? 'var(--border-dim)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: ROLE_COLORS[user.role]?.color ?? 'var(--text-secondary)',
            flexShrink: 0,
          }}>
            {(user.full_name ?? user.username ?? '?')
              .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {user.username}
              {isCurrentUser && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: 'var(--ok)', letterSpacing: '0.08em',
                }}>You</span>
              )}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-dim)',
            }}>
              {user.full_name}
            </div>
          </div>
        </div>
      </td>

      {/* Email */}
      <td style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--text-secondary)',
      }}>
        {user.email}
      </td>

      {/* Role — inline dropdown */}
      <td>
        {isCurrentUser ? (
          <RoleBadge role={user.role} />
        ) : (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <select
              value={user.role}
              disabled={roleChanging}
              onChange={e => handleRoleChange(e.target.value)}
              style={{
                ...selectStyle(false),
                width: 'auto',
                paddingRight: 28,
                fontSize: 11,
                padding: '4px 28px 4px 8px',
                color: ROLE_COLORS[user.role]?.color ?? 'var(--text-primary)',
                backgroundColor: ROLE_COLORS[user.role]?.bg ?? 'var(--bg-surface)',
                border: `1px solid ${ROLE_COLORS[user.role]?.border ?? 'var(--border-mid)'}`,
                opacity: roleChanging ? 0.5 : 1,
              }}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}
      </td>

      {/* Status */}
      <td>
        <span className={`status-badge ${isActive ? 'ok' : 'danger'}`}>
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </td>

      {/* Last login */}
      <td style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--text-dim)',
      }}>
        {user.last_login
          ? new Date(user.last_login).toLocaleDateString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
            })
          : 'Never'}
      </td>

      {/* Actions */}
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Reset password */}
          <button
            onClick={() => onResetPassword(user)}
            title="Reset password"
            style={{
              padding: '4px 8px',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              border: '1px solid var(--border-mid)',
              backgroundColor: 'transparent',
              color: 'var(--text-dim)',
              cursor: 'pointer', borderRadius: 'var(--radius)',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--warn)';
              e.currentTarget.style.color = 'var(--warn)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-mid)';
              e.currentTarget.style.color = 'var(--text-dim)';
            }}
          >
            Reset pwd
          </button>

          {/* Deactivate / Reactivate — cannot act on self */}
          {!isCurrentUser && (
            <button
              onClick={() => onToggleActive(user)}
              title={isActive ? 'Deactivate account' : 'Reactivate account'}
              style={{
                padding: '4px 8px',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                border: `1px solid ${isActive ? 'rgba(232,58,32,0.4)' : 'rgba(31,189,110,0.4)'}`,
                backgroundColor: isActive ? 'var(--danger-glow)' : 'var(--ok-glow)',
                color: isActive ? 'var(--danger)' : 'var(--ok)',
                cursor: 'pointer', borderRadius: 'var(--radius)',
                transition: 'all 0.12s',
              }}
            >
              {isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main AdminPanel page ───────────────────────────────────────────────────

export default function AdminPanel() {
  const { user: currentUser } = useAuth();
  const [users,          setUsers]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [roleFilter,     setRoleFilter]     = useState('all');
  const [statusFilter,   setStatusFilter]   = useState('active');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmModal,   setConfirmModal]   = useState(null);
  const [resetTarget,    setResetTarget]    = useState(null);

  const currentUserId = currentUser?.id ?? currentUser?._id;

  // ── Fetch users ────────────────────────────────────────────────────────
  const fetchUsers = useCallback(() => {
    setLoading(true);
    api.getUsers()
      .then(setUsers)
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

   
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Role change ────────────────────────────────────────────────────────
  const handleRoleChange = useCallback((userId, newRole) => {
    setUsers(prev => prev.map(u =>
      (u.id ?? u._id) === userId ? { ...u, role: newRole } : u
    ));
  }, []);

  // ── Toggle active ──────────────────────────────────────────────────────
  const handleToggleActive = useCallback((user) => {
    const userId   = user.id ?? user._id;
    const isActive = user.is_active !== false;
    const action   = isActive ? 'deactivate' : 'reactivate';

    setConfirmModal({
      title: `${sentence(action)} account`,
      description: `This will ${action} the account for ${user.username} (${user.email}). ${
        isActive
          ? 'They will immediately lose access to the system.'
          : 'They will regain full access based on their role.'
      }`,
      confirmLabel: sentence(action),
      confirmVariant: isActive ? 'danger' : 'primary',
      onConfirm: async () => {
        try {
          if (isActive) {
            await api.deactivateUser(userId);
          } else {
            await api.updateUser(userId, { is_active: true });
          }
          toast.success(`Account ${action}d: ${user.username}`);
          setUsers(prev => prev.map(u =>
            (u.id ?? u._id) === userId ? { ...u, is_active: !isActive } : u
          ));
          setConfirmModal(null);
        } catch (e) {
          toast.error(e?.response?.data?.detail ?? `Failed to ${action} account`);
        }
      },
      onCancel: () => setConfirmModal(null),
    });
  }, []);

  // ── Filtered users ─────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const matchSearch = !search
      || u.username?.toLowerCase().includes(search.toLowerCase())
      || u.email?.toLowerCase().includes(search.toLowerCase())
      || u.full_name?.toLowerCase().includes(search.toLowerCase());

    const matchRole = roleFilter === 'all' || u.role === roleFilter;

    const isActive = u.is_active !== false;
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'active'   &&  isActive)
      || (statusFilter === 'inactive' && !isActive);

    return matchSearch && matchRole && matchStatus;
  });

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = {
    total:      users.length,
    active:     users.filter(u => u.is_active !== false).length,
    operators:  users.filter(u => u.role === 'operator').length,
    supervisors:users.filter(u => u.role === 'supervisor').length,
    admins:     users.filter(u => u.role === 'admin').length,
  };

  return (
    <div className="page">

      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-title">Admin Panel</div>
          <div className="page-subtitle">
            {stats.total} accounts registered
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(f => !f)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            border: `1px solid ${showCreateForm ? 'var(--border-mid)' : 'var(--danger)'}`,
            backgroundColor: showCreateForm ? 'transparent' : 'var(--danger-glow)',
            color: showCreateForm ? 'var(--text-secondary)' : 'var(--danger)',
            cursor: 'pointer', borderRadius: 'var(--radius)',
            transition: 'all 0.15s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            {showCreateForm
              ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
              : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
            }
          </svg>
          {showCreateForm ? 'Cancel' : 'Invite user'}
        </button>
      </div>

      {/* Invite user form — collapsible */}
      {showCreateForm && (
        <div className="panel fade-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="panel-header">
            <span className="panel-title">
              <span style={{ color: 'var(--danger)' }}>◈</span> Invite user
            </span>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            <InviteUserForm onSuccess={() => {
              setShowCreateForm(false);
              fetchUsers();
            }} />
          </div>
        </div>
      )}

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {[
          { label: 'Total',       value: stats.total,       color: 'var(--text-secondary)', filter: null },
          { label: 'Active',      value: stats.active,      color: 'var(--ok)',             filter: null },
          { label: 'Operators',   value: stats.operators,   color: 'var(--info)',            filter: 'operator' },
          { label: 'Supervisors', value: stats.supervisors, color: 'var(--warn)',            filter: 'supervisor' },
          { label: 'Admins',      value: stats.admins,      color: 'var(--danger)',          filter: 'admin' },
        ].map((s, i) => (
          <button
            key={s.label}
            onClick={() => s.filter && setRoleFilter(f => f === s.filter ? 'all' : s.filter)}
            className="panel fade-in"
            style={{
              animationDelay: `${i * 0.06}s`,
              padding: '12px 14px',
              textAlign: 'left', cursor: s.filter ? 'pointer' : 'default',
              borderColor: roleFilter === s.filter ? s.color : 'var(--border-dim)',
              backgroundColor: roleFilter === s.filter ? `${s.color}11` : 'var(--bg-panel)',
              transition: 'all 0.15s',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 6,
            }}>
              {s.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 26,
              color: s.color, lineHeight: 1,
            }}>
              {String(s.value).padStart(2, '0')}
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search username, email, name..."
            style={{
              ...inputStyle(false),
              paddingLeft: 30,
              fontFamily: 'var(--font-mono)',
              fontSize: 11, letterSpacing: '0.05em',
            }}
          />
          <svg style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-dim)',
          }} width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'active', 'inactive'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 10px',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                border: '1px solid',
                borderColor: statusFilter === s ? 'var(--accent)' : 'var(--border-dim)',
                background: statusFilter === s ? 'var(--accent-glow)' : 'transparent',
                color: statusFilter === s ? 'var(--accent)' : 'var(--text-dim)',
                cursor: 'pointer', borderRadius: 'var(--radius)',
                transition: 'all 0.12s',
              }}
            >
              {sentence(s)}
            </button>
          ))}
        </div>

        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-dim)', marginLeft: 'auto',
        }}>
          {filtered.length} / {users.length} shown
        </span>
      </div>

      {/* User table */}
      <div className="panel fade-in" style={{ animationDelay: '0.2s', overflow: 'hidden', flex: 1 }}>
        <div className="panel-header">
          <span className="panel-title">
            <span className="panel-title-accent">◈</span> User registry
          </span>
          <button
            onClick={fetchUsers}
            style={{
              padding: '4px 10px',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              border: '1px solid var(--border-mid)',
              background: 'transparent', color: 'var(--text-dim)',
              cursor: 'pointer', borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Refresh
          </button>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 480px)' }}>
          {loading ? (
            <table className="data-table">
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {[40, 180, 160, 100, 80, 90, 160].map((w, j) => (
                      <td key={j} style={{ padding: '12px 16px' }}>
                        <Skeleton height={12} width={w} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="search"
              title={search || roleFilter !== 'all' || statusFilter !== 'all'
                ? 'No users match filters'
                : 'No users registered'}
              subtitle={search || roleFilter !== 'all' || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create the first account using the button above'}
              action={search || roleFilter !== 'all' || statusFilter !== 'all'
                ? { label: 'Clear filters', onClick: () => { setSearch(''); setRoleFilter('all'); setStatusFilter('active'); } }
                : { label: 'Create account', onClick: () => setShowCreateForm(true) }}
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, i) => (
                  <UserRow
                    key={user.id ?? user._id ?? i}
                    user={user}
                    currentUserId={currentUserId}
                    onRoleChange={handleRoleChange}
                    onToggleActive={handleToggleActive}
                    onResetPassword={setResetTarget}
                    index={i}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirm modal for deactivate/reactivate */}
      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          title={confirmModal.title}
          description={confirmModal.description}
          confirmLabel={confirmModal.confirmLabel}
          confirmVariant={confirmModal.confirmVariant}
          onConfirm={confirmModal.onConfirm}
          onCancel={confirmModal.onCancel}
        />
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={fetchUsers}
        />
      )}
    </div>
  );
}

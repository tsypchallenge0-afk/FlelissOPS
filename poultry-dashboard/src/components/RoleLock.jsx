import { useRole } from '../context/AuthContext';

const ROLE_RANK = { operator: 1, supervisor: 2, admin: 3 };

export default function RoleLock({ requires = 'supervisor', children, tooltip }) {
    const role = useRole();
    const hasAccess = ROLE_RANK[role] >= ROLE_RANK[requires];

    if (hasAccess) return children;

    return (
        <div
            title={tooltip ?? `Requires ${requires} access`}
            style={{ opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' }}
        >
            {children}
        </div>
    );
}

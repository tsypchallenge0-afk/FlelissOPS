import React from 'react';

export default function StatusBadge({ label, status = 'info' }) {
    // status can be 'ok', 'warn', 'danger', 'info'
    return (
        <div className={`status-badge ${status}`}>
            <div className="dot" />
            <span>{label}</span>
        </div>
    );
}

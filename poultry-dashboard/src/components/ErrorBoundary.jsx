import React, { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[Robo Fleliss ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="panel" style={{
        padding: 20,
        borderColor: 'var(--danger)',
        background: 'var(--danger-glow)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 12,
          fontWeight: 600, letterSpacing: '0.1em',
          color: 'var(--danger)', marginBottom: 8,
          textTransform: 'uppercase',
        }}>
          <h1 style={{ color: 'var(--danger)', fontSize: 24, marginBottom: 16 }}>Robo-Fleliss system failure</h1>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--text-secondary)', marginBottom: 12,
        }}>
          {this.state.error?.message ?? 'An unexpected error occurred'}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            padding: '6px 12px',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            border: '1px solid var(--danger)',
            background: 'transparent', color: 'var(--danger)',
            cursor: 'pointer', borderRadius: 'var(--radius)',
          }}
        >
          Retry
        </button>
      </div>
    );
  }
}

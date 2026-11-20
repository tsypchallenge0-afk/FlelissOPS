import { Outlet, Link } from 'react-router-dom';
import './PublicLayout.css';

export default function PublicLayout() {
    return (
        <div className="public-root">
            <nav className="public-nav">
                <div className="nav-brand">
                    <div className="logo-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="var(--accent-primary)" />
                            <path d="M12 6v6l4 2" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="nav-title condensed">Robo Fleliss</span>
                </div>
                <div className="nav-links">
                    <Link to="/" className="nav-link mono">Home</Link>
                    <Link to="/login" className="nav-btn condensed">Login</Link>
                    <Link to="/register" className="nav-btn primary condensed">Register</Link>
                </div>
            </nav>
            <main className="public-main">
                <Outlet />
            </main>
        </div>
    );
}

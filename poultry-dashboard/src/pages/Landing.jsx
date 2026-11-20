import { Link } from 'react-router-dom';
import './Landing.css';

export default function Landing() {
    return (
        <div className="landing-page page-enter">
            {/* Hero Section */}
            <div className="hero-section">
                <div className="hero-content stagger">
                    <div className="section-label" style={{ color: 'var(--accent-primary)', marginBottom: '16px' }}>
                        Next-generation poultry intelligence
                    </div>
                    <h1 className="hero-title condensed">
                        Robo Fleliss
                    </h1>
                    <p className="hero-subtitle">
                        The world's most advanced autonomous poultry management system. 
                        Harnessing the power of Deep Learning and IoT to protect your 
                        biological assets and maximize production efficiency.
                    </p>
                    <div className="hero-actions">
                        <Link to="/register" className="hero-btn primary condensed" style={{ fontSize: '18px', padding: '14px 28px' }}>
                            Initialize system
                        </Link>
                        <Link to="/login" className="hero-btn condensed" style={{ fontSize: '18px', padding: '14px 28px' }}>
                            Operator login
                        </Link>
                    </div>
                </div>

                <div className="hero-visual stagger">
                    <div className="blueprint-panel panel">
                        <div className="blueprint-header">
                            <span className="status-dot ok" />
                            <span className="mono">Network-status: optimal</span>
                        </div>
                        <div className="blueprint-grid">
                            <div className="bp-card">
                                <span className="bp-icon">🌡</span>
                                <span className="mono bp-val">32.4°C</span>
                                <span className="section-label">Thermal</span>
                            </div>
                            <div className="bp-card">
                                <span className="bp-icon">💧</span>
                                <span className="mono bp-val">68%</span>
                                <span className="section-label">Humidity</span>
                            </div>
                            <div className="bp-card">
                                <span className="bp-icon">✦</span>
                                <span className="mono bp-val">Active</span>
                                <span className="section-label">AI control</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mission Section */}
            <div className="mission-section stagger">
                <div className="section-label" style={{ textAlign: 'center', marginBottom: '24px' }}>Our mission</div>
                <h2 className="mission-title condensed">
                    Autonomous biosecurity. <br />
                    Uncompromised yield.
                </h2>
                <p className="mission-text">
                    Robo Fleliss is designed to remove human error from the most critical 
                    aspects of poultry farming. By integrating real-time telemetry with 
                    predictive AI models and closed-loop control, we create a 
                    self-optimizing environment where your flock can thrive.
                </p>
            </div>

            {/* Features Section */}
            <div className="features-section">
                <div className="section-label" style={{ textAlign: 'center', marginBottom: '48px' }}>System capabilities</div>
                <div className="feature-grid stagger">
                    <div className="feature-card panel corner-accent">
                        <div className="feature-icon">📊</div>
                        <h3 className="condensed">Industrial telemetry</h3>
                        <p>Sub-second latency monitoring of temperature, humidity, and ammonia levels using high-precision industrial sensor arrays.</p>
                    </div>
                    <div className="feature-card panel corner-accent">
                        <div className="feature-icon">🧠</div>
                        <h3 className="condensed">AI diagnostics</h3>
                        <p>Predictive hazard modeling using Prophet and Scikit-learn to identify environmental risks before they become critical.</p>
                    </div>
                    <div className="feature-card panel corner-accent">
                        <div className="feature-icon">🗺️</div>
                        <h3 className="condensed">Spatial view</h3>
                        <p>Every sensor placed where it is installed, with an interpolated heat-map of the house floor, giving a live picture of conditions across the house.</p>
                    </div>
                    <div className="feature-card panel corner-accent">
                        <div className="feature-icon">⚡</div>
                        <h3 className="condensed">Autonomous control</h3>
                        <p>Intelligent actuator management for fans, heaters, and feeders, ensuring the perfect climate 24/7 without manual intervention.</p>
                    </div>
                </div>
            </div>

            {/* CTA Section */}
            <div className="cta-section panel stagger">
                <h2 className="cta-title condensed">READY TO DEPLOY?</h2>
                <p className="cta-text">Join the future of poultry farming. Secure your assets today.</p>
                <div className="hero-actions" style={{ justifyContent: 'center', marginTop: '32px' }}>
                    <Link to="/register" className="hero-btn primary condensed" style={{ minWidth: '200px' }}>
                        Start registration
                    </Link>
                    <Link to="/login" className="hero-btn condensed" style={{ minWidth: '200px' }}>
                        Operator access
                    </Link>
                </div>
            </div>

            {/* Footer */}
            <footer className="landing-footer mono">
                ROBO FLELISS v2.4.0-STABLE · &copy; 2026 ADVANCED AGENTIC CODING
            </footer>
        </div>
    );
}

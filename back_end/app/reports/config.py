import os

# ── SMTP config — set via environment variables ────────────────────────────
SMTP_HOST     = os.getenv('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT     = int(os.getenv('SMTP_PORT', 587))
SMTP_USERNAME = os.getenv('SMTP_USERNAME', '')      # your Gmail address
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')      # app password (not account password)
SMTP_FROM     = os.getenv('SMTP_FROM', SMTP_USERNAME)
SMTP_USE_TLS  = os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'

# Report branding
REPORT_BRAND_NAME = 'FlelissOPS Control System'
REPORT_LOGO_PATH  = 'assets/logo.png'   # optional — skip if not available

# Colors (RGB tuples for ReportLab)
COLOR_PRIMARY   = (0.12, 0.15, 0.21)   # dark navy
COLOR_ACCENT    = (0.75, 0.44, 0.08)   # amber
COLOR_OK        = (0.06, 0.56, 0.32)   # green
COLOR_WARN      = (0.75, 0.44, 0.08)   # amber
COLOR_DANGER    = (0.75, 0.16, 0.08)   # red
COLOR_LIGHT     = (0.95, 0.95, 0.95)   # light gray for alternating rows

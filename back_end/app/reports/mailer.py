import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from bson.objectid import ObjectId
from app.database import db

import aiosmtplib

from .config import (
    SMTP_HOST, SMTP_PORT, SMTP_USERNAME,
    SMTP_PASSWORD, SMTP_FROM, SMTP_USE_TLS,
    REPORT_BRAND_NAME,
)

logger = logging.getLogger(__name__)


async def send_report_email(
    recipients: list[str],
    subject:    str,
    body_html:  str,
    pdf_bytes:  bytes  = None,
    filename:   str    = None,
    attachment: bool   = True,
) -> bool:
    """
    Sends an email via SMTP.
    Returns True on success.
    """
    msg = MIMEMultipart('mixed')
    msg['From']    = SMTP_FROM
    msg['To']      = ', '.join(recipients)
    msg['Subject'] = subject

    # HTML body
    body = MIMEText(body_html, 'html')
    msg.attach(body)

    # PDF attachment
    if attachment and pdf_bytes and filename:
        pdf_part = MIMEApplication(pdf_bytes, _subtype='pdf')
        pdf_part.add_header('Content-Disposition', 'attachment', filename=filename)
        msg.attach(pdf_part)

    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USERNAME,
            password=SMTP_PASSWORD,
            start_tls=SMTP_USE_TLS,
        )
        logger.info(f'Report emailed to {recipients}')
        return True
    except Exception as e:
        logger.error(f'Email send failed: {e}')
        return False


def build_report_email_html(
    farm_name:    str,
    report_type:  str,
    period_start: str,
    period_end:   str,
    summary:      dict,
) -> str:
    risk       = summary.get('risk_level', 'NORMAL')
    risk_color = '#c02810' if risk in ('HIGH', 'CRITICAL') \
                 else '#c07010' if risk == 'MEDIUM' \
                 else '#0e8f52'

    return f"""
    <html><body style="font-family: Arial, sans-serif; color: #1a2535; max-width: 600px; margin: 0 auto;">
      <div style="background: #0d1117; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #e8a020; margin: 0; font-size: 20px; letter-spacing: 2px;">
          {REPORT_BRAND_NAME.upper()}
        </h1>
        <p style="color: #7a9ab8; margin: 6px 0 0; font-size: 12px;">
          {report_type.upper()} PERFORMANCE REPORT
        </p>
      </div>
      <div style="background: #f7f9fb; padding: 24px; border: 1px solid #d0d8e4;">
        <h2 style="margin: 0 0 8px; font-size: 16px;">{farm_name}</h2>
        <p style="color: #4a6080; font-size: 13px; margin: 0 0 20px;">
          Period: {period_start} to {period_end}
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 12px; background: white; border: 1px solid #d0d8e4; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #1a2535;">
                {summary.get('avg_temperature', 0):.1f}°C
              </div>
              <div style="font-size: 11px; color: #8aaabf;">AVG TEMPERATURE</div>
            </td>
            <td style="padding: 12px; background: white; border: 1px solid #d0d8e4; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #1a2535;">
                {summary.get('avg_humidity', 0):.1f}%
              </div>
              <div style="font-size: 11px; color: #8aaabf;">AVG HUMIDITY</div>
            </td>
            <td style="padding: 12px; background: white; border: 1px solid #d0d8e4; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #1a2535;">
                {summary.get('avg_ammonia', 0):.1f}ppm
              </div>
              <div style="font-size: 11px; color: #8aaabf;">AVG AMMONIA</div>
            </td>
            <td style="padding: 12px; background: white; border: 1px solid #d0d8e4; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: {risk_color};">
                {risk}
              </div>
              <div style="font-size: 11px; color: #8aaabf;">RISK LEVEL</div>
            </td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #8aaabf; margin: 0;">
          Full report attached as PDF. Log in to AviFarm for detailed analytics.
        </p>
      </div>
      <div style="background: #eef1f5; padding: 12px 24px; border-radius: 0 0 8px 8px; font-size: 11px; color: #8aaabf;">
        This is an automated report from {REPORT_BRAND_NAME}.
      </div>
    </body></html>
    """

async def send_onboarding_email(
    email:        str,
    company_name: str,
    subdomain:    str,
    invite_token: str,
):
    """Welcome email sent to new enterprise client's first admin."""
    invite_url = f'https://{subdomain}.avifarm.com/accept-invite?token={invite_token}'
    html = f"""
    <html><body style="font-family:Arial,sans-serif;color:#1a2535;max-width:600px;margin:0 auto">
      <div style="background:#0d1117;padding:24px;border-radius:8px 8px 0 0">
        <h1 style="color:#e8a020;margin:0;font-size:20px;letter-spacing:2px">FLELISSOPS</h1>
        <p style="color:#7a9ab8;margin:6px 0 0;font-size:12px">ENTERPRISE PLATFORM</p>
      </div>
      <div style="background:#f7f9fb;padding:24px;border:1px solid #d0d8e4">
        <h2 style="margin:0 0 16px">Welcome, {company_name}</h2>
        <p style="color:#4a6080;font-size:14px;line-height:1.6;margin:0 0 20px">
          Your FlelissOPS enterprise account has been set up. Your platform is ready at:
        </p>
        <div style="background:#eef1f5;padding:12px 16px;border-radius:4px;margin:0 0 20px;font-family:monospace;font-size:14px">
          https://{subdomain}.lvh.me
        </div>
        <p style="color:#4a6080;font-size:14px;margin:0 0 20px">
          Click the button below to create your administrator account.
          This link expires in 72 hours.
        </p>
        <a href="{invite_url}" style="display:inline-block;background:#c07010;color:white;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:1px">
          SET UP YOUR ACCOUNT
        </a>
      </div>
      <div style="background:#eef1f5;padding:12px 24px;border-radius:0 0 8px 8px;font-size:11px;color:#8aaabf">
        If you did not request this, please ignore this email.
      </div>
    </body></html>
    """
    await send_report_email(
        recipients=[email],
        subject=f'Welcome to FlelissOPS — Set up {company_name} account',
        body_html=html,
        pdf_bytes=None,
        filename=None,
        attachment=False,
    )


async def send_invitation_email(
    email:     str,
    tenant_id: str,
    role:      str,
    token:     str,
):
    """Invitation email sent when a client admin invites a new team member."""
    try:
        obj_id = ObjectId(tenant_id)
    except:
        obj_id = tenant_id
    tenant = db.tenants.find_one({'_id': obj_id})
    if not tenant:
        return
        
    subdomain    = tenant['subdomain']
    company_name = tenant['company_name']

    invite_url = f'https://{subdomain}.avifarm.com/accept-invite?token={token}'
    html = f"""
    <html><body style="font-family:Arial,sans-serif;color:#1a2535;max-width:600px;margin:0 auto">
      <div style="background:#0d1117;padding:24px;border-radius:8px 8px 0 0">
        <h1 style="color:#e8a020;margin:0;font-size:20px;letter-spacing:2px">FLELISSOPS</h1>
      </div>
      <div style="background:#f7f9fb;padding:24px;border:1px solid #d0d8e4">
        <h2 style="margin:0 0 16px">You've been invited to {company_name}</h2>
        <p style="color:#4a6080;font-size:14px;line-height:1.6;margin:0 0 16px">
          You have been invited to join <strong>{company_name}</strong> on FlelissOPS
          as a <strong>{role}</strong>.
        </p>
        <a href="{invite_url}" style="display:inline-block;background:#c07010;color:white;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:1px">
          ACCEPT INVITATION
        </a>
        <p style="color:#8aaabf;font-size:12px;margin:20px 0 0">
          This invitation expires in 48 hours.
        </p>
      </div>
    </body></html>
    """
    await send_report_email(
        recipients=[email],
        subject=f"You've been invited to {company_name} on FlelissOPS",
        body_html=html,
        pdf_bytes=None,
        filename=None,
        attachment=False,
    )

/**
 * Responsive, branded HTML email layout for Memis (JannyTech).
 * Uses table-based markup for broad client support (Gmail, Outlook, Apple Mail).
 */

const BRAND = {
  primary: '#06D6A0',
  primaryDark: '#136F57',
  ink: '#010605',
  grey: '#A4A4A4',
  text: '#46504C',
  surface: '#FEFEFE',
  bg: '#F2F2F2',
  border: '#E4E7E6',
} as const;

export interface EmailCta {
  label: string;
  href: string;
}

export interface EmailLayoutOptions {
  /** Hidden preview line shown in inbox list */
  preheader?: string;
  title: string;
  bodyHtml: string;
  cta?: EmailCta;
  /** Plain deep-link shown below the button */
  fallbackLink?: string;
  /** A short code the user can type into the app if the button won't open it. */
  manualCode?: string;
  /** Label above the manual code box (e.g. "your reset code"). */
  manualCodeLabel?: string;
  footerNote?: string;
  appUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildBrandedEmailHtml(options: EmailLayoutOptions): string {
  const {
    preheader = '',
    title,
    bodyHtml,
    cta,
    fallbackLink,
    manualCode,
    manualCodeLabel = 'Or enter this code in the Memis app',
    footerNote,
    appUrl = 'https://memis.app',
  } = options;

  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader);
  const safeFallback = fallbackLink ? escapeHtml(fallbackLink) : '';
  const safeFooter = footerNote ? escapeHtml(footerNote) : '';
  const safeManualCode = manualCode ? escapeHtml(manualCode) : '';
  const safeManualLabel = escapeHtml(manualCodeLabel);

  const ctaBlock = cta
    ? `
      <tr>
        <td align="center" style="padding:8px 0 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
            <tr>
              <td class="cta-cell" align="center" bgcolor="${BRAND.primary}" style="border-radius:12px;background-color:${BRAND.primary};">
                <a href="${cta.href}" target="_blank" rel="noopener noreferrer"
                   style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#FEFEFE;text-decoration:none;border-radius:12px;mso-padding-alt:0;">
                  <!--[if mso]><i style="letter-spacing:24px;mso-font-width:-100%;mso-text-raise:20pt">&nbsp;</i><![endif]-->
                  <span style="mso-text-raise:10pt;">${escapeHtml(cta.label)}</span>
                  <!--[if mso]><i style="letter-spacing:24px;mso-font-width:-100%">&nbsp;</i><![endif]-->
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
  : '';

  const fallbackBlock = fallbackLink
    ? `
      <tr>
        <td style="padding:0 0 8px;font-size:13px;line-height:1.6;color:${BRAND.grey};">
          If the button doesn't open the app, copy and paste this link on your phone:
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 20px;">
          <p style="margin:0;padding:12px 14px;background-color:${BRAND.bg};border-radius:10px;font-size:12px;line-height:1.5;color:${BRAND.primaryDark};word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
            ${safeFallback}
          </p>
        </td>
      </tr>`
    : '';

  const manualCodeBlock = manualCode
    ? `
      <tr>
        <td style="padding:4px 0 6px;font-size:13px;line-height:1.6;color:${BRAND.text};font-weight:600;">
          ${safeManualLabel}:
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 20px;">
          <p style="margin:0;padding:14px 16px;background-color:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:10px;font-size:15px;line-height:1.5;color:${BRAND.ink};word-break:break-all;font-weight:700;letter-spacing:0.02em;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;"><span style="white-space:nowrap;">${safeManualCode}</span></p>
        </td>
      </tr>`
    : '';

  const footerNoteBlock = footerNote
    ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${BRAND.grey};">${safeFooter}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${safeTitle}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${BRAND.bg}; }
    a { color: ${BRAND.primaryDark}; }
  </style>
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-card { padding: 28px 22px !important; border-radius: 0 !important; }
      .email-header { padding: 24px 22px !important; }
      .cta-cell a { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
      .stack { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${safePreheader}</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-shell" style="max-width:600px;width:100%;">
          <!-- Brand header -->
          <tr>
            <td class="email-header" style="padding:28px 32px 20px;text-align:center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;padding:10px 18px;border-radius:14px;background-color:${BRAND.primary};">
                      <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:#FEFEFE;letter-spacing:-0.02em;">Memis</span>
                    </div>
                    <p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.grey};letter-spacing:0.04em;text-transform:uppercase;">
                      by <a href="https://jannytech.com/" style="color:${BRAND.primaryDark};text-decoration:none;font-weight:600;">JannyTech</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td class="email-card" style="background-color:${BRAND.surface};border-radius:18px;padding:36px 32px;box-shadow:0 8px 30px rgba(1,6,5,0.06);">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:800;color:${BRAND.ink};">${safeTitle}</h1>
                    <div style="font-size:15px;line-height:1.65;color:${BRAND.text};">${bodyHtml}</div>
                  </td>
                </tr>
                ${ctaBlock}
                ${manualCodeBlock}
                ${fallbackBlock}
                <tr>
                  <td style="padding-top:8px;border-top:1px solid ${BRAND.border};">
                    ${footerNoteBlock}
                    <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.grey};">
                      If you did not request this email, you can safely ignore it.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 16px 8px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.grey};">
                Memis — private care coordination for families
              </p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.grey};">
                <a href="${appUrl}" style="color:${BRAND.primaryDark};text-decoration:none;">memis.app</a>
                &nbsp;·&nbsp;
                <a href="https://jannytech.com/" style="color:${BRAND.primaryDark};text-decoration:none;">JannyTech</a>
              </p>
              <p style="margin:12px 0 0;font-size:11px;color:#C5C9C7;">
                © ${new Date().getFullYear()} JannyTech. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

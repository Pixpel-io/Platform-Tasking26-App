import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.INVITE_FROM_EMAIL ?? "Tasking <onboarding@resend.dev>";
const replyTo = process.env.INVITE_REPLY_TO || undefined;

const resend = apiKey ? new Resend(apiKey) : null;

export function emailEnabled(): boolean {
  return resend !== null;
}

type InviteEmailArgs = {
  to: string;
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
};

export async function sendInviteEmail({
  to,
  workspaceName,
  inviterName,
  acceptUrl,
}: InviteEmailArgs): Promise<{ error?: string }> {
  if (!resend) {
    return { error: "Email sending is not configured (missing RESEND_API_KEY)." };
  }

  const { error } = await resend.emails.send({
    from: fromAddress,
    ...(replyTo ? { replyTo } : {}),
    to,
    subject: `${inviterName} invited you to ${workspaceName} on Tasking`,
    html: inviteEmailHtml({ workspaceName, inviterName, acceptUrl }),
    text:
      `${inviterName} invited you to join "${workspaceName}" on Tasking.\n\n` +
      `Accept your invite: ${acceptUrl}\n\n` +
      `This link expires in 7 days.`,
  });

  if (error) return { error: error.message };
  return {};
}

function inviteEmailHtml({
  workspaceName,
  inviterName,
  acceptUrl,
}: Omit<InviteEmailArgs, "to">): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <h1 style="margin:0;font-size:20px;color:#18181b;">You're invited to ${escapeHtml(workspaceName)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;color:#52525b;font-size:14px;line-height:22px;">
                <strong style="color:#18181b;">${escapeHtml(inviterName)}</strong> invited you to collaborate
                in <strong style="color:#18181b;">${escapeHtml(workspaceName)}</strong> on Tasking.
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <a href="${acceptUrl}"
                   style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">
                  Accept invitation
                </a>
                <p style="margin:20px 0 0;color:#a1a1aa;font-size:12px;line-height:18px;">
                  This invitation expires in 7 days. If you didn't expect it, you can ignore this email.
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

type DmInviteEmailArgs = {
  to: string;
  inviterName: string;
  acceptUrl: string;
};

// Personal DM invitation - no workspace involved, just a direct line between
// two people.
export async function sendDmInviteEmail({
  to,
  inviterName,
  acceptUrl,
}: DmInviteEmailArgs): Promise<{ error?: string }> {
  if (!resend) {
    return { error: "Email sending is not configured (missing RESEND_API_KEY)." };
  }

  const { error } = await resend.emails.send({
    from: fromAddress,
    ...(replyTo ? { replyTo } : {}),
    to,
    subject: `${inviterName} wants to message you on Tasking`,
    html: dmInviteEmailHtml({ inviterName, acceptUrl }),
    text:
      `${inviterName} invited you to connect on Tasking so you can message each other directly.

` +
      `Accept the invitation: ${acceptUrl}

` +
      `This link expires in 7 days.`,
  });

  if (error) return { error: error.message };
  return {};
}

function dmInviteEmailHtml({
  inviterName,
  acceptUrl,
}: Omit<DmInviteEmailArgs, "to">): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <h1 style="margin:0;font-size:20px;color:#18181b;">${escapeHtml(inviterName)} wants to message you</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;color:#52525b;font-size:14px;line-height:22px;">
                <strong style="color:#18181b;">${escapeHtml(inviterName)}</strong> invited you to connect on Tasking
                so you can message each other directly - no workspace needed.
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <a href="${acceptUrl}"
                   style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">
                  Accept invitation
                </a>
                <p style="margin:20px 0 0;color:#a1a1aa;font-size:12px;line-height:18px;">
                  This invitation expires in 7 days. If you didn't expect it, you can ignore this email.
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

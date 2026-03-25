const { sendMail } = require('./mailer');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOtpEmail(toEmail, otp) {
    try {
        const subject = `${otp} is your verification code — ONE SPR FTP DEX`;
        const digits = otp.toString().split('');

        const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0; padding:0; background-color:#f4f5f7; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:40px 0;">
        <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.06);">

        <!-- HEADER -->
        <tr>
        <td style="background-color:#0e1520; padding:28px 36px; text-align:center;">
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
                <td style="background-color:rgba(255,255,255,0.08); border-radius:8px; padding:8px 10px; vertical-align:middle;">
                    <img src="https://img.icons8.com/fluency/28/folder-invoices.png" alt="" width="20" height="20" style="display:block;" />
                </td>
                <td style="padding-left:12px; color:#ffffff; font-size:18px; font-weight:600; letter-spacing:0.5px; vertical-align:middle;">
                    ONE SPR FTP DEX
                </td>
            </tr>
            </table>
        </td>
        </tr>

        <!-- BODY -->
        <tr>
        <td style="padding:40px 36px 20px; text-align:center;">

            <div style="width:56px; height:56px; margin:0 auto 20px; background-color:#f0f6fe; border-radius:50%; line-height:56px; text-align:center;">
                <span style="font-size:28px;">&#128274;</span>
            </div>

            <h2 style="margin:0 0 8px; font-size:22px; font-weight:700; color:#111827;">Verification Code</h2>
            <p style="margin:0 0 28px; font-size:14px; color:#6b7280; line-height:1.5;">Enter this code to verify your identity and complete your sign-up.</p>

            <!-- OTP DIGITS -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
                ${digits.map(d => `<td style="padding:0 4px;">
                    <div style="width:48px; height:56px; background-color:#f8f9fb; border:2px solid #e5e7eb; border-radius:10px; text-align:center; line-height:56px; font-size:26px; font-weight:700; color:#0e1520; font-family:'Courier New', monospace;">${d}</div>
                </td>`).join('')}
            </tr>
            </table>

            <!-- EXPIRY -->
            <div style="margin-top:24px; padding:12px 20px; background-color:#fef9ee; border:1px solid #fde68a; border-radius:8px; display:inline-block;">
                <p style="margin:0; font-size:13px; color:#92710a; font-weight:500;">&#9200; This code expires in 2 minutes</p>
            </div>

        </td>
        </tr>

        <!-- SECURITY NOTE -->
        <tr>
        <td style="padding:8px 36px 12px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fb; border-radius:10px;">
            <tr>
                <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px; font-size:13px; font-weight:600; color:#374151;">Didn't request this?</p>
                    <p style="margin:0; font-size:12px; color:#6b7280; line-height:1.5;">If you didn't try to sign up on ONE SPR FTP DEX, you can safely ignore this email. No account will be created.</p>
                </td>
            </tr>
            </table>
        </td>
        </tr>

        <!-- DIVIDER -->
        <tr><td style="padding:12px 36px 0;"><hr style="border:none; border-top:1px solid #f0f0f0; margin:0;" /></td></tr>

        <!-- FOOTER -->
        <tr>
        <td style="padding:20px 36px 28px; text-align:center;">
            <p style="margin:0 0 4px; font-size:12px; color:#c5c9d0;">Secured by SPR Group &bull; Enterprise File Portal</p>
            <p style="margin:0; font-size:11px; color:#d1d5db;">This is an automated notification. Do not reply to this email.</p>
        </td>
        </tr>

        </table>
        </td></tr>
        </table>

        </body>
        </html>`;

        await sendMail(toEmail, subject, html);

    } catch (err) {
        console.error("Error sending OTP email:", err.message);
    }
}

module.exports = { generateOTP, sendOtpEmail };
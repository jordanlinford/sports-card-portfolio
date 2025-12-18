import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.ZOHO_SMTP_HOST || "smtp.zoho.com",
  port: parseInt(process.env.ZOHO_SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.ZOHO_EMAIL,
    pass: process.env.ZOHO_PASSWORD,
  },
});

export async function sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_PASSWORD) {
    console.log("Zoho email not configured, skipping welcome email");
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: "Welcome to Sports Card Portfolio!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Welcome to Sports Card Portfolio!</h1>
          <p>Hi ${userName || "Collector"},</p>
          <p>Thank you for joining Sports Card Portfolio! We're excited to help you track and grow your collection.</p>
          <p>Here's what you can do:</p>
          <ul>
            <li>Create digital display cases to organize your cards</li>
            <li>Track the value of your collection over time</li>
            <li>Share your collection with other collectors</li>
            <li>Get AI-powered price lookups and insights</li>
          </ul>
          <p>Get started by uploading your first card!</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`Welcome email sent to ${userEmail}`);
  } catch (error) {
    console.error("Failed to send welcome email:", error);
  }
}

export async function sendPaymentConfirmationEmail(
  userEmail: string,
  userName: string
): Promise<void> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_PASSWORD) {
    console.log("Zoho email not configured, skipping payment confirmation email");
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: "Welcome to Sports Card Portfolio Pro!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">You're Now a Pro Member!</h1>
          <p>Hi ${userName || "Collector"},</p>
          <p>Thank you for upgrading to Sports Card Portfolio Pro! Your subscription is now active.</p>
          <p>You now have access to:</p>
          <ul>
            <li>Unlimited display cases</li>
            <li>Premium themes and customization</li>
            <li>AI-powered price lookups and card outlook</li>
            <li>Advanced sharing formats (Brag Images)</li>
            <li>Priority support</li>
          </ul>
          <p>Enjoy your Pro features!</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`Payment confirmation email sent to ${userEmail}`);
  } catch (error) {
    console.error("Failed to send payment confirmation email:", error);
  }
}

export async function sendPriceAlertEmail(
  userEmail: string,
  userName: string,
  cardTitle: string,
  alertType: string,
  threshold: number,
  currentPrice: number
): Promise<boolean> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_PASSWORD) {
    console.log("Zoho email not configured, skipping price alert email");
    return true;
  }

  const direction = alertType === "above" ? "risen above" : "fallen below";
  const emoji = alertType === "above" ? "up" : "down";

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: `Price Alert: ${cardTitle} has ${direction} $${threshold}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Price Alert Triggered</h1>
          <p>Hi ${userName},</p>
          <p>Your price alert for <strong>${cardTitle}</strong> has been triggered.</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Card:</strong> ${cardTitle}</p>
            <p style="margin: 0 0 10px 0;"><strong>Your Alert:</strong> Notify when price goes ${alertType} $${threshold.toFixed(2)}</p>
            <p style="margin: 0;"><strong>Current Price:</strong> $${currentPrice.toFixed(2)} (${emoji})</p>
          </div>
          <p>Log in to Sports Card Portfolio to view your card and take action.</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`Price alert email sent to ${userEmail} for ${cardTitle}`);
    return true;
  } catch (error) {
    console.error("Failed to send price alert email:", error);
    return false;
  }
}

interface TopMover {
  title: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
}

interface DigestData {
  totalValue: number;
  totalCards: number;
  totalCases: number;
  topMovers: TopMover[];
}

export async function sendWeeklyDigestEmail(
  userEmail: string,
  userName: string,
  data: DigestData
): Promise<boolean> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_PASSWORD) {
    console.log("Zoho email not configured, skipping weekly digest email");
    return true;
  }

  const moverRows = data.topMovers.map(mover => {
    const changeColor = mover.change >= 0 ? "#10b981" : "#ef4444";
    const changeSign = mover.change >= 0 ? "+" : "";
    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${mover.title}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">$${mover.currentValue.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: ${changeColor};">
          ${changeSign}$${mover.change.toFixed(2)} (${changeSign}${mover.changePercent.toFixed(1)}%)
        </td>
      </tr>
    `;
  }).join("");

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: "Your Weekly Collection Digest",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Weekly Collection Digest</h1>
          <p>Hi ${userName},</p>
          <p>Here's your weekly collection summary:</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; text-align: center;">
              <div style="flex: 1;">
                <p style="margin: 0; font-size: 24px; font-weight: bold; color: #f59e0b;">$${data.totalValue.toLocaleString()}</p>
                <p style="margin: 5px 0 0 0; color: #6b7280;">Total Value</p>
              </div>
              <div style="flex: 1;">
                <p style="margin: 0; font-size: 24px; font-weight: bold;">${data.totalCards}</p>
                <p style="margin: 5px 0 0 0; color: #6b7280;">Cards</p>
              </div>
              <div style="flex: 1;">
                <p style="margin: 0; font-size: 24px; font-weight: bold;">${data.totalCases}</p>
                <p style="margin: 5px 0 0 0; color: #6b7280;">Cases</p>
              </div>
            </div>
          </div>

          ${data.topMovers.length > 0 ? `
            <h2 style="color: #374151;">Top Movers This Week</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f3f4f6;">
                  <th style="padding: 10px; text-align: left;">Card</th>
                  <th style="padding: 10px; text-align: left;">Value</th>
                  <th style="padding: 10px; text-align: left;">Change</th>
                </tr>
              </thead>
              <tbody>
                ${moverRows}
              </tbody>
            </table>
          ` : ""}

          <p style="margin-top: 30px;">Log in to Sports Card Portfolio to explore your full collection.</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
          
          <p style="margin-top: 30px; font-size: 12px; color: #9ca3af;">
            To unsubscribe from weekly digests, update your notification preferences in your account settings.
          </p>
        </div>
      `,
    });
    console.log(`Weekly digest email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send weekly digest email:", error);
    return false;
  }
}

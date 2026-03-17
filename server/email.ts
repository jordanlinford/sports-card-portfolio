import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.ZOHO_SMTP_HOST || "smtp.zoho.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_EMAIL,
    pass: process.env.ZOHO_APP_PASSWORD,
  },
});

export async function sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
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

export async function sendNewSignupNotification(
  newUserName: string,
  newUserEmail: string | null | undefined,
  authMethod: "google" | "replit"
): Promise<void> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) return;

  const displayName = newUserName || "Unknown";
  const displayEmail = newUserEmail || "No email";
  const method = authMethod === "google" ? "Google OAuth" : "Replit Auth";
  const time = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: "info@sportscardportfolio.io",
      subject: `New signup: ${displayName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #f59e0b; margin-bottom: 4px;">New User Signed Up</h2>
          <p style="color: #6b7280; margin-top: 0;">${time} ET</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px;">
            <p style="margin: 0 0 8px 0;"><strong>Name:</strong> ${displayName}</p>
            <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${displayEmail}</p>
            <p style="margin: 0;"><strong>Auth method:</strong> ${method}</p>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error("[Email] Failed to send signup notification:", err);
  }
}

export async function sendPaymentConfirmationEmail(
  userEmail: string,
  userName: string
): Promise<void> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
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
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
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
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
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

// ===== SPLIT / BOX BREAK EMAILS =====

export async function sendSplitJoinedEmail(
  userEmail: string,
  userName: string,
  splitInfo: { title: string; sport: string; brand: string; year: string; formatType: string; seatPrice: number }
): Promise<boolean> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
    console.log("Zoho email not configured, skipping split joined email");
    return true;
  }

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: `You've joined the ${splitInfo.title} box break!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">You're In!</h1>
          <p>Hi ${userName},</p>
          <p>You've successfully joined the <strong>${splitInfo.title}</strong> box break.</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Box:</strong> ${splitInfo.year} ${splitInfo.brand} ${splitInfo.sport}</p>
            <p style="margin: 0 0 10px 0;"><strong>Format:</strong> ${splitInfo.formatType}</p>
            <p style="margin: 0;"><strong>Your Cost:</strong> $${(splitInfo.seatPrice / 100).toFixed(2)}</p>
          </div>
          <p>We'll notify you when the payment window opens. Make sure to set your team preferences before then!</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`Split joined email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send split joined email:", error);
    return false;
  }
}

export async function sendSplitPaymentOpenEmail(
  userEmail: string,
  userName: string,
  splitInfo: { title: string; sport: string; seatPrice: number; deadline: Date }
): Promise<boolean> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
    console.log("Zoho email not configured, skipping payment open email");
    return true;
  }

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: `Payment Open: ${splitInfo.title} - Act Now!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Payment Window Is Open!</h1>
          <p>Hi ${userName},</p>
          <p>The <strong>${splitInfo.title}</strong> split is now full and ready for payment!</p>
          <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0 0 10px 0; font-weight: bold;">Pay early for priority picks!</p>
            <p style="margin: 0;">The earlier you pay, the higher priority you get for your preferred teams/bundles.</p>
          </div>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Amount Due:</strong> $${(splitInfo.seatPrice / 100).toFixed(2)}</p>
            <p style="margin: 0;"><strong>Deadline:</strong> ${splitInfo.deadline.toLocaleString()}</p>
          </div>
          <p>Log in to Sports Card Portfolio to complete your payment and set your preferences.</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`Payment open email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send payment open email:", error);
    return false;
  }
}

export async function sendSplitAssignmentEmail(
  userEmail: string,
  userName: string,
  splitInfo: { title: string; sport: string },
  assignment: string,
  priorityNumber: number
): Promise<boolean> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
    console.log("Zoho email not configured, skipping assignment email");
    return true;
  }

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: `Your Assignment: ${assignment} - ${splitInfo.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Your Team Is Locked In!</h1>
          <p>Hi ${userName},</p>
          <p>Assignments are in for <strong>${splitInfo.title}</strong>!</p>
          <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #065f46;">YOUR ASSIGNMENT</p>
            <p style="margin: 0; font-size: 28px; font-weight: bold; color: #065f46;">${assignment}</p>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #065f46;">Priority #${priorityNumber}</p>
          </div>
          <p>We'll notify you when the box is in hand and ready to break. Stay tuned!</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`Assignment email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send assignment email:", error);
    return false;
  }
}

export async function sendBreakCompleteEmail(
  userEmail: string,
  userName: string,
  splitInfo: { title: string; sport: string },
  assignment: string,
  youtubeUrl: string
): Promise<boolean> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
    console.log("Zoho email not configured, skipping break complete email");
    return true;
  }

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: `Break Complete! Watch Your ${assignment} Hits - ${splitInfo.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">The Break Is Complete!</h1>
          <p>Hi ${userName},</p>
          <p>The <strong>${splitInfo.title}</strong> break is done! Watch your <strong>${assignment}</strong> hits now.</p>
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 15px 0;">Watch the full break recording:</p>
            <a href="${youtubeUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Watch on YouTube
            </a>
          </div>
          <p>Your cards will be shipped soon. We'll send tracking info when they're on the way!</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`Break complete email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send break complete email:", error);
    return false;
  }
}

export async function sendSplitShippedEmail(
  userEmail: string,
  userName: string,
  splitInfo: { title: string; sport: string },
  assignment: string,
  trackingInfo?: string
): Promise<boolean> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
    console.log("Zoho email not configured, skipping shipped email");
    return true;
  }

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: `Your ${assignment} Cards Are On The Way! - ${splitInfo.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Your Cards Have Shipped!</h1>
          <p>Hi ${userName},</p>
          <p>Great news! Your <strong>${assignment}</strong> cards from <strong>${splitInfo.title}</strong> are on their way!</p>
          <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Assignment:</strong> ${assignment}</p>
            ${trackingInfo ? `<p style="margin: 0;"><strong>Tracking:</strong> ${trackingInfo}</p>` : '<p style="margin: 0; color: #6b7280;">Tracking info coming soon</p>'}
          </div>
          <p>Once you receive your cards, don't forget to add them to your collection!</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`Shipped email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send shipped email:", error);
    return false;
  }
}

export async function sendNewParticipantJoinedEmail(
  userEmail: string,
  userName: string,
  splitInfo: { title: string; currentCount: number; totalCount: number }
): Promise<boolean> {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_APP_PASSWORD) {
    console.log("Zoho email not configured, skipping new participant email");
    return true;
  }

  try {
    await transporter.sendMail({
      from: `"Sports Card Portfolio" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: `${splitInfo.title}: ${splitInfo.currentCount}/${splitInfo.totalCount} spots filled!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">New Participant Joined!</h1>
          <p>Hi ${userName},</p>
          <p>Someone just joined <strong>${splitInfo.title}</strong>!</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 32px; font-weight: bold; color: #f59e0b;">${splitInfo.currentCount} / ${splitInfo.totalCount}</p>
            <p style="margin: 10px 0 0 0; color: #6b7280;">spots filled</p>
          </div>
          ${splitInfo.currentCount === splitInfo.totalCount 
            ? '<p style="color: #059669; font-weight: bold;">The split is now full! Payment window will open soon.</p>'
            : `<p>Only ${splitInfo.totalCount - splitInfo.currentCount} more needed to fill this break!</p>`
          }
          <p style="margin-top: 30px;">Happy collecting,<br>The Sports Card Portfolio Team</p>
        </div>
      `,
    });
    console.log(`New participant email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send new participant email:", error);
    return false;
  }
}

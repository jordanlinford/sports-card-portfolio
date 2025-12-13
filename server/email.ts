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
      from: `"MyDisplayCase" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: "Welcome to MyDisplayCase!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Welcome to MyDisplayCase!</h1>
          <p>Hi ${userName || "Collector"},</p>
          <p>Thank you for joining MyDisplayCase! We're excited to help you showcase your card collection.</p>
          <p>Here's what you can do:</p>
          <ul>
            <li>Create digital display cases to organize your cards</li>
            <li>Track the value of your collection over time</li>
            <li>Share your collection with other collectors</li>
            <li>Get AI-powered price lookups and insights</li>
          </ul>
          <p>Get started by uploading your first card!</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The MyDisplayCase Team</p>
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
      from: `"MyDisplayCase" <${process.env.ZOHO_EMAIL}>`,
      to: userEmail,
      subject: "Welcome to MyDisplayCase Pro!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">You're Now a Pro Member!</h1>
          <p>Hi ${userName || "Collector"},</p>
          <p>Thank you for upgrading to MyDisplayCase Pro! Your subscription is now active.</p>
          <p>You now have access to:</p>
          <ul>
            <li>Unlimited display cases</li>
            <li>Premium themes and customization</li>
            <li>AI-powered price lookups and card outlook</li>
            <li>Advanced sharing formats (Brag Images)</li>
            <li>Priority support</li>
          </ul>
          <p>Enjoy your Pro features!</p>
          <p style="margin-top: 30px;">Happy collecting,<br>The MyDisplayCase Team</p>
        </div>
      `,
    });
    console.log(`Payment confirmation email sent to ${userEmail}`);
  } catch (error) {
    console.error("Failed to send payment confirmation email:", error);
  }
}

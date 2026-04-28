import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const sendMail = vi.fn(async () => ({ messageId: "test" }));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail }),
  },
  createTransport: () => ({ sendMail }),
}));

async function loadEmail() {
  vi.resetModules();
  return await import("../email");
}

describe("branded email header (HobbyAlpha logo)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.SESSION_SECRET = "test-session-secret-1234567890";
    process.env.CUSTOM_DOMAIN = "hobbyalpha.test";
    process.env.ZOHO_EMAIL = "noreply@hobbyalpha.test";
    process.env.ZOHO_APP_PASSWORD = "fake-password";
    sendMail.mockClear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("buildEmailHeaderHtml builds an absolute, cacheable logo URL using CUSTOM_DOMAIN", async () => {
    const { buildEmailHeaderHtml, getEmailLogoUrl } = await import("../emailBranding");
    const url = getEmailLogoUrl();
    expect(url).toBe("https://hobbyalpha.test/email/hobbyalpha-wordmark-light.png");
    const html = buildEmailHeaderHtml();
    expect(html).toContain(url);
    expect(html).toContain('alt="HobbyAlpha"');
    expect(html).toContain('background-color:#0F172A');
    expect(html).toContain('href="https://hobbyalpha.test/"');
  });

  it("buildEmailHeaderHtml falls back to hobbyalpha.com when CUSTOM_DOMAIN is unset", async () => {
    delete process.env.CUSTOM_DOMAIN;
    vi.resetModules();
    const { getEmailLogoUrl } = await import("../emailBranding");
    expect(getEmailLogoUrl()).toBe("https://hobbyalpha.com/email/hobbyalpha-wordmark-light.png");
  });

  const expectedLogoUrl = "https://hobbyalpha.test/email/hobbyalpha-wordmark-light.png";

  it("welcome email contains the branded HobbyAlpha logo header", async () => {
    const { sendWelcomeEmail } = await loadEmail();
    await sendWelcomeEmail("user@example.com", "Alex");
    const html: string = sendMail.mock.calls[0][0].html;
    expect(html).toContain(expectedLogoUrl);
    expect(html).toContain('alt="HobbyAlpha"');
  });

  it("payment confirmation email contains the branded HobbyAlpha logo header", async () => {
    const { sendPaymentConfirmationEmail } = await loadEmail();
    await sendPaymentConfirmationEmail("user@example.com", "Alex");
    expect(sendMail.mock.calls[0][0].html).toContain(expectedLogoUrl);
  });

  it("price alert email contains the branded HobbyAlpha logo header", async () => {
    const { sendPriceAlertEmail } = await loadEmail();
    await sendPriceAlertEmail("user@example.com", "Alex", "Card", "above", 100, 110);
    expect(sendMail.mock.calls[0][0].html).toContain(expectedLogoUrl);
  });

  it("weekly digest email contains the branded HobbyAlpha logo header", async () => {
    const { sendWeeklyDigestEmail } = await loadEmail();
    await sendWeeklyDigestEmail(
      "user@example.com",
      "Alex",
      { totalValue: 0, totalCards: 0, totalCases: 0, topMovers: [] },
      "user-id-1",
    );
    expect(sendMail.mock.calls[0][0].html).toContain(expectedLogoUrl);
  });

  it("win-back email contains the branded HobbyAlpha logo header in HTML and text", async () => {
    const { sendWinBackEmail } = await loadEmail();
    await sendWinBackEmail("user@example.com", "Alex", ["Player A: BUY"], "user-id-2");
    const message = sendMail.mock.calls[0][0];
    expect(message.html).toContain(expectedLogoUrl);
    expect(message.text).toContain("HobbyAlpha");
  });

  it("rebrand announcement email contains the branded HobbyAlpha logo header", async () => {
    const { sendRebrandAnnouncementEmail } = await loadEmail();
    await sendRebrandAnnouncementEmail("user@example.com", "Alex", "user-id-3");
    expect(sendMail.mock.calls[0][0].html).toContain(expectedLogoUrl);
  });

  it("split-flow emails (joined / payment-open / assignment / break-complete / shipped / new-participant) contain the branded HobbyAlpha logo header", async () => {
    const email = await loadEmail();
    const splitInfo = {
      title: "Hobby Box",
      sport: "Baseball",
      brand: "Topps",
      year: "2024",
      formatType: "Hits",
      seatPrice: 1000,
    };
    await email.sendSplitJoinedEmail("u@e.com", "Alex", splitInfo);
    await email.sendSplitPaymentOpenEmail("u@e.com", "Alex", {
      title: "Hobby Box",
      sport: "Baseball",
      seatPrice: 1000,
      deadline: new Date("2026-05-01T00:00:00Z"),
    });
    await email.sendSplitAssignmentEmail("u@e.com", "Alex", { title: "Hobby Box", sport: "Baseball" }, "Yankees", 1);
    await email.sendBreakCompleteEmail("u@e.com", "Alex", { title: "Hobby Box", sport: "Baseball" }, "Yankees", "https://youtu.be/x");
    await email.sendSplitShippedEmail("u@e.com", "Alex", { title: "Hobby Box", sport: "Baseball" }, "Yankees");
    await email.sendNewParticipantJoinedEmail("u@e.com", "Alex", { title: "Hobby Box", currentCount: 1, totalCount: 5 });
    expect(sendMail).toHaveBeenCalledTimes(6);
    for (const call of sendMail.mock.calls) {
      expect(call[0].html).toContain(expectedLogoUrl);
    }
  });

  it("referral invite email contains the branded HobbyAlpha logo header", async () => {
    const { sendReferralInviteEmail } = await loadEmail();
    await sendReferralInviteEmail("u@e.com", "Alex", "ABC123");
    expect(sendMail.mock.calls[0][0].html).toContain(expectedLogoUrl);
  });

  it("new signup notification email contains the branded HobbyAlpha logo header", async () => {
    const { sendNewSignupNotification } = await loadEmail();
    await sendNewSignupNotification("Alex", "user@example.com", "google");
    expect(sendMail.mock.calls[0][0].html).toContain(expectedLogoUrl);
  });
});

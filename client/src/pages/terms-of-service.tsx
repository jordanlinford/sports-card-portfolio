import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  const lastUpdated = "December 18, 2024";
  const companyName = "Sports Card Portfolio";
  const websiteUrl = "sportscardportfolio.com";
  const contactEmail = "info@sportscardportfolio.io";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h1>Terms of Service</h1>
          <p className="text-muted-foreground">Last Updated: {lastUpdated}</p>

          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using {companyName} ("{websiteUrl}"), you agree to be bound by these Terms of Service ("Terms"). 
            If you do not agree to these Terms, please do not use our Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            {companyName} is a digital platform that allows users to create, customize, and share virtual display cases 
            for their card collections, including sports cards, trading cards, and other collectibles. The Service includes 
            features for uploading images, organizing collections, and sharing them publicly or privately.
          </p>

          <h2>3. User Accounts</h2>
          <p>
            To use certain features of the Service, you must create an account. You are responsible for:
          </p>
          <ul>
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized use of your account</li>
          </ul>
          <p>
            We reserve the right to terminate accounts that violate these Terms or for any other reason at our discretion.
          </p>

          <h2>4. Subscription Plans and Billing</h2>
          <h3>4.1 Free Tier</h3>
          <p>
            Free accounts are limited to creating up to 3 display cases. Additional features may be restricted.
          </p>

          <h3>4.2 Pro Subscription</h3>
          <p>
            The Pro subscription is available for $12.00 USD per month and includes:
          </p>
          <ul>
            <li>Unlimited display cases</li>
            <li>Access to all premium features</li>
            <li>Priority support</li>
          </ul>

          <h3>4.3 Billing</h3>
          <p>
            Subscriptions are billed monthly in advance. Your subscription will automatically renew each month unless cancelled. 
            Payment is processed securely through Stripe. By subscribing, you authorize us to charge your payment method on a 
            recurring basis.
          </p>

          <h3>4.4 Cancellation</h3>
          <p>
            You may cancel your subscription at any time through your account settings or by contacting us at {contactEmail}. 
            Cancellation will take effect at the end of your current billing period. You will retain access to Pro features 
            until the end of your paid period.
          </p>

          <h3>4.5 Refunds</h3>
          <p>
            Subscription fees are generally non-refundable. However, we may provide refunds on a case-by-case basis at our 
            discretion. Contact {contactEmail} for refund requests.
          </p>

          <h2>5. User Content</h2>
          <h3>5.1 Your Content</h3>
          <p>
            You retain ownership of all content you upload to the Service, including images of your cards and collection 
            descriptions ("User Content"). By uploading content, you grant us a non-exclusive, worldwide, royalty-free 
            license to use, display, and distribute your content solely for the purpose of operating the Service.
          </p>

          <h3>5.2 Content Restrictions</h3>
          <p>You agree not to upload content that:</p>
          <ul>
            <li>Infringes on intellectual property rights of others</li>
            <li>Contains illegal, harmful, or offensive material</li>
            <li>Violates any applicable laws or regulations</li>
            <li>Contains malware, viruses, or other harmful code</li>
            <li>Misrepresents the authenticity or ownership of cards</li>
          </ul>

          <h3>5.3 Content Removal</h3>
          <p>
            We reserve the right to remove any User Content that violates these Terms or for any other reason at our discretion.
          </p>

          <h2>6. Intellectual Property</h2>
          <p>
            The Service, including its design, features, and original content (excluding User Content), is owned by 
            {companyName} and is protected by copyright, trademark, and other intellectual property laws. You may not 
            copy, modify, distribute, or reverse engineer any part of the Service without our written permission.
          </p>

          <h2>7. Privacy</h2>
          <p>
            Your use of the Service is also governed by our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, 
            which explains how we collect, use, and protect your personal information.
          </p>

          <h2>8. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, 
            INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND 
            NON-INFRINGEMENT.
          </p>
          <p>
            We do not guarantee that the Service will be uninterrupted, secure, or error-free. We are not responsible for 
            the accuracy of card values, descriptions, or other information provided by users.
          </p>

          <h2>9. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, {companyName.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR 
            INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM:
          </p>
          <ul>
            <li>Your use or inability to use the Service</li>
            <li>Any unauthorized access to or use of our servers and/or any personal information stored therein</li>
            <li>Any interruption or cessation of transmission to or from the Service</li>
            <li>Any bugs, viruses, or other harmful code that may be transmitted through the Service</li>
          </ul>

          <h2>10. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless {companyName}, its officers, directors, employees, and agents from any 
            claims, damages, losses, or expenses (including reasonable attorneys' fees) arising from your use of the Service 
            or violation of these Terms.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. We will notify users of material changes by posting the updated Terms on 
            the Service and updating the "Last Updated" date. Your continued use of the Service after such changes constitutes 
            acceptance of the new Terms.
          </p>

          <h2>12. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the United States, without regard 
            to its conflict of law provisions.
          </p>

          <h2>13. Dispute Resolution</h2>
          <p>
            Any disputes arising from these Terms or your use of the Service shall first be attempted to be resolved through 
            informal negotiation. If resolution cannot be reached, disputes shall be resolved through binding arbitration in 
            accordance with applicable arbitration rules.
          </p>

          <h2>14. Severability</h2>
          <p>
            If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or 
            eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
          </p>

          <h2>15. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <p>
            Email: {contactEmail}
          </p>
        </div>
      </div>
    </div>
  );
}

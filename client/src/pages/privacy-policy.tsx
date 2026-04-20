import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  const lastUpdated = "December 18, 2024";
  const companyName = "Sports Card Portfolio";
  const websiteUrl = "sportscardportfolio.io";
  const contactEmail = "info@sportscardportfolio.io";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h1>Privacy Policy</h1>
          <p className="text-muted-foreground">Last Updated: {lastUpdated}</p>

          <h2>1. Introduction</h2>
          <p>
            {companyName} ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how 
            we collect, use, disclose, and safeguard your information when you use our website and services at {websiteUrl} 
            (the "Service").
          </p>
          <p>
            Please read this Privacy Policy carefully. By using the Service, you consent to the practices described in this policy.
          </p>

          <h2>2. Information We Collect</h2>
          
          <h3>2.1 Information You Provide</h3>
          <p>We collect information you voluntarily provide when using our Service:</p>
          <ul>
            <li><strong>Account Information:</strong> When you sign up, we receive your name, 
            email address, and profile picture from your authentication provider.</li>
            <li><strong>User Content:</strong> Images of cards you upload, display case names, descriptions, and card details 
            (titles, descriptions, estimated values).</li>
            <li><strong>Comments and Social Interactions:</strong> Comments you post on display cases and your likes/interactions.</li>
            <li><strong>Payment Information:</strong> When you subscribe to Pro, payment processing is handled by Stripe. 
            We do not store your full credit card number. We receive limited billing information from Stripe to manage your subscription.</li>
          </ul>

          <h3>2.2 Information Collected Automatically</h3>
          <p>When you use our Service, we automatically collect:</p>
          <ul>
            <li><strong>Usage Data:</strong> Pages visited, features used, and actions taken within the Service.</li>
            <li><strong>Device Information:</strong> Browser type, operating system, device type, and screen resolution.</li>
            <li><strong>Log Data:</strong> IP address, access times, and referring URLs.</li>
            <li><strong>Cookies:</strong> We use cookies and similar technologies to maintain your session and preferences. 
            See Section 7 for more details.</li>
          </ul>

          <h2>3. How We Use Your Information</h2>
          <p>We use collected information to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Process your transactions and manage your subscription</li>
            <li>Authenticate your identity and maintain your account</li>
            <li>Enable you to create, customize, and share display cases</li>
            <li>Facilitate social features like comments and likes</li>
            <li>Send you service-related communications (account updates, security alerts)</li>
            <li>Respond to your inquiries and provide customer support</li>
            <li>Detect and prevent fraud, abuse, and security issues</li>
            <li>Comply with legal obligations</li>
          </ul>

          <h2>4. How We Share Your Information</h2>
          <p>We may share your information in the following circumstances:</p>
          
          <h3>4.1 Public Display Cases</h3>
          <p>
            When you set a display case to "public," the case name, description, card images, and any enabled statistics 
            (card count, total value) become publicly viewable. Your username may be displayed as the collection owner.
          </p>

          <h3>4.2 Service Providers</h3>
          <p>We share information with trusted third-party service providers who assist in operating our Service:</p>
          <ul>
            <li><strong>Cloud Infrastructure:</strong> Authentication and hosting services</li>
            <li><strong>Stripe:</strong> Payment processing for subscriptions</li>
            <li><strong>Google Cloud Storage:</strong> Secure storage for uploaded images</li>
          </ul>

          <h3>4.3 Legal Requirements</h3>
          <p>
            We may disclose your information if required by law, court order, or government request, or if we believe 
            disclosure is necessary to protect our rights, your safety, or the safety of others.
          </p>

          <h3>4.4 Business Transfers</h3>
          <p>
            If we are involved in a merger, acquisition, or sale of assets, your information may be transferred as part 
            of that transaction.
          </p>

          <h2>5. Data Retention</h2>
          <p>
            We retain your personal information for as long as your account is active or as needed to provide you services. 
            If you delete your account, we will delete or anonymize your personal information within 30 days, except where 
            we are required to retain it for legal or legitimate business purposes.
          </p>
          <p>
            Uploaded images and display case content will be deleted when you delete the associated content or your account.
          </p>

          <h2>6. Your Rights and Choices</h2>
          <p>Depending on your location, you may have the following rights:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
            <li><strong>Correction:</strong> Request correction of inaccurate personal information.</li>
            <li><strong>Deletion:</strong> Request deletion of your personal information and account.</li>
            <li><strong>Portability:</strong> Request a copy of your data in a portable format.</li>
            <li><strong>Opt-out:</strong> Opt out of certain data processing activities.</li>
          </ul>
          <p>
            To exercise these rights, please contact us at {contactEmail}. We will respond to your request within 30 days.
          </p>

          <h3>6.1 California Residents (CCPA)</h3>
          <p>
            California residents have additional rights under the California Consumer Privacy Act (CCPA), including the 
            right to know what personal information we collect and how it's used, the right to delete personal information, 
            and the right to opt-out of the sale of personal information. We do not sell your personal information.
          </p>

          <h3>6.2 European Users (GDPR)</h3>
          <p>
            If you are in the European Economic Area (EEA), you have rights under the General Data Protection Regulation (GDPR), 
            including the rights described above plus the right to lodge a complaint with a supervisory authority. Our legal 
            basis for processing your information is your consent and our legitimate interests in providing the Service.
          </p>

          <h2>7. Cookies and Tracking Technologies</h2>
          <p>We use the following types of cookies:</p>
          <ul>
            <li><strong>Essential Cookies:</strong> Required for the Service to function, including session authentication.</li>
            <li><strong>Preference Cookies:</strong> Remember your settings and preferences (e.g., dark/light mode).</li>
            <li><strong>Analytics Cookies:</strong> Help us understand how users interact with the Service to improve it.</li>
          </ul>
          <p>
            You can control cookies through your browser settings. Note that disabling essential cookies may prevent you 
            from using certain features of the Service.
          </p>

          <h2>8. Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal information, including:
          </p>
          <ul>
            <li>Encryption of data in transit (HTTPS/TLS)</li>
            <li>Secure authentication through industry-standard OAuth</li>
            <li>Secure payment processing through Stripe (PCI-DSS compliant)</li>
            <li>Access controls and authentication for our systems</li>
          </ul>
          <p>
            However, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee 
            absolute security of your data.
          </p>

          <h2>9. Children's Privacy</h2>
          <p>
            The Service is not intended for children under 13 years of age. We do not knowingly collect personal information 
            from children under 13. If you are a parent or guardian and believe your child has provided us with personal 
            information, please contact us at {contactEmail} so we can delete the information.
          </p>

          <h2>10. International Data Transfers</h2>
          <p>
            Your information may be transferred to and processed in countries other than your country of residence. These 
            countries may have different data protection laws. By using the Service, you consent to the transfer of your 
            information to the United States and other countries where our service providers operate.
          </p>

          <h2>11. Third-Party Links</h2>
          <p>
            The Service may contain links to third-party websites or services. We are not responsible for the privacy 
            practices of these third parties. We encourage you to read their privacy policies before providing any information.
          </p>

          <h2>12. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the 
            new Privacy Policy on this page and updating the "Last Updated" date. We encourage you to review this Privacy 
            Policy periodically.
          </p>

          <h2>13. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or our privacy practices, please contact us at:
          </p>
          <p>
            Email: {contactEmail}
          </p>

          <h2>14. Data Protection Officer</h2>
          <p>
            For data protection inquiries, you may contact our Data Protection Officer at {contactEmail}.
          </p>
        </div>
      </div>
    </div>
  );
}

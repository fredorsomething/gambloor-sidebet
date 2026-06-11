import type { Metadata } from "next";
import Link from "next/link";

import { LegalLayout, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for Sidebet (sidebet.lol).",
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="May 30, 2026"
      intro="This Privacy Policy describes how Sidebet (sidebet.lol), operated by Box, LLC, handles information when you use the platform. By using Sidebet, you accept this Policy and all risks described herein."
    >
      <LegalSection title="1. Your responsibility">
        <p>
          You are responsible for what you share on Sidebet and for protecting
          your own wallet, devices, and accounts. Public blockchains are
          transparent: wallet addresses, transaction amounts, and on-chain
          activity may be visible to anyone worldwide. You assume full
          responsibility for any consequences of using the platform or linking
          your identity to a wallet address.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we may collect">
        <p>We may collect or process information such as:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Wallet addresses and on-chain transaction data (public by nature)
          </li>
          <li>
            Profile information you choose to provide (username, avatar, bio,
            social links)
          </li>
          <li>
            Messages, comments, chat content, and bet or market metadata you
            submit
          </li>
          <li>
            Basic usage and technical data (e.g. IP address, browser type,
            device information, logs) for security and operations
          </li>
          <li>
            Information from authentication and wallet providers (e.g. Privy)
            when you sign in
          </li>
        </ul>
        <p>
          We do not intentionally collect traditional passwords for
          non-custodial wallets; key management is your responsibility.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <p>
          We may use information to operate, secure, and improve Sidebet,
          including to:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Display profiles, bets, markets, chat, and leaderboards</li>
          <li>Authenticate users and prevent abuse</li>
          <li>Respond to support requests</li>
          <li>Comply with legal obligations if required</li>
        </ul>
        <p>
          We do not sell your personal information. We may share data with
          service providers (hosting, analytics, auth, storage) who process it
          on our behalf, or when required by law.
        </p>
      </LegalSection>

      <LegalSection title="4. No guarantee of privacy or security">
        <p>
          We do not guarantee that your information will remain private, secure,
          accurate, or free from unauthorized access, loss, or disclosure. No
          internet transmission or electronic storage is completely secure. You
          use Sidebet knowing that breaches, leaks, scraping, indexing by third
          parties, and blockchain permanence may occur — and you accept those
          risks.
        </p>
      </LegalSection>

      <LegalSection title="5. Third-party services">
        <p>
          Sidebet integrates with third parties (wallet providers, RPC nodes,
          blob storage, analytics, etc.). Their privacy practices are governed
          by their own policies. We are not responsible for how third parties
          handle your data or for any harm arising from their services.
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies and local storage">
        <p>
          We may use cookies, local storage, and similar technologies for
          session management, preferences, and basic analytics. You can control
          cookies through your browser settings; disabling them may limit
          functionality.
        </p>
      </LegalSection>

      <LegalSection title="7. Limitation of liability">
        <p>
          To the fullest extent permitted by applicable law, Box, LLC and its
          affiliates, officers, employees, and agents shall not be liable for
          any damages, losses, or harm of any kind related to your information
          or privacy — including unauthorized access, data loss, identity
          exposure, doxxing, phishing, misuse of public blockchain data, or
          failures of third-party providers — whether or not we were negligent.
        </p>
        <p>
          Your sole remedy for dissatisfaction with our privacy practices is to
          stop using Sidebet. We disclaim all liability to the maximum extent
          allowed by law.
        </p>
      </LegalSection>

      <LegalSection title="8. Children">
        <p>
          Sidebet is not intended for users under 18 (or the age of majority in
          your jurisdiction). We do not knowingly collect information from
          children.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes">
        <p>
          We may update this Privacy Policy at any time by posting a revised
          version on this page. Continued use after changes constitutes
          acceptance.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Privacy questions:{" "}
          <a
            href="mailto:support@sidebet.lol"
            className="text-primary underline-offset-2 hover:underline"
          >
            For support create a ticket in our Discord!
          </a>
          . Box, LLC · Omonoias Ave 13, Limassol 3052, Cyprus.
        </p>
        <p className="text-muted-foreground">
          See also our{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

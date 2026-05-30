import type { Metadata } from "next";
import Link from "next/link";

import { LegalLayout, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of service for Sidebet (sidebet.lol).",
};

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="May 30, 2026"
      intro="By accessing or using Sidebet (sidebet.lol), you agree to these Terms. If you do not agree, do not use the platform."
    >
      <LegalSection title="1. Assumption of risk">
        <p>
          You use Sidebet entirely at your own risk. You are solely responsible
          for evaluating whether any bet, market, swap, transfer, or other
          activity is appropriate for you. You accept full responsibility for
          all decisions you make on or through the platform, including choosing
          counterparties, settlers, stakes, tokens, and resolution outcomes.
        </p>
      </LegalSection>

      <LegalSection title="2. No guarantees">
        <p>
          Sidebet is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. We make no promises, warranties, or guarantees
          of any kind — express or implied — regarding the platform, its
          availability, accuracy, security, smart contracts, escrow logic,
          settlement, payouts, user-generated content, or any outcome of any
          bet or transaction.
        </p>
        <p>
          We do not guarantee that sidebets will settle correctly, on time, or
          at all; that settlers will act fairly; that on-chain transactions
          will succeed; that prices or quotes are accurate; or that you will
          profit or recover any funds.
        </p>
      </LegalSection>

      <LegalSection title="3. Not financial, legal, or gambling advice">
        <p>
          Nothing on Sidebet constitutes financial, investment, legal, tax, or
          gambling advice. You are responsible for complying with all laws and
          regulations that apply to you, including restrictions on wagering,
          crypto assets, and online platforms in your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection title="4. Non-custodial platform">
        <p>
          Sidebet is a software interface. We do not custody your private keys
          or funds. Blockchain transactions are irreversible. You are responsible
          for securing your wallet, credentials, and devices. We are not
          responsible for lost keys, phishing, user error, network congestion,
          chain reorganizations, or third-party wallet or RPC failures.
        </p>
      </LegalSection>

      <LegalSection title="5. User content and disputes">
        <p>
          Bets, markets, chat messages, profiles, and other content are created
          by users. We do not endorse user content and are not a party to
          disputes between users. Settlers, proposers, acceptors, and traders
          act independently. Any disagreement about outcomes, terms, or payouts
          is solely between the involved parties, subject to on-chain rules and
          any settler decision — not Sidebet.
        </p>
      </LegalSection>

      <LegalSection title="6. Limitation of liability">
        <p>
          To the fullest extent permitted by applicable law, Box, LLC, its
          owners, operators, affiliates, directors, employees, contractors, and
          agents (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) shall
          not be liable for any damages, losses, or harm of any kind arising
          from or related to your use of Sidebet — including direct, indirect,
          incidental, consequential, special, exemplary, or punitive damages;
          loss of funds, tokens, profits, data, or goodwill; smart-contract
          bugs or exploits; settler misconduct; counterparty default; platform
          downtime; unauthorized access; or errors in displayed information.
        </p>
        <p>
          Our total aggregate liability to you for any claim arising out of or
          relating to these Terms or the platform shall not exceed the greater
          of (a) one United States dollar (US$1.00) or (b) the amount you paid
          us in platform fees, if any, in the twelve (12) months before the
          claim. Some jurisdictions do not allow certain limitations; where
          prohibited, our liability is limited to the minimum extent allowed by
          law.
        </p>
      </LegalSection>

      <LegalSection title="7. Indemnification">
        <p>
          You agree to defend, indemnify, and hold harmless Box, LLC and its
          affiliates from any claims, damages, losses, liabilities, and
          expenses (including reasonable attorneys&apos; fees) arising from
          your use of Sidebet, your violation of these Terms, your violation of
          any law or third-party rights, or any dispute you have with another
          user.
        </p>
      </LegalSection>

      <LegalSection title="8. Modifications and termination">
        <p>
          We may change, suspend, or discontinue any part of Sidebet at any
          time without notice or liability. We may update these Terms by posting
          a revised version on this page. Continued use after changes means you
          accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection title="9. Governing law">
        <p>
          These Terms are governed by the laws of Cyprus, without regard to
          conflict-of-law principles. You agree that any dispute shall be
          resolved in the courts of Cyprus, unless we elect another permitted
          forum.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions:{" "}
          <a
            href="mailto:support@sidebet.lol"
            className="text-primary underline-offset-2 hover:underline"
          >
            support@sidebet.lol
          </a>
          . Box, LLC · Omonoias Ave 13, Limassol 3052, Cyprus.
        </p>
        <p className="text-muted-foreground">
          See also our{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

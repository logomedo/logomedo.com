// Zajednički okvir svih transakcijskih mailova LogoMeda (React Email). Ne renderira se u Workeru:
// `npm run emails` izveze HTML i tekst s placeholderima {{ime}} u src/lib/emails/generirano.ts.
// Pregled: `npm run emails:dev`. Boje kao favicon (#d48a06); logo je HTML, ne slika (Gmail/Outlook blokiraju slike).
import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export const BOJA = "#d48a06";
export const TAMNA = "#1d1a14";

export function Okvir({ pregled, children }: { pregled: string; children: ReactNode }) {
  return (
    <Html lang="hr">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{pregled}</Preview>
      <Body style={{ backgroundColor: "#f6f3ee", margin: 0, padding: "24px 0", fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: TAMNA }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 32px 24px" }}>
          <Section style={{ paddingBottom: 8 }}>
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody><tr>
                <td style={{ backgroundColor: BOJA, color: "#ffffff", width: 32, height: 32, borderRadius: 8, textAlign: "center", fontWeight: 700, fontSize: 18, lineHeight: "32px" }}>L</td>
                <td style={{ paddingLeft: 10, fontSize: 18, fontWeight: 700, color: TAMNA }}>Logo<span style={{ color: BOJA }}>Medo</span></td>
              </tr></tbody>
            </table>
          </Section>
          {children}
          <Hr style={{ borderColor: "#eee5d8", margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 12, color: "#8a8174", margin: 0, lineHeight: "18px" }}>
            LogoMedo · slike, radni listići i igre za logopedsku terapiju ·{" "}
            <Link href="https://logomedo.com" style={{ color: "#8a8174" }}>logomedo.com</Link>
            <br />Na ovu poruku možete odgovoriti, javit ćemo vam se.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const tekst = { fontSize: 16, lineHeight: "24px", margin: "0 0 16px" } as const;
export const sitno = { fontSize: 13, lineHeight: "20px", color: "#6b6357", margin: "0 0 12px" } as const;

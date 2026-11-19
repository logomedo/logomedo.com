// Obavijest superadminu (src/lib/obavijesti.ts): nova poruka u inboxu ili novi zahtjev na /pristup. Namjerno bez
// imena, adrese i sadržaja (odluka 401): mail ide u vanjski pretinac, a sve ostalo je iza prijave u adminu.
// Placeholderi: {{naslov}}, {{opis}}, {{url}}, {{gumb}}.
import { Button, Text } from "@react-email/components";
import { BOJA, Okvir, TAMNA, sitno, tekst } from "./Okvir";

export const NASLOV = "{{naslov}}";

export default function Obavijest({ opis = "{{opis}}", url = "{{url}}", gumb = "{{gumb}}" }) {
  return (
    <Okvir pregled={opis}>
      <Text style={tekst}>{opis}</Text>
      <Button href={url} style={{ backgroundColor: BOJA, color: "#ffffff", padding: "12px 22px", borderRadius: 8, fontWeight: 600, fontSize: 16, textDecoration: "none", margin: "8px 0 24px" }}>
        {gumb}
      </Button>
      <Text style={sitno}>Ako gumb ne radi: <span style={{ wordBreak: "break-all", color: TAMNA }}>{url}</span></Text>
      <Text style={sitno}>Automatska obavijest LogoMeda, najviše jedna na sat za isti razgovor. Ne odgovarajte na nju.</Text>
    </Okvir>
  );
}

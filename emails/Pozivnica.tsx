// Pozivnica nakon „Odobri” na /admin/zahtjevi (src/lib/email.ts). Placeholderi: {{pozdrav}}, {{url}}, {{istjece}}.
import { Button, Text } from "@react-email/components";
import { BOJA, Okvir, TAMNA, sitno, tekst } from "./Okvir";

export const NASLOV = "Vaš pristup LogoMedu je odobren";

export default function Pozivnica({ pozdrav = "{{pozdrav}}", url = "{{url}}", istjece = "{{istjece}}" }) {
  return (
    <Okvir pregled="Zahtjev je odobren: postavite prijavu u LogoMedu.">
      <Text style={tekst}>{pozdrav}</Text>
      <Text style={tekst}>vaš zahtjev za pristup LogoMedu je odobren.</Text>
      <Text style={tekst}>
        Otvorite link ispod i postavite prijavu (passkey). Link vrijedi do <strong>{istjece}</strong> i može se iskoristiti jednom.
      </Text>
      <Button href={url} style={{ backgroundColor: BOJA, color: "#ffffff", padding: "12px 22px", borderRadius: 8, fontWeight: 600, fontSize: 16, textDecoration: "none", margin: "8px 0 24px" }}>
        Prihvati pozivnicu
      </Button>
      <Text style={sitno}>Ako gumb ne radi, kopirajte ovaj link u preglednik:<br /><span style={{ wordBreak: "break-all", color: TAMNA }}>{url}</span></Text>
      <Text style={sitno}>Ako vam link istekne ili ne radi, samo odgovorite na ovu poruku.</Text>
    </Okvir>
  );
}

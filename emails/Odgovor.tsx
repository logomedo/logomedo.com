// Odgovor superadmina iz /admin/poruke/[id] (src/lib/email.ts, `posaljiOdgovor`). Placeholderi s tri vitičaste
// zagrade su već gotov HTML (tekst u odlomcima, citat), pa ih `popuni` ne escapa; sastavlja ih email.ts iz
// escapanog teksta. {{pregled}} je početak odgovora za pregled u pretincu.
import { Section } from "@react-email/components";
import { Okvir } from "./Okvir";

export const NASLOV = "{{predmet}}";

export default function Odgovor({ tijelo = "{{{tijelo}}}", citat = "{{{citat}}}", pregled = "{{pregled}}" }) {
  return (
    <Okvir pregled={pregled}>
      <Section>{tijelo}</Section>
      <Section>{citat}</Section>
    </Okvir>
  );
}

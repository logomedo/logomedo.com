# Rute admina po ulozi (S3, 16. 11. 2026.)

Popis datoteka: `find src/pages/admin -type f | sort` → **54 datoteke** (53 postojeće + nova
`nemas-pristup.astro`). `/api/v1` je zaseban (bearer token aplikacije), jednim retkom na dnu.

Legenda „tko smije”:

- **javno**: bez sesije (middleware `JAVNO`; CSRF/Origin i dalje vrijedi za ne-GET).
- **obje**: superadmin i logoped, bez ograničenja.
- **obje, samo svoje**: logoped samo svoje (`autor_id` = njegov `korisnikId`, odnosno `tko` = njegov e-mail); tuđe je 404 (zadaci, bilježnice) ili 403 (aktivnost, vraćanje).
- **samo superadmin**: logoped dobiva 403 (GET/HEAD izvan `/admin/api/`: stranica „Nemaš pristup”; inače JSON `{ "error": "forbidden" }`).

„Gdje”: **mw** = `src/middleware.ts` (sesija; `rutaSamoSuperadmin` iz `src/lib/admin/rute.ts`);
**vl** = `src/lib/admin/vlasnistvo.ts` (`autorFiltar`, `aktivnostFiltar`) i SQL filtar u funkciji navedenoj u zagradi.

| Ruta | Metode | Tko smije | Gdje se provodi |
|---|---|---|---|
| `/admin/aktivnost` | GET | obje, samo svoje | mw; vl (`aktivnost.autori`); popis puni `/admin/api/aktivnost` |
| `/admin/api/aktivnost/[id]` | POST | obje, samo svoje (tuđa/administracijska grupa: 403) | mw; vl (`aktivnost.vrati`, provjera prije izmjene) |
| `/admin/api/aktivnost` | GET | obje, samo svoje (bez `korisnici`/`pozivi`; `tko` iz URL-a se ignorira) | mw; vl (`aktivnost.popis`) |
| `/admin/api/app-kod` | POST | samo superadmin | mw (`rutaSamoSuperadmin`) |
| `/admin/api/generiraj` | POST | obje (AI; kvota logopeda dolazi kasnije) | mw |
| `/admin/api/kandidati` | GET | obje | mw |
| `/admin/api/nova-rijec` | POST | obje | mw |
| `/admin/api/novi-glas` | POST | obje | mw |
| `/admin/api/rijec/[id]` | POST | obje | mw |
| `/admin/api/rijec/obrisi` | POST | obje | mw |
| `/admin/api/rijeci` | POST | obje | mw |
| `/admin/api/slika/[id]` | POST | obje | mw |
| `/admin/api/slika/[id]/premjesti` | POST | obje | mw |
| `/admin/api/trazi` | GET | obje | mw |
| `/admin/api/upload` | POST | obje | mw |
| `/admin/api/zadatak/[id]` | POST (JSON spremi, form `akcija=obrisi`) | obje, samo svoje (tuđi: 404) | mw; vl (`zadaci.spremi`, `zadaci.obrisi`) |
| `/admin/api/zadatak` | POST | obje (novi zadatak je uvijek autorov) | mw; `korisnikId(email)` |
| `/admin/api/zvuk-proba` | GET, POST | samo superadmin | mw (`rutaSamoSuperadmin`) |
| `/admin/app/prijava` | GET | samo superadmin | mw (`rutaSamoSuperadmin`) |
| `/admin/biljeznice/[id]` | GET, POST (`spremi`, `generiraj`, `zvukovi`) | obje, samo svoje (tuđa: 404; u bilježnicu samo svoji zadaci) | mw; vl (`biljeznice.poId`, `biljeznice.spremi`, `zadaci.popis`) |
| `/admin/biljeznice` | GET, POST (`nova`, `bozicna`) | obje, samo svoje (popis); nova je autorova | mw; vl (`biljeznice.popis`) |
| `/admin/glas/[slug]` | GET | obje | mw |
| `/admin` (index) | GET | obje | mw |
| `/admin/korisnici` | GET, POST | samo superadmin | mw (`rutaSamoSuperadmin`) + `smije(uloga, "korisnici")` u stranici |
| `/admin/login` | GET | javno | mw `JAVNO` |
| `/admin/logout` | POST | javno | mw `JAVNO` |
| `/admin/nemas-pristup` | GET | obje (uvijek 403) | mw (rewrite) |
| `/admin/nova-rijec` | GET | obje | mw |
| `/admin/novi-glas` | GET | obje | mw |
| `/admin/passkey/login/options` | POST | javno | mw `JAVNO` |
| `/admin/passkey/login/verify` | POST | javno | mw `JAVNO` |
| `/admin/passkey/register/options` | POST | obje (svoj passkey, svježa prijava) | mw; `registerRefusal` |
| `/admin/passkey/register/verify` | POST | obje (svoj passkey) | mw |
| `/admin/passkeys` | GET, POST | obje (samo svoji ključevi: `mojiKljucevi(email)`) | mw; upit po e-mailu |
| `/admin/postavke` | GET, POST | obje (samo vlastiti `logopedski_mod`; globalnih postavki nema) | mw; upit po e-mailu |
| `/admin/pozadine` | GET | obje (301 na `/admin/situacije`) | mw |
| `/admin/poziv` | GET | javno | mw `JAVNO` |
| `/admin/poziv/options` | POST | javno | mw `JAVNO` (token pozivnice) |
| `/admin/poziv/verify` | POST | javno | mw `JAVNO` (token pozivnice) |
| `/admin/predlosci` | GET | obje | mw |
| `/admin/pregled` | GET | obje | mw |
| `/admin/prompt` | GET, POST | samo superadmin | mw (`rutaSamoSuperadmin`) |
| `/admin/red` | GET, POST | samo superadmin | mw (`rutaSamoSuperadmin`) |
| `/admin/rijec/[slug]` | GET | obje (dnevnik riječi kroz `/admin/api/aktivnost`, dakle samo svoje) | mw |
| `/admin/situacije` | GET, POST | obje | mw |
| `/admin/slika/[id]` | GET | obje | mw |
| `/admin/sso` | GET | javno | mw `JAVNO` (Cloudflare Access) |
| `/admin/zadaci/[id]/dijete` | GET, POST (nacrt) | obje, samo svoje (tuđi: 404) | mw; vl (`zadaci.zadatak`) |
| `/admin/zadaci/[id]` | GET, POST (`akcija=zvukovi`) | obje, samo svoje (tuđi: 404) | mw; vl (`zadaci.zadatak`) |
| `/admin/zadaci` | GET, POST (`obrisi`, `vrati`) | obje, samo svoje (popis, koš; tuđi `vrati`: 404; skupno brisanje samo svojih) | mw; vl (`zadaci.popis`, `obrisani`, `obrisiVise`, `vrati`) |
| `/admin/znakovi` | GET, POST | obje | mw |
| `/admin/zvuk/[id]` | GET | obje | mw |
| `/admin/zvukovi` | GET, POST | obje (poveznica na glasove skrivena logopedu) | mw |
| `/admin/zvukovi/glasovi` | GET, POST | samo superadmin | mw (`rutaSamoSuperadmin`) |
| `/api/v1/**` (15 datoteka) | razno | aplikacija: bearer token; `/api/v1/admin/*` samo uloga `admin` aplikacije (ne admin sesija) | mw `apiV1`; zadaci/bilježnice bez filtra (`popis(null)`) |

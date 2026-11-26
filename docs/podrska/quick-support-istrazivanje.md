# LogoMedo brza podrška: istraživanje

Datum: 26. 11. 2026. Samo istraživanje, ništa nije implementirano.
Oznaka **[neprovjereno]** znači da tvrdnju nisam uspio potvrditi iz izvora tijekom ovog istraživanja.

## 1. Preporuka (što prvo i zašto)

1. **Prvo jednodnevni spike, ne gradnja.** Prije bilo kakvog forka isprobati dva puta na čistom Windows 11 računalu (VM ili tuđe), kao netehnički korisnik:
   - **A. MeshCentral + MeshCentral Assistant** (0,5–1 dan). Gotovo je upravo ono što opisuješ: korisnik pokrene jedan exe s ugrađenom konfiguracijom (`.msh`), klikne "Request Help", zahtjev se pojavi u web sučelju (uz mail obavijest), korisnik dobije prozor za pristanak, a zatvaranje prozora prekida sesiju ([docs](https://docs.meshcentral.com/meshcentral/assistant/), [GitHub](https://github.com/Ylianst/MeshCentralAssistant), [blog](https://meshcentral2.blogspot.com/2021/05/meshcentral-meshcentral-assistant-and.html)). Licenca Apache 2.0. Upravljanje je u pregledniku, bez desktop klijenta. Nedostatak: poseban server (Node.js) i poseban web admin, ne naš `/admin/uprava`.
   - **B. Stock RustDesk bez forka**: preimenovani `rustdesk-host=<naš-host>,key=<naš-ključ>,.exe` plus mali launcher (vidi odjeljak 4). Koristi tvoj postojeći hbbs/hbbr i klijent koji svaki dan koristiš.
2. **Moj nagib:** ako A u spikeu prođe (AV/SmartScreen prihvatljivi, pristanak jasan), uzeti A i napraviti samo tanku vezu prema `/admin/uprava` (poveznica na MeshCentral uređaj). To je najmanje koda. Ako želiš da sve bude u LogoMedo UI-ju i na jednom relayu, ide B (launcher + stock RustDesk), ne puni fork.
3. **Puni RustDesk fork (vlastiti build, brendiranje) nije prvi korak.** Treba Flutter/Rust build, održavanje forka uz svaku verziju i AGPL obveze, a dobitak je samo ime i ikona. Smisleno tek ako B zakaže zbog UX-a.
4. **Potpisivanje exe-a je najveći UX rizik za sve opcije** i treba ga riješiti paralelno: Azure Artifact Signing je dostupan organizacijama u EU (ne fizičkim osobama izvan SAD-a/Kanade), ali SmartScreen reputacija s malo preuzimanja neće brzo narasti (odjeljak 5).
5. **Usporedno, bez daljinske radne površine:** vodič u aplikaciji i bolja detekcija za Chrome bez Google računa može smanjiti broj poziva (odjeljak 7). Jeftino i vrijedi prije svega.

## 2. Usporedna tablica

| Opcija | Trud (dani) | Trošak | UX netehničkog korisnika na Windowsu | Self-host | Model pristanka | Napomena |
|---|---|---|---|---|---|---|
| **MeshCentral + Assistant** | 0,5–1 spike, 2–3 produkcija | Server (mali VPS ili OCI) | Preuzme exe, klik "Request Help", jedan prozor za pristanak | Da | Korisnik odobrava, zatvaranje ga prekida | Web admin odvojen od LogoMedo, MeshAgent je često na AV listama [neprovjereno] |
| **RustDesk stock + preimenovani exe + launcher** | 3–5 | Postojeći relay | Preuzme exe, pokrene, klik "Prihvati" | Da | Click-to-accept (`approve-mode=click`) | Vidljivo "RustDesk" ime, bez brendinga |
| **RustDesk fork (vlastiti build)** | 8–15 + stalno održavanje | Postojeći relay, GitHub Actions | Isto kao gore, s našim imenom/ikonom | Da | Click, `conn-type=incoming` | AGPL obveze, praćenje upstreama |
| **RustDesk Server Pro, generator klijenta** | 2–4 | Basic 23,88 USD/mj (godišnje) | Kao fork, bez vlastitog builda | Da | Click, incoming only, brendiranje | Pro nema dokumentiran API za naš tok [neprovjereno], vidi 3 |
| **Chrome Remote Desktop (support)** | 0 | 0 | Treba Chrome, kod od 12 znamenki za diktiranje | Ne | Jednokratni kod, potvrda svakih 30 min | Kod se diktira, što ne želimo; generiranje koda traži Google prijavu [neprovjereno], a problem je upravo Chrome bez Google računa |
| **Windows Quick Assist** | 0 | 0 | Ugrađen u Windows 11, kod za diktiranje | Ne | Korisnik odobrava | Pomagač treba Windows i prijavu [neprovjereno]; ti si na Macu; česta meta prijevara ([Microsoft/Petri](https://petri.com/microsoft-quick-assist-tech-support-scams/)) |
| **TeamViewer QuickSupport** | 1 | Licenca Business ili viša (modul je besplatan) ([custom modules](https://teamviewer.com/en/custom-modules), [KB](https://community.teamviewer.com/English/kb/articles/3962-quicksupport)) | Dobro, ali ID se diktira ili se šalje poveznica | Ne | Korisnik odobrava | Cijena točna nije potvrđena |
| **AnyDesk custom client** | 1 | Stranica navodi 35,90 USD/mj (godišnje), treći izvori mnogo više ([anydesk.com](https://anydesk.com/pricing)) | Dobro | Ne (cloud) | Korisnik odobrava | Cijene proturječne, provjeriti uživo |
| **Stock RustDesk, poveznica/ime datoteke, bez launchera** | 0,5 | 0 | Korisnik mora tebi pročitati ID | Da | Click ili lozinka | Rješava konfiguraciju, ne rješava "ID sam stiže" |

## 3. Odgovori po pitanjima

### 3.1 Prilagodba RustDeska danas

- **Službeni generator klijenta** je dio Server Pro: u cjeniku je tek u planu **Basic (23,88 USD/mj, naplaćuje se godišnje)**, ne u Free i Individual ([cjenik](https://rustdesk.com/pricing)). Dokumentacija nudi generiranje Windows exe-a s hostom i API-jem ([FAQ](https://rustdesk.com/docs/en/self-host/rustdesk-server-pro/faq)). Starije izvore treba ponovno provjeriti zbog proturječja o tome je li Basic dovoljan.
- **Konfiguracija kroz ime datoteke** radi i na stock klijentu (Windows): `rustdesk-host=<host>,key=<javni ključ>,.exe`, a zarez prije `.exe` štiti ključ od dodatka "(1)" ([doc](https://rustdesk.com/docs/zh-cn/self-host/client-configuration), kod: [`custom_server.rs`](https://github.com/rustdesk/rustdesk/blob/master/src/custom_server.rs), parsira `host=`, `key=`, `api=`, `relay=`). Potrebni su i host i ključ. Alternativa: `rustdesk.exe --config <string>`.
- **Vlastiti build:** u službenim uputama za GitHub Actions u forku se postavljaju secreti `RENDEZVOUS_SERVER` i `RS_PUB_KEY` ([doc](https://rustdesk.com/docs/en/dev/build/all)). U izvornom kodu `hbb_common/src/config.rs` su zadane konstante `RENDEZVOUS_SERVERS` i `RS_PUB_KEY`, a `APP_NAME` je promjenjivo polje ([config.rs](https://github.com/rustdesk/hbb_common/blob/main/src/config.rs)). Vrijednosti se mogu izvući iz izgrađenog exe-a (to doc sam kaže). Točan način za ugradnju naziva i ikone u Windows build nisam provjerio **[neprovjereno]**.
- **Incoming only i zaključane opcije** postoje u kodu kao "hard settings": `conn-type=incoming` (`is_incoming_only`), `disable-installation`, `disable-settings`, `disable-ab`, `disable-account` ([config.rs](https://github.com/rustdesk/hbb_common/blob/main/src/config.rs)). Postavlja ih generator klijenta u Pro-u; u vlastitom forku se mogu zadati u kodu. U stock klijentu ih iz izvana nema načina zadati **[neprovjereno]**.
- **Načini pristanka:** `approve-mode` ima vrijednosti `click`, `password` i (zadano) `both`; `verification-method` odabire privremenu ili trajnu lozinku (`use-temporary-password`), a `temporary-password-length` duljinu ([password_security.rs](https://github.com/rustdesk/hbb_common/blob/main/src/password_security.rs)). U `connection.rs` se pri `approve_mode == Click` lozinka ne traži, nego korisnik klikne Prihvati. To je ono što želimo. Kako stock klijentu postaviti `approve-mode=click` bez Pro-a: upisom u njegov konfiguracijski TOML prije pokretanja **[neprovjereno]**.
- **Prijenosni (neinstalirani) rad:** bez instalacije nema Windows servisa pa nije moguće upravljati UAC prozorima ni zaključanim ekranom **[neprovjereno]**, ali za klikanje po Chromeu je dovoljno. Dobra strana: ne ostaje nikakva trajna veza.
- **Najmanje truda do brendiranog, samo-dolaznog exe-a s pristankom klikom:** Server Pro Basic generator (oko 2–4 dana s testiranjem, 24 USD/mj) ili vlastiti build. Bez ikakve doplate: stock exe + launcher + TOML (3–5 dana), bez brendinga.

### 3.2 Licenca (AGPL-3.0)

- RustDesk je AGPL-3.0 ([LICENCE](https://github.com/rustdesk/rustdesk/blob/master/LICENCE)). Za izmijenjen i distribuiran exe obveze su: (1) čitav odgovarajući izvorni kod izmjene mora biti ponuđen svakome kome dajemo exe (javni fork ili poveznica u exe-u i na stranici preuzimanja), (2) zadržati AGPL i obavijesti o autorskim pravima, (3) označiti da je izmijenjeno, (4) pod AGPL-om isto vrijedi za mrežni pristup. Ovo je opće znanje o AGPL-u, nije pravni savjet **[neprovjereno za naš slučaj]**.
- Samo omotavanje neizmijenjenog `rustdesk.exe` u launcher je zasebni program, ali ga svejedno distribuiramo, pa treba priložiti obavijest i poveznicu na izvorni kod verzije koju dajemo.
- **Zaštitni znak:** nisam pronašao službenu politiku o imenu i logotipu RustDesk **[neprovjereno]**. Pravilo za AGPL forkove (npr. HopToDesk) je preimenovati i zamijeniti logotip ([NLnet](https://NLnet.nl/NGI0/bestpractices/Forking_and_Trademarks.pdf), općenito). Za naš proizvod: ime "LogoMedo brza podrška", bez RustDeskova logotipa, uz tekst "temeljeno na RustDesku (AGPL-3.0)".

### 3.3 Integracija s adminom (kako ID dođe do nas)

Osnovni tok (RustDesk varijanta B):

1. Korisnik pokrene `LogoMedo-podrska.exe` (launcher, vlastiti program, npr. Rust/Go ili Tauri; unutra je `rustdesk.exe`).
2. Launcher rasporedi stock klijent u privremenu mapu, upiše konfiguraciju (server, ključ, `approve-mode=click`) i pokrene ga.
3. Launcher dobije ID: `rustdesk.exe --get-id` ispisuje ID ([core_main.rs](https://github.com/rustdesk/rustdesk/blob/master/src/core_main.rs)). Radi li to za neinstaliranu instancu ili traži pokrenut `--server`: **[neprovjereno]**; rezervno čitanje iz konfiguracijskog filea (`RustDesk.toml`, polje `id`) **[neprovjereno]**.
4. Launcher šalje `POST https://logomedo.com/api/podrska/zahtjev` s `{ rustdeskId, verzija, kratki jednokratni kod }`. Kod prikaže korisniku ("Vaš kod: 4821") da ga može tebi reći ako se javlja telefonom, ili je poveznica za preuzimanje već vezana uz zahtjev (vidi dolje).
5. Naš API upiše redak u D1 (`podrska_zahtjevi`: id, rustdesk_id, kod_hash, status, created_at, expires_at, ip_hash, korisnik_id nullable) i obavijesti superadmina (mail ili push, već postoji obavijesni sustav angažmana).
6. Superadmin u `/admin/uprava/podrska` vidi zahtjev i klikne "Spoji se". Mi tada otvaramo desktop RustDesk s ID-jem. Deep link `rustdesk://…` postoji u klijentu (`send_url_scheme` u [core_main.rs](https://github.com/rustdesk/rustdesk/blob/master/src/core_main.rs)), točan oblik URL-a **[neprovjereno]**, pa je rezervno gumb "Kopiraj ID".
7. Korisnik vidi prozor "LogoMedo podrška želi pristup" i klikne Prihvati. Time sesija počinje. Zatvaranjem launchera sve prestaje.

Ostale opcije:

- **Server Pro API/adresar:** Pro ima web konzolu, adresar, audit logove i API tokene ([audit](https://rustdesk.com/docs/en/self-host/rustdesk-server-pro/audit-logs/)), ali nisam našao službenu dokumentaciju REST API-ja za popis uređaja **[neprovjereno]**. Treće strane (npr. CortenDesk, rdpanel) rade slično, ali nisu službene.
- **Open-source hbbs/hbbr:** nema API-ja ni popisa uređaja; ID se mora prenijeti drugim putem (naš launcher).
- **Web klijent:** u Pro-u je integriran tek kad (korisnici × 10) + uređaji ≥ 400, što Basic (10 korisnika, 100 uređaja) ne ispunjava ([cjenik/FAQ](https://rustdesk.com/pricing)). Za nas nije potreban, desktop klijent je dovoljan.
- **Zlouporaba i spam:** (a) zahtjev je koristan samo uz kratki kod koji prikazuje exe i koji je vezan uz poveznicu za preuzimanje (preuzimanje samo iz prijavljenog računa, generira se po korisniku), (b) ograničenje stope po IP-u i po računu (Cloudflare rate limiting ili brojač u D1, npr. 3 zahtjeva/sat), (c) Turnstile na samoj stranici preuzimanja (ne na API-ju exe-a), (d) zahtjev istječe za 15 min, (e) superadmin vidi samo zahtjeve s valjanim kodom i može ga odbaciti, (f) sam ID nije tajan, ali bez pristanka na strani korisnika ne daje ništa. Lažni zahtjev ne daje napadaču pristup, najviše šum u listi.
- **Sigurnost "nije backdoor":** prijenosni klijent bez instalacije i bez servisa, `approve-mode=click`, bez trajne lozinke, bez automatskog pokretanja, exe se ne može pokrenuti sam od sebe. Kad se prozor zatvori, nema ničega što sluša. Isto vrijedi za Assistant.

### 3.4 Samostalni relay (hbbs/hbbr)

- Portovi: TCP 21115–21119 i UDP 21116 (21118 i 21119 su WebSocket za web klijent i nisu potrebni ako se ne koristi) ([docs](https://rustdesk.com/docs/en/self-host/rustdesk-server-oss/install/)).
- Resursi su minimalni, relay prometa 30 KB/s–3 MB/s po sesiji, može i Raspberry Pi. Docker slike postoje za `amd64`, `arm64` i `arm` ([Docker Hub](https://hub.docker.com/r/rustdesk/rustdesk-server)), pa OCI ARM VM radi.
- **Cloudflare ne proxyja ove portove** (običan proxy je samo HTTP(S)); za TCP/UDP treba Spectrum (Enterprise ili plaćeni dodatak) **[neprovjereno za trenutni cjenik]**. Zato `hbbs.logomedo.com` mora biti **DNS only** (siva oblačić) i pokazivati izravno na VM.
- Ti već imaš privatni hbbs/hbbr, pa ovo ne košta ništa novo. Ako to nije taj isti server koji već držiš za klijente, bolje odvojeno od vlastitih sesija.
- Server Pro nije potreban ni za jednu stvar koju trebamo, osim generatora klijenta/brendiranja.

## 4. Minimalna MVP arhitektura (preporučeni put)

Bez obzira na A ili B, ovo je okvir. Procjena u radnim danima.

**Varijanta B (RustDesk stock + launcher):**

| Korak | Komponenta | Dani |
|---|---|---|
| 1 | Spike: preimenovani stock exe na čistom Windowsu, provjera `--get-id`, `approve-mode=click` kroz konfiguraciju, prijenosni rad | 1 |
| 2 | Launcher (Rust/Go): raspakira, konfigurira, pokreće, dohvaća ID, prikazuje kod, POST | 1,5 |
| 3 | D1 migracija `podrska_zahtjevi`, API `/api/podrska/zahtjev`, `/api/podrska/zatvori`, rate limit | 1 |
| 4 | `/admin/uprava/podrska`: popis, gumb Spoji se (deep link ili kopiraj ID), istek, obavijest | 1 |
| 5 | Potpisivanje (Azure Artifact Signing, CI), stranica preuzimanja s uputom za SmartScreen | 1–2 (+ čekanje validacije 1–30 radnih dana) |
| 6 | AGPL obavijest, izvorni kod ponuđen, test s 2–3 pravim terapeutima | 0,5 |

Ukupno oko 6–8 dana rada, plus čekanje na validaciju identiteta.

**Varijanta A (MeshCentral):** server na VM-u (0,5), `.msh` + Assistant exe (0,5), poveznica iz `/admin/uprava` i mail obavijesti (1), potpisivanje (1–2), test (0,5): oko 3–4 dana.

**Trajni troškovi:**
- Relay VM: 0 ako ide na postojeći OCI Always Free ARM; inače oko 4–6 EUR/mj [neprovjereno].
- Potpisivanje: Azure Artifact Signing, cijene na stranici su u dohvaćenom izvoru prazne ("$-"), tiers Basic (5.000 potpisa/mj) i Premium (100.000) ([pricing](https://azure.microsoft.com/pricing/details/artifact-signing/)); iznos ne mogu potvrditi **[neprovjereno]**. Alternativa OV certifikat, 150–300 USD/god ([Microsoft](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options)).
- RustDesk Pro Basic samo ako želiš generator: 23,88 USD/mj.
- Održavanje: ažuriranje bundleanog `rustdesk.exe` (ili Assistanta) pri sigurnosnim ispravcima.

## 5. Windows distribucija: SmartScreen, Defender, AV

- **Azure Artifact Signing** (prije Trusted Signing): javno pouzdani certifikati dostupni su **organizacijama** u SAD-u, Kanadi, EU, UK, Australiji, NZ, Japanu, J. Koreji, Singapuru, Švicarskoj, Norveškoj i Izraelu; **fizičke osobe samo iz SAD-a i Kanade** ([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). Treba plaćena Azure pretplata (ne probna) ([FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)). Validacija organizacije traje 1–30 radnih dana, potrebni su poslovni identifikator, domena i mail na toj domeni. Dakle potpisuje se na tvrtku (ITalk d.o.o. ili D.O.M.), ne na tebe kao osobu. Ne izdaje EV certifikate.
- **Reputacija SmartScreena** gradi se automatski po broju preuzimanja datoteke, i za OV i za EV; EV više ne daje trenutnu reputaciju od 2024. ([Microsoft FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq), sažeci: [Microsoft code signing options](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options)). Koliko dugo: Microsoft ne navodi broj. Realno za nas: malen broj preuzimanja znači da će upozorenje "Windows je zaštitio vaše računalo" **vjerojatno ostati** i uz potpis, ali će pisati naše ime izdavača umjesto "Nepoznati izdavač" **[neprovjereno]**. Uputa na stranici s dva klika ("Više informacija", "Svejedno pokreni") je obvezna.
- **Antivirus:** alati za daljinski pristup često završe kao PUA/RAT. Za RustDesk to nisam uspio potvrditi iz dohvaćenih izvora (RustDeskov blog o AV skeniranju govori samo o tome da AV sandboxi pokrenu nepoznate binarne datoteke i registriraju nepoznate uređaje ([blog](https://rustdesk.com/blog/rustdesk-unknown-devices-antivirus-scanning))). Općenito je poznato da su ovakvi alati česti lažni pozitivi **[neprovjereno]**. Obvezno testirati: VirusTotal, Windows Defender na čistom računalu, najčešći AV kod terapeuta. Za slučaj lažnog pozitiva poslati uzorak na [Microsoft WDSI](https://www.microsoft.com/wdsi/filesubmission).
- **Chrome pri preuzimanju** može označiti rijetko preuzimanu .exe kao "nije često preuzimano" **[neprovjereno]**. Alternativa: preuzimanje kroz isti prijavljeni račun, ili .zip/MSI potpisan istim certifikatom.

## 6. Poštena procjena alternativa

- **MeshCentral + Assistant.** Prednosti: gotov tok zahtjeva, web admin, upravljanje preko preglednika (Mac), bez desktop klijenta, ugrađeni pristanak, Apache 2.0 ([GitHub](https://github.com/Ylianst/MeshCentralAssistant)), `.msh` ugrađen u preuzeti exe (nema unosa kodova) ([blog](https://meshcentral2.blogspot.com/2021/05/meshcentral-meshcentral-assistant-and.html)). Nedostaci: dodatni server i održavanje, odvojeno sučelje, Assistant dopušta samo jednu instancu po uređaju, samoažuriranje traži odobrenje korisnika. Može li radni tok "samo zahtjev, bez trajnog agenta" ostati točno bez trajne instalacije agenta: **[neprovjereno]**, to je prvo što testirati u spikeu. Odgovara li MeshAgent kriteriju "nikad backdoor": moramo ručno provjeriti da po zatvaranju Assistanta nema procesa ni servisa.
- **Chrome Remote Desktop (podrška).** Samo Chrome i jednokratni kod ([Google](https://support.google.com/chrome/answer/1649523)); kod vrijedi 5 min prema trećim izvorima ([UCI](https://sites.socsci.uci.edu/~cndavis/remote/pc-support.htm)), potvrda dijeljenja svakih 30 min. Ali korisnik mora diktirati kod, a generiranje koda traži Google račun **[neprovjereno]**, što je baš ono što nedostaje korisniku. Nije rješenje za ovaj problem.
- **Quick Assist.** Ugrađen, besplatan. Pomagač treba Windows i prijavu (Microsoft račun) **[neprovjereno]**; ti si na Macu. Microsoft aktivno upozorava i blokira sumnjive pokušaje jer ga zlorabe prevaranti ([Petri](https://petri.com/microsoft-quick-assist-tech-support-scams/), [Windows Central](https://www.windowscentral.com/software-apps/microsoft-warns-quick-assist-could-expose-users-to-scams)); korisnik neće razlikovati nas od prevaranta. Kod se i dalje diktira.
- **TeamViewer QuickSupport / AnyDesk custom client.** Najgladi UX, ali licenca (TeamViewer Business+, AnyDesk oko 36 USD/mj prema njihovoj stranici), nisu self-host, i nemaju tok "zahtjev ulazi u naš admin" bez posebne integracije. Imaju već potpisane exe-ove s ugrađenom reputacijom, što je njihov najveći plus u odnosu na našu varijantu.
- **Stock RustDesk s preimenovanim exe-om, bez launchera.** Rješava konfiguraciju (nema unosa servera i ključa), ali ID korisnik opet mora pročitati.

## 7. Kratki kut bez daljinske radne površine (passkey)

- `PublicKeyCredential.getClientCapabilities()` dostupan je u Chromeu 133, Edgeu 133, Firefoxu 135 i Safariju 17.4; vraća što preglednik **može** (npr. `userVerifyingPlatformAuthenticator`, `hybridTransport`, `passkeyPlatformAuthenticator`, `conditionalCreate`) ([web.dev](https://web.dev/articles/webauthn-client-capabilities)). Ne govori **koji** upravitelj lozinki je aktivan niti je li Chrome prijavljen u Google račun.
- Zato nije pouzdano otkriti "Chrome bez Google računa". Možemo posredno: ako `userVerifyingPlatformAuthenticator` je true, a nakon `create()` stranica vidi `authenticatorAttachment === "platform"` i prijenosi (`getTransports()`) ne sadrže `hybrid`, vjerojatno je samo Windows Hello (lokalni, ne sinkronizira se) **[neprovjereno kao pouzdana heuristika]**.
- Praktično: na stranici prije registracije jasna kartica s koracima i slikama ("1. Otvorite chrome://settings, 2. Prijavite se u Google račun, 3. Uključite sinkronizaciju lozinki") i pitanje "Jeste li prijavljeni u Chrome? (slika profila u kutu)". Nakon registracije prikazati koji je tip pristupnog ključa nastao i ponuditi dodavanje drugog uređaja ili rezervnog načina.

## 8. Rizici

1. **SmartScreen/Chrome/AV upozorenja** mogu srušiti povjerenje terapeuta prije nego klikne. Mitigacija: potpis, snimka zaslona uputa, test na realnim računalima.
2. **Percepcija kao "prevara s daljinskim pristupom"**. Mitigacija: preuzimanje samo iz prijavljenog računa, jasni tekst "LogoMedo vas nikad neće tražiti ovo preuzimanje bez prethodnog dogovora", ime i domena izdavača.
3. **AGPL usklađenost** (izvorni kod uz svaku distribuciju). Mitigacija: javni repo s launcherom i build skriptom.
4. **Održavanje:** nova verzija RustDeska ili MeshAgenta mijenja ponašanje; moramo prikvačiti verziju i testirati prije ažuriranja.
5. **Relay otkriva ID-jeve i metapodatke** (ne i sadržaj sesije, enkriptirano s našim ključem). Server mora biti zakrpan i ograničen vatrozidom.
6. **Prijenosni klijent ne vidi UAC/zaključani ekran**, pa neke pomoći (instalacija, administratorski prozori) neće raditi **[neprovjereno]**.
7. **GDPR:** zaslon korisnika može sadržavati osobne podatke djece/klijenata terapeuta. Pomoć se mora dogovoriti unaprijed, korisnik mora vidjeti prozor, sesija se bilježi u audit (tko, kad, trajanje), bez snimanja zaslona.
8. **Cloudflare ne proxyja** relay portove, pa je IP servera javan; koristiti zaseban ime i bez veze s glavnom domenom.

## 9. Otvorena pitanja za tebe

1. Je li cilj ime "LogoMedo" na prozoru jer to koristi korisnik, ili je dovoljan stock RustDesk (puno manje truda)?
2. Koja tvrtka bi bila potpisnik (ITalk d.o.o. ili D.O.M.)? Artifact Signing za tu tvrtku traži poslovni mail na njezinoj domeni i do 30 radnih dana validacije.
3. Treba li zahtjev nužno biti u `/admin/uprava`, ili je dovoljna MeshCentral web konzola s poveznicom?
4. Što je prihvatljivo kao pristanak: jedan klik "Prihvati" ili i kod koji korisnik čita naglas?
5. Hoće li terapeuti ikad trebati pomoć s administratorskim pravima (UAC), ili samo klikanje u Chromeu?
6. Tvoj postojeći hbbs/hbbr: je li izložen na internetu s DNS-om izvan Cloudflarea, i želiš li ga dijeliti sa spikeom ili dignuti zaseban?
7. Smijem li u spikeu napraviti račun na Azureu i pokrenuti MeshCentral na OCI ARM VM-u (treba tvoj OK za svaki trošak)?
8. Koji je prag za odustajanje od vlastitog exe-a ako SmartScreen svejedno pokazuje upozorenje (npr. vratiti se na TeamViewer QuickSupport uz plaćanje licence)?

## 10. Popis izvora

- RustDesk cjenik: https://rustdesk.com/pricing
- RustDesk konfiguracija klijenta: https://rustdesk.com/docs/zh-cn/self-host/client-configuration
- RustDesk build s GitHub Actions: https://rustdesk.com/docs/en/dev/build/all
- RustDesk OSS server: https://rustdesk.com/docs/en/self-host/rustdesk-server-oss/install/
- RustDesk Pro FAQ: https://rustdesk.com/docs/en/self-host/rustdesk-server-pro/faq
- Izvorni kod (čitani retci): https://github.com/rustdesk/rustdesk/blob/master/src/custom_server.rs, https://github.com/rustdesk/rustdesk/blob/master/src/core_main.rs, https://github.com/rustdesk/hbb_common/blob/main/src/config.rs, https://github.com/rustdesk/hbb_common/blob/main/src/password_security.rs
- Azure Artifact Signing: https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart i https://learn.microsoft.com/en-us/azure/artifact-signing/faq, cijene https://azure.microsoft.com/pricing/details/artifact-signing/
- Microsoft o opcijama potpisivanja: https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options
- MeshCentral Assistant: https://docs.meshcentral.com/meshcentral/assistant/ , https://github.com/Ylianst/MeshCentralAssistant
- Chrome Remote Desktop: https://support.google.com/chrome/answer/1649523
- TeamViewer: https://teamviewer.com/en/custom-modules ; AnyDesk: https://anydesk.com/pricing
- WebAuthn getClientCapabilities: https://web.dev/articles/webauthn-client-capabilities

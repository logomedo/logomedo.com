// Božićne i zimske riječi (rukom pisani popisi, 31. 10. 2026.): abecedni popis za božićnu
// vježbenicu i popis riječi s 3 i 4 glasa (glasovna analiza). Riječi su opće i služe i
// drugim zadacima, pa je opis za sliku uobičajeno značenje, ne nužno božićno.
//
//   node scripts/seed-bozic.ts > migrations/0006_rijeci_bozic.sql
//
// Postojeća riječ zadržava svoj opis (COALESCE) i aktivira se. Veze riječ–glas su izvedene
// iz pravopisa (potvrdeno = 0), kao za nove riječi u seed-katalog.ts.
import { pojave, slug } from "../src/lib/fonemi.ts";

const OPIS: Record<string, string> = {
  // ---- Abecedni popis ----
  "anđeo": "a Christmas angel with wings and a halo",
  auto: "a small family car",
  bubanj: "a toy drum with two drumsticks",
  bor: "a decorated Christmas fir tree",
  bomboni: "a few colorful wrapped candies",
  crkva: "a small church with a bell tower",
  cimet: "a few cinnamon sticks",
  cvijet: "a single flower in bloom",
  "čarapa": "a sock (a striped Christmas stocking)",
  "čizmice": "a pair of small children's winter boots",
  "čestitka": "a folded Christmas greeting card",
  "češer": "a pine cone",
  "ćup": "an old earthenware clay jug with a handle",
  "ćuk": "a small scops owl",
  dar: "a wrapped gift box with a ribbon bow",
  "džemper": "a knitted winter sweater",
  "džip": "an off-road jeep",
  "đumbirko": "a gingerbread man cookie",
  eskim: "an Inuit child in a fur-hooded parka",
  fenjer: "an old lantern with a lit candle inside",
  fritule: "Croatian fritule: small round fried dough balls dusted with powdered sugar, on a plate",
  grad: "a small city with several houses and buildings",
  grana: "a fir tree branch",
  haljina: "a girl's dress",
  "hlače": "a pair of trousers",
  isus: "baby Jesus lying in a manger with straw",
  iglu: "an igloo made of snow blocks",
  "igračke": "a pile of toys: a teddy bear, a ball and building blocks",
  imela: "a sprig of mistletoe with white berries",
  jaslice: "a Christmas nativity scene: Mary, Joseph and baby Jesus in a stable",
  jelen: "a deer with antlers",
  kralj: "a king with a golden crown",
  kamin: "a fireplace with a burning fire",
  koliba: "a small wooden cabin",
  kapa: "a knitted winter hat with a pompom",
  "kolač": "a slice of cake",
  kuglice: "shiny Christmas tree baubles",
  lizalica: "a round swirl lollipop",
  lampica: "a single colorful Christmas light bulb on a wire",
  ljuska: "an empty cracked walnut shell",
  ljudi: "a group of people standing together: adults and children",
  ljubav: "a big red heart, the symbol of love",
  "mašna": "a red ribbon bow",
  medenjak: "a heart-shaped honey gingerbread cookie decorated with icing",
  "noć": "a night sky with a crescent moon and stars",
  nikola: "Saint Nicholas: a kind bishop with a white beard, red robe, mitre and staff",
  "njuška": "a dog's snout (nose and mouth) close up",
  obitelj: "a family: mother, father and two children",
  "orašar": "a wooden nutcracker soldier figure",
  pahuljica: "a single snowflake",
  "pšenica": "Christmas wheat: young green wheat sprouts in a small pot tied with a red, white and blue ribbon",
  rukavice: "a pair of knitted winter mittens",
  rudolf: "a reindeer with a shiny red nose",
  "snjegović": "a snowman with a carrot nose, a hat and a scarf",
  sob: "a reindeer",
  sanjke: "a wooden sled",
  skije: "a pair of skis with ski poles",
  "šal": "a knitted winter scarf",
  "šalica": "a mug with a handle",
  "štalica": "a small wooden stable with straw",
  truba: "a trumpet",
  torta: "a whole round layered cake",
  tanjur: "an empty plate",
  ukrasi: "Christmas tree decorations: baubles, a star and tinsel",
  vijenac: "an Advent wreath of fir branches with four candles",
  vuna: "a ball of wool yarn",
  vrata: "a wooden front door",
  vlak: "a toy train with wagons",
  vilenjak: "a Christmas elf with pointed ears and a green hat",
  zvijezda: "a golden star",
  "zvončić": "a small golden bell with a ribbon",
  zbor: "a children's choir singing together",
  "žir": "an acorn",
  "žarulja": "a light bulb",
  // ---- Riječi s 3 glasa ----
  led: "a block of ice",
  bal: "a couple dancing at a formal ball",
  put: "a country road winding into the distance",
  "peć": "an old wood-burning stove",
  dim: "smoke rising from a chimney",
  sag: "a patterned rug",
  nar: "a pomegranate",
  pas: "a dog",
  vuk: "a wolf",
  "miš": "a mouse",
  ris: "a lynx",
  "koš": "a wicker basket",
  konj: "a horse",
  "puž": "a snail",
  zec: "a rabbit",
  // ---- Riječi s 4 glasa ----
  siga: "an icicle",
  "kuća": "a house",
  ovca: "a sheep",
  stol: "a wooden table",
  djed: "a grandfather with grey hair and glasses",
  trag: "footprints in the snow",
  srce: "a red heart",
  sova: "an owl",
  "šapa": "a dog's paw",
  "šuma": "a forest",
  zima: "a snowy winter landscape",
  orah: "a walnut",
  most: "a bridge over a river",
  krov: "a house roof",
};

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const GLASOVI = ["C", "S", "Z", "Č", "Š", "Ž", "L", "R"];
const out = [
  "-- Božićne i zimske riječi s opisom za sliku (scripts/seed-bozic.ts; ne uređivati ručno).",
  "-- Postojeća riječ zadržava svoj opis; veze riječ–glas su izvedene iz pravopisa.",
];
let veza = 0;
for (const r of Object.keys(OPIS).sort((a, b) => a.localeCompare(b, "hr"))) {
  out.push(
    `INSERT INTO rijeci (rijec, slug, opis_za_sliku, izvor) VALUES (${q(r)}, ${q(slug(r))}, ${q(OPIS[r])}, 'admin') ` +
      `ON CONFLICT(rijec) DO UPDATE SET aktivna = 1, opis_za_sliku = COALESCE(rijeci.opis_za_sliku, excluded.opis_za_sliku);`,
  );
  for (const p of pojave(r, GLASOVI, ["R"])) {
    out.push(
      `INSERT OR IGNORE INTO rijec_glas (rijec_id, glas_id, pozicija, potvrdeno) SELECT r.id, g.id, ${q(p.pozicija)}, 0 FROM rijeci r, glasovi g WHERE r.rijec = ${q(r)} AND g.oznaka = ${q(p.glas)};`,
    );
    veza++;
  }
}
console.log(out.join("\n"));
console.error(`${Object.keys(OPIS).length} riječi, ${veza} veza riječ–glas`);

import pigeonRacer from "@/assets/pigeon-racer.jpg";
import pigeonFantail from "@/assets/pigeon-fantail.jpg";
import chickenNoiler from "@/assets/chicken-noiler.jpg";
import dogBoerboel from "@/assets/dog-boerboel.jpg";

export const ADMIN_OPAY = "08139049440";
export const ADMIN_WHATSAPP = "2348139049440";
export const LISTING_LIFESPAN_DAYS = 7;
export const AUTO_RELEASE_HOURS = 48;
export const PAGE_SIZE = 15;

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const;

export type Category = "Pigeon" | "Chicken" | "Dog" | "Horse";

export const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "Pigeon", label: "Pigeons (Flagship)" },
  { value: "Chicken", label: "Chickens" },
  { value: "Dog", label: "Dogs" },
  { value: "Horse", label: "Horses" },
];

export const BREEDS_BY_CATEGORY: Record<Category, string[]> = {
  Pigeon: [
    "Racing Homer",
    "Pakistani High-Flyer",
    "Tipler High-Flyer",
    "Fantail (Ornamental)",
    "Jacobin (Ornamental)",
    "Pouter (Ornamental)",
    "Tumbler",
    "Local Cross / Mixed Breed",
  ],
  Chicken: ["Noiler", "Local Yoruba Chicken", "Agricultural Broiler", "Cockerel", "Frizzle"],
  Dog: [
    "Caucasian Shepherd",
    "Boerboel",
    "German Shepherd (Alsatian)",
    "Rotweiler",
    "Local Bashorun / Mongrel",
  ],
  Horse: ["Local Northern Pony", "Sudanese Sudanour", "Arabian Thoroughbred Cross"],
};

export const QUICK_INQUIRIES = [
  "Is delivery to my state park available?",
  "Request current pedigree confirmation",
  "What is the exact age of this animal?",
  "Can the breeder arrange a trusted logistics driver?",
];

export const TERMS_TEXT =
  "I agree to the PigeonShield Nigeria Terms of Service, including the strict 7-day listing expiration rule, the instant manual confirmation escrow validation framework, and understand that platform commission rates are variable and set dynamically by the administrator. I understand that sharing personal contact information (like phone numbers or WhatsApp links) in public chats to bypass platform transaction fees results in immediate account termination and freezing of active funds.";

export type DisputeStatus =
  | "None"
  | "Faulty Bird"
  | "Under Review: Proof Submitted"
  | "Disputed: Dead on Arrival";

export type TxStatus =
  | "Escrow Funded"
  | "In Transit"
  | "Completed"
  | "Refunded to Buyer"
  | "Disputed";

export interface NigerianUser {
  id: string;
  real_name: string;
  email: string;
  password: string;
  phone_number: string;
  public_handle: string;
  home_state: string;
  bank_name: string;
  account_number: string;
  is_online: boolean;
  is_banned: boolean;
  created_at: number;
}

export interface PedigreeNode {
  name: string;
  breed: string;
}

export interface Pedigree {
  generation_1: PedigreeNode;
  generation_2: { sire: PedigreeNode; dam: PedigreeNode };
  generation_3: { paternal: PedigreeNode; maternal: PedigreeNode };
}

export interface Listing {
  id: string;
  category_type: Category;
  breeder_id: string;
  breeder_handle: string;
  custom_bird_name: string;
  breed_type: string;
  gender: "Male" | "Female" | "Pair";
  price_ngn: number;
  images: string[];
  pedigree_json: Pedigree | null;
  vaccinated: boolean;
  state: string;
  description: string;
  batch_quantity: number;
  commission_override: number | null;
  is_active: boolean;
  is_featured?: boolean;
  is_verified_seller?: boolean;
  creation_timestamp: number;
  expiry_date: number;
}

export interface EscrowTransaction {
  id: string;
  listing_id: string;
  listing_name: string;
  buyer_id: string;
  breeder_id: string;
  amount_naira: number;
  calculated_commission: number;
  pickup_passcode: string;
  delivery_marked_at: number;
  auto_release_at: number;
  driver_phone: string | null;
  waybill_image_url: string | null;
  proof_file_name: string | null;
  dispute_status: DisputeStatus;
  status: TxStatus;
  created_at: number;
}

export interface ChatMessage {
  id: string;
  listing_id: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: number;
}

export const DAY_MS = 86_400_000;

export function ngn(amount: number) {
  return "₦" + Math.round(amount).toLocaleString("en-NG");
}

let idCounter = 0;
export function uid(prefix: string) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter}${Math.floor(Math.random() * 1000)}`;
}

export function makeHandle() {
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  return `Verified Breeder #${digits}`;
}

export function makePasscode() {
  return "PS-" + String(Math.floor(1000 + Math.random() * 9000));
}

export function maskPhone(phone: string) {
  return phone.slice(0, 4) + "*****" + phone.slice(-2);
}

export function daysRemaining(expiry: number) {
  return Math.max(0, Math.ceil((expiry - Date.now()) / DAY_MS));
}

export function isVisible(l: Listing) {
  return l.is_active && l.expiry_date > Date.now() && l.batch_quantity > 0;
}

export function categoryImage(c: Category) {
  return c === "Pigeon" ? pigeonRacer : c === "Chicken" ? chickenNoiler : c === "Dog" ? dogBoerboel : null;
}

function pedigree(name: string, breed: string): Pedigree {
  return {
    generation_1: { name, breed },
    generation_2: {
      sire: { name: `${name} Sire`, breed },
      dam: { name: `${name} Dam`, breed },
    },
    generation_3: {
      paternal: { name: `${name} Grand-Sire`, breed },
      maternal: { name: `${name} Grand-Dam`, breed },
    },
  };
}

export interface DBState {
  users: NigerianUser[];
  listings: Listing[];
  transactions: EscrowTransaction[];
  messages: ChatMessage[];
  commission_pct: number;
  current_user_id: string | null;
  jwt: string | null;
}

const SEED_USERS: NigerianUser[] = [
  {
    id: "usr_musa",
    real_name: "Musa Ibrahim Danladi",
    email: "musa@example.ng",
    password: "demo1234",
    phone_number: "08031234567",
    public_handle: "Verified Breeder #481203",
    home_state: "Kano",
    bank_name: "OPay",
    account_number: "8031234567",
    is_online: true,
    is_banned: false,
    created_at: Date.now() - 40 * DAY_MS,
  },
  {
    id: "usr_chidi",
    real_name: "Chidi Okonkwo",
    email: "chidi@example.ng",
    password: "demo1234",
    phone_number: "08127654321",
    public_handle: "Verified Breeder #772910",
    home_state: "Enugu",
    bank_name: "GTBank",
    account_number: "0123456789",
    is_online: false,
    is_banned: false,
    created_at: Date.now() - 30 * DAY_MS,
  },
  {
    id: "usr_tayo",
    real_name: "Tayo Adebayo",
    email: "tayo@example.ng",
    password: "demo1234",
    phone_number: "07098765432",
    public_handle: "Verified Breeder #310884",
    home_state: "Lagos",
    bank_name: "Moniepoint",
    account_number: "7098765432",
    is_online: true,
    is_banned: false,
    created_at: Date.now() - 12 * DAY_MS,
  },
];

const PIGEON_NAMES = [
  "Musa Line Champion", "Red Checker King", "Kano Sky Sultan", "Aba Blue Bar Ace",
  "Sokoto Silver Wing", "Ilorin Night Flyer", "Jos Plateau Racer", "Ibadan Dark Velvet",
  "Zaria Grizzle Prince", "Enugu White Crest", "Benue Storm Homer", "Lagos Coastal Ace",
  "Kaduna Golden Eye", "Owerri Pearl Fantail", "Yola Desert Tumbler", "Abuja Royal Pouter",
  "Onitsha Mealy Hen", "Katsina Iron Beak",
];

function seedListings(): Listing[] {
  const out: Listing[] = [];
  const breeders = SEED_USERS;
  PIGEON_NAMES.forEach((name, i) => {
    const breed = BREEDS_BY_CATEGORY.Pigeon[i % BREEDS_BY_CATEGORY.Pigeon.length]!;
    const owner = breeders[i % breeders.length]!;
    const created = Date.now() - (i % 6) * DAY_MS;
    out.push({
      id: `lst_pg_${i}`,
      category_type: "Pigeon",
      breeder_id: owner.id,
      breeder_handle: owner.public_handle,
      custom_bird_name: name,
      breed_type: breed,
      gender: i % 3 === 0 ? "Pair" : i % 2 === 0 ? "Male" : "Female",
      price_ngn: 45000 + (i % 9) * 27500,
      images: i % 2 === 0 ? [pigeonRacer] : i % 3 === 0 ? [pigeonFantail] : [],
      pedigree_json: pedigree(name, breed),
      vaccinated: true,
      state: NIGERIAN_STATES[(i * 3) % NIGERIAN_STATES.length]!,
      description:
        "Loft-raised, fully feathered and flight tested. Escrow protected with 2FA pickup passcode verification.",
      batch_quantity: 1 + (i % 4),
      commission_override: null,
      is_active: true,
      creation_timestamp: created,
      expiry_date: created + LISTING_LIFESPAN_DAYS * DAY_MS,
    });
  });

  const others: Array<[Category, string, string, number, string | null]> = [
    ["Chicken", "Noiler Layer Batch A", "Noiler", 9500, chickenNoiler],
    ["Chicken", "Yoruba Native Hen", "Local Yoruba Chicken", 14000, null],
    ["Chicken", "Frizzle Show Cock", "Frizzle", 21000, null],
    ["Dog", "Boerboel Guard Male", "Boerboel", 480000, dogBoerboel],
    ["Dog", "Caucasian Shepherd Pup", "Caucasian Shepherd", 950000, null],
    ["Dog", "Alsatian Trained Male", "German Shepherd (Alsatian)", 610000, null],
    ["Horse", "Northern Pony Gelding", "Local Northern Pony", 1450000, null],
    ["Horse", "Sudanour Stallion", "Sudanese Sudanour", 3200000, null],
  ];
  others.forEach(([cat, name, breed, price, img], i) => {
    const owner = breeders[i % breeders.length]!;
    const created = Date.now() - (i % 5) * DAY_MS;
    out.push({
      id: `lst_ot_${i}`,
      category_type: cat,
      breeder_id: owner.id,
      breeder_handle: owner.public_handle,
      custom_bird_name: name,
      breed_type: breed,
      gender: i % 2 === 0 ? "Male" : "Female",
      price_ngn: price,
      images: img ? [img] : [],
      pedigree_json: null,
      vaccinated: cat === "Dog",
      state: NIGERIAN_STATES[(i * 5) % NIGERIAN_STATES.length]!,
      description: "Healthy, farm inspected and escrow protected. Delivery arranged with vetted logistics.",
      batch_quantity: 1 + (i % 3),
      commission_override: null,
      is_active: true,
      creation_timestamp: created,
      expiry_date: created + LISTING_LIFESPAN_DAYS * DAY_MS,
    });
  });
  return out;
}

export function seedState(): DBState {
  return {
    users: SEED_USERS,
    listings: seedListings(),
    transactions: [],
    messages: [],
    commission_pct: 7,
    current_user_id: null,
    jwt: null,
  };
}

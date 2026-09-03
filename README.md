# PigeonShield Marketplace

Role: Expert Full-Stack Web Engineer & UI/UX Designer

Project: "PigeonShield Nigeria" — A secure, production-ready, highly premium and responsive desktop & mobile web application for an anonymous Nigerian livestock marketplace. The platform is strictly focused on Pigeons as its primary flagship asset but seamlessly supports secondary agricultural categories (Chickens, Dogs, Horses) while retaining its premium brand identity. It features a delivery-fraud proof escrow ecosystem with explicit Dead on Arrival (DOA) / Faulty Item automated buyer refund loops, persistent browser authentication, a 2FA pickup verification protocol, and a secret high-utility God-Mode Admin Panel.



### 🎨 PREMIUM DESIGN SYSTEM & AESTHETIC

- Theme: Premium, clean agricultural-tech meets high-trust fintech.

- Palette: 

  * Primary: Deep Forest Green (#1b4332)

  * Secondary: Vibrant Mint (#52b788)

  * Backgrounds: Clean White (#ffffff) / Minimalist Light Gray (#f8f9fa)

  * Text: Dark Slate (#212529)

- Layout: Fixed top navigation bar containing:

  * Platform Logo: "PigeonShield 🇳🇬"

  * Links: "Browse Marketplace", "How Escrow Works", "Breeder Dashboard"

  * Dynamic Auth Button: Swaps seamlessly between "Register / Log In" and "My Account Dashboard / Logout" based on active user authentication status.

- Navigation & Routing: Implement fully functional client-side tabs/routes so all modules can be operated within this single application layout. 

- Media Standards: Strictly enforce real animal imagery. Remove random placeholders. If no media is uploaded, display a clean, neutral gray background box with a small icon and text: "[Category Name] Photo Placeholder".



---



### 📦 REQUISITE ARCHITECTURAL MODULES



#### 1. SECURITY-HARDENED SESSION AUTHENTICATION & LOGIN FLOW

- Persistence System: Build a stateful user auth utility using React Context. On successful login or signup, automatically store session data and a mock JWT token inside browser `localStorage`. On application mount, read from `localStorage` to preserve user sessions through hard refreshes, completely eliminating unwanted logouts.

- Route Protection Middleware: Intercept tab/route changes. If an unauthenticated user attempts to view the "Breeder Dashboard", "My Orders", or the hidden administrative workspace, block rendering and redirect them to the Login modal with a visual warning badge.

- Registration Constraints & Terms: Inside the User Registration form, require a mandatory checkbox with the text: "I agree to the PigeonShield Nigeria Terms of Service, including the strict 7-day listing expiration rule, the instant manual confirmation escrow validation framework, and understand that platform commission rates are variable and set dynamically by the administrator. I understand that sharing personal contact information (like phone numbers or WhatsApp links) in public chats to bypass platform transaction fees results in immediate account termination and freezing of active funds."



#### 2. MULTI-CATEGORY ARCHITECTURE & LOCALIZED BREED DROPDOWNS

- Main Portal View: Default the entire homepage marketplace view to show Pigeons. Provide a secondary tab/filter labeled "Other Livestock & Guard Animals" to unlock other categories.

- Category Selector: Inside the Breeder Upload Portal, add a mandatory dropdown: "Select Livestock Category" with options: "Pigeons (Flagship)", "Chickens", "Dogs", "Horses".

- Dynamic Form Fields & Breed Filters:

  * If PIGEONS is selected: Display the mandatory "Custom Bird Name / Title" text input (e.g., "Musa Line Champion", "Red Checker King"). Enforce the strict breed dropdown list: "Racing Homer", "Pakistani High-Flyer", "Tipler High-Flyer", "Fantail (Ornamental)", "Jacobin (Ornamental)", "Pouter (Ornamental)", "Tumbler", and "Local Cross / Mixed Breed". Show the 3-generation digital pedigree JSON form.

  * If CHICKENS is selected: Update breeds dropdown to: "Noiler", "Local Yoruba Chicken", "Agricultural Broiler", "Cockerel", "Frizzle".

  * If DOGS is selected: Update breeds dropdown to: "Caucasian Shepherd", "Boerboel", "German Shepherd (Alsatian)", "Rotweiler", "Local Bashorun / Mongrel". Hide pedigree, show "Vaccination Status Checkbox".

  * If HORSES is selected: Update breeds dropdown to: "Local Northern Pony", "Sudanese Sudanour", "Arabian Thoroughbred Cross".



#### 3. ANONYMOUS ASYNCHRONOUS COMMUNICATION ENGINE

- Offline Status Framework: Implement an active session checker in the message module. If a seller is offline, render a clean badge stating "Breeder is currently away from the farm" alongside a safety disclaimer emphasizing that keeping chat on-platform preserves escrow rights.

- Structured Quick Inquiries: Populate the chat input view with tap-to-send template buttons (e.g., "Is delivery to my state park available?", "Request current pedigree confirmation").

- Notification Webhook Simulation: Program the messaging state engine so that when an offline user receives a message, a backend console log simulates a background webhook trigger (via Termii/Arkesel API) sending an SMS alert directly to the hidden phone number stored in NIGERIAN_USERS_TABLE to pull them back online.



#### 4. TWO-WAY DELIVERY CONFIRMATION & COURIER FRAUD PROTECTION

- Buyer Dashboard & 2FA Pickup: Build a prominent green button: "Confirm Safe Delivery & Release Funds". For anti-fraud control, generate a unique, randomized 4-digit Verification Passcode (e.g., "PS-XXXX") inside the transaction state that displays ONLY on the Buyer's screen. The buyer must read this to the driver/breeder upon collection.

- Dead on Arrival (DOA) Safe Valve: Next to the confirm button, implement a prominent red button labeled "🚨 Report Dead on Arrival / Damaged Goods". Clicking this halts the 48-hour auto-release clock, prompts for a video/photo proof file upload, and immediately shifts the transaction status code to "Disputed: Dead on Arrival".

- Breeder Dispute Escalation: If a buyer refuses to confirm receipt or claims non-receipt maliciously, provide a prominent button on the Breeder's Transaction View labeled "⚠️ Escalated: Submit Delivery Proof to Admin". Clicking this reveals an image/file upload input for a "Transport Waybill Snapshot" and a text field for "Driver/Logistics Agent Phone Number". Submitting this instantly flags the transaction status as "Under Review: Proof Submitted" and pushes it to the Admin Panel.

- Automated Backup Safety Net: Display a live mock 48-hour countdown clock. If the buyer fails to manually click confirm or open a formal dispute within 48 hours of marked delivery, the system automatically resolves the transaction and releases funds to the breeder so they do not wait indefinitely.



#### 5. ADMIN OPAY INTEGRATION & PHONE CONTACT CHANNEL

- Payout Mapping: Hardcode backend simulation logs to route all platform commissions to Admin OPay Account: 08139049440.

- Escalation Handling: Hardcode all "⚠️ Report Scam or Issue to Admin" buttons (found in marketplace feeds, listings, chats, and orders) to trigger a window.open pointing to the WhatsApp click-to-chat API (`https://wa.me...`). The payload text must automatically pre-populate with the specific Listing ID or User ID being flagged.



#### 6. 7-DAY EXPIRY TIMER & INVENTORY LOGIC

- Timeline Enforcement: Set listing lifespan to exactly 7 days. Display badges on cards reading: "7-Day Expiry Window" or "Days Remaining: X".

- Expiry Logic: Automatically calculate `expiry_date` as `date_created` + 7 days. Visibility filter condition: `is_active === true && expiry_date > CURRENT_TIMESTAMP && batch_quantity > 0`.

- Auto-Deactivation: If a buyer purchases the last animal and `batch_quantity` drops to 0, automatically flip `is_active` to false.



#### 7. MEDIA DELETE MANAGEMENT

- File Handling: Inside the Breeder Upload Portal, render an interactive trash icon overlay on top of every uploaded image/video preview thumbnail. Clicking this icon instantly strips that specific file from the state array prior to form submission.



#### 8. EXHAUSTIVE NIGERIAN STATES DROPDOWN

- Location Form Data: Populate all location dropdowns with an alphabetized list of all 36 states and the FCT: Abia, Adamawa, Akwa Ibom, Anambra, Bauchi, Bayelsa, Benue, Borno, Cross River, Delta, Ebonyi, Edo, Ekiti, Enugu, Gombe, Imo, Jigawa, Kaduna, Kano, Katsina, Kebbi, Kogi, Kwara, Lagos, Nasarawa, Niger, Ogun, Ondo, Osun, Oyo, Plateau, Rivers, Sokoto, Taraba, Yobe, Zamfara, FCT Abuja.



---



### 🗄️ 9. FULL DATABASE ARCHITECTURE (MOCK POSTGRESQL STATE)

Maintain full state reactivity simulating 3 tables with strict anonymity masking rules:

1. `NIGERIAN_USERS_TABLE`: Stores ID, real names, emails, phone numbers, public handles, home states, bank names, and account numbers. Ensure all private details are fully hidden from public views. Generate public handles using a randomized unique 6-digit string formatted strictly as: `"Verified Breeder #XXXXXX"`.

2. `NAIRA_PIGEON_LISTINGS_TABLE`: Stores ID, category_type ("Pigeon", "Chicken", etc), breeder_handle, custom_bird_name, breed_type, gender, price_ngn, images array, 3-generation digital pedigree JSON data (null for non-pigeons), creation_timestamp, and expiry status.

3. `NAIRA_ESCROW_TRANSACTIONS_TABLE`: Tracks transaction_id, listing_id, amount_naira, calculated_commission, pickup_passcode, 48-hour delivery countdown state, driver_phone, waybill_image_url, and dispute_status ("None", "Faulty Bird", "Under Review: Proof Submitted", "Disputed: Dead on Arrival").



---



### 👑 10. GOD-MODE ADMIN PANEL WITH TOTAL INTERVENTION CONTROLS

Create a highly secure, fully operational hidden administrative workspace accessible strictly by appending `/pigeon-boss-admin` to the application's URL route.

- Route Protection: Display a master login lock screen requiring a server-side verified master passphrase.

- Provide these exact fully functioning control panels upon successful authentication:

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pigeonshield-nigeria.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8eac6302-743e-4773-b37c-f3de7c43aa2e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

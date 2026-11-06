package garage;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Persistent garage directory (JSON file) with validation and ownership rules. */
final class GarageStore {
    /** Thrown for bad owner input; the message is safe to show to the user. */
    static final class Invalid extends RuntimeException {
        private static final long serialVersionUID = 1L;

        Invalid(String message) { super(message); }
    }

    /** discount = percent off (0 = none, max 90). The price customers pay is finalPrice(). */
    record Svc(String id, String name, String description, int price, String duration, String badge, int discount) {
        Svc(String id, String name, String description, int price, String duration, String badge) {
            this(id, name, description, price, duration, badge, 0);
        }

        int finalPrice() { return discount > 0 ? (int) Math.round(price * (100 - discount) / 100.0) : price; }
    }

    record Garage(String id, String ownerEmail, String name, String city, String area, String zip, String address, String phone,
                  String hours, String tagline, String mode, String website, boolean published,
                  double rating, int reviews, List<Svc> services, String approval, String reviewNote,
                  Map<String, String> theme, Map<String, Object> pay) {
        /** Convenience for garages that need no review (samples). */
        Garage(String id, String ownerEmail, String name, String city, String area, String zip, String address, String phone,
               String hours, String tagline, String mode, String website, boolean published,
               double rating, int reviews, List<Svc> services) {
            this(id, ownerEmail, name, city, area, zip, address, phone, hours, tagline, mode, website, published,
                    rating, reviews, services, APPROVED, "", DEFAULT_THEME, DEFAULT_PAY);
        }

        /** Visible to drivers and bookable: the owner published it and an admin approved it. */
        boolean live() { return published && APPROVED.equals(approval); }
    }

    /** Look of the garage's own page: accent colour, light/dark, font style, a headline and one line about the garage. */
    static final Map<String, String> DEFAULT_THEME = Map.of("accent", "#ff6a1a", "mode", "dark", "font", "modern", "headline", "", "about", "");
    /** How the garage accepts payment. "online" uses the garage's own payment link (e.g. a Stripe or PayPal link). */
    static final Map<String, Object> DEFAULT_PAY = Map.of("methods", List.of("card", "cash"), "link", "", "note", "");
    private static final List<String> PAY_METHODS = List.of("cash", "card", "upi", "transfer", "online");

    static Map<String, Object> parsePay(Object raw, Map<String, Object> fallback) {
        if (!(raw instanceof Map<?, ?> m)) return fallback;
        @SuppressWarnings("unchecked") Map<String, Object> b = (Map<String, Object>) m;
        List<Object> methods = new ArrayList<>();
        if (b.get("methods") instanceof List<?> l) {
            for (Object o : l) {
                if (!(o instanceof String x) || !PAY_METHODS.contains(x)) throw new Invalid("Unknown payment method.");
                if (!methods.contains(x)) methods.add(x);
            }
        }
        if (methods.isEmpty()) throw new Invalid("Choose at least one way customers can pay.");
        String link = str(b, "link", "Payment link", 0, 300, false);
        if (!link.isEmpty()) link = validUrl(link);
        if (methods.contains("online") && link.isEmpty()) throw new Invalid("Add your online payment link, or untick online payment.");
        String note = str(b, "note", "Payment note", 0, 100, false);
        return Map.of("methods", methods, "link", link, "note", note);
    }

    private static final Set<String> FONTS = Set.of("modern", "classic", "rounded");
    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");

    static Map<String, String> parseTheme(Object raw, Map<String, String> fallback) {
        if (!(raw instanceof Map<?, ?> m)) return fallback;
        @SuppressWarnings("unchecked") Map<String, Object> b = (Map<String, Object>) m;
        String accent = b.get("accent") instanceof String x ? x.trim() : fallback.get("accent");
        if (!HEX.matcher(accent).matches()) throw new Invalid("Pick a valid accent colour.");
        String mode = b.get("mode") instanceof String x ? x : fallback.get("mode");
        if (!mode.equals("light") && !mode.equals("dark")) throw new Invalid("Theme must be light or dark.");
        String font = b.get("font") instanceof String x ? x : fallback.get("font");
        if (!FONTS.contains(font)) throw new Invalid("Unknown font style.");
        String headline = str(b, "headline", "Headline", 0, 80, false);
        String about = str(b, "about", "About line", 0, 200, false);
        return Map.of("accent", accent.toLowerCase(Locale.ROOT), "mode", mode, "font", font, "headline", headline, "about", about);
    }

    static final String APPROVED = "approved";
    static final String PENDING = "pending";
    static final String REJECTED = "rejected";

    static final String MODE_LISTING = "listing";   // we host the garage's services and prices
    static final String MODE_WEBSITE = "website";   // we link customers to the garage's own website

    private static final int MAX_SERVICES = 20;
    private static final Pattern PHONE = Pattern.compile("^[0-9+()\\-.\\s]{7,25}$");
    static final Pattern ZIP = Pattern.compile("^(\\d{6}|\\d{5})$"); // India PIN (6 digits) or US ZIP (5 digits)
    private static final Pattern ZIP_IN_TEXT = Pattern.compile("\\b(\\d{6}|\\d{5})\\b");

    /** Nearness levels for a ZIP search: same ZIP, same first 4 digits, same first 3 digits (USPS sectional centre). */
    private static String[] nearness() {
        return new String[] {"Same " + (country.equals("US") ? "ZIP" : "PIN") + " code", "Nearby", "Same wider area"};
    }

    /** Country settings. COUNTRY=IN (default) or US: currency symbol, postal-code wording, number format, price ceiling. */
    static String country = "IN";

    static Map<String, Object> config() {
        boolean us = country.equals("US");
        return Json.obj("country", country, "currency", us ? "$" : "₹", "postalLabel", us ? "ZIP code" : "PIN code",
                "postalLength", us ? 5 : 6, "locale", us ? "en-US" : "en-IN", "maxPrice", MAX_PRICE);
    }

    static final int MAX_PRICE = 200_000;

    /** ZIP for records saved before ZIP existed: take it from the address if one is written there, else empty. */
    static String zipFromAddress(String address) {
        java.util.regex.Matcher m = ZIP_IN_TEXT.matcher(address == null ? "" : address);
        String last = "";
        while (m.find()) last = m.group(1);
        return last;
    }

    /** Service catalog: id -> {name, description}. */
    private static final Map<String, String[]> CATALOG = new LinkedHashMap<>();

    static {
        CATALOG.put("oil", new String[] {"Oil & Filter Change", "Oil and filter change, fluid top-up and a quick multi-point check."});
        CATALOG.put("brakes", new String[] {"Brake Inspection & Pads", "Pad replacement, rotor check and brake fluid test for confident stopping."});
        CATALOG.put("tires", new String[] {"Tire Rotation & Balance", "Rotate, balance and pressure-set all four tires to extend tread life."});
        CATALOG.put("battery", new String[] {"Battery Test & Replacement", "Load test, terminal clean and fitting of a new battery if needed."});
        CATALOG.put("ac", new String[] {"A/C Service & Recharge", "Leak check, refrigerant recharge and cabin filter swap."});
        CATALOG.put("engine", new String[] {"Engine Diagnostics", "Full computer scan, fault-code report and a written repair estimate."});
        CATALOG.put("align", new String[] {"Wheel Alignment", "Four-wheel alignment to fix pulling and uneven tire wear."});
        CATALOG.put("inspection", new String[] {"Pre-Purchase Inspection", "Independent inspection of a used car before you buy, with a written report."});
        CATALOG.put("ev", new String[] {"EV & Hybrid Health Check", "Battery health report, charging-system test and software update check."});
        CATALOG.put("full", new String[] {"Full Service Package", "Oil, filters, brakes, fluids, tires and a 50-point inspection in one visit."});
    }

    private final Path file;
    private final Map<String, Garage> garages = new LinkedHashMap<>(); // guarded by "this"
    private final SecureRandom random = new SecureRandom();

    GarageStore(Path file, boolean seedSamples) throws IOException {
        this.file = file;
        if (file.getParent() != null) Files.createDirectories(file.getParent());
        if (Files.exists(file)) {
            load();
        } else if (seedSamples) {
            for (Garage g : samples()) garages.put(g.id(), g);
            persist();
        }
    }

    // ---------- public API ----------

    static List<Object> catalog() {
        List<Object> out = new ArrayList<>();
        CATALOG.forEach((id, meta) -> out.add(Json.obj("id", id, "name", meta[0], "description", meta[1])));
        return out;
    }

    /**
     * Published garages near a location, with the services they offer but no prices.
     * By ZIP: range "exact" = same ZIP, "near" = same first 4 digits (default), "wide" = same first 3 digits.
     * By city: case-insensitive match on the garage's city or neighbourhood. Closest matches come first.
     */
    synchronized List<Object> publicList(String zip, String range, String city) {
        boolean byZip = zip != null && ZIP.matcher(zip).matches();
        String c = city == null ? "" : city.trim().toLowerCase(Locale.ROOT);
        int maxLevel = "exact".equals(range) ? 0 : "wide".equals(range) ? 2 : 1;

        record Hit(Garage g, int level) {}
        List<Hit> hits = new ArrayList<>();
        for (Garage g : garages.values()) {
            if (!g.live()) continue;
            int level = -1;
            if (byZip) {
                String gz = g.zip();
                // Prefix lengths for same code / nearby / wider area. US ZIP: 5,4,3. India PIN: 6,5,3 (3 digits = sorting district, roughly a city).
                int[] prefix = zip.length() == 6 ? new int[] {6, 5, 3} : new int[] {5, 4, 3};
                if (gz.length() == zip.length()) {
                    for (int i = 0; i < 3 && level < 0; i++) if (gz.startsWith(zip.substring(0, prefix[i]))) level = i;
                }
            } else if (!c.isEmpty() && (g.city().toLowerCase(Locale.ROOT).contains(c) || g.area().toLowerCase(Locale.ROOT).contains(c))) {
                level = 0;
            }
            if (level >= 0 && level <= maxLevel) hits.add(new Hit(g, level));
        }
        hits.sort(java.util.Comparator.<Hit>comparingInt(Hit::level)
                .thenComparing((Hit h) -> -h.g().rating())
                .thenComparing(h -> h.g().name()));
        List<Object> out = new ArrayList<>();
        for (Hit h : hits) {
            Map<String, Object> m = summary(h.g());
            m.put("nearness", byZip ? nearness()[h.level()] : "Matches your area");
            out.add(m);
        }
        return out;
    }

    /** Full details including prices. Visible if published, or if the viewer owns it. Null otherwise. */
    synchronized Map<String, Object> detailFor(String id, String viewerEmail) {
        Garage g = garages.get(id);
        if (g == null) return null;
        boolean mine = g.ownerEmail().equalsIgnoreCase(viewerEmail);
        if (!g.live() && !mine) return null;
        Map<String, Object> m = full(g, false);
        m.put("mine", mine); // lets the UI hide "Book" on your own garage
        return m;
    }

    synchronized boolean hasGarage(String ownerEmail) {
        return byOwner(ownerEmail) != null;
    }

    /** Raw garage by id (any state), or null. */
    synchronized Garage find(String id) {
        return garages.get(id);
    }

    /** The garage owned by this email, or null. */
    synchronized Garage findByOwner(String ownerEmail) {
        return byOwner(ownerEmail);
    }

    /** The owner's own garage (including draft state), or null if they haven't set one up. */
    synchronized Map<String, Object> ownerView(String ownerEmail) {
        Garage g = byOwner(ownerEmail);
        return g == null ? null : full(g, true);
    }

    /** Creates or updates the owner's garage from a request body. Throws Invalid on bad input. */
    synchronized Map<String, Object> save(String ownerEmail, Map<String, Object> b) throws IOException {
        Garage existing = byOwner(ownerEmail);

        String name = str(b, "name", "Garage name", 2, 80, true);
        String city = str(b, "city", "City", 2, 60, true);
        String area = str(b, "area", "Neighbourhood", 0, 60, false);
        String zip = str(b, "zip", country.equals("US") ? "ZIP code" : "PIN code", 5, 6, true);
        if (!ZIP.matcher(zip).matches() || zip.length() != (country.equals("US") ? 5 : 6)) throw new Invalid((country.equals("US") ? "ZIP code" : "PIN code") + " must be " + (country.equals("US") ? "5" : "6") + " digits.");
        String address = str(b, "address", "Street address", 5, 140, true);
        String phone = str(b, "phone", "Phone number", 7, 25, true);
        if (!PHONE.matcher(phone).matches() || phone.chars().filter(Character::isDigit).count() < 7) {
            throw new Invalid("Please enter a valid phone number.");
        }
        String hours = str(b, "hours", "Opening hours", 2, 80, true);
        String tagline = str(b, "tagline", "Tagline", 0, 140, false);

        String mode = b.get("mode") instanceof String m ? m : "";
        if (!mode.equals(MODE_LISTING) && !mode.equals(MODE_WEBSITE)) {
            throw new Invalid("Choose how customers should see your prices.");
        }
        String website = str(b, "website", "Website", 0, 200, false);
        if (!website.isEmpty()) website = validUrl(website);
        if (mode.equals(MODE_WEBSITE) && website.isEmpty()) throw new Invalid("Enter your website address.");

        List<Svc> services = parseServices(b.get("services"), mode);
        boolean published = Boolean.TRUE.equals(b.get("published"));
        if (published && services.isEmpty()) throw new Invalid("Add at least one service before publishing.");

        String id = existing != null ? existing.id() : newId(name);
        Garage g = new Garage(id, ownerEmail.toLowerCase(Locale.ROOT), name, city, area, zip, address, phone, hours, tagline,
                mode, website, published,
                existing != null ? existing.rating() : 0, existing != null ? existing.reviews() : 0, services,
                // New garages wait for an admin. Approved ones stay approved when edited. A rejected one goes back to review.
                existing != null && APPROVED.equals(existing.approval()) ? APPROVED : PENDING,
                existing != null && APPROVED.equals(existing.approval()) ? existing.reviewNote() : "",
                parseTheme(b.get("theme"), existing != null ? existing.theme() : DEFAULT_THEME),
                parsePay(b.get("pay"), existing != null ? existing.pay() : DEFAULT_PAY));
        garages.put(id, g);
        persist();
        return full(g, true);
    }

    // ---------- admin review ----------

    /** Garages for the admin screen, optionally only one approval state. Includes owner and contact details. */
    synchronized List<Object> adminList(String approval) {
        List<Object> out = new ArrayList<>();
        for (Garage g : garages.values()) {
            if (approval != null && !approval.isEmpty() && !approval.equals(g.approval())) continue;
            Map<String, Object> m = full(g, true);
            m.put("ownerEmail", g.ownerEmail());
            out.add(m);
        }
        // pending first
        out.sort(java.util.Comparator.comparingInt(o -> PENDING.equals(((Map<?, ?>) o).get("approval")) ? 0 : 1));
        return out;
    }

    synchronized int pendingCount() {
        int n = 0;
        for (Garage g : garages.values()) if (PENDING.equals(g.approval())) n++;
        return n;
    }

    /** Approve or reject a garage. A note is required when rejecting so the owner knows what to fix. */
    synchronized Map<String, Object> decide(String id, String decision, String note) throws IOException {
        Garage g = garages.get(id);
        if (g == null) throw new Invalid("Garage not found.");
        String n = note == null ? "" : note.trim();
        if (n.length() > 200) throw new Invalid("Note must be at most 200 characters.");
        for (char c : n.toCharArray()) if (c < 0x20 || c == 0x7f) throw new Invalid("Note contains invalid characters.");
        String state;
        if ("approve".equals(decision)) state = APPROVED;
        else if ("reject".equals(decision)) {
            if (n.isEmpty()) throw new Invalid("Tell the owner why it was rejected.");
            state = REJECTED;
        } else throw new Invalid("Decision must be approve or reject.");
        Garage u = new Garage(g.id(), g.ownerEmail(), g.name(), g.city(), g.area(), g.zip(), g.address(), g.phone(), g.hours(),
                g.tagline(), g.mode(), g.website(), g.published(), g.rating(), g.reviews(), g.services(), state, n, g.theme(), g.pay());
        garages.put(id, u);
        persist();
        Map<String, Object> m = full(u, true);
        m.put("ownerEmail", u.ownerEmail());
        return m;
    }

    // ---------- validation helpers ----------

    private static String str(Map<String, Object> b, String key, String label, int min, int max, boolean required) {
        String s = b.get(key) instanceof String x ? x.trim() : "";
        if (s.isEmpty() && !required) return "";
        if (s.length() < Math.max(min, 1)) throw new Invalid(label + " is required.");
        if (s.length() > max) throw new Invalid(label + " must be at most " + max + " characters.");
        for (char c : s.toCharArray()) {
            if (c < 0x20 || c == 0x7f) throw new Invalid(label + " contains invalid characters.");
        }
        return s;
    }

    /** Accepts only plain http(s) URLs with a host and no embedded credentials. */
    private static String validUrl(String raw) {
        try {
            URI u = new URI(raw);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (!(scheme.equals("http") || scheme.equals("https")) || u.getHost() == null || u.getUserInfo() != null
                    || raw.chars().anyMatch(Character::isWhitespace)) {
                throw new Invalid("Website must be a full address starting with http:// or https://");
            }
            return u.toString();
        } catch (java.net.URISyntaxException e) {
            throw new Invalid("Website must be a full address starting with http:// or https://");
        }
    }

    private static List<Svc> parseServices(Object raw, String mode) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) throw new Invalid("Invalid services list.");
        if (list.size() > MAX_SERVICES) throw new Invalid("You can list up to " + MAX_SERVICES + " services.");
        List<Svc> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int customIndex = 0;
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> m)) throw new Invalid("Invalid services list.");
            @SuppressWarnings("unchecked") Map<String, Object> s = (Map<String, Object>) m;
            String id = s.get("id") instanceof String x ? x.trim() : "";
            String name;
            String desc;
            if (CATALOG.containsKey(id)) {
                if (!seen.add(id)) continue; // ignore duplicate catalog entries
                name = CATALOG.get(id)[0];
                // The owner may reword the standard description; blank falls back to the default.
                desc = str(s, "description", "Service description", 0, 160, false);
                if (desc.isEmpty()) desc = CATALOG.get(id)[1];
            } else if (id.isEmpty() || id.startsWith("custom")) {
                name = str(s, "name", "Service name", 2, 60, true);
                desc = str(s, "description", "Service description", 0, 160, false);
                id = "custom" + customIndex++;
            } else {
                throw new Invalid("Unknown service.");
            }
            int price = 0;
            if (mode.equals(MODE_LISTING)) {
                double p = s.get("price") instanceof Number n ? n.doubleValue() : -1;
                if (!(p >= 1 && p <= MAX_PRICE) || p != Math.rint(p)) {
                    throw new Invalid("Enter a whole-number price between 1 and " + MAX_PRICE + " for " + name + ".");
                }
                price = (int) p;
            }
            String duration = str(s, "duration", "Duration", 0, 20, false);
            int discount = 0;
            if (s.get("discount") instanceof Number dn && dn.doubleValue() != 0) {
                double d = dn.doubleValue();
                if (d != Math.rint(d) || d < 1 || d > 90) throw new Invalid("Discount for " + name + " must be a whole number from 1 to 90 percent.");
                discount = (int) d;
            }
            out.add(new Svc(id, name, desc, price, duration, "", discount));
        }
        return out;
    }

    // ---------- helpers ----------

    private Garage byOwner(String email) {
        for (Garage g : garages.values()) if (g.ownerEmail().equalsIgnoreCase(email)) return g;
        return null;
    }

    private String newId(String name) {
        String slug = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (slug.length() > 30) slug = slug.substring(0, 30).replaceAll("-+$", "");
        if (slug.isEmpty()) slug = "garage";
        String id;
        do {
            id = slug + "-" + Integer.toString(random.nextInt(36 * 36 * 36 * 36), 36);
        } while (garages.containsKey(id));
        return id;
    }

    private static Map<String, Object> summary(Garage g) {
        List<Object> ids = new ArrayList<>();
        List<Object> names = new ArrayList<>();
        for (Svc s : g.services()) {
            ids.add(s.id());
            names.add(s.name());
        }
        return Json.obj("id", g.id(), "name", g.name(), "city", g.city(), "area", g.area(), "zip", g.zip(), "rating", g.rating(),
                "reviews", g.reviews(), "hours", g.hours(), "tagline", g.tagline(), "mode", g.mode(),
                "serviceIds", ids, "serviceNames", names);
    }

    private static Map<String, Object> full(Garage g, boolean forOwner) {
        List<Object> services = new ArrayList<>();
        for (Svc s : g.services()) {
            services.add(Json.obj("id", s.id(), "name", s.name(), "description", s.description(),
                    "price", s.price(), "discount", s.discount(), "finalPrice", s.finalPrice(),
                    "duration", s.duration(), "badge", s.badge()));
        }
        Map<String, Object> m = Json.obj("id", g.id(), "name", g.name(), "city", g.city(), "area", g.area(), "zip", g.zip(),
                "address", g.address(), "phone", g.phone(), "rating", g.rating(), "reviews", g.reviews(),
                "hours", g.hours(), "tagline", g.tagline(), "mode", g.mode(), "website", g.website(),
                "services", services, "pay", g.pay());
        if (forOwner) {
            m.put("published", g.published());
            m.put("approval", g.approval());
            m.put("reviewNote", g.reviewNote());
            m.put("theme", g.theme());
        }
        return m;
    }

    // ---------- persistence ----------

    private void persist() throws IOException {
        List<Object> all = new ArrayList<>();
        for (Garage g : garages.values()) {
            Map<String, Object> m = full(g, true);
            m.put("ownerEmail", g.ownerEmail());
            all.add(m);
        }
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, Json.write(Json.obj("garages", all)), StandardCharsets.UTF_8);
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    @SuppressWarnings("unchecked")
    private void load() throws IOException {
        Map<String, Object> root = Json.parseObject(Files.readString(file, StandardCharsets.UTF_8));
        for (Object o : (List<Object>) root.getOrDefault("garages", List.of())) {
            Map<String, Object> m = (Map<String, Object>) o;
            List<Svc> services = new ArrayList<>();
            for (Object so : (List<Object>) m.getOrDefault("services", List.of())) {
                Map<String, Object> s = (Map<String, Object>) so;
                services.add(new Svc((String) s.get("id"), (String) s.get("name"), (String) s.get("description"),
                        ((Number) s.get("price")).intValue(), (String) s.get("duration"), (String) s.getOrDefault("badge", ""),
                        ((Number) s.getOrDefault("discount", 0)).intValue()));
            }
            Garage g = new Garage((String) m.get("id"), (String) m.getOrDefault("ownerEmail", ""), (String) m.get("name"),
                    (String) m.get("city"), (String) m.getOrDefault("area", ""),
                    m.get("zip") instanceof String z && ZIP.matcher(z).matches() ? z : zipFromAddress((String) m.get("address")),
                    (String) m.get("address"),
                    (String) m.get("phone"), (String) m.get("hours"), (String) m.getOrDefault("tagline", ""),
                    (String) m.get("mode"), (String) m.getOrDefault("website", ""), Boolean.TRUE.equals(m.get("published")),
                    ((Number) m.getOrDefault("rating", 0)).doubleValue(), ((Number) m.getOrDefault("reviews", 0)).intValue(),
                    services,
                    // Records saved before approval existed are treated as approved so existing data keeps working.
                    m.get("approval") instanceof String a && (a.equals(PENDING) || a.equals(REJECTED)) ? a : APPROVED,
                    (String) m.getOrDefault("reviewNote", ""),
                    loadTheme(m.get("theme")), loadPay(m.get("pay")));
            garages.put(g.id(), g);
        }
    }

    private static Map<String, Object> loadPay(Object raw) {
        try {
            return parsePay(raw, DEFAULT_PAY);
        } catch (Invalid e) {
            return DEFAULT_PAY;
        }
    }

    /** Folds a new star rating (1-5) into the garage's running average. */
    synchronized void applyReview(String garageId, int rating) throws IOException {
        Garage g = garages.get(garageId);
        if (g == null) return;
        int n = g.reviews() + 1;
        double avg = Math.round((g.rating() * g.reviews() + rating) / n * 10) / 10.0;
        garages.put(garageId, new Garage(g.id(), g.ownerEmail(), g.name(), g.city(), g.area(), g.zip(), g.address(), g.phone(),
                g.hours(), g.tagline(), g.mode(), g.website(), g.published(), avg, n, g.services(), g.approval(), g.reviewNote(),
                g.theme(), g.pay()));
        persist();
    }

    private static Map<String, String> loadTheme(Object raw) {
        try {
            return parseTheme(raw, DEFAULT_THEME);
        } catch (Invalid e) {
            return DEFAULT_THEME;
        }
    }

    /** Public page data for a garage's own site: no prices. Visible only when live, or to its owner as a preview. */
    synchronized Map<String, Object> siteFor(String id, String viewerEmail) {
        Garage g = garages.get(id);
        if (g == null) return null;
        boolean mine = viewerEmail != null && g.ownerEmail().equalsIgnoreCase(viewerEmail);
        if (!g.live() && !mine) return null;
        Map<String, Object> m = summary(g);
        m.put("address", g.address());
        m.put("phone", g.phone());
        m.put("theme", g.theme());
        m.put("live", g.live());
        List<Object> svcs = new ArrayList<>();
        for (Svc sv : g.services()) svcs.add(Json.obj("id", sv.id(), "name", sv.name(), "description", sv.description(),
                "duration", sv.duration(), "discount", sv.discount()));
        m.put("services", svcs);
        m.put("payMethods", g.pay().get("methods"));
        return m;
    }

    // ---------- sample data (first run only) ----------

    private static Svc svc(String id, int price, String duration, String badge) {
        String[] meta = CATALOG.get(id);
        return new Svc(id, meta[0], meta[1], price, duration, badge);
    }

    private static Svc svc(String id, int price, String duration) {
        return svc(id, price, duration, "");
    }

    private static List<Garage> samples() {
        return country.equals("US") ? samplesUs() : samplesIn();
    }

    /** Made-up Ahmedabad garages for a fresh install. Names, phone numbers, ratings and prices are invented. */
    private static List<Garage> samplesIn() {
        return List.of(
                new Garage("sample-navrang", "", "Navrang Auto Works", "Ahmedabad", "Navrangpura", "380009", "12 Sample Road, Navrangpura, Ahmedabad 380009",
                        "+91 79 4000 0101", "Mon-Sat, 9:00 AM - 7:00 PM", "All-round car service with a 6-month workmanship warranty.",
                        MODE_LISTING, "", true, 4.8, 212,
                        List.of(svc("oil", 1499, "45 min", "Most popular"), svc("brakes", 3499, "1.5 hrs"), svc("tires", 599, "45 min"),
                                svc("battery", 5499, "30 min"), svc("ac", 2499, "1 hr"), svc("engine", 999, "1 hr"),
                                svc("align", 899, "1 hr"), svc("full", 5999, "3 hrs", "Best value"))),
                new Garage("sample-satellite", "", "Satellite Motor Care", "Ahmedabad", "Satellite", "380015", "34 Demo Society, Satellite, Ahmedabad 380015",
                        "+91 79 4000 0102", "Mon-Sat, 8:30 AM - 6:30 PM", "Diagnostics and engine specialists for hatchbacks and SUVs.",
                        MODE_LISTING, "", true, 4.6, 148,
                        List.of(svc("engine", 799, "1 hr", "Specialty"), svc("oil", 1399, "40 min"), svc("brakes", 3199, "1.5 hrs"),
                                svc("inspection", 1499, "2 hrs"), svc("battery", 5299, "30 min"), svc("full", 5499, "3 hrs"))),
                new Garage("sample-maninagar", "", "Maninagar Tyre & Brake", "Ahmedabad", "Maninagar", "380008", "7 Example Chowk, Maninagar, Ahmedabad 380008",
                        "+91 79 4000 0103", "Mon-Sat, 9:00 AM - 6:00 PM", "Tyres, brakes and alignment, often done while you wait.",
                        MODE_LISTING, "", true, 4.5, 96,
                        List.of(svc("tires", 499, "30 min", "Most popular"), svc("brakes", 2999, "1.25 hrs"), svc("align", 799, "1 hr"),
                                svc("battery", 4999, "25 min"))),
                new Garage("sample-bopal", "", "Bopal EV & Hybrid Garage", "Ahmedabad", "Bopal", "380058", "21 Test Avenue, Bopal, Ahmedabad 380058",
                        "+91 79 4000 0104", "Mon-Sat, 10:00 AM - 7:00 PM", "EV and hybrid health checks plus regular servicing.",
                        MODE_LISTING, "", true, 4.7, 73,
                        List.of(svc("ev", 1999, "1.5 hrs", "EV specialist"), svc("oil", 1599, "45 min"), svc("tires", 649, "40 min"),
                                svc("ac", 2699, "1 hr"), svc("inspection", 1799, "2 hrs"), svc("full", 6499, "3 hrs"))),
                new Garage("sample-chandkheda", "", "Chandkheda Quick Service", "Ahmedabad", "Chandkheda", "382424", "5 Placeholder Marg, Chandkheda, Ahmedabad 382424",
                        "+91 79 4000 0105", "Daily, 8:00 AM - 8:00 PM", "Quick maintenance seven days a week.",
                        MODE_LISTING, "", true, 4.4, 181,
                        List.of(svc("oil", 1199, "30 min", "Fastest"), svc("tires", 449, "30 min"), svc("battery", 4799, "20 min"),
                                svc("ac", 2299, "1 hr"), svc("engine", 699, "45 min"))));
    }

    private static List<Garage> samplesUs() {
        return List.of(
                new Garage("redline", "", "Redline Auto Garage", "Seattle", "Georgetown", "98134", "1420 Industrial Way, Seattle, WA 98134",
                        "(206) 555-0142", "Mon-Fri 8am-6pm, Sat 9am-3pm", "All-round independent garage with a 12-month warranty.",
                        MODE_LISTING, "", true, 4.9, 312,
                        List.of(svc("oil", 89, "45 min", "Most popular"), svc("brakes", 189, "1.5 hrs"), svc("tires", 59, "40 min"),
                                svc("battery", 129, "30 min"), svc("ac", 149, "1 hr"), svc("engine", 99, "1 hr"),
                                svc("align", 109, "1 hr"), svc("full", 349, "3 hrs", "Best value"))),
                new Garage("rainier", "", "Rainier Motor Works", "Seattle", "Beacon Hill", "98108", "815 S Spokane St, Seattle, WA 98108",
                        "(206) 555-0177", "Mon-Fri 7:30am-5:30pm", "Diagnostics and engine specialists for domestic and import cars.",
                        MODE_LISTING, "", true, 4.7, 198,
                        List.of(svc("engine", 89, "1 hr", "Specialty"), svc("oil", 79, "40 min"), svc("brakes", 169, "1.5 hrs"),
                                svc("inspection", 149, "2 hrs"), svc("battery", 119, "30 min"), svc("full", 319, "3 hrs"))),
                new Garage("emerald", "", "Emerald City Auto Care", "Seattle", "Capitol Hill", "98122", "1105 E Pike St, Seattle, WA 98122",
                        "(206) 555-0128", "Mon-Sat 8am-6pm", "Hybrid and EV-friendly shop with loaner bikes while you wait.",
                        MODE_LISTING, "", true, 4.8, 254,
                        List.of(svc("ev", 129, "1.5 hrs", "EV specialist"), svc("oil", 95, "45 min"), svc("tires", 65, "40 min"),
                                svc("ac", 159, "1 hr"), svc("align", 119, "1 hr"), svc("inspection", 159, "2 hrs"),
                                svc("full", 369, "3 hrs", "Best value"))),
                new Garage("lakeside", "", "Lakeside Tire & Brake", "Seattle", "Ballard", "98107", "5630 24th Ave NW, Seattle, WA 98107",
                        "(206) 555-0163", "Mon-Sat 8am-5pm", "Tires, brakes and alignment done fast, often while you wait.",
                        MODE_LISTING, "", true, 4.6, 141,
                        List.of(svc("tires", 49, "30 min", "Most popular"), svc("brakes", 159, "1.25 hrs"), svc("align", 95, "1 hr"),
                                svc("battery", 109, "25 min"))),
                new Garage("northgate", "", "Northgate Quick Lube & Service", "Seattle", "Northgate", "98125", "10315 5th Ave NE, Seattle, WA 98125",
                        "(206) 555-0191", "Daily 7am-7pm, no appointment needed", "Quick, no-appointment maintenance seven days a week.",
                        MODE_LISTING, "", true, 4.5, 409,
                        List.of(svc("oil", 69, "25 min", "Fastest"), svc("tires", 45, "30 min"), svc("battery", 99, "20 min"),
                                svc("ac", 139, "1 hr"), svc("engine", 79, "45 min"))));
    }
}

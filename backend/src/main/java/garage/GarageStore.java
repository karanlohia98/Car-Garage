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

    record Svc(String id, String name, String description, int price, String duration, String badge) {}

    record Garage(String id, String ownerEmail, String name, String city, String area, String address, String phone,
                  String hours, String tagline, String mode, String website, boolean published,
                  double rating, int reviews, List<Svc> services) {}

    static final String MODE_LISTING = "listing";   // we host the garage's services and prices
    static final String MODE_WEBSITE = "website";   // we link customers to the garage's own website

    private static final int MAX_SERVICES = 20;
    private static final Pattern PHONE = Pattern.compile("^[0-9+()\\-.\\s]{7,25}$");

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

    /** Published garages with the services they offer, but no prices. */
    synchronized List<Object> publicList() {
        List<Object> out = new ArrayList<>();
        for (Garage g : garages.values()) if (g.published()) out.add(summary(g));
        return out;
    }

    /** Full details including prices. Visible if published, or if the viewer owns it. Null otherwise. */
    synchronized Map<String, Object> detailFor(String id, String viewerEmail) {
        Garage g = garages.get(id);
        if (g == null) return null;
        if (!g.published() && !g.ownerEmail().equalsIgnoreCase(viewerEmail)) return null;
        return full(g, false);
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
        Garage g = new Garage(id, ownerEmail.toLowerCase(Locale.ROOT), name, city, area, address, phone, hours, tagline,
                mode, website, published,
                existing != null ? existing.rating() : 0, existing != null ? existing.reviews() : 0, services);
        garages.put(id, g);
        persist();
        return full(g, true);
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
                desc = CATALOG.get(id)[1];
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
                if (!(p >= 1 && p <= 10000) || p != Math.rint(p)) {
                    throw new Invalid("Enter a whole-dollar price between 1 and 10000 for " + name + ".");
                }
                price = (int) p;
            }
            String duration = str(s, "duration", "Duration", 0, 20, false);
            out.add(new Svc(id, name, desc, price, duration, ""));
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
        return Json.obj("id", g.id(), "name", g.name(), "city", g.city(), "area", g.area(), "rating", g.rating(),
                "reviews", g.reviews(), "hours", g.hours(), "tagline", g.tagline(), "mode", g.mode(),
                "serviceIds", ids, "serviceNames", names);
    }

    private static Map<String, Object> full(Garage g, boolean forOwner) {
        List<Object> services = new ArrayList<>();
        for (Svc s : g.services()) {
            services.add(Json.obj("id", s.id(), "name", s.name(), "description", s.description(),
                    "price", s.price(), "duration", s.duration(), "badge", s.badge()));
        }
        Map<String, Object> m = Json.obj("id", g.id(), "name", g.name(), "city", g.city(), "area", g.area(),
                "address", g.address(), "phone", g.phone(), "rating", g.rating(), "reviews", g.reviews(),
                "hours", g.hours(), "tagline", g.tagline(), "mode", g.mode(), "website", g.website(),
                "services", services);
        if (forOwner) m.put("published", g.published());
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
                        ((Number) s.get("price")).intValue(), (String) s.get("duration"), (String) s.getOrDefault("badge", "")));
            }
            Garage g = new Garage((String) m.get("id"), (String) m.getOrDefault("ownerEmail", ""), (String) m.get("name"),
                    (String) m.get("city"), (String) m.getOrDefault("area", ""), (String) m.get("address"),
                    (String) m.get("phone"), (String) m.get("hours"), (String) m.getOrDefault("tagline", ""),
                    (String) m.get("mode"), (String) m.getOrDefault("website", ""), Boolean.TRUE.equals(m.get("published")),
                    ((Number) m.getOrDefault("rating", 0)).doubleValue(), ((Number) m.getOrDefault("reviews", 0)).intValue(),
                    services);
            garages.put(g.id(), g);
        }
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
        return List.of(
                new Garage("redline", "", "Redline Auto Garage", "Seattle", "Georgetown", "1420 Industrial Way, Seattle, WA 98134",
                        "(206) 555-0142", "Mon-Fri 8am-6pm, Sat 9am-3pm", "All-round independent garage with a 12-month warranty.",
                        MODE_LISTING, "", true, 4.9, 312,
                        List.of(svc("oil", 89, "45 min", "Most popular"), svc("brakes", 189, "1.5 hrs"), svc("tires", 59, "40 min"),
                                svc("battery", 129, "30 min"), svc("ac", 149, "1 hr"), svc("engine", 99, "1 hr"),
                                svc("align", 109, "1 hr"), svc("full", 349, "3 hrs", "Best value"))),
                new Garage("rainier", "", "Rainier Motor Works", "Seattle", "Beacon Hill", "815 S Spokane St, Seattle, WA 98108",
                        "(206) 555-0177", "Mon-Fri 7:30am-5:30pm", "Diagnostics and engine specialists for domestic and import cars.",
                        MODE_LISTING, "", true, 4.7, 198,
                        List.of(svc("engine", 89, "1 hr", "Specialty"), svc("oil", 79, "40 min"), svc("brakes", 169, "1.5 hrs"),
                                svc("inspection", 149, "2 hrs"), svc("battery", 119, "30 min"), svc("full", 319, "3 hrs"))),
                new Garage("emerald", "", "Emerald City Auto Care", "Seattle", "Capitol Hill", "1105 E Pike St, Seattle, WA 98122",
                        "(206) 555-0128", "Mon-Sat 8am-6pm", "Hybrid and EV-friendly shop with loaner bikes while you wait.",
                        MODE_LISTING, "", true, 4.8, 254,
                        List.of(svc("ev", 129, "1.5 hrs", "EV specialist"), svc("oil", 95, "45 min"), svc("tires", 65, "40 min"),
                                svc("ac", 159, "1 hr"), svc("align", 119, "1 hr"), svc("inspection", 159, "2 hrs"),
                                svc("full", 369, "3 hrs", "Best value"))),
                new Garage("lakeside", "", "Lakeside Tire & Brake", "Seattle", "Ballard", "5630 24th Ave NW, Seattle, WA 98107",
                        "(206) 555-0163", "Mon-Sat 8am-5pm", "Tires, brakes and alignment done fast, often while you wait.",
                        MODE_LISTING, "", true, 4.6, 141,
                        List.of(svc("tires", 49, "30 min", "Most popular"), svc("brakes", 159, "1.25 hrs"), svc("align", 95, "1 hr"),
                                svc("battery", 109, "25 min"))),
                new Garage("northgate", "", "Northgate Quick Lube & Service", "Seattle", "Northgate", "10315 5th Ave NE, Seattle, WA 98125",
                        "(206) 555-0191", "Daily 7am-7pm, no appointment needed", "Quick, no-appointment maintenance seven days a week.",
                        MODE_LISTING, "", true, 4.5, 409,
                        List.of(svc("oil", 69, "25 min", "Fastest"), svc("tires", 45, "30 min"), svc("battery", 99, "20 min"),
                                svc("ac", 139, "1 hr"), svc("engine", 79, "45 min"))));
    }
}

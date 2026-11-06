package garage;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Sample garage directory. Replace with a database for real use. */
final class Garages {
    private Garages() {}

    /** A service a particular garage offers, with that garage's own price. */
    private record Offer(String serviceId, int price, String duration, String badge) {}

    private record Garage(String id, String name, String area, String address, String phone,
                          double rating, int reviews, String hours, String tagline, List<Offer> offers) {}

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

    private static Offer o(String id, int price, String duration) {
        return new Offer(id, price, duration, "");
    }

    private static Offer o(String id, int price, String duration, String badge) {
        return new Offer(id, price, duration, badge);
    }

    private static final List<Garage> GARAGES = List.of(
            new Garage("redline", "Redline Auto Garage", "Georgetown", "1420 Industrial Way, Seattle, WA 98134",
                    "(206) 555-0142", 4.9, 312, "Mon-Fri 8am-6pm, Sat 9am-3pm",
                    "All-round independent garage with a 12-month warranty.",
                    List.of(o("oil", 89, "45 min", "Most popular"), o("brakes", 189, "1.5 hrs"), o("tires", 59, "40 min"),
                            o("battery", 129, "30 min"), o("ac", 149, "1 hr"), o("engine", 99, "1 hr"),
                            o("align", 109, "1 hr"), o("full", 349, "3 hrs", "Best value"))),
            new Garage("rainier", "Rainier Motor Works", "Beacon Hill", "815 S Spokane St, Seattle, WA 98108",
                    "(206) 555-0177", 4.7, 198, "Mon-Fri 7:30am-5:30pm",
                    "Diagnostics and engine specialists for domestic and import cars.",
                    List.of(o("engine", 89, "1 hr", "Specialty"), o("oil", 79, "40 min"), o("brakes", 169, "1.5 hrs"),
                            o("inspection", 149, "2 hrs"), o("battery", 119, "30 min"), o("full", 319, "3 hrs"))),
            new Garage("emerald", "Emerald City Auto Care", "Capitol Hill", "1105 E Pike St, Seattle, WA 98122",
                    "(206) 555-0128", 4.8, 254, "Mon-Sat 8am-6pm",
                    "Hybrid and EV-friendly shop with loaner bikes while you wait.",
                    List.of(o("ev", 129, "1.5 hrs", "EV specialist"), o("oil", 95, "45 min"), o("tires", 65, "40 min"),
                            o("ac", 159, "1 hr"), o("align", 119, "1 hr"), o("inspection", 159, "2 hrs"),
                            o("full", 369, "3 hrs", "Best value"))),
            new Garage("lakeside", "Lakeside Tire & Brake", "Ballard", "5630 24th Ave NW, Seattle, WA 98107",
                    "(206) 555-0163", 4.6, 141, "Mon-Sat 8am-5pm",
                    "Tires, brakes and alignment done fast, often while you wait.",
                    List.of(o("tires", 49, "30 min", "Most popular"), o("brakes", 159, "1.25 hrs"), o("align", 95, "1 hr"),
                            o("battery", 109, "25 min"))),
            new Garage("northgate", "Northgate Quick Lube & Service", "Northgate", "10315 5th Ave NE, Seattle, WA 98125",
                    "(206) 555-0191", 4.5, 409, "Daily 7am-7pm, no appointment needed",
                    "Quick, no-appointment maintenance seven days a week.",
                    List.of(o("oil", 69, "25 min", "Fastest"), o("tires", 45, "30 min"), o("battery", 99, "20 min"),
                            o("ac", 139, "1 hr"), o("engine", 79, "45 min"))));

    private static Map<String, Object> summary(Garage g) {
        List<Object> ids = new ArrayList<>();
        List<Object> names = new ArrayList<>();
        for (Offer of : g.offers()) {
            ids.add(of.serviceId());
            names.add(CATALOG.get(of.serviceId())[0]);
        }
        // Public summary: which services are offered, but no prices.
        return Json.obj("id", g.id(), "name", g.name(), "area", g.area(), "rating", g.rating(),
                "reviews", g.reviews(), "hours", g.hours(), "tagline", g.tagline(),
                "serviceIds", ids, "serviceNames", names);
    }

    /** Public list: garages and the services they offer, without prices. */
    static List<Object> list() {
        List<Object> out = new ArrayList<>();
        for (Garage g : GARAGES) out.add(summary(g));
        return out;
    }

    /** Full details including prices (callers must check login first). Null if unknown. */
    static Map<String, Object> detail(String id) {
        for (Garage g : GARAGES) {
            if (!g.id().equals(id)) continue;
            List<Object> services = new ArrayList<>();
            for (Offer of : g.offers()) {
                String[] meta = CATALOG.get(of.serviceId());
                services.add(Json.obj("id", of.serviceId(), "name", meta[0], "description", meta[1],
                        "price", of.price(), "duration", of.duration(), "badge", of.badge()));
            }
            return Json.obj("id", g.id(), "name", g.name(), "area", g.area(), "address", g.address(),
                    "phone", g.phone(), "rating", g.rating(), "reviews", g.reviews(), "hours", g.hours(),
                    "tagline", g.tagline(), "services", services);
        }
        return null;
    }
}

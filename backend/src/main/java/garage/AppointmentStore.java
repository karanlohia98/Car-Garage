package garage;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Appointments between a driver (the customer) and a garage, with a status workflow and a chat thread.
 *
 * Workflow:  requested -> booked -> at_garage -> in_progress -> completed
 * Garage can also decline a request, or cancel a booking. The customer can cancel before the car arrives.
 * Every transition is checked here on the server; the UI only offers what is allowed.
 */
final class AppointmentStore {
    /** Appointment does not exist, or the viewer has no relationship to it (we do not reveal which). */
    static final class NotFound extends RuntimeException {
        private static final long serialVersionUID = 1L;

        NotFound(String message) { super(message); }
    }

    /** The viewer may see this appointment but is not allowed to do that action. */
    static final class Denied extends RuntimeException {
        private static final long serialVersionUID = 1L;

        Denied(String message) { super(message); }
    }

    static final String REQUESTED = "requested";
    static final String BOOKED = "booked";
    static final String AT_GARAGE = "at_garage";
    static final String IN_PROGRESS = "in_progress";
    static final String COMPLETED = "completed";
    static final String DECLINED = "declined";
    static final String CANCELLED = "cancelled";

    private static final Map<String, String> LABELS = Map.of(
            REQUESTED, "Waiting for the garage to accept",
            BOOKED, "Appointment booked",
            AT_GARAGE, "Car at the garage",
            IN_PROGRESS, "Work in progress",
            COMPLETED, "Work completed",
            DECLINED, "Declined by the garage",
            CANCELLED, "Cancelled");

    private static final Set<String> OPEN = Set.of(REQUESTED, BOOKED, AT_GARAGE, IN_PROGRESS);

    private static final Map<String, List<String>> GARAGE_NEXT = Map.of(
            REQUESTED, List.of(BOOKED, DECLINED),
            BOOKED, List.of(AT_GARAGE, CANCELLED),
            AT_GARAGE, List.of(IN_PROGRESS),
            IN_PROGRESS, List.of(COMPLETED));

    private static final Map<String, List<String>> CUSTOMER_NEXT = Map.of(
            REQUESTED, List.of(CANCELLED),
            BOOKED, List.of(CANCELLED));

    private static final int MAX_OPEN_PER_CUSTOMER = 5;
    private static final int MAX_MESSAGES = 300;
    private static final int MAX_TOTAL = 50_000;

    private record Line(String name, int price) {}

    private record Msg(String from, String name, String text, String at) {} // from: customer | garage | system

    private static final class Appt {
        String id;
        String garageId;
        String garageName;
        String customerEmail;
        String customerName;
        String vehicle;   // car make and model
        String plate = ""; // number plate (empty on bookings made before it existed)
        String date;
        String time;
        String notes;
        String status;
        String createdAt;
        String updatedAt;
        List<Line> services = new ArrayList<>();
        List<Msg> messages = new ArrayList<>();
        int unreadCustomer;
        int unreadGarage;
    }

    private final Path file;
    private final Map<String, Appt> appts = new LinkedHashMap<>(); // guarded by "this"
    private final SecureRandom random = new SecureRandom();

    AppointmentStore(Path file) throws IOException {
        this.file = file;
        if (file.getParent() != null) Files.createDirectories(file.getParent());
        if (Files.exists(file)) load();
    }

    static String label(String status) {
        return LABELS.getOrDefault(status, status);
    }

    // ---------- driver side ----------

    synchronized Map<String, Object> create(String customerEmail, String customerName, Map<String, Object> b, GarageStore gs)
            throws IOException {
        String garageId = b.get("garageId") instanceof String s ? s : "";
        GarageStore.Garage g = gs.find(garageId);
        if (g == null || !g.live()) throw new NotFound("Garage not found.");
        if (g.ownerEmail().equalsIgnoreCase(customerEmail)) {
            throw new GarageStore.Invalid("You can't book an appointment at your own garage.");
        }
        if (appts.size() >= MAX_TOTAL) throw new GarageStore.Invalid("Booking is unavailable right now. Please try later.");
        long open = appts.values().stream()
                .filter(a -> a.customerEmail.equalsIgnoreCase(customerEmail) && OPEN.contains(a.status)).count();
        if (open >= MAX_OPEN_PER_CUSTOMER) {
            throw new GarageStore.Invalid("You already have " + MAX_OPEN_PER_CUSTOMER + " open appointments. Finish or cancel one first.");
        }

        // Services must be ones this garage actually offers; names and prices are copied at booking time.
        if (!(b.get("serviceIds") instanceof List<?> ids) || ids.isEmpty()) throw new GarageStore.Invalid("Choose at least one service.");
        if (ids.size() > 10) throw new GarageStore.Invalid("Choose at most 10 services.");
        List<Line> lines = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Object o : ids) {
            String id = o instanceof String s ? s : "";
            GarageStore.Svc svc = g.services().stream().filter(x -> x.id().equals(id)).findFirst()
                    .orElseThrow(() -> new GarageStore.Invalid("That service isn't offered by this garage."));
            if (seen.add(id)) lines.add(new Line(svc.name(), g.mode().equals(GarageStore.MODE_LISTING) ? svc.price() : 0));
        }

        String vehicle = text(b, "vehicle", "Car make and model", 2, 60, true, false);
        String plate = text(b, "plate", "Number plate", 2, 10, true, false).toUpperCase(java.util.Locale.ROOT);
        if (!plate.matches("[A-Z0-9][A-Z0-9 -]{0,9}") || plate.replaceAll("[ -]", "").length() < 2) {
            throw new GarageStore.Invalid("Number plate can only contain letters, numbers, spaces and dashes.");
        }
        String notes = text(b, "notes", "Note for the garage", 0, 120, false, false);
        String date = b.get("date") instanceof String s ? s.trim() : "";
        String time = b.get("time") instanceof String s ? s.trim() : "";
        try {
            LocalDate d = LocalDate.parse(date);
            // One day of slack so garages and drivers in different time zones can still book "today".
            if (d.isBefore(LocalDate.now().minusDays(1)) || d.isAfter(LocalDate.now().plusYears(1))) {
                throw new GarageStore.Invalid("Choose a date within the next year.");
            }
            time = LocalTime.parse(time).toString();
        } catch (DateTimeParseException e) {
            throw new GarageStore.Invalid("Choose a valid date and time.");
        }

        Appt a = new Appt();
        a.id = newId();
        a.garageId = g.id();
        a.garageName = g.name();
        a.customerEmail = customerEmail.toLowerCase();
        a.customerName = customerName;
        a.vehicle = vehicle;
        a.plate = plate;
        a.date = date;
        a.time = time;
        a.notes = notes;
        a.status = REQUESTED;
        a.services = lines;
        a.createdAt = a.updatedAt = Instant.now().toString();
        a.messages.add(new Msg("system", "", "Appointment requested for " + date + " at " + time + ".", a.createdAt));
        a.unreadGarage = 1;
        appts.put(a.id, a);
        persist();
        return detailJson(a, "customer", g);
    }

    synchronized List<Object> listForCustomer(String email) {
        List<Appt> mine = new ArrayList<>();
        for (Appt a : appts.values()) if (a.customerEmail.equalsIgnoreCase(email)) mine.add(a);
        return summaries(mine, "customer");
    }

    // ---------- garage side ----------

    synchronized List<Object> listForGarage(String ownerEmail, GarageStore gs) {
        GarageStore.Garage g = gs.findByOwner(ownerEmail);
        if (g == null) return new ArrayList<>();
        List<Appt> mine = new ArrayList<>();
        for (Appt a : appts.values()) if (a.garageId.equals(g.id())) mine.add(a);
        return summaries(mine, "garage");
    }

    // ---------- shared ----------

    /** Opening an appointment marks it as read for the viewer. */
    synchronized Map<String, Object> detail(String id, String viewer, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, gs);
        int before = role.equals("customer") ? a.unreadCustomer : a.unreadGarage;
        if (before > 0) {
            if (role.equals("customer")) a.unreadCustomer = 0;
            else a.unreadGarage = 0;
            persist();
        }
        return detailJson(a, role, gs.find(a.garageId));
    }

    synchronized Map<String, Object> post(String id, String viewer, Map<String, Object> b, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, gs);
        if (!OPEN.contains(a.status) && !a.status.equals(COMPLETED)) {
            throw new GarageStore.Invalid("This appointment is closed, so messages can't be added.");
        }
        String body = text(b, "text", "Message", 1, 300, true, false);
        if (a.messages.size() >= MAX_MESSAGES) throw new GarageStore.Invalid("This conversation has reached its message limit.");
        addMessage(a, role, body, role);
        a.updatedAt = Instant.now().toString();
        persist();
        return detailJson(a, role, gs.find(a.garageId));
    }

    synchronized Map<String, Object> changeStatus(String id, String viewer, Map<String, Object> b, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, gs);
        String next = b.get("status") instanceof String s ? s : "";
        Map<String, List<String>> rules = role.equals("garage") ? GARAGE_NEXT : CUSTOMER_NEXT;
        if (!rules.getOrDefault(a.status, List.of()).contains(next)) {
            throw new Denied("You can't change an appointment from \"" + label(a.status) + "\" to \"" + label(next) + "\".");
        }
        String note = text(b, "note", "Note", 0, 200, false, false);
        if (a.messages.size() + 2 > MAX_MESSAGES) throw new GarageStore.Invalid("This conversation has reached its message limit.");

        a.status = next;
        a.updatedAt = Instant.now().toString();
        String who = role.equals("garage") ? a.garageName : a.customerName;
        addMessage(a, "system", "Status: " + label(next) + " (" + who + ")", role);
        if (!note.isEmpty()) addMessage(a, role, note, role);
        persist();
        return detailJson(a, role, gs.find(a.garageId));
    }

    // ---------- helpers ----------

    private String roleOf(Appt a, String viewer, GarageStore gs) {
        if (a.customerEmail.equalsIgnoreCase(viewer)) return "customer";
        GarageStore.Garage g = gs.find(a.garageId);
        if (g != null && g.ownerEmail().equalsIgnoreCase(viewer)) return "garage";
        throw new NotFound("Appointment not found.");
    }

    /** Adds a message. `actor` is who caused it ("customer" or "garage"); only the other side gets an unread mark. */
    private void addMessage(Appt a, String from, String text, String actor) {
        String name = from.equals("customer") ? a.customerName : from.equals("garage") ? a.garageName : "";
        a.messages.add(new Msg(from, name, text, Instant.now().toString()));
        if (actor.equals("customer")) a.unreadGarage++;
        else a.unreadCustomer++;
    }

    private static String text(Map<String, Object> b, String key, String label, int min, int max, boolean required, boolean multiline) {
        String s = b.get(key) instanceof String x ? x.replace("\r\n", "\n").replace('\r', '\n').trim() : "";
        if (s.isEmpty() && !required) return "";
        if (s.length() < Math.max(min, 1)) throw new GarageStore.Invalid(label + " is required.");
        if (s.length() > max) throw new GarageStore.Invalid(label + " must be at most " + max + " characters.");
        for (char c : s.toCharArray()) {
            boolean ok = !(c < 0x20 || c == 0x7f) || (multiline && (c == '\n' || c == '\t'));
            if (!ok) throw new GarageStore.Invalid(label + " contains invalid characters.");
        }
        return s;
    }

    private String newId() {
        String id;
        do {
            byte[] r = new byte[8];
            random.nextBytes(r);
            StringBuilder sb = new StringBuilder();
            for (byte x : r) sb.append(String.format("%02x", x));
            id = sb.toString();
        } while (appts.containsKey(id));
        return id;
    }

    private static int total(Appt a) {
        int t = 0;
        for (Line l : a.services) t += l.price();
        return t;
    }

    private static List<Object> summaries(List<Appt> list, String role) {
        list.sort(Comparator.comparing((Appt a) -> a.updatedAt).reversed());
        List<Object> out = new ArrayList<>();
        for (Appt a : list) {
            List<Object> names = new ArrayList<>();
            for (Line l : a.services) names.add(l.name());
            out.add(Json.obj("id", a.id, "garageId", a.garageId, "garageName", a.garageName,
                    "customerName", a.customerName, "vehicle", a.vehicle, "plate", a.plate, "date", a.date, "time", a.time,
                    "status", a.status, "statusLabel", label(a.status), "services", names, "total", total(a),
                    "unread", role.equals("customer") ? a.unreadCustomer : a.unreadGarage, "updatedAt", a.updatedAt));
        }
        return out;
    }

    private static Map<String, Object> detailJson(Appt a, String role, GarageStore.Garage g) {
        List<Object> services = new ArrayList<>();
        for (Line l : a.services) services.add(Json.obj("name", l.name(), "price", l.price()));
        List<Object> messages = new ArrayList<>();
        for (Msg m : a.messages) messages.add(Json.obj("from", m.from(), "name", m.name(), "text", m.text(), "at", m.at()));
        List<String> allowed = (role.equals("garage") ? GARAGE_NEXT : CUSTOMER_NEXT).getOrDefault(a.status, List.of());
        List<Object> actions = new ArrayList<>();
        for (String s : allowed) actions.add(Json.obj("status", s, "label", label(s)));
        return Json.obj("id", a.id, "role", role, "garageId", a.garageId, "garageName", a.garageName,
                "garagePhone", g == null ? "" : g.phone(), "garageAddress", g == null ? "" : g.address(),
                "customerName", a.customerName, "vehicle", a.vehicle, "plate", a.plate, "date", a.date, "time", a.time, "notes", a.notes,
                "status", a.status, "statusLabel", label(a.status), "services", services, "total", total(a),
                "createdAt", a.createdAt, "updatedAt", a.updatedAt, "messages", messages, "actions", actions,
                "canChat", OPEN.contains(a.status) || a.status.equals(COMPLETED));
    }

    // ---------- persistence ----------

    private void persist() throws IOException {
        List<Object> all = new ArrayList<>();
        for (Appt a : appts.values()) {
            List<Object> services = new ArrayList<>();
            for (Line l : a.services) services.add(Json.obj("name", l.name(), "price", l.price()));
            List<Object> messages = new ArrayList<>();
            for (Msg m : a.messages) messages.add(Json.obj("from", m.from(), "name", m.name(), "text", m.text(), "at", m.at()));
            all.add(Json.obj("id", a.id, "garageId", a.garageId, "garageName", a.garageName,
                    "customerEmail", a.customerEmail, "customerName", a.customerName, "vehicle", a.vehicle, "plate", a.plate,
                    "date", a.date, "time", a.time, "notes", a.notes, "status", a.status,
                    "createdAt", a.createdAt, "updatedAt", a.updatedAt, "services", services, "messages", messages,
                    "unreadCustomer", a.unreadCustomer, "unreadGarage", a.unreadGarage));
        }
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, Json.write(Json.obj("appointments", all)), StandardCharsets.UTF_8);
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    @SuppressWarnings("unchecked")
    private void load() throws IOException {
        Map<String, Object> root = Json.parseObject(Files.readString(file, StandardCharsets.UTF_8));
        for (Object o : (List<Object>) root.getOrDefault("appointments", List.of())) {
            Map<String, Object> m = (Map<String, Object>) o;
            Appt a = new Appt();
            a.id = (String) m.get("id");
            a.garageId = (String) m.get("garageId");
            a.garageName = (String) m.get("garageName");
            a.customerEmail = (String) m.get("customerEmail");
            a.customerName = (String) m.get("customerName");
            a.vehicle = (String) m.get("vehicle");
            a.plate = (String) m.getOrDefault("plate", "");
            a.date = (String) m.get("date");
            a.time = (String) m.get("time");
            a.notes = (String) m.getOrDefault("notes", "");
            a.status = (String) m.get("status");
            a.createdAt = (String) m.get("createdAt");
            a.updatedAt = (String) m.get("updatedAt");
            for (Object so : (List<Object>) m.getOrDefault("services", List.of())) {
                Map<String, Object> s = (Map<String, Object>) so;
                a.services.add(new Line((String) s.get("name"), ((Number) s.get("price")).intValue()));
            }
            for (Object mo : (List<Object>) m.getOrDefault("messages", List.of())) {
                Map<String, Object> s = (Map<String, Object>) mo;
                a.messages.add(new Msg((String) s.get("from"), (String) s.get("name"), (String) s.get("text"), (String) s.get("at")));
            }
            a.unreadCustomer = ((Number) m.getOrDefault("unreadCustomer", 0)).intValue();
            a.unreadGarage = ((Number) m.getOrDefault("unreadGarage", 0)).intValue();
            appts.put(a.id, a);
        }
    }
}

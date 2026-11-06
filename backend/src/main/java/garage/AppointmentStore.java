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
 * Workflow:  requested -> booked -> at_garage -> in_progress -> completed -> picked_up
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
    static final String PICKED_UP = "picked_up";
    static final String DECLINED = "declined";
    static final String CANCELLED = "cancelled";

    private static final Map<String, String> LABELS = Map.of(
            REQUESTED, "Waiting for the garage to accept",
            BOOKED, "Appointment booked",
            AT_GARAGE, "Car at the garage",
            IN_PROGRESS, "Work in progress",
            COMPLETED, "Work completed",
            PICKED_UP, "Car picked up",
            DECLINED, "Declined by the garage",
            CANCELLED, "Cancelled");

    private static final Set<String> OPEN = Set.of(REQUESTED, BOOKED, AT_GARAGE, IN_PROGRESS);

    private static final Map<String, List<String>> GARAGE_NEXT = Map.of(
            REQUESTED, List.of(BOOKED, DECLINED),
            BOOKED, List.of(AT_GARAGE, CANCELLED),
            AT_GARAGE, List.of(IN_PROGRESS),
            IN_PROGRESS, List.of(COMPLETED),
            COMPLETED, List.of(PICKED_UP));

    private static final Map<String, List<String>> CUSTOMER_NEXT = Map.of(
            REQUESTED, List.of(CANCELLED),
            BOOKED, List.of(CANCELLED),
            COMPLETED, List.of(PICKED_UP));

    private static final int MAX_OPEN_PER_CUSTOMER = 5;
    private static final int MAX_MESSAGES = 300;
    private static final int MAX_TOTAL = 50_000;

    private record Line(String name, int price) {}

    /** Extra work found during the job: a part or labour, priced by the garage. */
    private record Work(String kind, String text, int qty, int unit) {}

    private record Check(String item, String state, String note) {}

    /** The workshop's job card for one appointment: intake details, inspection, extra work and the estimate approval. */
    private static final class Card {
        int odometer;            // 0 = not recorded
        String fuel = "";
        String technician = "";
        List<Check> checks = new ArrayList<>();
        List<Work> work = new ArrayList<>();
        String estimate = "none"; // none | sent | approved | declined
        int estimateTotal;        // extra-work total at the moment it was sent
        String updatedAt = "";
    }

    static final List<String> CHECK_ITEMS = List.of("Brakes", "Tires", "Lights", "Battery", "Fluids", "Wipers", "Suspension", "Engine bay");
    private static final List<String> CHECK_STATES = List.of("ok", "attention", "notchecked");
    private static final List<String> FUEL = List.of("Empty", "1/4", "1/2", "3/4", "Full");

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
        String payStatus = "unpaid"; // unpaid | reported (customer says paid) | paid (garage confirmed)
        String payMethod = "";
        int rating;                  // 0 = no review yet
        String reviewComment = "";
        String reviewAt = "";
        Card card;                   // null until the garage opens the job card
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
            if (seen.add(id)) lines.add(new Line(svc.name(), g.mode().equals(GarageStore.MODE_LISTING) ? svc.finalPrice() : 0));
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
    synchronized Map<String, Object> detail(String id, String viewer, String as, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, as, gs);
        int before = role.equals("customer") ? a.unreadCustomer : a.unreadGarage;
        if (before > 0) {
            if (role.equals("customer")) a.unreadCustomer = 0;
            else a.unreadGarage = 0;
            persist();
        }
        return detailJson(a, role, gs.find(a.garageId));
    }

    synchronized Map<String, Object> post(String id, String viewer, String as, Map<String, Object> b, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, as, gs);
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

    synchronized Map<String, Object> changeStatus(String id, String viewer, String as, Map<String, Object> b, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, as, gs);
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

    // ---------- job card ----------

    private static boolean cardOpen(String status) {
        return status.equals(BOOKED) || status.equals(AT_GARAGE) || status.equals(IN_PROGRESS) || status.equals(COMPLETED);
    }

    /**
     * Garage saves the job card. Body: {odometer, fuel, technician, checklist:[{item,state,note}], work:[{kind,text,qty,unit}]}.
     * Changing the extra work after the customer approved it sends the estimate back to "none" so it must be approved again.
     */
    synchronized Map<String, Object> saveCard(String id, String viewer, String as, Map<String, Object> b, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, as, gs);
        if (!role.equals("garage")) throw new Denied("Only the garage fills in the job card.");
        if (!cardOpen(a.status)) throw new Denied("The job card is locked once the car is picked up, or if the appointment was declined or cancelled.");

        Card c = new Card();
        double odo = b.get("odometer") instanceof Number n ? n.doubleValue() : 0;
        if (odo != Math.rint(odo) || odo < 0 || odo > 2_000_000) throw new GarageStore.Invalid("Odometer must be a whole number up to 2,000,000.");
        c.odometer = (int) odo;
        c.fuel = b.get("fuel") instanceof String f ? f : "";
        if (!c.fuel.isEmpty() && !FUEL.contains(c.fuel)) throw new GarageStore.Invalid("Choose a fuel level from the list.");
        c.technician = text(b, "technician", "Technician", 0, 40, false, false);

        if (b.get("checklist") instanceof List<?> l) {
            if (l.size() > CHECK_ITEMS.size()) throw new GarageStore.Invalid("Too many inspection items.");
            for (Object o : l) {
                if (!(o instanceof Map<?, ?> m)) throw new GarageStore.Invalid("Invalid inspection list.");
                @SuppressWarnings("unchecked") Map<String, Object> x = (Map<String, Object>) m;
                String item = x.get("item") instanceof String i ? i : "";
                String state = x.get("state") instanceof String st ? st : "";
                if (!CHECK_ITEMS.contains(item) || !CHECK_STATES.contains(state)) throw new GarageStore.Invalid("Invalid inspection item.");
                c.checks.add(new Check(item, state, text(x, "note", item + " note", 0, 80, false, false)));
            }
        }
        if (b.get("work") instanceof List<?> l) {
            if (l.size() > 30) throw new GarageStore.Invalid("At most 30 extra work lines.");
            for (Object o : l) {
                if (!(o instanceof Map<?, ?> m)) throw new GarageStore.Invalid("Invalid work list.");
                @SuppressWarnings("unchecked") Map<String, Object> x = (Map<String, Object>) m;
                String kind = x.get("kind") instanceof String k ? k : "";
                if (!kind.equals("part") && !kind.equals("labour")) throw new GarageStore.Invalid("Each line is a part or labour.");
                String what = text(x, "text", "Work description", 2, 60, true, false);
                double qty = x.get("qty") instanceof Number n ? n.doubleValue() : 0;
                double unit = x.get("unit") instanceof Number n ? n.doubleValue() : -1;
                if (qty != Math.rint(qty) || qty < 1 || qty > 99) throw new GarageStore.Invalid("Quantity must be 1 to 99.");
                if (unit != Math.rint(unit) || unit < 0 || unit > 10000) throw new GarageStore.Invalid("Price must be a whole number from 0 to 10000.");
                c.work.add(new Work(kind, what, (int) qty, (int) unit));
            }
        }
        Card old = a.card;
        c.estimate = old == null ? "none" : old.estimate;
        c.estimateTotal = old == null ? 0 : old.estimateTotal;
        int newExtra = 0;
        for (Work w : c.work) newExtra += w.qty() * w.unit();
        if (!c.estimate.equals("none") && newExtra != c.estimateTotal) {
            c.estimate = "none"; // changed after it was sent: must be sent again
            addMessage(a, "system", "Extra work was changed, so the estimate needs to be sent for approval again.", role);
        }
        c.updatedAt = Instant.now().toString();
        a.card = c;
        a.updatedAt = c.updatedAt;
        persist();
        return detailJson(a, role, gs.find(a.garageId));
    }

    /** Estimate approval for extra work. Garage: {action:"send"}. Customer: {action:"approve"|"decline"}. */
    synchronized Map<String, Object> estimate(String id, String viewer, String as, Map<String, Object> b, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, as, gs);
        String action = b.get("action") instanceof String x ? x : "";
        if (a.card == null || a.card.work.isEmpty()) throw new GarageStore.Invalid("There is no extra work to approve yet.");
        if (!OPEN.contains(a.status)) throw new Denied("Estimates can only be handled while the job is open.");
        int extra = extraTotal(a);
        if (role.equals("garage")) {
            if (!action.equals("send")) throw new Denied("Only the customer can approve or decline.");
            a.card.estimate = "sent";
            a.card.estimateTotal = extra;
            addMessage(a, "system", "Estimate sent: $" + extra + " of extra work needs your approval.", role);
        } else {
            if (!a.card.estimate.equals("sent")) throw new Denied("There is no estimate waiting for you.");
            if (action.equals("approve")) a.card.estimate = "approved";
            else if (action.equals("decline")) a.card.estimate = "declined";
            else throw new GarageStore.Invalid("Choose approve or decline.");
            addMessage(a, "system", a.customerName + " " + (action.equals("approve") ? "approved" : "declined") + " the $" + a.card.estimateTotal + " estimate.", role);
        }
        a.updatedAt = Instant.now().toString();
        persist();
        return detailJson(a, role, gs.find(a.garageId));
    }

    private static Map<String, Object> cardJson(Appt a) {
        Card c = a.card;
        List<Object> checks = new ArrayList<>();
        List<Object> work = new ArrayList<>();
        if (c != null) {
            for (Check k : c.checks) checks.add(Json.obj("item", k.item(), "state", k.state(), "note", k.note()));
            for (Work w : c.work) work.add(Json.obj("kind", w.kind(), "text", w.text(), "qty", w.qty(), "unit", w.unit(), "total", w.qty() * w.unit()));
        }
        int booked = 0;
        for (Line l : a.services) booked += l.price();
        return Json.obj("odometer", c == null ? 0 : c.odometer, "fuel", c == null ? "" : c.fuel,
                "technician", c == null ? "" : c.technician, "checklist", checks, "work", work,
                "estimate", c == null ? "none" : c.estimate, "estimateTotal", c == null ? 0 : c.estimateTotal,
                "extraTotal", extraTotal(a), "bookedTotal", booked, "exists", c != null);
    }

    // ---------- payment and reviews ----------

    private static final List<String> PAY_LABEL_KEYS = List.of("cash", "card", "transfer", "online");

    private static String payLabel(String m) {
        return switch (m) {
            case "cash" -> "cash";
            case "card" -> "card at the garage";
            case "transfer" -> "bank transfer";
            case "online" -> "online payment link";
            default -> m;
        };
    }

    /**
     * Payment is tracked, not processed: the customer pays the garage directly (cash, card at the garage, transfer, or the
     * garage's own online payment link). The customer reports it, and the garage confirms receipt.
     * Body: {action: "report", method} (customer) or {action: "confirm", method?} (garage).
     */
    synchronized Map<String, Object> pay(String id, String viewer, String as, Map<String, Object> b, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, as, gs);
        if (!a.status.equals(COMPLETED) && !a.status.equals(PICKED_UP)) {
            throw new Denied("Payment opens once the work is completed.");
        }
        if (a.payStatus.equals("paid")) throw new Denied("This appointment is already paid.");
        GarageStore.Garage g = gs.find(a.garageId);
        String action = b.get("action") instanceof String x ? x : "";
        String method = b.get("method") instanceof String x ? x : "";
        if (role.equals("customer")) {
            if (!action.equals("report")) throw new Denied("Only the garage can confirm a payment.");
            List<?> allowed = g == null ? List.of() : (List<?>) g.pay().get("methods");
            if (!allowed.contains(method)) throw new GarageStore.Invalid("Choose one of the ways this garage accepts payment.");
            a.payStatus = "reported";
            a.payMethod = method;
            addMessage(a, "system", "Payment: " + a.customerName + " says they paid by " + payLabel(method) + ".", role);
        } else {
            if (!action.equals("confirm")) throw new Denied("Customers report payments; the garage confirms them.");
            if (a.payMethod.isEmpty()) {
                if (!PAY_LABEL_KEYS.contains(method)) throw new GarageStore.Invalid("Choose how the customer paid.");
                a.payMethod = method;
            }
            a.payStatus = "paid";
            addMessage(a, "system", "Payment received (" + payLabel(a.payMethod) + "). Thank you!", role);
        }
        a.updatedAt = Instant.now().toString();
        persist();
        return detailJson(a, role, g);
    }

    /** One review per completed job, by the driver. Updates the garage's average rating. */
    synchronized Map<String, Object> review(String id, String viewer, String as, Map<String, Object> b, GarageStore gs) throws IOException {
        Appt a = appts.get(id);
        if (a == null) throw new NotFound("Appointment not found.");
        String role = roleOf(a, viewer, as, gs);
        if (!role.equals("customer")) throw new Denied("Only the driver can review the garage.");
        if (!a.status.equals(COMPLETED) && !a.status.equals(PICKED_UP)) throw new Denied("You can review once the work is completed.");
        if (a.rating > 0) throw new Denied("You already reviewed this job.");
        double r = b.get("rating") instanceof Number n ? n.doubleValue() : 0;
        if (r != Math.rint(r) || r < 1 || r > 5) throw new GarageStore.Invalid("Choose 1 to 5 stars.");
        a.reviewComment = text(b, "comment", "Review", 0, 140, false, false);
        a.rating = (int) r;
        a.reviewAt = Instant.now().toString();
        gs.applyReview(a.garageId, a.rating);
        addMessage(a, "system", a.customerName + " left a " + a.rating + "-star review.", role);
        a.updatedAt = a.reviewAt;
        persist();
        return detailJson(a, role, gs.find(a.garageId));
    }

    /** Latest reviews for a garage's public page. Names are shortened to first name and initial. */
    synchronized List<Object> reviewsFor(String garageId, int limit) {
        List<Appt> rated = new ArrayList<>();
        for (Appt a : appts.values()) if (a.garageId.equals(garageId) && a.rating > 0) rated.add(a);
        rated.sort(Comparator.comparing((Appt a) -> a.reviewAt).reversed());
        List<Object> out = new ArrayList<>();
        for (Appt a : rated) {
            if (out.size() >= limit) break;
            String[] parts = a.customerName.trim().split("\\s+");
            String who = parts[0] + (parts.length > 1 ? " " + parts[parts.length - 1].charAt(0) + "." : "");
            out.add(Json.obj("name", who, "rating", a.rating, "comment", a.reviewComment, "at", a.reviewAt));
        }
        return out;
    }

    // ---------- helpers ----------

    private String roleOf(Appt a, String viewer, String as, GarageStore gs) {
        if (a.customerEmail.equalsIgnoreCase(viewer) && as.equals("customer")) return "customer";
        GarageStore.Garage g = gs.find(a.garageId);
        if (g != null && g.ownerEmail().equalsIgnoreCase(viewer) && as.equals("garage")) return "garage";
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
        return t + extraTotal(a);
    }

    private static int extraTotal(Appt a) {
        int t = 0;
        if (a.card != null) for (Work w : a.card.work) t += w.qty() * w.unit();
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
                    "status", a.status, "statusLabel", label(a.status), "services", names, "total", total(a), "payStatus", a.payStatus,
                    "unread", role.equals("customer") ? a.unreadCustomer : a.unreadGarage, "updatedAt", a.updatedAt));
        }
        return out;
    }

    private static Map<String, Object> detailJson(Appt a, String role, GarageStore.Garage g) {
        List<Object> services = new ArrayList<>();
        for (Line l : a.services) services.add(Json.obj("name", l.name(), "price", l.price()));
        List<Object> messages = new ArrayList<>();
        for (Msg m : a.messages) messages.add(Json.obj("from", m.from(), "name", m.name(), "text", m.text(), "at", m.at()));
        boolean finished = a.status.equals(COMPLETED) || a.status.equals(PICKED_UP);
        List<String> allowed = (role.equals("garage") ? GARAGE_NEXT : CUSTOMER_NEXT).getOrDefault(a.status, List.of());
        List<Object> actions = new ArrayList<>();
        for (String s : allowed) actions.add(Json.obj("status", s, "label", label(s)));
        return Json.obj("id", a.id, "role", role, "garageId", a.garageId, "garageName", a.garageName,
                "garagePhone", g == null ? "" : g.phone(), "garageAddress", g == null ? "" : g.address(),
                "customerName", a.customerName, "vehicle", a.vehicle, "plate", a.plate, "date", a.date, "time", a.time, "notes", a.notes,
                "status", a.status, "statusLabel", label(a.status), "services", services, "total", total(a),
                "createdAt", a.createdAt, "updatedAt", a.updatedAt, "messages", messages, "actions", actions,
                "canChat", OPEN.contains(a.status) || a.status.equals(COMPLETED),
                "payStatus", a.payStatus, "payMethod", a.payMethod,
                "canPay", finished && !a.payStatus.equals("paid"),
                "canReview", finished && role.equals("customer") && a.rating == 0,
                "review", a.rating == 0 ? null : Json.obj("rating", a.rating, "comment", a.reviewComment, "at", a.reviewAt),
                "garagePay", g == null ? null : g.pay(),
                "card", cardJson(a), "cardItems", CHECK_ITEMS, "canEditCard", role.equals("garage") && cardOpen(a.status));
    }

    // ---------- persistence ----------

    private static Map<String, Object> cardStore(Card c) {
        List<Object> checks = new ArrayList<>();
        List<Object> work = new ArrayList<>();
        for (Check k : c.checks) checks.add(Json.obj("item", k.item(), "state", k.state(), "note", k.note()));
        for (Work w : c.work) work.add(Json.obj("kind", w.kind(), "text", w.text(), "qty", w.qty(), "unit", w.unit()));
        return Json.obj("odometer", c.odometer, "fuel", c.fuel, "technician", c.technician, "checks", checks, "work", work,
                "estimate", c.estimate, "estimateTotal", c.estimateTotal, "updatedAt", c.updatedAt);
    }

    @SuppressWarnings("unchecked")
    private static Card cardLoad(Map<String, Object> m) {
        Card c = new Card();
        c.odometer = ((Number) m.getOrDefault("odometer", 0)).intValue();
        c.fuel = (String) m.getOrDefault("fuel", "");
        c.technician = (String) m.getOrDefault("technician", "");
        for (Object o : (List<Object>) m.getOrDefault("checks", List.of())) {
            Map<String, Object> x = (Map<String, Object>) o;
            c.checks.add(new Check((String) x.get("item"), (String) x.get("state"), (String) x.getOrDefault("note", "")));
        }
        for (Object o : (List<Object>) m.getOrDefault("work", List.of())) {
            Map<String, Object> x = (Map<String, Object>) o;
            c.work.add(new Work((String) x.get("kind"), (String) x.get("text"), ((Number) x.get("qty")).intValue(), ((Number) x.get("unit")).intValue()));
        }
        c.estimate = (String) m.getOrDefault("estimate", "none");
        c.estimateTotal = ((Number) m.getOrDefault("estimateTotal", 0)).intValue();
        c.updatedAt = (String) m.getOrDefault("updatedAt", "");
        return c;
    }

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
                    "unreadCustomer", a.unreadCustomer, "unreadGarage", a.unreadGarage,
                    "payStatus", a.payStatus, "payMethod", a.payMethod, "rating", a.rating,
                    "reviewComment", a.reviewComment, "reviewAt", a.reviewAt, "card", a.card == null ? null : cardStore(a.card)));
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
            a.payStatus = (String) m.getOrDefault("payStatus", "unpaid");
            a.payMethod = (String) m.getOrDefault("payMethod", "");
            a.rating = ((Number) m.getOrDefault("rating", 0)).intValue();
            a.reviewComment = (String) m.getOrDefault("reviewComment", "");
            a.reviewAt = (String) m.getOrDefault("reviewAt", "");
            if (m.get("card") instanceof Map<?, ?> cm) a.card = cardLoad((Map<String, Object>) cm);
            appts.put(a.id, a);
        }
    }
}

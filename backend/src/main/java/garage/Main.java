package garage;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Garage directory backend. Zero dependencies (JDK 17+).
 *
 *   POST /api/signup       {name,email,password}  -> {token,user}
 *   POST /api/login        {email,password}       -> {token,user}
 *   GET  /api/me           (Bearer token)         -> {user}
 *   POST /api/logout       (Bearer token)         -> {ok}
 *   One account per email: every account is a driver, and any account may also set up a garage profile.
 *   GET  /api/catalog                            -> {services:[...]}  public: standard service list
 *   GET  /api/garages                             -> {garages:[...]}   public: published garages + service names, no prices
 *   GET  /api/garages/{id} (Bearer token)         -> {garage:{...}}    login required: services with prices
 *   GET  /api/my/garage    (Bearer token)         -> {garage:{...}|null}  the signed-in user's own garage profile
 *   PUT  /api/my/garage    (Bearer token)         -> {garage:{...}}    create/update that garage profile
 *
 * Also serves the built React app from ../frontend/dist on the same port.
 */
public final class Main {
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        Path dist = Path.of(System.getenv().getOrDefault("STATIC_DIR", "../frontend/dist")).toAbsolutePath().normalize();
        Path dataFile = Path.of(System.getenv().getOrDefault("DATA_FILE", "data/users.tsv"));
        UserStore store = new UserStore(dataFile);
        Path garagesFile = Path.of(System.getenv().getOrDefault("GARAGES_FILE", "data/garages.json"));
        boolean seedSamples = !"false".equalsIgnoreCase(System.getenv("SEED_SAMPLES"));
        GarageStore garageStore = new GarageStore(garagesFile, seedSamples);
        AppointmentStore appointments = new AppointmentStore(
                Path.of(System.getenv().getOrDefault("APPOINTMENTS_FILE", "data/appointments.json")));

        // Local by default. Set HOST=0.0.0.0 when running in a container or on a server behind a proxy.
        String host = System.getenv().getOrDefault("HOST", "127.0.0.1");
        HttpServer server = HttpServer.create(new InetSocketAddress(host, port), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.createContext("/api/signup", ex -> handle(ex, () -> signup(ex, store, garageStore)));
        server.createContext("/api/login", ex -> handle(ex, () -> login(ex, store, garageStore)));
        server.createContext("/api/me", ex -> handle(ex, () -> me(ex, store, garageStore)));
        server.createContext("/api/logout", ex -> handle(ex, () -> logout(ex, store)));
        server.createContext("/api/catalog", ex -> handle(ex, () -> catalog(ex)));
        server.createContext("/api/garages", ex -> handle(ex, () -> garages(ex, store, garageStore)));
        server.createContext("/api/my/garage", ex -> handle(ex, () -> myGarage(ex, store, garageStore)));
        server.createContext("/api/my/appointments", ex -> handle(ex, () -> garageAppointments(ex, store, garageStore, appointments)));
        server.createContext("/api/appointments", ex -> handle(ex, () -> appointmentsApi(ex, store, garageStore, appointments)));
        server.createContext("/", ex -> handle(ex, () -> serveStatic(ex, dist)));
        server.start();
        System.out.println("Garage Hub running at http://localhost:" + port + "  (static: " + dist + ")");
    }

    private interface Action { void run() throws Exception; }

    private static void handle(HttpExchange ex, Action a) throws IOException {
        try {
            a.run();
        } catch (GarageStore.Invalid e) {
            send(ex, 400, Json.write(Json.obj("error", e.getMessage())));
        } catch (AppointmentStore.NotFound e) {
            send(ex, 404, Json.write(Json.obj("error", e.getMessage())));
        } catch (AppointmentStore.Denied e) {
            send(ex, 403, Json.write(Json.obj("error", e.getMessage())));
        } catch (IllegalArgumentException e) {
            send(ex, 400, Json.write(Json.obj("error", "Invalid request")));
        } catch (Exception e) {
            e.printStackTrace();
            send(ex, 500, Json.write(Json.obj("error", "Server error")));
        } finally {
            ex.close();
        }
    }

    private static void signup(HttpExchange ex, UserStore store, GarageStore garageStore) throws Exception {
        if (!method(ex, "POST")) return;
        Map<String, String> b = Json.parseFlatObject(body(ex));
        String name = b.getOrDefault("name", "").trim();
        String email = b.getOrDefault("email", "").trim();
        String password = b.getOrDefault("password", "");
        if (name.isEmpty() || name.length() > 80) { error(ex, 400, "Please enter your name."); return; }
        if (!EMAIL.matcher(email).matches() || email.length() > 120) { error(ex, 400, "Please enter a valid email."); return; }
        if (password.length() < 8 || password.length() > 128) { error(ex, 400, "Password must be at least 8 characters."); return; }
        UserStore.User u = store.register(name, email, password);
        if (u == null) { error(ex, 409, "An account with that email already exists."); return; }
        send(ex, 201, Json.write(Json.obj("token", store.createSession(u), "user", userJson(u, garageStore))));
    }

    private static void login(HttpExchange ex, UserStore store, GarageStore garageStore) throws Exception {
        if (!method(ex, "POST")) return;
        Map<String, String> b = Json.parseFlatObject(body(ex));
        UserStore.User u = store.authenticate(b.getOrDefault("email", "").trim(), b.getOrDefault("password", ""));
        if (u == null) { error(ex, 401, "Incorrect email or password."); return; }
        send(ex, 200, Json.write(Json.obj("token", store.createSession(u), "user", userJson(u, garageStore))));
    }

    private static void me(HttpExchange ex, UserStore store, GarageStore garageStore) throws Exception {
        if (!method(ex, "GET")) return;
        UserStore.User u = store.userForToken(bearer(ex));
        if (u == null) { error(ex, 401, "Please sign in."); return; }
        send(ex, 200, Json.write(Json.obj("user", userJson(u, garageStore))));
    }

    private static void logout(HttpExchange ex, UserStore store) throws Exception {
        if (!method(ex, "POST")) return;
        store.endSession(bearer(ex));
        send(ex, 200, Json.write(Json.obj("ok", true)));
    }

    private static void catalog(HttpExchange ex) throws Exception {
        if (!method(ex, "GET")) return;
        send(ex, 200, Json.write(Json.obj("services", GarageStore.catalog())));
    }

    /** /api/garages (public list) and /api/garages/{id} (login required, includes prices). */
    private static void garages(HttpExchange ex, UserStore store, GarageStore garageStore) throws Exception {
        if (!method(ex, "GET")) return;
        String rest = ex.getRequestURI().getPath().substring("/api/garages".length());
        if (rest.isEmpty() || rest.equals("/")) {
            send(ex, 200, Json.write(Json.obj("garages", garageStore.publicList())));
            return;
        }
        UserStore.User u = store.userForToken(bearer(ex));
        if (u == null) { error(ex, 401, "Please sign in to see services and pricing."); return; }
        Map<String, Object> g = garageStore.detailFor(rest.substring(1), u.email());
        if (g == null) { error(ex, 404, "Garage not found."); return; }
        send(ex, 200, Json.write(Json.obj("garage", g)));
    }

    /** The signed-in user's own garage profile. Any account may have one; each can only touch its own. */
    private static void myGarage(HttpExchange ex, UserStore store, GarageStore garageStore) throws Exception {
        UserStore.User u = store.userForToken(bearer(ex));
        if (u == null) { error(ex, 401, "Please sign in."); return; }
        String m = ex.getRequestMethod();
        if (m.equals("GET")) {
            send(ex, 200, Json.write(Json.obj("garage", garageStore.ownerView(u.email()))));
        } else if (m.equals("PUT")) {
            Map<String, Object> saved = garageStore.save(u.email(), Json.parseObject(body(ex)));
            send(ex, 200, Json.write(Json.obj("garage", saved)));
        } else {
            send(ex, 405, Json.write(Json.obj("error", "Method not allowed")));
        }
    }

    /** GET /api/my/appointments: bookings made at the signed-in user's own garage. */
    private static void garageAppointments(HttpExchange ex, UserStore store, GarageStore garageStore, AppointmentStore appts) throws Exception {
        if (!method(ex, "GET")) return;
        UserStore.User u = store.userForToken(bearer(ex));
        if (u == null) { error(ex, 401, "Please sign in."); return; }
        send(ex, 200, Json.write(Json.obj("appointments", appts.listForGarage(u.email(), garageStore))));
    }

    /**
     * POST /api/appointments                    book (as a driver)
     * GET  /api/appointments                    my bookings as a driver
     * GET  /api/appointments/{id}               details + chat (driver or the garage's owner)
     * POST /api/appointments/{id}/messages      {text}
     * POST /api/appointments/{id}/status        {status, note?}
     */
    private static void appointmentsApi(HttpExchange ex, UserStore store, GarageStore garageStore, AppointmentStore appts) throws Exception {
        UserStore.User u = store.userForToken(bearer(ex));
        if (u == null) { error(ex, 401, "Please sign in."); return; }
        String rest = ex.getRequestURI().getPath().substring("/api/appointments".length());
        if (rest.endsWith("/") && rest.length() > 1) rest = rest.substring(0, rest.length() - 1);
        String m = ex.getRequestMethod();

        if (rest.isEmpty() || rest.equals("/")) {
            if (m.equals("GET")) {
                send(ex, 200, Json.write(Json.obj("appointments", appts.listForCustomer(u.email()))));
            } else if (m.equals("POST")) {
                Map<String, Object> created = appts.create(u.email(), u.name(), Json.parseObject(body(ex)), garageStore);
                send(ex, 201, Json.write(Json.obj("appointment", created)));
            } else {
                send(ex, 405, Json.write(Json.obj("error", "Method not allowed")));
            }
            return;
        }

        String[] parts = rest.substring(1).split("/");
        String id = parts[0];
        if (parts.length == 1) {
            if (!m.equals("GET")) { send(ex, 405, Json.write(Json.obj("error", "Method not allowed"))); return; }
            send(ex, 200, Json.write(Json.obj("appointment", appts.detail(id, u.email(), garageStore))));
        } else if (parts.length == 2 && parts[1].equals("messages")) {
            if (!m.equals("POST")) { send(ex, 405, Json.write(Json.obj("error", "Method not allowed"))); return; }
            send(ex, 200, Json.write(Json.obj("appointment", appts.post(id, u.email(), Json.parseObject(body(ex)), garageStore))));
        } else if (parts.length == 2 && parts[1].equals("status")) {
            if (!m.equals("POST")) { send(ex, 405, Json.write(Json.obj("error", "Method not allowed"))); return; }
            send(ex, 200, Json.write(Json.obj("appointment", appts.changeStatus(id, u.email(), Json.parseObject(body(ex)), garageStore))));
        } else {
            error(ex, 404, "Not found.");
        }
    }

    private static void serveStatic(HttpExchange ex, Path dist) throws IOException {
        String path = ex.getRequestURI().getPath();
        if (path.startsWith("/api/")) { send(ex, 404, Json.write(Json.obj("error", "Not found"))); return; }
        if (path.equals("/")) path = "/index.html";
        Path file = dist.resolve(path.substring(1)).normalize();
        if (!file.startsWith(dist) || !Files.isRegularFile(file)) {
            // Single-page app fallback.
            file = dist.resolve("index.html");
            if (!Files.isRegularFile(file)) {
                send(ex, 404, "Frontend not built. Run: cd frontend && npm run build");
                return;
            }
        }
        byte[] data = Files.readAllBytes(file);
        ex.getResponseHeaders().set("Content-Type", contentType(file.toString()));
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        ex.sendResponseHeaders(200, data.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(data); }
    }

    private static String contentType(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".ico")) return "image/x-icon";
        if (n.endsWith(".json") || n.endsWith(".map")) return "application/json";
        return "application/octet-stream";
    }

    private static Map<String, Object> userJson(UserStore.User u, GarageStore garageStore) {
        return Json.obj("name", u.name(), "email", u.email(), "hasGarage", garageStore.hasGarage(u.email()));
    }

    private static boolean method(HttpExchange ex, String m) throws IOException {
        if (ex.getRequestMethod().equals(m)) return true;
        send(ex, 405, Json.write(Json.obj("error", "Method not allowed")));
        return false;
    }

    private static String bearer(HttpExchange ex) {
        String h = ex.getRequestHeaders().getFirst("Authorization");
        return h != null && h.startsWith("Bearer ") ? h.substring(7).trim() : null;
    }

    private static String body(HttpExchange ex) throws IOException {
        byte[] data = ex.getRequestBody().readNBytes(64 * 1024 + 1);
        if (data.length > 64 * 1024) throw new IllegalArgumentException("Body too large");
        return new String(data, StandardCharsets.UTF_8);
    }

    private static void error(HttpExchange ex, int status, String msg) throws IOException {
        send(ex, status, Json.write(Json.obj("error", msg)));
    }

    private static void send(HttpExchange ex, int status, String json) throws IOException {
        byte[] data = json.getBytes(StandardCharsets.UTF_8);
        if (!ex.getResponseHeaders().containsKey("Content-Type")) {
            ex.getResponseHeaders().set("Content-Type", json.startsWith("{") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
        }
        ex.sendResponseHeaders(status, data.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(data); }
    }
}

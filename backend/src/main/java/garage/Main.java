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
 *   (signup also takes role: "customer" (default) or "garage")
 *   GET  /api/catalog                             -> {services:[...]}  public: standard service list
 *   GET  /api/garages                             -> {garages:[...]}   public: published garages + service names, no prices
 *   GET  /api/garages/{id} (Bearer token)         -> {garage:{...}}    login required: services with prices
 *   GET  /api/my/garage    (Bearer, garage role)  -> {garage:{...}|null}  the owner's own garage
 *   PUT  /api/my/garage    (Bearer, garage role)  -> {garage:{...}}    create/update the owner's garage
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

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.createContext("/api/signup", ex -> handle(ex, () -> signup(ex, store)));
        server.createContext("/api/login", ex -> handle(ex, () -> login(ex, store)));
        server.createContext("/api/me", ex -> handle(ex, () -> me(ex, store)));
        server.createContext("/api/logout", ex -> handle(ex, () -> logout(ex, store)));
        server.createContext("/api/catalog", ex -> handle(ex, () -> catalog(ex)));
        server.createContext("/api/garages", ex -> handle(ex, () -> garages(ex, store, garageStore)));
        server.createContext("/api/my/garage", ex -> handle(ex, () -> myGarage(ex, store, garageStore)));
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
        } catch (IllegalArgumentException e) {
            send(ex, 400, Json.write(Json.obj("error", "Invalid request")));
        } catch (Exception e) {
            e.printStackTrace();
            send(ex, 500, Json.write(Json.obj("error", "Server error")));
        } finally {
            ex.close();
        }
    }

    private static void signup(HttpExchange ex, UserStore store) throws Exception {
        if (!method(ex, "POST")) return;
        Map<String, String> b = Json.parseFlatObject(body(ex));
        String name = b.getOrDefault("name", "").trim();
        String email = b.getOrDefault("email", "").trim();
        String password = b.getOrDefault("password", "");
        if (name.isEmpty() || name.length() > 80) { error(ex, 400, "Please enter your name."); return; }
        if (!EMAIL.matcher(email).matches() || email.length() > 120) { error(ex, 400, "Please enter a valid email."); return; }
        if (password.length() < 8 || password.length() > 128) { error(ex, 400, "Password must be at least 8 characters."); return; }
        String roleRaw = b.getOrDefault("role", UserStore.CUSTOMER);
        if (!roleRaw.equals(UserStore.CUSTOMER) && !roleRaw.equals(UserStore.GARAGE)) { error(ex, 400, "Invalid account type."); return; }
        UserStore.User u = store.register(name, email, password, roleRaw);
        if (u == null) { error(ex, 409, "An account with that email already exists."); return; }
        send(ex, 201, Json.write(Json.obj("token", store.createSession(u), "user", userJson(u))));
    }

    private static void login(HttpExchange ex, UserStore store) throws Exception {
        if (!method(ex, "POST")) return;
        Map<String, String> b = Json.parseFlatObject(body(ex));
        UserStore.User u = store.authenticate(b.getOrDefault("email", "").trim(), b.getOrDefault("password", ""));
        if (u == null) { error(ex, 401, "Incorrect email or password."); return; }
        send(ex, 200, Json.write(Json.obj("token", store.createSession(u), "user", userJson(u))));
    }

    private static void me(HttpExchange ex, UserStore store) throws Exception {
        if (!method(ex, "GET")) return;
        UserStore.User u = store.userForToken(bearer(ex));
        if (u == null) { error(ex, 401, "Please sign in."); return; }
        send(ex, 200, Json.write(Json.obj("user", userJson(u))));
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

    /** The signed-in garage owner's own listing. Customers get 403. */
    private static void myGarage(HttpExchange ex, UserStore store, GarageStore garageStore) throws Exception {
        UserStore.User u = store.userForToken(bearer(ex));
        if (u == null) { error(ex, 401, "Please sign in."); return; }
        if (!UserStore.GARAGE.equals(u.role())) { error(ex, 403, "Only garage accounts can manage a garage."); return; }
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

    private static Map<String, Object> userJson(UserStore.User u) {
        return Json.obj("name", u.name(), "email", u.email(), "role", u.role());
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

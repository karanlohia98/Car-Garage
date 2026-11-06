package garage;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends short text notifications to a phone number over WhatsApp.
 *
 * With WHATSAPP_TOKEN and WHATSAPP_PHONE_ID set, messages go through the WhatsApp Business Cloud API. Business-started
 * messages outside a 24 hour customer window must use an approved template, so set WHATSAPP_TEMPLATE (a template with one
 * body variable) and optionally WHATSAPP_TEMPLATE_LANG (default en). Without those variables nothing leaves the server:
 * each message is appended to the outbox file instead, so the feature can be tried without any account.
 *
 * Sending never blocks or fails a request: it runs on its own thread and errors are only logged.
 */
final class Notifier {
    private final String token = env("WHATSAPP_TOKEN");
    private final String phoneId = env("WHATSAPP_PHONE_ID");
    private final String template = env("WHATSAPP_TEMPLATE");
    private final String templateLang = env("WHATSAPP_TEMPLATE_LANG").isEmpty() ? "en" : env("WHATSAPP_TEMPLATE_LANG");
    private final String defaultCode = "US".equals(GarageStore.country) ? "1" : "91";
    private final Path outbox;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ExecutorService pool = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "notifier");
        t.setDaemon(true);
        return t;
    });

    Notifier(Path outbox) {
        this.outbox = outbox;
    }

    private static String env(String k) {
        String v = System.getenv(k);
        return v == null ? "" : v.trim();
    }

    boolean live() {
        return !token.isEmpty() && !phoneId.isEmpty();
    }

    /** Digits only with country code, or "" when the number is unusable. */
    String normalize(String phone) {
        if (phone == null) return "";
        String d = phone.replaceAll("[^0-9]", "");
        if (phone.trim().startsWith("00")) d = d.substring(2);
        if (d.length() == 10) d = defaultCode + d;
        else if (d.length() == 11 && d.startsWith("0")) d = defaultCode + d.substring(1);
        return d.length() >= 11 && d.length() <= 15 ? d : "";
    }

    void send(String phone, String text) {
        String to = normalize(phone);
        if (to.isEmpty() || text == null || text.isBlank()) return;
        String msg = text.length() > 600 ? text.substring(0, 600) : text;
        pool.execute(() -> {
            try {
                if (live()) deliver(to, msg);
                else log("OUTBOX", to, msg);
            } catch (Exception e) {
                System.err.println("Notification failed: " + e.getMessage());
            }
        });
    }

    private void deliver(String to, String msg) throws IOException, InterruptedException {
        Object payload;
        if (!template.isEmpty()) {
            payload = Json.obj("messaging_product", "whatsapp", "to", to, "type", "template",
                    "template", Json.obj("name", template, "language", Json.obj("code", templateLang),
                            "components", java.util.List.of(Json.obj("type", "body",
                                    "parameters", java.util.List.of(Json.obj("type", "text", "text", msg.replace('\n', ' ')))))));
        } else {
            payload = Json.obj("messaging_product", "whatsapp", "to", to, "type", "text", "text", Json.obj("body", msg));
        }
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://graph.facebook.com/v21.0/" + phoneId + "/messages"))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(Json.write(payload)))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() / 100 != 2) {
            throw new IOException("WhatsApp API returned " + res.statusCode() + ": " + res.body());
        }
        log("SENT", to, msg);
    }

    private void log(String kind, String to, String msg) throws IOException {
        if (outbox == null) return;
        if (outbox.getParent() != null) Files.createDirectories(outbox.getParent());
        String masked = to.length() > 4 ? "*".repeat(to.length() - 4) + to.substring(to.length() - 4) : to;
        String line = Instant.now() + " " + kind + " " + masked + " " + msg.replace('\n', ' ') + "\n";
        Files.writeString(outbox, line, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }
}

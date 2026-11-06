package garage;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * The platform administrator: one account, separate from drivers and garage owners.
 * Only a PBKDF2 hash of the password is stored. The first time the server starts without an admin file it
 * generates a random username and password, stores the hash, and writes the plain credentials ONCE to a
 * separate git-ignored file (and the console) so the owner can note them down and delete that file.
 * Set ADMIN_USERNAME and ADMIN_PASSWORD to choose your own instead.
 */
final class AdminStore {
    private static final int ITERATIONS = 120_000;
    private static final long SESSION_MS = 4L * 60 * 60 * 1000;
    private static final int MAX_FAILS = 5;
    private static final long LOCK_MS = 10L * 60 * 1000;

    private final String username;
    private final String salt;
    private final String hash;
    private final Map<String, Long> sessions = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private int fails;          // guarded by "this"
    private long lockedUntil;   // guarded by "this"

    AdminStore(Path file, Path credentialsOut) throws IOException {
        String envUser = System.getenv("ADMIN_USERNAME");
        String envPass = System.getenv("ADMIN_PASSWORD");
        if (envUser != null && !envUser.isBlank() && envPass != null && envPass.length() >= 12) {
            username = envUser.trim();
            salt = newSalt();
            hash = hash(envPass, salt);
        } else if (Files.exists(file)) {
            Map<String, String> m = Json.parseFlatObject(Files.readString(file, StandardCharsets.UTF_8));
            username = m.get("username");
            salt = m.get("salt");
            hash = m.get("hash");
        } else {
            String user = "admin-" + token(4);
            String pass = token(15);
            username = user;
            salt = newSalt();
            hash = hash(pass, salt);
            if (file.getParent() != null) Files.createDirectories(file.getParent());
            Files.writeString(file, Json.write(Json.obj("username", username, "salt", salt, "hash", hash)), StandardCharsets.UTF_8);
            Files.writeString(credentialsOut, "Garage Hub admin sign-in (shown once - save it, then delete this file)\n"
                    + "Page:     /admin\nUsername: " + user + "\nPassword: " + pass + "\n", StandardCharsets.UTF_8);
            System.out.println("Created admin account. Credentials written to " + credentialsOut.toAbsolutePath());
        }
    }

    /** Returns a session token, or null if the credentials are wrong. Throws if temporarily locked. */
    String login(String user, String pass) {
        synchronized (this) {
            if (System.currentTimeMillis() < lockedUntil) {
                throw new GarageStore.Invalid("Too many attempts. Try again in a few minutes.");
            }
        }
        boolean ok = MessageDigest.isEqual(hash(pass, salt).getBytes(StandardCharsets.UTF_8), hash.getBytes(StandardCharsets.UTF_8))
                & MessageDigest.isEqual(user.getBytes(StandardCharsets.UTF_8), username.getBytes(StandardCharsets.UTF_8));
        synchronized (this) {
            if (!ok) {
                if (++fails >= MAX_FAILS) { lockedUntil = System.currentTimeMillis() + LOCK_MS; fails = 0; }
                return null;
            }
            fails = 0;
        }
        String t = token(24);
        sessions.put(t, System.currentTimeMillis() + SESSION_MS);
        return t;
    }

    boolean valid(String token) {
        if (token == null) return false;
        Long exp = sessions.get(token);
        if (exp == null) return false;
        if (exp < System.currentTimeMillis()) { sessions.remove(token); return false; }
        return true;
    }

    void logout(String token) { if (token != null) sessions.remove(token); }

    private String token(int bytes) {
        byte[] b = new byte[bytes];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private String newSalt() { return token(16); }

    private static String hash(String password, String salt) {
        try {
            KeySpec spec = new PBEKeySpec(password.toCharArray(), salt.getBytes(StandardCharsets.UTF_8), ITERATIONS, 256);
            return Base64.getEncoder().encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

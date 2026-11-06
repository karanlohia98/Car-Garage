package garage;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** File-backed user store with PBKDF2 password hashing, plus in-memory session tokens. */
final class UserStore {
    record User(String email, String name, String salt, String hash) {}

    private record Session(String email, long expiresAt) {}

    private static final int ITERATIONS = 120_000;
    private static final long SESSION_MS = 12L * 60 * 60 * 1000;

    private final Path file;
    private final Map<String, User> users = new ConcurrentHashMap<>();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    UserStore(Path file) throws IOException {
        this.file = file;
        if (file.getParent() != null) Files.createDirectories(file.getParent());
        if (Files.exists(file)) {
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            for (String line : lines) {
                String[] p = line.split("\t");
                if (p.length == 4) {
                    users.put(p[0], new User(p[0], new String(Base64.getDecoder().decode(p[1]), StandardCharsets.UTF_8), p[2], p[3]));
                }
            }
        }
    }

    synchronized User register(String name, String email, String password) throws IOException {
        String key = email.toLowerCase();
        if (users.containsKey(key)) return null;
        byte[] saltBytes = new byte[16];
        random.nextBytes(saltBytes);
        String salt = Base64.getEncoder().encodeToString(saltBytes);
        User u = new User(key, name, salt, hash(password, salt));
        users.put(key, u);
        String line = key + "\t" + Base64.getEncoder().encodeToString(name.getBytes(StandardCharsets.UTF_8))
                + "\t" + salt + "\t" + u.hash() + "\n";
        Files.writeString(file, line, StandardCharsets.UTF_8,
                java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
        return u;
    }

    User authenticate(String email, String password) {
        User u = users.get(email.toLowerCase());
        if (u == null) {
            // Burn comparable time so unknown emails aren't distinguishable by speed.
            hash(password, "AAAAAAAAAAAAAAAAAAAAAA==");
            return null;
        }
        byte[] a = hash(password, u.salt()).getBytes(StandardCharsets.UTF_8);
        byte[] b = u.hash().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(a, b) ? u : null;
    }

    String createSession(User u) {
        byte[] t = new byte[32];
        random.nextBytes(t);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(t);
        sessions.put(token, new Session(u.email(), System.currentTimeMillis() + SESSION_MS));
        return token;
    }

    User userForToken(String token) {
        if (token == null) return null;
        Session s = sessions.get(token);
        if (s == null) return null;
        if (s.expiresAt() < System.currentTimeMillis()) {
            sessions.remove(token);
            return null;
        }
        return users.get(s.email());
    }

    void endSession(String token) {
        if (token != null) sessions.remove(token);
    }

    private static String hash(String password, String salt) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), Base64.getDecoder().decode(salt), ITERATIONS, 256);
            byte[] h = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return Base64.getEncoder().encodeToString(h);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}

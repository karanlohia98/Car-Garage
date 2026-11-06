package garage;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Tiny JSON helper: parses flat objects of string values, writes maps/lists/strings/numbers. */
final class Json {
    private Json() {}

    static Map<String, String> parseFlatObject(String s) {
        Map<String, String> out = new LinkedHashMap<>();
        int[] i = {0};
        skipWs(s, i);
        expect(s, i, '{');
        skipWs(s, i);
        if (peek(s, i) == '}') return out;
        while (true) {
            skipWs(s, i);
            String key = readString(s, i);
            skipWs(s, i);
            expect(s, i, ':');
            skipWs(s, i);
            char c = peek(s, i);
            String value;
            if (c == '"') {
                value = readString(s, i);
            } else {
                int start = i[0];
                while (i[0] < s.length() && ",}".indexOf(s.charAt(i[0])) < 0) i[0]++;
                value = s.substring(start, i[0]).trim();
            }
            out.put(key, value);
            skipWs(s, i);
            char n = peek(s, i);
            i[0]++;
            if (n == '}') break;
            if (n != ',') throw new IllegalArgumentException("Invalid JSON");
        }
        return out;
    }

    private static char peek(String s, int[] i) {
        if (i[0] >= s.length()) throw new IllegalArgumentException("Invalid JSON");
        return s.charAt(i[0]);
    }

    private static void expect(String s, int[] i, char c) {
        if (peek(s, i) != c) throw new IllegalArgumentException("Invalid JSON");
        i[0]++;
    }

    private static void skipWs(String s, int[] i) {
        while (i[0] < s.length() && Character.isWhitespace(s.charAt(i[0]))) i[0]++;
    }

    private static String readString(String s, int[] i) {
        expect(s, i, '"');
        StringBuilder sb = new StringBuilder();
        while (true) {
            char c = peek(s, i);
            i[0]++;
            if (c == '"') break;
            if (c == '\\') {
                char e = peek(s, i);
                i[0]++;
                switch (e) {
                    case 'n' -> sb.append('\n');
                    case 't' -> sb.append('\t');
                    case 'r' -> sb.append('\r');
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'u' -> {
                        if (i[0] + 4 > s.length()) throw new IllegalArgumentException("Invalid JSON");
                        sb.append((char) Integer.parseInt(s.substring(i[0], i[0] + 4), 16));
                        i[0] += 4;
                    }
                    default -> sb.append(e);
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    static String write(Object o) {
        StringBuilder sb = new StringBuilder();
        write(o, sb);
        return sb.toString();
    }

    private static void write(Object o, StringBuilder sb) {
        if (o == null) {
            sb.append("null");
        } else if (o instanceof String str) {
            sb.append('"');
            for (char c : str.toCharArray()) {
                switch (c) {
                    case '"' -> sb.append("\\\"");
                    case '\\' -> sb.append("\\\\");
                    case '\n' -> sb.append("\\n");
                    case '\r' -> sb.append("\\r");
                    case '\t' -> sb.append("\\t");
                    default -> {
                        if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                        else sb.append(c);
                    }
                }
            }
            sb.append('"');
        } else if (o instanceof Number || o instanceof Boolean) {
            sb.append(o);
        } else if (o instanceof Map<?, ?> m) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                write(String.valueOf(e.getKey()), sb);
                sb.append(':');
                write(e.getValue(), sb);
            }
            sb.append('}');
        } else if (o instanceof List<?> l) {
            sb.append('[');
            for (int k = 0; k < l.size(); k++) {
                if (k > 0) sb.append(',');
                write(l.get(k), sb);
            }
            sb.append(']');
        } else {
            throw new IllegalArgumentException("Unsupported type " + o.getClass());
        }
    }

    static Map<String, Object> obj(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    static List<Object> list(List<?> items) {
        return new ArrayList<>(items);
    }
}

package garage;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Small JSON reader/writer.
 * parse() returns Map&lt;String,Object&gt;, List&lt;Object&gt;, String, Double, Boolean or null.
 */
final class Json {
    private Json() {}

    private static final int MAX_DEPTH = 32;

    // ---------- parsing ----------

    static Object parse(String s) {
        int[] i = {0};
        Object v = value(s, i, 0);
        skipWs(s, i);
        if (i[0] != s.length()) throw new IllegalArgumentException("Invalid JSON");
        return v;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> parseObject(String s) {
        Object v = parse(s);
        if (!(v instanceof Map)) throw new IllegalArgumentException("Expected JSON object");
        return (Map<String, Object>) v;
    }

    /** Parses an object and returns its string-like values as strings (non-scalars are ignored). */
    static Map<String, String> parseFlatObject(String s) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : parseObject(s).entrySet()) {
            Object v = e.getValue();
            if (v instanceof String || v instanceof Number || v instanceof Boolean) out.put(e.getKey(), String.valueOf(v));
        }
        return out;
    }

    private static Object value(String s, int[] i, int depth) {
        if (depth > MAX_DEPTH) throw new IllegalArgumentException("Invalid JSON");
        skipWs(s, i);
        char c = peek(s, i);
        switch (c) {
            case '{': return object(s, i, depth);
            case '[': return array(s, i, depth);
            case '"': return readString(s, i);
            case 't': literal(s, i, "true"); return Boolean.TRUE;
            case 'f': literal(s, i, "false"); return Boolean.FALSE;
            case 'n': literal(s, i, "null"); return null;
            default: return number(s, i);
        }
    }

    private static Map<String, Object> object(String s, int[] i, int depth) {
        Map<String, Object> out = new LinkedHashMap<>();
        expect(s, i, '{');
        skipWs(s, i);
        if (peek(s, i) == '}') { i[0]++; return out; }
        while (true) {
            skipWs(s, i);
            String key = readString(s, i);
            skipWs(s, i);
            expect(s, i, ':');
            out.put(key, value(s, i, depth + 1));
            skipWs(s, i);
            char n = peek(s, i);
            i[0]++;
            if (n == '}') return out;
            if (n != ',') throw new IllegalArgumentException("Invalid JSON");
        }
    }

    private static List<Object> array(String s, int[] i, int depth) {
        List<Object> out = new ArrayList<>();
        expect(s, i, '[');
        skipWs(s, i);
        if (peek(s, i) == ']') { i[0]++; return out; }
        while (true) {
            out.add(value(s, i, depth + 1));
            skipWs(s, i);
            char n = peek(s, i);
            i[0]++;
            if (n == ']') return out;
            if (n != ',') throw new IllegalArgumentException("Invalid JSON");
        }
    }

    private static Double number(String s, int[] i) {
        int start = i[0];
        while (i[0] < s.length() && "+-0123456789.eE".indexOf(s.charAt(i[0])) >= 0) i[0]++;
        if (start == i[0]) throw new IllegalArgumentException("Invalid JSON");
        try {
            return Double.parseDouble(s.substring(start, i[0]));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid JSON");
        }
    }

    private static void literal(String s, int[] i, String word) {
        if (!s.startsWith(word, i[0])) throw new IllegalArgumentException("Invalid JSON");
        i[0] += word.length();
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
                        try {
                            sb.append((char) Integer.parseInt(s.substring(i[0], i[0] + 4), 16));
                        } catch (NumberFormatException ex) {
                            throw new IllegalArgumentException("Invalid JSON");
                        }
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

    // ---------- writing ----------

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

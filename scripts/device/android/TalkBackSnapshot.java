import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** TalkBack을 유지한 채 접근성 트리만 읽는 shell 관찰기. Android SDK 없이 컴파일한다. */
public final class TalkBackSnapshot {
    private static final int KEEP_SERVICES = 1;
    private static final int MAX_NODES = 6000;
    private static final int MAX_DEPTH = 100;
    private static int nodeCount;
    private static Class<?> nodeClass;
    private static Class<?> windowClass;
    private static Class<?> rectClass;

    private TalkBackSnapshot() {}

    public static void main(String[] args) {
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("schemaVersion", 1);
        Object automation = null;
        Object handlerThread = null;
        boolean connected = false;
        Throwable failure = null;
        try {
            if ((args.length != 3 && args.length != 4) || !args[0].matches("[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
                    || !validPackage(args[1]) || !validPackage(args[2]) || args[1].equals(args[2])
                    || (args.length == 4 && (!validPackage(args[3]) || args[3].equals(args[1]) || args[3].equals(args[2])))) {
                throw new IllegalArgumentException("Expected request ID, application package, TalkBack package, optional IME package");
            }
            result.put("requestId", args[0]);
            List<String> allowedPackages = new ArrayList<String>();
            allowedPackages.add(args[1]);
            allowedPackages.add(args[2]);
            if (args.length == 4) allowedPackages.add(args[3]);
            result.put("allowedPackages", allowedPackages);
            result.put("startedAtEpochMs", System.currentTimeMillis());
            Class<?> threadClass = Class.forName("android.os.HandlerThread");
            Class<?> looperClass = Class.forName("android.os.Looper");
            Class<?> connectionInterface = Class.forName("android.app.IUiAutomationConnection");
            Class<?> connectionClass = Class.forName("android.app.UiAutomationConnection");
            Class<?> automationClass = Class.forName("android.app.UiAutomation");
            nodeClass = Class.forName("android.view.accessibility.AccessibilityNodeInfo");
            windowClass = Class.forName("android.view.accessibility.AccessibilityWindowInfo");
            rectClass = Class.forName("android.graphics.Rect");

            handlerThread = threadClass.getConstructor(String.class).newInstance("StorePriceTalkBackObserver");
            ((Thread) handlerThread).start();
            Object looper = call(threadClass, handlerThread, "getLooper");
            Object connection = connectionClass.getConstructor().newInstance();
            Constructor<?> constructor = automationClass.getConstructor(looperClass, connectionInterface);
            automation = constructor.newInstance(looper, connection);

            // 인자 없는 connect()는 TalkBack을 억제한다. 서비스 유지 플래그를 반드시 명시한다.
            automationClass.getMethod("connect", int.class).invoke(automation, KEEP_SERVICES);
            connected = true;
            int flags = ((Number) call(automationClass, automation, "getFlags")).intValue();
            if (flags != KEEP_SERVICES) throw new IllegalStateException("UiAutomation service suppression flags changed");
            result.put("uiAutomationFlags", flags);

            Class<?> serviceInfoClass = Class.forName("android.accessibilityservice.AccessibilityServiceInfo");
            Object serviceInfo = call(automationClass, automation, "getServiceInfo");
            if (serviceInfo == null) throw new IllegalStateException("Observer service is not connected");
            Field infoFlags = serviceInfoClass.getField("flags");
            int readFlags = infoFlags.getInt(serviceInfo)
                    | serviceInfoClass.getField("FLAG_INCLUDE_NOT_IMPORTANT_VIEWS").getInt(null)
                    | serviceInfoClass.getField("FLAG_REPORT_VIEW_IDS").getInt(null)
                    | serviceInfoClass.getField("FLAG_RETRIEVE_INTERACTIVE_WINDOWS").getInt(null);
            // 관찰기 자신의 조회 범위만 넓힌다. TalkBack 설정·포커스·화면을 변경하지 않는다.
            infoFlags.setInt(serviceInfo, readFlags);
            automationClass.getMethod("setServiceInfo", serviceInfoClass).invoke(automation, serviceInfo);
            result.put("observerServiceFlags", readFlags);

            // 시스템 알림 창은 읽지 않는다. 화면이 바뀌면 같은 연결에서 최대 두 번만 다시 조회한다.
            for (int attempt = 1; attempt <= 3; attempt++) {
                nodeCount = 0;
                try {
                    Map<String, Object> snapshot = readWindows(automationClass, automation, allowedPackages);
                    result.putAll(snapshot);
                    result.put("captureAttempts", attempt);
                    break;
                } catch (IllegalStateException error) {
                    if (attempt == 3 || !error.getMessage().startsWith("Snapshot transient:")) throw error;
                    call(automationClass, automation, "clearCache");
                    Thread.sleep(120);
                }
            }
            result.put("nodeCount", nodeCount);
            result.put("capturedAtEpochMs", System.currentTimeMillis());
            result.put("uptimeMs", call(Class.forName("android.os.SystemClock"), null, "uptimeMillis"));
        } catch (Throwable error) {
            failure = unwrap(error);
        } finally {
            // 실패했어도 관찰 연결을 정리한다. 정리 실패 시 성공 JSON을 출력하지 않는다.
            if (automation != null && connected) {
                try {
                    call(Class.forName("android.app.UiAutomation"), automation, "disconnect");
                    result.put("disconnected", true);
                } catch (Throwable error) {
                    result.put("disconnectError", unwrap(error).toString());
                    if (failure == null) failure = unwrap(error);
                }
            }
            if (handlerThread != null) {
                try {
                    call(Class.forName("android.os.HandlerThread"), handlerThread, "quitSafely");
                    ((Thread) handlerThread).join(2000);
                } catch (Throwable error) {
                    if (failure == null) failure = unwrap(error);
                }
            }
        }
        result.put("status", failure == null ? "ok" : "error");
        if (failure != null) result.put("error", failure.toString());
        System.out.println(json(result));
        // app_process의 Binder 스레드를 남기지 않고 이번 관찰 프로세스만 종료한다.
        System.exit(failure == null ? 0 : 1);
    }

    private static boolean validPackage(String value) {
        return value.length() <= 255 && value.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+");
    }

    private static Map<String, Object> readWindows(Class<?> automationClass, Object automation,
            List<String> allowedPackages) throws Exception {
        List<?> windows = (List<?>) call(automationClass, automation, "getWindows");
        if (windows == null || windows.isEmpty()) throw new IllegalStateException("Snapshot transient: no windows");
        List<Object> windowData = new ArrayList<Object>();
        int ignoredWindows = 0;
        try {
            for (Object window : windows) {
                if (window == null) throw new IllegalStateException("Snapshot transient: null window");
                Object root = call(windowClass, window, "getRoot");
                if (root == null) { ignoredWindows++; continue; }
                String packageName = text(call(nodeClass, root, "getPackageName"));
                if (!allowedPackages.contains(packageName)) {
                    call(nodeClass, root, "recycle");
                    ignoredWindows++;
                    continue;
                }
                Map<String, Object> data = new LinkedHashMap<String, Object>();
                // 허용된 앱의 창임을 확인한 뒤에만 제목·내용을 수집한다.
                data.put("id", call(windowClass, window, "getId"));
                data.put("type", call(windowClass, window, "getType"));
                data.put("layer", call(windowClass, window, "getLayer"));
                data.put("title", text(call(windowClass, window, "getTitle")));
                data.put("active", call(windowClass, window, "isActive"));
                data.put("inputFocused", call(windowClass, window, "isFocused"));
                data.put("accessibilityFocused", call(windowClass, window, "isAccessibilityFocused"));
                data.put("bounds", bounds(windowClass, window));
                data.put("root", readNode(root, 0));
                windowData.add(data);
            }
        } finally {
            for (Object window : windows) {
                if (window != null) call(windowClass, window, "recycle");
            }
        }
        // 설정 화면도 관찰하되 실제 앱 창 필수 조건은 JS 파서의 기본 정책에서 검사한다.
        if (windowData.isEmpty() || nodeCount == 0) throw new IllegalStateException("Snapshot transient: allowed root missing");
        Map<String, Object> snapshot = new LinkedHashMap<String, Object>();
        snapshot.put("windows", windowData);
        snapshot.put("ignoredWindowCount", ignoredWindows);
        return snapshot;
    }

    private static Map<String, Object> readNode(Object node, int depth) throws Exception {
        try {
            if (++nodeCount > MAX_NODES || depth > MAX_DEPTH) {
                throw new IllegalStateException("Accessibility tree exceeds bounded observation limits");
            }
            Map<String, Object> data = new LinkedHashMap<String, Object>();
            data.put("id", text(call(nodeClass, node, "getViewIdResourceName")));
            data.put("packageName", text(call(nodeClass, node, "getPackageName")));
            data.put("className", text(call(nodeClass, node, "getClassName")));
            data.put("text", text(call(nodeClass, node, "getText")));
            data.put("desc", text(call(nodeClass, node, "getContentDescription")));
            data.put("hint", text(call(nodeClass, node, "getHintText")));
            data.put("stateDescription", text(call(nodeClass, node, "getStateDescription")));
            data.put("bounds", bounds(nodeClass, node));
            data.put("windowId", call(nodeClass, node, "getWindowId"));
            data.put("accessibilityFocused", call(nodeClass, node, "isAccessibilityFocused"));
            data.put("inputFocused", call(nodeClass, node, "isFocused"));
            data.put("focusable", call(nodeClass, node, "isFocusable"));
            data.put("enabled", call(nodeClass, node, "isEnabled"));
            data.put("visible", call(nodeClass, node, "isVisibleToUser"));
            data.put("clickable", call(nodeClass, node, "isClickable"));
            data.put("selected", call(nodeClass, node, "isSelected"));
            data.put("checkable", call(nodeClass, node, "isCheckable"));
            data.put("checked", call(nodeClass, node, "isChecked"));
            data.put("editable", call(nodeClass, node, "isEditable"));
            data.put("scrollable", call(nodeClass, node, "isScrollable"));
            data.put("password", call(nodeClass, node, "isPassword"));
            int childCount = ((Number) call(nodeClass, node, "getChildCount")).intValue();
            List<Object> children = new ArrayList<Object>();
            for (int index = 0; index < childCount; index++) {
                Object child = nodeClass.getMethod("getChild", int.class).invoke(node, index);
                // 조회 중 사라진 노드를 누락한 성공 결과로 취급하지 않는다. 새 스냅샷으로 재시도한다.
                if (child == null) throw new IllegalStateException("Snapshot transient: accessibility child disappeared");
                children.add(readNode(child, depth + 1));
            }
            data.put("children", children);
            return data;
        } finally {
            call(nodeClass, node, "recycle");
        }
    }

    private static List<Integer> bounds(Class<?> owner, Object value) throws Exception {
        Object rect = rectClass.getConstructor().newInstance();
        owner.getMethod("getBoundsInScreen", rectClass).invoke(value, rect);
        List<Integer> values = new ArrayList<Integer>();
        for (String name : new String[] {"left", "top", "right", "bottom"}) {
            values.add(rectClass.getField(name).getInt(rect));
        }
        return values;
    }

    private static Object call(Class<?> owner, Object receiver, String method) throws Exception {
        return owner.getMethod(method).invoke(receiver);
    }

    private static String text(Object value) {
        return value == null ? null : value.toString();
    }

    private static Throwable unwrap(Throwable error) {
        while (error instanceof InvocationTargetException && ((InvocationTargetException) error).getCause() != null) {
            error = ((InvocationTargetException) error).getCause();
        }
        return error;
    }

    // 외부 JSON 라이브러리·Android SDK 의존성 없이 한국어와 제어 문자를 보존한다.
    private static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        StringBuilder out = new StringBuilder();
        if (value instanceof Map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (!first) out.append(',');
                first = false;
                out.append(json(entry.getKey().toString())).append(':').append(json(entry.getValue()));
            }
            return out.append('}').toString();
        }
        if (value instanceof Iterable) {
            out.append('[');
            boolean first = true;
            for (Object entry : (Iterable<?>) value) {
                if (!first) out.append(',');
                first = false;
                out.append(json(entry));
            }
            return out.append(']').toString();
        }
        out.append('"');
        String string = value.toString();
        for (int index = 0; index < string.length(); index++) {
            char ch = string.charAt(index);
            if (ch == '"' || ch == '\\') out.append('\\').append(ch);
            else if (ch < 0x20 || Character.isSurrogate(ch)) {
                String hex = Integer.toHexString(ch);
                out.append("\\u");
                for (int padding = hex.length(); padding < 4; padding++) out.append('0');
                out.append(hex);
            } else out.append(ch);
        }
        return out.append('"').toString();
    }
}

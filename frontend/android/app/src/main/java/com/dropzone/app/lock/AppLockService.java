package com.dropzone.app.lock;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

public class AppLockService extends AccessibilityService {

    private static final String SYSTEM_UI = "com.android.systemui";

    private static AppLockService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable recheck = this::evaluate;
    private final BroadcastReceiver clockReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            evaluate();
        }
    };

    private WindowManager windowManager;
    private View overlay;
    private String foregroundPackage;
    private boolean receiverRegistered;
    private MinutesUsage usage;

    public static boolean isEnabled(Context context) {
        String enabled = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) {
            return false;
        }
        ComponentName expected = new ComponentName(context, AppLockService.class);
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabled);
        while (splitter.hasNext()) {
            ComponentName component = ComponentName.unflattenFromString(splitter.next());
            if (expected.equals(component)) {
                return true;
            }
        }
        return false;
    }

    public static void onConfigChanged() {
        AppLockService service = instance;
        if (service != null) {
            service.handler.post(service::evaluate);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        usage = MinutesUsage.load(this);
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (!receiverRegistered) {
            IntentFilter filter = new IntentFilter();
            filter.addAction(Intent.ACTION_TIME_CHANGED);
            filter.addAction(Intent.ACTION_TIMEZONE_CHANGED);
            filter.addAction(Intent.ACTION_SCREEN_OFF);
            filter.addAction(Intent.ACTION_SCREEN_ON);
            filter.addAction(Intent.ACTION_USER_PRESENT);
            ContextCompat.registerReceiver(this, clockReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
            receiverRegistered = true;
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.getPackageName() == null) {
            return;
        }
        String packageName = event.getPackageName().toString();
        if (!packageName.equals(getPackageName()) && isTransient(packageName)) {
            return;
        }
        foregroundPackage = packageName;
        evaluate();
    }

    private void evaluate() {
        handler.removeCallbacks(recheck);
        LockClock now = LockClock.now(this);
        commitUsage(now);
        AppLockConfig config = AppLockConfig.load(this);
        long used = usage.used(config.budgetDay);
        String packageName = foregroundPackage;
        boolean own = getPackageName().equals(packageName);
        if (overlay != null && (own || !config.enabled || config.isOpen(used, now))) {
            hideOverlay();
        }
        if (own || !awake()) {
            return;
        }
        LockDecision decision = LockDecision.decide(config, packageName, used, now);
        switch (decision.action) {
            case COUNT:
                usage.start(config.budgetDay, now);
                handler.postDelayed(recheck, decision.recheckMs);
                break;
            case OPEN:
                handler.postDelayed(recheck, decision.recheckMs);
                break;
            case LOCK:
                performGlobalAction(GLOBAL_ACTION_HOME);
                showOverlay(config);
                break;
            default:
                break;
        }
    }

    private void commitUsage(LockClock now) {
        if (usage.commit(now)) {
            usage.save(this);
        }
    }

    private boolean awake() {
        PowerManager power = getSystemService(PowerManager.class);
        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        return (power == null || power.isInteractive()) && (keyguard == null || !keyguard.isKeyguardLocked());
    }

    private boolean isTransient(String packageName) {
        if (SYSTEM_UI.equals(packageName)) {
            return true;
        }
        String ime = Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        return ime != null && ime.startsWith(packageName + "/");
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(recheck);
        commitUsage(LockClock.now(this));
        if (receiverRegistered) {
            unregisterReceiver(clockReceiver);
            receiverRegistered = false;
        }
        hideOverlay();
        if (instance == this) {
            instance = null;
        }
        super.onDestroy();
    }

    private void showOverlay(AppLockConfig config) {
        if (overlay != null || windowManager == null) {
            return;
        }
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.CENTER;
        overlay = buildOverlay(config);
        try {
            windowManager.addView(overlay, params);
        } catch (Exception e) {
            overlay = null;
        }
    }

    private void hideOverlay() {
        if (overlay != null && windowManager != null) {
            try {
                windowManager.removeView(overlay);
            } catch (Exception ignored) {
            }
        }
        overlay = null;
    }

    private void openApp() {
        hideOverlay();
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            startActivity(launch);
        }
    }

    private View buildOverlay(AppLockConfig config) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F20D0A2B"));
        root.setClickable(true);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        column.setPadding(dp(32), dp(32), dp(32), dp(32));

        TextView badge = new TextView(this);
        badge.setText("LOCKED");
        badge.setTextColor(Color.parseColor("#FF2E7E"));
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setLetterSpacing(0.3f);
        badge.setGravity(Gravity.CENTER);
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setShape(GradientDrawable.OVAL);
        badgeBg.setColor(Color.parseColor("#17123F"));
        badgeBg.setStroke(dp(3), Color.parseColor("#FF2E7E"));
        badge.setBackground(badgeBg);
        column.addView(badge, new LinearLayout.LayoutParams(dp(120), dp(120)));

        TextView title = new TextView(this);
        title.setText(config.title);
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
        title.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        title.setAllCaps(true);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(28);
        column.addView(title, titleParams);

        TextView message = new TextView(this);
        message.setText(config.message);
        message.setTextColor(Color.parseColor("#9A93C9"));
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = dp(12);
        column.addView(message, messageParams);

        TextView open = new TextView(this);
        open.setText("OPEN DROPZONE");
        open.setTextColor(Color.WHITE);
        open.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        open.setTypeface(Typeface.DEFAULT_BOLD);
        open.setLetterSpacing(0.08f);
        open.setGravity(Gravity.CENTER);
        GradientDrawable openBg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{Color.parseColor("#FF4B91"), Color.parseColor("#FF1F6D")});
        openBg.setCornerRadius(dp(14));
        open.setBackground(openBg);
        open.setOnClickListener(v -> openApp());
        LinearLayout.LayoutParams openParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        openParams.topMargin = dp(36);
        column.addView(open, openParams);

        TextView close = new TextView(this);
        close.setText("Close");
        close.setTextColor(Color.parseColor("#9A93C9"));
        close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        close.setGravity(Gravity.CENTER);
        close.setOnClickListener(v -> hideOverlay());
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
        closeParams.topMargin = dp(8);
        column.addView(close, closeParams);

        root.addView(column, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        return root;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }
}

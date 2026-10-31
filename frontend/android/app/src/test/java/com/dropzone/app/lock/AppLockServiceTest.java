package com.dropzone.app.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.os.Looper;
import android.os.PowerManager;
import android.view.accessibility.AccessibilityEvent;

import com.dropzone.app.MainActivity;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;
import org.robolectric.shadow.api.Shadow;
import org.robolectric.shadows.ShadowWindowManagerImpl;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 36)
public class AppLockServiceTest {

    private static final String INSTAGRAM = "com.instagram.android";
    private static final String TODAY = LocalDate.now().toString();

    private final Context context = RuntimeEnvironment.getApplication();
    private ServiceController<AppLockService> controller;
    private AppLockService service;

    private void configure(int minutesBudget) {
        AppLockConfig.create(true, List.of(INSTAGRAM), null, minutesBudget, TODAY, AppLockConfig.endOfDay(TODAY, ZoneId.systemDefault()),
            "Locked", "Clear your quests", LockClock.now(context), null).save(context);
    }

    private void start() {
        controller = Robolectric.buildService(AppLockService.class).create();
        service = controller.get();
        service.onServiceConnected();
    }

    private void open(String packageName) {
        open(packageName, null);
    }

    private void open(String packageName, String className) {
        AccessibilityEvent event = new AccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED);
        event.setPackageName(packageName);
        event.setClassName(className);
        service.onAccessibilityEvent(event);
        idle(Duration.ZERO);
    }

    private void idle(Duration duration) {
        shadowOf(Looper.getMainLooper()).idleFor(duration);
    }

    private boolean overlayShown() {
        ShadowWindowManagerImpl windows = Shadow.extract(service.getSystemService(Context.WINDOW_SERVICE));
        return !windows.getViews().isEmpty();
    }

    private boolean sentHome() {
        return shadowOf(service).getGlobalActionsPerformed().contains(AccessibilityService.GLOBAL_ACTION_HOME);
    }

    private long usedToday() {
        return MinutesUsage.load(context).used(TODAY);
    }

    @After
    public void tearDown() {
        if (controller != null) {
            controller.destroy();
        }
    }

    @Test
    public void lockedAppInFrontShowsTheOverlay() {
        configure(0);
        start();
        open(INSTAGRAM);
        assertTrue(sentHome());
        assertTrue(overlayShown());
        open(context.getPackageName(), MainActivity.class.getName());
        assertFalse(overlayShown());
    }

    @Test
    public void theLockWindowItselfDoesNotHideTheOverlay() {
        configure(0);
        start();
        open(INSTAGRAM);
        open(context.getPackageName(), "android.widget.FrameLayout");
        assertTrue(overlayShown());
        open(context.getPackageName(), MainActivity.class.getName());
        assertFalse(overlayShown());
    }

    @Test
    public void otherAppsAreLeftAlone() {
        configure(0);
        start();
        open("com.android.chrome");
        assertFalse(sentHome());
        assertFalse(overlayShown());
    }

    @Test
    public void earnedMinutesKeepTheAppOpenUntilUsedUp() {
        configure(1);
        start();
        open(INSTAGRAM);
        assertFalse(overlayShown());
        idle(Duration.ofSeconds(30));
        assertFalse(overlayShown());
        idle(Duration.ofSeconds(31));
        assertTrue(sentHome());
        assertTrue(overlayShown());
        assertEquals(AppLockConfig.MINUTE_MS, usedToday());
    }

    @Test
    public void usedUpBudgetLocksRightAway() {
        configure(1);
        context.getSharedPreferences(AppLockConfig.PREFS, Context.MODE_PRIVATE).edit().putString("minutesUsed", TODAY + "=60000").commit();
        start();
        open(INSTAGRAM);
        assertTrue(sentHome());
        assertTrue(overlayShown());
    }

    @Test
    public void timeAwayFromLockedAppsIsNotCounted() {
        configure(1);
        start();
        open(INSTAGRAM);
        idle(Duration.ofSeconds(20));
        open("com.android.chrome");
        idle(Duration.ofMinutes(1));
        assertEquals(20_000L, usedToday());
        open(INSTAGRAM);
        idle(Duration.ofSeconds(10));
        shadowOf(context.getSystemService(PowerManager.class)).setIsInteractive(false);
        context.sendBroadcast(new Intent(Intent.ACTION_SCREEN_OFF));
        idle(Duration.ofMinutes(1));
        assertEquals(30_000L, usedToday());
        assertFalse(overlayShown());
    }
}

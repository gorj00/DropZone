package com.dropzone.app;

import android.app.Activity;
import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Bundle;

import java.util.Arrays;

public class DropZoneApplication extends Application {

    private int started;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityStarted(Activity activity) {
                started++;
            }

            @Override
            public void onActivityStopped(Activity activity) {
                started = Math.max(0, started - 1);
                if (started == 0 && !activity.isChangingConfigurations()) {
                    IconTheme.apply(DropZoneApplication.this);
                }
            }

            @Override
            public void onActivityCreated(Activity activity, Bundle state) {
            }

            @Override
            public void onActivityResumed(Activity activity) {
            }

            @Override
            public void onActivityPaused(Activity activity) {
            }

            @Override
            public void onActivitySaveInstanceState(Activity activity, Bundle state) {
            }

            @Override
            public void onActivityDestroyed(Activity activity) {
            }
        });
    }

    private void createNotificationChannels() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        manager.createNotificationChannels(Arrays.asList(
            new NotificationChannel("reminders", getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_DEFAULT),
            new NotificationChannel("community", getString(R.string.channel_community), NotificationManager.IMPORTANCE_DEFAULT),
            new NotificationChannel("community-quiet", getString(R.string.channel_community_quiet), NotificationManager.IMPORTANCE_LOW),
            new NotificationChannel("account", getString(R.string.channel_account), NotificationManager.IMPORTANCE_DEFAULT)
        ));
    }
}

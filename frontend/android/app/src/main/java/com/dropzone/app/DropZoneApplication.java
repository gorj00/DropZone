package com.dropzone.app;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;

import java.util.Arrays;

public class DropZoneApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        manager.createNotificationChannels(Arrays.asList(
            new NotificationChannel("reminders", getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_DEFAULT),
            new NotificationChannel("community", getString(R.string.channel_community), NotificationManager.IMPORTANCE_DEFAULT),
            new NotificationChannel("account", getString(R.string.channel_account), NotificationManager.IMPORTANCE_DEFAULT)
        ));
    }
}

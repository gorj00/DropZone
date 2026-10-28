package com.dropzone.app;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        Intent notifications = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        notifications.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null));
        for (Intent intent : new Intent[] { notifications, details }) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
                call.resolve();
                return;
            } catch (Exception ignored) {
            }
        }
        call.reject("Unable to open notification settings");
    }
}

package com.dropzone.app;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.telephony.TelephonyManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

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

    @PluginMethod
    public void setIconTheme(PluginCall call) {
        String theme = call.getString("theme");
        if (!IconTheme.isValid(theme)) {
            call.reject("Unknown theme");
            return;
        }
        IconTheme.request(getContext(), theme);
        call.resolve();
    }

    @PluginMethod
    public void getRegion(PluginCall call) {
        String sim = "";
        String network = "";
        try {
            TelephonyManager telephony = getContext().getSystemService(TelephonyManager.class);
            if (telephony != null) {
                sim = telephony.getSimCountryIso();
                network = telephony.getNetworkCountryIso();
            }
        } catch (Exception ignored) {
        }
        JSObject result = new JSObject();
        result.put("sim", sim == null ? "" : sim.toUpperCase(Locale.ROOT));
        result.put("network", network == null ? "" : network.toUpperCase(Locale.ROOT));
        result.put("locale", Locale.getDefault().getCountry());
        call.resolve(result);
    }
}

package com.dropzone.app;

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

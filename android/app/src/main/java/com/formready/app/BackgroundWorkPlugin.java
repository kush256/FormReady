package com.formready.app;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Lets a long job keep running with the app off screen, and says when it ends.
 *
 * Nothing here touches the file. The work stays in the WebView, where it has
 * always been and where it stays private; this only asks Android not to freeze
 * the process while that work is going on, and posts a notification when it
 * finishes so the user does not have to keep checking.
 */
@CapacitorPlugin(
        name = "BackgroundWork",
        permissions = {
                @Permission(alias = BackgroundWorkPlugin.NOTIFY, strings = { Manifest.permission.POST_NOTIFICATIONS })
        }
)
public class BackgroundWorkPlugin extends Plugin {

    static final String NOTIFY = "notify";
    private static final int DONE_ID = 4102;

    @Override
    public void load() {
        BackgroundWorkService.createChannel(getContext());
    }

    /** Whether this device will show a notification at all. */
    @PluginMethod
    public void canNotify(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasNotificationPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (hasNotificationPermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias(NOTIFY, call, "notificationResult");
    }

    @PermissionCallback
    private void notificationResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasNotificationPermission());
        call.resolve(result);
    }

    /** Starts, or updates, the ongoing notification that keeps the process alive. */
    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundWorkService.class);
        intent.putExtra(BackgroundWorkService.EXTRA_TITLE, call.getString("title", "Preparing your file"));
        String text = call.getString("text");
        if (text != null) intent.putExtra(BackgroundWorkService.EXTRA_TEXT, text);
        Integer progress = call.getInt("progress");
        if (progress != null) intent.putExtra(BackgroundWorkService.EXTRA_PROGRESS, progress);

        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            // Some OEM builds refuse this outright. The job still runs while the
            // app is open, so this is reported rather than thrown.
            call.reject("Could not keep working in the background.", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BackgroundWorkService.class));
        call.resolve();
    }

    /** The point of the whole thing: a note when the work is done. */
    @PluginMethod
    public void notifyDone(PluginCall call) {
        if (!hasNotificationPermission()) {
            call.resolve();
            return;
        }
        Intent open = new Intent(getContext(), MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(
                getContext(), 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(getContext(), BackgroundWorkService.CHANNEL_ID)
                        .setContentTitle(call.getString("title", "Your file is ready"))
                        .setSmallIcon(android.R.drawable.stat_sys_download_done)
                        .setAutoCancel(true)
                        .setContentIntent(tap)
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        String text = call.getString("text");
        if (text != null) builder.setContentText(text);

        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(DONE_ID, builder.build());
        call.resolve();
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }
}

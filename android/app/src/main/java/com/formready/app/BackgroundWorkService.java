package com.formready.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Keeps the app alive while a long job runs.
 *
 * Compression happens in a web worker, which will keep working with the app off
 * screen — but only while the process is allowed to run at all. Android freezes
 * a backgrounded app within seconds of it becoming cached, and nothing in the
 * WebView can prevent that. A foreground service can: it is the one thing that
 * tells the system this process is still doing work the user asked for.
 *
 * The ongoing notification is not decoration, it is the price of the service,
 * so it carries the progress rather than saying nothing.
 */
public class BackgroundWorkService extends Service {

    static final String CHANNEL_ID = "formready.work";
    private static final int NOTIFICATION_ID = 4101;

    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_PROGRESS = "progress";

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null && intent.hasExtra(EXTRA_TITLE)
                ? intent.getStringExtra(EXTRA_TITLE)
                : "Working";
        String text = intent != null && intent.hasExtra(EXTRA_TEXT)
                ? intent.getStringExtra(EXTRA_TEXT)
                : null;
        int progress = intent != null ? intent.getIntExtra(EXTRA_PROGRESS, -1) : -1;

        startForeground(NOTIFICATION_ID, build(title, text, progress));
        // Not sticky: if the system kills the process the job is gone with it,
        // and restarting the service alone would light up a notification with
        // nothing behind it.
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification build(String title, String text, int progress) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(
                this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(tap)
                .setPriority(NotificationCompat.PRIORITY_LOW);

        if (text != null) builder.setContentText(text);
        if (progress >= 0) builder.setProgress(100, Math.min(100, progress), false);
        else builder.setProgress(0, 0, true);

        return builder.build();
    }

    static void createChannel(android.content.Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "File preparation", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Progress while a file is being prepared, and a note when it is done.");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }
}

package com.formready.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.provider.MediaStore;
import android.os.Environment;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedOutputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Writes a finished document into the device's public Downloads folder so it
 * survives, and shows up in the Files app, instead of living in app cache
 * where Android is free to delete it.
 *
 * Uses MediaStore, which needs no storage permission on Android 10 and above.
 *
 * The write is streamed in chunks. Handing a whole document across the bridge
 * in one call means holding it three times over — the blob, its base64 text,
 * and the decoded byte array — which is what killed the app on a 171 MB merge.
 * Streaming keeps the peak cost to one chunk.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    private static final String SUBFOLDER = Environment.DIRECTORY_DOWNLOADS + "/FormReady";
    private static final String LOCATION = "Downloads/FormReady";

    private static class PendingWrite {
        Uri item;
        OutputStream out;
        long bytesWritten;
    }

    private final Map<String, PendingWrite> pending = new ConcurrentHashMap<>();
    private final AtomicLong nextToken = new AtomicLong(1);

    /** Creates the destination file and opens it for writing. */
    @PluginMethod
    public void beginWrite(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (fileName == null) {
            call.reject("fileName is required");
            return;
        }

        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, SUBFOLDER);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri item = resolver.insert(collection, values);
            if (item == null) {
                call.reject("Could not create the file in Downloads");
                return;
            }

            OutputStream stream = resolver.openOutputStream(item);
            if (stream == null) {
                resolver.delete(item, null, null);
                call.reject("Could not open the file for writing");
                return;
            }

            PendingWrite write = new PendingWrite();
            write.item = item;
            write.out = new BufferedOutputStream(stream, 1 << 16);
            write.bytesWritten = 0;

            String token = "w" + nextToken.getAndIncrement();
            pending.put(token, write);

            JSObject result = new JSObject();
            result.put("token", token);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not start saving: " + e.getMessage(), e);
        }
    }

    /** Appends one base64 chunk. Chunks must be cut on 3-byte boundaries. */
    @PluginMethod
    public void writeChunk(PluginCall call) {
        String token = call.getString("token");
        String data = call.getString("data");
        if (token == null || data == null) {
            call.reject("token and data are required");
            return;
        }

        PendingWrite write = pending.get(token);
        if (write == null) {
            call.reject("This save is no longer open");
            return;
        }

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            write.out.write(bytes);
            write.bytesWritten += bytes.length;

            JSObject result = new JSObject();
            result.put("bytesWritten", write.bytesWritten);
            call.resolve(result);
        } catch (Exception e) {
            discard(token, write);
            call.reject("Could not write to the file: " + e.getMessage(), e);
        }
    }

    /** Closes the file and publishes it so other apps can see it. */
    @PluginMethod
    public void finishWrite(PluginCall call) {
        String token = call.getString("token");
        PendingWrite write = token == null ? null : pending.remove(token);
        if (write == null) {
            call.reject("This save is no longer open");
            return;
        }

        try {
            write.out.flush();
            write.out.close();

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContext().getContentResolver().update(write.item, values, null, null);

            JSObject result = new JSObject();
            result.put("uri", write.item.toString());
            result.put("location", LOCATION);
            result.put("bytesWritten", write.bytesWritten);
            call.resolve(result);
        } catch (Exception e) {
            removeFile(write.item);
            call.reject("Could not finish saving: " + e.getMessage(), e);
        }
    }

    /** Cancels a half-written file and deletes it. */
    @PluginMethod
    public void abortWrite(PluginCall call) {
        String token = call.getString("token");
        PendingWrite write = token == null ? null : pending.remove(token);
        if (write != null) discard(token, write);
        call.resolve();
    }

    private void discard(String token, PendingWrite write) {
        pending.remove(token);
        try {
            write.out.close();
        } catch (Exception ignored) {
        }
        removeFile(write.item);
    }

    private void removeFile(Uri item) {
        try {
            getContext().getContentResolver().delete(item, null, null);
        } catch (Exception ignored) {
        }
    }
}

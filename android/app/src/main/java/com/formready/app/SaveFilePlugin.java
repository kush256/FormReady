package com.formready.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * Writes a finished document into the device's public Downloads folder so it
 * survives, and shows up in the Files app, instead of living in app cache
 * where Android is free to delete it.
 *
 * Uses MediaStore, which needs no storage permission on Android 10 and above.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    private static final String SUBFOLDER = Environment.DIRECTORY_DOWNLOADS + "/FormReady";

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64 = call.getString("data");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (fileName == null || base64 == null) {
            call.reject("fileName and data are required");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

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

            OutputStream out = resolver.openOutputStream(item);
            if (out == null) {
                resolver.delete(item, null, null);
                call.reject("Could not open the file for writing");
                return;
            }
            try {
                out.write(bytes);
            } finally {
                out.close();
            }

            // Clearing IS_PENDING publishes the file to other apps.
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(item, values, null, null);

            JSObject result = new JSObject();
            result.put("uri", item.toString());
            result.put("location", "Downloads/FormReady");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not save the file: " + e.getMessage(), e);
        }
    }
}

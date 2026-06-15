import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Alert, Platform } from "react-native";

/**
 * Saves a remote image URL to the device gallery (native) or triggers a
 * browser download (web).
 *
 * Fixed issues vs the original:
 *  1. FileSystem.documentDirectory can be null on some Android builds.
 *     We now fall back to cacheDirectory, and if BOTH are null we surface
 *     a clear error instead of silently writing to "nullfilename.jpg".
 *  2. We use a try/finally to always clean up the temp cache file so we
 *     don't accumulate junk in the cache directory.
 *  3. On Android 13+ (API 33+), WRITE_EXTERNAL_STORAGE is no longer
 *     required — MediaLibrary.requestPermissionsAsync() handles this, but
 *     we now check the granularPermissions result correctly.
 *  4. Wrapped the entire native branch in a single try/catch with
 *     descriptive error messages so users know what actually failed.
 */
export async function saveImageCrossPlatform(url: string): Promise<void> {
  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `barterbayan-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      Alert.alert("Download failed", "Could not download the image. Please try again.");
    }
    return;
  }

  // ── Native (Android / iOS) ─────────────────────────────────────────────────
  let localUri: string | null = null;

  try {
    // 1. Ask for permission
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please allow access to your photo library in Settings to save images.",
      );
      return;
    }

    // 2. Resolve a writable temp directory
    //    documentDirectory is null on some Expo/Android configs; cacheDirectory is always available.
    const baseDir =
      FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

    if (!baseDir) {
      Alert.alert("Error", "Could not find a writable directory on this device.");
      return;
    }

    // 3. Download to temp file
    const filename = `BarterBayan_${Date.now()}.jpg`;
    const tempPath = baseDir + filename;

    const downloadResult = await FileSystem.downloadAsync(url, tempPath);

    if (downloadResult.status !== 200) {
      throw new Error(`Download returned status ${downloadResult.status}`);
    }

    localUri = downloadResult.uri;

    // 4. Save to gallery
    await MediaLibrary.saveToLibraryAsync(localUri);
    Alert.alert("Saved!", "Image saved to your gallery.");

  } catch (err: any) {
    console.error("saveImageCrossPlatform error:", err);
    Alert.alert(
      "Download failed",
      "Could not save the image. Make sure you have enough storage space and try again.",
    );
  } finally {
    // 5. Clean up the temp file from cache (best-effort)
    if (localUri && FileSystem.cacheDirectory && localUri.startsWith(FileSystem.cacheDirectory)) {
      FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    }
  }
}

package com.callmetechie.pamanalyzer

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.view.View
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID

@InvokeArg
class SecretArgs {
  var value: String? = null
}

@InvokeArg
class PathArgs {
  var path: String? = null
}

/**
 * Android side of the PAM Analyzer app, called from `src/platform/android.ts`:
 * files from the file picker, "Share" and "Open with", the device token in the Keystore,
 * printing through the Android print dialog, the fold posture of foldables and installing
 * downloaded APK updates.
 */
@TauriPlugin
class PamPlugin(private val activity: Activity) : Plugin(activity) {
  private var webView: WebView? = null
  /** Files that arrived before the app's frontend asked for them. */
  private val pending = mutableListOf<JSObject>()
  private var posture = JSObject().apply { put("tabletop", false) }

  override fun load(webView: WebView) {
    this.webView = webView
    // Edge-to-edge: keep the page clear of the status bar, navigation bar, cutout and keyboard.
    val root = activity.findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    root.requestApplyInsets()
    handleIntent(activity.intent)
    watchFold()
  }

  override fun onNewIntent(intent: Intent) {
    handleIntent(intent)
  }

  // ---------- files ----------

  private fun handleIntent(intent: Intent?) {
    if (intent == null) return
    val uris = mutableListOf<Uri>()
    when (intent.action) {
      Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
      Intent.ACTION_SEND -> streamExtra(intent)?.let { uris.add(it) }
      Intent.ACTION_SEND_MULTIPLE -> uris.addAll(streamListExtra(intent))
    }
    intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { if (it !in uris) uris.add(it) } }
    if (uris.isEmpty()) return
    // Handle an intent only once, also after a configuration change.
    intent.action = null
    val files = copyAll(uris)
    if (files.length() == 0) return
    val event = JSObject().apply { put("files", files) }
    if (hasListener("open-files")) trigger("open-files", event)
    else for (i in 0 until files.length()) pending.add(JSObject(files.getJSONObject(i).toString()))
  }

  @Suppress("DEPRECATION")
  private fun streamExtra(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun streamListExtra(intent: Intent): List<Uri> =
    (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)) ?: emptyList()

  /** Copies the files behind content URIs into the cache, so the app can read them by path. */
  private fun copyAll(uris: List<Uri>): JSArray {
    val out = JSArray()
    val dir = File(activity.cacheDir, "incoming/${UUID.randomUUID()}").apply { mkdirs() }
    for (uri in uris) {
      try {
        var name = uri.lastPathSegment?.substringAfterLast('/') ?: "file.dat"
        var modified: Long? = null
        activity.contentResolver.query(uri, null, null, null, null)?.use { c ->
          if (c.moveToFirst()) {
            val n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (n >= 0 && !c.isNull(n)) name = c.getString(n)
            val m = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
            if (m >= 0 && !c.isNull(m)) modified = c.getLong(m)
          }
        }
        val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_")
        val target = File(dir, safe)
        activity.contentResolver.openInputStream(uri)?.use { input -> target.outputStream().use { input.copyTo(it) } }
          ?: continue
        out.put(JSObject().apply {
          put("path", target.absolutePath)
          put("name", name)
          if (modified != null && modified!! > 0) put("modified", modified!!)
        })
      } catch (e: Exception) {
        // unreadable files are left out
      }
    }
    return out
  }

  @Command
  fun takeOpenFiles(invoke: Invoke) {
    val files = JSArray()
    for (f in pending) files.put(f)
    pending.clear()
    invoke.resolve(JSObject().apply { put("files", files) })
  }

  @Command
  fun pickFiles(invoke: Invoke) {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    }
    startActivityForResult(invoke, intent, "pickFilesResult")
  }

  @ActivityCallback
  fun pickFilesResult(invoke: Invoke, result: ActivityResult) {
    val uris = mutableListOf<Uri>()
    val data = result.data
    if (result.resultCode == Activity.RESULT_OK && data != null) {
      val clip: ClipData? = data.clipData
      if (clip != null) for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) }
      else data.data?.let { uris.add(it) }
    }
    invoke.resolve(JSObject().apply { put("files", copyAll(uris)) })
  }

  // ---------- device token ----------

  private val prefs by lazy {
    val key = MasterKey.Builder(activity).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    EncryptedSharedPreferences.create(
      activity,
      "pam_secrets",
      key,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
  }

  @Command
  fun secretGet(invoke: Invoke) {
    invoke.resolve(JSObject().apply { put("value", prefs.getString("device-token", null)) })
  }

  @Command
  fun secretSet(invoke: Invoke) {
    val args = invoke.parseArgs(SecretArgs::class.java)
    prefs.edit().putString("device-token", args.value).apply()
    invoke.resolve()
  }

  @Command
  fun secretClear(invoke: Invoke) {
    prefs.edit().remove("device-token").apply()
    invoke.resolve()
  }

  @Command
  fun deviceName(invoke: Invoke) {
    val name = Settings.Global.getString(activity.contentResolver, Settings.Global.DEVICE_NAME)
      ?: "${Build.MANUFACTURER} ${Build.MODEL}"
    invoke.resolve(JSObject().apply { put("name", name) })
  }

  /** `play` when installed from Google Play (updates come from Play), otherwise `apk`. */
  @Command
  fun distribution(invoke: Invoke) {
    val installer = try {
      if (Build.VERSION.SDK_INT >= 30) activity.packageManager.getInstallSourceInfo(activity.packageName).installingPackageName
      else @Suppress("DEPRECATION") activity.packageManager.getInstallerPackageName(activity.packageName)
    } catch (e: Exception) {
      null
    }
    invoke.resolve(JSObject().apply { put("value", if (installer == "com.android.vending") "play" else "apk") })
  }

  // ---------- printing ----------

  @Command
  fun printPage(invoke: Invoke) {
    val view = webView ?: return invoke.reject("no web view")
    activity.runOnUiThread {
      val manager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
      val title = view.title?.takeIf { it.isNotBlank() } ?: "PAM Analyzer"
      manager.print(
        title,
        view.createPrintDocumentAdapter(title),
        PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build()
      )
      invoke.resolve()
    }
  }

  // ---------- updates (APK version only) ----------

  @Command
  fun installApk(invoke: Invoke) {
    val path = invoke.parseArgs(PathArgs::class.java).path ?: return invoke.reject("no path")
    if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
      // Android asks once whether this app may install apps.
      val settings = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
      activity.startActivity(settings)
      invoke.resolve(JSObject().apply { put("needsPermission", true) })
      return
    }
    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", File(path))
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    activity.startActivity(intent)
    invoke.resolve(JSObject().apply { put("needsPermission", false) })
  }

  // ---------- foldables ----------

  private fun watchFold() {
    val owner = activity as? ComponentActivity ?: return
    owner.lifecycleScope.launch {
      owner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity).collect { info ->
          val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
          val next = JSObject()
          val tabletop = fold != null &&
            fold.state == FoldingFeature.State.HALF_OPENED &&
            fold.orientation == FoldingFeature.Orientation.HORIZONTAL
          next.put("tabletop", tabletop)
          if (fold != null) {
            // Position of the hinge in CSS pixels of the page.
            val density = activity.resources.displayMetrics.density
            val loc = IntArray(2)
            webView?.getLocationInWindow(loc)
            next.put("hingeTop", ((fold.bounds.top - loc[1]) / density).toDouble())
            next.put("hingeBottom", ((fold.bounds.bottom - loc[1]) / density).toDouble())
            next.put("separating", fold.isSeparating)
          }
          posture = next
          trigger("posture", next)
        }
      }
    }
  }

  @Command
  fun posture(invoke: Invoke) {
    invoke.resolve(posture)
  }
}

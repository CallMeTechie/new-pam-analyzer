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
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallClient
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
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
class IdsArgs {
  var ids: Array<String> = arrayOf()
}

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

  // ---------- updates of the Google Play version ----------

  /**
   * Asks Google Play whether a newer version is available for this user (on the track the user takes
   * part in: internal test, closed test or production). Resolves `{ available, versionCode }`.
   */
  @Command
  fun playUpdateCheck(invoke: Invoke) {
    AppUpdateManagerFactory.create(activity).appUpdateInfo
      .addOnSuccessListener { info ->
        val available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
          info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
        invoke.resolve(JSObject().apply {
          put("available", available)
          put("versionCode", info.availableVersionCode())
        })
      }
      .addOnFailureListener { e -> invoke.reject(e.message ?: "play_unavailable", "play_unavailable") }
  }

  /** Starts the update through Google Play (full-screen); the app restarts once it is installed. */
  @Command
  fun playUpdateStart(invoke: Invoke) {
    val manager = AppUpdateManagerFactory.create(activity)
    manager.appUpdateInfo
      .addOnSuccessListener { info ->
        if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE &&
          info.updateAvailability() != UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
        ) {
          return@addOnSuccessListener invoke.reject("no update", "no_update")
        }
        try {
          @Suppress("DEPRECATION")
          manager.startUpdateFlowForResult(info, activity, AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE), PLAY_UPDATE_REQUEST)
          invoke.resolve()
        } catch (e: Exception) {
          invoke.reject(e.message ?: "play_update_failed", "play_update_failed")
        }
      }
      .addOnFailureListener { e -> invoke.reject(e.message ?: "play_unavailable", "play_unavailable") }
  }

  // ---------- QR code ----------

  /**
   * Scans a QR code (the API key shown on the web) with the scanner of Google Play services. It shows
   * its own camera screen and needs no camera permission. Resolves `{ content }`, or `{ content: null }`
   * when the user cancels.
   */
  @Command
  fun scanQr(invoke: Invoke) {
    val options = GmsBarcodeScannerOptions.Builder()
      .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
      .build()
    activity.runOnUiThread {
      try {
        val scanner = GmsBarcodeScanning.getClient(activity, options)
        // The scanner is a module of Google Play services, downloaded on first use: request it
        // and wait for the download instead of failing with "unavailable".
        val modules = ModuleInstall.getClient(activity)
        modules.areModulesAvailable(scanner)
          .addOnSuccessListener { available ->
            if (available.areModulesAvailable()) {
              startScan(scanner, invoke)
            } else {
              installScanner(modules, scanner, invoke)
            }
          }
          // The module check itself failed (old Play services): try the scanner directly.
          .addOnFailureListener { startScan(scanner, invoke) }
      } catch (e: Exception) {
        rejectScan(invoke, e)
      }
    }
  }

  private fun installScanner(modules: ModuleInstallClient, scanner: GmsBarcodeScanner, invoke: Invoke) {
    val listener = object : InstallStatusListener {
      override fun onInstallStatusUpdated(update: ModuleInstallStatusUpdate) {
        when (update.installState) {
          ModuleInstallStatusUpdate.InstallState.STATE_COMPLETED -> {
            modules.unregisterListener(this)
            activity.runOnUiThread { startScan(scanner, invoke) }
          }
          ModuleInstallStatusUpdate.InstallState.STATE_FAILED,
          ModuleInstallStatusUpdate.InstallState.STATE_CANCELED -> {
            modules.unregisterListener(this)
            invoke.reject("Scanner module could not be installed (state ${update.installState}, error ${update.errorCode}).", "scanner_install_failed")
          }
          else -> {}
        }
      }
    }
    val request = ModuleInstallRequest.newBuilder().addApi(scanner).setListener(listener).build()
    modules.installModules(request)
      .addOnSuccessListener { response ->
        if (response.areModulesAlreadyInstalled()) {
          modules.unregisterListener(listener)
          startScan(scanner, invoke)
        }
      }
      .addOnFailureListener { e ->
        modules.unregisterListener(listener)
        rejectScan(invoke, e)
      }
  }

  private fun startScan(scanner: GmsBarcodeScanner, invoke: Invoke) {
    scanner.startScan()
      .addOnSuccessListener { code -> invoke.resolve(JSObject().apply { put("content", code.rawValue) }) }
      .addOnCanceledListener { invoke.resolve(JSObject().apply { put("content", null as String?) }) }
      .addOnFailureListener { e -> rejectScan(invoke, e) }
  }

  private fun rejectScan(invoke: Invoke, e: Exception) {
    val code = if (e is MlKitException && e.errorCode == MlKitException.UNAVAILABLE) "scanner_unavailable" else "scanner_failed"
    // The first frames show where it failed (the Play version is obfuscated; mapping.txt is in the release).
    val frames = e.stackTrace.take(4).joinToString(" < ") { "${it.className}.${it.methodName}:${it.lineNumber}" }
    invoke.reject("${e.javaClass.simpleName}: ${e.message ?: code} @ $frames", code)
  }

  // ---------- crash reports ----------

  @Command
  fun crashReports(invoke: Invoke) {
    val list = JSArray()
    for (r in CrashLog.list(activity)) list.put(r)
    invoke.resolve(JSObject().apply { put("reports", list) })
  }

  @Command
  fun crashReportsDelete(invoke: Invoke) {
    val args = invoke.parseArgs(IdsArgs::class.java)
    CrashLog.delete(activity, args.ids.toList())
    invoke.resolve()
  }

  @Command
  fun posture(invoke: Invoke) {
    invoke.resolve(posture)
  }

  private companion object {
    const val PLAY_UPDATE_REQUEST = 4711
  }
}

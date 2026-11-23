package com.callmetechie.pamanalyzer

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.util.UUID

/**
 * Crash reports: an uncaught Java/Kotlin exception is written as JSON to `files/crashes/<id>.json`
 * before Android ends the app. The app sends the files to the server once it is connected
 * (`PamPlugin.crashReports`) and deletes them when the server accepted them.
 */
object CrashLog {
  @Volatile private var installed = false

  fun dir(context: Context): File = File(context.filesDir, "crashes")

  fun install(context: Context) {
    if (installed) return
    installed = true
    val app = context.applicationContext
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        write(app, thread, error)
      } catch (_: Throwable) {
        // Never get in the way of the crash itself.
      }
      previous?.uncaughtException(thread, error)
    }
  }

  private fun write(context: Context, thread: Thread, error: Throwable) {
    val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
    val version = try {
      context.packageManager.getPackageInfo(context.packageName, 0).versionName
    } catch (_: Exception) {
      null
    }
    val id = "android-" + UUID.randomUUID().toString()
    val json = JSONObject()
      .put("id", id)
      .put("kind", "android")
      .put("occurredAt", System.currentTimeMillis())
      .put("appVersion", version ?: "")
      .put("system", "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
      .put("message", (error.toString()).take(1000))
      .put("report", "Thread: ${thread.name}\n\n$trace".take(190_000))
    val dir = dir(context).apply { mkdirs() }
    File(dir, "$id.json").writeText(json.toString())
  }

  /** Stored reports, oldest first. */
  fun list(context: Context): List<JSONObject> =
    (dir(context).listFiles { f -> f.name.endsWith(".json") } ?: emptyArray())
      .mapNotNull { f -> try { JSONObject(f.readText()) } catch (_: Exception) { null } }
      .sortedBy { it.optLong("occurredAt") }

  fun delete(context: Context, ids: List<String>) {
    for (id in ids) {
      if (id.all { it.isLetterOrDigit() || it == '-' }) File(dir(context), "$id.json").delete()
    }
  }
}

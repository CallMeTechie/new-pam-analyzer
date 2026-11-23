package com.callmetechie.pamanalyzer

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // First, so that crashes during the start are recorded as well.
    CrashLog.install(this)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}

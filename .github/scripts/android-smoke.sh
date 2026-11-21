#!/bin/bash
# Installs the debug APK in the emulator, starts it and waits for the frontend's ready marker.
set -u
APK="$1"
PKG=com.pamanalyzer.client
adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/com.callmetechie.pamanalyzer.MainActivity"
for i in $(seq 1 60); do
  if adb logcat -d | grep -q "PAM Analyzer ready: android"; then
    adb logcat -d | grep -E "PAM Analyzer ready|AndroidRuntime" | head -20
    if adb shell run-as "$PKG" ls -la databases files 2>/dev/null; then :; fi
    if adb logcat -d | grep -q "FATAL EXCEPTION"; then echo "crash"; exit 1; fi
    echo "App started."
    exit 0
  fi
  sleep 2
done
echo "The app did not report ready within 2 minutes."
adb logcat -d | grep -iE "chromium|tauri|pam|AndroidRuntime|FATAL" | tail -80
exit 1

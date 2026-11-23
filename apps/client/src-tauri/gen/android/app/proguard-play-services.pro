# QR code scanner (ML Kit code scanner) and module install of Google Play services, in-app updates
# of Google Play: these look up classes through reflection. R8 (full mode) removed constructors of
# them, and the scanner failed with a NullPointerException (Object.getClass() on null).
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_code_scanner.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_common.** { *; }
-keep class com.google.android.gms.common.moduleinstall.** { *; }
-keep class com.google.android.play.core.** { *; }
-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod

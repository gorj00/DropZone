-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-keep public class * extends java.lang.Exception

-keep class com.dropzone.app.** { *; }

-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class org.apache.cordova.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class io.capawesome.capacitorjs.plugins.** { *; }
-keep class app.capgo.plugin.** { *; }
-keep class ee.forgr.capacitor.** { *; }
-keep class com.revenuecat.purchases.capacitor.** { *; }

-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }

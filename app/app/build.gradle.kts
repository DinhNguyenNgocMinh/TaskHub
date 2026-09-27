import java.util.Properties

plugins {
    id("com.android.application")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}
val supabaseUrl = localProperties.getProperty("SUPABASE_URL", "")
val supabasePublishableKey = localProperties.getProperty(
    "SUPABASE_PUBLISHABLE_KEY",
    localProperties.getProperty("SUPABASE_ANON_KEY", ""),
)

android {
    namespace = "com.taskhub.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.taskhub.app"
        minSdk = 24
        targetSdk = 37
        versionCode = 2
        versionName = "1.0.1"
        buildConfigField("String", "SUPABASE_URL", "\"${supabaseUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"${supabasePublishableKey.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
    }

    buildTypes {
        release {
            // Personal offline distribution: creates an installable release APK.
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        buildConfig = true
    }

    // Web and Android deliberately use one source of truth for UI/commands.
    // chat-config.js remains Android-only because it reads BuildConfig at runtime.
    sourceSets {
        getByName("main") {
            assets.srcDir("src/main/bridge-assets")
            assets.srcDir("../../web/public")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Serves packaged assets from an internal HTTPS-like origin in WebView.
    implementation("androidx.webkit:webkit:1.12.1")
}

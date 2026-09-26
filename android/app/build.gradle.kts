import java.net.URI
import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

val siteUrl: String = providers.gradleProperty("ugtaa.siteUrl").get()
val googleWebClientId: String = providers.gradleProperty("ugtaa.googleWebClientId").get()
val siteHost: String = URI(siteUrl).host

/* Release гарын үсэг: android/keystore.properties (git-д орохгүй). Жишээ: keystore.properties.example */
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "mn.ugtaa.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "mn.ugtaa.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
        manifestPlaceholders["siteHost"] = siteHost
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

/* Сайтын «Android апп татах» товчны файлыг шинэчилнэ: ./gradlew publishApk → ../download/ugtaa.apk
   Дараа нь сайтаа commit + deploy хийнэ. Хувилбар бүрт defaultConfig-ийн versionCode-г нэмэхээ бүү март. */
tasks.register<Copy>("publishApk") {
    group = "distribution"
    description = "Гарын үсэгтэй release APK-г сайтын download/ugtaa.apk руу хуулна"
    dependsOn("assembleRelease")
    from(layout.buildDirectory.file("outputs/apk/release/app-release.apk"))
    into(rootProject.file("../download"))
    rename { "ugtaa.apk" }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
    implementation(libs.googleid)

    testImplementation(libs.junit)
    testImplementation(libs.json)
}
